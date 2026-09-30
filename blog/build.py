#!/usr/bin/env python3
"""Build the blog from the folders next to this file.

    python3 blog/build.py                          # into blog/_site, served at /
    python3 blog/build.py --out site/blog --base /blog/
    python3 blog/build.py --serve 8766             # build, then serve it

Every folder here with an index.md is a post, and its name is its address:
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
import argparse, html, http.server, json, os, re, shutil, sys
from datetime import datetime, timezone
from email.utils import format_datetime

try:
    from PIL import Image
except ImportError:          # pictures are copied instead of resized
    Image = None

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_URL = "https://blog.vandesande.design"
TITLE = "Alex Van de Sande's wanderings"
AUTHOR = "Alex Van de Sande"
HOME = "https://vandesande.design"
COLUMN = 704                  # the text column, in CSS pixels: what Paragraph had
WIDTHS = (480, 704, 1056, 1408, 2112)


# ---------------------------------------------------------------- front matter

def read_post(folder):
    text = open(os.path.join(folder, "index.md"), encoding="utf-8").read()
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
        lone = re.fullmatch(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)', para)
        if lone:     # a picture on its own is a figure, its title the caption
            cap = f"\n<figcaption>{inline(lone.group(3))}</figcaption>" if lone.group(3) else ""
            out.append(f"<figure>\n{ctx.img(lone.group(2), lone.group(1))}{cap}\n</figure>")
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
        if Image is None or ext.lower() in (".gif", ".svg", ".webp"):
            target = os.path.join(dest, name)
            if not fresh(target, src):
                shutil.copyfile(src, target)
            w = size_of(src)[0] if Image else 0
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
        block = re.sub(r'href="([^"]*)"', lambda m: f'href="{html.escape(self.href(html.unescape(m.group(1))))}"'
                       + (' target="_blank" rel="noopener"' if re.match(r"https?://", self.href(html.unescape(m.group(1)))) else ""), block)
        return block


# ---------------------------------------------------------------- pages

def esc(s):
    return html.escape(s or "", quote=True)


def nice_date(d):
    return f"{d.day} {d.strftime('%B %Y')}"


def plain(html_text, n=None):
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<math.*?</math>|<figure.*?</figure>|<[^>]+>", " ", html_text, flags=re.S))).strip()
    if n and len(t) > n:
        t = t[:n].rsplit(" ", 1)[0] + "…"
    return t


def page(base, title, body, *, description="", canonical="", image="", kind="website", extra_head="", cls=""):
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
<link rel="stylesheet" href="{base}assets/blog.css">
{extra_head}
</head>
<body class="{cls}">
<header class="top">{f'<a href="{HOME}">{esc(AUTHOR)}</a>' if cls == "list" else f'<a href="{base}">{esc(TITLE)}</a>'}</header>
{body}
<footer class="foot">
  <a href="{HOME}">{esc(AUTHOR)}</a><span>·</span><a href="{base}rss.xml">RSS</a>
</footer>
</body>
</html>
"""


def card(p, base, pics):
    cover = ""
    if p.get("cover"):
        ctx = Ctx(p, pics, base)
        w, h = p.get("cover_size") or (None, None)
        cover = f'<div class="thumb">{ctx.img(p["cover"], "", w, h)}</div>'
        cover = cover.replace('sizes="(min-width: 50rem) 704px, 100vw"', 'sizes="(min-width: 50rem) 440px, 100vw"')
    sub = f'<p class="sub">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""
    return f"""<a class="card" href="{base}{p['slug']}">{cover}
  <div class="words"><h2>{esc(p['title'])}</h2>{sub}<p class="when"><time datetime="{p['date_dt'].date().isoformat()}">{nice_date(p['date_dt'])}</time></p></div>
</a>"""


def build(out, base, clean=False):
    if clean and os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    pics = Pictures(out, base)

    posts = []
    for name in sorted(os.listdir(HERE)):
        folder = os.path.join(HERE, name)
        if name.startswith((".", "_")) or not os.path.isfile(os.path.join(folder, "index.md")):
            continue
        posts.append(read_post(folder))
    posts.sort(key=lambda p: p["date_dt"], reverse=True)

    # the assets
    shutil.copytree(os.path.join(HERE, "_assets"), os.path.join(out, "assets"), dirs_exist_ok=True)

    for p in posts:
        ctx = Ctx(p, pics, base)
        p["html"] = render_blocks(p["body_md"], ctx)
        p["description"] = p.get("subtitle") or plain(p["html"], 180)
        p["url"] = f"{SITE_URL}/{p['slug']}"
        cover_img, p["og_image"] = "", ""
        if p.get("cover"):
            w, h = p.get("cover_size") or (None, None)
            cover_img = f'<div class="cover">{ctx.img(p["cover"], "", w, h)}</div>'
            v = ctx.picture(p["cover"])
            if v:
                p["og_image"] = SITE_URL + "/" + next((u for u, x in v if x >= 1056), v[-1][0])[len(base):]
        cats = "".join(f' · <a href="{base}category/{esc(c)}">{esc(c)}</a>' for c in p.get("categories") or [])
        sub = f'<p class="sub">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""
        others = [q for q in posts if q is not p][:4]
        more = "".join(f'<li><a href="{base}{q["slug"]}">{esc(q["title"])}</a></li>' for q in others)
        body = f"""<main>
<article class="sheet">
{cover_img}
<div class="text">
<h1>{esc(p['title'])}</h1>
{sub}
<p class="when"><time datetime="{p['date_dt'].date().isoformat()}">{nice_date(p['date_dt'])}</time>{cats}</p>
<div class="body">
{p['html']}
</div>
</div>
</article>
<nav class="more"><h2>More wanderings</h2><ul>{more}</ul></nav>
</main>"""
        ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"],
              "datePublished": p["date_dt"].isoformat(), "dateModified": parse_date(p.get("updated") or p.get("date")).isoformat(),
              "author": {"@type": "Person", "name": AUTHOR}, "url": p["url"]}
        if p["og_image"]:
            ld["image"] = p["og_image"]
        extra = f'<meta property="article:published_time" content="{p["date_dt"].isoformat()}">\n<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
        write(out, p["slug"] + ".html", page(base, p["title"], body, description=p["description"], canonical=p["url"],
                                              image=p["og_image"], kind="article", extra_head=extra, cls="post"))
        # the Markdown too, with its pictures at their full addresses
        md = re.sub(r'(src="|\]\()(?![a-z]+:|/)([^")\s]+)',
                    lambda m: m.group(1) + (SITE_URL + "/" + pics.variants(os.path.join(p["folder"], m.group(2)), p["slug"], m.group(2))[-1][0][len(base):]
                                            if os.path.exists(os.path.join(p["folder"], m.group(2))) else m.group(2)), p["source"])
        write(out, p["slug"] + ".md", md)
        print(f"  {p['slug']}")

    def listing(title, heading, items, canonical, path):
        cards = "\n".join(card(p, base, pics) for p in items)
        body = f'<main class="index"><h1>{heading}</h1>\n<div class="cards">\n{cards}\n</div></main>'
        write(out, path, page(base, title, body, description=f"Posts by {AUTHOR}.", canonical=canonical, cls="list"))

    listing(TITLE, esc(TITLE), posts, SITE_URL + "/", "index.html")
    cats = sorted({c for p in posts for c in p.get("categories") or []})
    for c in cats:
        listing(f"{c} · {TITLE}", f'<span class="cat">{esc(c)}</span>', [p for p in posts if c in (p.get("categories") or [])],
                f"{SITE_URL}/category/{c}", f"category/{c}.html")
    write(out, "404.html", page(base, "Not here · " + TITLE,
                                f'<main class="index"><h1>Nothing is here.</h1><p class="lost"><a href="{base}">All the posts</a></p></main>', cls="list"))

    # the feed, with whole posts in it
    now = format_datetime(datetime.now(timezone.utc))
    items = []
    for p in posts:
        content = re.sub(r'(src|href)="' + re.escape(base), lambda m: f'{m.group(1)}="{SITE_URL}/', p["html"])
        content = re.sub(r' (?:srcset|sizes|loading|decoding)="[^"]*"', "", content)
        items.append(f"""<item>
<title>{esc(p['title'])}</title>
<link>{p['url']}</link>
<guid isPermaLink="true">{p['url']}</guid>
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

    urls = [SITE_URL + "/"] + [f"{SITE_URL}/category/{c}" for c in cats] + [p["url"] for p in posts]
    write(out, "sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls) + "\n</urlset>\n")
    write(out, "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
    write(out, "llms.txt", f"# {TITLE}\n\n## Posts\n\n" + "\n".join(
        f"- [{p['title']}]({p['url']}.md)" + (f": {p['subtitle']}" if p.get("subtitle") else "") for p in posts)
        + f"\n\n## Blog Information\n\n- [Homepage]({SITE_URL}/): Main blog page\n- [RSS Feed]({SITE_URL}/rss.xml): Subscribe to updates\n")
    print(f"{len(posts)} posts into {out}")


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
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(HERE, "_site"))
    ap.add_argument("--base", default="/", help="the path the blog is served under, e.g. /blog/")
    ap.add_argument("--clean", action="store_true", help="empty the output first")
    ap.add_argument("--serve", type=int, metavar="PORT")
    args = ap.parse_args()
    base = "/" + args.base.strip("/") + "/" if args.base.strip("/") else "/"
    if Image is None:
        print("Pillow is not installed: the pictures are copied at full size (pip install pillow)", file=sys.stderr)
    build(args.out, base, args.clean)
    if args.serve:
        serve(args.out, base, args.serve)


if __name__ == "__main__":
    main()
