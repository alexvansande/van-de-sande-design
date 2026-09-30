#!/usr/bin/env python3
"""List what the archived pages showed that could not be found: pictures,
Flash and videos they pointed to that neither the live web nor the Wayback
Machine still had. Writes blog/_archive/MISSING.md, which the build shows at
/archive/missing. Run it from the top of the repository after archive_old.py.
"""
import os, re, sys, glob, hashlib, html, urllib.parse
sys.path.insert(0, "blog")
import archive_old as a
def cached_ok(u):
    k = os.path.join(a.CACHE, hashlib.sha1(u.encode()).hexdigest())
    if not os.path.exists(k): return None
    d = open(k, "rb").read(16)
    return d != b"404" and not d.startswith(b"<")
out = ["# What the old pages showed that was not found", "",
       "Pictures and media the original pages pointed to, which neither the live",
       "web nor the Wayback Machine still had when `archive_old.py` looked.",
       "Found one? Put it in the post's folder and point the post at it.", ""]
total = 0
folders = sorted(glob.glob("blog/*/source.html") + glob.glob("blog/_archive/*/*/source.html"))
for src in folders:
    folder = os.path.dirname(src)
    h = open(src, errors="ignore").read()
    m = re.match(r"<!-- (\S+)", h); base = m.group(1) if m else ""
    if "paragraph.json" in os.listdir(folder) or "(archived " not in h[:400]: continue
    miss = []
    for u in re.findall(r'<img[^>]+src="([^"]+)"', h):
        u = urllib.parse.urljoin(base, html.unescape(u))
        if re.search(r"(spacer|pixel|/_/stat|emoji|flags/|\.thumb|thumb100)", u) or u.startswith("data:"): continue
        q = urllib.parse.quote(u, safe=":/?&=%#~+,;@!$'()*")
        ok = [cached_ok(x) for x in (q, u) + tuple(f"https://web.archive.org/web/{w}im_/{q}" for w in ("2007","2006","2008","2010","20080530","2009","2011","2012"))]
        if True in ok: continue
        miss.append(("picture", u))
    for u in re.findall(r'(?:<embed[^>]+src|<param[^>]+value|<object[^>]+data)="([^"]+\.(?:swf|mov|flv|mp4|mp3)[^"]*)"', h, re.I):
        miss.append(("flash or video" if ".swf" in u.lower() else "media", urllib.parse.urljoin(base, html.unescape(u))))
    for u in re.findall(r'href="([^"]+\.(?:mov|swf|zip|mp3|flv))"', h, re.I):
        miss.append(("download", urllib.parse.urljoin(base, html.unescape(u))))
    # pictures found elsewhere since (Posterous's, from Flickr) make up for as many
    have = open(os.path.join(folder, "index.md")).read().count("<img")
    shown = len([u for u in re.findall(r'<img[^>]+src="([^"]+)"', h) if not re.search(r"(spacer|pixel|/_/stat|emoji|flags/|\.thumb|thumb100)", u)])
    if have >= shown:
        miss = [m for m in miss if m[0] != "picture"]
    if not miss: continue
    title = re.search(r'^title: "(.*)"', open(os.path.join(folder, "index.md")).read(), re.M)
    where = "on the blog" if "/_archive/" not in folder else "archive: " + folder.split("/")[2]
    out += [f"## {title.group(1) if title else folder}", f"`{folder}` · {where} · from {base}", ""]
    seen = set()
    for kind, u in miss:
        if u in seen: continue
        seen.add(u); total += 1
        out.append(f"- {kind}: `{urllib.parse.unquote(u.rsplit('/', 1)[-1])[:80]}` — {u}")
    out.append("")
out.insert(6, f"{total} things, in {sum(1 for l in out if l.startswith('## '))} posts. Videos now on YouTube are embedded already.\n")
open("blog/_archive/MISSING.md", "w").write("\n".join(out))
print(total)
