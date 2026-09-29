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

const $ = s => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const clamp01 = x => clamp(x, 0, 1);
const RAD = Math.PI / 180;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = $('#stage'), rail = $('#rail'), story = $('#story');
const indexText = $('#index p');
const IDX_DIM = .22, IDX_LIT = .92;     /* faded in the corner of the eye, lit when it is yours */
/* the rail, left to right, with where each one sits along it */
const RAIL = [[$('#index'), -1], [story, 0], [$('#blockchain'), 1],
              [$('#maps'), 2], [$('#triangle'), 3]];
const FIRST = RAIL[0][1], LAST = RAIL[RAIL.length - 1][1];


/* A pad is a station with sheets in it. Both the story and the poster are
   pads, so they bow, curl and zoom on the same machinery — the only
   difference is what is printed on the paper. */
const faceHTML = p => p.art
  ? `<div class="face art ${p.art}"></div>`
  : `<div class="face ${p.cls || ''}">
       <header class="run"><span>${p.run[0]}</span><span>${p.run[1]}</span></header>
       <div class="body">${p.body}</div>
       <footer class="folio">${p.folio}</footer>
     </div>`;
function buildPad(station, pages){
  const cap = station.querySelector('.cap');
  const sheets = pages.map((p, i) => {
    const sh = el('div', 'sheet');
    sh.innerHTML = faceHTML(p);
    sh.style.zIndex = 20 - i;
    station.insertBefore(sh, cap);
    return sh;
  });
  /* A pad whose pages carry their own line tells its story one page at a
     time underneath, in place of a title: every line is set, stacked, and
     render() shows the one for the page in hand. */
  let lines = null;
  if (pages.some(p => p.cap)){
    cap.textContent = '';
    lines = pages.map(p => {
      const l = el('span', 'line');
      l.textContent = p.cap || '';
      cap.append(l);
      return l;
    });
  }
  return { sheets, pv: 0, cap, lines };
}
const PADS = [buildPad(story, PAGES),
              buildPad($('#blockchain'), [
                { art: 'eth1', cap: 'Very few people understood what exactly we were doing, even among the team.' },
                { art: 'eth2', cap: 'The launch pages were based on my own experience of trying to get it all to work. Recipes to build a new kind of society.' }]),
              buildPad($('#maps'), [{ art: 'maps' }, { art: 'felv' }, { art: 'gosper' }]),
              buildPad($('#triangle'), [{ art: 'triangle' }])];
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
    under.append(a2, b2, d2);
    parts.push({ face: band('fr', copy), back: band('bk', under),
                 copy, under, a1, b1, a2, b2, d1, d2, half: ph / 2 });
  }
  const cast = el('div', 'cast'), plate = el('div', 'plate'), pool = el('div', 'pool');
  plate.style.backgroundColor = bg;
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

/* Measured, never read back out of a custom property: --pw is a calc() of a
   min(), and getComputedStyle hands those back as the unresolved token, so
   parseFloat gives NaN and every transform built from it is silently dropped.
   Measured once and kept, too: the breathing loop renders every frame, and
   reading offsetWidth in there would force a reflow on each of them. */
let STEP = 0;
function measure(){
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
  const ph = story.offsetHeight;
  let foot = 0;
  PADS.forEach(pad => {
    if (!pad.lines) return;
    const tallest = Math.max(...pad.lines.map(l => l.offsetHeight));
    foot = Math.max(foot, pad.cap.offsetTop + tallest - ph / 2);
  });
  zoomBy = foot ? clamp((H() / 2 - 14) / foot - 1, 0, ZOOM) : ZOOM;
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
  /* which sheet is in hand, by index rather than by the sign of a number that
     rubber-bands past zero — otherwise an over-pull downwards drops the curl
     and the page snaps flat for a frame */
  const front = clamp(Math.floor(pad.pv + 1e-9), 0, pad.sheets.length - 1);
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
}

/* The line for the page in hand. Each fades out over the first half of a turn
   and the next fades in over the second, so two sentences are never on top
   of each other. A pad waiting beside the one in the middle keeps its line,
   quieter, as the thing along from here. */
function paintLines(pad, d){
  if (!pad.lines) return;
  const on = (.85 * (.4 + .6 * nearness(d))).toFixed(3);
  if (pad.capOn !== on){ pad.capOn = on; pad.cap.style.opacity = on; }
  pad.lines.forEach((l, j) => {
    const o = clamp01(1 - Math.abs(pad.pv - j) * 2.2).toFixed(3);
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
  const depth = p => p ? clamp01(p.pv / Math.max(1, p.sheets.length - 1)) : 0;
  const zoom = 1 + zoomBy * (depth(padOf(lo)) * (1 - t) + depth(padOf(lo + 1)) * t);
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
  light();
  /* a pad's index in PADS is where it sits on the rail: story 0, then the
     posters rightwards */
  PADS.forEach((pad, i) => {
    paintLines(pad, Math.abs(i - hx));
    /* n is how much this is the sheet in the middle, m how much a neighbour */
    const d = Math.abs(i - hx), n = nearness(d), m = clamp01((1.4 - d) / .5) * (1 - n);
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
    lo: () => 0, hi: () => pad.sheets.length - 1,
    /* a pad with nothing behind its face still gives, so pulling at it curls
       and springs back rather than feeling dead */
    give: pad.sheets.length > 1 ? .14 : .5
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
    if (Math.abs(i - hx) > 1.2) continue;
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
  wake();     /* the draught's quiet is counted from when you let go */
  if (ax && s.length) settle(ax, speed(s), from);
}
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('dragstart', e => e.preventDefault());
stage.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

/* ---------- trackpad, on the same two axes ---------- */
let wT = 0, w = null;
stage.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault(); wake();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H() : 1;
  const dx = e.deltaX * k, dy = e.deltaY * k;
  if (!w){
    const ax = Math.abs(dx) > Math.abs(dy) ? RAIL_AX : pageAxis();
    stop(ax);
    w = { ax, raw: ax.get(), from: Math.round(ax.get()), side: 0 };
  }
  /* on a trackpad the sideways part of a turn leans the fold the same way */
  if (w.ax !== RAIL_AX){
    w.side += dx;
    handTilt = TILT_MAX * clamp(-w.side / (W() * .2), -1, 1);
  }
  w.raw += w.ax === RAIL_AX ? dx * 2.2 / (W() * .42) : dy * 2.2 / (H() * .5);
  w.ax.set(bounded(w.ax, w.raw));
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

let resizeT = 0;
function relayout(){
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    PADS.forEach(pad => pad.sheets.forEach(dropCurl));
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
}
/* Ask for the faces the paper is set in by name. The sheets were only just
   built, so waiting on document.fonts.ready alone could resolve before the
   browser had even noticed it needed them. */
Promise.all(['1em "EB Garamond"', '500 1em "EB Garamond"'].map(f => document.fonts.load(f)))
  .then(() => document.fonts.ready).then(reveal, reveal);
setTimeout(reveal, 1800);       /* if the fonts never turn up, show it anyway */
/* then, once everything on the first screen is in, reach a step further */
const further = () => {
  litNear = 2.5; light();
  /* the faces of the pages under the first, and then those pages set again
     in them: refitted, and every curl rebuilt, since each carries copies of
     the pages as they were when it was cut */
  stage.classList.add('faces');
  Promise.all(['1em "Crimson Pro"', '1em Cardo', '700 1em Cardo'].map(f => document.fonts.load(f)))
    .then(() => { PADS.forEach(pad => pad.sheets.forEach(dropCurl)); fitSheets(); render(); }, () => {});
};
const idle = () => (self.requestIdleCallback || (f => setTimeout(f, 300)))(further);
if (document.readyState === 'complete') idle(); else addEventListener('load', idle);
measure(); render();
})();
