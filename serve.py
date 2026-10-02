"""Serves site/ locally the way GitHub Pages does, for working on it.

Two things the plain `python3 -m http.server` does differently from Pages,
and that made the local site misbehave:

- Pages serves /blog/some-post from blog/some-post.html. Without that, every
  link to a post is a 404 locally.
- Pages sends part of a file when asked (a byte range). Safari will not
  play a video without that, and Chrome cannot skip about in one.
- Nothing here is kept by the browser, so an edited script is always the one
  that runs. (Pages lets a browser keep a file ten minutes; the deploy stamps
  the script's address instead.)

    python3 serve.py [PORT]        # default 8765, then http://localhost:8765

The blog has to be built into site/blog first:

    python3 blog/build.py --out site/blog --base /blog/ --home /
"""
import http.server
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class _Part:
    """The part of a file a range asked for, read as if it were all of it."""
    def __init__(self, f, n):
        self.f, self.left = f, n

    def read(self, n=-1):
        n = self.left if n < 0 else min(n, self.left)
        data = self.f.read(n)
        self.left -= len(data)
        return data

    def close(self):
        self.f.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def translate_path(self, path):
        real = super().translate_path(path)
        # /blog/some-post is blog/some-post.html, as on Pages
        if not os.path.exists(real) and os.path.exists(real + ".html"):
            return real + ".html"
        return real

    def send_head(self):
        # a byte range, as Pages answers it, for the videos
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, last = m.groups()
        if first:
            start, end = int(first), min(int(last), size - 1) if last else size - 1
        else:
            start, end = max(0, size - int(last or 0)), size - 1
        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return _Part(f, end - start + 1)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        # the site's own "not here" page, as Pages would show it
        nf = os.path.join(ROOT, "404.html")
        if code == 404 and os.path.exists(nf):
            body = open(nf, "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().send_error(code, message, explain)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"serving site/ on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
