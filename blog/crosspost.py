#!/usr/bin/env python3
"""The blog on Bluesky: each post as a Standard.site document, and a post
on Bluesky that points to it.

    python3 blog/crosspost.py setup       # once: the blog itself, as a publication
    python3 blog/crosspost.py backfill    # every post already out, as a document
    python3 blog/crosspost.py status SLUG

Standard.site (https://standard.site) is how long writing lives on the AT
Protocol, the network Bluesky is on. The writing stays here, on the blog; the
network holds a record of it: a publication for the blog (one, made by
setup) and a document for each post (title, address, date, the text). Bluesky
shows a link to a post that has one as an essay. The blog proves the records
are its own: /.well-known/site.standard.publication names the publication,
and each post's page names its document in a <link> (build.py writes both).

A document's key is the post's date, as a TID, so the build knows it
without asking anyone, and publishing a post again rewrites the same record.

The account is in the macOS keychain, never in the repo: an app password
(bsky.app → Settings → Privacy and security → App passwords), kept with

    security add-generic-password -s blog-bluesky -a HANDLE -w

which asks for the password. HANDLE is yours, e.g. avsa.bsky.social.
"""
import html, io, json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build  # noqa: E402

KEYCHAIN = "blog-bluesky"
PUBLICATION = os.path.join(HERE, "_well-known", "site.standard.publication")
APPVIEW = "https://public.api.bsky.app"
UA = {"User-Agent": "vandesande-blog/1 (+%s)" % build.SITE_URL}

try:
    from PIL import Image
except ImportError:
    Image = None


class Bad(Exception):
    pass


# ---------------------------------------------------------------- the account

def account():
    """The handle the keychain has for the blog, or None."""
    r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN],
                       capture_output=True, text=True)
    m = re.search(r'"acct"<blob>="([^"]+)"', r.stdout)
    return m.group(1) if r.returncode == 0 and m else None


def password():
    r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN, "-w"],
                       capture_output=True, text=True)
    if r.returncode:
        raise Bad("There is no Bluesky app password in the keychain (see blog/crosspost.py).")
    return r.stdout.strip()


def http(method, url, body=None, token=None, raw=None, ctype=None):
    headers = dict(UA)
    data = None
    if raw is not None:
        data, headers["Content-Type"] = raw, ctype
    elif body is not None:
        data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read())
            msg = err.get("message") or err.get("error")
        except ValueError:
            msg = e.reason
        raise Bad(f"Bluesky said: {msg} ({e.code})") from None
    except urllib.error.URLError as e:
        raise Bad(f"Bluesky could not be reached: {e.reason}") from None


def where(handle):
    """A handle's DID, and the server (PDS) its records are on."""
    return where_did(http("GET", APPVIEW + "/xrpc/com.atproto.identity.resolveHandle?" +
                          urllib.parse.urlencode({"handle": handle}))["did"])


class Session:
    def __init__(self):
        handle = account()
        if not handle:
            raise Bad("No Bluesky account is set up for the blog (see blog/crosspost.py).")
        self.did, self.pds = where(handle)
        s = self.call("com.atproto.server.createSession", {"identifier": handle, "password": password()})
        self.handle, self.token = s["handle"], s["accessJwt"]

    def call(self, nsid, body):
        return http("POST", f"{self.pds}/xrpc/{nsid}", body, getattr(self, "token", None))

    def put(self, collection, rkey, record):
        return self.call("com.atproto.repo.putRecord", {"repo": self.did, "collection": collection,
                                                        "rkey": rkey, "record": record})

    def blob(self, data, ctype):
        return http("POST", f"{self.pds}/xrpc/com.atproto.repo.uploadBlob", raw=data, ctype=ctype,
                    token=self.token)["blob"]


def get_record(at_uri):
    """A record, read from its own server: no account needed. None if there is none."""
    did, collection, rkey = at_uri[len("at://"):].split("/")
    pds = where_did(did)[1]
    try:
        return http("GET", f"{pds}/xrpc/com.atproto.repo.getRecord?" +
                    urllib.parse.urlencode({"repo": did, "collection": collection, "rkey": rkey}))
    except Bad as e:
        if "RecordNotFound" in str(e) or "(400)" in str(e):
            return None
        raise


def where_did(did):
    """The server (PDS) a DID's records are on."""
    doc = http("GET", "https://plc.directory/" + did) if did.startswith("did:plc:") \
        else http("GET", "https://%s/.well-known/did.json" % did.split(":", 2)[2])
    pds = next(s["serviceEndpoint"] for s in doc.get("service", []) if s.get("id", "").endswith("#atproto_pds"))
    return did, pds.rstrip("/")


# ---------------------------------------------------------------- the records

def publication():
    """The blog's publication record, as at://…, or None before setup."""
    if os.path.isfile(PUBLICATION):
        return open(PUBLICATION).read().strip() or None
    return None


def setup():
    s = Session()
    uri = publication()
    rkey = uri.rsplit("/", 1)[1] if uri else build.tid(datetime.now(timezone.utc))
    if uri and not uri.startswith(f"at://{s.did}/"):
        raise Bad(f"The blog's publication belongs to another account: {uri}")
    s.put("site.standard.publication", rkey, {
        "$type": "site.standard.publication",
        "url": build.SITE_URL,
        "name": build.TITLE,
        "description": f"Posts by {build.AUTHOR}.",
    })
    uri = f"at://{s.did}/site.standard.publication/{rkey}"
    os.makedirs(os.path.dirname(PUBLICATION), exist_ok=True)
    with open(PUBLICATION, "w") as f:
        f.write(uri + "\n")
    return uri


def the_post(slug):
    folder = os.path.join(HERE, slug)
    if not os.path.isfile(os.path.join(folder, "index.md")):
        raise Bad(f"{slug} is not on the blog.")
    return build.read_post(folder)


def text_of(md):
    """The post as plain text, paragraph by paragraph, for the record."""
    t = re.sub(r"<figure.*?</figure>|<!--.*?-->", "", md, flags=re.S)
    t = re.sub(r"^\s*!\[[^\]]*\]\([^)]*\)\s*$", "", t, flags=re.M)        # pictures on their own lines
    t = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)                        # links: their words
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\s*\{#[\w-]+\}", "", t)                                  # heading ids
    t = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+", "", t, flags=re.M)
    t = re.sub(r"(\*\*|__|\*|_|`)(?=\S)(.+?)(?<=\S)\1", r"\2", t)
    t = re.sub(r"^\s*(-{3,}|\*{3,})\s*$", "", t, flags=re.M)
    t = html.unescape(t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def picture(p, limit=950_000):
    """The cover, small enough for a record (under 1 MB), as (bytes, type)."""
    if not p.get("cover"):
        return None
    path = os.path.join(p["folder"], p["cover"])
    if not os.path.isfile(path):
        return None
    if Image:
        with Image.open(path) as im:
            im = im.convert("RGB")
            im.thumbnail((1200, 1200))
            for q in (85, 75, 60):
                out = io.BytesIO()
                im.save(out, "JPEG", quality=q, optimize=True)
                if out.tell() <= limit:
                    return out.getvalue(), "image/jpeg"
        return None
    if os.path.getsize(path) <= limit:
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        return open(path, "rb").read(), "image/" + ("jpeg" if ext == "jpg" else ext)
    return None


def document_uri(p, did):
    return f"at://{did}/site.standard.document/{build.tid(p['date_dt'])}"


def document(slug, s=None, cover=None):
    """Write the post's document record (again): the record follows the post."""
    pub = publication()
    if not pub:
        raise Bad("The blog is not set up on Bluesky yet: python3 blog/crosspost.py setup")
    s = s or Session()
    p = the_post(slug)
    uri = document_uri(p, s.did)
    old = (get_record(uri) or {}).get("value") or {}
    rec = {
        "$type": "site.standard.document",
        "site": pub,
        "path": "/" + slug,
        "title": p["title"],
        "publishedAt": build.parse_date(p.get("date")).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "textContent": text_of(p["body_md"]),
    }
    if p.get("updated"):
        rec["updatedAt"] = build.parse_date(p["updated"]).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if p.get("subtitle"):
        rec["description"] = p["subtitle"]
    if p.get("categories"):
        rec["tags"] = [c[:128] for c in p["categories"]]
    cover = cover or picture(p)
    if cover:
        rec["coverImage"] = s.blob(*cover)
    if old.get("bskyPostRef"):
        rec["bskyPostRef"] = old["bskyPostRef"]
    s.put("site.standard.document", uri.rsplit("/", 1)[1], rec)
    return uri, rec


# ---------------------------------------------------------------- the post on Bluesky

def link_of(post_uri, handle):
    return f"https://bsky.app/profile/{handle}/post/{post_uri.rsplit('/', 1)[1]}"


def live(url):
    req = urllib.request.Request(url, method="HEAD", headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError):
        return False


def status(slug):
    """What the editor shows: the account, whether the post is live, and its Bluesky post if it has one."""
    handle = account()
    p = the_post(slug)
    url = f"{build.SITE_URL}/{slug}"
    out = {"account": handle, "url": url, "live": live(url), "posted": None}
    pub = publication()
    if handle and pub:
        did = pub[len("at://"):].split("/")[0]
        try:
            doc = get_record(document_uri(p, did))
        except Bad:
            doc = None
        ref = ((doc or {}).get("value") or {}).get("bskyPostRef")
        if ref:
            out["posted"] = link_of(ref["uri"], handle)
    return out


def facets(text):
    """Links and #tags in what he wrote, so Bluesky makes them clickable."""
    out, b = [], text.encode()
    for m in re.finditer(rb"https?://[^\s<>\"]+[^\s<>\".,;:!?)\]]", b):
        out.append({"index": {"byteStart": m.start(), "byteEnd": m.end()},
                    "features": [{"$type": "app.bsky.richtext.facet#link", "uri": m.group().decode()}]})
    for m in re.finditer(rb"(?:^|\s)(#[^\d\s#][^\s#]*)", b):
        tag = m.group(1).decode().rstrip(".,;:!?")
        start = m.start(1)
        out.append({"index": {"byteStart": start, "byteEnd": start + len(tag.encode())},
                    "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": tag[1:]}]})
    return out


def announce(slug, text):
    """Post to Bluesky: his words, if any, over a card of the post. Then the
    document points back to that post, where the talk about it is."""
    text = (text or "").strip()
    p = the_post(slug)
    url = f"{build.SITE_URL}/{slug}"
    if not live(url):
        raise Bad(f"The post is not live at {url} yet.")
    s = Session()
    cover = picture(p)
    uri, rec = document(slug, s, cover)
    if rec.get("bskyPostRef"):
        raise Bad("It is already on Bluesky: " + link_of(rec["bskyPostRef"]["uri"], s.handle))
    card = {"uri": url, "title": p["title"], "description": p.get("subtitle") or build.plain(rec["textContent"], 200)}
    if rec.get("coverImage"):
        card["thumb"] = rec["coverImage"]
    post = {"$type": "app.bsky.feed.post", "text": text,
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "embed": {"$type": "app.bsky.embed.external", "external": card}}
    if facets(text):
        post["facets"] = facets(text)
    made = s.call("com.atproto.repo.createRecord", {"repo": s.did, "collection": "app.bsky.feed.post",
                                                    "record": post})
    rec["bskyPostRef"] = {"uri": made["uri"], "cid": made["cid"]}
    s.put("site.standard.document", uri.rsplit("/", 1)[1], rec)
    return {"posted": link_of(made["uri"], s.handle)}


# ---------------------------------------------------------------- from the command line

def main():
    args = sys.argv[1:]
    try:
        if args[:1] == ["setup"]:
            print(setup())
        elif args[:1] == ["backfill"]:
            s = Session()
            for name in sorted(os.listdir(HERE)):
                if os.path.isfile(os.path.join(HERE, name, "index.md")):
                    print(document(name, s)[0], name)
        elif args[:1] == ["status"] and len(args) == 2:
            print(json.dumps(status(args[1]), indent=2))
        else:
            print(__doc__)
    except Bad as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
