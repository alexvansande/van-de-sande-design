# The blog

Alex Van de Sande's wandering about, which was at blog.vandesande.design on
Paragraph, brought home. Each post is a folder named after its address:

    blog/the-triangle-of-everything/
      index.md          the post
      cover.png         the picture at its head
      01.png 02.png …   the pictures in it, in order, at full size
      paragraph.json    the post as Paragraph's API gave it, kept as the record

`blog.vandesande.design/the-triangle-of-everything` is built from
`blog/the-triangle-of-everything/`, so every address stays the same. The
section anchors stay the same too (`#h-the-powers-of-100`), because each
heading carries the id it had: `### The Powers of 100 {#h-the-powers-of-100}`.

## Build it

```bash
pip install pillow                       # optional: resizes pictures to WebP
python3 blog/build.py --serve 8766       # builds into blog/_site, then serves it
```

Then open http://localhost:8766. It is published the same way, at the root
of blog.vandesande.design (`--base /`), by the
[alexvansande/blog](https://github.com/alexvansande/blog) repo, which
builds it from here within a quarter of an hour of a change reaching
`main`. `--base /blog/` builds it to sit under a path instead.

The addresses of `blog.css` and `blog.js` carry a stamp of what is in
them (`?v=`), as the site's script does: a browser may keep a file for ten
minutes, and a page must not run with the script of the version before it.

It writes the index, one `<slug>.html` per post, which GitHub Pages serves at
`/<slug>`, `/category/<name>`, `/rss.xml`, `/sitemap.xml`, `/llms.txt` and
`/<slug>.md`, as Paragraph had them. It needs only Python. Pillow cuts the
110 MB of full-size pictures down to about 27 MB of WebP, at the widths the
page shows them.

## Writing a post

Make a folder, put an `index.md` in it with the same header as the others
(`title`, `subtitle`, `date`, and optionally `categories`, `cover`), and
put the pictures next to it. The text is Markdown. A picture on a line of
its own becomes a figure, with its title as the caption:

    ![alt text](03.png "The caption")

For anything more, write the figure as HTML, as the imported posts do:

    <figure class="float-right" style="width:50%">
    <img src="08.png" width="554" height="482" alt="">
    <figcaption>Half the column, the text running round it</figcaption>
    </figure>

A video is written the same way, and plays like a moving picture: silent,
looping, and only while it is on screen. If a `.webm` of the same name is
beside the `.mp4`, it is offered first (some browsers draw the MP4 black):

    ![](mandelbrot.mp4 "The caption")

Pictures and videos on lines of their own, one after another with no blank
line between them, are a carousel: one at a time, swiped from side to side
or stepped with the arrows under it, each with its own caption:

    ![](04.jpg "The law")
    ![](05.jpg "The queen breaks it")

With a blank line between them they are separate figures, one above the
other, as before.

`$$E = mc^2$$` is set as maths (MathML: fractions, powers and indices).

## Writing in the editor

```bash
pip install pillow          # optional, but phone photos need it (below)
python3 blog/editor.py      # then http://localhost:8767
```

A page on this machine for writing a post the way it will look: the
paper, the type, the picture at its head, all as the blog sets them. There
are no buttons over the text. Select some and bold, italic, link, maths
(∑), the two sizes of heading and quote come up over it; on an empty line a
+ comes up beside it, for a picture, a video, a YouTube video, maths, a
divider or code. Several pictures chosen at once are a carousel, and a
picture's + adds more beside it. A caption is typed under its picture.
Pictures and videos can also be pasted in, or dragged onto the page,
anywhere on it: they go between the paragraphs nearest where they are let
go, a line showing where while they are held (onto the strip at the top,
a picture is the featured image). A link pasted over a selection links it.

- **Maths** is typed as `$$E = mc^2$$` in the text, or made from a selection
  with ∑. A click on it opens its TeX, with the maths set under it as it is
  typed. It is set by `build.py`'s own TeX (`tex_to_mathml`, which
  `editor.py` asks), so it looks as it will on the blog, and a command that
  TeX does not know is underlined, as the blog would show it as text.
- **A YouTube video** comes from the +, or from its link (or the embed code
  YouTube gives) pasted where the caret is: on an empty line, before or
  after a paragraph, or in the middle of one, which it splits; a `t=` in
  the link is where it starts. It is written as the other
  videos are, a `<figure class="youtube">` with the video in it, its title
  asked of YouTube, and its caption, if it has one, in the figure.
- **Half the column, the text running round it**: ◧ and ◨ on a picture
  float it left or right at half the width, and again bring it back. It is
  written as the older posts have it, `<figure class="float-right"
  style="width:50%">`; on a phone it is the whole width, as there. The Markdown shortcuts work as they are typed
(`## `, `- `, `> `, `**bold**`). The featured image is the strip at the top
of the paper; a picture dropped on it replaces it.

It writes what `build.py` reads and nothing else (`editor.py`, with the
page in `_editor/`, which is not published):

- **A draft** is `index.draft.md` in the post's folder. The build leaves it
  out, so a draft can sit in the folder, or be committed, without being on
  the blog. A new one is in a folder called `draft-<when>` until it is out.
  It is saved as it is written, and with Save draft (⌘S).
- **The pictures** go into the folder as they are added, numbered on from
  the last (`01.jpg`, `02.png`…), the featured image as `cover.*`. With
  Pillow, a photo is turned the way the phone was held (the build would
  otherwise show it sideways) and made no wider than 2400 pixels. A `.mov`
  becomes an `.mp4`, and a `.webm` is made beside every `.mp4`, if ffmpeg
  is installed.
- **Preview** builds the blog with the drafts in it (`build.py --drafts
  --quick` into `blog/_preview`: the pictures are linked as they are, not
  resized, so it takes a second) and opens the post.
- **Publish** asks for the post's address (from its title; it cannot change
  once the post is out), dates it, renames its folder to that address, makes
  `index.draft.md` its `index.md`, deletes the pictures the post no longer
  uses, then commits that one folder and pushes. The push is what deploys
  it. If the push fails (another machine pushed first, say) it pulls,
  replays the commit on top, and tries once more; otherwise it says what git
  said, and the commit is there to push by hand.

A post that is out is edited the same way: saving writes `index.draft.md`
beside its `index.md`, and the post on the blog stays as it was until
Publish changes (which adds `updated` to its header, for `dateModified`).
Discard changes throws the draft away. 51 of the 53 posts brought from
Paragraph open in it too. Their pictures written as HTML (`<figure><img>`),
YouTube videos and floated pictures are shown as such and written back as
the same HTML; any other HTML block is shown as it is written, and kept.
The other two have HTML in the middle of a sentence, which the editor can
only hold as plain text; it says so when one is opened, and those are
better changed in their `index.md`.

The Markdown it writes (`_editor/md.js`) is read by the same rules as
`render_blocks()` and `Inline` in `build.py`: what it writes, the build
reads back as the same post. Bold and italic together are written
`**_this_**`, as `***this***` comes out of the build as overlapping tags.

## How it keeps Paragraph's layout

The text column is 704px, as on Paragraph, and a picture shows at its own
width, or the column's if it is wider. So a small picture stays small and
centred, and a big one fills the column, exactly as before. A figure with
`float-right` and a width is floated beside the text and drops underneath
it on a phone. Captions are centred under their picture. The gaps between
paragraphs, headings, lists and pictures are Paragraph's own. Everything
around the post is the rest of the site's: the dark ground, the paper, EB
Garamond.

## Categories

Each post has two or three, in its header: `categories: ["Ethereum",
"Governance"]`. They show on its card to the right of the date (the first
three), and under its title on the post, where each links to its page,
`/category/<name>` with the name in lowercase and dashes
(`/category/university-portfolio`). Keep to the ones already in use where
one fits, so that each category page has something in it: Ethereum,
Governance, Voting, UX, ENS, Mist, Tutorials, Maps, Geometry, Infographics,
Science, Games, Interface concepts, University portfolio, Apple, OLPC,
Education, Music, Culture, Social media.

## The index

Beside the posts is a column with a line about them ("I have been writing
on the internet for over 25 years…") and the years they span, newest
first; each year goes to its first post. The column is ranged right,
against the posts. The line goes by with the page and the years stay in
view, the year being read large and the others falling away from it along a
curve; where the reading is is taken continuously through each year's
posts, so the sizes glide as the page scrolls (`--k`, set by `blog.js`). On a phone the
line sits under the title and the years run along the top of the screen,
keeping the lit one in view. The line is in `front_page()` in `build.py`.

## Opening a post, and reading on

Clicking a card on the index grows its paper and picture into the post's
sheet, and the words come up once the paper is there: a cross-document view
transition (`@view-transition` in `blog.css`), so it needs no script. At the
foot of every post is the next one, older, as a card. Scroll on past it, or
click it, and `blog.js` fetches that post and opens it in place the same
way, with the one after it waiting underneath; the address and the title
follow whichever post is being read. After the oldest it comes round to the
newest, and it stops once every post is on the page. Browsers without view
transitions just go to the page; without the script, the card is a link.

The blog's name heads every page: "Alex Van de Sande" goes to the site
(`--home`), "wandering about" to the index. The index has it as its title
and nothing over it.

Going back up, a grey bar with the name comes down from the top, and goes
again as you read on; clicking "wandering about" in it goes to the index,
the name growing into the index's title and the post shrinking into its
card. At the top of a post, the post before it is put back above only if
that is how you got here: you read it to the end (its last lines were on
screen) and came on from it, so scrolling up shows its ending, like a back
button, and one post back only. Otherwise, from the index, the site or a
link, pulling on past the top draws the post back and
brings "All the wandering about" down above it; pull a little harder and
it goes to the index, where the post shrinks into its card. The browser's
own pull (to refresh, on a phone) is turned off on a post, so this is the
only one.

Two fingers do the same. Pinching in, anywhere down a post or the index,
draws the page back about the middle of the screen, and far enough it goes
where the pull at the top would. Spreading them on a card grows it towards
you, and far enough it opens. Spreading them on a post is left to the
browser, to zoom in and read, and so is a pinch on a page zoomed in. It is
a finger pinch on a phone and a trackpad pinch on a computer; a pinch still
going as a page arrives is not taken for a new one.

On a big screen (88rem and up), a column to the left of the sheet keeps
the post's year and title, and the posts before and after it, once its own
title has gone off the top; it follows whichever post is being read.

The index works the same way the other way round: pulled down past its
top, it draws back under "Alex Van de Sande" and, pulled hard enough,
sinks into the dark and the site loads. That pull is twice as long as a
post's, and gives less the further it goes, so it is never an accident.

The build also writes `latest.json`: the three newest posts, as their cards
show them, for the poster at the end of the site.

A card is an A4 sheet, like the poster's pages: the picture across its top,
the title, the subtitle, as many of the first lines as fit (cut at the last
whole line by `blog.js`) and the date and categories at the foot, all set in
container units. On the index and the category pages the cards pile up at
the top as they go by, the way the Mist screenshots do on the site: a card
reaching the top stays there and the next slides up over it, pushing it
back, a little higher, smaller and fainter each time, until three rows on it
has gone into the dark. Coming up from the foot of the screen, a card rises
out of the dark. Not on the archive, which is in shelves. Where the browser can tie an
animation to the scroll (Safari 26, Chrome 115), the pile is only that: each
card's place in the page runs it, off the page's thread, so nothing trails
the finger. Only the cards on or near the screen carry it: a card with
one on it is a layer of its own, and all of them at once (with two more for
their shading) were over a gigabyte on a phone, which Safari answered by
closing the page. Anywhere else a card is held by `position: sticky` and
`blog.js` adds the little it steps back. Moved from the script on every
scroll, a card trailed the page by a frame and shook on a phone.

## Where the address says to stand

- `/#at=slug` opens the index with that post's card at the front of the
  pile. The address keeps it up to date as the posts go by, so a reload or
  a link stands there again; `#y2024` still goes to a year.
- Going from a post to the index (the bar, or pulling past the top) opens
  it at that post's card, which the post shrinks into. If the post was
  opened from the index, its card is put back exactly where it was on the
  screen when it was clicked (noted for the tab), by the back button too;
  otherwise it is at the front of the pile.
- `/slug#at=px` opens a post that far down, where the site's copy of its
  head had been read to.
- `#back=blog.<n>`, on a post or the index, is the page of the site's poster
  this was opened from: pulling back up past the top goes back to it
  (`/#read=blog.<n>` on the site). Once seen it is kept for the tab, so the
  index still goes back there after reading a post. An index come to from the site
  without it still goes back to the poster, at its last page.

Landing somewhere by the address, the trackpad still coasting from the
gesture that brought you is held for a moment, so it does not scroll you
away from it.

## Posts from elsewhere

A link in a post to where another post first appeared goes to that post
here instead: `build.py` knows every post's `original`, and a Medium link is
matched by its id whichever of Medium's hosts it is written on, an ENS forum
link by its topic number. The one Mirror address a post links to is in
`MOVED_BY_HAND`, since Paragraph kept no record of Mirror's.

Nothing links to a site that is gone: wanderingabout.com (someone else's
now) and olpcnews.com (moved to ictworks.org, which kept none of the old
pages). Every link to them, in a post, in its "Originally published on",
and in its `.md`, goes to the Internet Archive's copy from about the post's
date instead (`GONE_HOSTS` in `build.py`).

Besides the posts from Paragraph, the blog holds what was written on Medium
(his own account; not the UniLogin publication), on the Ethereum
Foundation's blog, and three essays from the ENS forum. They are listed in
`SOURCES` in `import_posts.py`, which brings each into a folder like the
others, with `source.html`, the post as it was fetched, in place of
`paragraph.json`. Their header carries `original` and `original_site`, and
the page says "Originally published on …" under the date, linked. Links
from one of these posts to another point at the copy here.

    pip install pillow
    python3 blog/import_posts.py [--only SLUG] [--force]

Medium refuses plain requests for its pages, so its last ten posts come from
its RSS feed, which carries them whole, and the older ones from the Wayback
Machine's copies from around 2020. The Wayback Machine limits how fast it
answers: when it refuses, wait and run it again with `--only`. A post with
no picture at its head shows its first picture on its card.

## The archive

`blog/_archive/` keeps the older writing, as `archive_old.py` found it on the
Wayback Machine and Flickr: the Posterous blog, Computer for Monks, the 2007
portfolio and Laser Chess, the Paris diary, the OLPC News article and two
Flickr essays. It is built to `/archive/`, which no index, feed or sitemap
links to and which asks search engines to stay away. On its index each post
has an "On the blog" box; the ticks stay in that browser, and "Copy the
list" copies what is in and what is out, to paste back into the
conversation. Putting a post on the blog is moving its folder up into
`blog/`. A post the page gave no date for carries the day the archive first
saw it, marked `date_circa` and shown as "c. 2005".

    python3 blog/archive_old.py [posterous monks wanderingabout portfolio2011 paris olpcnews flickr] [--force]
    python3 blog/archive_missing.py       # then: what is still missing, at /archive/missing

Posterous's own pictures went with it in 2013 and the archive never kept
them. Where a Posterous post had been sent on to Flickr, `archive_old.py`
takes the same pictures from there, matched by title or by the Posterous
address in the photo's description; 38 of the 73 posts have their pictures
that way. Logged out, Flickr only shows the newest hundred photos and the
albums, so the rest may still be in the full Flickr data export: match them
the same way (the photo's title against the post's) and put them in the
post's folder. The Paris diary's photos were swapped for Flickr's large
versions, and the videos that went to YouTube are embedded where the old
pages had them.

## Pulling from Paragraph again

```bash
pip install pillow
python3 blog/export_paragraph.py
```

It fetches every post from Paragraph's public API and rewrites its folder.
It writes the Markdown from the editor's document rather than from
Paragraph's own Markdown export, because that export drops the floats and
the caption styling. It will not overwrite a post that has been edited here
since the last export unless you pass `--force`.

## Known gaps, as they were on Paragraph

Three figures in two posts have a caption but no picture: the picture was
already gone on Paragraph (the posts were first published on Mirror,
mirror.xyz/avsa.eth, and moved to Paragraph with it). They are
kept as they were, each marked with a comment in the Markdown:

- *The Triangle of Everything*: "This poster about everything can be found
  at www.vandesande.design" and "The 'constrains' for Macro Dark Matter…"
- *Gosper World*: "Warning: if your child has one or more of these printed
  geometric paper models…"

The YouTube video in *Gosper World* is a plain embed instead of Paragraph's
click-to-load thumbnail.
