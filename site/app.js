(() => {
'use strict';

/* ===================================================================
   A rail of three things: the index off to the left, the story in the
   middle, whatever comes next off to the right. Sideways slides along it.

   Upwards turns the page, and the sheet bends while it goes — ten flat
   strips hinged along their top edges, each leading the one above it, so
   the paper curls instead of pivoting flat. The story zooms toward you as
   you go into it, and the neighbours slide out of frame on their own.
   =================================================================== */

const PAGES = [
  { cls: 'lead', run: ['THE INFINITE MACHINE', 'CAMILA RUSSO'], folio: '190',
    cap: 'In 2014 I started working for a 19 year old who was going to pay me in a money he made up.',
    body: `<p>&ldquo;Honey, remember that giant pile of money I was talking about last week? The one kept safe by unhackable code?&rdquo; <mark class="hl">Alex</mark>, still glued to his smartphone screen, said to his wife.</p>
           <p>&ldquo;Yes?&rdquo;</p>
           <p>&ldquo;Well, it was hacked.&rdquo;</p>` },
  { cls: 'cryp', run: ['THE CRYPTOPIANS', 'LAURA SHIN'], folio: '79',
    cap: 'The people I met were scruffy, disheveled, weirdos spread all over the world. Loved working with them.',
    body: `<p>Jeff was also funny. He played the grumpy guy but was actually a teddy bear. He often teased and screwed around with people, but it was obvious he was joking. He was a boss who didn&rsquo;t want to be a boss. Plus, he was always accessible. He was logged onto Gitter, on a public Go Ethereum channel, all day long, which was nice for his remote team members, such as the black-, curly-haired P&eacute;ter Szil&aacute;gyi in Transylvania and <mark class="hl">Alex van de Sande, aka Avsa, a designer in Rio de Janeiro whose high forehead and disheveled locks gave him a professorial vibe. Everyone felt part of the team.</mark></p>
           <p>Those under Gavin had a different experience. If a few developers came up with an idea, he would sometimes immediately shoot it down. Often he was right, but still, it was frustrating to work with someone who was constantly telling you that you were wrong. <mark class="hl">Once, when Avsa was in Amsterdam from Rio, working with Jeff, the second Gav heard he was there, he immediately asked Alex to take a train to Zug to work with him.</mark></p>
           <p>As time went on, however, his employees found Gavin became more of an &ldquo;ideas guy&rdquo; who made his underlings execute his vision, while claiming credit and never praising them. Still, they found him &ldquo;brilliant&rdquo; or thought him &ldquo;a smart guy, but not the best boss.&rdquo;</p>` },
  { cls: 'ether', run: ['OUT OF THE ETHER', 'MATT LEISING'], folio: 'x',
    cap: 'There were lots of hiccups along the way. We wanted to change the world. Maybe we did but not in the way we expected.',
    body: `<p>Ming Chan &ndash; First executive director of the Ethereum Foundation, whipped it into shape to keep it within its means, Vitalik favored her though she rubbed many the wrong way</p>
           <h4>Badass blockchain ninja warriors</h4>
           <p><mark class="hl">Alex Van de Sande &ndash; Known as avsa, helped marshal the Robin Hood Group from his apartment in Rio, co-developed the Mist wallet, excellent husband, the one who pushed the button to start the DAO counterattack</mark></p>
           <p>Griff Green &ndash; The Mayor of Ethereum circa June 2016, hugger, visionary, driver of the RHG, slock.it&rsquo;s first employee</p>
           <p>Fabian Vogelsteller &ndash; tech whiz who helped the RHG prepare to fight the ether thief, co-developed Mist wallet</p>
           <p>Lefteris Karapetsas &ndash; coding guru, replicated DAO attack in a few hours</p>` }
];

/* Under the last page, the books themselves: three small volumes on the dark
   ground, each a way out to where it is sold, and a round note in the fourth
   corner. `cover` is a picture of the real cover, in img/, and `ratio` its
   proportions; without one the volume is set in type. `base` is the colour
   of the back board and the spine, until there are pictures of those too. */
const BOOKS = [
  { cls: 'infinite', title: 'The Infinite Machine', author: 'Camila Russo',
    sub: 'How an Army of Crypto-hackers Is Building the Next Internet with Ethereum',
    href: 'https://www.amazon.com/dp/0062886142',
    cover: 'cover-infinite-machine.webp', ratio: '663 / 1000', base: '#2a6fd0' },
  { cls: 'cryptopians', title: 'The Cryptopians', author: 'Laura Shin',
    sub: 'Idealism, Greed, Lies, and the Making of the First Big Cryptocurrency Craze',
    href: 'https://www.amazon.com/dp/1541763009',
    cover: 'cover-cryptopians.webp', ratio: '1678 / 2600', base: '#0b0b0d' },
  { cls: 'ether', title: 'Out of the Ether', author: 'Matthew Leising',
    sub: 'The Amazing Story of Ethereum and the $55 Million Heist that Almost Destroyed It All',
    href: 'https://www.amazon.com/dp/1119602939',
    cover: 'cover-out-of-the-ether.webp', ratio: '676 / 1000', base: '#141414' }
];

const $ = s => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const clamp01 = x => clamp(x, 0, 1);
const RAD = Math.PI / 180;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = $('#stage'), rail = $('#rail'), story = $('#story');
const indexText = $('#index p'), endText = $('#elsewhere p');
const IDX_DIM = .22, IDX_LIT = .92;     /* faded in the corner of the eye, lit when it is yours */
/* the rail, left to right, with where each one sits along it */
const RAIL = [[$('#index'), -1], [story, 0], [$('#blockchain'), 1],
              [$('#browser'), 2], [$('#victor'), 3],
              [$('#maps'), 4], [$('#triangle'), 5], [$('#latest'), 6],
              [$('#elsewhere'), 7]];
const FIRST = RAIL[0][1], LAST = RAIL[RAIL.length - 1][1];


/* A pad is a station with sheets in it. Both the story and the poster are
   pads, so they bow, curl and zoom on the same machinery — the only
   difference is what is printed on the paper. */
const faceHTML = p => p.face ? p.face : p.art
  ? `<div class="face art ${p.art}"></div>`
  : `<div class="face ${p.cls || ''}">
       <header class="run"><span>${p.run[0]}</span><span>${p.run[1]}</span></header>
       <div class="body">${p.body}</div>
       <footer class="folio">${p.folio}</footer>
     </div>`;
function buildShelf(books){
  const host = el('div', 'shelf');
  host.setAttribute('aria-hidden', 'true');
  const shelf = { host, open: false };
  const items = books.map((b, n) => {
    const a = el('a', 'bk ' + b.cls);
    a.href = b.href; a.target = '_blank'; a.rel = 'noopener';
    a.tabIndex = -1;
    a.setAttribute('aria-label', `${b.title} by ${b.author}`);
    if (b.ratio) a.style.aspectRatio = b.ratio;
    if (b.base) a.style.setProperty('--base', b.base);
    a.innerHTML = `<span class="ws"></span><span class="vol">
        <span class="cv"${b.cover ? ` style="--cover:url('img/${b.cover}')"` : ''}>${b.cover ? '' :
          `<span class="t">${b.title}</span><span class="s">${b.sub}</span><span class="a">${b.author}</span>`}</span>
        <span class="bc"></span><span class="sp"></span><span class="pg"></span>
        <span class="hd top"></span><span class="hd foot"></span>
      </span>`;
    host.append(a);
    a._go = spinnable(a, n, () => shelf.open);
    return a;
  });
  const note = el('p', 'note');
  note.innerHTML = '<span>Learn more about these books</span>';
  host.append(note);
  return Object.assign(shelf, { items: items.concat(note), links: items });
}
/* A book on the shelf can be taken and turned: drag it round, flick it and
   it spins on and slows, and left alone a while it comes back to face the
   room. A mouse over it, or the keyboard on it, turns it toward you and
   brings it out from the wall. Its shadow on the wall keeps the width of
   whatever the book shows of itself, and falls further and softer the
   further out it comes. */
const REST = [-32, 4], FACE = [-12, 2], HOME_AFTER = 2600;
/* and while the shelf is showing, none of them quite holds still: each sways
   a few degrees about its resting pose, on a slow beat of its own */
const SWAY = [7, 2.2], SWAY_BEAT = [6.4, 9.1];
function spinnable(a, n, shown){
  const vol = a.querySelector('.vol'), ws = a.querySelector('.ws');
  const T = .15;                                /* --t, as a share of the width */
  let ry = REST[0], rx = REST[1], vy = 0, vx = 0, lift = 0;
  let near = false, hold = null, letGo = -1e9, raf = 0, prev = 0;
  const draw = () => {
    vol.style.transform = `translateZ(${(lift * 6).toFixed(2)}cqw) translateY(${(-lift * 3).toFixed(2)}%) ` +
                          `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    /* how wide and tall the book is seen from the front, turned as it is */
    const wy = Math.abs(Math.cos(ry * RAD)) + T * Math.abs(Math.sin(ry * RAD));
    const hx = Math.abs(Math.cos(rx * RAD)) + T * .7 * Math.abs(Math.sin(rx * RAD));
    ws.style.transform = `translate(${(15 + lift * 7).toFixed(2)}cqw,${(10 + lift * 5).toFixed(2)}cqh) ` +
                         `scale(${wy.toFixed(3)},${hx.toFixed(3)})`;
    ws.style.opacity = (1 - lift * .25).toFixed(3);
  };
  const frame = now => {
    const dt = clamp((now - prev) / 1000, .001, .05); prev = now;
    let busy = !!hold;
    if (!hold){
      const k = 1 - Math.exp(-dt * 7);
      lift += ((near ? 1 : 0) - lift) * k;
      if (Math.abs(vy) + Math.abs(vx) > 4){
        /* still spinning from a flick */
        ry += vy * dt; rx = clamp(rx + vx * dt, -40, 40);
        const f = Math.exp(-dt * 2.4); vy *= f; vx *= f;
        busy = true;
      } else {
        vy = vx = 0;
        /* home to the nearest turn of the resting pose, not all the way back
           round the way it came */
        if (near || now - letGo > HOME_AFTER){
          let [ty, tx] = near ? FACE : REST;
          if (!near && !reduce && shown()){
            const s = now / 1000, ph = n * 2.1, TAU = Math.PI * 2;
            ty += SWAY[0] * Math.sin(s / SWAY_BEAT[0] * TAU + ph);
            tx += SWAY[1] * Math.sin(s / SWAY_BEAT[1] * TAU + ph * 1.7);
            busy = true;
          }
          const goal = ty + 360 * Math.round((ry - ty) / 360);
          ry += (goal - ry) * k; rx += (tx - rx) * k;
          if (Math.abs(goal - ry) > .05 || Math.abs(tx - rx) > .05) busy = true;
          else { ry = ty; rx = tx; }
        } else busy = true;
      }
      if (Math.abs((near ? 1 : 0) - lift) > .002) busy = true;
    }
    draw();
    raf = busy ? requestAnimationFrame(frame) : 0;
  };
  const go = () => { if (!raf){ prev = performance.now(); raf = requestAnimationFrame(frame); } };
  const into = on => { near = on; go(); };
  a.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') into(true); });
  a.addEventListener('pointerleave', () => into(false));
  a.addEventListener('focus', () => into(true));
  a.addEventListener('blur', () => into(false));
  /* the book's own gesture: the stage never sees it, so taking hold of a
     book neither turns the page nor slides the rail */
  a.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (e.button) return;
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false, w: a.offsetWidth };
    vy = vx = 0;
    try { a.setPointerCapture(e.pointerId); } catch (_) {}
  });
  a.addEventListener('pointermove', e => {
    if (!hold || e.pointerId !== hold.id) return;
    const dx = e.clientX - hold.x, dy = e.clientY - hold.y, dt = Math.max(.008, (e.timeStamp - hold.t) / 1000);
    if (!hold.moved && Math.hypot(dx, dy) < 4) return;
    if (!hold.moved){ hold.moved = true; a.classList.add('held'); }
    /* the front follows the hand: a book's width of drag is half a turn */
    const dY = dx / hold.w * 180, dX = -dy / hold.w * 120;
    ry += dY; rx = clamp(rx + dX, -40, 40);
    vy = vy * .5 + dY / dt * .5; vx = vx * .5 + dX / dt * .5;
    hold.x = e.clientX; hold.y = e.clientY; hold.t = e.timeStamp;
    go();
  });
  const drop = e => {
    if (!hold || e.pointerId !== hold.id) return;
    if (hold.moved){ draggedAt = performance.now(); letGo = draggedAt; }
    /* a hand that stopped before letting go leaves the book where it is */
    if (e.timeStamp - hold.t > 80) vy = vx = 0;
    vy = clamp(vy, -1400, 1400); vx = clamp(vx, -600, 600);
    hold = null; a.classList.remove('held');
    if (e.pointerType === 'touch') near = false;
    go();
  };
  a.addEventListener('pointerup', drop);
  a.addEventListener('pointercancel', drop);
  draw();
  return go;
}
/* A pad that ends in a post on the blog. The head of the post lies under the
   last sheet, the whole screen of it, so turning that sheet over is all it
   takes to be looking at the post: the blog's name, the post's own sheet
   with its picture, title and date, and its first paragraph. It is laid out
   as the post itself is (blog/_assets/blog.css), so nothing moves when the
   real one loads in its place.
   Going on from there reads down it: the page follows the hand, and under
   the first paragraph there is only blank paper, and a line saying to keep
   going that comes up as you pull at it. Pull hard enough and it is the
   post, loaded for real, from there on the blog's own.
   It is on the stage, under the rail, so the rail's zoom does not reach it. */
/* Where the blog is: on a domain of its own, from the blog repo. GitHub
   Pages lets any site fetch from it, so latest.json and the posts' heads
   come across. */
const BLOG = 'https://blog.vandesande.design/';
/* The blog's poster: its newest posts, each a page of its own, filled in
   from the blog by fillLatest(). */
const POST_FACE = '<div class="face postcard"></div>';
/* how far past the first paragraph you pull, in pixels of the hand, before
   it lets go into the post; and how much of that the paper follows */
const PULL_GO = 150, PULL_GIVE = .45;
function buildPost({ slug, title, widths }){
  const a = el('a', 'ending');
  a.href = `${BLOG}${slug}`;
  a.tabIndex = -1;
  a.setAttribute('aria-hidden', 'true');
  const page = el('div', 'e-page');
  const top = el('div', 'e-top');
  top.innerHTML = 'Alex Van de Sande&rsquo;s wandering about';
  const sheet = el('div', 'e-sheet');
  const paper = el('span', 'e-paper');
  const cover = el('div', 'e-cover');
  const img = el('img');
  img.alt = '';
  img.decoding = 'async';
  const words = el('div', 'e-text');
  const h = el('h1');
  h.textContent = title;
  const more = el('p', 'e-more');
  more.textContent = 'Keep scrolling to read';
  words.append(h);
  cover.append(img);
  sheet.append(paper, cover, words, more);
  page.append(top, sheet);
  a.append(page);
  stage.append(a);
  const base = `${BLOG}media/${slug}/cover-`;
  const post = { a, page, top, sheet, paper, cover, img, words, more, slug, going: false, shift: 0,
                 fit: { s: 1, y0: 0 }, curS: 1 };
  /* The date and the first paragraph come from the post itself, so they are
     never out of step with it. Its .html, which every host serves, where
     the bare address needs Pages. */
  const fill = () => {
    fetch(`${BLOG}${slug}.html`).then(r => r.ok ? r.text() : Promise.reject(r.status)).then(t => {
      const doc = new DOMParser().parseFromString(t, 'text/html');
      const text = doc.querySelector('article.sheet .text');
      if (!text) return;
      const sub = text.querySelector(':scope > .sub'), when = text.querySelector(':scope > .when');
      const first = text.querySelector('.body > :is(p, blockquote, ul, ol)');
      const body = el('div', 'e-body');
      if (first) body.append(document.importNode(first, true));
      /* inside the one link to the post, a link is a span */
      const kept = [sub, when].filter(Boolean).map(n => document.importNode(n, true));
      kept.concat(body).forEach(n => n.querySelectorAll('a').forEach(l => {
        const s = el('span'); s.append(...l.childNodes); l.replaceWith(s);
      }));
      words.append(...kept, body);
      post.need = null;
    }).catch(() => {});
  };
  post.load = () => {
    if (img.src) return;
    img.sizes = '(min-width: 53rem) 848px, 100vw';
    img.srcset = widths.map(w => `${base}${w}.webp ${w}w`).join(', ');
    img.src = `${base}${widths[widths.length - 1]}.webp`;
    fill();
  };
  a.addEventListener('click', e => { e.preventDefault(); go(post); });
  return post;
}
/* On a big screen the head of the post is not the whole screen but a card,
   no bigger than the page it was under: the post as the blog sets it,
   drawn smaller, lying where the page lay. Only pulling on through it grows
   it to the post's own size, and then it is the post. On a phone the page
   was already as wide as the screen, so it is the post at its own size. */
const CARD_BELOW = .92;
/* How far the page has to go up for the first paragraph to be read whole,
   with a little paper under it, and how small it is drawn: measured once it
   is in, and again on a resize. */
/* How far a pad that ends in a post has zoomed in at page pv. On a phone it
   has to be as wide as the screen by its last sheet, so that the post under
   it is uncovered edge to edge. Elsewhere it zooms a little at every turn,
   the last one, onto the post, too. */
/* Come back from the post and the last sheet brought down over its head
   (pad.calm), the pad zooms back out with it, to where its line fits under
   it among the other posters, rather than staying the width of the screen.
   The two meet at the head, so turning on to it again is the same as ever;
   and it is forgotten once the pad is back at its first page. */
function postZoomOf(p){
  if (p.calm && p.pv <= 1e-3) p.calm = false;
  const full = postZoom(p, p.pv);
  if (!p.calm) return full;
  const L = p.sheets.length, c = clamp01(L - p.pv);
  return full * (1 - c) + zoomBy * clamp01(p.pv / L) * c;
}
function postZoom(p, pv){
  const L = p.sheets.length;
  return FILL > 1 + zoomBy + 1e-3 ? (FILL - 1) * clamp01(pv / Math.max(1, L - 1))
                                   : (FILL - 1) * clamp01(pv / L);
}
function needOf(post){
  if (post.need == null || !post.img.complete){
    /* where the page is once the last sheet is over, zoom and all: the rail
       scales about the middle of the screen, the page in the middle of it */
    const z = 1 + postZoom(post.pad, post.pad.sheets.length), el = post.station;
    const st = { width: el.offsetWidth * z, top: H() / 2 + (el.offsetTop - H() / 2) * z };
    /* as wide as the page, or a large card (34rem) if the page is narrower,
       so its words stay big enough to read */
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    let s = Math.min(1, Math.max(st.width, 34 * rem) / post.sheet.offsetWidth), y0 = 0;
    if (s > CARD_BELOW) s = 1;
    else y0 = st.top - post.top.offsetHeight * s;
    post.fit = { s, y0 };
    const r = post.words.getBoundingClientRect(), p = post.page.getBoundingClientRect();
    const local = (r.bottom - p.top) / post.curS;
    post.need = Math.max(0, Math.ceil(y0 + local * s + 40 - H()));
  }
  return post.need;
}
/* the step past the last sheet, in pixels of the hand: long enough to read
   down to the end of the paragraph and then pull */
const unitOf = post => Math.max(H() * .5, needOf(post) + PULL_GO + 40);
/* Going on is a plain page load of the post: the blog may be on another
   domain, where no transition can reach. It already looks like the head of
   the post, so the load is the only seam, and the post is told how far down
   it was being read (#at=px) so that it opens there. This page's own address
   first gets a note of where it stood (#read=slug), so that the back button
   comes back to here. The post is also told the way back (#back=slug.last):
   pulled down past its top, it comes back here, to the poster's last sheet. */
function go(post){
  if (post.going) return;
  post.going = true;
  try { history.replaceState(history.state, '', '#read=' + post.slug); } catch (_) {}
  const leave = () => {
    location.href = post.a.href + (post.shift > 0 ? '#at=' + Math.round(post.shift) + '&' : '#') + 'back=' + post.slug + '.last';
  };
  const { s, y0 } = post.fit;
  if (s >= 1 || reduce){ leave(); return; }
  /* a card first: it grows to the post's own size about the middle of the
     screen, and the post loads onto exactly that */
  const c = (H() / 2 - (y0 - post.shift)) / s;
  post.shift = Math.max(0, c - H() / 2);
  post.more.style.opacity = '0';
  post.page.style.transition = 'transform .5s cubic-bezier(.2,.75,.15,1)';
  post.page.style.transform = `translate3d(0,${(-post.shift).toFixed(1)}px,0) scale(1)`;
  post.curS = 1;
  setTimeout(leave, 520);
}
function buildPad(station, pages, reel, shelf, post, onward){
  const cap = station.querySelector('.cap');
  const sheets = pages.map((p, i) => {
    const sh = el('div', 'sheet');
    sh.innerHTML = faceHTML(p);
    /* the blog's posts are a pile, the later ones on top; every other pad's
       pages are a stack, the first on top */
    sh.style.zIndex = onward ? 10 + i : 20 - i;
    station.insertBefore(sh, cap);
    return sh;
  });
  /* A pad whose pages carry their own line tells its story one page at a
     time underneath, in place of a title: every line is set, stacked, and
     render() shows the one for the page in hand. */
  /* a reel under the sheets has a line for each of its shots too, after the
     sheets' own, one per stop of the pad */
  const says = pages.map(p => p.cap).concat((reel || []).map(r => r[3]))
    .concat(post ? ['', ''] : [])       /* the post carries its own line, on the picture */
    .concat(onward ? [''] : []);
  let lines = null;
  if (says.some(Boolean)){
    cap.textContent = '';
    lines = says.map(t => {
      const l = el('span', 'line');
      l.textContent = t || '';
      cap.append(l);
      return l;
    });
  }
  const pad = { sheets, pv: 0, hi: sheets.length - 1, cap, lines };
  if (reel){
    const host = el('div', 'reel');
    const shots = reel.map(([cls, w, h]) => {
      const e = el('div', 'shot ' + cls);
      e.style.aspectRatio = `${w} / ${h}`;
      host.append(e);
      return { e, r: w / h, h: 0 };      /* h, its share of the page's height, once measured */
    });
    station.insertBefore(host, station.firstChild);
    pad.reel = { host, shots };
    pad.hi += shots.length;      /* the last sheet turns away, then one stop per shot */
  }
  if (onward){
    pad.onward = onward;
    pad.hi += 1;                 /* the last page can go too, and that goes to the blog */
  }
  if (shelf){
    pad.shelf = buildShelf(shelf);
    station.insertBefore(pad.shelf.host, station.firstChild);
    pad.hi += 1;                 /* the last sheet turns away, and there they are */
  }
  if (post){
    pad.post = buildPost(post);
    pad.post.station = station;
    pad.post.pad = pad;
    pad.hi += 2;                 /* the last sheet goes and the picture fills the
                                    screen; one more and it is the post */
  }
  return pad;
}
const PADS = [buildPad(story, PAGES, null, BOOKS),
              buildPad($('#blockchain'), [
                { art: 'eth1', cap: 'Very few people understood what exactly we were doing, even among the team.' },
                { art: 'eth2', cap: 'The launch pages were based on my own experience of trying to get it all to work. Recipes to build a new kind of society.' }]),
              buildPad($('#browser'), [
                { art: 'appstore', cap: 'We wanted to change the world. We thought we’d start at a new browser.' }], [
                ['mist1', 1858, 1240, 'When all crypto wallets were about trading, we built one around creating. Build your organization, a crowdsale, your own kind of money.'],
                ['mist2', 2000, 1679, 'It was the first wallet to have tokens. In fact we were the ones who wrote the specs for it, which became industry standard, ERC20.'],
                ['mist3', 2000, 1648, 'The Mist Browser died. But it was survived by lots of three letter acronyms it helped set: NFT, ICO, ENS, DAO.']]),
              buildPad($('#victor'), [
                { art: 'hvmlogo', cap: 'One of the smartest persons I worked on my projects was Victor Taelin – and I’ve worked with lots of smart people.' },
                { art: 'hvm1', cap: 'He once fixed a bug on the app, then fixed the library it depended on, then proposed a larger refactor of the whole app, until finally he proposed refactoring ethereum from scratch.' },
                { art: 'bend', cap: 'I asked him if given more time he would make a new computer. And that’s what he did. He spent years creating a completely new way to compute. I became an early investor in the Higher Order Company.' },
                { art: 'chess', cap: 'I believe the best way to teach about something is to learn it first so I did lots of visualizations for his machine. Not all of them were used.' }], null, null,
                { slug: 'bend-2', title: 'Bend 2 is live!',
                  widths: [480, 704, 1056, 1408, 2112] }),
              buildPad($('#maps'), [
                { art: 'maps', cap: '“There are no passengers on Spaceship Earth. We are all crew.” — Marshall McLuhan' },
                { art: 'felv', cap: 'I’m a bit obsessed about maps that show a different perspective of earth.' },
                { art: 'gosper', cap: 'I’ve created a new projection using only hexagons and some fractals.' }], null, null,
                { slug: 'gosper-world-a-novel-world-map-made-of-hexagonal-like-fractals-or-how-i-made-matt-parkers-impossible-ball',
                  title: 'Gosper World - a novel world map made of hexagonal-like fractals (or, how I made Matt Parker’s Impossible Ball)',
                  widths: [480, 704, 1056, 1408, 2003] }),
              buildPad($('#triangle'), [
                { art: 'triangle', cap: '“If the solution is not beautiful, I know it’s wrong.” — Buckminster Fuller' },
                { art: 'lineweaver', cap: 'One of the most wonderful graphs in physics comes from Lineweaver and Patel. But I really wanted it to also be beautiful.' },
                { art: 'scales', cap: 'This chart connects relativity, quantum mechanics, biology, planetary science and the big bang. It’s worth taking a deeper look.' }], null, null,
                { slug: 'the-triangle-of-everything', title: 'The Triangle of Everything',
                  widths: [480, 704, 1056, 1408, 1848] }),
              /* the blog: its title page, the three newest posts under it, and
                 one more turn to go to it */
              /* the blog: its newest posts, a page each, and turning the last
                 one over goes to it */
              buildPad($('#latest'), [{ face: POST_FACE }, { face: POST_FACE }, { face: POST_FACE }],
                       null, null, null, true)];
/* the index sits at -1 and is not a pad; everything from 0 rightwards is */
const padOf = h => h >= 0 && h < PADS.length ? PADS[h] : null;

/* Where the text has to stop. Cutting at the box edge slices whichever line is
   crossing it in half; this finds the lowest line that fits whole and stops
   there. Losing a line is fine, losing the bottom of its letters is not. */
function clipToLine(body){
  body.style.maxHeight = '';
  const avail = body.clientHeight;
  if (body.scrollHeight <= avail) return;
  const top = body.getBoundingClientRect().top;
  const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let cut = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()){
    range.selectNodeContents(n);
    for (const r of range.getClientRects()){
      const b = r.bottom - top;
      if (b <= avail + .5 && b > cut) cut = b;
    }
  }
  if (cut > 0) body.style.maxHeight = Math.ceil(cut) + 'px';
}

/* a long page is stepped down until it lands, rather than clipped at the foot */
function fitSheets(){
  PADS.forEach(pad => pad.sheets.forEach(sh => {
    /* a post's page: its first lines take what room the title leaves, and
       stop at the last whole line */
    const lead = sh.querySelector('.lp-lead');
    if (lead) clipToLine(lead);
    const body = sh.querySelector('.body'), face = sh.querySelector('.face');
    if (!body) return;                       /* the poster is one picture */
    let f = 1;
    body.style.maxHeight = '';
    face.style.setProperty('--fit', f);
    /* barely shrink. A page that runs long loses its last lines rather than
       being set small enough to swallow them — easier to read, and the cut is
       taken at a line boundary below. */
    while (f > .9 && body.scrollHeight > body.clientHeight){
      f -= .03; face.style.setProperty('--fit', f.toFixed(3));
    }
    clipToLine(body);          /* whatever is still over the edge goes by the line */
  }));
}

/* ===================================================================
   THE BENDING SHEET
   Ten flat planes in one scene. Each hinges on the bottom edge of the one
   above, and the strips nearest the free edge lead, so the paper bends on
   its way up instead of pivoting like a board.
   =================================================================== */
const STRIPS = 14, CURL = .55, DEPTH = 2600;
/* Paper is never flat. The sheet in hand carries a standing bow, strongest at
   the free edge, so it reads as something you could pick up without anything
   being drawn on it to say so.

   It also has to be a real bow rather than a flat sheet sitting still. The
   turn profile clamps every strip above the fold to exactly 0, and a stack of
   coplanar overlapping planes is a z-fight: the compositor picks a winner per
   row and the seams show as ruled lines across the paper. Under the bow no two
   strips ever share a plane. */
const BOW = 20;
/* The bow is not there when the page arrives. It lifts after a beat, slowly,
   and then keeps breathing until you touch something — a sheet settling rather
   than a diagram of one. */
const BOW_WAIT = 1000, BOW_RISE = 1600, FLAP_DEPTH = .45;
let bowMul = 0;
/* The fold does not have to lie level. Lean it and the strips are cut along
   the lean, so one bottom corner rises ahead of the other: positive lifts the
   left, negative the right. Degrees, and never past TILT_MAX, which is what
   the strips are cut long enough to reach. */
const TILT_MAX = 14;
let tilt = 0;

/* how far through the turn each strip is. The free edge is the bottom, so
   the bottom strip leads and the one at the hinge is last to follow. `span`
   is how many strips it takes to cross the sheet along the fold; a leaning
   fold crosses it corner to corner, and any strip past that stays with the
   last. */
const profile = (e, bm = 1, n = STRIPS, span = STRIPS - 1) => [...Array(n)].map((_, k) => {
  const f = Math.min(1, k / span);
  const turn = 180 * clamp01(e * (1 + CURL) - CURL * (1 - f));
  return Math.max(turn, BOW * bm * Math.pow(f, 1.5));   /* the turn overtakes the bow */
});

/* The free edge stays under the finger. p is how far the bottom edge has
   travelled up the sheet, 0 to 1, so it belongs at (1 - p) of the height
   from the hinge. Tabulate where the edge lands for each bend, then read the
   table backwards. Near the hinge there is nothing left to pull against, so
   the last fifth lets it fall over. */
/* tabulated against the full bow, so the mapping stays honest once the page
   has settled; while it is still breathing nothing is being dragged anyway */
const EDGE = [...Array(241)].map((_, i) =>
  profile(i / 240, 1).reduce((a, ang) => a + Math.cos(ang * RAD), 0) / STRIPS);
function bend(p){
  const want = 1 - p;
  let i = 0; while (i < 240 && EDGE[i + 1] > want) i++;
  const e = i >= 240 ? 1 : (i + clamp01((EDGE[i] - want) / (EDGE[i] - EDGE[i + 1] || 1))) / 240;
  const fall = clamp01((p - .72) / .28), s = fall * fall * (3 - 2 * fall);
  return e + (1 - e) * s;
}

function buildCurl(sheet){
  const W = sheet.offsetWidth, H = sheet.offsetHeight, hs = H / STRIPS;
  const host = el('div', 'curl');
  const face = sheet.querySelector('.face');
  /* Whatever colour this sheet is. The plate standing in behind the strips and
     the underside of the paper were both hard-coded to the book's cream, which
     showed as a pale band under the bow of a poster with a dark ground. */
  const bg = getComputedStyle(face).backgroundColor;
  /* and whatever corners it has: the page clones carry their own, and the
     underside and the plate are the same size as the page, so they take the
     same value */
  const radius = getComputedStyle(face).borderRadius;
  /* A leaning fold crosses the sheet corner to corner, which is further than
     top to bottom, so there are a few more strips than STRIPS and each is
     long enough to span the sheet at the steepest lean. At a level fold the
     extra ones hang past the foot with nothing in them. */
  const lean = Math.sin(TILT_MAX * RAD);
  const n = Math.ceil(STRIPS * (1 + W / H * lean)) + 1;
  const BW = W + H * lean + 4;
  /* a wider overlap than the turn strictly needs: at the resting bend the
     page is almost flat and subpixel seams between strips read as ruled
     lines across the paper. Past the end of the picture the overlap is
     empty, since the strip itself is transparent. */
  const ph = hs + 1.6;
  const band = (cls, ...kids) => {
    const p = el('div', 'pl ' + cls);
    p.style.width = BW + 'px'; p.style.height = ph + 'px';
    p.append(...kids); host.append(p); return p;
  };
  /* Each strip is a window onto the same page, turned and pushed by drawCurl
     so that its own slice lands in it. */
  const page = () => {
    const copy = face.cloneNode(true);
    /* set one by one, never through cssText: that wipes every inline style on
       the clone, and --fit lives there. The strips are what you actually look
       at, so losing it meant the page on screen was never the fitted one. */
    const cs = copy.style;
    cs.position = 'absolute'; cs.left = '0'; cs.top = '0';
    cs.width = W + 'px'; cs.height = H + 'px';
    cs.transformOrigin = '0 0'; cs.transform = 'none'; cs.boxShadow = 'none';
    return copy;
  };
  const shade = cls => {
    const s = el('div', 'sh ' + cls);
    s.style.width = BW + 'px'; s.style.height = ph + 'px';
    return s;
  };
  const parts = [];
  for (let k = 0; k < n; k++){
    const copy = page(), a1 = shade('t'), b1 = shade('b'), d1 = el('div', 'dim');
    copy.append(a1, b1, d1);
    /* the underside: plain paper the colour of the sheet. It used to carry the
       ink showing through, mirrored and faint, but that only drew attention to
       the strips it was cut into. */
    const under = el('div', 'under'), a2 = shade('t'), b2 = shade('b'), d2 = el('div', 'dim');
    under.style.width = W + 'px'; under.style.height = H + 'px';
    under.style.backgroundColor = bg;
    under.style.borderRadius = radius;
    under.append(a2, b2, d2);
    parts.push({ face: band('fr', copy), back: band('bk', under),
                 copy, under, a1, b1, a2, b2, d1, d2, half: ph / 2 });
  }
  const cast = el('div', 'cast'), plate = el('div', 'plate'), pool = el('div', 'pool');
  plate.style.backgroundColor = bg;
  plate.style.borderRadius = radius;
  /* and the plate is the page that really lies underneath, so that wherever
     the strips fall short of it — at a seam, or under a lifted foot — what
     shows is the next page of the pad. It was this page again once, which
     under a lifted corner read as a second copy of it. The last page of a
     pad has nothing under it but its own blank ground. */
  let next = sheet.nextElementSibling;
  if (next && !next.classList.contains('sheet')) next = null;
  if (next){
    const under = next.querySelector('.face').cloneNode(true), us = under.style;
    us.position = 'absolute'; us.left = '0'; us.top = '0';
    us.width = W + 'px'; us.height = H + 'px';
    us.transform = 'none'; us.boxShadow = 'none';
    plate.append(under);
  }
  /* beside the sheet, not inside it: the sheet is hidden while its strips
     stand in for it, and a child would inherit that and never paint */
  sheet.parentNode.append(plate, pool, cast, host);
  sheet._curl = { host, cast, plate, pool, parts, W, H, hs };
  sheet.classList.add('lifted');
}
function dropCurl(sheet){
  if (!sheet._curl) return;
  sheet._sig = null;
  sheet._curl.host.remove(); sheet._curl.cast.remove(); sheet._curl.plate.remove();
  sheet._curl.pool.remove();
  sheet._curl = null; sheet.classList.remove('lifted');
}

function drawCurl(sheet, e, fade, bm, lean){
  /* Twenty transforms and forty opacities. render() runs on every frame of a
     rail slide too, where the sheet in hand is not moving at all, so nothing
     is rewritten unless something about it actually changed. */
  const tq = Math.round(clamp(lean, -TILT_MAX, TILT_MAX) * 20) / 20;
  const sig = e + '|' + fade + '|' + bm + '|' + tq;
  if (sheet._sig === sig) return;
  sheet._sig = sig;
  const { parts, cast, plate, pool, W, H, hs } = sheet._curl;
  /* The fold runs along v and the sheet falls away from it along u; at a
     level fold those are across and down. s measures along u, t along v. */
  const ls = Math.sin(tq * RAD), lc = Math.cos(tq * RAD);
  const s0 = Math.min(0, -W * ls);                  /* the corner nearest the hinge */
  const t0 = Math.min(0, H * ls) - 2;               /* where each strip starts, across */
  const span = Math.max(1, (H * lc + W * Math.abs(ls)) / hs - 1);
  const ang = profile(e, bm, parts.length, span);
  const dk = ang.map(a => Math.abs(Math.sin(a * RAD)));
  const edge = i => (dk[Math.max(0, i - 1)] + dk[Math.min(dk.length - 1, i)]) / 2;
  const shade = clamp01(e / .26);
  const eye = H / 2 * lc - W / 2 * ls;               /* the eye's s */
  const deg = tq + 'deg', ndeg = -tq + 'deg';
  let y = s0, z = 0, foot = 0;
  parts.forEach((pt, k) => {
    const a = ang[k], c = Math.cos(a * RAD), sn = Math.sin(a * RAD), half = pt.half;
    /* A strip faces you when its normal, (-sin a) u + (cos a) z, points at the
       eye. A plane is flat, so its middle decides for the whole of it. */
    const cy = y + half * c, cz = z + half * sn;
    const front = -sn * (eye - cy) + c * (DEPTH - cz) > 0;
    /* Which slice of the page this strip carries, and the shading laid back
       across it. It only moves when the lean does, and only the side you can
       see is kept up to date: each rewrite repaints the strip. */
    const geo = tq + '|' + s0;
    if (front ? pt.gf !== geo : pt.gb !== geo){
      const sk = (s0 + k * hs).toFixed(2), tk = t0.toFixed(2);
      const into = `translate(${-tk}px,${-sk}px) rotate(${ndeg})`;
      const back = `rotate(${deg}) translate(${tk}px,${sk}px)`;
      if (front){
        pt.gf = geo; pt.copy.style.transform = into;
        pt.a1.style.transform = pt.b1.style.transform = back;
      } else {
        pt.gb = geo; pt.under.style.transform = into;
        pt.a2.style.transform = pt.b2.style.transform = back;
      }
    }
    if (pt.front !== front){
      pt.front = front;
      /* opacity, not visibility: a hidden plane is never painted, so the back
         of the sheet would be painted for the first time mid-turn */
      pt.face.style.opacity = front ? '1' : '0';
      pt.back.style.opacity = front ? '0' : '1';
    }
    if (pt.fade !== fade){
      pt.d1.style.opacity = pt.d2.style.opacity = (1 - fade).toFixed(3);
    }
    pt.fade = fade;
    /* hinge at y along u, then turn the strip into the lean, bend it, and
       slide it back across to where its slice starts */
    const at = `translate3d(${(-y * ls).toFixed(2)}px, ${(y * lc).toFixed(2)}px, ${z.toFixed(2)}px) ` +
               `rotateZ(${deg}) rotateX(${a.toFixed(2)}deg) translateX(${t0.toFixed(2)}px)`;
    pt.face.style.transform = at;
    pt.back.style.transform =
      `${at} translateY(${half.toFixed(2)}px) rotateX(180deg) translateY(${(-half).toFixed(2)}px)`;
    /* barely shade a sheet that is only resting: at a gentle bow the shading
       is what makes the strips legible as strips */
    const T = edge(k) * shade, B = edge(k + 1) * shade;
    pt.a1.style.opacity = (T * .2).toFixed(3); pt.b1.style.opacity = (B * .2).toFixed(3);
    pt.a2.style.opacity = (B * .17).toFixed(3); pt.b2.style.opacity = (T * .17).toFixed(3);
    y += hs * c; z += hs * sn;
    if (k === STRIPS - 1) foot = y - s0;
  });
  const reach = Math.max(0, foot) / H;           /* where the free edge sits now */
  /* the page keeps its own shadow while it is still lying there; once it is
     properly up, the shadow it throws on the page below takes over */
  plate.style.opacity = (1 - clamp01(e / .06)).toFixed(3);
  cast.style.opacity = (Math.sin(Math.PI * e) * .3).toFixed(3);
  cast.style.transform = `scaleY(${Math.min(1, reach + .16).toFixed(4)})`;
  /* While the page lies there with its foot up, the paper under the foot is
     in its shade, darkest under the corner that is highest. It is what
     parts the lifted sheet from the one below. Once the page is properly
     up, the cast above takes over. */
  const up = Math.sin(clamp(ang[Math.min(STRIPS - 1, ang.length - 1)], 0, 90) * RAD);
  pool.style.opacity = (clamp01(up * 1.5) * (1 - clamp01(e / .2))).toFixed(3);
  pool.style.setProperty('--px', (50 - tq / TILT_MAX * 42).toFixed(1) + '%');
}

/* ===================================================================
   Two numbers. hx is the rail: -1 the index, 0 the story, then the posters.
   pv is the page, continuous, and it also decides how far the story has
   zoomed toward you.
   =================================================================== */
/* Dead axis either side of a page at rest, so a long scroll has somewhere to
   stop: the turn only happens across the middle of each unit. */
const DWELL = .34;
const turnOf = tr => clamp01((tr - DWELL / 2) / (1 - DWELL));

/* Where we are along the rail; each pad holds its own page. It opens on the
   index: his line first, the book already showing at the edge of it. */
let hx = FIRST;

const W = () => stage.clientWidth, H = () => stage.clientHeight;
const ZOOM = .22;
let zoomBy = ZOOM;             /* ZOOM, or less if the story underneath needs the room */
/* A pad that ends in a post zooms further: by its last sheet the page is as
   wide as the screen, nothing either side of it, so that the picture after
   it grows from a page that already fills the width. Where that would mean
   more than half as big again (a laptop, a desktop), it zooms as the others. */
let FILL = 1 + ZOOM;

/* Measured, never read back out of a custom property: --pw is a calc() of a
   min(), and getComputedStyle hands those back as the unresolved token, so
   parseFloat gives NaN and every transform built from it is silently dropped.
   Measured once and kept, too: the breathing loop renders every frame, and
   reading offsetWidth in there would force a reflow on each of them. */
let STEP = 0, PH = 0, PW = 0, REEL_W = 0;
const LYRIC_GIVE = .15;
function measure(){
  /* The page is as tall as the screen allows, less whatever the deepest line
     under it needs: a line that ran off the foot of a laptop took the page
     down by just enough to fit, rather than going off screen. Twice, since
     the line's depth depends on how wide the page came out. */
  const before = story.offsetHeight;
  stage.style.removeProperty('--phfit');
  /* On a big screen, where the page has already stopped growing, it may give
     up to LYRIC_GIVE of itself so that a story can be set out whole beneath
     it. A story that would need more than that stays one line at a time. */
  const full = story.offsetHeight;
  const big = full >= 45 * parseFloat(getComputedStyle(document.documentElement).fontSize) - 1;
  for (let pass = 0; pass < 2; pass++){
    const pw = story.offsetWidth, g = clamp((W() - pw) / 2 * .38, 12, 210);
    stage.style.setProperty('--gap', g + 'px');
    let need = 0;
    PADS.forEach(pad => {
      if (!pad.lines) return;
      pad.cap.parentNode.classList.remove('lyrics');
      need = Math.max(need, pad.cap.offsetTop - story.offsetHeight +
                            Math.max(...pad.lines.map(l => l.offsetHeight)));
    });
    /* the page sits 2.4vh above the middle, and its foot must leave `need`
       and a margin before the bottom of the screen */
    let room = 2 * (H() * .524 - 12 - need);
    if (big) PADS.forEach(pad => {
      if (!pad.lines) return;
      const st = pad.cap.parentNode;
      st.classList.add('lyrics');
      const deep = pad.cap.offsetTop - story.offsetHeight + pad.cap.offsetHeight;
      st.classList.remove('lyrics');
      const fits = 2 * (H() * .524 - 16 - deep);
      if (fits >= full * (1 - LYRIC_GIVE)) room = Math.min(room, fits);
    });
    if (story.offsetHeight <= room + .5) break;
    stage.style.setProperty('--phfit', Math.floor(room) + 'px');
  }
  /* a page that came out a different size has to be cut into strips again */
  if (story.offsetHeight !== before) PADS.forEach(pad => pad.sheets.forEach(dropCurl));
  const pw = story.offsetWidth;
  /* a share of the free space beside the page. On a phone that space is only
     about 45px, so a six-tenths gap left a sliver too narrow to read as
     anything at all. */
  const gap = clamp((W() - pw) / 2 * .38, 12, 210);
  STEP = pw + gap;             /* every station is A4, so one step fits all */
  /* Going into a pad zooms it toward you, and the line under it goes with
     it. Only as far as keeps the longest line on screen: on a wide screen
     the page is already as tall as it can be, and zooming there would push
     the story off the bottom while you read the page it belongs to. */
  const ph = PH = story.offsetHeight;
  stage.style.setProperty('--gap', gap + 'px');
  /* The whole story under the page at once, where it fits between the foot
     of the page and the bottom of the screen; one line at a time where it
     does not. Pad by pad, and tried afresh on every measure, so a window made
     smaller goes back to one at a time. */
  PADS.forEach(pad => {
    pad.capOn = null;
    if (!pad.lines) return;
    pad.lines.forEach(l => { l._o = null; });
    const st = pad.cap.parentNode;
    st.classList.add('lyrics');
    pad.lyrics = big && story.offsetTop + pad.cap.offsetTop + pad.cap.offsetHeight <= H() - 16;
    if (!pad.lyrics) st.classList.remove('lyrics');
  });
  let foot = 0;
  PADS.forEach(pad => {
    if (!pad.lines) return;
    const tallest = pad.lyrics ? pad.cap.offsetHeight : Math.max(...pad.lines.map(l => l.offsetHeight));
    foot = Math.max(foot, pad.cap.offsetTop + tallest - ph / 2);
  });
  zoomBy = foot ? clamp((H() / 2 - 14) / foot - 1, 0, ZOOM) : ZOOM;
  const fill = W() / story.offsetWidth + .004;
  FILL = fill <= 1.5 ? Math.max(fill, 1 + zoomBy) : 1 + zoomBy;
  /* The screenshots under a sheet are half as wide again as the page, but
     never wider than the screen once the pad has zoomed all the way in: on a
     phone half as wide again ran off both edges. Never narrower than the
     page, either. */
  PW = pw;
  REEL_W = Math.round(Math.max(pw, Math.min(pw * 1.5, (W() - 24) / (1 + zoomBy))));
  stage.style.setProperty('--rw', REEL_W + 'px');
}
function step(){ if (!STEP) measure(); return STEP; }
/* How much of the bow a pad carries. It holds full until the sheet is well off
   centre and only then lets go, rather than easing down from the first pixel:
   fading it symmetrically took both sheets through flat around the midpoint,
   which reads as every corner dropping and coming back. Between stations both
   are near full, which is what paper would do. */
const nearness = d => { const t = clamp01((.72 - d) / .27); return t * t * (3 - 2 * t); };
/* Below this the bow is too shallow to hold the strips apart in depth, and ten
   nearly coplanar overlapping planes are a z-fight: the compositor picks a
   winner per row and the seams show as lines ruled across the paper. Fading
   the bow out across a slide walks straight through that, so under this the
   sheet goes back to being one flat element. BOW * .12 is under three degrees
   at the free edge, so there is nothing to see in the swap. */
const BOW_MIN = .12;

/* Slide sideways and the one arriving lifts its corner as it comes, which is
   the invitation to read it. */
function paintPad(pad, bm, lean){
  if (pad.onward) return paintStack(pad);
  /* which sheet is in hand, by index rather than by the sign of a number that
     rubber-bands past zero — otherwise an over-pull downwards drops the curl
     and the page snaps flat for a frame */
  /* with a reel or the shelf under it, the last sheet can go too */
  const front = clamp(Math.floor(pad.pv + 1e-9), 0, pad.sheets.length - (pad.reel || pad.shelf || pad.post || pad.onward ? 0 : 1));
  pad.sheets.forEach((sh, j) => {
    if (j < front){ dropCurl(sh); sh.classList.add('gone'); return; }
    sh.classList.remove('gone');
    if (j > front){ dropCurl(sh); return; }       /* still flat underneath */
    const t = turnOf(clamp01(pad.pv - j));
    /* dead flat and untouched: show the real sheet. Ten coplanar overlapping
       planes is a z-fight, and it ruled the page into bands. */
    if (t <= 0 && bm < BOW_MIN){ dropCurl(sh); return; }
    if (!sh._curl) buildCurl(sh);
    /* The fade goes with the scroll, not with the bend. bend() deliberately
       rushes the last fifth so the sheet flops over, and a fade keyed to it
       happened entirely inside that rush — which is the blink. */
    const fade = (1 - clamp01((t - .6) / .35)).toFixed(3);
    /* the lean holds while the page goes up, and comes level only as it
       lands on the far side */
    const land = clamp01((t - .55) / .4);
    drawCurl(sh, reduce ? (t > .5 ? 1 : 0) : bend(t), fade, bm,
             lean * (1 - land * land * (3 - 2 * land)));
  });
  if (pad.reel) paintReel(pad);
  if (pad.shelf) paintShelf(pad);
}

/* The blog's poster does not turn its pages: it scrolls them, the way the
   blog's own index does. The newest post lies on the station; going on, the
   next comes up from below, over it, and pushes it back into a pile, each a
   little higher, smaller and fainter, and then the next. Going on past the
   last, the site hands over to the blog, which opens standing exactly there
   (the last post at the front, the ones before it piled above) and goes on
   scrolling. The numbers are the blog's (PILE_ in blog.js). */
const STACK_UP = .045, STACK_SHRINK = .04, STACK_DIM = .3, STACK_DEEP = 3, STACK_GAP = .06;
function paintStack(pad){
  const n = pad.sheets.length, m = pad.pv;
  const sig = m.toFixed(4) + '|' + PH;
  if (pad._ssig === sig) return;
  pad._ssig = sig;
  /* the line under the poster gives way as the posts start to move */
  pad.away = clamp01(m) * .4;
  pad.sheets.forEach((sh, j) => {
    dropCurl(sh);
    const d = m - j;
    let ty, s = 1, dim = 0, op = 1;
    if (d >= 0){
      ty = -STACK_UP * PH * Math.min(d, STACK_DEEP);
      s = 1 - STACK_SHRINK * Math.min(d, STACK_DEEP);
      dim = Math.min(1, STACK_DIM * d);
      op = clamp01(STACK_DEEP - d);
    } else {
      /* one page and a gap below, coming up out of the dark: solid almost
         as soon as it moves, as the Mist shots are, so two pages never show
         through each other */
      ty = -d * PH * (1 + STACK_GAP);
      const e = clamp01(1 + d), f = e * e * (3 - 2 * e);
      dim = (1 - f) * .6;
      op = clamp01(e / .2);
    }
    sh.style.transform = `translate3d(0,${ty.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    sh.style.opacity = op < 1 ? op.toFixed(3) : '';
    sh.style.setProperty('--dim', dim.toFixed(3));
    sh.classList.toggle('gone', op <= 0);
  });
  /* on past the last one, and it is the blog */
  if (m > n - 1 + .15) toBlog(pad, n);
}

/* The post at the end of a pad. u is the last sheet going over, uncovering
   it; the rest of the rail steps back to half around the page as it does,
   so the post is what stands out once the sheet is gone. v is the step past that,
   reading down it: the page follows the hand to the end of the first
   paragraph, then gives, and pulling on brings up the line under it and
   then the post itself. n is how much this pad is the one in the middle, so
   that sliding away along the rail puts it all back. Returns how far the
   post has come up, for render() to dim the rest by. */
function paintPost(pad, n){
  const post = pad.post, L = pad.sheets.length;
  const u = turnOf(clamp01(pad.pv - (L - 1))) * n;
  const v = Math.max(0, pad.pv - L) * n;
  const sig = u.toFixed(4) + '|' + v.toFixed(4) + '|' + W() + 'x' + H() + '|' + post.need;
  if (post._sig === sig) return u;
  post._sig = sig;
  const a = post.a, s = a.style;
  /* put away whenever it is not coming up at all, however far it got */
  if (u <= 0){
    s.opacity = '0'; s.visibility = 'hidden';
    if (post.shown){ post.shown = false; a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
    stage.classList.remove('reading');
    return 0;
  }
  post.load();
  s.visibility = 'visible';
  s.opacity = clamp01(u / .3).toFixed(3);
  if (post.going) return u;          /* growing into the post: hands off */
  const need = needOf(post), px = v * unitOf(post);
  const pull = Math.max(0, px - need);
  post.shift = Math.min(px, need) + pull * PULL_GIVE;
  const { s: sc, y0 } = post.fit;
  post.curS = sc;
  post.page.style.transform = `translate3d(0,${(y0 - post.shift).toFixed(1)}px,0) scale(${sc.toFixed(4)})`;
  const k = clamp01(pull / (PULL_GO * .6));
  post.more.style.opacity = (k * k * (3 - 2 * k)).toFixed(3);
  /* the line has been seen: the next pull may go on */
  if (k >= 1) post.primed = true;
  if (v <= 0 && u < 1) post.primed = false;
  const shown = u > .9;
  if (post.shown !== shown){
    post.shown = shown;
    a.tabIndex = shown ? 0 : -1;
    a.setAttribute('aria-hidden', shown ? 'false' : 'true');
    stage.classList.toggle('reading', shown);
  }
  if (pull >= PULL_GO && n > .9) go(post);
  return u;
}

/* The shelf comes up out of the dark as the last page goes over, a volume at
   a time, left to right and top to bottom, and the note last. Its links only
   take a click or a tab once it is there. */
function paintShelf(pad){
  const sh = pad.shelf;
  const u = turnOf(clamp01(pad.pv - pad.sheets.length + 1));
  const sig = u.toFixed(4) + '|' + PH;
  if (sh._sig === sig) return;
  sh._sig = sig;
  const n = sh.items.length, lag = .12, run = 1 - lag * (n - 1);
  sh.items.forEach((it, i) => {
    const a = clamp01((u - lag * i) / run), f = a * a * (3 - 2 * a);
    it.style.opacity = f.toFixed(3);
    it.style.transform = `translate3d(0,${((1 - f) * PH * .07).toFixed(1)}px,0)`;
  });
  const open = u > .6;
  if (sh.open !== open){
    sh.open = open;
    sh.host.classList.toggle('open', open);
    sh.host.setAttribute('aria-hidden', open ? 'false' : 'true');
    sh.links.forEach(a => { a.tabIndex = open ? 0 : -1; a._go(); });
  }
}

/* The reel, at stop m, has shot m in the middle of the page and the ones
   before it pushed back behind it: each a little higher, smaller and darker,
   so their title bars show above it like a pile of windows. The shots after
   it wait below, in the dark. Between two stops everything is the blend of
   the two, so the next one scrolls up into place and the pile steps back.
   Stop -1 is the sheet still on top: every shot is below, and the first one
   rises with the turn rather than lying there waiting to be uncovered.
   Each entry is [top, scale, opacity, brightness]. */
const PILE_UP = .045, PILE_SHRINK = .04, PILE_DIM = .3, BELOW = 1.02, DARK = .08;
function layout(sh, i, m){
  if (i > m) return [BELOW, 1, 0, DARK];
  const top = (1 - sh[m].h) / 2, d = m - i;
  return [top - PILE_UP * d, 1 - PILE_SHRINK * d, 1, 1 - PILE_DIM * d];
}
function paintReel(pad){
  const { host, shots } = pad.reel, n = shots.length;
  const r = pad.pv - pad.sheets.length;           /* -1 while the sheet is still on top */
  const k = clamp(Math.floor(r), -1, n - 1);
  const u = k < n - 1 ? turnOf(clamp01(r - k)) : 0;
  const f = u * u * (3 - 2 * u);
  const sig = k + '|' + f.toFixed(4) + '|' + PH + '|' + REEL_W;
  if (pad._rsig === sig) return;
  if (pad._rw !== REEL_W){
    pad._rw = REEL_W;
    shots.forEach(s => { s.h = REEL_W / s.r / PH; });
  }
  pad._rsig = sig;
  /* The further in, the more of the sides have gone. Only as much as the reel
     is wider than the page: on a phone it is barely wider, and a fade sized
     for the desktop ate into the windows themselves. */
  const spare = clamp((REEL_W / PW - 1) / .5, .35, 1);
  host.style.setProperty('--f',
    (spare * (12 + 12 * clamp01((k + f) / Math.max(1, n - 1)))).toFixed(1) + '%');
  shots.forEach((s, i) => {
    const a = layout(shots, i, k), b = layout(shots, i, Math.min(n - 1, k + 1));
    const mix = j => a[j] + (b[j] - a[j]) * f;
    /* the one arriving is solid almost as soon as it moves, and comes up out
       of the dark rather than through a see-through fade; darkness is kept
       for the ones going back into the pile */
    const op = i === k + 1 ? clamp01(f / .2) : mix(2);
    s.e.style.transform = `translate3d(0,${(mix(0) * PH).toFixed(1)}px,0) scale(${mix(1).toFixed(4)})`;
    s.e.style.opacity = op.toFixed(3);
    s.e.style.filter = `brightness(${mix(3).toFixed(3)})`;
  });
}

/* The blog's poster: its newest posts, one to a page, from the blog itself
   so they are always the newest. Asked for once the first screen is in. A
   page is an A4 sheet like every other: the post's picture across its top,
   its title, the first lines, its date and categories. */
function fillLatest(pad){
  if (pad.asked) return;
  pad.asked = true;
  fetch(`${BLOG}latest.json`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(posts => {
    pad.posts = [];
    pad.sheets.forEach((sh, i) => {
      const p = posts[i], face = sh.querySelector('.face');
      if (!p || !face) return;
      pad.posts[i] = BLOG + p.slug;
      const pic = el('div', 'lp-pic');
      if (p.picture && p.picture.length){
        const img = el('img');
        img.alt = ''; img.decoding = 'async';
        img.sizes = `${Math.round(PW || 480)}px`;
        img.srcset = p.picture.map(([u, w]) => `${BLOG}${u} ${w}w`).join(', ');
        img.src = BLOG + (p.picture.find(([, w]) => w >= 704) || p.picture[p.picture.length - 1])[0];
        /* a curl carries copies of the page: cut it again once the picture is in */
        img.addEventListener('load', () => { dropCurl(sh); render(); }, { once: true });
        pic.append(img);
      }
      const words = el('div', 'lp-words');
      const h = el('h3'); h.textContent = p.title;
      words.append(h);
      if (p.subtitle){ const sub = el('p', 'lp-sub'); sub.textContent = p.subtitle; words.append(sub); }
      if (p.lead){ const lead = el('p', 'lp-lead'); lead.textContent = p.lead; words.append(lead); }
      const when = el('p', 'lp-when');
      const d = el('span'); d.textContent = p.date;
      const tags = el('span', 'lp-tags');
      (p.categories || []).forEach(c => { const t = el('span'); t.textContent = c; tags.append(t); });
      when.append(d, tags);
      words.append(when);
      face.append(pic, words);
      face.setAttribute('aria-label', p.title);
      dropCurl(sh);
      /* and a plain link to it, for the keyboard: focused, the poster turns
         to this page */
      const go = el('a', 'go');
      go.href = `${BLOG}${p.slug}#back=blog.${i}`;
      go.dataset.note = 'blog.' + i;
      go.dataset.page = i;
      go.textContent = p.title;
      $('#to-blog').before(go);
    });
    fitSheets(); render();
  }).catch(() => { pad.asked = false; });
}
/* Opening the post on the page in hand. The post is told which page it
   was (#back=blog.<n>), so pulling back up past its top comes back here. */
function openLatest(pad){
  const i = clamp(Math.round(pad.pv), 0, pad.sheets.length - 1);
  if (pad.posts && pad.posts[i]) leaveFor(pad.posts[i] + '#back=blog.' + i, 'blog.' + i);
}
/* Leaving for the blog, noting on this page's address where it stood, so
   the back button comes back to it. */
function leaveFor(href, note){
  if (leaveFor.gone) return;
  leaveFor.gone = true;
  try { history.replaceState(history.state, '', '#read=' + note); } catch (_) {}
  location.href = href;
}
/* Turning the last page over goes on to the blog, which opens standing where
   the poster left off: that post's card at the front of its pile, the ones
   before it stacked above (#at=slug), and the way back up coming back to
   this page (#back=blog.<n>). */
function toBlog(pad, n){
  const last = pad.posts && pad.posts[n - 1];
  leaveFor(last ? `${BLOG}#at=${last.slice(BLOG.length)}&back=blog.${n - 1}` : BLOG, 'blog.' + n);
}

/* The line for the page in hand. Each fades out over the first half of a turn
   and the next fades in over the second, so two sentences are never on top
   of each other. A pad waiting beside the one in the middle keeps its line,
   quieter, as the thing along from here. */
function paintLines(pad, d){
  if (!pad.lines){
    /* a title that stays put still gives way to the post */
    const o = pad.away ? (.85 * (1 - clamp01(pad.away / .4))).toFixed(3) : '';
    if (pad.capOn !== o){ pad.capOn = o; pad.cap.style.opacity = o; }
    return;
  }
  const on = (.85 * (.4 + .6 * nearness(d)) * (1 - clamp01((pad.away || 0) / .4))).toFixed(3);
  if (pad.capOn !== on){ pad.capOn = on; pad.cap.style.opacity = on; }
  pad.lines.forEach((l, j) => {
    /* set out as lyrics, the line for the page in hand is lit and the rest
       wait dim; one at a time, the rest are not there at all */
    const near = clamp01(1 - Math.abs(pad.pv - j) * (pad.lyrics ? 1.4 : 2.2));
    const o = (pad.lyrics ? .3 + .7 * near * near * (3 - 2 * near) : near).toFixed(3);
    if (l._o !== o){ l._o = o; l.style.opacity = o; }
  });
}

/* A station fetches its pictures once the rail is within LIT_NEAR of it:
   the first screen asks for none. When the first screen is up and the page
   has gone quiet, the reach grows a step, so the next poster along is in
   before you arrive at it rather than as you do. */
let litNear = 1.5;
function light(){
  RAIL.forEach(([st, i]) => {
    if (!st._lit && Math.abs(i - hx) <= litNear){ st._lit = true; st.classList.add('lit'); }
  });
}

function render(){
  const sp = step();
  /* How far in we are, blended across the two stations we are between. Taken
     from whichever pad was nearest, it held the old one's zoom until the
     midpoint and then snapped — and since the rail's shift is scaled by the
     zoom, that snap threw the whole rail sideways. Sliding away from a page
     you had opened now eases back out as you go. */
  const lo = Math.floor(hx), t = hx - lo;
  /* how far into a pad you are, as a fraction of it. clamp01(pv) was fully on
     for any page past the first, so stepping back from the third to the second
     left you just as zoomed in — every flip back eases it out now. */
  const more = p => !p ? 0 : p.post ? postZoomOf(p) : zoomBy * clamp01(p.pv / Math.max(1, p.hi));
  const zoom = 1 + more(padOf(lo)) * (1 - t) + more(padOf(lo + 1)) * t;
  /* the scale multiplies every station's offset inside the rail, so the shift
     has to be scaled too. Only the story ever zoomed before, and it sits at
     offset 0 where the error is zero — a poster zooming drifts off centre. */
  rail.style.transform =
    `translate3d(${(-hx * sp * zoom).toFixed(1)}px,0,0) scale(${zoom.toFixed(4)})`;
  RAIL.forEach(([el, i]) => { el.style.transform = `translate3d(${(i * sp).toFixed(1)}px,0,0)`; });

  /* his line is a hint while you are elsewhere and a statement when you are on
     it, so it comes up as it arrives and falls back as you leave */
  const litT = clamp01(1 - Math.abs(FIRST - hx));
  const lit = litT * litT * (3 - 2 * litT);
  indexText.style.opacity = (IDX_DIM + (IDX_LIT - IDX_DIM) * lit).toFixed(3);
  /* and the line at the far end, where to find him, the same way */
  const endT = clamp01(1 - Math.abs(LAST - hx));
  endText.style.opacity = (IDX_DIM + (IDX_LIT - IDX_DIM) * endT * endT * (3 - 2 * endT)).toFixed(3);
  light();
  /* a pad's index in PADS is where it sits on the rail: story 0, then the
     posters rightwards */
  /* a post coming up under its last sheet: everything else on the rail
     steps back to half, and the page's own line goes */
  let upto = 0, upSt = null;
  PADS.forEach((pad, i) => {
    if (!pad.post) return;
    pad.away = paintPost(pad, nearness(Math.abs(i - hx)));
    if (pad.away > upto){ upto = pad.away; upSt = RAIL.find(([, j]) => j === i)[0]; }
  });
  if (upto !== rail._upto){
    rail._upto = upto;
    const o = upto > 0 ? (1 - .5 * clamp01(upto / .6)).toFixed(3) : '';
    RAIL.forEach(([st]) => {
      st.style.opacity = st === upSt ? '' : o;
      st.style.transition = upto > 0 ? 'none' : '';     /* with the hand, not after it */
    });
  }
  PADS.forEach((pad, i) => {
    paintLines(pad, Math.abs(i - hx));
    /* n is how much this is the sheet in the middle, m how much a neighbour.
       Only the sheet in the middle stirs: a neighbour moving too was a
       hundred more layers for the browser to draw every frame, which a big
       screen with several sheets on it felt. The one exception is the book
       seen from the index, where it is the only paper there is. */
    const d = Math.abs(i - hx), n = nearness(d);
    const m = i === 0 && hx < 0 ? clamp01((1.4 - d) / .5) * (1 - n) : 0;
    const own = i === Math.round(hx) ? handTilt : 0;
    paintPad(pad, bowMul * (1 + (pad.flap || 0)) * n + (pad.air || 0) * m +
                  HOVER_LIFT * (pad.ha || 0) + slideLift * (n + m),
                  (tilt + own) * n + ((pad.lean || 0) + slideTilt) * (n + m) +
                  TILT * 1.2 * (pad.hs || 0));
  });
}

/* ---------- the spring that catches what you let go of ---------- */
/* Critically damped, so it never wobbles: 2*sqrt(170) is 26. Slower than it
   was — paper this size has little mass but it is not weightless, and the turn
   is the thing you are meant to watch. */
const STIFF = 170, DAMP = 26;
const RAIL_AX = { get: () => hx, set: v => { hx = v; }, lo: () => FIRST, hi: () => LAST, give: .16 };
/* Each pad owns its page axis. One shared axis with a `pad` pointer meant a
   turn still in the air kept writing to whichever pad you had since slid to. */
const NO_PAGE = { get: () => 0, set(){}, lo: () => 0, hi: () => 0, give: .5 };
function pageAxisOf(pad){
  if (!pad) return NO_PAGE;
  return pad.ax || (pad.ax = {
    get: () => pad.pv, set: v => { pad.pv = v; },
    lo: () => 0, hi: () => pad.hi,
    /* a pad with nothing behind its face still gives, so pulling at it curls
       and springs back rather than feeling dead */
    give: pad.hi > 0 ? .14 : .5,
    /* Reading down the head of a post, it stays where it is let go, as a
       page scrolled by hand does; pulled on past the paragraph, it springs
       back to it, unless pulled far enough to go on into the post. */
    /* What one trackpad gesture may do, momentum and all, from where it
       starts: turn the last sheet over onto the post and stop there; read
       down to the end of the first paragraph and stop there; and only a
       gesture begun at the end of it may pull on into the post. And reading
       goes with the trackpad one to one, as scrolling a page does. */
    gesture: pad.post && (start => {
      const L = pad.sheets.length, post = pad.post;
      if (start < L - .01) return { hi: Math.min(Math.floor(start + 1e-6) + 1, L) };
      /* and reading back up stops at the top of the post, before the sheet */
      const end = L + needOf(post) / unitOf(post), lo = start > L + .01 ? L : L - 1;
      if (start < end - 2 / unitOf(post)) return { lo, hi: end };
      /* the first pull only brings the line up; it takes another to go */
      return post.primed ? { lo } : { lo, hi: end + PULL_GO * .8 / unitOf(post) };
    }),
    perPx: pad.post && (raw => raw >= pad.sheets.length - 1e-6 ? 1 / unitOf(pad.post) : 0),
    rest: pad.post && ((x, from) => {
      const L = pad.sheets.length;
      if (x <= L || from < L - 1) return null;
      const post = pad.post, unit = unitOf(post), px = (x - L) * unit;
      if (px - needOf(post) >= PULL_GO) return pad.hi;
      return L + Math.min(px, needOf(post)) / unit;
    })
  });
}
function pageAxis(){ return pageAxisOf(padOf(clamp(Math.round(hx), FIRST, LAST))); }

/* One animation per axis, not one in total. A single global meant grabbing the
   page cancelled a rail slide still in the air and left it stranded between
   two stations, with nothing to bring it home — which is how the rail ends up
   somewhere nobody asked for. */
let anims = [], raf = 0, last = 0;
function springTo(ax, target, v0){
  anims = anims.filter(a => a.ax !== ax);
  anims.push({ ax, target: clamp(target, ax.lo(), ax.hi()), v: v0 || 0 });
  /* Heading for a station, every other pad on the wall closes back to its
     first page, so whatever you come back to starts from the beginning. The
     one you leave flips shut as it slides away. */
  if (ax === RAIL_AX){
    const to = clamp(Math.round(target), FIRST, LAST);
    PADS.forEach((pad, i) => {
      if (i !== to && (pad.pv || flightOf(pageAxisOf(pad)))) springTo(pageAxisOf(pad), 0);
    });
  }
  if (!raf){ last = performance.now(); raf = requestAnimationFrame(tick); }
}
function tick(now){
  const dt = clamp((now - last) / 1000, .001, .032); last = now;
  anims = anims.filter(a => {
    let x = a.ax.get();
    a.v += (-STIFF * (x - a.target) - DAMP * a.v) * dt;
    x += a.v * dt;
    if (Math.abs(x - a.target) < .0006 && Math.abs(a.v) < .02){ a.ax.set(a.target); return false; }
    a.ax.set(x); return true;
  });
  render();
  raf = anims.length ? requestAnimationFrame(tick) : 0;
}
/* stop one axis, or everything if none is named */
function stop(ax){
  anims = ax ? anims.filter(a => a.ax !== ax) : [];
  if (!anims.length && raf){ cancelAnimationFrame(raf); raf = 0; }
}
function flightOf(ax){ return anims.find(a => a.ax === ax); }

/* A quarter of the way over, or a flick that would carry it there. Demanding
   much more is what makes a page feel heavy: you do the work and it sulks back
   down. */
const COMMIT = .3, CARRY = .3;
/* `from` is where the gesture began, and it has to be carried in. Rounding the
   live value instead means that once you are past halfway it rounds to the
   page you are heading for, the test then asks whether you have moved far
   enough away from THAT, and anything between half and three quarters of a
   turn gets sent back where it started. That is the whole feeling of the page
   being heavy: you do the work and it drops. */
function settle(ax, v, from){
  const proj = ax.get() + v * CARRY;
  /* an axis may know better where it comes to rest */
  const own = ax.rest && ax.rest(ax.get(), from);
  if (own != null) return springTo(ax, own, v);
  const t = proj > from + COMMIT ? from + 1 : proj < from - COMMIT ? from - 1 : from;
  springTo(ax, t, v);
}
const RUB = (over, give) => (1 - 1 / (over / give * .55 + 1)) * give;
function bounded(ax, x){
  const lo = ax.lo(), hi = ax.hi();
  if (x < lo) return lo - RUB(lo - x, ax.give);
  if (x > hi) return hi + RUB(x - hi, ax.give);
  return x;
}

/* ---------- the air around the sheet ----------
   Flat on arrival, then the bow lifts after a beat. Until you touch something
   the paper moves in a draught: the bow breathes, and the lift runs from one
   bottom corner to the other and back, so the two sides never rise together.
   The draught reaches the sheets waiting either side too, which on the index
   is the only paper on screen. A mouse over a sheet lifts the corner nearest
   it, more the lower it is, and a phone that reports its tilt leans the fold
   as you move it. Touching anything stills the draught; leave everything
   alone and it comes back. */
const TILT = 11, HOVER_LIFT = .9, STILL = 3500;
/* The draught comes in gusts: the sheet opens and closes on a slow beat,
   BREATH seconds a gust, each one taking the other corner. GUST is how far
   past its resting bow a gust opens it. */
const BREATH = 2.9, GUST = 2;
let woken = false, airT0 = 0, airRaf = 0, airLast = 0, touchedAt = 0, stillT = 0;
let draught = 0, hover = null, lean = null;
/* the hand's own lean on the page it is turning, and the lean and lift a
   slide along the rail puts into every sheet as it passes */
let handTilt = 0, slideVel = 0, slideTilt = 0, slideLift = 0, lastHx = null;
function rise(age){
  if (age <= BOW_WAIT) return 0;
  const r = clamp01((age - BOW_WAIT) / BOW_RISE);
  return r * r * (3 - 2 * r);
}
/* bowMul and tilt are the sheet in the middle at rest, and what the phone
   does to it. Each pad's gusts open that bow by pad.flap, lift a sheet
   waiting to the side, which has none of its own, by pad.air, and lean it
   by pad.lean. Each pad also keeps its own eased share of the mouse. */
function airTick(now){
  const dt = clamp((now - airLast) / 1000, .001, .05); airLast = now;
  const busy = !!g || !!w || anims.length > 0;
  const up = woken ? 1 : rise(now - airT0);
  const want = !busy && !hover && (!woken || now - touchedAt > STILL);
  /* the draught comes back gently and drops at once when you reach for it */
  draught += ((want ? 1 : 0) - draught) * (1 - Math.exp(-dt * (want ? 1.2 : 4)));
  if (draught < .001 && !want) draught = 0;
  const s = (now - airT0) / 1000, TAU = Math.PI * 2;
  /* Every sheet has its own gusts. Open and close on the beat, some gusts a
     little stronger than others; the lean swings at half the beat, so it
     peaks one way on this gust and the other way on the next, and lies level
     while the sheet is closed. Each pad is a little late on the one before
     and keeps a slightly different beat, so two sheets on screen never move
     together. */
  PADS.forEach((pad, i) => {
    const q = s * (1 + .09 * Math.sin(i * 2.4)) + i * 1.13;
    const ph = q / BREATH * TAU;
    const swell = Math.pow(.5 - .5 * Math.cos(ph), 1.4);   /* lingers closed, opens quicker */
    pad.flap = draught * GUST * (.8 + .2 * Math.sin(q * TAU / 11.3)) * swell;
    pad.air = up * (draught + pad.flap);
    pad.lean = up * draught * TILT * Math.sin(ph / 2) * (.85 + .15 * Math.sin(q * TAU / 7.1));
  });
  const k = 1 - Math.exp(-dt * 6);
  const b = up + (lean && !busy ? lean.lift : 0);
  const l = lean && !busy ? lean.tilt : 0;
  bowMul += (b - bowMul) * k;
  tilt += (l - tilt) * k;
  /* a page let go of comes level again */
  if (!g && !w) handTilt += (0 - handTilt) * (1 - Math.exp(-dt * 5));
  /* Slide along the rail and the sheets lean against it, the trailing corner
     lifting, and settle as the rail comes to rest. */
  const v = lastHx === null ? 0 : (hx - lastHx) / dt; lastHx = hx;
  slideVel += (v - slideVel) * (1 - Math.exp(-dt * 10));
  slideTilt = -clamp(slideVel / 2.2, -1, 1) * TILT;
  slideLift = Math.min(1, Math.abs(slideVel) / 2.2) * .7;
  let still = !busy && !draught && !want && !lean && up === 1 &&
              Math.abs(b - bowMul) < .002 && Math.abs(l - tilt) < .02 &&
              Math.abs(handTilt) < .02 && Math.abs(slideVel) < .01;
  if (still){ bowMul = b; tilt = l; handTilt = 0; slideVel = slideTilt = slideLift = 0; }
  PADS.forEach((pad, i) => {
    const h = hover && !busy && hover.i === i ? hover : null;
    const ha = h ? h.amt : 0, hs = h ? h.amt * h.side : 0;
    pad.ha = (pad.ha || 0) + (ha - (pad.ha || 0)) * k;
    pad.hs = (pad.hs || 0) + (hs - (pad.hs || 0)) * k;
    if (Math.abs(pad.ha - ha) < .002 && Math.abs(pad.hs - hs) < .002){ pad.ha = ha; pad.hs = hs; }
    else still = false;
    if (h) still = false;
  });
  render();
  airRaf = still ? 0 : requestAnimationFrame(airTick);
}
function stir(){
  if (reduce || airRaf || !airT0) return;
  airLast = performance.now();
  airRaf = requestAnimationFrame(airTick);
}
function startBreathing(){
  if (reduce){ bowMul = 1; render(); return; }
  airT0 = performance.now();
  stir();
}
/* every touch stills the draught and puts off its return */
function wake(){
  woken = true;
  touchedAt = performance.now();
  clearTimeout(stillT);
  stillT = setTimeout(stir, STILL + 50);
  stir();
}

/* The corner nearest the mouse comes up to meet it: which corner by where it
   is across the sheet, how far by how low. Any sheet on screen, once the rail
   has stopped moving. */
function hoverAt(x, y){
  if (Math.abs(hx - Math.round(hx)) > .08) return null;
  for (let i = 0; i < PADS.length; i++){
    if (i !== Math.round(hx)) continue;      /* only the sheet in the middle */
    const r = RAIL.find(([, j]) => j === i)[0].getBoundingClientRect();
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const across = 1 - clamp01(Math.max(0, -fx, fx - 1) / .12);
    const d = clamp01((fy - .1) / .9), down = d * d * (3 - 2 * d) * (1 - clamp01((fy - 1) / .12));
    const amt = across * down;
    if (amt > .01) return { i, amt, side: clamp((.5 - fx) * 2.4, -1, 1) };
  }
  return null;
}
if (!reduce){
  stage.addEventListener('pointermove', e => {
    if (g || e.pointerType === 'touch') return;
    hover = hoverAt(e.clientX, e.clientY); stir();
  });
  stage.addEventListener('pointerleave', () => { hover = null; stir(); });
}

/* A phone that reports its tilt without asking. What moves the paper is the
   change, not the angle: the phone's pose is followed slowly, and only how far
   it has just swung from that leans the fold and lifts the sheet, so however
   you hold it the paper comes to rest. iOS would put up a permission prompt
   for this, and a dialog is no invitation, so there it is left alone. */
if (!reduce && self.DeviceOrientationEvent &&
    typeof DeviceOrientationEvent.requestPermission !== 'function'){
  let pose = null;
  addEventListener('deviceorientation', e => {
    if (e.beta == null || e.gamma == null) return;
    const now = performance.now();
    const a = ((screen.orientation && screen.orientation.angle) || self.orientation || 0) % 360;
    const lr = a === 90 ? e.beta : a === 270 || a === -90 ? -e.beta : e.gamma;
    const fb = a === 90 ? -e.gamma : a === 270 || a === -90 ? e.gamma : e.beta;
    if (!pose){ pose = { lr, fb, t: now }; return; }
    const k = 1 - Math.exp(-clamp((now - pose.t) / 1000, 0, .2) / 1.6);
    pose.t = now; pose.lr += (lr - pose.lr) * k; pose.fb += (fb - pose.fb) * k;
    const dl = clamp((lr - pose.lr) / 18, -1, 1), df = clamp((fb - pose.fb) / 18, -1, 1);
    lean = Math.abs(dl) < .01 && Math.abs(df) < .01 ? null
      : { tilt: TILT * 1.2 * dl, lift: .7 * Math.max(Math.abs(dl), Math.abs(df)) };
    stir();
  });
}

/* ---------- hand ---------- */
function speed(s){
  if (s.length < 2) return 0;
  const a = s[0], b = s[s.length - 1], dt = (b[0] - a[0]) / 1000;
  return dt > .008 ? clamp((b[1] - a[1]) / dt, -12, 12) : 0;
}
let g = null;
stage.addEventListener('pointerdown', e => {
  wake();     /* nothing is stopped yet: the axis is not known until you move */
  g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: null, base: 0, s: [] };
  /* where across the sheet you took hold of it, -1 at its left edge to 1 at
     its right, and how wide it is on screen */
  const st = RAIL.find(([, j]) => j === Math.round(hx));
  const r = st ? st[0].getBoundingClientRect() : { left: 0, width: W() };
  g.at = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
  g.pw = r.width;
});
stage.addEventListener('pointermove', e => {
  if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  if (!g.ax){
    if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
    g.ax = Math.abs(dx) > Math.abs(dy) ? RAIL_AX : pageAxis();
    stop(g.ax);                 /* take over this axis, leave the others flying */
    g.base = g.ax.get();
    g.from = Math.round(g.base);
    try { stage.setPointerCapture(e.pointerId); g.held = true; } catch (_) {}
    g.x0 = e.clientX; g.y0 = e.clientY;
    return;
  }
  /* the rail follows the hand: pull right and the index comes in from the
     left, push left and the poster comes in from the right. Pull up and the
     page turns. */
  const raw = g.ax === RAIL_AX
    ? g.base - (e.clientX - g.x0) / (W() * .42)
    : g.base - (e.clientY - g.y0) / (H() * .5);
  g.ax.set(bounded(g.ax, raw));
  /* Turning a page, the hand leans the fold: take it by a corner and that
     corner leads, and drawing sideways as you lift leans it further that
     way, so a page can go over to the left or to the right. */
  if (g.ax !== RAIL_AX)
    handTilt = TILT_MAX * clamp(-.6 * g.at + (e.clientX - g.x0) / (g.pw * .45), -1, 1);
  g.s.push([e.timeStamp, g.ax.get()]);
  while (g.s.length > 2 && e.timeStamp - g.s[0][0] > 90) g.s.shift();
  render();
});
function release(e){
  if (!g || (e && e.pointerId !== g.id)) return;
  if (g.held) try { stage.releasePointerCapture(g.id); } catch (_) {}
  const ax = g.ax, s = g.s, from = g.from; g = null;
  if (ax) draggedAt = performance.now();
  wake();     /* the draught's quiet is counted from when you let go */
  if (ax && s.length) settle(ax, speed(s), from);
  /* not a drag at all: a click */
  else if (!ax && e && e.type === 'pointerup' && !e.button) tap(e);
}
/* The oldest way to turn a page: click it. A click on the page in the
   middle turns it over, as the arrow key does; a click on one waiting to the
   side slides along to it, and a click on his line starts the stories. Links, the books and the posts' cards keep their
   own clicks. */
function tap(e){
  if (e.target.closest('a[href], button, input')) return;
  const hit = RAIL.find(([st]) => {
    const r = st.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (!hit) return;
  const [, i] = hit, here = clamp(Math.round(hx), FIRST, LAST);
  const step = (ax, d) => {
    const flight = flightOf(ax);
    const from = flight ? flight.target : Math.round(ax.get());
    stop(ax); springTo(ax, from + d, 0);
  };
  if (i === here){
    const pad = padOf(i);
    if (pad && pad.onward) openLatest(pad);      /* the blog's pages open their posts */
    else if (pad) step(pageAxisOf(pad), 1);
    /* his line on the index: a click on it is to hear the stories; the one
       at the end is only its links */
    else if (i < LAST){ stop(RAIL_AX); springTo(RAIL_AX, i + 1, 0); }
  } else {
    stop(RAIL_AX); springTo(RAIL_AX, i, 0);
  }
}
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
/* a drag that began on a book is a turn or a slide, not a click on it */
let draggedAt = -1e9;
stage.addEventListener('click', e => {
  if (performance.now() - draggedAt < 350 && e.target.closest('a')) e.preventDefault();
}, true);
stage.addEventListener('dragstart', e => e.preventDefault());
/* Tabbing to a link: the rail goes to its station, rather than the
   browser scrolling the stage to bring it into view, and on the blog's
   poster the page turns to its post */
stage.addEventListener('focusin', e => {
  const hit = RAIL.find(([st]) => st.contains(e.target));
  if (!hit) return;
  stage.scrollLeft = stage.scrollTop = 0;
  const [, i] = hit;
  if (Math.round(hx) !== i){ wake(); stop(RAIL_AX); springTo(RAIL_AX, i, 0); }
  const page = e.target.dataset && e.target.dataset.page, pad = padOf(i);
  if (page != null && pad && Math.round(pad.pv) !== +page){ wake(); stop(pageAxisOf(pad)); springTo(pageAxisOf(pad), +page, 0); }
});
/* and leaving by one of them notes where the site stood, as a pull does */
stage.addEventListener('click', e => {
  const a = e.target.closest('a.go');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  leaveFor(a.href, a.dataset.note || '');
});
stage.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

/* ---------- trackpad, on the same two axes ---------- */
let wT = 0, w = null;
/* Arriving back from a post, the trackpad may still be coasting from the
   gesture that left it, and that would turn the pages under the picture.
   Until the wheel has been still for a moment, it is not listened to. */
let coast = 0, coastLast = 0;
stage.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  if (coast){
    /* a second of nothing at all, then as long as it keeps coming without a
       break, up to two and a half */
    const now = performance.now(), gone = now - (coast - 2500);
    if (gone < 1000 || (gone < 2500 && now - coastLast < 200)){ coastLast = now; e.preventDefault(); return; }
    coast = 0;
  }
  e.preventDefault(); wake();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H() : 1;
  const dx = e.deltaX * k, dy = e.deltaY * k;
  if (!w){
    const ax = Math.abs(dx) > Math.abs(dy) ? RAIL_AX : pageAxis();
    stop(ax);
    /* One gesture, however hard, and however long its momentum runs on,
       goes one step and no further: one page, one station. Letting it run
       on turned three or four pages in a swipe on a big screen, and
       straight through the last of them into the post. */
    const x = ax.get(), from = Math.round(x);
    w = Object.assign({ ax, raw: x, from, side: 0, lo: from - 1, hi: from + 1 },
                      ax.gesture ? ax.gesture(x) : {});
  }
  /* on a trackpad the sideways part of a turn leans the fold the same way */
  if (w.ax !== RAIL_AX){
    w.side += dx;
    handTilt = TILT_MAX * clamp(-w.side / (W() * .2), -1, 1);
  }
  const per = w.ax === RAIL_AX ? 2.2 / (W() * .42) : (w.ax.perPx && w.ax.perPx(w.raw)) || 2.2 / (H() * .5);
  w.raw += (w.ax === RAIL_AX ? dx : dy) * per;
  /* past what this gesture may reach it only gives a little, and what is
     pushed past there is not kept to be undone on the way back */
  const edge = .05;
  if (w.raw > w.hi + edge) w.raw = w.hi + edge;
  if (w.raw < w.lo - edge) w.raw = w.lo - edge;
  const at = w.raw > w.hi ? w.hi + RUB(w.raw - w.hi, edge) : w.raw < w.lo ? w.lo - RUB(w.lo - w.raw, edge) : w.raw;
  w.ax.set(bounded(w.ax, at));
  render();
  clearTimeout(wT);
  wT = setTimeout(() => { const q = w; w = null; settle(q.ax, 0, q.from); }, 90);
}, { passive: false });

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  /* step from where we are heading, not from where we happen to be: two quick
     presses during one flight would otherwise both resolve to the same stop */
  const go = (ax, d) => {
    e.preventDefault(); wake();
    const flight = flightOf(ax);
    const from = flight ? flight.target : Math.round(ax.get());
    stop(ax); springTo(ax, from + d, 0);
  };
  if (e.key === 'ArrowRight') go(RAIL_AX, 1);
  else if (e.key === 'ArrowLeft') go(RAIL_AX, -1);
  else if (e.key === 'ArrowUp' || e.key === ' ') go(pageAxis(), 1);
  else if (e.key === 'ArrowDown') go(pageAxis(), -1);
});

addEventListener('pageshow', e => {
  if (!e.persisted) return;
  leaveFor.gone = false;
  PADS.forEach(pad => {
    if (pad.onward && pad.pv > pad.hi - 1){ stop(pageAxisOf(pad)); springTo(pageAxisOf(pad), pad.hi - 1); }
    if (!pad.post) return;
    pad.post.going = false;
    pad.post.primed = false;
    pad.post.page.style.transition = '';
    pad.post._sig = null;
    if (pad.pv > pad.sheets.length){ stop(pageAxisOf(pad)); springTo(pageAxisOf(pad), pad.sheets.length); }
  });
});

let resizeT = 0;
function relayout(){
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    PADS.forEach(pad => { pad.sheets.forEach(dropCurl); if (pad.post) pad.post.need = null; });
    measure(); fitSheets(); render();
  }, 140);
}
addEventListener('resize', relayout);
/* A curl is sliced once, at whatever the sheet measured when it was built,
   and nothing re-reads that per frame. A resize event is not enough on its
   own to catch every change of the box: an iOS URL bar collapsing, a
   rotation and an embedded pane can each move it without one arriving in
   time, and the strips then stand at the old height while the page clone
   inside them ends short — which showed as a band of the sheet's ground
   colour along the foot, tens of pixels of it. Watch the box itself. */
if (self.ResizeObserver) new ResizeObserver(relayout).observe(story);

let shown = false;
function reveal(){
  if (shown) return; shown = true;
  measure(); fitSheets(); render();
  stage.classList.add('up');
  startBreathing();
  if (onUp) onUp();
}
/* Something to do once the page is up: a pad come back to as it was left,
   going back to where it rests. */
let onUp = null;
/* Ask for the faces the paper is set in by name. The sheets were only just
   built, so waiting on document.fonts.ready alone could resolve before the
   browser had even noticed it needed them. */
Promise.all(['1em "EB Garamond"', '500 1em "EB Garamond"'].map(f => document.fonts.load(f)))
  .then(() => document.fonts.ready).then(reveal, reveal);
setTimeout(reveal, 1800);       /* if the fonts never turn up, show it anyway */
/* then, once everything on the first screen is in, reach a step further */
const further = () => {
  litNear = 2.5; light();
  PADS.forEach(pad => { if (pad.onward) fillLatest(pad); });
  /* the faces of the pages under the first, and then those pages set again
     in them: refitted, and every curl rebuilt, since each carries copies of
     the pages as they were when it was cut */
  stage.classList.add('faces');
  stage.classList.add('covers');     /* and the book covers on the shelf */
  Promise.all(['1em "Crimson Pro"', '1em Cardo', '700 1em Cardo'].map(f => document.fonts.load(f)))
    .then(() => { PADS.forEach(pad => pad.sheets.forEach(dropCurl)); fitSheets(); render(); }, () => {});
};
const idle = () => (self.requestIdleCallback || (f => setTimeout(f, 300)))(further);
if (document.readyState === 'complete') idle(); else addEventListener('load', idle);
/* Back from a post the rail went to, or zoomed out of it: the address says
   which (#read=slug). Stand at the head of the post again, before the first
   frame, then take the note off the address so a reload starts afresh. */
(() => {
  const b = location.hash.match(/^#read=blog\.(\d+)$/);
  if (b){
    /* back from the blog's poster: at the page that was opened, or at the
       last of them if it went on to the whole blog */
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
    const i = PADS.findIndex(pad => pad.onward);
    if (i < 0) return;
    const pad = PADS[i];
    hx = i;
    pad.pv = Math.min(+b[1], pad.sheets.length - 1);
    coast = performance.now() + 2500; coastLast = performance.now();
    fillLatest(pad);
    litNear = 2.5; light();
    return;
  }
  /* #read=slug is the back button, at the head of the post; #read=slug.last
     is the post pulled back down past its top, at the poster's last sheet */
  const m = location.hash.match(/^#read=([\w-]+?)(\.last)?$/);
  if (!m) return;
  const i = PADS.findIndex(pad => pad.post && pad.post.slug === m[1]);
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
  if (i < 0) return;
  const pad = PADS[i];
  hx = i;
  /* either way it opens as it was left, on the head of the post; pulled
     back from the post, the last sheet then comes down over it, as if the
     turn that went there were going back */
  pad.pv = pad.sheets.length;
  coast = performance.now() + 2500; coastLast = performance.now();
  pad.post.load();
  light();
  if (m[2]){
    pad.calm = true;
    const down = () => setTimeout(() => springTo(pageAxisOf(pad), pad.sheets.length - 1), 350);
    if (shown) down(); else onUp = down;
  }
})();
addEventListener('pageshow', e => {
  // kept whole by the browser on the way back: the address still has the note
  if (e.persisted && location.hash.startsWith('#read=')) try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
});
measure(); render();
})();
