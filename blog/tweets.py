#!/usr/bin/env python3
"""A tweet, set in a post as a card of its own: its words, its pictures and
who said it when, which links to it.

    python3 blog/tweets.py [SLUG ...]      # every post, or these

Run over posts, it turns each link to a tweet that stands for itself (a bare
link, the address its own words) into the tweet: alone in its paragraph, the
paragraph becomes the card; at the end of one, the link goes from the words
and the card follows the paragraph. A link with words of its own over it
stays a link. It changes nothing else, and a second run finds nothing to do.

The card is written into the post as HTML, as the YouTube videos are:

    <figure class="tweet">
    <blockquote cite="https://x.com/who/status/1">
    <p>What was said, its links on their words.</p>
    <img src="tweet-1.jpg" width="1200" height="800" alt="">
    <footer><a href="https://x.com/who/status/1">Name (@who), 12 June 2020</a></footer>
    </blockquote>
    </figure>

The tweet is asked of the address Twitter's own embeds read
(cdn.syndication.twimg.com), which needs no account, and its pictures are
kept beside the post (tweet-<id>.jpg, tweet-<id>-2.jpg …), so the card does
not go when the tweet does, and the page loads nothing from Twitter. The
editor (editor.py) asks this for a tweet pasted on a line of its own.
"""
import html, json, math, os, re, sys, urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (compatible; vandesande-blog/1)"}
STATUS = re.compile(r"https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/(\w+)/status(?:es)?/(\d+)[^\s)\"]*")


def token(tid):
    """The token the embeds send with the id: (id / 1e15 · π) in base 36,
    without its zeros or its point."""
    x = int(tid) / 1e15 * math.pi
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    whole, frac = int(x), x - int(x)
    s = ""
    while whole:
        s = digits[whole % 36] + s
        whole //= 36
    s = (s or "0") + "."
    for _ in range(12):
        frac *= 36
        s += digits[int(frac)]
        frac -= int(frac)
    return re.sub(r"0+|\.", "", s)


def fetch(tid):
    url = f"https://cdn.syndication.twimg.com/tweet-result?id={tid}&lang=en&token={token(tid)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        body = r.read()
    if not body.strip():
        raise RuntimeError(f"tweet {tid} is gone, or private")
    return json.loads(body)


def words(t):
    """Its text as HTML: its links on what they read as, the one to its own
    pictures gone, line breaks kept."""
    text = t.get("text") or ""
    links = {u["url"]: u for u in (t.get("entities") or {}).get("urls", [])}
    for m in t.get("mediaDetails") or []:
        text = text.replace(m.get("url", ""), "")
    out, last = [], 0
    for m in re.finditer(r"https?://t\.co/\w+", text):
        out.append(html.escape(html.unescape(text[last:m.start()]), quote=False))
        u = links.get(m.group(0))
        href = u["expanded_url"] if u else m.group(0)
        shown = u.get("display_url", href) if u else href
        out.append(f'<a href="{html.escape(href)}">{html.escape(shown)}</a>')
        last = m.end()
    out.append(html.escape(html.unescape(text[last:]), quote=False))
    paras = [p.strip() for p in re.split(r"\n\s*\n", "".join(out).strip()) if p.strip()]
    return "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paras)


def card(tid, folder):
    """The card for a tweet, its pictures saved into the post's folder."""
    t = fetch(tid)
    who, handle = t["user"]["name"], t["user"]["screen_name"]
    link = f"https://x.com/{handle}/status/{tid}"
    pics = []
    for n, m in enumerate(t.get("mediaDetails") or [], 1):
        src = m.get("media_url_https")
        if not src:
            continue
        ext = os.path.splitext(src)[1] or ".jpg"
        name = f"tweet-{tid}{'' if n == 1 else f'-{n}'}{ext}"
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            with urllib.request.urlopen(urllib.request.Request(src + "?name=large", headers=UA), timeout=60) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
        size = m.get("original_info") or {}
        pics.append(f'<img src="{name}" width="{size.get("width", "")}" height="{size.get("height", "")}" alt="">')
    when = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
    foot = f"{who} (@{handle}), {when.day} {when.strftime('%B %Y')}"
    return "\n".join(["<figure class=\"tweet\">", f'<blockquote cite="{link}">', words(t), *pics,
                      f'<footer><a href="{link}">{html.escape(foot)}</a></footer>', "</blockquote>", "</figure>"])


# ---------------------------------------------------------------- posts

BARE = re.compile(r"\[([^\]]*)\]\((" + STATUS.pattern + r")\)")


def is_bare(text, url):
    """A link that reads as its own address: the tweet stands for itself."""
    t = re.sub(r"^https?://(www\.)?", "", text.replace("\\", "")).rstrip("/")
    return t and url.split("://", 1)[-1].removeprefix("www.").startswith(t.split("?")[0].rstrip("…"))


def embed_in(md, folder, problems=None):
    """The post's Markdown with its bare tweet links made cards."""
    head, body = re.match(r"(---\n.*?\n---\n)(.*)", md, re.S).groups()
    blocks = body.split("\n\n")
    out = []
    for b in blocks:
        if b.lstrip().startswith("<"):        # HTML: a card already, a figure, a video
            out.append(b)
            continue
        cards, ids = [], []
        for m in list(BARE.finditer(b)):
            if not is_bare(m.group(1), m.group(2)):
                continue
            if m.group(4) in ids:          # the same tweet again: once is enough
                b = b.replace(m.group(0), "", 1)
                continue
            try:
                cards.append(card(m.group(4), folder))
                ids.append(m.group(4))
            except Exception as e:
                if problems is not None:
                    problems.append(f"{m.group(2)}: {e}")
                continue
            b = b.replace(m.group(0), "", 1)
        if cards:
            # what is left of the paragraph, the line breaks around the link gone
            b = re.sub(r"(\\\n)+$", "", re.sub(r"[ \t]+$", "", b, flags=re.M).rstrip()).rstrip()
            b = re.sub(r"\\+$", "", b).rstrip()      # a line break left with nothing after it
            b = re.sub(r"\\\n(\\\n)+", "\\\n", b)
            if b.strip():
                out.append(b)
            out += cards
        else:
            out.append(b)
    return head + "\n\n".join(out)


def main():
    slugs = sys.argv[1:] or sorted(d for d in os.listdir(HERE)
                                   if not d.startswith(("_", ".")) and os.path.exists(os.path.join(HERE, d, "index.md")))
    for slug in slugs:
        path = os.path.join(HERE, slug, "index.md")
        md = open(path).read()
        problems = []
        new = embed_in(md, os.path.join(HERE, slug), problems)
        if new != md:
            open(path, "w").write(new)
            print(f"  {slug}: {new.count('<figure class=\"tweet\">') - md.count('<figure class=\"tweet\">')} tweets")
        for p in problems:
            print(f"    ! {p}")


if __name__ == "__main__":
    main()
