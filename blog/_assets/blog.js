/* Reading on, and back.

   At the foot of a post is the next one, as a card. Scroll on past it, or
   click it, and it opens where it is: its paper and picture grow into the
   sheet (a view transition, where the browser has them), the post is
   fetched into the page, and the next card waits under it. The address
   follows whichever post is being read.

   Going back up, a grey bar with the blog's name comes down from the top;
   it goes away again as you read on, and clicking it goes to the index, the
   name growing into the index's title. At the top of a post the post before
   it is put back above only if that is how you got here, reading it to the
   end and going on, like a back button; otherwise pulling on past the
   top draws the post back, a line above it saying where it goes, and pulled
   hard enough it goes to the index, where it shrinks into its card.

   Coming from the site, the post opens as far down as it was being read
   there (#at=px), so the hand-over does not move it.

   Without this script the card is a plain link and the rest is not there. */
/* Pulling on past the top of a page draws it back from you, smaller the
   further you go, and a line comes down above it saying where it goes; far
   enough, and it goes there. A wheel or trackpad pushing up at the top, or
   a finger dragging down. The browser's own pull (to refresh, or to bounce)
   is turned off in blog.css, so this is the only one. */
/* Two fingers: pinching in on a page is the way out of it, spreading them
   on a card the way into it. Whoever handles pinches says, from where they
   start and which way they go, whether this one is theirs; the first taker
   has it, and one nobody takes is left to the browser, so spreading two
   fingers on a post still zooms in to read it. A finger pinch on a phone
   (Safari's own gesture events there, touches elsewhere), and a trackpad
   pinch, which Chrome and Firefox send as the wheel with ctrl held. */
const pinchers = [];
(() => {
  let s = null, x = innerWidth / 2, y = innerHeight / 2;
  const born = performance.now();
  const begin = dir => {
    // the pinch that brought us here, still going as the page comes: not a new one
    if (performance.now() - born < 900) return null;
    for (const h of pinchers) { const t = h(dir, x, y); if (t) return t; }
    return null;
  };
  const end = () => { if (s && s !== "no") s.end(); s = null; };
  addEventListener("mousemove", e => { x = e.clientX; y = e.clientY; }, { passive: true });
  if ("ongesturestart" in self) {
    // Safari, on a phone and on a Mac: it says how far apart, as a scale
    addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }, { passive: true });
    addEventListener("gesturestart", () => { s = null; });
    addEventListener("gesturechange", e => {
      if (s === "no") return;
      if (!s) {
        if (Math.abs(e.scale - 1) < .02) { e.preventDefault(); return; }
        s = begin(e.scale < 1 ? "in" : "out") || "no";
        if (s === "no") return;
      }
      e.preventDefault();
      s.move(e.scale);
    }, { passive: false });
    addEventListener("gestureend", end);
  } else {
    let d0 = 0;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    addEventListener("touchstart", e => {
      if (e.touches.length !== 2) return;
      d0 = dist(e.touches); s = null;
      x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }, { passive: true });
    addEventListener("touchmove", e => {
      if (e.touches.length !== 2 || !d0 || s === "no") return;
      const k = dist(e.touches) / d0;
      if (!s) {
        if (Math.abs(k - 1) < .04) return;
        s = begin(k < 1 ? "in" : "out") || "no";
        if (s === "no") return;
      }
      e.preventDefault();
      s.move(k);
    }, { passive: false });
    addEventListener("touchend", e => { if (e.touches.length < 2) { d0 = 0; end(); } }, { passive: true });
  }
  // a trackpad pinch, as the wheel with ctrl held; it ends when it stops
  let k = 1, wT = 0;
  addEventListener("wheel", e => {
    if (!e.ctrlKey) return;
    if (s === null) {
      k = 1;
      s = begin(e.deltaY > 0 ? "in" : "out") || "no";
    }
    clearTimeout(wT);
    wT = setTimeout(end, 160);
    if (s === "no") return;
    e.preventDefault();
    k *= Math.exp(-e.deltaY / 120);
    s.move(k);
  }, { passive: false });
})();

/* Spreading two fingers on a card grows it towards you, and far enough it
   opens, as a click on it would: on the index, and the next post's card
   under a post. Let go sooner and it settles back. */
pinchers.push((dir, x, y) => {
  if (dir !== "out") return null;
  const hit = document.elementFromPoint(x, y);
  const c = hit && hit.closest("a.card");
  if (!c) return null;
  let k = 1;
  c.style.zIndex = "5";
  c.style.transition = "none";
  return {
    move: v => { k = v; c.style.scale = Math.min(1.6, Math.max(1, v)).toFixed(3); },
    end: () => {
      if (k > 1.3) { c.click(); return; }
      c.style.transition = "scale .3s cubic-bezier(.2,.7,.2,1)";
      c.style.scale = "";
      setTimeout(() => { c.style.zIndex = ""; c.style.transition = ""; }, 320);
    },
  };
});
// kept whole by the browser on the way back: the card is not still grown
addEventListener("pageshow", e => {
  if (e.persisted) document.querySelectorAll("a.card[style]").forEach(c => {
    c.style.scale = ""; c.style.zIndex = ""; c.style.transition = "";
  });
});

function pullAtTop(label, go, gone, PULL = 150) {
  let pull = 0, pullT = 0;
  const note = document.createElement("p");
  note.className = "pullnote";
  note.setAttribute("aria-hidden", "true");
  note.textContent = label;
  document.body.append(note);
  let pinching = false;
  const setPull = v => {
    pull = Math.max(0, v);
    const k = Math.min(1, pull / PULL);
    document.body.style.setProperty("--pullk", (1 - Math.pow(1 - k, 2)).toFixed(3));
    document.body.classList.toggle("pulling", pull > 0);
    if (k >= 1) go(note, pinching ? "pinch" : "pull");
  };
  const letGo = () => {
    clearTimeout(pullT);
    if (!pull || gone()) return;
    document.body.classList.add("letgo");
    setPull(0);
    setTimeout(() => {
      document.body.classList.remove("letgo");
      if (!pull) document.body.style.removeProperty("--pull-oy");
    }, 350);
  };
  /* Pinched in, anywhere down the page, it draws back the same way, about
     the middle of the screen rather than the top of the page; not while the
     page is zoomed in, when a pinch is only zooming back out. */
  pinchers.push(dir => {
    if (dir !== "in" || gone() || (self.visualViewport && visualViewport.scale > 1.02)) return null;
    const main = document.querySelector("main");
    const oy = main ? scrollY + innerHeight / 2 - (main.getBoundingClientRect().top + scrollY) : 0;
    document.body.style.setProperty("--pull-oy", oy.toFixed(0) + "px");
    pinching = true;
    return {
      move: k => setPull(PULL * Math.min(1, Math.max(0, (1 - k) / .45))),
      end: () => { pinching = false; letGo(); },
    };
  });
  /* A trackpad flung up to the top keeps sending its coast for a while after
     the page has stopped there; that is not a pull. Only a gesture that
     starts at the top is: one after a pause in the wheel. */
  let lastWheel = 0, armed = false;
  addEventListener("wheel", e => {
    const now = performance.now(), gap = now - lastWheel;
    lastWheel = now;
    if (gone() || e.ctrlKey) return;
    if (scrollY > 0) { armed = false; if (pull) letGo(); return; }
    if (!armed && gap > 220) armed = true;
    if (!armed) return;
    if (e.deltaY < 0) {
      // it gives less the further it goes, so going all the way is meant
      const k = Math.min(1, pull / PULL);
      setPull(pull - e.deltaY * (e.deltaMode === 1 ? 16 : 1) * .5 * (1 - .55 * k));
      clearTimeout(pullT);
      pullT = setTimeout(letGo, 180);
    } else if (pull && e.deltaY > 0) {
      letGo();
    }
  }, { passive: true });
  let touch0 = null;
  addEventListener("touchstart", e => { touch0 = scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener("touchmove", e => {
    if (touch0 === null || gone()) return;
    const dy = e.touches[0].clientY - touch0;
    // a finger goes all the way at 150px plus most of the pull again: about
    // 270px down a post, 390px down the index
    if (scrollY <= 0 && dy > 0) setPull(PULL * dy / (150 + .8 * PULL));
  }, { passive: true });
  addEventListener("touchend", () => { touch0 = null; letGo(); }, { passive: true });
}

/* What the address says, after the #: where to stand (at=, a post's slug
   on the index, how far down in px on a post) and where the way back up
   goes (back=, a page of the blog's poster on the site, blog.<n>, when that
   is where this was opened from). */
const hashArgs = () => new URLSearchParams(location.hash.slice(1));
const setHash = args => {
  const h = [...args].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&");
  const url = location.pathname + location.search + (h ? "#" + h : "");
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
};
/* Come from the site's poster, the way back up goes back to it, wherever
   the reading goes from there, for as long as the tab is open. */
const BACK = "back-to-site";
const backToSite = arrived => {
  try {
    if (arrived) sessionStorage.setItem(BACK, arrived);
    return arrived || sessionStorage.getItem(BACK);
  } catch (_) { return arrived; }
};
const leaveForSite = (site, back) => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.add("leaving");
  setTimeout(() => { location.href = site.split("#")[0] + (back ? "#read=" + back : ""); }, reduce ? 0 : 380);
};

/* The title grows from a card into the head of its post, and shrinks back
   into it (blog.css), by as much as one is larger than the other. The page
   it goes to cannot see how large it was on this one, so it is noted on
   the way out, for the script in the head of that page (build.py). */
const noteTitle = (el, slug) => {
  if (!el || !slug) return;
  try {
    sessionStorage.setItem("title-size", JSON.stringify({
      name: slug.replace(/\//g, "--"), px: parseFloat(getComputedStyle(el).fontSize), at: Date.now() }));
  } catch (_) {}
};
// a card opening its post, on the index or a category; the one under a
// post opens in place, and says so by keeping the page from going
document.addEventListener("click", e => {
  const c = e.target.closest && e.target.closest("a.card[data-slug]");
  if (!c || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  noteTitle(c.querySelector("h2"), c.dataset.slug);
});

/* A card's first lines, cut at the last whole line that fits: it is a sheet
   of a fixed size, like a page of the poster on the site. */
const fitCard = card => {
  const lines = card.querySelector(".lines");
  if (!lines) return;
  const lh = parseFloat(getComputedStyle(lines).fontSize) * 1.5, h = lines.clientHeight;
  const n = lh ? Math.floor((h + 1) / lh) : 0;
  // what is under the last whole line is not drawn
  lines.style.clipPath = n > 0 ? `inset(0 0 ${Math.max(0, h - n * lh).toFixed(1)}px 0)` : "inset(0 0 100% 0)";
};
// the room for them changes with the title above them as well as the card
const cardSizes = "ResizeObserver" in self
  ? new ResizeObserver(es => es.forEach(e => fitCard(e.target.closest(".card"))))
  : { observe: el => fitCard(el.closest(".card")) };
const fitCards = root => root.querySelectorAll(".card .lines").forEach(l => cardSizes.observe(l));
fitCards(document);
document.fonts && document.fonts.ready.then(() => document.querySelectorAll(".card").forEach(fitCard));

/* ---------- the cards pile up at the top ----------
   The way the Mist screenshots do on the site: a card that reaches the top
   of the screen stays there, and the one coming up after it slides over it,
   pushing it back, each a little higher, smaller and fainter (its --dim),
   until three rows on it has gone into the dark. Below, a card comes up out
   of the dark as it rises into the screen.
   Staying at the top is position:sticky (blog.css), so the browser holds it
   where it scrolls, off the page's own thread: moved from here, on the
   scroll event, a card trailed the page by a frame and shook on a phone.
   All that is moved from here is the little it steps back into the pile.
   Everything is placed from where the cards lie in the grid (card._top),
   not where they are drawn, so the years beside them read the page as it is. */
const Pile = (() => {
  // the index and the category pages; not the archive, in shelves
  const box = document.querySelector("main.index > .cards, main.index > .spread > .cards");
  if (!box) return null;
  const cards = [...box.children].filter(c => c.classList.contains("card"));
  if (!cards.length) return null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const years = document.querySelector(".years");
  const PILE_UP = .045, PILE_SHRINK = .04, PILE_DIM = .3, DEEP = 3, RISE = .45;
  let H = 1, pitch = 1, line = 0, cols = 1, ticking = false;
  const docTop = el => { let t = 0; for (; el; el = el.offsetParent) t += el.offsetTop; return t; };
  const clamp01 = v => Math.min(1, Math.max(0, v));

  // the browser runs the pile from the scroll itself (blog.css); failing that, this does
  const native = !reduce && !!(self.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  const paint = () => {
    ticking = false;
    if (reduce || native) return;
    const y = scrollY, vh = innerHeight;
    cards.forEach(c => {
      const top = c._top - y;
      let ty = 0, s = 1, dim = 0, op = 1;
      const d = (line - top) / pitch;
      if (cols > 1) {
        // side by side there is no pile: going out at the top, into the dark
        const e = clamp01(-top / (H * RISE)), f = e * e * (3 - 2 * e);
        if (top > vh - H * RISE) {
          const g = clamp01((vh - top) / (H * RISE));
          op = g * g * (3 - 2 * g);
          dim = (1 - op) * .6;
        } else if (f > 0) {
          dim = f * .6;
          op = 1 - f * .5;
        }
      } else if (d > 0) {
        // held at the line, and pushed back by the ones come up after it
        ty = -PILE_UP * H * Math.min(d, DEEP);
        s = 1 - PILE_SHRINK * Math.min(d, DEEP);
        dim = Math.min(1, PILE_DIM * d);
        op = clamp01(DEEP - d);
      } else if (top > vh - H * RISE) {
        // coming up out of the dark from the foot of the screen
        const e = clamp01((vh - top) / (H * RISE)), f = e * e * (3 - 2 * e);
        dim = (1 - f) * .6;
        op = f;
      }
      const sig = `${ty.toFixed(1)}|${s.toFixed(4)}|${dim.toFixed(3)}|${op.toFixed(3)}`;
      if (c._sig === sig) return;
      c._sig = sig;
      c.style.transform = ty || s !== 1 ? `translate3d(0,${ty.toFixed(1)}px,0) scale(${s.toFixed(4)})` : "";
      c.style.opacity = op < 1 ? op.toFixed(3) : "";
      c.style.setProperty("--dim", dim.toFixed(3));
      c.classList.toggle("gone", op <= 0);
    });
  };
  const measure = () => {
    H = cards[0].offsetHeight || 1;
    const cs = getComputedStyle(box);
    const gap = parseFloat(cs.rowGap) || 0;
    pitch = H + gap;
    cols = Math.max(1, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
    /* Side by side, each column a part of a card lower than the one before
       (blog.css): a card spans as many rows as there are columns, so one
       row is that part of a card, less the gaps between them. */
    box.classList.toggle("stagger", cols > 1);
    box.style.setProperty("--row", cols > 1 ? ((H - (cols - 1) * gap) / cols).toFixed(2) + "px" : "auto");
    cards.forEach((c, i) => {
      const col = i % cols;
      c.style.gridColumn = cols > 1 ? String(col + 1) : "";
      c.style.gridRow = cols > 1 ? `${Math.floor(i / cols) * cols + col + 1} / span ${cols}` : "";
    });
    // where each lies in the grid, sticking or not
    const top0 = docTop(box);
    cards.forEach((c, i) => { c._top = top0 + Math.floor(i / cols) * pitch + (i % cols) * pitch / cols; });
    // under the years where they run along the top (a phone), with room
    // above for the pile to step back into
    const ys = years && getComputedStyle(years);
    const bar = ys && ys.position === "sticky" && ys.flexDirection === "row" ? years.offsetHeight : 0;
    line = bar + Math.max(16, innerHeight * .025) + PILE_UP * H * DEEP;
    box.style.setProperty("--line", line.toFixed(1) + "px");
    box.style.setProperty("--deep", (DEEP * pitch).toFixed(1) + "px");
    box.style.setProperty("--hold", (DEEP * pitch - PILE_UP * H * DEEP).toFixed(1) + "px");
    box.style.setProperty("--rise", (H * RISE).toFixed(1) + "px");
    cards.forEach(c => { c._sig = ""; });
    paint();
  };
  if (!reduce) document.documentElement.classList.add(native ? "pile-css" : "piling");
  /* The browser runs the pile only on the cards on or near the screen: one
     it runs is a layer of its own, and all of them at once were more than a
     phone would hold. Seen as drawn, so a card held in the pile counts as
     where it is held, until it has gone. */
  if (native && "IntersectionObserver" in self) {
    const near = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("near", e.isIntersecting)),
      { rootMargin: "100% 0px" });
    cards.forEach(c => near.observe(c));
  } else if (native) {
    cards.forEach(c => c.classList.add("near"));
  }
  measure();
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener("resize", measure);
  addEventListener("load", measure);
  document.fonts && document.fonts.ready.then(measure);
  if ("ResizeObserver" in self) new ResizeObserver(() => requestAnimationFrame(measure)).observe(box);

  return {
    cards,
    // where a card lies on the screen, as if nothing had moved it
    rect: c => ({ top: c._top - scrollY, bottom: c._top - scrollY + H }),
    // the scroll that puts a card at the front of the pile
    scrollFor: c => Math.max(0, c._top - line),
    // the card at the front: the one at the line, or coming up to it
    front: () => {
      const y = scrollY;
      const i = cards.findIndex(c => c._top - y > line - pitch * .5);
      return cards[i < 0 ? cards.length - 1 : i];
    },
    measure,
  };
})();

/* The blog's own index: pulled down past its top it goes back to the site,
   sinking into the dark the site stands on, so the load is the only seam. */
(() => {
  if (!document.body.classList.contains("front")) return;
  const site = document.querySelector(".index > h1 a.home");
  if (!site) return;
  let leaving = false;
  const args = hashArgs();
  /* come from the site without its note (a script of the version before),
     it was still the blog's poster that brought you: back to its last page,
     which the site takes any number past its end to mean */
  const fromSite = (() => {
    try {
      const r = new URL(document.referrer), h = new URL(site.href);
      return r.origin === h.origin && r.pathname === h.pathname;
    } catch (_) { return false; }
  })();
  const back = backToSite(args.get("back") || (fromSite ? "blog.99" : null));
  const where = c => Pile ? Pile.rect(c) : c.getBoundingClientRect();

  /* Opened at a post (#at=slug), from the site's poster or back from the
     post itself: stand with its card at the front of the pile, the ones
     before it stacked above. From the site, the years come down after. */
  /* A card opened is noted, with where it was on the screen, so that coming
     back from its post, by the back button, the bar or the pull at its top,
     puts it back exactly there rather than at the front of the pile. */
  const OPENED = "index-opened";
  const layoutTop = c => Pile ? Pile.rect(c).top : c.getBoundingClientRect().top;
  const opened = (() => { try { return JSON.parse(sessionStorage.getItem(OPENED) || "null"); } catch (_) { return null; } })();
  document.querySelector(".cards").addEventListener("click", e => {
    const c = e.target.closest(".cards > .card");
    if (!c || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    try { sessionStorage.setItem(OPENED, JSON.stringify({ slug: c.dataset.slug, top: layoutTop(c) })); } catch (_) {}
    // the back button comes back to this address, so it names this card
    leaving = true;
    setHash([["at", c.dataset.slug], ["back", args.get("back")]]);
  });
  addEventListener("pageshow", () => { leaving = false; });

  const landOn = (c, flow) => {
    if (!c) return;
    history.scrollRestoration = "manual";
    const was = opened && opened.slug === c.dataset.slug ? opened.top : null;
    const go = () => {
      if (Pile) Pile.measure();
      const docTop = layoutTop(c) + scrollY;
      scrollTo(0, was !== null ? Math.max(0, docTop - was) : Pile ? Pile.scrollFor(c) : docTop);
    };
    go();
    /* the gesture that brought us here (a trackpad pulling up out of a post,
       or turning the poster's last page over) is still coasting: that is
       not a scroll of this page. Held while the wheel keeps coming, up to
       two and a half seconds; the first pause lets go. */
    // come on from the site's poster, the coast is the scroll going on: let it
    const until = flow ? 0 : performance.now() + 2500;
    let last = 0;
    const hold = e => {
      const now = performance.now(), gap = now - last;
      last = now;
      if (now > until || (gap > 250 && gap !== now)) { removeEventListener("wheel", hold); return; }
      e.preventDefault();
    };
    addEventListener("wheel", hold, { passive: false });
    const y = scrollY;
    // the faces arriving can move it: stand there again, unless it has been moved since
    document.fonts && document.fonts.ready.then(() => { if (Math.abs(scrollY - y) < 2) go(); });
  };
  const atSlug = args.get("at");
  if (atSlug) {
    landOn(document.querySelector(`.cards > .card[data-slug="${CSS.escape(atSlug)}"]`), !!args.get("back"));
    if (args.get("back")) document.documentElement.classList.add("arrive");
  } else if (/^#y\d{4}$/.test(location.hash)) {
    landOn(document.getElementById(location.hash.slice(1)));
  }
  /* and the address keeps the card at the front as the posts go by, so a
     reload or a link stands there again */
  if (Pile) {
    let shown = atSlug || null, t = 0;
    addEventListener("scroll", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (leaving) return;
        const slug = scrollY < 8 ? null : Pile.front().dataset.slug;
        if (slug === shown && !/^#y/.test(location.hash)) return;
        shown = slug;
        setHash([["at", slug], ["back", args.get("back")]]);
      }, 150);
    }, { passive: true });
  }

  /* The years beside the posts: the one being read is large and the others
     fall away from it along a curve (--k, 0 to 1, in blog.css). Where the
     reading is, is taken continuously, through each year's posts, so the
     sizes glide as the page scrolls. On a phone, where the years run along
     the top, the one being read is kept in view there. */
  const years = document.querySelector(".years");
  const cards = [...document.querySelectorAll(".cards > .card[data-year]")];
  if (years && cards.length) {
    const links = [...years.querySelectorAll("a")];
    const order = links.map(a => a.dataset.year);
    let lit = null, ticking = false;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = () => {
      ticking = false;
      const line = innerHeight * .33;
      const i = cards.findIndex(c => where(c).bottom > line);
      const c = cards[i < 0 ? cards.length - 1 : i], y = c.dataset.year;
      // how far through this year's posts the line is, from its first to its last
      const mine = cards.filter(k => k.dataset.year === y);
      const top = where(mine[0]).top, end = where(mine[mine.length - 1]).bottom;
      const through = end > top ? Math.min(1, Math.max(0, (line - top) / (end - top))) : .5;
      // at the top of the page it is the newest year, whole
      const at = scrollY < 4 ? 0 : order.indexOf(y) + through - .5;
      links.forEach((a, j) => {
        const d = j - Math.max(0, at);
        a.style.setProperty("--k", Math.exp(-d * d / 7).toFixed(3));
      });
      if (y === lit) return;
      if (lit !== null) links[order.indexOf(lit)].classList.remove("on");
      lit = y;
      const a = links[order.indexOf(y)];
      a.classList.add("on");
      a.setAttribute("aria-current", "true");
      links.forEach(l => { if (l !== a) l.removeAttribute("aria-current"); });
      if (years.scrollWidth > years.clientWidth) {
        years.scrollTo({ left: a.offsetLeft - (years.clientWidth - a.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
      }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(light); } }, { passive: true });
    addEventListener("resize", light);
    light();
    years.addEventListener("click", e => {
      const a = e.target.closest("a[data-year]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const to = document.getElementById("y" + a.dataset.year);
      if (!to) return;
      e.preventDefault();
      if (Pile) scrollTo({ top: Pile.scrollFor(to), behavior: reduce ? "auto" : "smooth" });
      else to.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(history.state, "", "#y" + a.dataset.year);
    });
  }

  /* up past the top is the site: back to the page of its poster this came
     from, if it came from there */
  pullAtTop("Alex Van de Sande", () => {
    if (leaving) return;
    leaving = true;
    leaveForSite(site.href, back);
  }, () => leaving, back ? 150 : 300);   // leaving for the site takes a purposeful pull, unless that is where this came from
})();

(() => {
  const main = document.querySelector("main");
  if (!main || !main.querySelector("article.sheet")) return;
  document.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const topLink = document.querySelector(".top a.blog");
  const home = topLink.href;

  // opened from the site, part way down: stand where it was
  const args = hashArgs();
  const at = /^\d+$/.test(args.get("at") || "") ? +args.get("at") : null;
  // opened from a page of the site's poster: the way up goes back to it
  const back = /^[\w.-]+$/.test(args.get("back") || "") ? args.get("back") : null;
  if (back) backToSite(back);
  if (at !== null) {
    history.scrollRestoration = "manual";
    scrollTo(0, at);
    document.fonts && document.fonts.ready.then(() => { if (scrollY < 2) scrollTo(0, at); });
  }
  // the address keeps only the way back, so a reload still has it
  if (location.hash) setHash([["back", back]]);
  const sheets = () => [...main.querySelectorAll("article.sheet")];
  const seen = new Set(sheets().map(a => a.dataset.slug));
  const pages = new Map();          // url -> promise of the parsed page
  let next = null, opening = false, leaving = false;

  // what has been read, this visit: a post is read once its end is on screen
  const READ = "read-posts";
  const read = (() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(READ) || "[]")); } catch (_) { return new Set(); }
  })();
  const markRead = slug => {
    if (read.has(slug)) return;
    read.add(slug);
    try { sessionStorage.setItem(READ, JSON.stringify([...read])); } catch (_) {}
  };

  const load = url => {
    if (!pages.has(url)) {
      pages.set(url, fetch(url).then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(t => new DOMParser().parseFromString(t, "text/html")).catch(e => {
        pages.delete(url);
        throw e;
      }));
    }
    return pages.get(url);
  };
  const urlOf = slug => new URL(slug, home).href;

  // the names that tie a card to its sheet, given only for the moment it opens
  const KINDS = [["paper", ".paper"], ["cover", ".thumb"], ["words", ".words"], ["title", "h2"]];
  const name = (card, slug) => {
    for (const [kind, sel] of KINDS) {
      const el = card.querySelector(sel);
      if (el) {
        el.style.viewTransitionName = `${kind}-${slug}`;
        el.style.viewTransitionClass = kind;
      }
    }
  };
  // every sheet but `keep` steps out of the transition; the undo puts them back
  const quiet = keep => {
    const els = [...main.querySelectorAll("article.sheet [style*='view-transition-name']")]
      .filter(el => !keep || !keep.contains(el));
    const was = els.map(el => el.style.viewTransitionName);
    els.forEach(el => { el.style.viewTransitionName = "none"; });
    return () => els.forEach((el, i) => { el.style.viewTransitionName = was[i]; });
  };
  const current = () => sheets().find(a => a.dataset.url === location.pathname) || sheets()[0];

  /* ---------- on, into the next ---------- */

  function arm(section) {
    next = null;
    const card = section.querySelector(".card");
    if (!card) return;
    if (seen.has(card.dataset.slug)) {        // round the whole blog: stop here
      section.classList.add("end");
      section.querySelector(".label").textContent = "That was all of them. From the top:";
      return;
    }
    next = section;
    section.classList.add("more");
    card.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      open(section);
    });
    // fetch it while it is still coming up the screen
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) {
        io.disconnect();
        load(card.href).catch(() => {});
      }
    }, { rootMargin: "150% 0px" });
    io.observe(card);
  }

  const picture = async article => {
    // the picture should be there when the sheet is drawn, not a beat after
    const img = article.querySelector(".cover img");
    if (!img) return;
    img.loading = "eager";
    await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1200))]);
  };

  async function open(section) {
    if (opening || section !== next) return;
    opening = true;
    const card = section.querySelector(".card");
    const slug = card.dataset.slug;
    let doc;
    try {
      doc = await load(card.href);
    } catch (e) {                         // could not fetch it: just go there
      location.href = card.href;
      return;
    }
    const article = document.importNode(doc.querySelector("article.sheet"), true);
    const after = doc.querySelector("section.next");
    const following = after ? document.importNode(after, true) : null;
    await picture(article);

    const swap = () => {
      section.replaceWith(...(following ? [article, following] : [article]));
      seen.add(slug);
      follow(article);
      show(article);
    };
    if (document.startViewTransition && !reduce) {
      const restore = quiet();
      name(card, slug);
      // the title grows by as much as the sheet's is larger than the card's
      const h2 = card.querySelector("h2"), was = h2 ? parseFloat(getComputedStyle(h2).fontSize) : 0;
      const root = document.documentElement;
      const t = document.startViewTransition(() => {
        swap();
        const h1 = article.querySelector(".text > h1");
        if (was && h1) root.style.setProperty("--title-k", (parseFloat(getComputedStyle(h1).fontSize) / was).toFixed(4));
      });
      await t.finished.catch(() => {});
      root.style.removeProperty("--title-k");
      restore();
    } else {
      swap();
    }
    if (following) { fitCards(following); arm(following); }
    const top = article.getBoundingClientRect().top;
    if (top > 0) scrollBy({ top: top - 16, behavior: reduce ? "auto" : "smooth" });
    opening = false;
  }

  /* ---------- back, into the one before ----------
     Put back above the first sheet on the page, keeping what is on screen
     exactly where it is, but only when that is how you got here: the page
     before this one was that post, read to its end. Reading on in place
     leaves it on the page anyway; this is for arriving by its link. It goes
     one post back and no further, like the back button. Come from anywhere
     else and the top of the post is the way to the index. */
  const bare = u => u.replace(/\.html$/, "").replace(/\/$/, "");
  const cameFrom = (() => {
    try {
      const r = new URL(document.referrer);
      return r.origin === location.origin ? bare(r.pathname) : null;
    } catch (_) { return null; }
  })();
  const firstPrev = sheets()[0].dataset.prev;
  const fromPrev = !!firstPrev && read.has(firstPrev) && cameFrom === bare(new URL(urlOf(firstPrev)).pathname);
  let prepending = false;
  async function prepend() {
    const first = sheets()[0];
    const prev = first && first.dataset.prev;
    if (prepending || !fromPrev || prev !== firstPrev || seen.has(prev)) return;
    prepending = true;
    try {
      const doc = await load(urlOf(prev));
      const article = document.importNode(doc.querySelector("article.sheet"), true);
      // it is not arriving, it was here: no names to fly with
      article.querySelectorAll("[style*='view-transition-name']").forEach(el => { el.style.viewTransitionName = "none"; });
      const before = first.getBoundingClientRect().top;
      first.before(article);
      scrollBy({ top: first.getBoundingClientRect().top - before, behavior: "instant" });
      seen.add(prev);
      follow(article);
    } catch (_) {
      /* nothing to put back */
    }
    prepending = false;
  }

  /* ---------- the bar ---------- */
  const bar = document.querySelector(".bar");
  let barOn = false;
  const setBar = on => {
    if (!bar || on === barOn) return;
    barOn = on;
    bar.classList.toggle("on", on);
    bar.setAttribute("aria-hidden", on ? "false" : "true");
    bar.querySelectorAll("a").forEach(a => { a.tabIndex = on ? 0 : -1; });
  };

  /* ---------- to the index, the name growing into its title ---------- */
  let unquiet = null, grown = null;
  function toIndex(from, howBack) {
    if (leaving) return;
    leaving = true;
    // only the post being read shrinks into its card; the name becomes the title
    const a = current();
    unquiet = quiet(a);
    if (from) { grown = from; from.style.viewTransitionName = "site-title"; }
    if (a) noteTitle(a.querySelector(".text > h1"), a.dataset.slug);
    // back the way it came, or the index opened with its card at the front
    if (howBack) history.back();
    else location.href = home + (a ? "#at=" + a.dataset.slug : "");
  }
  /* Kept whole by the browser and come back to, with the forward button,
     the post is as it was before it was left, and can be left again. */
  addEventListener("pageshow", e => {
    if (!e.persisted || !leaving) return;
    leaving = false;
    if (unquiet) unquiet();
    if (grown) grown.style.viewTransitionName = "";
    unquiet = grown = null;
  });
  /* Left any other way, the browser's back button say, the post being read
     still notes its title, so that it shrinks into its card all the same. */
  addEventListener("pageswap", e => {
    const a = e.viewTransition && current();
    if (a) noteTitle(a.querySelector(".text > h1"), a.dataset.slug);
  });
  /* The ← at the head of the post, in the bar and beside it, is the way
     back to the index, at this post's card. Come from that card, the
     browser's own way back is the best one, as it puts the index back
     exactly as it was left; come any other way, or read on into another
     post since, the index is opened at this one's card instead. */
  const indexAt = bare(new URL(home).pathname);
  const backToIndex = from => {
    const a = current();
    let opened = null;
    try { opened = JSON.parse(sessionStorage.getItem("index-opened") || "null"); } catch (_) {}
    const cameThat = !!a && !!opened && opened.slug === a.dataset.slug && history.length > 1
      && (cameFrom === indexAt || cameFrom === indexAt + "/index");
    toIndex(from, cameThat);
  };
  for (const arrow of document.querySelectorAll(".top a.back, .bar a.back")) {
    arrow.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      // the name beside it grows into the index's title, as when it is clicked
      backToIndex(arrow.parentNode.querySelector(".name"));
    });
  }
  // the wandering about goes to the index; his name, to the site, is a plain link
  for (const [link, name] of [[topLink, topLink.parentNode], [bar && bar.querySelector("a.blog"), bar && bar.querySelector(".name")]]) {
    if (link) link.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      toIndex(name);
    });
  }

  /* Pulling on past the top draws the post back, and far enough it goes to
     the index, the line that came down growing into the index's title. */
  /* Opened from the site's poster, it goes back there instead, to the page
     it was opened from. */
  const siteLink = document.querySelector(".top a.home");
  if (back && siteLink) {
    /* pulled past the top, the poster turns back down over the post's head;
       pinched out of, it is the head, as it was left, and stays */
    pullAtTop("Alex Van de Sande", (note, how) => {
      if (leaving) return;
      leaving = true;
      leaveForSite(siteLink.href, how === "pinch" ? back.replace(/\.last$/, "") : back);
    }, () => leaving);
  } else {
    pullAtTop("All the wandering about", note => toIndex(note), () => leaving);
  }

  /* ---------- beside the post, on a big screen ----------
     Once the post's own title has gone off the top, a column beside it
     keeps it: the year, the title, and the posts either side. It follows
     whichever post is being read, and goes again when the title is back. */
  const side = document.createElement("aside");
  side.className = "aside-nav";
  side.setAttribute("aria-label", "This post");
  side.innerHTML = `<p class="an-year"></p><p class="an-title"></p>
    <nav><a class="an-back" href="${home}"><small>Back</small></a><a class="an-prev"><small>Previous</small><span></span></a><a class="an-next"><small>Next</small><span></span></a></nav>`;
  document.body.append(side);
  side.querySelector(".an-back").addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    backToIndex(null);
  });
  const sideEls = {
    year: side.querySelector(".an-year"), title: side.querySelector(".an-title"),
    prev: side.querySelector(".an-prev"), next: side.querySelector(".an-next"),
  };
  let sideFor = null, sideOn = false;
  const fillSide = a => {
    if (sideFor === a) return;
    sideFor = a;
    sideEls.year.textContent = a.dataset.year || "";
    sideEls.title.textContent = a.dataset.title;
    for (const [k, el] of [["prev", sideEls.prev], ["next", sideEls.next]]) {
      const slug = a.dataset[k];
      el.hidden = !slug;
      if (!slug) continue;
      el.href = urlOf(slug);
      el.querySelector("span").textContent = a.dataset[k + "Title"] || "";
    }
  };
  const placeSide = () => {
    const a = current();
    if (!a) return;
    const h = a.querySelector(".text > h1"), r = a.getBoundingClientRect();
    // on once the title is gone above, and while the post is still on screen
    const on = !!h && h.getBoundingClientRect().bottom < 0 && r.bottom > innerHeight * .35;
    if (on) fillSide(a);
    if (on !== sideOn) {
      sideOn = on;
      side.classList.toggle("on", on);
      side.querySelectorAll("a").forEach(l => { l.tabIndex = on ? 0 : -1; });
    }
  };

  /* ---------- on scroll ---------- */
  let ticking = false, lastY = scrollY;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY, dy = y - lastY;
      lastY = y;
      placeSide();
      // the bar: down going up, away going on, never over the name at the top
      if (y < 80) setBar(false);
      else if (dy < -6) setBar(true);
      else if (dy > 6) setBar(false);
      // near the top: put back the post before, if it was read
      if (y < innerHeight * 2) prepend();
      // past the card, a good way up the screen, or at the very bottom: open it
      if (next && !opening) {
        const r = next.querySelector(".card").getBoundingClientRect();
        const bottom = innerHeight + y >= document.documentElement.scrollHeight - 2;
        if ((r.top < innerHeight * 0.28 && r.bottom > 0) || (bottom && r.top < innerHeight)) open(next);
      }
    });
  }, { passive: true });

  // the address, the title and the canonical link follow the post being read
  const canonical = document.querySelector('link[rel="canonical"]');
  const site = canonical ? canonical.href.replace(/[^/]+$/, "") : null;
  const show = article => {
    const url = article.dataset.url;
    if (location.pathname === url) return;
    history.replaceState(history.state, "", url);
    document.title = article.dataset.title;
    if (canonical && site) canonical.href = site + article.dataset.slug;
    placeSide();
  };
  const reading = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) show(e.target);
  }, { rootMargin: "-45% 0px -54% 0px" });
  // read, once its last lines have been on screen
  const ends = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) markRead(e.target.closest("article.sheet").dataset.slug);
  });
  const follow = article => {
    reading.observe(article);
    const body = article.querySelector(".body");
    const last = body && body.lastElementChild;
    if (last) ends.observe(last);
  };

  sheets().forEach(follow);
  const first = main.querySelector("section.next");
  if (first) arm(first);
  if (scrollY < innerHeight * 2) prepend();
})();

/* Carousels: the arrows step a slide at a time, the count follows the
   scroll. Listened for on the document, so a post fetched into the page
   works the same as the one it opened on. */
(() => {
  document.documentElement.classList.add("steered");
  const at = slides => Math.round(slides.scrollLeft / slides.clientWidth);
  const mark = fig => {
    const slides = fig.querySelector(".slides"), n = slides.children.length, i = at(slides);
    fig.querySelector(".count").textContent = `${i + 1} / ${n}`;
    fig.querySelector(".prev").disabled = i <= 0;
    fig.querySelector(".next").disabled = i >= n - 1;
  };
  document.addEventListener("click", e => {
    const b = e.target.closest(".carousel .steer button");
    if (!b) return;
    const slides = b.closest(".carousel").querySelector(".slides");
    const i = at(slides) + (b.classList.contains("next") ? 1 : -1);
    slides.scrollTo({ left: i * slides.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  document.addEventListener("scroll", e => {
    const fig = e.target.closest && e.target.closest(".carousel");
    if (fig) mark(fig);
  }, true);
  document.addEventListener("keydown", e => {
    const slides = e.target.closest && e.target.closest(".carousel .slides");
    if (!slides || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    slides.closest(".carousel").querySelector(e.key === "ArrowRight" ? ".next" : ".prev").click();
  });
})();

/* Moving pictures (a video in the Markdown) play while they are on screen
   and stop when they leave it, so a post with several fetches only the ones
   being looked at. Started any earlier, as the page opens, one could stay
   black. Looked for on every scroll, so a post fetched into the page is
   covered too. */
(() => {
  let queued = false;
  const look = () => {
    queued = false;
    for (const v of document.querySelectorAll("video.moving")) {
      v.controls = false;
      const r = v.getBoundingClientRect();
      // in a carousel, only the slide showing counts as on screen
      const b = (v.closest(".slides") || document.documentElement).getBoundingClientRect();
      const on = r.width > 0 && r.bottom > Math.max(0, b.top) && r.top < Math.min(innerHeight, b.bottom)
              && r.right > Math.max(0, b.left) + 1 && r.left < Math.min(innerWidth, b.right) - 1;
      if (on && v.paused) v.play().catch(() => {});
      else if (!on && !v.paused) v.pause();
    }
  };
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(look); } };
  addEventListener("scroll", soon, { capture: true, passive: true });
  addEventListener("resize", soon);
  document.addEventListener("visibilitychange", soon);
  new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
  soon();
})();
