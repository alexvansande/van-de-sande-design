# Launch: vandesande.design and blog.vandesande.design

Moving both domains to GitHub Pages, October 2026: vandesande.design from
the Shopify shop to this repo's site, blog.vandesande.design from Paragraph
to the blog built from `blog/`. This is what was found checking for it,
what has been done, and what is left, in the order to do it.

## Where things stand (checked 2 October 2026)

| | Now | After |
|---|---|---|
| vandesande.design | Shopify (A `23.227.38.65`) | this repo, GitHub Pages |
| www.vandesande.design | CNAME `shops.myshopify.com` (301 to the apex) | CNAME `alexvansande.github.io` |
| blog.vandesande.design | Paragraph (CNAME `cname.paragraph.com`) | the `alexvansande/blog` repo, GitHub Pages |
| Staging | alexvansande.github.io/van-de-sande-design/ (up to date with `main`) | |

DNS is at GoDaddy (`ns43`/`ns44.domaincontrol.com`), signed with DNSSEC.
Records live 600 s, so a change is everywhere within about ten minutes.

**Records to keep exactly as they are:**

- MX: `aspmx.l.google.com` (1), `alt1`/`alt2` (5), `alt3`/`alt4` (10) — the
  Google Workspace mail
- TXT `v=spf1 include:dc-aa8e722993._spfm.vandesande.design ~all`
- TXT `ENS1 0x238A8F792dFA6033814B18618aD4100654aeef01 0x809FA673fe2ab515FaA168259cB14E2BeDeBF68e`
  — the DNS name in ENS, which also needs DNSSEC left on
- TXT `google-site-verification=Ml1P2plsjiBOwGyNlxWtw6kpALM393l0y7N0jy4Iwo0`

There is no DMARC record (`_dmarc`). Not needed for the launch, worth adding
some day.

## Decisions taken

- **The shop closes.** No more poster sales; the posters are downloaded
  from their own sites, triangleofeverything.com and hexagonal.earth, or
  asked for by email.
- **The blog is its own repo**, `alexvansande/blog`, published at the root
  of blog.vandesande.design (Pages gives a repo only one domain).
- **The site reads the blog live** from blog.vandesande.design (`BLOG` in
  `site/app.js`): the blog's poster at the end of the rail fetches
  `latest.json` on every visit, and the endings of the maps, the triangle
  and Bend fetch their post's head, so a new post is on the poster as soon
  as the blog publishes it, with no build of the site. GitHub Pages lets
  any site fetch from it (`access-control-allow-origin: *`, checked).
  Lost with the two domains: the view transition from the site into a post
  (it was already a plain page load).
- **Socials at the end of the rail**, past the blog, answering the line on
  the index: Bluesky, X, avsa.eth and `site@vandesande.design`. Threads and
  Farcaster dropped.

## Done (on `main`)

Site:
- [x] The socials line at the far end of the rail, with the final text.
  Its links are the first a Tab reaches; tabbing there takes the rail to it.
- [x] `BLOG` points to `https://blog.vandesande.design/`; the site's deploy
  no longer builds the blog.
- [x] `/products/poster` → triangleofeverything.com,
  `/products/the-impossible-map` → hexagonal.earth (pages that go on by
  themselves; Pages cannot redirect).
- [x] `404.html` for every other old shop address (`/collections/…`,
  `/pages/contact`, `/cart`…): says where the stories, the blog, the posters
  and the email are.
- [x] Canonical link, Open Graph and Twitter card with a preview image
  (`img/share.jpg`, the opening screen), `apple-touch-icon.png`,
  `robots.txt`, `sitemap.xml`.

Blog:
- [x] Every Paragraph post is here at the same address, with its `.md` and
  all 28 section anchors (`#h-…`). 53 posts in all (47 more than Paragraph
  had: Medium, the EF blog, the ENS forum). No picture is still loaded from
  Paragraph. 5,340 internal links checked: none broken.
- [x] The 6 Paragraph posts keep Paragraph's ids in the feed, so readers
  that had them do not show them as new.
- [x] Paragraph's other addresses go on: `/feed`, `/rss`, `/subscribe` to
  `/rss.xml`; `/category/hexagons`, `/category/map`, `/category/mapmaking`
  to `/category/maps`; `/sitemap-index.xml` names the sitemap.
- [x] The Triangle and Gosper World posts point to the posters' own sites
  instead of the shop.
- [x] The stray "asd" taken out of the Trânsito post.
- [x] The blog editor (`blog-editor` branch) merged in.

## Open jobs, in order

### Before the switch

1. [ ] **Create `alexvansande/blog`** on github.com: public, empty, no
   README. Give the Claude GitHub app access to it if it is limited to
   selected repos. *(Alex — Claude cannot create repos.)*
2. [ ] **Move the blog into it** with its history, with a workflow that
   publishes at the root (`--base /`). Then take `blog/` out of this repo.
   *(Claude, once the repo exists.)* Anyone working on the blog — the
   editor's agent included — carries on in the new repo from then on.
3. [ ] In `alexvansande/blog`: Settings → Pages → Source **GitHub
   Actions**; custom domain **blog.vandesande.design**. *(Alex)*
4. [ ] In this repo: Settings → Pages → custom domain **vandesande.design**,
   then run the deploy again. *(Alex)*
5. [ ] Verify the domain for Pages on the GitHub account (Settings → Pages
   → Add a domain, a TXT record `_github-pages-challenge-alexvansande`), so
   no one else's repo can claim it. *(Alex)*
6. [ ] **Export the 7 email subscribers** from Paragraph. The new blog has
   no newsletter; they would otherwise be lost. *(Alex)*
7. [ ] **Shopify:** check there are no open orders; then close the shop and
   remove vandesande.design from it (Settings → Domains). *(Alex)*
8. [x] **site@vandesande.design** reaches him: the domain's mail is a
   catch-all.

### The switch, at GoDaddy (both together)

The site's blog poster reads from blog.vandesande.design, so switch both
at once.

9. [ ] Apex `@`: delete the A record `23.227.38.65`; add A records
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`. Optionally AAAA `2606:50c0:8000::153`,
   `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
10. [ ] `www`: CNAME `alexvansande.github.io`.
11. [ ] `blog`: CNAME `alexvansande.github.io`.
12. [ ] Touch nothing else (see the records to keep, above).

### After

13. [ ] Wait for the HTTPS certificates (from minutes to about an hour;
    until then the browser may warn). Then tick **Enforce HTTPS** in both
    repos.
14. [ ] Check:
    - [ ] https://vandesande.design and https://www.vandesande.design
    - [ ] the rail to its end: the blog's poster has the three newest posts,
      the socials links work
    - [ ] the end of the maps, the triangle and Bend: the post's head
      comes up and pulling on opens the post
    - [ ] https://vandesande.design/products/poster and
      `/products/the-impossible-map` go to the posters' sites
    - [ ] an old address, e.g. `/collections/all`, shows the 404 page
    - [ ] https://blog.vandesande.design, a post, `/feed`, `/rss.xml`
    - [ ] a link shared in a chat shows the preview
    - [ ] mail still arrives at the domain
15. [ ] Post a "the blog has moved" note on Paragraph, then keep the account
    for a while: readers whose feed reader followed Paragraph's permanent
    redirect are on `api.paragraph.com/…`, not on `/feed`, and only
    Paragraph can tell them.
16. [ ] Google Search Console: add the two domains (the google TXT is
    already there for the apex) and submit both sitemaps.

### If it has to go back

GoDaddy: apex A back to `23.227.38.65`, `www` CNAME back to
`shops.myshopify.com`, `blog` CNAME back to `cname.paragraph.com` (only
while the shop and the Paragraph blog are still up).

## Lost from Paragraph, to decide later

- The newsletter (7 subscribers): no subscribe form on the new blog.
- Comment notifications, highlights (on Base), Paragraph's analytics.
- Collecting posts as NFTs and the writer coin were not in use.
- The feed now carries all 53 posts in full; readers will see the 47 that
  were not on Paragraph as new.
- Only 9 of 53 posts have a preview image; Paragraph drew one for each.
- Addresses with a trailing slash (`/slug/`) or in other capitals 404 on
  Pages, where Paragraph redirected. Nothing links that way.

## Lost from the shop's homepage

The bio ("Hello, World!… interaction designer… proud dad"), the list of
things he is proud of (ERC20, ENS, the Wikipedia Featured Article icon,
helping save a DAO) and the contact form. The books and the socials are
on the new site; the rest is not, by choice or for later.

## Worth doing soon, not for the launch

- [x] Plain links under the posters, for crawlers and the page without its
  script: the posts, the posters' sites, the blog and its newest posts.
- [x] Keyboard: Tab goes through those links, taking the rail to each
  poster and drawing a ring round it; Enter opens it.
- [ ] A DMARC record for the mail, at GoDaddy: TXT `_dmarc`,
  `v=DMARC1; p=none; rua=mailto:site@vandesande.design`. `p=none` only
  reports; tighten it to `quarantine` once the reports show only Google
  sending for the domain. *(Alex)*
