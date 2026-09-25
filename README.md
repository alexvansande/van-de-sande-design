# Van de Sande Design

Alex Van de Sande's personal site. It is a book of six stories navigated by
dragging: horizontal moves through the pages of one story, vertical moves
between stories, and the index lies under the whole site to the left.

The site is one self-contained page, `site/index.html`. It pulls in nothing
but Google Fonts, so it can be opened straight from disk.

## The six stories

Six stories sit in a column, each a stack of pages:

    Van de Sande · The Ethereum story · Bend
    The triangle of everything · Hexagonal earth · Blog

Only the first has real content: page 190 of Camila Russo's *The Infinite
Machine*, where Alex appears in the text, with his own writing arriving as
handwritten notes in the margin. The rest are scaffolding: a title page and
a picture or two, waiting for words and images.

**Which way is which.** Horizontal moves through the pages of one story,
vertical moves between stories, and the index lies under the whole site to
the left. Concretely: drag left to turn a page, drag right to go back, and
drag right again on a story's first page to peel the site off the index.
Drag up for the next story, down for the previous.

`FWD_DX` at the top of the script decides the horizontal direction. Setting
it to `1` reverses reading direction; the index then has to move to the
right-hand side in the CSS as well, which the comment beside it spells out.

**Nothing is a triggered animation.** Three numbers — which page, which
story, how far the index is uncovered — are written directly by the drag and
handed to a critically damped spring on release. Paper bends wherever the
finger left it, over-dragging past either end rubber-bands, and a release
commits only if you passed a third of the way or flicked hard enough to
carry there. The bending sheet is the same ten-strip hinge used by
`scroll.html`, driven by position instead of scroll.

A trackpad works on the same two axes. A plain mouse has only one, so the
page corner at the bottom right and the arrow keys turn pages; arrows also
move between stories, and Escape shuts the index.

## The scrolling version, `site/scroll.html`

The first approach, kept so the two can be compared. It opens on the same
page 190 and reveals the margin notes one page at a time, but the leaves are
one stack rather than a grid and scrolling turns them; text the reader has
not reached yet stays blurred. It was the site until the story grid took its
place, and is self-contained in the same way. Nothing points at it: it is
reached by its own path, `/scroll.html`.

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
