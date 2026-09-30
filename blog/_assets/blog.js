/* Reading on. At the foot of a post is the next one, as a card. Scroll on
   past it, or click it, and it opens where it is: its paper and picture grow
   into the sheet (a view transition, where the browser has them), the post
   is fetched into the page, and the next card waits under it. The address
   follows whichever post is being read. Without this script the card is a
   plain link, and the page it goes to opens with the same growth. */
(() => {
  const main = document.querySelector("main");
  if (!main || !main.querySelector("article.sheet")) return;
  document.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = new Set([...main.querySelectorAll("article.sheet")].map(a => a.dataset.slug));
  const pages = new Map();          // url -> promise of the parsed page
  let next = null, opening = false;

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
  // every other sheet on the page steps out of the transition, and back after
  const quiet = () => {
    const els = [...main.querySelectorAll("article.sheet [style*='view-transition-name']")];
    const was = els.map(el => el.style.viewTransitionName);
    els.forEach(el => { el.style.viewTransitionName = "none"; });
    return () => els.forEach((el, i) => { el.style.viewTransitionName = was[i]; });
  };

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

    // the picture should be there when the sheet is drawn, not a beat after
    const img = article.querySelector(".cover img");
    if (img) {
      img.loading = "eager";
      await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1200))]);
    }

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

  // scrolled past the card, a good way up the screen: open it
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking || !next || opening) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!next) return;
      const r = next.querySelector(".card").getBoundingClientRect();
      if (r.top < innerHeight * 0.28 && r.bottom > 0) open(next);
    });
  }, { passive: true });

  // the address, the title and the canonical link follow the post being read
  const canonical = document.querySelector('link[rel="canonical"]');
  const home = canonical ? canonical.href.replace(/[^/]+$/, "") : null;
  const show = article => {
    const url = article.dataset.url;
    if (location.pathname === url) return;
    history.replaceState(history.state, "", url);
    document.title = article.dataset.title;
    if (canonical && home) canonical.href = home + article.dataset.slug;
  };
  const reading = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) show(e.target);
  }, { rootMargin: "-45% 0px -54% 0px" });
  const follow = article => reading.observe(article);

  main.querySelectorAll("article.sheet").forEach(follow);
  const first = main.querySelector("section.next");
  if (first) arm(first);
})();
