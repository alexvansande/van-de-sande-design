# Van de Sande Design

Alex Van de Sande's personal site. A rail of A4 sheets floating on a dark
ground: the index off to the left, then a stack for each thing he has made.
Sideways moves along the rail, upwards turns the page of whatever is in the
middle, and the sheet bends while it goes.

The site is `site/index.html`, its script `site/app.js`, the fonts in
`site/fonts` and the posters in `site/img`. It pulls in nothing from
anywhere else.

## How it loads

The first screen is the HTML alone, about 13 KB: the line on the index,
in whatever old-style serif the device already has (Iowan Old Style on
Apple), swapping to EB Garamond when it arrives. It is not preloaded:
that held the line back waiting for it. The script is deferred, so it
builds the paper after that first paint, and the paper fades in once the
faces it is set in have arrived. The fonts are served from here, latin
only and only the cuts in use. Only EB Garamond (44 KB) is needed to open:
Crimson Pro and Cardo, the faces of the second and third pages of the
book, are asked for once the first screen is in, and those pages are
fitted again when they arrive. A station asks for its
pictures only when the rail comes near it; once the first screen is in and
the page has gone quiet, the reach grows by one, so the next poster along
is loaded before you get there. Nothing on the first screen is a picture.

## What is on the rail

    the index · My ethereum story · Blockchain design work
    The Mist browser · Victor and HVM
    Some experiments with maps · The whole universe in one image
    the blog · where else to find him

The last is the index's answer at the other end: a line, ranged left so
its start is what shows from the blog's poster, with his Bluesky, X,
avsa.eth and an address to write to. Its links are the first a Tab
reaches, and tabbing to one takes the rail there.

**My ethereum story** is three pages from books that mention him — page 190
of Camila Russo's *The Infinite Machine*, page 79 of Laura Shin's *The
Cryptopians*, and the cast of characters from Matt Leising's *Out of the
Ether* — each with the passage about him run over in yellow marker. Turn
the last one away and there are no more pages: the three books come up out
of the dark as small volumes, each with the thickness of its pages showing
along the fore-edge, and each a link to the book on Amazon. A round note in
the fourth corner says to learn more about them. The shelf is a wall: each
book hangs a little way out from it and throws its shadow on it, down and to
the right. A book can be taken and turned right round — spine, back board,
the edges of the leaves — flicked to spin, and left alone it comes back to
face the room. While the shelf is showing none of them quite holds still:
each sways a few degrees on a slow beat of its own. The back and spine are the book's `base` colour for now. The covers are asked for
along with the faces of the later pages, once the first screen is in; a book
in `BOOKS` without a `cover` is set in type instead.

**Blockchain design work** holds the Ethereum Frontier and Blockchain App
Platform release pages. **The Mist browser** is the Ethereum Catalog, a
window with rounded corners; turn it away and three Mist screenshots rise
out of the dark one after another and pile up like windows. They are not A4
and do not turn: they are the pad's `reel`, wider than the page and faded at
its sides. **Victor** is the HVM logo, at half size, looping on a plain sheet,
then the HVM diagram, the unofficial guide to Bend and its TinyChess
chapter, each with a line of the story. A line too deep for the room under the page takes
the page down by just enough to fit, on every sheet at once. **Some experiments with maps** is the Hexagonal
Earth series: the Lifezones print, the "Impossible" Map, the Gosper
topographic. **The whole universe in one image** is the Triangle of
Everything poster, and under it the same triangle drawn out along its axes,
from the Planck length to the Hubble radius.

Both of these end in a post on the blog. The head of the post lies under
the last sheet, the whole screen of it, so turning that sheet over is all it
takes: the rest of the rail steps back to half around the page as it
turns, and what
is left is the blog's name and the post's sheet with its picture, title,
date and first paragraph. It is laid out exactly as the post lays out its
own head (the `.ending` rules in `index.html` copy `blog/_assets/blog.css`);
the date and the first paragraph are fetched from the post's own page, so
they never drift from it. Going on from there reads down it, the page
following the hand to the end of the paragraph and staying where it is let
go. Under the paragraph there is only blank paper; pull on and "Keep
scrolling to read" comes up in it, and let go too soon and it springs back.
Pull far enough (`PULL_GO`) and it is the post, a plain page load with no
transition, since the blog may end up on a domain of its own where none
could reach. The post is told how far down it was being read (`#at=px`)
and opens there, so the load is the only seam. It is told the way back too
(`#back=slug.last`): pulled down past its top, the post comes back to the
site (`#read=slug.last`), not to the blog's index: it opens on the head of
the post, as it was left, and then the last sheet comes down over it, the
turn that went there going back, and the pad zooms out with it to where its
line fits under it among the other posters (`pad.calm`). Pinched out of,
the post comes back to its head (`#read=slug`) and stays there. From then on everything is
the blog's. On a phone the pad zooms further than the others as its pages
turn, so that by its last sheet the page is as wide as the screen and the
post under it is the post at its own size. On a big screen it is a card
instead, lying where the page lay and no narrower than 34rem: the post as
the blog sets it, drawn smaller (a transform, so nothing reflows). Pulling
through it grows it about the middle of the screen to the post's own size,
and the post loads onto exactly that.

On a trackpad each gesture, momentum and all, goes one step and no
further: one page, one station along the rail. Turning the last sheet
stops on the post; reading down stops at the end of the paragraph; the
first pull there only brings "Keep scrolling to read" up, and it takes
another to go into the post. Reading back up stops at the top of the post
before the sheet comes back down. A finger or a mouse drag is left alone,
since the hand is already where the page is.

The last poster is the blog: its three newest posts, a page each, A4 like
every other sheet. Each carries the post's picture, title, subtitle, as many
of its first lines as fit (cut at the last whole line) and its date and
categories. Its pages do not turn: they scroll, the way the blog's own index
does (`paintStack` in `app.js`). The newest lies on the station; going on,
the next comes up from below, over it, and pushes it back into a pile, a
little higher, smaller and fainter, and then the next. Going on past the
last, you are simply scrolling the blog: it opens standing exactly there
(`#at=slug&back=blog.<n>`), the last post at the front and the ones before
it piled above, the years coming down from the top, and the coast of the
gesture carries on down it. Scrolling back up past the blog's top comes back
to the poster, a shorter pull than from a blog opened any other way. A click
on a page opens its post, which gets `#back=blog.<n>`, so pulling back up
past its top comes back to that page. The line under it: "This is a
compendium of all my writings for the last 25 years on the internet". The
posts come from `latest.json`, which `blog/build.py` writes with the blog,
so they are always the newest; the site asks for it once the first screen
is in. Coming back, by the back button, stands at the page that was opened,
or at the last one (`#read=blog.<n>`).

Before leaving, the site notes on its own address where it stood
(`#read=slug`), so the back button comes back to the head of the post, and
the site ignores the trackpad still coasting from the gesture. `BLOG` in
`app.js` says where the blog is, and `--home` for `blog/build.py` where the
site is. It is the `post` of a pad in `PADS`: its slug, its title, and the
widths its cover was cut at by `blog/build.py`.
The maps pad has a line per page, from McLuhan to the new projection. The triangle has three: Buckminster Fuller on beauty over the poster,
then Lineweaver and Patel's own chart (`img/lineweaver-patel.webp`, their
graph from the post on a white A4 sheet), then the triangle drawn out along
its axes, and what the chart connects.

Under the book and the release pages is not a title but a line of the
story, one per page, which changes as the page turns: `cap` on each page in
`PAGES` and in the blockchain pad. A pad without them keeps its title.
Where there is room under the paper, and only on a big display, where the
sheets stop growing at 45rem and several sit side by side, the whole story
is set out at once instead, like the lyrics of a song: every line showing, the one
for the page in hand bright and the rest dim. There the page may give up
to 15% of its height to make room for a story; one that would need more
stays one line at a time.

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

**The fold can lean.** The strips are cut along the fold, and the fold
does not have to lie level: lean it and one bottom corner rises ahead of
the other. Take a page by a corner and that corner leads; draw sideways as
you lift and it leans further, so a page goes over to the left or to the
right. On a trackpad the sideways part of the scroll does the same. It
comes level as it lands.

**Paper is never flat.** The sheet in the middle carries a standing bow. It
is not there when the page arrives: it lifts after a beat. Whenever nothing
is being touched the paper moves in gusts: it opens and closes on a slow
beat, each gust taking the other corner. Only the sheet in the middle stirs —
neighbours moving too were a hundred more layers to draw each frame, which
Safari on a big screen felt — except the story seen from the index, where
it is the only paper on screen.
They stop the moment you touch anything and come back three and a half
seconds after. A lifted foot throws a shadow on the paper under it,
darkest under the corner that is up. Sliding along the rail leans every
sheet against the slide, the trailing corner lifting. A mouse over a sheet
lifts the corner nearest it, more the lower it is. A phone that reports its
tilt without asking (Android; iOS would need a permission prompt, so it is
left alone) leans the fold as you move it. Slide sideways and the
bow crosses over from the sheet leaving to the one arriving.

**There is dead scroll either side of a page at rest**, so a long scroll has
somewhere to stop rather than tumbling into the next turn.

A click works too: on the page in the middle it turns it over, on a poster
waiting to the side it slides along to it, and on his line on the index it
starts the stories. A trackpad works on the same two axes. A plain mouse has one, so the arrow
keys move along the rail and turn pages.

## Run it locally

```bash
python3 serve.py
```

The posts at the end of the maps and the triangle and the blog's poster
come from the live blog at blog.vandesande.design (`BLOG` in `app.js`).
`serve.py` serves `site/` the way Pages does: `/products/poster` is
`products/poster.html`, a missing address gets `404.html`, and nothing is
kept by the browser, so an edited script is always the one that runs.

Then open http://localhost:8765. In Claude Code, `.claude/launch.json`
starts the same server under the name `site`.

## Deploying

Every push to `main` publishes `site/` to GitHub Pages through
`.github/workflows/pages.yml`. On the way it stamps the script's address
with the commit, `app.js?v=…`: Pages lets a browser keep each file for ten
minutes on its own clock, and without the stamp a visitor could get a new
page with the old script.

## The blog

`blog/` holds the posts from blog.vandesande.design, brought over from
Paragraph: a folder per post, named after its address, with its Markdown and
its pictures, and `blog/build.py`, which makes the blog from them. See
`blog/README.md`.

It is moving to a repo of its own,
[alexvansande/blog](https://github.com/alexvansande/blog), published at the
root of blog.vandesande.design, since Pages gives a repo one domain and this
one's is vandesande.design (see `LAUNCH.md`). The site reads the blog from
there (`BLOG` in `app.js`): the blog's poster fetches `latest.json` on every
visit, so a new post is on it as soon as the blog publishes it, with no
build here.

## Addresses kept from the shop

vandesande.design was a Shopify shop until October 2026. The shop is
closed; `/products/poster` and `/products/the-impossible-map` go on to the
posters' own sites, triangleofeverything.com and hexagonal.earth, and any
other old address gets `404.html`, which points to the same places.

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
