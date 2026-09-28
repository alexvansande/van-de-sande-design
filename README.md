# Van de Sande Design

Alex Van de Sande's personal site. A rail of A4 sheets floating on a dark
ground: the index off to the left, then a stack for each thing he has made.
Sideways moves along the rail, upwards turns the page of whatever is in the
middle, and the sheet bends while it goes.

The whole site is one self-contained page, `site/index.html`, plus the
posters in `site/img`. It pulls in nothing but Google Fonts.

## What is on the rail

    the index · My ethereum story · Blockchain design work
    Some experiments with maps · The whole universe in one image

**My ethereum story** is three pages from books that mention him — page 190
of Camila Russo's *The Infinite Machine*, page 79 of Laura Shin's *The
Cryptopians*, and the cast of characters from Matt Leising's *Out of the
Ether* — each with the passage about him run over in yellow marker.

**Blockchain design work** holds the Ethereum Frontier and Blockchain App
Platform release pages. **Some experiments with maps** is the Hexagonal
Earth series: the Lifezones print, the "Impossible" Map, the Gosper
topographic. **The whole universe in one image** is the Triangle of
Everything poster.

Adding another is two lines: an entry in `PADS` and a `.art` class with its
image. Everything on the rail is A4, so one step spaces all of it.

## How it moves

**Nothing is a triggered animation.** Two numbers — where you are along the
rail, and which page of the pad in the middle — are written directly by the
drag and handed to a critically damped spring on release. Each axis keeps
its own flight, so grabbing the page does not strand a slide still in the
air. Over-dragging past either end rubber-bands, and a release commits only
if you passed a quarter of the way or flicked hard enough to carry there.

**The sheet bends** as ten flat planes hinged along their top edges, placed
by the script in one 3D scene so WebKit does not flatten them. The strips
nearest the free edge lead, so the paper curls on its way up instead of
pivoting like a board, and the free edge stays under your finger. Going
over the far side it fades rather than blinking off.

**Paper is never flat.** The sheet in the middle carries a standing bow. It
is not there when the page arrives: it lifts after a beat and then keeps a
slow flap until you touch something. Slide sideways and the bow crosses
over from the sheet leaving to the one arriving.

**There is dead scroll either side of a page at rest**, so a long scroll has
somewhere to stop rather than tumbling into the next turn.

A trackpad works on the same two axes. A plain mouse has one, so the arrow
keys move along the rail and turn pages.

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

`archive/dragged-book.html` is the design this replaced: the same books as
a single bound book of five stories, dragged horizontally through pages and
vertically between stories, with an index panel underneath and signposts
along the foot.

`archive/scroll-version-index.html` is the one before that: page 190 read by
scrolling, with the text ahead of the reader blurred out.

`archive/ink-mask-prototype/` is a first approach that was dropped: it
rectified a photograph of page 190 into luminance masks and painted the
page as real ink on paper. The script and the page are tracked so the
method is not lost; the rasters they need are local only, so it will not
run from a fresh clone without them.
