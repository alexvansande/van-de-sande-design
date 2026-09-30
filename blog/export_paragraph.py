#!/usr/bin/env python3
"""Pull every post of the blog off Paragraph and into folders here.

    python3 blog/export_paragraph.py [--only SLUG]

Each post becomes blog/<slug>/: index.md, the pictures it shows (the cover as
cover.*, the rest 01.*, 02.* … in the order they appear), and paragraph.json,
the post exactly as Paragraph's API handed it over, kept as the record.

The Markdown is written from the post's editor document (the TipTap JSON),
not from Paragraph's own Markdown export, which drops the layout: a picture
floated right at half width, captions and their italics. Pictures are written
as <figure> blocks in the Markdown, which any Markdown reader shows and
build.py lays out the way Paragraph did.

The heading ids come from the live page, so links into a section still land.

Needs Pillow for the pictures' sizes. Run it again and it rewrites the folders
from Paragraph; anything edited here since would be lost, so it refuses to
touch a folder whose index.md is not the one it wrote last, unless --force.
"""
import argparse, hashlib, html, json, os, re, sys, urllib.request
from datetime import datetime, timezone

from PIL import Image

BLOG_ID = "Giq8vAIN94ssfY4Pf62G"          # @avsa on Paragraph
SITE = "https://blog.vandesande.design"
API = f"https://public.api.paragraph.com/api/v1/publications/{BLOG_ID}/posts"
HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "vandesande-blog-export/1"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def all_posts():
    posts, cursor = [], None
    while True:
        url = API + "?includeContent=true&limit=50" + (f"&cursor={cursor}" if cursor else "")
        page = json.loads(get(url))
        posts += page["items"]
        cursor = (page.get("pagination") or {}).get("cursor")
        if not (page.get("pagination") or {}).get("hasMore") or not cursor:
            return posts


# ---------- inline content ----------

MARK_ORDER = {"link": 0, "bold": 1, "italic": 2}
MD_ESC = re.compile(r"([\\`*_\[\]<])")


MATH = re.compile(r"(\$\$.+?\$\$)")


def md_text(s):
    # $$…$$ is TeX, which Paragraph set as inline maths: it goes through as is
    return "".join(part if MATH.fullmatch(part) else MD_ESC.sub(r"\\\1", part)
                   for part in MATH.split(s))


def mark_key(m):
    return (m["type"], (m.get("attrs") or {}).get("href"))


def inline_md(nodes):
    """Text nodes with marks to Markdown, closing and opening marks as they
    change and keeping spaces outside the delimiters, where Markdown needs
    them."""
    out, stack = [], []

    def close_to(n):
        # a delimiter cannot close after a space: move the space past it
        tail = ""
        if out:
            stripped = out[-1].rstrip(" ")
            tail = out[-1][len(stripped):]
            out[-1] = stripped
        while len(stack) > n:
            m = stack.pop()
            out.append({"bold": "**", "italic": "_"}.get(m[0], "](" + (m[1] or "") + ")"))
        out.append(tail)

    for node in nodes:
        t = node["type"]
        if t == "hardBreak":
            out.append("<br>\n")
            continue
        if t != "text":
            raise SystemExit(f"unknown inline node {t}")
        text = node["text"]
        marks = sorted((mark_key(m) for m in node.get("marks") or []), key=lambda k: MARK_ORDER[k[0]])
        for k in marks:
            if k[0] not in MARK_ORDER:
                raise SystemExit(f"unknown mark {k}")
        if not text.strip():
            marks = stack[:]          # a bare space changes nothing
        keep = 0
        while keep < min(len(stack), len(marks)) and stack[keep] == marks[keep]:
            keep += 1
        if keep < len(stack):
            close_to(keep)
        if len(marks) > len(stack):
            lead = text[: len(text) - len(text.lstrip(" "))]
            out.append(lead)
            text = text[len(lead):]
            for m in marks[len(stack):]:
                out.append({"bold": "**", "italic": "_"}.get(m[0], "["))
                stack.append(m)
        out.append(md_text(text))
    close_to(0)
    return "".join(out)


def inline_html(nodes):
    """The same, as HTML, for inside a <figure>: Markdown is not read there."""
    out = []
    for node in nodes or []:
        if node["type"] == "hardBreak":
            out.append("<br>")
            continue
        s = html.escape(node["text"], quote=False)
        for m in sorted(node.get("marks") or [], key=lambda m: -MARK_ORDER[m["type"]]):
            if m["type"] == "bold":
                s = f"<strong>{s}</strong>"
            elif m["type"] == "italic":
                s = f"<em>{s}</em>"
            elif m["type"] == "link":
                s = f'<a href="{html.escape(m["attrs"]["href"])}">{s}</a>'
        out.append(s)
    # adjacent runs of the same tag read better as one
    return re.sub(r"</(em|strong)><\1>", "", "".join(out))


# ---------- blocks ----------

class Post:
    def __init__(self, slug, folder):
        self.slug, self.folder = slug, folder
        self.images = {}          # remote url -> local file name
        self.count = 0
        self.heading_ids = []

    def image(self, url, name=None):
        if url in self.images:
            return self.images[url]
        ext = os.path.splitext(url.split("?")[0])[1].lower() or ".png"
        if name is None:
            self.count += 1
            name = f"{self.count:02d}"
        name += ".jpg" if ext == ".jpeg" else ext
        path = os.path.join(self.folder, name)
        if not os.path.exists(path):
            data = get(url)
            with open(path, "wb") as f:
                f.write(data)
        self.images[url] = name
        return name


def size(path):
    with Image.open(path) as im:
        return im.size


def figure(node, post):
    a = node.get("attrs") or {}
    cls, style = [], []
    if a.get("float") in ("left", "right"):
        cls.append("float-" + a["float"])
    elif a.get("float") not in (None, "none"):
        raise SystemExit(f"unknown float {a}")
    if a.get("width"):
        style.append(f"width:{a['width']}")
    head = "<figure" + (f' class="{" ".join(cls)}"' if cls else "") + (f' style="{";".join(style)}"' if style else "") + ">"
    lines = [head]
    has_image = False
    for c in node.get("content") or []:
        if c["type"] == "image":
            has_image = True
            ia = c["attrs"]
            name = post.image(ia["src"])
            w, h = size(os.path.join(post.folder, name))
            alt = html.escape(ia.get("alt") or "")
            lines.append(f'<img src="{name}" width="{w}" height="{h}" alt="{alt}">')
        elif c["type"] == "figcaption":
            cap = inline_html(c.get("content"))
            if cap.strip():
                lines.append(f"<figcaption>{cap}</figcaption>")
        else:
            raise SystemExit(f"unknown figure child {c['type']}")
    if not has_image:
        lines.insert(1, "<!-- The picture that stood here was already gone on Paragraph: only its caption was left. -->")
        if len(lines) == 2:
            return "<figure></figure>"
    lines.append("</figure>")
    return "\n".join(lines)


def block(node, post, depth=0):
    t = node["type"]
    a = node.get("attrs") or {}
    if t == "paragraph":
        if a.get("textAlign") not in (None, "left"):
            return f'<p style="text-align:{a["textAlign"]}">{inline_html(node.get("content"))}</p>'
        if not node.get("content"):
            return "<p></p>"
        return inline_md(node["content"])
    if t == "heading":
        text = inline_md(node.get("content") or [])
        hid = post.heading_ids.pop(0) if post.heading_ids else None
        return "#" * a.get("level", 2) + " " + text + (f" {{#{hid}}}" if hid else "")
    if t == "figure":
        return figure(node, post)
    if t == "bulletList" or t == "orderedList":
        items = []
        for i, li in enumerate(node.get("content") or []):
            marker = "- " if t == "bulletList" else f"{i + (a.get('start') or 1)}. "
            body = "\n\n".join(block(c, post, depth + 1) for c in li.get("content") or [])
            pad = " " * len(marker)
            items.append(marker + body.replace("\n", "\n" + pad).replace("\n" + pad + "\n", "\n\n"))
        return "\n".join(items)
    if t == "blockquote":
        body = "\n\n".join(block(c, post, depth + 1) for c in node.get("content") or [])
        return "\n".join(("> " + l) if l else ">" for l in body.split("\n"))
    if t == "horizontalRule":
        return "---"
    if t == "youtube":
        vid = a["videoId"]
        return (f'<figure class="youtube">\n<iframe src="https://www.youtube-nocookie.com/embed/{vid}" '
                f'title="YouTube video" loading="lazy" allowfullscreen '
                f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>\n</figure>')
    if t == "image":
        return figure({"type": "figure", "attrs": {}, "content": [node]}, post)
    raise SystemExit(f"unknown block {t}")


def fm(key, value):
    return f"{key}: {json.dumps(value, ensure_ascii=False)}"


def iso(ms):
    return datetime.fromtimestamp(int(ms) / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_post(p, force):
    slug = p["slug"]
    folder = os.path.join(HERE, slug)
    md_path = os.path.join(folder, "index.md")
    stamp_path = os.path.join(folder, ".exported")
    if os.path.exists(md_path) and not force:
        mine = open(stamp_path).read().strip() if os.path.exists(stamp_path) else None
        if mine != hashlib.sha256(open(md_path, "rb").read()).hexdigest():
            print(f"  {slug}: index.md was edited here since the export; left alone (--force to overwrite)")
            return
    os.makedirs(folder, exist_ok=True)
    post = Post(slug, folder)

    page = get(f"{SITE}/{slug}").decode("utf-8", "replace")
    body = page[page.find('id="main-post-body"'):]
    post.heading_ids = re.findall(r'<h[1-6] id="([^"]+)"', body)

    doc = json.loads(p["json"])
    n_head = sum(1 for n in doc["content"] if n["type"] == "heading")
    if len(post.heading_ids) != n_head:
        print(f"  {slug}: {n_head} headings but {len(post.heading_ids)} ids on the page; ids left out")
        post.heading_ids = []

    cover = post.image(p["imageUrl"], "cover") if p.get("imageUrl") else None
    blocks = [block(n, post) for n in doc["content"]]

    head = ["---", fm("title", p["title"])]
    if p.get("subtitle"):
        head.append(fm("subtitle", p["subtitle"].strip()))
    head += [fm("date", iso(p["publishedAt"])), fm("updated", iso(p.get("updatedAt") or p["publishedAt"]))]
    if p.get("categories"):
        head.append(fm("categories", p["categories"]))
    if cover:
        w, h = size(os.path.join(folder, cover))
        head += [fm("cover", cover), fm("cover_size", [w, h])]
    head += [fm("paragraph_id", p["id"]), "---", ""]
    text = "\n".join(head) + "\n" + "\n\n".join(blocks).rstrip() + "\n"

    with open(md_path, "w") as f:
        f.write(text)
    with open(stamp_path, "w") as f:
        f.write(hashlib.sha256(text.encode()).hexdigest() + "\n")
    with open(os.path.join(folder, "paragraph.json"), "w") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"  {slug}: {len(blocks)} blocks, {len(post.images)} pictures")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="just this slug")
    ap.add_argument("--force", action="store_true", help="overwrite posts edited here")
    args = ap.parse_args()
    posts = all_posts()
    print(f"{len(posts)} posts on Paragraph")
    for p in posts:
        if args.only and p["slug"] != args.only:
            continue
        write_post(p, args.force)


if __name__ == "__main__":
    main()
