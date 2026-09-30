"""Serves site/ locally the way GitHub Pages does, for working on it.

Two things the plain `python3 -m http.server` does differently from Pages,
and that made the local site misbehave:

- Pages serves /blog/some-post from blog/some-post.html. Without that, every
  link to a post is a 404 locally.
- Nothing here is kept by the browser, so an edited script is always the one
  that runs. (Pages lets a browser keep a file ten minutes; the deploy stamps
  the script's address instead.)

    python3 serve.py [PORT]        # default 8765, then http://localhost:8765

The blog has to be built into site/blog first:

    python3 blog/build.py --out site/blog --base /blog/ --home /
"""
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def translate_path(self, path):
        real = super().translate_path(path)
        # /blog/some-post is blog/some-post.html, as on Pages
        if not os.path.exists(real) and os.path.exists(real + ".html"):
            return real + ".html"
        return real

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        # the blog's own "not here" page, as Pages would show it
        nf = os.path.join(ROOT, "blog", "404.html")
        if code == 404 and self.path.startswith("/blog/") and os.path.exists(nf):
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
