"""The pictures a link to the site or the blog shows: a screenshot of each,
as it is first seen, 1200 by 630.

    python3 og_images.py

Serves the site and the blog for a moment, looks at each in Chrome, and
writes site/img/share.jpg and blog/_assets/share.jpg. Taken at twice the
size and brought down, so the type stays crisp. The blog's index shows the
newest posts, so take it again now and then.
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630
SHOTS = [  # what to serve, where it is then, where its picture goes
    (["serve.py", "8875"], "http://localhost:8875/", "site/img/share.jpg"),
    (["blog/build.py", "--quick", "--out", tempfile.mkdtemp(), "--serve", "8876"], "http://localhost:8876/", "blog/_assets/share.jpg"),
]


def up(url, wait=120):
    end = time.time() + wait
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except OSError:
            time.sleep(0.5)
    sys.exit(f"{url} never came up")


def main():
    servers = [subprocess.Popen([sys.executable, *args], cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for args, _, _ in SHOTS]
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2, color_scheme="dark")
            for _, url, out in SHOTS:
                up(url)
                page.goto(url, wait_until="networkidle")
                page.wait_for_timeout(2500)          # the fonts and the first animation settle
                tmp = os.path.join(HERE, out + ".png")
                page.screenshot(path=tmp)
                Image.open(tmp).convert("RGB").resize((W, H), Image.LANCZOS).save(os.path.join(HERE, out), quality=88, optimize=True, progressive=True)
                os.remove(tmp)
                print(out)
            browser.close()
    finally:
        for s in servers:
            s.terminate()


if __name__ == "__main__":
    main()
