#!/usr/bin/env python3
"""Bring threads from Twitter into the blog, one folder each.

    python3 blog/import_threads.py [ARCHIVE/data] [--only SLUG] [--force]

The threads are listed in THREADS below, by the id of their first tweet. They
are read from the archive Twitter gives for download (Settings → Your account
→ Download an archive), its data/ folder: tweets.js, note-tweet.js and
tweets_media/. Each becomes blog/<slug>/ like the other posts: index.md, the
pictures and videos at full size (01.*, 02.* …; the one the thread opens with
as cover.*, where THREADS says so), and thread.json, the tweets as the
archive has them, kept as the record. The header says where it first
appeared (`original`, the first tweet, and `original_site`), and the page says
so under the date.

The post is his words and nothing else. Each tweet is a paragraph, its line
breaks kept; its pictures follow it. A t.co link becomes a link to where it
went, the one pointing at the tweet's own pictures goes, and &amp; is &. A
tweet longer than 280 characters is cut short in tweets.js ("…"); the whole
of it is in note-tweet.js, matched by the second it was posted. A YouTube
link is the video, set after the tweet; a link to a tweet that is in a post
here goes to that post. A chain (CHAINS) is tweets that each quote the one
before: one post, in the order they were posted, a rule between them.

Needs Pillow for the pictures' sizes. Like import_posts.py, it will not
overwrite a post edited here since it was written, unless --force.
"""
import argparse, glob, hashlib, html, json, os, re, shutil, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.expanduser("~/Downloads/twitter-2026-10-01-354bc0b4d7bd578f09c8547ef2dcc0570c14c92e651955e7eab572da7e53c99f/data")

# (first tweet, slug here, title, categories, whether its first picture is the
# cover, or "last": a copy of its last picture, which stays where it is too)
# The titles are his own words from the thread.
THREADS = [
    ("1304483988497629184", "a-security-audit-of-mist", "A security audit of Mist", ["Ethereum", "Mist"], False),
    ("990400833664770050", "what-i-want-from-blockchain-games", "What I want from blockchain games", ["Ethereum", "Games"], False),
    ("1564282369120636930", "the-man-in-the-hole", "The Man in the Hole", None, True),
    ("958851787649318913", "thanks-ming", "Thanks Ming", ["Ethereum"], False),
    ("962043101001924609", "so-about-doge-and-ethereum", "So, about doge and ethereum", ["Ethereum"], True),
    ("1650503712559726594", "brazils-digital-real", "Brazil's Digital Real", ["Ethereum"], False),
    ("1008501144887463937", "was-the-hard-fork-worth-it", "Was the hard fork worth it?", ["Ethereum", "Governance"], False),
    ("1490786374248812549", "decentralization-and-governance", "Decentralization and governance", ["ENS", "Governance"], False),
    ("2072053903420461321", "we-built-what-we-thought-the-world-needed", "We built what we thought the world needed", ["Ethereum"], "last"),
    ("1058837812366229505", "ive-been-to-all-devcons", "I’ve been to all devcons", ["Ethereum"], True),
    ("1091337929362952192", "paying-my-whole-team-with-a-single-click", "Paying my whole team with a single click", ["Ethereum"], False),
    ("961252705443418112", "so-about-the-petro", "So, about the Petro", ["Ethereum"], False),
]

# Chains: tweets that each quote the one before, posted days or years apart,
# brought together as one post, a rule between one and the next. Each is
# taken with his replies to it, as a thread. (first tweet, slug, title,
# categories, cover, tweets of the chain left out but followed through)
CHAINS = [
    # the last tweet of the Man in the Hole, which carried the chain on
    ("1271543260088074245", "random-brazil-trivia", "Random Brazil trivia", None, False, {"1564282425815048196"}),
]

TCO = re.compile(r"https?://t\.co/\w+")
MD_ESC = re.compile(r"([\\`_\[\]<])")      # not *: he wrote *any* for emphasis
# what would start a list, a heading or a quote at the head of a line
BLOCK_START = re.compile(r"^(\d+)([.)])|^([-+*#>])")


# ---------------------------------------------------------------- the archive

def load(path):
    """A file of the archive: JavaScript, `window.YTD.x.part0 = [...]`."""
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("=") + 1:])


class Archive:
    def __init__(self, data):
        self.data = data
        self.tweets = {t["tweet"]["id_str"]: t["tweet"] for t in load(os.path.join(data, "tweets.js"))}
        self.me = load(os.path.join(data, "account.js"))[0]["account"]["accountId"]
        notes = os.path.join(data, "note-tweet.js")
        self.notes = {}
        for n in (load(notes) if os.path.exists(notes) else []):
            n = n["noteTweet"]
            self.notes.setdefault(n["createdAt"][:19], []).append(n["core"])
        # his replies to himself, by the tweet they answer
        self.replies = {}
        for t in self.tweets.values():
            if t.get("in_reply_to_user_id_str") == self.me and t.get("in_reply_to_status_id_str"):
                self.replies.setdefault(t["in_reply_to_status_id_str"], []).append(t)

    def thread(self, root):
        """The first tweet, then at each step the earliest of his replies to the one before."""
        out, t = [], self.tweets.get(root)
        while t:
            out.append(t)
            nxt = sorted(self.replies.get(t["id_str"], []), key=lambda r: int(r["id_str"]))
            t = nxt[0] if nxt else None
        return out

    def quotes(self, t):
        """The tweets of his that this one quotes."""
        return [m.group(1) for u in t["entities"].get("urls", [])
                if (m := re.search(r"(?:twitter|x)\.com/\w+/status(?:es)?/(\d+)", u.get("expanded_url") or ""))
                and m.group(1) in self.tweets]

    def chain(self, root, leave_out):
        """Every tweet that quotes the first, or quotes one that does, and so on,
        each with its thread, in the order they were posted."""
        quoted_by = {}
        for t in self.tweets.values():
            for q in self.quotes(t):
                quoted_by.setdefault(q, []).append(t["id_str"])
        found, todo = set(), [root]
        while todo:
            i = todo.pop()
            if i in found:
                continue
            found.add(i)
            todo += quoted_by.get(i, [])
        return [self.thread(i) for i in sorted(found - set(leave_out), key=int)]

    def note(self, t, text):
        """The whole text of a long tweet, which tweets.js cuts short."""
        when = datetime.strptime(t["created_at"], "%a %b %d %H:%M:%S %z %Y").strftime("%Y-%m-%dT%H:%M:%S")
        head = text.rstrip("…").strip()[:60]
        for core in self.notes.get(when, []):
            if core["text"].startswith(head):
                return core
        return None


# ---------------------------------------------------------------- a tweet as Markdown

def md_text(s):
    return MD_ESC.sub(r"\\\1", s)


def show(url):
    """What a link reads as: the address, without https:// and www., nor a long query."""
    s = re.sub(r"^https?://(www\.)?", "", url)
    if len(s) > 60 and "?" in s:
        s = s.split("?")[0]
    return s.rstrip("/")


# tweets that are in a post here, by id: a link to one goes to the post
IN_POSTS = {}


def tidy(url):
    m = re.match(r"https://(?:x|twitter)\.com/\w+/status/(\d+)", url)
    if m and m.group(1) in IN_POSTS:
        return f"https://blog.vandesande.design/{IN_POSTS[m.group(1)]}"
    # x.com adds who shared it (?s=21&t=…); the tweet is the same without
    if m:
        return url.split("?")[0]
    return url


def paragraphs(text, links, problems, tid):
    """His text as Markdown: a blank line a new paragraph, a line break a line break."""
    out = []
    for para in re.split(r"\n\s*\n", text.strip()):
        lines = []
        for line in para.split("\n"):
            line = line.strip()
            if not line:
                continue
            parts, last = [], 0
            for m in TCO.finditer(line):
                parts.append(md_text(line[last:m.start()]))
                href = links.get(m.group(0))
                if href:
                    href = tidy(href)
                    parts.append(f"[{md_text(show(href))}]({href.replace(' ', '%20').replace('(', '%28').replace(')', '%29')})")
                else:
                    problems.append(f"{tid}: {m.group(0)} has nowhere it leads in the archive; left as it is")
                    parts.append(f"[{m.group(0)}]({m.group(0)})")
                last = m.end()
            parts.append(md_text(line[last:]))
            line = "".join(parts)
            # "1) be a good game first" is his numbering, not a Markdown list
            b = BLOCK_START.match(line)
            if b:
                line = (b.group(1) + "\\" + b.group(2) if b.group(1) else "\\" + b.group(3)) + line[b.end():]
            lines.append(line)
        if lines:
            out.append("\\\n".join(lines))
    return out


# ---------------------------------------------------------------- writing

def fm(key, value):
    return f"{key}: {json.dumps(value, ensure_ascii=False)}"


def iso(created_at):
    return datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y").astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def media_file(arc, t, m):
    """The archive's copy of a picture or video: tweets_media/<tweet id>-<name>.<ext>."""
    stem = os.path.splitext(os.path.basename(m["media_url_https"]))[0]
    ext = ".*" if m["type"] == "photo" else ".mp4"      # a photo may be a .png
    found = glob.glob(os.path.join(arc.data, "tweets_media", f"{t['id_str']}-{stem}*{ext}"))
    if not found and m["type"] != "photo":
        # a video's file is named after the video, not its still
        for v in m.get("video_info", {}).get("variants", []):
            name = os.path.basename(v["url"].split("?")[0])
            found += glob.glob(os.path.join(arc.data, "tweets_media", f"{t['id_str']}-{name}"))
    return sorted(found)[0] if found else None


def youtube_id(url):
    m = re.search(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})", url or "")
    return m.group(1) if m else None


def youtube(vid):
    """A YouTube video as the editor writes one, its title asked of YouTube."""
    try:
        q = urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}", safe="")
        with urllib.request.urlopen(f"https://www.youtube.com/oembed?url={q}&format=json", timeout=30) as r:
            title = json.load(r)["title"]
    except Exception:
        title = "YouTube video"
    return (f'<figure class="youtube">\n<iframe src="https://www.youtube-nocookie.com/embed/{vid}" title="{html.escape(title)}" '
            f'loading="lazy" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>\n</figure>')


def write(arc, root, slug, title, categories, use_cover, force, groups=None):
    folder = os.path.join(HERE, slug)
    md_path = os.path.join(folder, "index.md")
    stamp = os.path.join(folder, ".exported")
    if os.path.exists(md_path) and not force:
        mine = open(stamp).read().strip() if os.path.exists(stamp) else None
        if mine != hashlib.sha256(open(md_path, "rb").read()).hexdigest():
            print(f"  {slug}: edited here since it was imported; left alone (--force to overwrite)")
            return
    groups = groups or [arc.thread(root)]
    # a tweet answered in the same post, or the same chain, is told once
    seen, kept = set(), []
    for g in groups:
        g = [t for t in g if t["id_str"] not in seen]
        seen.update(t["id_str"] for t in g)
        if g:
            kept.append(g)
    groups = kept
    tweets = [t for g in groups for t in g]
    if not tweets:
        print(f"  {slug}: FAILED {root} is not in the archive", file=sys.stderr)
        return
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):              # its pictures are copied afresh
        if re.fullmatch(r"(\d\d|cover)\.\w+", f):
            os.remove(os.path.join(folder, f))

    problems, blocks = [], []
    cover = cover_size = None
    n = pictures = videos = 0
    starts = {g[0]["id_str"] for g in groups[1:]}
    for i, t in enumerate(tweets):
        if t["id_str"] in starts:
            blocks.append("---")
        media = t.get("extended_entities", {}).get("media") or t.get("entities", {}).get("media") or []
        links = {u["url"]: u.get("expanded_url") for u in t["entities"].get("urls", [])}
        text = html.unescape(t["full_text"])
        # the link to the tweet's own pictures goes; the pictures follow it
        for m in media:
            text = text.replace(m["url"], "")
        text = text.rstrip()
        # a link at its end to a tweet in this same post (the one a chain
        # quotes) has nowhere else to go; a YouTube link at its end is the video
        videos_here = []
        while True:
            m = re.search(r"\s*(https?://t\.co/\w+)$", text)
            href = links.get(m.group(1)) if m else None
            q = re.search(r"/status(?:es)?/(\d+)", href or "")
            if q and q.group(1) in seen:
                text = text[:m.start()]
            elif youtube_id(href):
                videos_here.insert(0, youtube_id(href))
                text = text[:m.start()]
            else:
                break
        if text.endswith("…"):
            core = arc.note(t, text)
            if core:
                text = core["text"]
                links.update({u["shortUrl"]: u["expandedUrl"] for u in core.get("urls", [])})
            else:
                problems.append(f"{t['id_str']}: cut short (…) and no note-tweet has the rest")
        blocks += paragraphs(text, links, problems, t["id_str"])
        # a YouTube link inside the words stays a link, and the video follows
        for u in t["entities"].get("urls", []):
            v = youtube_id(u.get("expanded_url"))
            if v and v not in videos_here and u["url"] in text:
                videos_here.append(v)
        blocks += [youtube(v) for v in videos_here]
        shown = []        # this tweet's pictures and videos, as (file, figure)
        for m in media:
            src = media_file(arc, t, m)
            if not src:
                problems.append(f"{t['id_str']}: {m['type']} {m['media_url_https']} not in tweets_media/")
                continue
            ext = os.path.splitext(src)[1].lower()
            if m["type"] == "photo":
                w, h = Image.open(src).size
                if use_cover is True and i == 0 and cover is None:
                    cover, cover_size = "cover" + ext, [w, h]
                    shutil.copy2(src, os.path.join(folder, cover))
                    continue
                n += 1
                pictures += 1
                name = f"{n:02d}{ext}"
                shutil.copy2(src, os.path.join(folder, name))
                shown.append((name, f'<figure>\n<img src="{name}" width="{w}" height="{h}" alt="">\n</figure>'))
            else:                              # a GIF is a silent, looping video, as the blog plays them
                n += 1
                videos += 1
                name = f"{n:02d}{ext}"
                shutil.copy2(src, os.path.join(folder, name))
                shown.append((name, f"![]({name})"))
        # several to a tweet are a carousel: picture lines with no blank line between
        if len(shown) > 1:
            blocks.append("\n".join(f"![]({name})" for name, _ in shown))
        else:
            blocks += [fig for _, fig in shown]

    if use_cover == "last" and pictures:
        last = max((f for f in os.listdir(folder) if re.fullmatch(r"\d\d\.(jpe?g|png)", f)), key=lambda f: int(f[:2]))
        cover = "cover" + os.path.splitext(last)[1]
        shutil.copy2(os.path.join(folder, last), os.path.join(folder, cover))
        cover_size = list(Image.open(os.path.join(folder, cover)).size)
    head = ["---", fm("title", title), fm("date", iso(tweets[0]["created_at"]))]
    if categories:
        head.append(fm("categories", categories))
    if cover:
        head += [fm("cover", cover), fm("cover_size", cover_size)]
    head += [fm("original", f"https://x.com/{arc_user(arc)}/status/{root}"), fm("original_site", "Twitter"), "---", ""]
    text = "\n".join(head) + "\n" + "\n\n".join(blocks).rstrip() + "\n"
    with open(md_path, "w") as f:
        f.write(text)
    with open(stamp, "w") as f:
        f.write(hashlib.sha256(text.encode()).hexdigest() + "\n")
    with open(os.path.join(folder, "thread.json"), "w") as f:
        json.dump(tweets, f, ensure_ascii=False, indent=1)
    print(f"  {slug}: {len(tweets)} tweets, {pictures} pictures{' + cover' if cover else ''}, {videos} videos")
    for p in problems:
        print(f"    ! {p}")


def arc_user(arc):
    return load(os.path.join(arc.data, "account.js"))[0]["account"]["username"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("archive", nargs="?", default=ARCHIVE, help="the archive's data/ folder")
    ap.add_argument("--only", help="just this slug")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    arc = Archive(args.archive)
    for root, slug, *_ in THREADS:
        IN_POSTS.update({t["id_str"]: slug for t in arc.thread(root)})
    for root, slug, _, _, _, leave_out in CHAINS:
        IN_POSTS.update({t["id_str"]: slug for g in arc.chain(root, leave_out) for t in g})
    for root, slug, title, categories, use_cover in THREADS:
        if args.only and slug != args.only:
            continue
        try:
            write(arc, root, slug, title, categories, use_cover, args.force)
        except Exception as e:
            print(f"  {slug}: FAILED {e}", file=sys.stderr)
    for root, slug, title, categories, use_cover, leave_out in CHAINS:
        if args.only and slug != args.only:
            continue
        try:
            write(arc, root, slug, title, categories, use_cover, args.force, arc.chain(root, leave_out))
        except Exception as e:
            print(f"  {slug}: FAILED {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
