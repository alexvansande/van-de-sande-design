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
function pullAtTop(label, go, gone) {
  const PULL = 150;
  let pull = 0, pullT = 0;
  const note = document.createElement("p");
  note.className = "pullnote";
  note.setAttribute("aria-hidden", "true");
  note.textContent = label;
  document.body.append(note);
  const setPull = v => {
    pull = Math.max(0, v);
    const k = Math.min(1, pull / PULL);
    document.body.style.setProperty("--pullk", (1 - Math.pow(1 - k, 2)).toFixed(3));
    document.body.classList.toggle("pulling", pull > 0);
    if (k >= 1) go(note);
  };
  const letGo = () => {
    clearTimeout(pullT);
    if (!pull || gone()) return;
    document.body.classList.add("letgo");
    setPull(0);
    setTimeout(() => document.body.classList.remove("letgo"), 350);
  };
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
      setPull(pull - e.deltaY * (e.deltaMode === 1 ? 16 : 1) * .5);
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
    if (scrollY <= 0 && dy > 0) setPull(dy * .6);
  }, { passive: true });
  addEventListener("touchend", () => { touch0 = null; letGo(); }, { passive: true });
}

/* The blog's own index: pulled down past its top it goes back to the site,
   sinking into the dark the site stands on, so the load is the only seam. */
(() => {
  if (!document.body.classList.contains("front")) return;
  const site = document.querySelector(".index > h1 a.home");
  if (!site) return;
  let leaving = false;

  /* The years beside the posts: the one being read is lit, and on a phone,
     where they run along the top, it is kept in view there. */
  const years = document.querySelector(".years");
  const cards = [...document.querySelectorAll(".cards > .card[data-year]")];
  if (years && cards.length) {
    const links = new Map([...years.querySelectorAll("a")].map(a => [a.dataset.year, a]));
    let lit = null, ticking = false;
    const light = () => {
      ticking = false;
      // the first post still showing past the top third of the screen
      const line = innerHeight * .33;
      const c = cards.find(c => c.getBoundingClientRect().bottom > line) || cards[cards.length - 1];
      const y = c.dataset.year;
      if (y === lit) return;
      if (lit && links.get(lit)) links.get(lit).classList.remove("on");
      lit = y;
      const a = links.get(y);
      if (!a) return;
      a.classList.add("on");
      if (years.scrollWidth > years.clientWidth) {
        const to = a.offsetLeft - (years.clientWidth - a.offsetWidth) / 2;
        years.scrollTo({ left: to, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
      to.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      history.replaceState(history.state, "", "#y" + a.dataset.year);
    });
  }

  pullAtTop("Alex Van de Sande", () => {
    if (leaving) return;
    leaving = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.body.classList.add("leaving");
    setTimeout(() => { location.href = site.href; }, reduce ? 0 : 380);
  }, () => leaving);
})();

(() => {
  const main = document.querySelector("main");
  if (!main || !main.querySelector("article.sheet")) return;
  document.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const topLink = document.querySelector(".top a.blog");
  const home = topLink.href;

  // opened from the site, part way down: stand where it was
  const at = location.hash.match(/^#at=(\d+)$/);
  if (at) {
    history.scrollRestoration = "manual";
    history.replaceState(history.state, "", location.pathname + location.search);
    scrollTo(0, +at[1]);
    document.fonts && document.fonts.ready.then(() => { if (scrollY < 2) scrollTo(0, +at[1]); });
  }
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
  const KINDS = [["paper", ".paper"], ["cover", ".thumb"], ["words", ".words"]];
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
      const t = document.startViewTransition(swap);
      await t.finished.catch(() => {});
      restore();
    } else {
      swap();
    }
    if (following) arm(following);
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
  function toIndex(from) {
    if (leaving) return;
    leaving = true;
    // only the post being read shrinks into its card; the name becomes the title
    quiet(current());
    from.style.viewTransitionName = "site-title";
    location.href = home;
  }
  // the wandering about goes to the index; his name, to the site, is a plain link
  for (const [link, name] of [[topLink, topLink.parentNode], [bar && bar.querySelector("a.blog"), bar && bar.firstElementChild]]) {
    if (link) link.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      toIndex(name);
    });
  }

  /* Pulling on past the top draws the post back, and far enough it goes to
     the index, the line that came down growing into the index's title. */
  pullAtTop("All the wandering about", note => toIndex(note), () => leaving);

  /* ---------- on scroll ---------- */
  let ticking = false, lastY = scrollY;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY, dy = y - lastY;
      lastY = y;
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
