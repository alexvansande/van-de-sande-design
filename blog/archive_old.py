#!/usr/bin/env python3
"""Keep a copy of the older writing, from the Wayback Machine and Flickr.

    python3 blog/archive_old.py [COLLECTION ...] [--force]

Everything here goes to blog/_archive/<collection>/<slug>/, in the same form
as a post (index.md, its pictures, source.html), but the build leaves
anything under a folder starting with _ alone: this is the record, not the
blog. To publish one, move its folder up into blog/.

The collections:

  posterous       "my life is not very interesting", the Posterous blog, 2008–2012
  monks           "Computer for Monks", the thesis blog on wanderingabout.com, 2006
  wanderingabout  the 2007 portfolio on wanderingabout.com, and Laser Chess's own site
  paris           the Paris diary on wanderingabout.com/paris, 2005–2006 (Portuguese)
  olpcnews        the article on OLPC News, 2007
  flickr          the two essays written as Flickr captions, 2005

The Wayback Machine answers slowly and turns away anyone in a hurry, so every
request waits its turn and every answer is kept in blog/_archive/.cache
(not in git), so a second run does not ask again.
"""
import argparse, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_posts as ip          # the HTML-to-Markdown converter
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "_archive")
CACHE = os.path.join(OUT, ".cache")
UA = {"User-Agent": "Mozilla/5.0 (compatible; vandesande-archive/1)"}
_last = [0.0]


# ---------------------------------------------------------------- fetching, slowly

def get(url, tries=8, gap=4):
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(key):
        data = open(key, "rb").read()
        if data == b"404":
            raise FileNotFoundError(url)
        return data
    slow = "archive.org" in url
    for n in range(tries):
        if slow:
            wait = gap - (time.time() - _last[0])
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            with open(key, "wb") as f:
                f.write(data)
            return data
        except urllib.error.HTTPError as e:
            if e.code in (404, 410, 403) and not (slow and e.code == 403):
                with open(key, "wb") as f:
                    f.write(b"404")
                raise FileNotFoundError(url)
            time.sleep(20 * (n + 1) if e.code in (429, 503, 504, 403) else 5)
        except Exception:
            time.sleep(15 * (n + 1))
    raise RuntimeError("gave up on " + url)


def wayback(url, when="2010"):
    return get(f"https://web.archive.org/web/{when}id_/{url}")


def cdx(query):
    rows = get("https://web.archive.org/cdx/search/cdx?" + query).decode("utf-8", "replace")
    return [l.split() for l in rows.splitlines() if l.strip()]


def text(data):
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", "replace")


# ---------------------------------------------------------------- a post, written

class Conv(ip.Convert):
    """The converter, fetching pictures live where they still are, and from the
    archive's copy where they are not."""

    def __init__(self, folder, when, **kw):
        super().__init__(folder, {}, **kw)
        self.when = when

    def picture(self, url):
        url = urllib.parse.urljoin(self.base, html.unescape(url))
        m = re.match(r"https?://web\.archive\.org/web/\d+(?:\w+_)?/(.+)", url)
        if m:
            url = m.group(1)
        if url in self.images:
            return self.images[url]
        data = None
        url = urllib.parse.quote(url, safe=":/?&=%#~+,;@!$'()*")
        for u in (url, f"https://web.archive.org/web/{self.when}im_/{url}"):
            try:
                data = get(u, tries=3)
                if data[:1] == b"<":       # an HTML page, not a picture
                    data = None
                    continue
                break
            except Exception:
                data = None
        if data is None:
            raise RuntimeError("no copy of " + url)
        self.count += 1
        name = f"{self.count:02d}{ip.sniff(data)}"
        path = os.path.join(self.folder, name)
        with open(path, "wb") as f:
            f.write(data)
        with Image.open(path) as im:
            size = im.size
        self.images[url] = (name, size)
        return name, size


    def block(self, n):
        # a picture floated beside the text with a line under it, as blogs of
        # the time did it by hand: a figure, with that line as its caption
        if n.tag == "div" and "float" in (n.attrs.get("style") or ""):
            img = n.find(lambda x: x.tag == "img")
            if img is not None:
                cap = ip.Node("figcaption")
                cap.kids = [k for k in n.kids if isinstance(k, str) or (k.tag != "a" and k.find(lambda x: x.tag == "img") is None and k.tag not in ("img", "br"))]
                fig = self.figure(img, cap if cap.text().strip() else None)
                side = "right" if "right" in n.attrs["style"] else "left"
                return fig.replace("<figure>", f'<figure class="float-{side}" style="width:50%">', 1) if fig else None
        return super().block(n)


def node_with(page, cls, tag="div"):
    """The first element with this class, as the converter's tree."""
    root = ip.parse(page)
    return root.find(lambda n: n.tag == tag and cls in (n.attrs.get("class") or "").split())


def slugify(s):
    s = s.lower()
    s = re.sub(r"[àáâãä]", "a", s); s = re.sub(r"[èéêë]", "e", s); s = re.sub(r"[ìíîï]", "i", s)
    s = re.sub(r"[òóôõö]", "o", s); s = re.sub(r"[ùúûü]", "u", s); s = s.replace("ç", "c")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:70] or "post"


def write_post(collection, slug, title, date, body_html, original, site, when, lang=None,
               extra=None, force=False, heading_shift=1, node=None, record=None):
    folder = os.path.join(OUT, collection, slug)
    md_path = os.path.join(folder, "index.md")
    if os.path.exists(md_path) and not force:
        return "kept"
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):
        if re.fullmatch(r"(\d\d|cover)\.\w+", f):
            os.remove(os.path.join(folder, f))
    conv = Conv(folder, when, heading_shift=heading_shift, base_url=original)
    tree = node if node is not None else ip.parse(body_html)
    blocks = [b for b in conv.blocks(tree) if b and b.strip()]
    def plain(b):     # a block as words: no marks, no link addresses
        b = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", b)
        return re.sub(r"[#*_\\]", "", b).strip().lower()
    while blocks and plain(blocks[0]) == title.strip().lower():
        blocks.pop(0)
    # and the date the page printed under it, which the header now carries
    while blocks and re.fullmatch(r"(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}, \d{4}", plain(blocks[0])):
        blocks.pop(0)
    head = ["---", ip.fm("title", title)]
    if date:
        head.append(ip.fm("date", date))
    if lang:
        head.append(ip.fm("lang", lang))
    head += [ip.fm("original", original), ip.fm("original_site", site)]
    for k, v in (extra or {}).items():
        head.append(ip.fm(k, v))
    head += ["---", ""]
    with open(md_path, "w") as f:
        f.write("\n".join(head) + "\n" + "\n\n".join(blocks).rstrip() + "\n")
    with open(os.path.join(folder, "source.html"), "w") as f:
        f.write(f"<!-- {original} (archived {when}) -->\n{record if record is not None else body_html}\n")
    return f"{len(blocks)} blocks, {conv.count} pictures"


def say(collection, slug, how):
    print(f"  {collection}/{slug}: {how}", flush=True)


def when_of(ts):
    return f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T12:00:00Z"


# ---------------------------------------------------------------- the collections

POSTEROUS = "mylifeisnotveryinteresting.posterous.com"
NOT_POSTS = {"page", "tag", "archive", "rss", "private", "search", "login", "main", "posts", "fonts", "jwplayer",
             "p", "images", "stylesheets", "javascripts", "profile", "subscribe", "unsubscribe"}
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def posterous(force):
    rows = cdx(f"url={POSTEROUS}&matchType=prefix&output=txt&fl=timestamp,original,statuscode,mimetype&collapse=urlkey&limit=5000")
    first = {}
    for ts, orig, code, mime in (r for r in rows if len(r) == 4):
        path = re.sub(r"^https?://[^/]+(:80)?", "", orig)
        if code != "200" or "html" not in mime or not re.fullmatch(r"/[a-z0-9][a-z0-9-]+", path) or path[1:] in NOT_POSTS:
            continue
        first[path[1:]] = min(first.get(path[1:], ts), ts)
    seen_titles = {}
    for slug, ts in sorted(first.items(), key=lambda x: x[1]):
        url = f"http://{POSTEROUS}/{slug}"
        try:
            page = text(get(f"https://web.archive.org/web/{ts}id_/{url}"))
        except Exception as e:
            say("posterous", slug, f"FAILED {e}")
            continue
        # two themes: until 2010 the post is div#post_body under a full date;
        # after, div.bodytext under a date with no year
        old = 'id="post_body"' in page
        if not old and 'class="bodytext"' not in page:
            say("posterous", slug, "no post on the page")
            continue
        body = page
        t = re.search(r'<meta property="og:title" content="([^"]*)"', page) or \
            re.search(r'<h2 class="posttitle"[^>]*>\s*(?:<a [^>]*>)?(.*?)(?:</a>)?\s*</h2>', page, re.S)
        title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t.group(1)))).strip() if t else slug.replace("-", " ")
        if title.lower() in seen_titles:          # posted twice
            say("posterous", slug, f"same as {seen_titles[title.lower()]}")
            continue
        seen_titles[title.lower()] = slug
        # the date shows as "Mar 5": the year is the archive's, or the one before
        d = re.search(r'class="date"><a [^>]*>(\w{3}) (\d{1,2})</a>', page)
        full = re.search(r'<div class="date">\s*(\w+ \d{1,2}, \d{4})', page)
        date = None
        if full:
            date = datetime.strptime(full.group(1), "%B %d, %Y").strftime("%Y-%m-%dT12:00:00Z")
        elif d and d.group(1).lower() in MONTHS:
            mo, dy = MONTHS[d.group(1).lower()], int(d.group(2))
            y = int(ts[:4])
            if (mo, dy) > (int(ts[4:6]), int(ts[6:8])):
                y -= 1
            date = f"{y}-{mo:02d}-{dy:02d}T12:00:00Z"
        # a gallery lists its pictures in full size in its data: one figure each
        def gallery(g):
            try:
                files = json.loads(urllib.parse.unquote(g.group(1)))
            except ValueError:
                return g.group(0)
            return "".join(f'<figure><img src="{html.escape(f.get("original") or f.get("large") or f.get("main"))}" alt=""></figure>'
                           for f in files)
        body = re.sub(r"<div class='posterousGalleryMainDiv[^']*' data-posterous-file-list='([^']*)'.*?</div>", gallery, body, flags=re.S)
        body = re.sub(r"<div class=['\"]p_embed_description['\"].*?</div>", "", body, flags=re.S)
        root = ip.parse(body)
        node = root.find(lambda n: n.attrs.get("id") == "post_body") if old else node_with(body, "bodytext")
        if node is not None:          # the title is in the header already
            for h in list(node.find_all(lambda n: n.tag == "h2")):
                if h.text().strip() == title:
                    h.parent.kids.remove(h)
        how = write_post("posterous", slug, title, date, "", url, "Posterous", ts, force=force, node=node,
                         record=ip.node_html(node) if node is not None else "",
                         extra={"date_approximate": "year inferred from when it was archived"} if date and not full else None)
        say("posterous", slug, how)


def monks(force):
    url = "http://wanderingabout.com:80/computersformonks/2006/08/lang-pref/pt/"
    page = text(get(f"https://web.archive.org/web/20080530062518id_/{url}"))
    # WordPress: each post a div with its title, date and entry
    posts = re.findall(r'<div class="post[^"]*" id="post-(\d+)">(.*?)(?=<div class="post[^"]*" id="post-|<div class="navigation|<div id="sidebar|$)', page, re.S)
    for pid, chunk in posts:
        t = re.search(r"<h[123][^>]*>\s*<a [^>]*>(.*?)</a>", chunk, re.S)
        title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t.group(1)))).strip() if t else f"post {pid}"
        d = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})", chunk)
        date = datetime.strptime(" ".join(d.groups()), "%B %d %Y").strftime("%Y-%m-%dT12:00:00Z") if d else None
        node = node_with(chunk, "storycontent") or node_with(chunk, "entry")
        link = re.search(r'<h1>\s*<a href="([^"]+)"', chunk)
        slug = slugify(title)
        how = write_post("monks", slug, title, date, "", link.group(1) if link else "http://wanderingabout.com/computersformonks/",
                         "wanderingabout.com/computersformonks", "20080530", lang="pt", force=force, node=node,
                         record=ip.node_html(node) if node is not None else "")
        say("monks", slug, how)


PORTFOLIO = ["games/laser-chess", "games/the-wall-maze", "interaction-design/mind-the-pad", "interaction-design/radio-jaba",
             "visualizing-information/alchemy-of-juices", "visualizing-information/diagram-infographs-etc",
             "animation-video/animated-self-portrait", "animation-video/how-to-sell-computers-to-orthodox-monks",
             "animation-video/le-button", "animation-video/live-video-effects-programming", "animation-video/melange",
             "animation-video/muvuca", "animation-video/portfolio-reel-2007", "animation-video/video-poetry", "my-life"]


def wanderingabout(force):
    for p in PORTFOLIO:
        url = f"http://wanderingabout.com/_/{p}/"
        try:
            page = text(wayback(url, "2007"))
        except Exception as e:
            say("wanderingabout", p, f"FAILED {e}")
            continue
        t = re.search(r'<h2[^>]*>\s*(?:<a [^>]*>)?(.*?)(?:</a>)?\s*</h2>', page, re.S)
        title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t.group(1)))).strip() if t else p.split("/")[-1]
        d = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})", page)
        date = datetime.strptime(" ".join(d.groups()), "%B %d %Y").strftime("%Y-%m-%dT12:00:00Z") if d else None
        node = None
        for cls in ("entry", "entrytext", "post-content", "storycontent", "post"):
            node = node_with(page, cls)
            if node is not None:
                break
        slug = p.split("/")[-1]
        how = write_post("wanderingabout", slug, title, date, "", url, "wanderingabout.com", "2007", node=node,
                         record=ip.node_html(node) if node is not None else page,
                         extra={"category": p.split("/")[0]} if "/" in p else None, force=force)
        say("wanderingabout", slug, how)
    # Laser Chess's own pages, 2005
    # these carry no date: they are given the day the archive first saw them,
    # and marked as a guess
    for name, url, title, seen in (("laser-chess-2005", "http://www.wanderingabout.com/thingswithlaser/index.php", "The Laser Chess Game", "2005-05-18"),
                                   ("laser-chess-faq", "http://www.wanderingabout.com/thingswithlaser/faq.php", "The Laser Chess – FAQ", "2006-10-31")):
        page = text(wayback(url, "2006"))
        b = re.search(r"<body[^>]*>(.*)</body>", page, re.S)
        how = write_post("wanderingabout", name, title, seen + "T12:00:00Z", b.group(1) if b else page, url, "wanderingabout.com", "2006",
                         extra={"date_circa": "no later than this: first seen by the Wayback Machine"}, force=force)
        say("wanderingabout", name, how)


def paris(force):
    months = ["2005_08", "2005_09", "2005_10", "2005_11", "2005_12", "2006_01", "2006_02", "2006_03"]
    for m in months:
        url = f"http://wanderingabout.com/paris/{m}_01_archive.html"
        try:
            page = text(wayback(url, "2007"))
        except Exception as e:
            say("paris", m, f"FAILED {e}")
            continue
        # Blogger: a date header, then posts with a title and a body
        day = None
        for part in re.split(r'(<h2 class="date-header">.*?</h2>)', page, flags=re.S):
            dh = re.match(r'<h2 class="date-header">(.*?)</h2>', part, re.S)
            if dh:
                day = re.sub(r"<[^>]+>", "", dh.group(1)).strip()
                continue
            for post in re.findall(r'<div class="post[^"]*"[^>]*>(.*?)<p class="post-footer', part, re.S):
                t = re.search(r'<h3 class="post-title">(.*?)</h3>', post, re.S)
                title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t.group(1)))).strip() if t else ""
                bm = re.search(r'<div class="post-body">(.*)', post, re.S)
                body = bm.group(1) if bm else post
                link = re.search(r'href="(http://wanderingabout\.com/paris/\d{4}/\d\d/[^"]+\.html)"', post)
                orig = link.group(1) if link else url
                slug = orig.rstrip("/").split("/")[-1].replace(".html", "") if link else slugify(title)
                date = parse_pt_date(day)
                how = write_post("paris", f"{m[:7].replace('_', '-')}-{slug}", title or slug, date, body, orig,
                                 "wanderingabout.com/paris", "2007", lang="pt", force=force)
                say("paris", slug, how)


PT_MONTHS = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
             "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}


def parse_pt_date(s):
    if not s:
        return None
    m = re.search(r"(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})", s.lower())
    if m and m.group(2) in PT_MONTHS:
        return f"{m.group(3)}-{PT_MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}T12:00:00Z"
    for fmt in ("%A, %B %d, %Y", "%B %d, %Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%dT12:00:00Z")
        except ValueError:
            pass
    return None


def olpcnews(force):
    url = "http://www.olpcnews.com/countries/brazil/david_cavallo_olpc_brazil.html"
    page = text(wayback(url, "2008"))
    node = node_with(page, "entry-content")
    for junk in list(node.find_all(lambda n: n.tag == "p" and "entry-footer" in (n.attrs.get("class") or ""))):
        junk.parent.kids.remove(junk)
    how = write_post("olpcnews", "david-cavallo-interview-on-olpc-brazils-apparent-loss",
                     "David Cavallo Interview on OLPC Brazil's Apparent Loss", "2007-12-21T19:40:56Z", "",
                     url, "OLPC News", "2008", force=force, node=node, record=ip.node_html(node))
    say("olpcnews", "david-cavallo", how)


FLICKR = [("38981234", "ipod-video"), ("38981085", "iphone")]


def flickr(force):
    for pid, slug in FLICKR:
        url = f"https://www.flickr.com/photos/avsa/{pid}/"
        page = text(get(url))
        t = re.search(r'<meta property="og:title" content="([^"]*)"', page)
        img = re.search(r'<meta property="og:image" content="([^"]*)"', page)
        dt = re.search(r'"datePosted":"?(\d+)', page)
        desc = re.search(r'<meta name="description" content="([^"]*)"', page)
        d = html.unescape(desc.group(1)) if desc else ""
        paras = "".join(f"<p>{html.escape(p.strip())}</p>" for p in re.split(r"\n\s*\n|\n", d) if p.strip())
        body = (f'<figure><img src="{img.group(1)}" alt=""></figure>' if img else "") + paras
        date = datetime.fromtimestamp(int(dt.group(1)), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None
        how = write_post("flickr", slug, html.unescape(t.group(1)) if t else slug, date, body, url, "Flickr", "live", force=force)
        say("flickr", slug, how)


COLLECTIONS = {"posterous": posterous, "monks": monks, "wanderingabout": wanderingabout, "paris": paris,
               "olpcnews": olpcnews, "flickr": flickr}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("collections", nargs="*", default=list(COLLECTIONS))
    ap.add_argument("--force", action="store_true", help="write again what is already there")
    args = ap.parse_args()
    for c in args.collections:
        print(c, flush=True)
        try:
            COLLECTIONS[c](args.force)
        except Exception as e:
            print(f"  {c}: FAILED {e}", flush=True)


if __name__ == "__main__":
    main()
