# Van de Sande Design

Alex Van de Sande's personal site. It opens on page 190 of Camila Russo's
*The Infinite Machine*, where he appears in the text, and his own writing
arrives as handwritten notes in the margin. Scrolling turns the leaves;
text the reader has not reached yet stays blurred.

The whole site is one self-contained page, `site/index.html`. It pulls in
nothing but Google Fonts, so it can be opened straight from disk.

## Run it locally

```bash
python3 -m http.server 8765 --directory site
```

Then open http://localhost:8765. In Claude Code, `.claude/launch.json`
starts the same server under the name `site`.

## Deploying

Every push to `main` publishes `site/` to GitHub Pages through
`.github/workflows/pages.yml`.

## What is not in this repo

`References/` holds the book scans, screen recordings and a PSD that the
design was drawn from, 809 MB of it, with several files past GitHub's
100 MB limit. It stays on Alex's machine.

`archive/ink-mask-prototype/` is a first approach that was dropped: it
rectified a photograph of page 190 into luminance masks and painted the
page as real ink on paper. The script and the page are tracked so the
method is not lost; the rasters they need are local only, so it will not
run from a fresh clone without them.
