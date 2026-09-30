#!/usr/bin/env python3
"""Bring posts written elsewhere into the blog, one folder each.

    python3 blog/import_posts.py [--only SLUG] [--force]

The posts are listed in SOURCES below: the ones on Medium, on the Ethereum
Foundation's blog and on the ENS forum. Each becomes blog/<slug>/ like the
posts from Paragraph: index.md, its pictures at full size (the one it opens
with as cover.*, the rest 01.*, 02.* …), and source.html, the post's HTML as
it was fetched, kept as the record. The header says where it first appeared
(`original` and `original_site`), and the page says so under the date.

Medium turns away plain requests for its pages, so the last ten posts come
from its RSS feed, which carries them whole, and the older ones from the
Wayback Machine's copies. The Foundation's blog and the forum are read
directly. Links from one of these posts to another point at the copy here.

Needs Pillow for the pictures' sizes. Like export_paragraph.py, it will not
overwrite a post edited here since it was written, unless --force.
"""
import argparse, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (compatible; vandesande-blog-import/1)"}
FEED = "https://medium.com/feed/@avsa"
WAYBACK = "https://archive.org/wayback/available?url="

# (slug here, where it was, kind, date if the page does not say)
SOURCES = [
    # Medium, his own account
    ("the-truth-about-the-fork", "https://medium.com/@avsa/the-truth-about-the-fork-fd040c7ca955", "medium", "2016-08-03"),
    ("como-aumentar-a-representatividade-mas-diminuir-os-representantes",
     "https://avsa.medium.com/como-aumentar-a-representatividade-mas-diminuir-os-representantes-5430dc381439", "medium", "2016-10-06"),
    ("avoid-evil-twins", "https://avsa.medium.com/avoid-evil-twins-every-ethereum-app-pays-the-price-of-a-chain-split-e04c2a560ba8", "medium", "2018-04-18"),
    ("recovering-lost-ether-past-and-future", "https://medium.com/@avsa/recovering-lost-ether-past-and-future-eeb38b17aeb5", "medium", "2018-04-24"),
    ("token-curating-the-truth", "https://avsa.medium.com/token-curating-the-truth-6d699a71ef5a", "medium", "2018-07-31"),
    ("sponsored-burning-for-tcr", "https://avsa.medium.com/sponsored-burning-for-tcr-c0ab08eef9d4", "medium", "2018-08-03"),
    ("sunsetting-mist", "https://avsa.medium.com/sunsetting-mist-da21c8e943d2", "medium", "2019-03-22"),
    ("ux-audit-metamask-main-navigation", "https://avsa.medium.com/on-metamask-main-navigation-ac8b756599b1", "medium", "2020-08-13"),
    ("ux-audit-dark-forest", "https://avsa.medium.com/a-dark-forest-ux-audit-6235c2fd04e", "medium", "2020-08-18"),
    ("ux-audit-status", "https://avsa.medium.com/ux-audit-status-b0fa0062c96f", "medium", "2020-11-19"),
    ("its-time-for-social-media-interoperability", "https://avsa.medium.com/its-time-for-social-media-interoperability-4cee38673fa3", "medium", "2021-08-06"),
    # the Ethereum Foundation's blog
    ("how-to-build-your-own-cryptocurrency", "https://blog.ethereum.org/2015/12/03/how-to-build-your-own-cryptocurrency", "ef", None),
    ("how-to-build-a-better-democracy", "https://blog.ethereum.org/2015/12/04/ethereum-in-practice-part-2-how-to-build-a-better-democracy-in-under-a-100-lines-of-code", "ef", None),
    ("how-to-build-your-own-transparent-bank", "https://blog.ethereum.org/2015/12/07/ethereum-in-practice-part-3-how-to-build-your-own-transparent-bank-on-the-blockchain", "ef", None),
    ("build-server-less-applications-for-mist", "https://blog.ethereum.org/2016/07/12/build-server-less-applications-mist", "ef", None),
    # the ENS forum
    ("a-map-of-all-ens-contracts", "https://discuss.ens.domains/t/a-map-of-all-ens-contracts/10754", "discourse", None),
    ("visualization-of-money-flows-between-dao-wallets", "https://discuss.ens.domains/t/visualization-of-money-flows-between-dao-wallets/18010", "discourse", None),
    ("analysis-of-ranked-choice-voting-in-5-19", "https://discuss.ens.domains/t/analysis-of-ranked-choice-voting-in-5-19-governance-distribution-pilot/19797", "discourse", None),
]
SITE_NAME = {"medium": "Medium", "ef": "blog.ethereum.org", "discourse": "discuss.ens.domains"}


def get(url, tries=5):
    last = None
    for n in range(tries):
        if "archive.org" in url:
            time.sleep(4)           # the archive asks to be taken slowly
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (403, 404):
                raise
            time.sleep(15 * (n + 1) if e.code == 429 else 2)
        except Exception as e:      # the archive in particular drops connections
            last = e
            time.sleep(3)
    raise last


# ---------------------------------------------------------------- a small DOM

VOID = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "col", "area", "base", "embed", "param", "track"}


class Node:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs or {}), parent, []

    def text(self):
        return "".join(k if isinstance(k, str) else k.text() for k in self.kids)

    def find_all(self, pred):
        for k in self.kids:
            if isinstance(k, Node):
                if pred(k):
                    yield k
                yield from k.find_all(pred)

    def find(self, pred):
        return next(self.find_all(pred), None)

    def cls(self):
        return self.attrs.get("class") or ""


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def parse(h):
    t = Tree()
    t.feed(h)
    return t.root


# ---------------------------------------------------------------- HTML to Markdown

MD_ESC = re.compile(r"([\\`*_\[\]<])")
BLOCKS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "figure", "hr", "table",
          "div", "section", "article", "aside", "iframe", "details", "img"}


class Convert:
    """One post's HTML into Markdown, its pictures fetched into its folder."""

    def __init__(self, folder, links, heading_shift=0, base_url=""):
        self.folder, self.links, self.shift, self.base = folder, links, heading_shift, base_url
        self.count = 0
        self.images = {}
        self.cover = None

    # --- pictures
    def picture(self, url):
        url = urllib.parse.urljoin(self.base, html.unescape(url))
        url = full_size(url)
        if url in self.images:
            return self.images[url]
        data = get(url)
        ext = sniff(data)
        self.count += 1
        name = f"{self.count:02d}{ext}"
        with open(os.path.join(self.folder, name), "wb") as f:
            f.write(data)
        with Image.open(os.path.join(self.folder, name)) as im:
            size = im.size
        self.images[url] = (name, size)
        return name, size

    def figure(self, img, caption_node=None, link=None):
        src = img_src(img)
        if not src or "/_/stat" in src:       # Medium's feed counts its readers with one
            return ""
        try:
            name, (w, h) = self.picture(src)
        except Exception as e:
            print(f"    picture {src} not fetched: {e}", file=sys.stderr)
            return ""
        alt = html.escape(img.attrs.get("alt") or "", quote=True)
        if alt.lower() in ("image for post", "image", "post image"):
            alt = ""
        lines = ["<figure>", f'<img src="{name}" width="{w}" height="{h}" alt="{alt}">']
        cap = self.inline_html(caption_node).strip() if caption_node is not None else ""
        if cap:
            lines.append(f"<figcaption>{cap}</figcaption>")
        lines.append("</figure>")
        return "\n".join(lines)

    # --- links
    def href(self, h):
        h = urllib.parse.urljoin(self.base, html.unescape(h or ""))
        key = link_key(h)
        return self.links.get(key, h)

    # --- inline, as Markdown
    def inline(self, node):
        out = []
        kids = node.kids
        for j, k in enumerate(kids):
            if isinstance(k, str):
                out.append(MD_ESC.sub(r"\\\1", re.sub(r"\s+", " ", k)))
                continue
            t = k.tag
            if t in ("strong", "b", "em", "i"):
                inner = self.inline(k)
                # inside a word, Markdown's marks do not hold: say it in HTML
                after = kids[j + 1] if j + 1 < len(kids) else ""
                glued = ("".join(out)[-1:].isalnum() and not inner[:1].isspace()) or (
                    isinstance(after, str) and after[:1].isalnum() and not inner[-1:].isspace())
                tag = "strong" if t in ("strong", "b") else "em"
                if glued and inner.strip():
                    out.append(f"<{tag}>{inner}</{tag}>")
                else:
                    out.append(wrap(inner, "**" if tag == "strong" else "_"))
            elif t == "code":
                c = k.text()
                tick = "``" if "`" in c else "`"
                out.append(f"{tick}{c}{tick}" if c.strip() else c)
            elif t == "a":
                inner = self.inline(k)
                h = k.attrs.get("href")
                if not h or not inner.strip():
                    out.append(inner)
                else:
                    lead = inner[: len(inner) - len(inner.lstrip())]
                    trail = inner[len(inner.rstrip()):]
                    out.append(f"{lead}[{inner.strip()}]({md_url(self.href(h))}){trail}")
            elif t == "br":
                out.append("<br>\n")
            elif t == "img":
                if "emoji" in k.cls():
                    out.append(k.attrs.get("title") or k.attrs.get("alt") or "")
            elif t in ("sup", "sub", "mark", "s", "del", "u"):
                out.append(f"<{t}>{self.inline(k)}</{t}>")
            elif t in ("svg", "script", "style", "noscript", "button"):
                continue
            else:
                out.append(self.inline(k))
        return "".join(out)

    # --- inline, as HTML (inside a figure, where Markdown is not read)
    def inline_html(self, node):
        out = []
        for k in node.kids:
            if isinstance(k, str):
                out.append(html.escape(re.sub(r"\s+", " ", k), quote=False))
                continue
            t = k.tag
            if t in ("strong", "b", "em", "i", "code", "sup", "sub"):
                t2 = {"b": "strong", "i": "em"}.get(t, t)
                out.append(f"<{t2}>{self.inline_html(k)}</{t2}>")
            elif t == "a" and k.attrs.get("href"):
                out.append(f'<a href="{html.escape(self.href(k.attrs["href"]))}">{self.inline_html(k)}</a>')
            elif t == "br":
                out.append("<br>")
            elif t in ("svg", "script", "style", "noscript", "button"):
                continue
            else:
                out.append(self.inline_html(k))
        return "".join(out)

    # --- blocks
    def blocks(self, node):
        out, run = [], []

        def flush():
            text = "".join(run).strip()
            run.clear()
            if text:
                out.append(text)

        for k in node.kids:
            if isinstance(k, str) or k.tag not in BLOCKS and not k.tag.startswith("h"):
                run.append(self.inline(wrapnode(k)))
                continue
            flush()
            b = self.block(k)
            if b:
                out.extend(b if isinstance(b, list) else [b])
        flush()
        return out

    def block(self, n):
        t = n.tag
        if t == "p":
            imgs = list(n.find_all(lambda x: x.tag == "img" and "emoji" not in x.cls()))
            if imgs and not n.text().strip():
                return [self.figure(i) for i in imgs]
            parts = []
            if imgs:            # a picture inside a paragraph of words: it stands apart
                for i in imgs:
                    parts.append(self.figure(i))
                    i.parent.kids.remove(i)
            style = n.attrs.get("style", "")
            text = self.inline(n).strip()
            if text:
                if "center" in style:
                    text = f'<p style="text-align:center">{self.inline_html(n).strip()}</p>'
                parts.insert(0, text)
            return parts
        if re.fullmatch(r"h[1-6]", t):
            level = min(6, max(2, int(t[1]) + self.shift))
            text = self.inline(n).strip()
            text = re.sub(r"^\*\*(.*)\*\*$", r"\1", text)      # a heading is bold already
            return "#" * level + " " + text if text else None
        if t == "figure":
            img = n.find(lambda x: x.tag == "img")
            ifr = n.find(lambda x: x.tag == "iframe")
            cap = n.find(lambda x: x.tag == "figcaption")
            if img is not None:
                return self.figure(best_img(n, img), cap)
            if ifr is not None:
                return self.embed(ifr)
            return None
        if t == "img":
            return self.figure(n)
        if t in ("ul", "ol"):
            items = []
            for i, li in enumerate(x for x in n.kids if isinstance(x, Node) and x.tag == "li"):
                marker = "- " if t == "ul" else f"{i + 1}. "
                body = "\n\n".join(self.blocks(li)) or ""
                pad = " " * len(marker)
                items.append(marker + body.replace("\n", "\n" + pad).replace("\n" + pad + "\n", "\n\n"))
            return "\n".join(items) if items else None
        if t == "blockquote":
            inner = "\n\n".join(self.blocks(n)) or self.inline(n).strip()
            return "\n".join(("> " + l) if l else ">" for l in inner.split("\n")) if inner else None
        if t == "pre":
            code = n.text().strip("\n")
            fence = "````" if "```" in code else "```"
            return f"{fence}\n{code}\n{fence}"
        if t == "hr":
            return "---"
        if t == "iframe":
            return self.embed(n)
        if t == "table":
            return clean_table(n, self)
        if t == "aside" and "onebox" in n.cls():          # the forum's preview of a link
            a = n.find(lambda x: x.tag == "a" and x.attrs.get("href"))
            title = n.find(lambda x: x.tag in ("h3", "h4"))
            if a is None:
                return None
            label = (title.text() if title is not None else a.attrs["href"]).strip()
            return f"[{md_text(label)}]({md_url(self.href(a.attrs['href']))})"
        if t == "div" and "lightbox-wrapper" in n.cls():
            a = n.find(lambda x: x.tag == "a")
            img = n.find(lambda x: x.tag == "img")
            if img is not None:
                if a is not None and a.attrs.get("href"):
                    img = Node("img", dict(img.attrs, src=a.attrs["href"]))
                return self.figure(img)
            return None
        if t in ("div", "section", "article", "details", "aside"):
            return self.blocks(n)
        return self.inline(n).strip() or None

    def embed(self, ifr):
        src = html.unescape(ifr.attrs.get("src") or ifr.attrs.get("data-src") or "")
        m = re.search(r"(?:youtube(?:-nocookie)?\.com/embed/|youtu\.be/)([\w-]{11})", src)
        if m:
            vid = m.group(1)
            return (f'<figure class="youtube">\n<iframe src="https://www.youtube-nocookie.com/embed/{vid}" '
                    f'title="YouTube video" loading="lazy" allowfullscreen '
                    f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>\n</figure>')
        return f"[{src}]({md_url(src)})" if src.startswith("http") else None


def md_text(s):
    return MD_ESC.sub(r"\\\1", s)


def wrapnode(k):
    n = Node("span")
    n.kids = [k]
    return n


def wrap(inner, mark):
    if not inner.strip():
        return inner
    lead = inner[: len(inner) - len(inner.lstrip())]
    trail = inner[len(inner.rstrip()):]
    return f"{lead}{mark}{inner.strip()}{mark}{trail}"


def md_url(u):
    return u.replace(" ", "%20").replace("(", "%28").replace(")", "%29") if re.search(r"[\s]|\([^)]*$|^[^(]*\)", u) else u


def clean_table(n, conv):
    rows = []
    for tr in n.find_all(lambda x: x.tag == "tr"):
        cells = [c for c in tr.kids if isinstance(c, Node) and c.tag in ("td", "th")]
        rows.append("<tr>" + "".join(f"<{c.tag}>{conv.inline_html(c).strip()}</{c.tag}>" for c in cells) + "</tr>")
    return "<table>\n" + "\n".join(rows) + "\n</table>" if rows else None


def img_src(img):
    for k in ("data-src", "src"):
        v = img.attrs.get(k)
        if v and not v.startswith("data:"):
            return v
    ss = img.attrs.get("srcset") or img.attrs.get("srcSet")
    return ss.split(",")[-1].split()[0] if ss else None


def best_img(fig, img):
    """Medium draws a blurred 60px picture first and the real one in <noscript>."""
    for i in fig.find_all(lambda x: x.tag == "img"):
        s = img_src(i) or ""
        if s and "/max/60/" not in s and "q=20" not in s:
            return i
    ns = fig.find(lambda x: x.tag == "noscript")
    if ns is not None:
        inner = parse(ns.text()).find(lambda x: x.tag == "img")
        if inner is not None:
            return inner
    return img


def full_size(url):
    """The biggest the host will give of a picture."""
    m = re.search(r"(?:miro\.medium\.com|cdn-images-\d\.medium\.com)/(?:.*/)?((?:\d|0)\*[\w.-]+)", url)
    if m:
        return f"https://miro.medium.com/v2/resize:fit:3200/{m.group(1)}"
    m = re.match(r"(https://discuss\.ens\.domains/uploads/[^/]+/)optimized/(.+?)_\d+_\d+x\d+(\.\w+)$", url)
    if m:
        return f"{m.group(1)}original/{m.group(2)}{m.group(3)}"
    return url


def sniff(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def link_key(u):
    """The same post, however its address was written."""
    p = urllib.parse.urlparse(u)
    host = p.netloc.lower().removeprefix("www.")
    path = p.path.rstrip("/")
    m = re.search(r"-([0-9a-f]{10,12})$", path)
    if "medium.com" in host and m:
        return "medium:" + m.group(1)
    if host == "blog.ethereum.org":
        return "ef:" + path.split("/")[-1]
    m = re.match(r"/t/(?:[^/]+/)?(\d+)", path)
    if host == "discuss.ens.domains" and m:
        return "ens:" + m.group(1)
    return None


# ---------------------------------------------------------------- the sources

def from_medium(url, feed_items):
    key = link_key(url)
    for it in feed_items:
        if link_key(it["link"]) == key:
            return it["title"], it["html"], None, "feed"
    # not in the feed: the Wayback Machine's copy
    # the same post under both of Medium's addresses for it, as it was around
    # 2020, when its pages still carried the whole post in their HTML
    path = url.split("://")[1].split("/", 1)[1]
    slug = path.split("/")[-1]
    snap = None
    for where in (f"medium.com/@avsa/{slug}", f"avsa.medium.com/{slug}"):
        avail = json.loads(get(WAYBACK + urllib.parse.quote(where, safe="/@") + "&timestamp=20200601"))
        snap = (avail.get("archived_snapshots") or {}).get("closest")
        if snap:
            break
    if not snap:
        raise RuntimeError("not in the Wayback Machine")
    ts = snap["timestamp"]
    raw = get(f"https://web.archive.org/web/{ts}id_/{snap['url'].split('/', 5)[5]}").decode("utf-8", "replace")
    doc = parse(raw)
    art = doc.find(lambda x: x.tag == "article")
    h1 = art.find(lambda x: x.tag == "h1")
    title = h1.text().strip()
    body = Node("div")
    started = False
    # the post is the elements Medium gave an id of four hex digits, and the
    # figures between them; the title and the byline come before
    for n in art.find_all(lambda x: (x.tag in ("p", "h1", "h2", "h3", "h4", "blockquote", "pre", "ul", "ol", "figure")
                                     and (re.fullmatch(r"[0-9a-f]{4}", x.attrs.get("id", "")) or x.tag == "figure"
                                          or (x.tag in ("ul", "ol") and x.find(lambda y: y.tag == "li" and y.attrs.get("id")))))):
        if n is h1:
            started = True
            continue
        if not started or inside(n, body):
            continue
        if any(a is n for a in body.kids):
            continue
        if n.tag in ("p", "h1", "h2", "h3", "h4", "blockquote", "pre") and n.parent is not None and any(
                isinstance(a, Node) and a.tag in ("figure", "blockquote", "ul", "ol") and a in body.kids for a in ancestors(n)):
            continue
        body.kids.append(n)
    return title, None, body, f"wayback {ts}"


def ancestors(n):
    p = n.parent
    while p is not None:
        yield p
        p = p.parent


def inside(n, body):
    return any(a in body.kids for a in ancestors(n))


def feed():
    xml = get(FEED).decode("utf-8")
    items = []
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        title = re.search(r"<title><!\[CDATA\[(.*?)\]\]></title>", it, re.S).group(1)
        link = re.search(r"<link>(.*?)</link>", it).group(1)
        body = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>", it, re.S)
        items.append({"title": html.unescape(title), "link": link, "html": body.group(1) if body else ""})
    return items


def from_ef(url):
    page = get(url).decode("utf-8", "replace")
    data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S).group(1))
    pp = data["props"]["pageProps"]
    fm = pp["frontmatter"]
    # WordPress's way: paragraphs are blank lines, and HTML is mixed in. Code
    # has blank lines of its own, so it is set aside first.
    kept = []
    def keep(m):
        kept.append(m.group(0))
        return f"\n\n\x00{len(kept) - 1}\x00\n\n"
    content = re.sub(r"<pre\b.*?</pre>", keep, pp["content"], flags=re.S)
    chunks = re.split(r"\n\s*\n", content.strip())
    out = []
    for c in chunks:
        c = c.strip()
        m = re.fullmatch(r"\x00(\d+)\x00", c)
        if m:
            out.append(kept[int(m.group(1))])
            continue
        if re.match(r"<(h\d|p|ul|ol|blockquote|pre|table|div|figure)\b", c):
            # a block of HTML, perhaps with loose lines after it
            m = re.match(r"(<(h\d|p|ul|ol|blockquote|pre|table|div|figure)\b.*?</\2>)(.*)", c, re.S)
            if m:
                out.append(m.group(1))
                rest = m.group(3).strip()
                if rest:
                    out.extend(f"<p>{l}</p>" for l in re.split(r"\n", rest) if l.strip())
                continue
        # loose lines: each its own paragraph, as WordPress had them
        for l in c.split("\n"):
            l = l.strip()
            if not l:
                continue
            if re.match(r"<(h\d|p|ul|ol|blockquote|pre|table|div|figure)\b", l):
                out.append(l)
            else:
                out.append(f"<p>{l}</p>")
    return fm["title"], "\n".join(out), fm.get("date"), fm


def from_discourse(url):
    tid = re.search(r"/t/(?:[^/]+/)?(\d+)", url).group(1)
    d = json.loads(get(f"https://discuss.ens.domains/t/{tid}.json"))
    p = d["post_stream"]["posts"][0]
    # a picture there carries its file name and size under it, for the zoom
    cooked = re.sub(r'<div class="meta">.*?</div>', "", p["cooked"], flags=re.S)
    return d["title"], cooked, p["created_at"], p["username"]


# ---------------------------------------------------------------- writing

def fm(key, value):
    return f"{key}: {json.dumps(value, ensure_ascii=False)}"


def iso(s):
    if not s:
        return None
    s = str(s)
    if re.fullmatch(r"\d{4}-\d\d-\d\d", s):
        s += "T12:00:00+00:00"
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write(slug, url, kind, date, links, items, force):
    folder = os.path.join(HERE, slug)
    md_path = os.path.join(folder, "index.md")
    stamp = os.path.join(folder, ".exported")
    if os.path.exists(md_path) and not force:
        mine = open(stamp).read().strip() if os.path.exists(stamp) else None
        if mine != hashlib.sha256(open(md_path, "rb").read()).hexdigest():
            print(f"  {slug}: edited here since it was imported; left alone (--force to overwrite)")
            return
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):              # its pictures are fetched afresh
        if re.fullmatch(r"(\d\d|cover)\.\w+", f):
            os.remove(os.path.join(folder, f))

    conv = Convert(folder, links, base_url=url)
    if kind == "medium":
        title, body_html, body_node, how = from_medium(url, items)
        node = body_node if body_node is not None else parse(body_html)
        record = body_html or "<!-- from the Wayback Machine -->\n" + node_html(node)
        # Medium's section heads are h3 and h4 in the feed, h1 and h2 on the page
        conv.shift = 2 if body_node is not None else 0
    elif kind == "ef":
        title, body_html, when, _ = from_ef(url)
        node, record, how = parse(body_html), body_html, "page"
        date = date or when
    else:
        title, body_html, when, _ = from_discourse(url)
        node, record, how = parse(body_html), body_html, "forum"
        conv.shift = 1        # the forum's sections are h1
        date = date or when

    blocks = [b for b in conv.blocks(node) if b and b.strip()]
    # Medium's feed starts with the title, and sometimes the subtitle, again
    subtitle = None
    while blocks and blocks[0].lstrip("# ").strip("*_ ").strip() == title.strip():
        blocks.pop(0)
    if kind == "medium" and body_node is None:
        # the feed's title is the one for search engines; the post opens with
        # its own, and the line under that is its subtitle
        if blocks and blocks[0].startswith("### "):
            title = blocks.pop(0)[4:].strip("*_ ")
        if blocks and blocks[0].startswith("#### "):
            subtitle = blocks.pop(0)[5:].strip("*_ ")
    # the picture it opens with is its cover
    cover = cover_size = None
    if blocks and blocks[0].startswith("<figure") and "<img" in blocks[0] and "<figcaption>" not in blocks[0]:
        m = re.search(r'src="([^"]+)" width="(\d+)" height="(\d+)"', blocks[0])
        ext = os.path.splitext(m.group(1))[1]
        os.replace(os.path.join(folder, m.group(1)), os.path.join(folder, "cover" + ext))
        cover, cover_size = "cover" + ext, [int(m.group(2)), int(m.group(3))]
        blocks.pop(0)

    head = ["---", fm("title", title)]
    if subtitle:
        head.append(fm("subtitle", subtitle))
    head.append(fm("date", iso(date)))
    if cover:
        head += [fm("cover", cover), fm("cover_size", cover_size)]
    head += [fm("original", url), fm("original_site", SITE_NAME[kind]), "---", ""]
    text = "\n".join(head) + "\n" + "\n\n".join(blocks).rstrip() + "\n"
    with open(md_path, "w") as f:
        f.write(text)
    with open(stamp, "w") as f:
        f.write(hashlib.sha256(text.encode()).hexdigest() + "\n")
    with open(os.path.join(folder, "source.html"), "w") as f:
        f.write(f"<!-- {url} ({how}) -->\n{record}\n")
    print(f"  {slug}: {len(blocks)} blocks, {conv.count} pictures ({how})")


def node_html(n):
    if isinstance(n, str):
        return html.escape(n, quote=False)
    if n.tag == "#root" or n.tag == "div" and not n.attrs:
        return "".join(node_html(k) for k in n.kids)
    attrs = "".join(f' {k}="{html.escape(v or "")}"' for k, v in n.attrs.items())
    if n.tag in VOID:
        return f"<{n.tag}{attrs}>"
    return f"<{n.tag}{attrs}>" + "".join(node_html(k) for k in n.kids) + f"</{n.tag}>"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="just this slug")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    # links between these posts go to the copies here
    links = {link_key(u): f"https://blog.vandesande.design/{s}" for s, u, _, _ in SOURCES}
    items = feed() if any(k == "medium" for _, _, k, _ in SOURCES) else []
    for slug, url, kind, date in SOURCES:
        if args.only and slug != args.only:
            continue
        try:
            write(slug, url, kind, date, links, items, args.force)
        except Exception as e:
            print(f"  {slug}: FAILED {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
