#!/usr/bin/env python3
"""Write the blog in the browser, on this machine.

    python3 blog/editor.py            # then http://localhost:8767
    python3 blog/editor.py 9000       # on another port

It writes what build.py reads, nothing else: a folder per post with its
index.md and its pictures beside it. While a post is being written it is
index.draft.md, which the build leaves out, so a draft can sit in the folder,
or even be committed, without being on the blog. Publishing makes it
index.md and commits and pushes that one folder, which is what deploys it.

A post that is already out is edited the same way: saving writes
index.draft.md next to its index.md, and the post on the blog stays as it
was until it is published again.

It answers only on this machine (127.0.0.1), and only to its own page.
"""
import html, http.server, json, os, re, select, shutil, socket, struct, subprocess, sys, threading, urllib.parse
from datetime import datetime, timezone
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
EDITOR = os.path.join(HERE, "_editor")
PREVIEW = os.path.join(HERE, "_preview")
TRASH = os.path.join(HERE, "_trash")       # what is thrown away, until the trash is emptied
sys.path.insert(0, HERE)
import build  # noqa: E402  (its TeX, so maths shows here as the blog will set it)
import review  # noqa: E402  (the proofreader: grammar here, facts online)
import crosspost  # noqa: E402  (the post on Bluesky, as a Standard.site document)

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None

SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,120}")
FILE = re.compile(r"[\w][\w.-]{0,120}")
PICTURES = (".jpg", ".jpeg", ".png", ".gif", ".webp")
VIDEOS = (".mp4", ".webm", ".mov", ".m4v")
FIRST = ("title", "subtitle", "date", "updated", "categories", "cover", "cover_size")
BIGGEST = 2400               # a picture wider than this is made this wide: the page never shows more than 2112
FFMPEG = shutil.which("ffmpeg")
converting = set()           # videos whose .webm is still being made


# ---------------------------------------------------------------- the posts on disk

def folder_of(slug):
    if not SLUG.fullmatch(slug or ""):
        raise Bad("not a post's name: %r" % slug)
    return os.path.join(HERE, slug)


class Bad(Exception):
    pass


def front(path):
    """The header of a Markdown file as [(key, value)], in its order, and its body."""
    text = open(path, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return [], text
    pairs = []
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            try:
                v = json.loads(v.strip())
            except ValueError:
                v = v.strip().strip("'\"")
            pairs.append((k.strip(), v))
    return pairs, text[m.end():]


def write_md(path, pairs, body):
    head = "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in pairs if v not in (None, "", []))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\n{head}\n---\n\n{body.strip()}\n")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def posts():
    out = []
    for name in os.listdir(HERE):
        folder = os.path.join(HERE, name)
        if name.startswith((".", "_")) or not SLUG.fullmatch(name) or not os.path.isdir(folder):
            continue
        live, draft = (os.path.isfile(os.path.join(folder, n)) for n in ("index.md", "index.draft.md"))
        if not (live or draft):
            continue
        meta = dict(front(os.path.join(folder, "index.draft.md" if draft else "index.md"))[0])
        out.append({"slug": name, "title": meta.get("title") or "", "subtitle": meta.get("subtitle") or "",
                    "date": meta.get("date") or "", "published": live, "draft": draft,
                    "cover": meta.get("cover") or "", "categories": meta.get("categories") or [],
                    "touched": os.path.getmtime(os.path.join(folder, "index.draft.md" if draft else "index.md"))})
    # drafts first, the latest touched first; then the blog, newest first
    unpublished = [p for p in out if p["draft"]]
    unpublished.sort(key=lambda p: -p["touched"])
    rest = sorted((p for p in out if not p["draft"]), key=lambda p: str(p["date"]), reverse=True)
    return unpublished + rest


def load(slug):
    folder = folder_of(slug)
    live, draft = (os.path.join(folder, n) for n in ("index.md", "index.draft.md"))
    if not (os.path.isfile(live) or os.path.isfile(draft)):
        raise Bad("no post called %s" % slug)
    pairs, body = front(draft if os.path.isfile(draft) else live)
    meta = dict(pairs)
    return {"slug": slug, "published": os.path.isfile(live), "draft": os.path.isfile(draft),
            "title": meta.get("title") or "", "subtitle": meta.get("subtitle") or "",
            "date": meta.get("date") or "", "categories": meta.get("categories") or [],
            "cover": meta.get("cover") or "", "body": body.strip("\n")}


def header(folder, src, post):
    """The header for the post: what the editor says, and whatever else the
    post's header already had (where it first appeared, and so on), kept."""
    pairs = front(src)[0] if os.path.isfile(src) else []
    meta = dict(pairs)
    for k in ("title", "subtitle", "categories", "cover"):
        meta[k] = post.get(k) or None
    meta["title"] = (meta["title"] or "").strip()
    meta["subtitle"] = (meta["subtitle"] or "").strip() or None
    cover = meta.get("cover")
    if cover and not (FILE.fullmatch(cover) and os.path.isfile(os.path.join(folder, cover))):
        cover = meta["cover"] = None
    meta["cover_size"] = list(size_of(os.path.join(folder, cover)) or []) or None if cover else None
    order = [k for k in FIRST] + [k for k, _ in pairs if k not in FIRST]
    return [(k, meta.get(k)) for k in order]


def save(post):
    folder = folder_of(post["slug"])
    os.makedirs(folder, exist_ok=True)
    draft, live = os.path.join(folder, "index.draft.md"), os.path.join(folder, "index.md")
    write_md(draft, header(folder, draft if os.path.isfile(draft) else live, post), post.get("body") or "")
    return {"saved": now()}


def referenced(folder, body, cover):
    used = set(re.findall(r'(?:\]\(|src=")([^)"\s]+)', body))
    if cover:
        used.add(cover)
    for u in list(used):
        stem, ext = os.path.splitext(u)
        if ext.lower() == ".mp4":
            used.add(stem + ".webm")
    return used


def leftovers(folder, body, cover):
    """Files the editor put in the folder that the post no longer uses: a
    picture taken out again, a cover replaced."""
    used = referenced(folder, body, cover)
    return sorted(n for n in os.listdir(folder)
                  if re.fullmatch(r"(\d+|cover)\.\w+", n) and n not in used)


def publish(post):
    slug, new = post["slug"], (post.get("as") or post["slug"]).strip()
    folder = folder_of(slug)
    if not (post.get("title") or "").strip():
        raise Bad("A post needs a title before it can go out.")
    live = os.path.join(folder, "index.md")
    first = not os.path.isfile(live)
    if not first:
        new = slug          # a post that is out keeps its address
    target = folder_of(new)
    if new != slug and os.path.exists(target):
        raise Bad(f"There is already a post at /{new}.")
    if any(v.startswith(os.path.join(folder, "")) for v in converting):
        raise Bad("A video is still being converted. Try again in a moment.")
    save(post)
    draft = os.path.join(folder, "index.draft.md")
    pairs, body = front(draft)
    meta = dict(pairs)
    if first:
        meta["date"] = now()
    else:
        meta["updated"] = now()
    keys = [k for k, _ in pairs] + [k for k in ("date", "updated") if k not in dict(pairs)]
    order = [k for k in FIRST if k in keys] + [k for k in keys if k not in FIRST]
    removed = leftovers(folder, body, meta.get("cover"))
    for n in removed:
        os.remove(os.path.join(folder, n))
    write_md(live, [(k, meta.get(k)) for k in order], body)
    os.remove(draft)
    if new != slug:
        os.rename(folder, target)
    rel = os.path.relpath(target, REPO)
    old = os.path.relpath(folder, REPO)
    out = {"slug": new, "removed": removed, **commit_and_push(rel, old if new != slug else None,
                                                              ("New post: " if first else "Edited: ") + meta["title"])}
    # its record on Bluesky follows it, once the blog is set up there
    if crosspost.account() and crosspost.publication():
        try:
            crosspost.document(new)
        except crosspost.Bad as e:
            out["bluesky"] = str(e)
    return out


# ---------------------------------------------------------------- the trash

def trash(slug):
    """Throwing away moves, it never deletes: a draft never published goes to
    _trash with its pictures; a published post's unpublished changes (its
    index.draft.md) go there alone, and the post is as it is on the blog."""
    folder = folder_of(slug)
    live, draft = (os.path.join(folder, n) for n in ("index.md", "index.draft.md"))
    if os.path.isfile(live) and not os.path.isfile(draft):
        return {"ok": True}
    if not os.path.isdir(folder):
        return {"ok": True}
    name = "%s--%s" % (slug, datetime.now().strftime("%Y%m%d-%H%M%S"))
    dest = os.path.join(TRASH, name)
    os.makedirs(TRASH, exist_ok=True)
    title = dict(front(draft)[0]).get("title", "") if os.path.isfile(draft) else ""
    if os.path.isfile(live):
        os.makedirs(dest)
        shutil.move(draft, os.path.join(dest, "index.draft.md"))
        what = "changes"
    else:
        shutil.move(folder, dest)
        what = "draft"
    with open(os.path.join(dest, "trashed.json"), "w", encoding="utf-8") as f:
        json.dump({"slug": slug, "what": what, "title": title, "at": now()}, f, ensure_ascii=False)
    return {"ok": True, "trashed": name}


def in_trash():
    out = []
    for name in os.listdir(TRASH) if os.path.isdir(TRASH) else []:
        try:
            with open(os.path.join(TRASH, name, "trashed.json"), encoding="utf-8") as f:
                out.append({"name": name, **json.load(f)})
        except (OSError, ValueError):
            continue
    return sorted(out, key=lambda t: t.get("at", ""), reverse=True)


def restore(name):
    if not FILE.fullmatch(name or "") or not os.path.isdir(os.path.join(TRASH, name)):
        raise Bad("That is not in the trash.")
    src = os.path.join(TRASH, name)
    with open(os.path.join(src, "trashed.json"), encoding="utf-8") as f:
        info = json.load(f)
    target = folder_of(info["slug"])
    if info["what"] == "draft":
        if os.path.exists(target):
            raise Bad("There is a post at %s again; it can't come back over it." % info["slug"])
        os.remove(os.path.join(src, "trashed.json"))
        shutil.move(src, target)
    else:
        draft = os.path.join(target, "index.draft.md")
        if not os.path.isdir(target):
            raise Bad("The post %s is not there any more." % info["slug"])
        if os.path.isfile(draft):
            raise Bad("That post has other unpublished changes now: publish or discard them first.")
        shutil.move(os.path.join(src, "index.draft.md"), draft)
        shutil.rmtree(src)
    return {"slug": info["slug"]}


def empty_trash():
    if os.path.isdir(TRASH):
        shutil.rmtree(TRASH)
    return {"ok": True}


def git(*args):
    r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def commit_and_push(rel, old, message):
    paths = [rel]
    if old and git("ls-files", "--", old)[1]:
        paths.append(old)     # a draft that had been committed under its first name
    code, out = git("add", "-A", "--", *paths)
    if code:
        return {"committed": False, "pushed": False, "log": out}
    code, out = git("commit", "-m", message, "--", *paths)
    log = [out]
    if code:
        return {"committed": False, "pushed": False, "log": "\n".join(log)}
    branch = git("rev-parse", "--abbrev-ref", "HEAD")[1]
    code, out = git("push", "-u", "origin", branch)
    log.append(out)
    if code and "rejected" in out:
        # someone (another machine) pushed first: take theirs under this, once
        c2, o2 = git("pull", "--rebase", "--autostash", "origin", branch)
        log.append(o2)
        if not c2:
            code, out = git("push", "-u", "origin", branch)
            log.append(out)
    return {"committed": True, "pushed": code == 0, "branch": branch, "log": "\n".join(log)}


# ---------------------------------------------------------------- pictures and videos

def size_of(path):
    """A picture's width and height, from its header, with or without Pillow."""
    try:
        if Image:
            with Image.open(path) as im:
                return im.size
        with open(path, "rb") as f:
            head = f.read(32)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])
            if head[:6] in (b"GIF87a", b"GIF89a"):
                return struct.unpack("<HH", head[6:10])
            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                kind = head[12:16]
                if kind == b"VP8X":
                    return (int.from_bytes(head[24:27], "little") + 1, int.from_bytes(head[27:30], "little") + 1)
                if kind == b"VP8 ":
                    f.seek(26)
                    w, h = struct.unpack("<HH", f.read(4))
                    return (w & 0x3FFF, h & 0x3FFF)
                if kind == b"VP8L":
                    f.seek(21)
                    b = f.read(4)
                    return (1 + (((b[1] & 0x3F) << 8) | b[0]), 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6)))
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    marker, = struct.unpack(">H", f.read(2))
                    length, = struct.unpack(">H", f.read(2))
                    if marker in (0xFFC0, 0xFFC1, 0xFFC2):
                        h, w = struct.unpack(">xHH", f.read(5))
                        return (w, h)
                    f.seek(length - 2, 1)
    except (OSError, struct.error, ValueError):
        pass
    return None


def take(slug, name, data, cover=False):
    """A file dropped into the editor, saved into the post's folder: the next
    number along (or cover.*), a phone's photo turned the right way up and
    made no bigger than the page can use, a .mov made an .mp4, and a .webm
    made beside every .mp4."""
    folder = folder_of(slug)
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(name)[1].lower().replace(".jpeg", ".jpg")
    if ext not in PICTURES + VIDEOS:
        raise Bad("Only pictures (jpg, png, gif, webp) and videos (mp4, webm, mov) can go in a post.")
    if cover:
        if ext in VIDEOS:
            raise Bad("The featured image has to be a picture.")
        stem = "cover"
        for n in os.listdir(folder):
            if re.fullmatch(r"cover\.\w+", n):
                os.remove(os.path.join(folder, n))
    else:
        taken = [int(m.group(1)) for n in os.listdir(folder) if (m := re.fullmatch(r"(\d+)\.\w+", n))]
        stem = "%02d" % (max(taken, default=0) + 1)
    path = os.path.join(folder, stem + ext)
    with open(path, "wb") as f:
        f.write(data)
    if ext in (".jpg", ".png", ".webp") and Image:
        tidy(path)
    if ext in (".mov", ".m4v"):
        if not FFMPEG:
            os.remove(path)
            raise Bad("A .mov needs ffmpeg to become an .mp4. Install ffmpeg, or export the video as .mp4.")
        mp4 = os.path.join(folder, stem + ".mp4")
        r = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", path, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-crf", "23", "-movflags", "+faststart", "-an", mp4], capture_output=True, text=True)
        os.remove(path)
        if r.returncode:
            raise Bad("ffmpeg could not convert the video: " + r.stderr[-300:])
        path, ext = mp4, ".mp4"
    if ext == ".mp4" and FFMPEG:
        webm = os.path.join(folder, stem + ".webm")
        converting.add(webm)

        def make():
            try:
                subprocess.run([FFMPEG, "-y", "-v", "error", "-i", path, "-c:v", "libvpx-vp9", "-b:v", "0",
                                "-crf", "34", "-row-mt", "1", "-an", webm], capture_output=True)
            finally:
                converting.discard(webm)
        threading.Thread(target=make, daemon=True).start()
    return {"name": stem + ext, "size": size_of(path) if ext in PICTURES else None}


def tidy(path):
    try:
        with Image.open(path) as im:
            fixed = ImageOps.exif_transpose(im)
            turned = fixed is not im
            big = fixed.width > BIGGEST
            if not (turned or big):
                return
            if big:
                fixed = fixed.resize((BIGGEST, round(fixed.height * BIGGEST / fixed.width)), Image.LANCZOS)
            fmt = im.format
        opts = {"quality": 90} if fmt in ("JPEG", "WEBP") else {}
        if fmt == "JPEG" and fixed.mode not in ("RGB", "L"):
            fixed = fixed.convert("RGB")
        fixed.save(path, fmt, **opts)
    except OSError:
        pass


# ---------------------------------------------------------------- maths and videos

def tex(src):
    """TeX as the blog sets it, and the commands in it the blog does not know."""
    mathml = build.tex_to_mathml(src)
    unknown = sorted(set(re.findall(r"<mtext>(\\[A-Za-z]+)</mtext>", mathml)))
    return {"mathml": mathml, "unknown": unknown}


def youtube_title(vid):
    """The video's title, from YouTube, for the page to name it by; none
    without a connection."""
    if not re.fullmatch(r"[\w-]{6,20}", vid or ""):
        raise Bad("not a YouTube video")
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    try:
        with urllib.request.urlopen(url, timeout=4) as r:
            return {"title": json.load(r).get("title", "")}
    except (OSError, ValueError):
        return {"title": ""}


# ---------------------------------------------------------------- his own pages, for the fact check to link to

def own_pages(slug, n=10):
    """The main site and the n newest posts on the blog, not this one: what a
    fact check may suggest linking to."""
    try:
        home = open(os.path.join(REPO, "site", "index.html"), encoding="utf-8").read()
    except OSError:
        home = ""
    home = re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", home, flags=re.S)
    pages = [{"title": "The main site", "url": "https://vandesande.design",
              "about": " ".join(html.unescape(home).split())[:600]}]
    for p in [p for p in posts() if p["published"] and p["slug"] != slug][:n]:
        body = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", load(p["slug"])["body"])
        body = re.sub(r"<[^>]+>|[#*_>`$]", "", body)
        about = (p["subtitle"] + " " if p["subtitle"] else "") + " ".join(body.split())[:300]
        pages.append({"title": p["title"], "url": f"{build.SITE_URL}/{p['slug']}", "about": about})
    return pages


# ---------------------------------------------------------------- preview

building = threading.Lock()


def preview():
    with building:
        r = subprocess.run([sys.executable, os.path.join(HERE, "build.py"), "--drafts", "--quick", "--out", PREVIEW,
                            "--base", "/preview/", "--home", "/preview/"], capture_output=True, text=True)
    if r.returncode:
        raise Bad("The build failed:\n" + r.stderr[-1500:])
    return {"ok": True}


# ---------------------------------------------------------------- the server

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=EDITOR, **k)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or "") and not self.path.startswith("/api/posts"):
            sys.stderr.write("  %s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        path = urllib.parse.unquote(path.split("?")[0].split("#")[0])
        # a post's own pictures, as the editor shows them
        m = re.fullmatch(r"/posts/([^/]+)/([^/]+)", path)
        if m and SLUG.fullmatch(m.group(1)) and FILE.fullmatch(m.group(2)):
            return os.path.join(HERE, m.group(1), m.group(2))
        # the blog's own stylesheet and faces, so a post looks as it will
        m = re.fullmatch(r"/assets/([\w./-]+)", path)
        if m and ".." not in m.group(1):
            return os.path.join(HERE, "_assets", m.group(1))
        if path.startswith("/preview/"):
            real = os.path.join(PREVIEW, path[len("/preview/"):].lstrip("/"))
            if ".." in path:
                return os.path.join(PREVIEW, "404")
            if os.path.isdir(real):
                real = os.path.join(real, "index.html")
            if not os.path.exists(real) and os.path.exists(real + ".html"):
                real += ".html"
            return real
        return super().translate_path(path)

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def gone(self):
        """Whether the page that asked has closed its connection (reloaded, or
        gone to another post): a request waiting for the model is then dropped."""
        try:
            ready = select.select([self.connection], [], [], 0)[0]
            return bool(ready) and self.connection.recv(1, socket.MSG_PEEK) == b""
        except OSError:
            return True

    def ours(self):
        # only this page may change things: not some other site the browser has open
        origin = self.headers.get("Origin") or self.headers.get("Referer") or ""
        host = self.headers.get("Host") or ""
        return urllib.parse.urlsplit(origin).netloc == host and host.split(":")[0] in ("localhost", "127.0.0.1")

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        try:
            if url.path == "/api/posts":
                cats = sorted({c for p in posts() if p["published"] for c in p["categories"]})
                return self.reply(200, {"posts": posts(), "categories": cats, "pillow": bool(Image),
                                        "ffmpeg": bool(FFMPEG)})
            if url.path == "/api/post":
                return self.reply(200, load(q.get("slug", "")))
            if url.path == "/api/tex":
                return self.reply(200, tex(q.get("tex", "")))
            if url.path == "/api/youtube":
                return self.reply(200, youtube_title(q.get("id", "")))
            if url.path == "/api/review":
                data = review.sidecar(folder_of(q.get("slug", "")))
                return self.reply(200, {"dismissed": data["dismissed"], "facts": data.get("facts")})
            if url.path == "/api/bluesky":
                folder_of(q.get("slug", ""))
                return self.reply(200, crosspost.status(q["slug"]))
            if url.path == "/api/trash":
                return self.reply(200, {"items": in_trash()})
            if url.path == "/api/leftovers":
                folder = folder_of(q.get("slug", ""))
                p = load(q["slug"])
                return self.reply(200, {"files": leftovers(folder, p["body"], p["cover"]) if os.path.isdir(folder) else []})
        except (Bad, crosspost.Bad) as e:
            return self.reply(400, {"error": str(e)})
        if url.path.startswith("/api/"):
            return self.reply(404, {"error": "no such thing"})
        return super().do_GET()

    def do_POST(self):
        if not self.ours():
            return self.reply(403, {"error": "only the editor's own page can do that"})
        url = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        n = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(n)
        try:
            if url.path == "/api/upload":
                return self.reply(200, take(q.get("slug", ""), q.get("name", ""), data, q.get("cover") == "1"))
            post = json.loads(data or b"{}")
            if url.path == "/api/save":
                return self.reply(200, save(post))
            if url.path == "/api/publish":
                return self.reply(200, publish(post))
            if url.path == "/api/preview":
                save(post)
                return self.reply(200, preview())
            if url.path == "/api/review":
                slug = post.get("slug", "")
                return self.reply(200, review.review(folder_of(slug), post.get("kind"), post.get("blocks") or [],
                                                     self.gone, own_pages(slug)))
            if url.path == "/api/review/comment":
                return self.reply(200, review.comment(folder_of(post.get("slug", "")), post["issue"], post.get("comment"),
                                                      str(post.get("paragraph") or "")))
            if url.path == "/api/review/dismiss":
                return self.reply(200, review.dismiss(folder_of(post.get("slug", "")), post["issue"]))
            if url.path == "/api/bluesky":
                folder_of(post.get("slug", ""))
                return self.reply(200, crosspost.announce(post["slug"], post.get("text")))
            if url.path == "/api/discard":
                return self.reply(200, trash(post.get("slug", "")))
            if url.path == "/api/trash/restore":
                return self.reply(200, restore(post.get("name", "")))
            if url.path == "/api/trash/empty":
                return self.reply(200, empty_trash())
        except (Bad, crosspost.Bad) as e:
            return self.reply(400, {"error": str(e)})
        except review.Gone:
            return None             # no one is there to answer
        except review.Unavailable as e:
            return self.reply(503, {"error": str(e)})
        except (ValueError, KeyError) as e:
            return self.reply(400, {"error": "bad request: %s" % e})
        return self.reply(404, {"error": "no such thing"})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    if Image is None:
        print("Pillow is not installed: photos are kept as they come, so a phone's photo may show "
              "sideways on the blog (pip install pillow)", file=sys.stderr)
    if not FFMPEG:
        print("ffmpeg is not installed: videos must be .mp4, and no .webm is made beside them", file=sys.stderr)
    print(f"the editor is on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
