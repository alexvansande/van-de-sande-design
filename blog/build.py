#!/usr/bin/env python3
"""Build the blog from the folders next to this file.

    python3 blog/build.py                          # into blog/_site, served at /
    python3 blog/build.py --out site/blog --base /blog/   # under a path instead
    python3 blog/build.py --serve 8766             # build, then serve it

Every folder here with an index.md is a post, and its name is its address
(an index.draft.md, the editor's, is left out unless --drafts is given):
blog/<slug>/index.md is published at /<slug>, as it was on Paragraph. The
page is written as <slug>.html, which GitHub Pages (and most hosts) serve at
/<slug> with no extension and no trailing slash, so the address is the same
one. Its pictures go to /media/<slug>/.

Besides the posts: the index, /category/<name> for each category, /rss.xml,
/sitemap.xml, /llms.txt and /<slug>.md, the post's Markdown, as Paragraph
had them.

Only the standard library is needed. With Pillow installed, pictures are
resized into WebP at the widths the page can show them at; without it they
are copied as they are, which works but is heavy.
"""
import argparse, hashlib, html, http.server, json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone
from email.utils import format_datetime

try:
    from PIL import Image
except ImportError:          # pictures are copied instead of resized
    Image = None

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_URL = "https://blog.vandesande.design"
TITLE = "Alex Van de Sande's wandering about"
AUTHOR = "Alex Van de Sande"
HOME = "https://vandesande.design"
COLUMN = 704                  # the text column, in CSS pixels: what Paragraph had
WIDTHS = (480, 704, 1056, 1408, 2112)
VIDEOS = (".mp4", ".webm")    # copied as they are, beside the pictures
QUICK = False                 # --quick: pictures copied, not resized, for the editor's preview


# ---------------------------------------------------------------- front matter

def read_post(folder, name="index.md"):
    text = open(os.path.join(folder, name), encoding="utf-8").read()
    meta, body = {}, text
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            v = v.strip()
            try:
                meta[k.strip()] = json.loads(v)
            except ValueError:
                meta[k.strip()] = v.strip("'\"")
        body = text[m.end():]
    meta["slug"] = os.path.basename(folder)
    meta["folder"] = folder
    meta["source"] = text
    meta["body_md"] = body
    meta.setdefault("title", meta["slug"])
    meta["date_dt"] = parse_date(meta.get("date"))
    return meta


def parse_date(s):
    if not s:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def tid(dt):
    """A moment as an AT Protocol record key (a TID): a post's document on
    Bluesky is keyed by the post's date, so its address is known here."""
    n = int(dt.timestamp() * 1_000_000) << 10
    return "".join("234567abcdefghijklmnopqrstuvwxyz"[(n >> (5 * i)) & 31] for i in reversed(range(13)))


def publication():
    """The blog's record on the AT Protocol (crosspost.py setup), or None."""
    path = os.path.join(HERE, "_well-known", "site.standard.publication")
    return open(path).read().strip() if os.path.isfile(path) else None


# ---------------------------------------------------------------- TeX, the little there is

TEX_OPS = {"+": "+", "-": "\u2212", "=": "=", "/": "/", "(": "(", ")": ")", ",": ",",
           "<": "&lt;", ">": "&gt;", "\\cdot": "\u22c5", "\\times": "\u00d7", "\\pm": "\u00b1",
           "\\approx": "\u2248", "\\sim": "\u223c", "\\le": "\u2264", "\\ge": "\u2265"}
TEX_SYMBOLS = {"\\pi": "\u03c0", "\\tau": "\u03c4", "\\alpha": "\u03b1", "\\beta": "\u03b2",
               "\\gamma": "\u03b3", "\\lambda": "\u03bb", "\\mu": "\u03bc", "\\rho": "\u03c1",
               "\\Omega": "\u03a9", "\\infty": "\u221e", "\\hbar": "\u210f"}


def tex_to_mathml(tex):
    """Enough TeX for what the posts use — fractions, powers, indices — as
    MathML, which every current browser sets without a script."""
    toks = re.findall(r"\\[A-Za-z]+|\d+(?:\.\d+)?|[A-Za-z]|\S", tex)
    pos = 0

    def group():
        nonlocal pos
        if pos < len(toks) and toks[pos] == "{":
            pos += 1
            out = seq("}")
            pos += 1
            return "<mrow>" + out + "</mrow>"
        return atom()

    def atom():
        nonlocal pos
        if pos >= len(toks):     # x^ or \frac{a}: nothing left to be the rest
            return "<mrow></mrow>"
        t = toks[pos]
        pos += 1
        if t == "\\frac":
            a = group()
            return f"<mfrac>{a}{group()}</mfrac>"
        if t == "\\sqrt":
            return f"<msqrt>{group()}</msqrt>"
        if t in TEX_OPS:
            return f"<mo>{TEX_OPS[t]}</mo>"
        if t in TEX_SYMBOLS:
            return f"<mi>{TEX_SYMBOLS[t]}</mi>"
        if t.startswith("\\"):
            print(f"  warning: TeX {t} is not known here, set as text", file=sys.stderr)
            return f"<mtext>{html.escape(t)}</mtext>"
        if re.fullmatch(r"[\d.]+|[\u00b2\u00b3\u00b9\u2070-\u2079]", t):
            return f"<mn>{t}</mn>"
        return f"<mi>{html.escape(t)}</mi>"

    def seq(end=None):
        nonlocal pos
        out = []
        while pos < len(toks) and toks[pos] != end:
            if toks[pos] in "^_" and out:
                base = out.pop()
                sub = sup = None
                while pos < len(toks) and toks[pos] in "^_":
                    op = toks[pos]
                    pos += 1
                    if op == "^":
                        sup = group()
                    else:
                        sub = group()
                if sub and sup:
                    out.append(f"<msubsup>{base}{sub}{sup}</msubsup>")
                elif sup:
                    out.append(f"<msup>{base}{sup}</msup>")
                else:
                    out.append(f"<msub>{base}{sub}</msub>")
            else:
                out.append(group())
        return "".join(out)

    body = seq()
    return f'<math alttext="{html.escape(tex)}"><mrow>{body}</mrow></math>'


# ---------------------------------------------------------------- Markdown, inline

class Inline:
    def __init__(self, ctx):
        self.ctx = ctx

    def __call__(self, text):
        keep = []

        def hold(s):
            keep.append(s)
            return f"\x00{len(keep) - 1}\x00"

        text = re.sub(r"\$\$(.+?)\$\$", lambda m: hold(tex_to_mathml(m.group(1))), text)
        text = re.sub(r"\\([\\`*_\[\]{}()#+\-.!<>|~$])", lambda m: hold(html.escape(m.group(1))), text)
        text = re.sub(r"(`+)(.+?)\1", lambda m: hold("<code>" + html.escape(m.group(2).strip()) + "</code>"), text)
        text = re.sub(r"<(https?://[^>\s]+)>", lambda m: hold(self.a(m.group(1)) + html.escape(m.group(1)) + "</a>"), text)
        text = re.sub(r"</?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?/?>|<!--.*?-->", lambda m: hold(self.ctx.fix_html(m.group(0))), text)
        text = html.escape(text, quote=False)
        text = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)',
                      lambda m: hold(self.ctx.img(html.unescape(m.group(2)), html.unescape(m.group(1)))), text)
        # a link's address may hold one level of brackets: …/Earth_(map)_(Civ6)
        text = re.sub(r'\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"([^"]*)")?\)',
                      lambda m: hold(self.a(html.unescape(m.group(2)), m.group(3) and html.unescape(m.group(3))))
                      + m.group(1) + hold("</a>"), text)
        for pat, tag in ((r"\*\*(?=\S)(.+?)(?<=\S)\*\*", "strong"), (r"__(?=\S)(.+?)(?<=\S)__", "strong"),
                         (r"\*(?=\S)(.+?)(?<=\S)\*", "em"), (r"(?<![\w])_(?=\S)(.+?)(?<=\S)_(?![\w])", "em")):
            text = re.sub(pat, lambda m: f"<{tag}>{m.group(1)}</{tag}>", text, flags=re.S)
        text = re.sub(r"(?: {2,}|\\)\n", "<br>\n", text)
        while "\x00" in text:
            text = re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], text)
        return text

    def a(self, href, title=None):
        href = self.ctx.href(href)
        attrs = f' href="{html.escape(href)}"'
        if title:
            attrs += f' title="{html.escape(title)}"'
        if re.match(r"https?://", href):
            attrs += ' target="_blank" rel="noopener"'
        return f"<a{attrs}>"


# ---------------------------------------------------------------- Markdown, blocks

HTML_BLOCK = re.compile(r"<(?:/?(?:figure|p|div|iframe|table|section|details|video|blockquote|ul|ol|h[1-6]|hr|pre|math)\b|!--)", re.I)
LIST_ITEM = re.compile(r"( {0,3})([-*+]|\d+[.)])( +)")
# a picture on a line of its own: ![alt](file "caption"); the file may be a video
PICTURE = re.compile(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)')


def render_blocks(md, ctx):
    lines = md.replace("\t", "    ").split("\n")
    out, i = [], 0
    inline = Inline(ctx)

    def starts_block(l):
        return (re.match(r" {0,3}(#{1,6}\s|>|```|(-{3,}|\*{3,}|_{3,})\s*$)", l) or HTML_BLOCK.match(l.lstrip())
                or LIST_ITEM.match(l))

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        s = line.strip()
        if s.startswith("```"):
            lang = s[3:].strip()
            j = i + 1
            while j < len(lines) and not lines[j].strip().startswith("```"):
                j += 1
            code = html.escape("\n".join(lines[i + 1:j]))
            cls = f' class="language-{html.escape(lang)}"' if lang else ""
            out.append(f"<pre><code{cls}>{code}</code></pre>")
            i = j + 1
            continue
        if HTML_BLOCK.match(s):
            j = i
            while j < len(lines) and lines[j].strip():
                j += 1
            out.append(ctx.fix_html("\n".join(lines[i:j])))
            i = j
            continue
        m = re.match(r" {0,3}(#{1,6})(?:\s+(.*?))?\s*$", line)
        if m:
            n, text = len(m.group(1)), m.group(2) or ""
            given = re.search(r"(?:^|\s)\{#([\w:.-]+)\}$", text)      # ### Heading {#its-id}
            if given:
                text = text[:given.start()].rstrip()
            text = re.sub(r"\s+#+$", "", text)
            hid = given.group(1) if given else ctx.heading_id(text)
            out.append(f'<h{n} id="{hid}">{inline(text)}</h{n}>')
            i += 1
            continue
        if re.match(r" {0,3}(-{3,}|\*{3,}|_{3,})\s*$", line):
            out.append("<hr>")
            i += 1
            continue
        if re.match(r" {0,3}>", line):
            j = i
            quoted = []
            while j < len(lines) and re.match(r" {0,3}>", lines[j]):
                quoted.append(re.sub(r" {0,3}> ?", "", lines[j], count=1))
                j += 1
            out.append("<blockquote>\n" + render_blocks("\n".join(quoted), ctx) + "\n</blockquote>")
            i = j
            continue
        m = LIST_ITEM.match(line)
        if m:
            ordered = m.group(2)[0].isdigit()
            items, j = [], i
            while j < len(lines):
                m2 = LIST_ITEM.match(lines[j])
                if not m2 or m2.group(2)[0].isdigit() != ordered:
                    break
                width = len(m2.group(0))
                body = [lines[j][width:]]
                j += 1
                while j < len(lines):
                    l = lines[j]
                    if l.strip() and (l.startswith(" " * width) or not (starts_block(l) or not body[-1].strip())):
                        body.append(l[width:] if l.startswith(" " * width) else l.strip())
                        j += 1
                    elif not l.strip() and j + 1 < len(lines) and lines[j + 1].startswith(" " * width) and lines[j + 1].strip():
                        body.append("")
                        j += 1
                    else:
                        break
                items.append("<li>" + render_blocks("\n".join(body), ctx) + "</li>")
                if j < len(lines) and not lines[j].strip() and j + 1 < len(lines) and LIST_ITEM.match(lines[j + 1]):
                    j += 1
            tag = "ol" if ordered else "ul"
            start = int(re.match(r"\s*(\d+)", line).group(1)) if ordered else 1
            attr = f' start="{start}"' if ordered and start != 1 else ""
            out.append(f"<{tag}{attr}>\n" + "\n".join(items) + f"\n</{tag}>")
            i = j
            continue
        j = i + 1
        while j < len(lines) and lines[j].strip() and not starts_block(lines[j]):
            j += 1
        para = "\n".join(l.strip() for l in lines[i:j])
        shots = [PICTURE.fullmatch(l) for l in para.split("\n")]
        if len(shots) > 1 and all(shots):
            # pictures on lines of their own, one after another with no blank
            # line between them, are a carousel: one at a time, side to side
            slides = "\n".join(f'<div class="slide">{ctx.media(m.group(2), m.group(1))}'
                                + (f"<figcaption>{inline(m.group(3))}</figcaption>" if m.group(3) else "")
                                + "</div>" for m in shots)
            out.append(f'<figure class="carousel">\n<div class="slides" tabindex="0">\n{slides}\n</div>\n'
                       f'<div class="steer"><button type="button" class="prev" aria-label="Previous" disabled>\u2039</button>'
                       f'<span class="count">1 / {len(shots)}</span>'
                       f'<button type="button" class="next" aria-label="Next">\u203a</button></div>\n</figure>')
        elif shots[0]:     # a picture on its own is a figure, its title the caption
            lone = shots[0]
            cap = f"\n<figcaption>{inline(lone.group(3))}</figcaption>" if lone.group(3) else ""
            out.append(f"<figure>\n{ctx.media(lone.group(2), lone.group(1))}{cap}\n</figure>")
        else:
            out.append(f"<p>{inline(para)}</p>")
        i = j
    return "\n".join(out)


# ---------------------------------------------------------------- pictures

class Pictures:
    def __init__(self, out, base):
        self.out, self.base = out, base
        self.made = {}

    def variants(self, src, slug, name):
        """The picture as the page will ask for it: [(url, width)], widest last."""
        key = (slug, name)
        if key in self.made:
            return self.made[key]
        dest = os.path.join(self.out, "media", slug)
        os.makedirs(dest, exist_ok=True)
        stem, ext = os.path.splitext(name)
        url = f"{self.base}media/{slug}/"
        result = []
        if Image is None or QUICK or ext.lower() in (".gif", ".svg", ".webp") + VIDEOS:
            target = os.path.join(dest, name)
            if not fresh(target, src):
                if QUICK:               # the same file, not a copy of it
                    try:
                        if os.path.exists(target):
                            os.remove(target)
                        os.link(src, target)
                    except OSError:
                        shutil.copyfile(src, target)
                else:
                    shutil.copyfile(src, target)
            w = size_of(src)[0] if Image and ext.lower() not in VIDEOS else 0
            result = [(url + name, w)]
        else:
            with Image.open(src) as im:
                w, h = im.size
                widths = [x for x in WIDTHS if x < w] + [w] if w <= WIDTHS[-1] else list(WIDTHS)
                for x in widths:
                    fname = f"{stem}-{x}.webp"
                    target = os.path.join(dest, fname)
                    if not fresh(target, src):
                        im2 = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                        if x != w:
                            im2 = im2.resize((x, round(h * x / w)), Image.LANCZOS)
                        im2.save(target, "WEBP", quality=86, method=6)
                    result.append((url + fname, x))
        self.made[key] = result
        return result


def fresh(target, src):
    # On the deploy, the pictures made last time come back from a cache that
    # is only used when no picture has changed at all (the workflow keys it on
    # every picture's content), so there being one is enough: a fresh
    # checkout gives every source a new time, and would make them all again.
    if os.environ.get("BLOG_MEDIA_CACHED") == "true":
        return os.path.exists(target)
    return os.path.exists(target) and os.path.getmtime(target) >= os.path.getmtime(src)


def size_of(path):
    with Image.open(path) as im:
        return im.size


# ---------------------------------------------------------------- one post's context

class Ctx:
    def __init__(self, post, pics, base):
        self.post, self.pics, self.base = post, pics, base
        self.ids = set()

    def href(self, href):
        # links between the posts stay on whichever host this is built for
        for prefix in (SITE_URL + "/", "http://" + SITE_URL.split("://")[1] + "/"):
            if href.startswith(prefix):
                return self.base + href[len(prefix):]
        if href.rstrip("/") == SITE_URL:
            return self.base
        # and a link to where one of the posts first appeared is to it, here
        slug = MOVED.get(link_key(href))
        if slug:
            frag = href.split("#", 1)[1] if "#" in href else ""
            return self.base + slug + ("#" + frag if frag else "")
        # a site that is gone: its copy in the archive, from about when this was written
        if gone(href):
            return archived(href, self.post.get("date_dt"))
        return href

    def heading_id(self, text):
        base = "h-" + re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>|[*_`\\]", "", text).lower()).strip("-")
        hid, n = base, 1
        while hid in self.ids:
            n += 1
            hid = f"{base}-{n}"
        self.ids.add(hid)
        return hid

    def picture(self, src):
        path = os.path.join(self.post["folder"], src)
        if re.match(r"[a-z]+:|/", src) or not os.path.exists(path):
            if not re.match(r"[a-z]+:", src):
                print(f"  warning: {self.post['slug']}: no picture {src}", file=sys.stderr)
            return None
        return self.pics.variants(path, self.post["slug"], src)

    def img(self, src, alt="", width=None, height=None, extra="", share=1.0):
        v = self.picture(src)
        attrs = {}
        if v is None:
            attrs["src"] = src
        else:
            attrs["src"] = next((u for u, w in v if w >= COLUMN), v[-1][0])
            if len(v) > 1:
                attrs["srcset"] = ", ".join(f"{u} {w}w" for u, w in v)
                shown = min(int(width or v[-1][1]), COLUMN)
                attrs["sizes"] = f"(min-width: 50rem) {round(shown * share)}px, {'100vw' if share == 1 else '50vw'}"
            if not width and Image:
                width, height = size_of(os.path.join(self.post["folder"], src))
        if width:
            attrs["width"], attrs["height"] = width, height
        attrs["alt"] = alt
        attrs["loading"], attrs["decoding"] = "lazy", "async"
        return "<img " + " ".join(f'{k}="{html.escape(str(val))}"' for k, val in attrs.items()) + extra + ">"

    def media(self, src, alt=""):
        """A picture, or, if the file is a video, the video: playing on its
        own, silent and looping, like a moving picture. A .webm and an .mp4 of
        the same name are both offered, the .webm first. It is fetched and
        played only once it is on screen (blog.js)."""
        stem, ext = os.path.splitext(src)
        if ext.lower() not in VIDEOS:
            return self.img(src, alt)
        sources, size = [], ""
        for e in sorted(VIDEOS, key=lambda e: e != ".webm"):
            if e == ext.lower() or os.path.exists(os.path.join(self.post["folder"], stem + e)):
                v = self.picture(stem + e)
                sources.append(f'<source src="{html.escape(v[-1][0] if v else stem + e)}" type="video/{e[1:]}">')
        try:
            wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                 "-of", "csv=p=0", os.path.join(self.post["folder"], src)],
                                capture_output=True, text=True).stdout.split()[0].split(",")
            size = f' width="{wh[0]}" height="{wh[1]}"'
        except (OSError, IndexError):     # no ffprobe: the page just learns the size late
            pass
        label = f' aria-label="{html.escape(alt)}"' if alt else ""
        # blog.js plays it while it is on screen; without the script, the controls
        return f'<video{size}{label} class="moving" loop muted playsinline preload="none" controls>{"".join(sources)}</video>'

    def fix_html(self, block):
        """Raw HTML from the Markdown: pictures pointed at their resized copies,
        links between posts kept on this host."""
        share = 0.5 if re.search(r'<figure[^>]*width:\s*50%', block) else 1.0

        def one_img(m):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(0)))
            if "src" not in a:
                return m.group(0)
            return self.img(html.unescape(a["src"]), html.unescape(a.get("alt", "")), a.get("width"), a.get("height"), share=share)

        block = re.sub(r"<img\b[^>]*>", one_img, block)
        # a video's file goes with the pictures, as it is
        block = re.sub(r'(<(?:video|source)\b[^>]*?\b(?:src|poster)=")([^"]+)"',
                       lambda m: m.group(1) + html.escape((self.picture(html.unescape(m.group(2))) or [(m.group(2), 0)])[-1][0]) + '"', block)
        block = re.sub(r'href="([^"]*)"', lambda m: f'href="{html.escape(self.href(html.unescape(m.group(1))))}"'
                       + (' target="_blank" rel="noopener"' if re.match(r"https?://", self.href(html.unescape(m.group(1)))) else ""), block)
        return block


# ---------------------------------------------------------------- pages

def esc(s):
    return html.escape(s or "", quote=True)


def nice_date(d):
    return f"{d.day} {d.strftime('%B %Y')}"


def asset_v(name):
    """A stamp for the address of a file in _assets, from what is in it: a
    browser may keep a file for ten minutes (GitHub Pages), and a page must
    not be run by the script of the version before it."""
    with open(os.path.join(HERE, "_assets", name), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def plain(html_text, n=None):
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<math.*?</math>|<figure.*?</figure>|<[^>]+>", " ", html_text, flags=re.S))).strip()
    # the space a tag left before the full stop after it, as after a link
    t = re.sub(r" ([.,;:!?)])", r"\1", t)
    if n and len(t) > n:
        t = t[:n].rsplit(" ", 1)[0] + "…"
    return t


def named(base, tab=True):
    """The blog's name, in two links: his name goes to the rest of the site,
    the wandering about to the blog's own index."""
    t = "" if tab else ' tabindex="-1"'
    return (f'<a class="home" href="{esc(HOME)}"{t}>{esc(AUTHOR)}</a>&rsquo;s '
            f'<a class="blog" href="{base}"{t}>wandering about</a>')


# Going from a card to its post, or back, the title grows (or shrinks) from
# one size to the other. The page it comes from notes which post it is and
# how large its title was (blog.js), and the page it goes to, as it is
# revealed, works out by how much (--title-k, in blog.css). That post's
# paper, picture and words are also drawn over the other cards fading on
# the index, which would otherwise show through it. It is here, in the
# head, rather than in blog.js, because it has to be listening before the
# page is first drawn, and a long post is drawn before the end of it has
# been read.
TITLE_JS = """<script>addEventListener("pagereveal", e => {
  if (!e.viewTransition) return;
  let t = null;
  try { t = JSON.parse(sessionStorage.getItem("title-size") || "null"); sessionStorage.removeItem("title-size"); } catch (_) {}
  if (!t || !t.px || Date.now() - t.at > 10000) return;
  const root = document.documentElement, over = document.createElement("style");
  over.textContent = ["paper", "cover", "words", "title"].map(k => `::view-transition-group(${k}-${t.name})`).join() + "{z-index:1}";
  document.head.append(over);
  const el = document.querySelector(`[style*="view-transition-name:title-${t.name};"]`);
  const px = el && parseFloat(getComputedStyle(el).fontSize);
  if (px) root.style.setProperty("--title-k", (px / t.px).toFixed(4));
  e.viewTransition.finished.finally(() => { root.style.removeProperty("--title-k"); over.remove(); });
});</script>"""


def back_arrow(base, tab=True):
    """At the head of a post, before the blog's name: back to the index, to
    where this post's card is (blog.js takes it there; without the script it
    is the index's top)."""
    t = "" if tab else ' tabindex="-1"'
    return f'<a class="back" href="{base}" aria-label="Back to all the posts"{t}>&larr;</a>'


def page(base, title, body, *, description="", canonical="", image="", kind="website", extra_head="", cls="", head=True):
    og = [f'<meta property="og:title" content="{esc(title)}">',
          f'<meta property="og:type" content="{kind}">',
          f'<meta property="og:site_name" content="{esc(TITLE)}">']
    if description:
        og.append(f'<meta property="og:description" content="{esc(description)}">')
    if canonical:
        og.append(f'<meta property="og:url" content="{esc(canonical)}">')
    if image:
        og += [f'<meta property="og:image" content="{esc(image)}">', '<meta name="twitter:card" content="summary_large_image">']
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#333331">
<title>{esc(title)}</title>
{f'<meta name="description" content="{esc(description)}">' if description else ''}
{f'<link rel="canonical" href="{esc(canonical)}">' if canonical else ''}
{chr(10).join(og)}
<link rel="alternate" type="application/rss+xml" title="{esc(TITLE)}" href="{base}rss.xml">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23333331'/%3E%3Crect x='9' y='6' width='14' height='20' rx='1' fill='%23f4f1e4'/%3E%3C/svg%3E">
<link rel="stylesheet" href="{base}assets/blog.css?v={asset_v('blog.css')}">
{TITLE_JS}
{extra_head}
</head>
<body class="{cls}">
{f'<header class="top">{back_arrow(base) if cls == "post" else ""}<span class="name">{named(base)}</span></header>' if head else ""}{f'{chr(10)}<div class="bar" aria-hidden="true"><p>{back_arrow(base, tab=False)}<span class="name">{named(base, tab=False)}</span></p></div>' if cls == "post" else ""}
{body}
<footer class="foot">
  <a href="{base}rss.xml">RSS</a>
</footer>
</body>
</html>
"""


def vt(kind, slug):
    """A view-transition name: the same thing on the index, in a next card and
    in the post itself, so the browser can grow one into the other."""
    slug = slug.replace("/", "--")        # the archive's posts sit in folders
    return f'style="view-transition-name:{kind}-{slug};view-transition-class:{kind}"'


def thumb_of(p):
    """The picture on a post's card: its cover, or, with none, its first
    picture. (name, width, height), or Nones."""
    thumb, w, h = p.get("cover"), *(p.get("cover_size") or (None, None))
    if not thumb:
        m = re.search(r'<img src="([^":/]+)" width="(\d+)" height="(\d+)"', p["body_md"])
        if m:
            thumb, w, h = m.group(1), m.group(2), m.group(3)
    return thumb, w, h


def card(p, base, pics, eager=False, named=True):
    name = (lambda kind: vt(kind, p["slug"])) if named else (lambda kind: "")
    cover = ""
    # a post with no picture at its head shows its first picture on its card
    thumb, w, h = thumb_of(p)
    if thumb:
        ctx = Ctx(p, pics, base)
        img = ctx.img(thumb, "", w, h)
        img = img.replace('sizes="(min-width: 50rem) 704px, 100vw"', 'sizes="(min-width: 50rem) 440px, 100vw"')
        if eager:
            img = img.replace('loading="lazy"', 'loading="eager"')
        cover = f'<div class="thumb" {name("cover")}>{img}</div>'
    sub = f'<p class="sub">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""
    # its categories, to the right of the date: words, not links, since the
    # whole card is one
    tags = "".join(f'<span>{esc(c)}</span>' for c in (p.get("categories") or [])[:3])
    tags = f'<span class="tags">{tags}</span>' if tags else ""
    # as many of its first lines as fit, as on the site's poster: blog.js
    # cuts them at the last whole line
    lead = plain(p["html"], 700) if p.get("html") else ""
    lead = f'<p class="lines">{esc(lead)}</p>' if lead else ""
    return f"""<a class="card" href="{base}{p['slug']}" data-slug="{p['slug']}"><span class="paper" {name("paper")}></span>{cover}
  <div class="words" {name("words")}><h2 {name("title")}>{esc(p['title'])}</h2>{sub}{lead}<p class="when">{when(p)}{tags}</p></div>
</a>"""


def build(out, base, clean=False, drafts=False):
    if clean and os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    pics = Pictures(out, base)

    posts = []
    for name in sorted(os.listdir(HERE)):
        folder = os.path.join(HERE, name)
        if name.startswith((".", "_")):
            continue
        # a draft, from the editor, is index.draft.md: left out unless asked for
        draft = drafts and os.path.isfile(os.path.join(folder, "index.draft.md"))
        if draft or os.path.isfile(os.path.join(folder, "index.md")):
            posts.append(read_post(folder, "index.draft.md" if draft else "index.md"))
    posts.sort(key=lambda p: p["date_dt"], reverse=True)
    # a link to where a post first appeared goes to it here instead
    MOVED.clear()
    MOVED.update({link_key(u): slug for u, slug in MOVED_BY_HAND.items()})
    MOVED.update({link_key(p["original"]): p["slug"] for p in posts if p.get("original")})
    MOVED.update({link_key(p["via"]): p["slug"] for p in posts if p.get("via")})

    # the assets
    shutil.copytree(os.path.join(HERE, "_assets"), os.path.join(out, "assets"), dirs_exist_ok=True)
    # and the proof that the blog's records on Bluesky are its own
    pub = publication()
    if pub:
        shutil.copytree(os.path.join(HERE, "_well-known"), os.path.join(out, ".well-known"), dirs_exist_ok=True)

    # every post's text first, so the card of the next one has its first lines
    for p in posts:
        p["html"] = render_blocks(p["body_md"], Ctx(p, pics, base))
    for p in posts:
        ctx = Ctx(p, pics, base)
        p["description"] = p.get("subtitle") or plain(p["html"], 180)
        p["url"] = f"{SITE_URL}/{p['slug']}"
        cover_img, p["og_image"] = "", ""
        if p.get("cover"):
            w, h = p.get("cover_size") or (None, None)
            img = ctx.img(p["cover"], "", w, h).replace('loading="lazy"', 'loading="eager" fetchpriority="high"')
            cover_img = f'<div class="cover" {vt("cover", p["slug"])}>{img}</div>'
            v = ctx.picture(p["cover"])
            if v:
                p["og_image"] = SITE_URL + "/" + next((u for u, x in v if x >= 1056), v[-1][0])[len(base):]
        cats = "".join(f' · <a href="{base}category/{cat_slug(c)}">{esc(c)}</a>' for c in p.get("categories") or [])
        # where it first appeared, for the posts brought here from elsewhere
        if p.get("original"):
            # and what it went through on its way, as the drawings Posterous put on Flickr
            via = (f' via <a href="{esc(original_link(p, "via"))}">{esc(p.get("via_site") or p["via"].split("/")[2])}</a>'
                   if p.get("via") else "")
            cats += (f' · <span class="first">Originally published on <a href="{esc(original_link(p))}">'
                     f'{esc(p.get("original_site") or p["original"].split("/")[2])}</a>{via}</span>')
        sub = f'<p class="sub">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""
        # the next one along, older, and after the oldest the newest again
        nxt = posts[(posts.index(p) + 1) % len(posts)]
        prv = posts[posts.index(p) - 1]
        body = f"""<main>
<article class="sheet" data-slug="{p['slug']}" data-url="{base}{p['slug']}" data-title="{esc(p['title'])}" data-year="{p['date_dt'].year}" data-prev="{prv['slug']}" data-prev-title="{esc(prv['title'])}" data-next="{nxt['slug']}" data-next-title="{esc(nxt['title'])}">
<span class="paper" {vt("paper", p["slug"])}></span>
{cover_img}
<div class="text" {vt("words", p["slug"])}>
<h1 {vt("title", p["slug"])}>{esc(p['title'])}</h1>
{sub}
<p class="when"><time datetime="{p['date_dt'].date().isoformat()}">{nice_date(p['date_dt'])}</time>{cats}</p>
<div class="body">
{p['html']}
</div>
</div>
</article>
<section class="next"><p class="label">Next</p>
{card(nxt, base, pics, named=False)}
</section>
</main>"""
        ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"],
              "datePublished": p["date_dt"].isoformat(), "dateModified": parse_date(p.get("updated") or p.get("date")).isoformat(),
              "author": {"@type": "Person", "name": AUTHOR}, "url": p["url"]}
        if p["og_image"]:
            ld["image"] = p["og_image"]
        extra = f'<meta property="article:published_time" content="{p["date_dt"].isoformat()}">\n<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
        if pub:
            doc = f'at://{pub[5:].split("/")[0]}/site.standard.document/{tid(p["date_dt"])}'
            extra += f'\n<link rel="site.standard.publication" href="{pub}">\n<link rel="site.standard.document" href="{doc}">'
        write(out, p["slug"] + ".html", page(base, p["title"], body, description=p["description"], canonical=p["url"],
                                              image=p["og_image"], kind="article", cls="post",
                                              extra_head=extra + f'\n<script src="{base}assets/blog.js?v={asset_v("blog.js")}" defer></script>'))
        # the Markdown too, with its pictures at their full addresses
        md = re.sub(r'(src="|\]\()(?![a-z]+:|/)([^")\s]+)',
                    lambda m: m.group(1) + (SITE_URL + "/" + pics.variants(os.path.join(p["folder"], m.group(2)), p["slug"], m.group(2))[-1][0][len(base):]
                                            if os.path.exists(os.path.join(p["folder"], m.group(2))) else m.group(2)), p["source"])
        # and nothing in it to a site that is gone: the archive's copy instead
        md = re.sub(r'https?://[^\s)"\'<>\]]+', lambda m: archived(m.group(0), p.get("date_dt")) if gone(m.group(0)) else m.group(0), md)
        write(out, p["slug"] + ".md", md)
        print(f"  {p['slug']}")

    def listing(title, heading, items, canonical, path, head=True):
        cards = "\n".join(card(p, base, pics, eager=True) for p in items)
        body = f'<main class="index"><h1 style="view-transition-name:site-title">{heading}</h1>\n<div class="cards">\n{cards}\n</div></main>'
        if not head:
            body = front_page(heading, items)
        # the index itself (no header over it): pulled down, it goes back to the site
        front = {} if head else {"cls": "list front"}
        write(out, path, page(base, title, body, description=f"Posts by {AUTHOR}.", canonical=canonical,
                              **{"cls": "list", "head": head, "extra_head": f'<script src="{base}assets/blog.js?v={asset_v("blog.js")}" defer></script>', **front}))

    def front_page(heading, items):
        """The index itself: beside the posts, a line about them and the years
        they span, the years staying in view as the posts go by; each year goes
        to its first post. On a phone the line sits under the title and the
        years run along the top."""
        years, cards = [], []
        for p in items:
            y = p["date_dt"].year
            c = card(p, base, pics, eager=True).replace('<a class="card" ', f'<a class="card" data-year="{y}" ', 1)
            if y not in years:
                years.append(y)
                c = c.replace('<a class="card" ', f'<a class="card" id="y{y}" ', 1)
            cards.append(c)
        nav = "".join(f'<a href="#y{y}" data-year="{y}">{y}</a>' for y in years)
        return (f'<main class="index front-index"><h1 style="view-transition-name:site-title">{heading}</h1>\n'
                f'<div class="spread">\n<aside class="side">'
                f'<p class="about">I have been writing on the internet for over 25 years. '
                f'This is a collection of some of these weird ideas</p>'
                f'<nav class="years" aria-label="Years">{nav}</nav></aside>\n'
                f'<div class="cards">\n' + "\n".join(cards) + '\n</div>\n</div></main>')

    # The newest three, for the poster at the end of the site: what their
    # cards say, and their pictures' addresses relative to the blog, so the
    # site can find them wherever the blog is.
    latest = []
    for p in posts[:3]:
        item = {"slug": p["slug"], "title": p["title"], "subtitle": p.get("subtitle") or "",
                "date": re.sub(r"<[^>]+>", "", when(p)), "categories": (p.get("categories") or [])[:3],
                "lead": plain(p["html"], 240)}
        thumb, w, h = thumb_of(p)
        v = Ctx(p, pics, base).picture(thumb) if thumb else None
        if v:
            item["picture"] = [[u[len(base):] if u.startswith(base) else u, x] for u, x in v]
        latest.append(item)
    write(out, "latest.json", json.dumps(latest, ensure_ascii=False, indent=1))

    # the index is headed by the blog's name itself, so it has no header over it
    listing(TITLE, named(base), posts, SITE_URL + "/", "index.html", head=False)
    cats = sorted({c for p in posts for c in p.get("categories") or []})
    for c in cats:
        listing(f"{c} · {TITLE}", f'<span class="cat">{esc(c)}</span>', [p for p in posts if c in (p.get("categories") or [])],
                f"{SITE_URL}/category/{cat_slug(c)}", f"category/{cat_slug(c)}.html")
    write(out, "404.html", page(base, "Not here · " + TITLE,
                                f'<main class="index"><h1>Nothing is here.</h1><p class="lost"><a href="{base}">All the posts</a></p></main>', cls="list"))

    # the feed, with whole posts in it. A post brought from Paragraph keeps
    # the id Paragraph's feed gave it, so a reader that already had it does
    # not show it again as new.
    def guid(p):
        if p.get("paragraph_id"):
            return f'<guid isPermaLink="false">{esc(p["paragraph_id"])}</guid>'
        return f'<guid isPermaLink="true">{p["url"]}</guid>'
    now = format_datetime(datetime.now(timezone.utc))
    items = []
    for p in posts:
        content = re.sub(r'(src|href)="' + re.escape(base), lambda m: f'{m.group(1)}="{SITE_URL}/', p["html"])
        content = re.sub(r' (?:srcset|sizes|loading|decoding)="[^"]*"', "", content)
        items.append(f"""<item>
<title>{esc(p['title'])}</title>
<link>{p['url']}</link>
{guid(p)}
<pubDate>{format_datetime(p['date_dt'])}</pubDate>
<description>{esc(p['description'])}</description>
<content:encoded><![CDATA[{content.replace(']]>', ']]]]><![CDATA[>')}]]></content:encoded>
</item>""")
    write(out, "rss.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>{esc(TITLE)}</title>
<link>{SITE_URL}</link>
<description>{esc(TITLE)}</description>
<language>en</language>
<lastBuildDate>{now}</lastBuildDate>
<atom:link href="{SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
{chr(10).join(items)}
</channel>
</rss>
""")

    urls = [SITE_URL + "/"] + [f"{SITE_URL}/category/{cat_slug(c)}" for c in cats] + [p["url"] for p in posts]
    write(out, "sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls) + "\n</urlset>\n")
    write(out, "robots.txt", f"User-agent: *\nAllow: /\nDisallow: {base}archive/\nSitemap: {SITE_URL}/sitemap.xml\n")
    write(out, "llms.txt", f"# {TITLE}\n\n## Posts\n\n" + "\n".join(
        f"- [{p['title']}]({p['url']}.md)" + (f": {p['subtitle']}" if p.get("subtitle") else "") for p in posts)
        + f"\n\n## Blog Information\n\n- [Homepage]({SITE_URL}/): Main blog page\n- [RSS Feed]({SITE_URL}/rss.xml): Subscribe to updates\n")
    # Addresses Paragraph answered that the posts do not need, kept working:
    # its feed was at /feed and /rss, a few categories were folded into
    # Maps, and its sitemap was named in robots.txt as sitemap-index.xml.
    # Pages cannot redirect, so each is a page that goes on by itself.
    def onward(name, to, title, alternate=False):
        alt = f'\n<link rel="alternate" type="application/rss+xml" title="{esc(TITLE)}" href="{to}">' if alternate else ""
        write(out, name, f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>{esc(title)}</title>
<link rel="canonical" href="{to}">{alt}
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url={to}">
</head><body><p><a href="{to}">{esc(title)}</a></p></body></html>
""")
    for name in ("feed.html", "rss.html"):
        onward(name, f"{SITE_URL}/rss.xml", f"The feed of {TITLE}", alternate=True)
    onward("subscribe.html", f"{SITE_URL}/rss.xml", f"Follow {TITLE} by its feed", alternate=True)
    for c in ("hexagons", "map", "mapmaking"):
        onward(f"category/{c}.html", f"{SITE_URL}/category/maps", f"Maps · {TITLE}")
    write(out, "sitemap-index.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          f"  <sitemap><loc>{SITE_URL}/sitemap.xml</loc></sitemap>\n</sitemapindex>\n")
    print(f"{len(posts)} posts into {out}")
    build_archive(out, base, pics)


# ---------------------------------------------------------------- the archive

ARCHIVE = {
    "posterous": ("My life is not very interesting", "The Posterous blog, 2008–2012, mostly in Portuguese."),
    "monks": ("Computer for Monks", "The thesis blog for ESDI, 2006, in Portuguese. Only August was archived, and none of its pictures."),
    "wanderingabout": ("Wandering About", "The 2007 portfolio on wanderingabout.com, and Laser Chess's own site from 2005."),
    "portfolio2011": ("Wandering About, 2011", "The later portfolio on wanderingabout.com, 2011–2012: the older pieces told again, and the work since."),
    "olpcnews": ("OLPC News", "An article for OLPC News, 2007."),
    "flickr": ("Flickr", "Two essays written as captions on Flickr, 2005."),
    "paris": ("Paris diary", "The diary from Paris, 2005–2006, in Portuguese."),
}


# The ticks are kept in this browser only; the list they make is what
# decides, pasted back into the conversation.
PICKER_JS = """<script>
(() => {
  const KEY = "archive-picks";
  let picks = {};
  try { picks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) {}
  const boxes = [...document.querySelectorAll(".vis input")];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (_) {} };
  const show = () => {
    let n = 0;
    boxes.forEach(b => { b.closest(".pick").classList.toggle("in", b.checked); if (b.checked) n++; });
    document.querySelector(".picker .count").textContent = n + " of " + boxes.length + " on the blog";
  };
  boxes.forEach(b => {
    b.checked = !!picks[b.dataset.id];
    b.addEventListener("change", () => { picks[b.dataset.id] = b.checked; save(); show(); });
  });
  document.querySelectorAll(".shelf-of .all").forEach(btn => btn.addEventListener("click", () => {
    const mine = [...btn.closest(".shelf-of").querySelectorAll(".vis input")];
    const on = !mine.every(b => b.checked);
    mine.forEach(b => { b.checked = on; picks[b.dataset.id] = on; });
    save(); show();
  }));
  document.querySelector(".picker .copy").addEventListener("click", async () => {
    const line = b => "- " + b.dataset.id + "  (" + b.dataset.title + ")";
    const inn = boxes.filter(b => b.checked), out = boxes.filter(b => !b.checked);
    const text = "On the blog (" + inn.length + "):\\n" + inn.map(line).join("\\n") +
                 "\\n\\nKept in the archive only (" + out.length + "):\\n" + out.map(line).join("\\n") + "\\n";
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const t = document.createElement("textarea"); t.value = text; document.body.append(t);
      t.select(); document.execCommand("copy"); t.remove();
    }
    const d = document.querySelector(".picker .done"); d.classList.add("on");
    setTimeout(() => d.classList.remove("on"), 1600);
  });
  show();
})();
</script>"""


# Where posts first appeared, to their slug here: filled from each post's
# `original` by build(), and by hand for what no post records. The posts
# came to Paragraph from Mirror, and Paragraph kept no Mirror address.
MOVED = {}
MOVED_BY_HAND = {
    "https://mirror.xyz/avsa.eth/4pvULeQRqWCS8mMnk_UY1THYt3p6tEQNL0JkCzflcd0":
        "the-failures-of-instant-run-off-voting-from-a-designers-perspective",
}


# Sites that are gone, or no longer his: nothing links to them, only to the
# Internet Archive's copy. wanderingabout.com is someone else's now, and
# OLPC News went to ictworks.org, which kept none of the old pages.
GONE_HOSTS = ("wanderingabout.com", "olpcnews.com", "posterous.com", "forum.ethereum.org")


def gone(url):
    host = re.sub(r"^www\.", "", (re.match(r"https?://([^/:?#]+)", url.strip(), re.I) or [None, ""])[1].lower())
    return any(host == h or host.endswith("." + h) for h in GONE_HOSTS)


def archived(url, when=None):
    """The Internet Archive's copy of a page that is gone, the one nearest
    the date given (it finds the closest it has)."""
    stamp = when.strftime("%Y%m%d") if when else "2008"
    return f"https://web.archive.org/web/{stamp}/{url.strip()}"


def original_link(p, key="original"):
    """Where a post first appeared (or what it came through, "via"), or the
    archive's copy if that is gone."""
    return archived(p[key], p.get("date_dt")) if gone(p[key]) else p[key]


def link_key(url):
    """One form for the many ways of writing the same address: no scheme, no
    www, no trailing slash, no query. A Medium post is its id, whichever of
    Medium's hosts it is written on; an ENS forum topic is its number."""
    u = re.sub(r"^https?://(www\.)?", "", url.strip()).split("#")[0].split("?")[0].rstrip("/").lower()
    m = re.match(r"(?:[\w-]+\.)?medium\.com/.*-([0-9a-f]{10,12})$", u)
    if m:
        return "medium:" + m.group(1)
    m = re.match(r"discuss\.ens\.domains/t/[^/]+/(\d+)$", u)
    if m:
        return "ens:" + m.group(1)
    return u


def cat_slug(c):
    """A category's address: "University portfolio" is /category/university-portfolio."""
    return re.sub(r"[^a-z0-9]+", "-", c.lower()).strip("-")


def when(p):
    if not p.get("date"):
        return "undated"
    if p.get("date_circa"):
        return f'<time datetime="{p["date_dt"].year}">c. {p["date_dt"].year}</time>'
    return f'<time datetime="{p["date_dt"].date().isoformat()}">{nice_date(p["date_dt"])}</time>'


def build_archive(out, base, pics):
    """The older writing kept in blog/_archive: published at /archive/, but on
    no index, feed or sitemap, and asking search engines to leave it be. It is
    there to be looked through, and to pick from."""
    root = os.path.join(HERE, "_archive")
    if not os.path.isdir(root):
        return
    noindex = '<meta name="robots" content="noindex, nofollow">'
    sections, total = [], 0
    for coll in [c for c in ARCHIVE if os.path.isdir(os.path.join(root, c))] + sorted(
            c for c in os.listdir(root) if c not in ARCHIVE and not c.startswith(".") and os.path.isdir(os.path.join(root, c))):
        posts = []
        for name in sorted(os.listdir(os.path.join(root, coll))):
            folder = os.path.join(root, coll, name)
            if os.path.isfile(os.path.join(folder, "index.md")):
                p = read_post(folder)
                p["slug"] = f"archive/{coll}/{name}"
                posts.append(p)
        if not posts:
            continue
        posts.sort(key=lambda p: p["date_dt"])
        label, about = ARCHIVE.get(coll, (coll, ""))
        for p in posts:
            ctx = Ctx(p, pics, base)
            html_ = render_blocks(p["body_md"], ctx)
            first = ""
            if p.get("original"):
                first = (f' · <span class="first">Originally on <a href="{esc(original_link(p))}">'
                         f'{esc(p.get("original_site") or p["original"].split("/")[2])}</a></span>')
            lang = f' lang="{esc(p["lang"])}"' if p.get("lang") else ""
            body = f"""<main>
<article class="sheet"{lang}>
<span class="paper"></span>
<div class="text">
<h1>{esc(p['title'])}</h1>
<p class="when">In the archive: <a href="{base}archive/#{coll}">{esc(label)}</a> · {when(p)}{first}</p>
<div class="body">
{html_}
</div>
</div>
</article>
</main>"""
            write(out, p["slug"] + ".html", page(base, p["title"] + " · archive", body, cls="post archived", extra_head=noindex))
        total += len(posts)
        cards = "\n".join(
            f'<div class="pick">{card(p, base, pics, named=False)}'
            f'<label class="vis"><input type="checkbox" data-id="{esc(p["slug"][8:])}" data-title="{esc(p["title"])}"> On the blog</label></div>'
            for p in posts)
        sections.append(f'<section class="shelf-of" id="{coll}"><h2>{esc(label)}<button class="all" type="button">all / none</button></h2>'
                        f'<p class="about">{esc(about)} {len(posts)} {"post" if len(posts) == 1 else "posts"}.</p>\n'
                        f'<div class="cards">\n{cards}\n</div></section>')
    body = (f'<main class="index"><h1>The archive</h1><p class="lead">Older writing, kept as it was found: '
            f'not on the blog, and not for search engines. Tick what should go on the blog, then copy the list.</p>\n'
            f'<div class="picker"><span class="count"></span><button type="button" class="copy">Copy the list</button>'
            f'<span class="done">Copied</span></div>\n'
            + "\n".join(sections) + "</main>" + PICKER_JS)
    missing = os.path.join(root, "MISSING.md")
    if os.path.exists(missing):
        md = open(missing, encoding="utf-8").read()
        # each post's heading links to its page, where there is one here
        def link(m):
            folder = m.group(2)
            rel = folder[len("blog/_archive/"):] if folder.startswith("blog/_archive/") else folder[len("blog/"):]
            href = f"{base}archive/{rel}" if folder.startswith("blog/_archive/") else f"{base}{rel}"
            return f"## [{m.group(1)}]({href})\n`{folder}`"
        md = re.sub(r"(?m)^## (.+)\n`([^`]+)`", link, md)
        ctx = Ctx({"slug": "archive", "folder": root}, pics, base)
        mbody = f'<main><article class="sheet"><span class="paper"></span><div class="text"><div class="body">{render_blocks(md, ctx)}</div></div></article></main>'
        write(out, "archive/missing.html", page(base, "Missing · archive", mbody, cls="post archived", extra_head=noindex))
        body = body.replace('<div class="picker">', f'<p class="lead"><a href="{base}archive/missing">What the old pages showed that is still missing</a></p>\n<div class="picker">', 1)
    write(out, "archive/index.html", page(base, "The archive · " + TITLE, body, cls="list", extra_head=noindex))
    print(f"{total} archived posts into {out}/archive")


def write(out, rel, text):
    path = os.path.join(out, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def serve(out, base, port):
    """Like the host will: /<slug> is <slug>.html, and the blog sits at base."""
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=out, **k)

        def translate_path(self, path):
            p = path.split("?")[0].split("#")[0]
            if base != "/" and p.startswith(base):
                p = "/" + p[len(base):]
            real = super().translate_path(p)
            if not os.path.exists(real) and os.path.exists(real + ".html"):
                return real + ".html"
            return real

        def send_error(self, code, message=None, explain=None):
            nf = os.path.join(out, "404.html")
            if code == 404 and os.path.exists(nf):
                body = open(nf, "rb").read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().send_error(code, message, explain)

    print(f"serving on http://localhost:{port}{base}")
    http.server.ThreadingHTTPServer(("", port), H).serve_forever()


def main():
    global HOME, QUICK
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(HERE, "_site"))
    ap.add_argument("--base", default="/", help="the path the blog is served under, e.g. /blog/")
    ap.add_argument("--home", default=HOME, help="the address of the rest of the site, which the blog links back to")
    ap.add_argument("--clean", action="store_true", help="empty the output first")
    ap.add_argument("--serve", type=int, metavar="PORT")
    ap.add_argument("--drafts", action="store_true", help="build the editor's drafts (index.draft.md) too, for a preview")
    ap.add_argument("--quick", action="store_true", help="copy the pictures instead of resizing them, for a preview")
    args = ap.parse_args()
    base = "/" + args.base.strip("/") + "/" if args.base.strip("/") else "/"
    HOME = args.home
    QUICK = args.quick
    if Image is None:
        print("Pillow is not installed: the pictures are copied at full size (pip install pillow)", file=sys.stderr)
    build(args.out, base, args.clean, args.drafts)
    if args.serve:
        serve(args.out, base, args.serve)


if __name__ == "__main__":
    main()
