// The editor's page: the list of posts, and one post written on the paper
// the blog will set it on. Formatting comes up on a selection; a + on an
// empty line adds a picture, a video, a YouTube video, maths, a divider.
// Everything is saved into
// the post's folder by editor.py, as Markdown and files beside it.

import { Editor, Node, Extension, StarterKit, BubbleMenu, FloatingMenu, Placeholder, TextSelection,
  nodeInputRule, nodePasteRule } from './vendor/tiptap.js'
import { parse, serialize, roundTrips, isVideo } from './md.js'
import { reviewer } from './review.js'

const $ = (s, el = document) => el.querySelector(s)
const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// the two menus, kept: Tiptap takes them out of the page while they are hidden
const bubble = document.getElementById('bubble')
const plus = document.getElementById('plus')
const linkInput = document.getElementById('link-input')
const linkbox = document.getElementById('linkbox')
let linkRange = null     // the text being linked, while its link is typed
// out of the page until Tiptap first shows them: it moves a menu on scroll,
// and would show one that is still in the page though it never showed it
bubble.remove()
plus.remove()
// the box that asks for a line of text over the page: TeX, a YouTube link
const askbox = document.getElementById('askbox')
const askInput = document.getElementById('ask-input')
const askPreview = document.getElementById('ask-preview')

// ---------------------------------------------------------------- talking to editor.py

async function call(path, body) {
  const r = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }))
  if (!r.ok) throw new Error(data.error || r.statusText)
  return data
}

async function upload(file, cover = false) {
  const q = new URLSearchParams({ slug: post.slug, name: file.name || 'pasted.png' })
  if (cover) q.set('cover', '1')
  const r = await fetch('/api/upload?' + q, { method: 'POST', body: file })
  const data = await r.json().catch(() => ({ error: r.statusText }))
  if (!r.ok) throw new Error(data.error)
  return data
}

let toastTimer
function toast(msg, bad = false, ms = 2600) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.toggle('bad', bad)
  t.classList.add('on')
  clearTimeout(toastTimer)
  if (ms) toastTimer = setTimeout(() => t.classList.remove('on'), ms)
}

const mediaUrl = (src, bust) => /^(blob:|https?:|\/)/.test(src) ? src : `/posts/${post.slug}/${encodeURIComponent(src)}${bust ? '?t=' + bust : ''}`

function niceDate(s) {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const slugify = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

// ---------------------------------------------------------------- the list

let config = { categories: [] }

async function showList() {
  $('#edit').hidden = true
  $('#list').hidden = false
  document.title = 'Writing'
  const data = await call('/api/posts')
  config = data
  const warn = []
  if (!data.pillow) warn.push('Pillow is not installed, so a photo from a phone may come out sideways on the blog: <code>pip install pillow</code>, then restart the editor.')
  if (!data.ffmpeg) warn.push('ffmpeg is not installed: videos must be .mp4, and the .webm some browsers need is not made.')
  $('#warn').innerHTML = warn.join('<br>')
  $('#warn').hidden = !warn.length
  const row = p => {
    const a = el('a', 'ed-row' + (p.published ? '' : ' new'))
    a.href = '#/edit/' + p.slug
    const thumb = el('span', 'thumb')
    if (p.cover) thumb.style.backgroundImage = `url("/posts/${p.slug}/${encodeURIComponent(p.cover)}")`
    const t = el('span', 't')
    t.append(el('b', '', p.title || 'Untitled'), el('span', '', p.published ? niceDate(p.date) : 'Never published'))
    a.append(thumb, t)
    if (p.draft && p.published) a.append(el('span', 'tag', 'Unpublished changes'))
    else if (p.draft) a.append(el('span', 'tag', 'Draft'))
    return a
  }
  const drafts = data.posts.filter(p => p.draft)
  const live = data.posts.filter(p => p.published && !p.draft)
  $('#drafts').replaceChildren(...(drafts.length ? [el('h2', '', 'Drafts'), ...drafts.map(row)] : []))
  $('#live').replaceChildren(el('h2', '', 'On the blog'), ...live.map(row))
  drawTrash()
}

// what was thrown away, until the trash is emptied: each can come back
async function drawTrash() {
  const { items } = await call('/api/trash').catch(() => ({ items: [] }))
  const box = $('#trash')
  if (!items.length) return box.replaceChildren()
  const head = el('h2', 'trash-head', 'Trash')
  const empty = el('button', 'btn quiet', 'Empty the trash')
  empty.onclick = async () => {
    if (!await sure(['Empty the trash?', `${items.length === 1 ? 'The draft' : `All ${items.length} drafts`} in it, and their pictures, will be gone for good. This cannot be undone.`, 'Empty the trash'])) return
    await call('/api/trash/empty', {}).catch(e => toast(e.message, true))
    drawTrash()
  }
  head.append(empty)
  box.replaceChildren(head, ...items.map(t => {
    const r = el('div', 'ed-row trashed')
    const words = el('span', 't')
    words.append(el('b', '', t.title || 'Untitled'),
      el('span', '', (t.what === 'changes' ? 'Unpublished changes to /' + t.slug : 'Draft') + ' · thrown away ' + niceDate(t.at)))
    const back = el('button', 'btn', 'Restore')
    back.onclick = async () => {
      try {
        const { slug } = await call('/api/trash/restore', { name: t.name })
        location.hash = '#/edit/' + slug
      } catch (e) { toast(e.message, true, 8000) }
    }
    r.append(words, back)
    return r
  }))
}

// ---------------------------------------------------------------- the document's pieces

// A picture or a video on its own, its caption written under it. Its file
// is in the post's folder; src is the file's name.
const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  marks: 'bold italic link code',
  isolating: true,
  addAttributes() {
    // float: 'left' or 'right' for a picture at part of the column, the
    // text running round it; size: the width and height an older post gave
    // html: it came written as HTML, and is written back so
    return { src: { default: null }, alt: { default: '' }, float: { default: null }, width: { default: '50%' }, size: { default: null },
      html: { default: false } }
  },
  parseHTML() {
    return [{ tag: 'figure[data-src]', contentElement: 'figcaption',
      getAttrs: e => ({ src: e.getAttribute('data-src'), alt: e.getAttribute('data-alt') || '',
        float: e.getAttribute('data-float') || null, width: e.getAttribute('data-width') || '50%', size: e.getAttribute('data-size') || null,
        html: e.hasAttribute('data-html') }) }]
  },
  renderHTML({ node }) {
    const a = node.attrs
    return ['figure', { 'data-src': a.src, 'data-alt': a.alt, 'data-float': a.float, 'data-width': a.width, 'data-size': a.size,
      'data-html': a.html ? '' : null }, ['figcaption', 0]]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => figureView(node, getPos, editor)
  },
  addKeyboardShortcuts() {
    // Enter in a caption goes on to a new paragraph under the picture
    const out = ({ editor }) => {
      const { $from } = editor.state.selection
      if (!['figure', 'youtube'].includes($from.parent.type.name)) return false
      const after = $from.after(1)
      return editor.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run()
    }
    return { Enter: out, 'Shift-Enter': out }
  },
})

// Pictures one after another: on the blog, one at a time, side to side.
const Carousel = Node.create({
  name: 'carousel',
  group: 'block',
  content: 'figure+',
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-carousel]' }] },
  renderHTML() { return ['div', { 'data-carousel': '' }, 0] },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el('div', 'ed-carousel')
      const label = el('div', 'ed-label')
      label.contentEditable = 'false'
      const count = el('span')
      const add = el('button', '', '+ add pictures')
      add.type = 'button'
      add.onclick = () => pick('image/*,video/mp4,video/webm,video/quicktime', true, files => addSlides(getPos, files))
      label.append(count, add)
      const strip = el('div', 'ed-strip')
      dom.append(label, strip)
      const show = n => { count.textContent = `carousel · ${n.childCount}` }
      show(node)
      return {
        dom, contentDOM: strip,
        update(n) { if (n.type.name !== 'carousel') return false; show(n); return true },
        ignoreMutation: m => m.type !== 'selection' && !strip.contains(m.target),
        stopEvent: e => label.contains(e.target),
      }
    }
  },
})

// HTML in an older post, kept exactly as it was written.
const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  parseHTML() { return [{ tag: 'pre.raw-html', preserveWhitespace: 'full' }] },
  renderHTML() { return ['pre', { class: 'raw-html' }, ['code', 0]] },
})

// Maths in the text, $$TeX$$, set as the blog sets it: editor.py asks
// build.py's own TeX for the MathML. Typed as $$…$$, or made from a
// selection with ∑; a click on it opens its TeX.
const MathNode = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() { return { tex: { default: '' } } },
  parseHTML() { return [{ tag: 'span[data-tex]', getAttrs: e => ({ tex: e.getAttribute('data-tex') }) }] },
  renderHTML({ node }) { return ['span', { 'data-tex': node.attrs.tex }, `$$${node.attrs.tex}$$`] },
  renderText({ node }) { return `$$${node.attrs.tex}$$` },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el('span', 'ed-math')
      dom.contentEditable = 'false'
      drawMath(dom, node.attrs.tex)
      dom.addEventListener('click', e => { e.preventDefault(); editMath(getPos()) })
      return {
        dom,
        update(n) {
          if (n.type.name !== 'math') return false
          if (n.attrs.tex !== node.attrs.tex) drawMath(dom, n.attrs.tex)
          node = n
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },
  addInputRules() {
    // no group in these: with one, Tiptap would put the node inside the $$s and keep them
    return [nodeInputRule({ find: /\$\$[^$\n]+\$\$$/, type: this.type, getAttributes: m => ({ tex: m[0].slice(2, -2).trim() }) })]
  },
  addPasteRules() {
    return [nodePasteRule({ find: /\$\$[^$\n]+\$\$/g, type: this.type, getAttributes: m => ({ tex: m[0].slice(2, -2).trim() }) })]
  },
})

const mathCache = new Map()
const mathml = tex => {
  if (!mathCache.has(tex)) mathCache.set(tex, fetch('/api/tex?tex=' + encodeURIComponent(tex)).then(r => r.json()))
  return mathCache.get(tex)
}
const unknownNote = r => (r.unknown.length ? `The blog does not know ${r.unknown.join(', ')}, and sets it as text` : '')

function drawMath(dom, tex) {
  dom.dataset.tex = tex
  dom.classList.toggle('empty', !tex)
  dom.classList.remove('unknown')
  dom.textContent = tex || '∑'
  if (!tex) return
  mathml(tex).then(r => {
    if (dom.dataset.tex !== tex) return
    dom.innerHTML = r.mathml           // from build.py, which escapes what it is given
    dom.classList.toggle('unknown', r.unknown.length > 0)
    dom.title = unknownNote(r) || tex
  }).catch(() => {})
}

function editMath(pos) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'math') return
  ask({
    value: node.attrs.tex,
    placeholder: 'TeX: E = mc^2, \\frac{a}{b}, x_i…',
    near: editor.view.nodeDOM(pos).getBoundingClientRect(),
    preview: async v => {
      if (!v.trim()) return ''
      const r = await mathml(v.trim())
      return r.mathml + (r.unknown.length ? `<small>${unknownNote(r)}</small>` : '')
    },
    done: v => {
      const now = editor.state.doc.nodeAt(pos)
      if (!now || now.type.name !== 'math') return
      const tex = v === null ? now.attrs.tex : v.replace(/\$\$/g, '').trim()
      const tr = editor.state.tr
      if (!tex) tr.delete(pos, pos + 1)                  // no maths left: no node
      else tr.setNodeAttribute(pos, 'tex', tex)
      tr.setSelection(TextSelection.create(tr.doc, tex ? pos + 1 : pos))
      editor.view.dispatch(tr)
      editor.view.focus()
    },
  })
}

// maths where the text is selected (its text taken for TeX), or at the caret
function insertMath() {
  let { from, to } = editor.state.selection
  // the spaces at either end of a selection stay text
  const picked = editor.state.doc.textBetween(from, to, ' ')
  from += picked.length - picked.trimStart().length
  to -= picked.length - picked.trimEnd().length
  if (to < from) to = from
  const tex = picked.trim().replace(/\$\$/g, '')
  editor.chain().focus().insertContentAt({ from, to }, { type: 'math', attrs: { tex } }).run()
  requestAnimationFrame(() => editMath(from))
}

// A YouTube video, written as the blog's other ones are: a figure with the
// video in it, and a caption if it has one.
const Youtube = Node.create({
  name: 'youtube',
  group: 'block',
  content: 'inline*',
  marks: 'bold italic link code',
  isolating: true,
  addAttributes() { return { id: { default: null }, params: { default: '' }, title: { default: '' } } },
  parseHTML() {
    return [{ tag: 'figure[data-youtube]', contentElement: 'figcaption',
      getAttrs: e => ({ id: e.getAttribute('data-youtube'), params: e.getAttribute('data-params') || '', title: e.getAttribute('data-title') || '' }) }]
  },
  renderHTML({ node }) {
    const a = node.attrs
    return ['figure', { 'data-youtube': a.id, 'data-params': a.params, 'data-title': a.title }, ['figcaption', 0]]
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el('figure', 'ed-fig ed-yt')
      const media = el('div', 'ed-media')
      media.contentEditable = 'false'
      const cap = el('figcaption')
      dom.append(media, cap)
      const draw = () => {
        const frame = el('a', 'ed-yt-frame')
        frame.href = `https://www.youtube.com/watch?v=${node.attrs.id}`
        frame.target = '_blank'
        frame.title = (node.attrs.title || 'The video') + ', on YouTube'
        const img = el('img')
        img.src = `https://i.ytimg.com/vi/${node.attrs.id}/hqdefault.jpg`
        img.alt = ''
        img.onerror = () => img.remove()
        frame.append(img, el('span', 'play', '▶'), el('span', 'name', node.attrs.title || 'YouTube'))
        const tools = el('div', 'ed-tools')
        const x = el('button', '', '×')
        x.type = 'button'
        x.title = 'Take it out'
        x.onclick = e => {
          e.preventDefault()
          const pos = getPos()
          editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos).nodeSize))
        }
        tools.append(x)
        media.replaceChildren(frame, tools)
      }
      draw()
      return {
        dom, contentDOM: cap,
        update(n) {
          if (n.type.name !== 'youtube') return false
          const again = n.attrs.id !== node.attrs.id || n.attrs.title !== node.attrs.title
          node = n
          if (again) draw()
          return true
        },
        ignoreMutation: m => m.type !== 'selection' && !cap.contains(m.target),
        stopEvent: e => media.contains(e.target),
      }
    }
  },
})

// Someone's tweet, as the blog shows it: a card, made by editor.py
// (tweets.py) and kept as the HTML it wrote, its pictures in the folder.
const Tweet = Node.create({
  name: 'tweet',
  // before the paragraph's own Enter, which would split the line
  priority: 1000,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() { return { html: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-tweet]', getAttrs: e => ({ html: e.getAttribute('data-tweet') }) }] },
  renderHTML({ node }) { return ['div', { 'data-tweet': node.attrs.html }] },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el('div', 'ed-tweet')
      dom.contentEditable = 'false'
      const draw = () => {
        const card = new DOMParser().parseFromString(node.attrs.html, 'text/html').body.firstElementChild
        if (!card) return dom.replaceChildren(el('p', '', 'A tweet'))
        // its pictures are in the post's folder
        card.querySelectorAll('img').forEach(i => { i.src = mediaUrl(i.getAttribute('src')) })
        card.querySelectorAll('a').forEach(a => { a.target = '_blank' })
        const tools = el('div', 'ed-tools')
        const x = el('button', '', '×')
        x.type = 'button'
        x.title = 'Take it out'
        x.onclick = e => {
          e.preventDefault()
          const pos = getPos()
          editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos).nodeSize))
        }
        tools.append(x)
        dom.replaceChildren(card, tools)
      }
      draw()
      return {
        dom,
        update(n) {
          if (n.type.name !== 'tweet') return false
          if (n.attrs.html !== node.attrs.html) { node = n; draw() }
          return true
        },
        ignoreMutation: () => true,
        stopEvent: e => e.type !== 'dragstart' && dom.contains(e.target),
      }
    }
  },
  addKeyboardShortcuts() {
    return {
      // a line that is only the address of a tweet, on Enter, is the tweet
      Enter: () => {
        const { $from, empty } = this.editor.state.selection
        const p = $from.parent
        if (!empty || $from.depth !== 1 || p.type.name !== 'paragraph' || $from.parentOffset !== p.content.size) return false
        const link = tweetLink(p.textContent)
        if (!link) return false
        insertTweet(link, { from: $from.before(1), to: $from.after(1) })
        return true
      },
    }
  },
})

// x.com/…/status/…, twitter.com/…, mobile.twitter.com/…
function tweetLink(s) {
  const m = (s || '').trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/\w+\/status(?:es)?\/\d+\S*$/)
  return m ? (m[0].startsWith('http') ? m[0] : 'https://' + m[0]) : null
}

// asked of editor.py, which makes the card and keeps its pictures; until
// it comes, and if it does not, the link stays where it was
async function insertTweet(url, at) {
  try {
    const { html } = await call('/api/tweet', { slug: post.slug, url })
    placeBlock({ type: 'tweet', attrs: { html } }, at)
    changed()
  } catch (e) {
    toast(e.message, true)
  }
}

// a pasted link: one word, http(s):, mailto: or www.
function asUrl(text) {
  if (/\s/.test(text)) return null
  if (/^(https?:\/\/|mailto:)\S+$/i.test(text)) return text
  if (/^www\.[^\s/]+\.[a-z]{2,}/i.test(text)) return 'https://' + text
  return null
}

// youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…, and where in it to start
function youtubeLink(s) {
  s = (s || '').trim()
  // the embed code YouTube gives (Share, Embed) has the link in it
  const frame = s.match(/^<iframe\b[^>]*\ssrc="([^"]+)"[\s\S]*<\/iframe>$/i)
  if (frame) s = frame[1].replace(/&amp;/g, '&')
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,20})([?&#][^\s]*)?$/)
  if (!m) return null
  const t = (m[2] || '').match(/[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?(?:&|$)/)
  const start = t ? (+t[1] || 0) * 3600 + (+t[2] || 0) * 60 + (+t[3] || 0) : 0
  return { id: m[1], params: start ? `?start=${start}` : '' }
}

// in at once, where the caret is; its title, asked of YouTube, follows
async function insertYoutube(link, at) {
  placeBlock({ type: 'youtube', attrs: { ...link, title: '' } }, at)
  changed()
  const { title } = await call('/api/youtube?id=' + link.id).catch(() => ({ title: '' }))
  if (!title) return
  const tr = editor.state.tr
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'youtube' && n.attrs.id === link.id && !n.attrs.title) tr.setNodeAttribute(pos, 'title', title)
  })
  if (tr.docChanged) editor.view.dispatch(tr)
}

// The id an older heading had, so the links to it keep working.
const HeadingId = Extension.create({
  name: 'headingId',
  addGlobalAttributes() {
    return [{ types: ['heading'], attributes: { hid: { default: null, rendered: false, keepOnSplit: false } } }]
  },
})

function figureView(node, getPos, editor) {
  const dom = el('figure', 'ed-fig')
  const media = el('div', 'ed-media')
  media.contentEditable = 'false'
  const cap = el('figcaption')
  dom.append(media, cap)

  const act = (label, title, fn) => {
    const b = el('button', '', label)
    b.type = 'button'
    b.title = title
    b.onclick = e => { e.preventDefault(); fn() }
    return b
  }
  const where = () => {
    const pos = getPos()
    const $pos = editor.state.doc.resolve(pos)
    return { pos, $pos, inCarousel: $pos.parent.type.name === 'carousel', index: $pos.index() }
  }
  const draw = () => {
    const src = node.attrs.src
    const tools = el('div', 'ed-tools')
    const w = typeof getPos === 'function' && getPos() != null ? where() : { inCarousel: false }
    if (w.inCarousel) {
      tools.append(act('‹', 'Move left', () => moveSlide(getPos, -1)), act('›', 'Move right', () => moveSlide(getPos, 1)))
    } else {
      tools.append(act('+', 'Add pictures beside it, as a carousel', () =>
        pick('image/*,video/mp4,video/webm,video/quicktime', true, files => addSlides(getPos, files))))
      if (!isVideo(src)) {
        // half the column, on one side, the text running round it; again, back to the whole column
        const side = node.attrs.float
        for (const [to, label, title] of [['left', '◧', 'Half the column, on the left, the text running round it'],
          ['right', '◨', 'Half the column, on the right, the text running round it']]) {
          const b = act(label, side === to ? 'Back to the whole column' : title, () =>
            editor.view.dispatch(editor.state.tr.setNodeAttribute(getPos(), 'float', side === to ? null : to)))
          b.classList.toggle('on', side === to)
          tools.append(b)
        }
      }
    }
    tools.append(act('alt', 'Describe it, for anyone who cannot see it', async () => {
      const alt = await askLine('Describe the picture, for anyone who cannot see it', node.attrs.alt || '')
      if (alt !== null) editor.chain().command(({ tr }) => { tr.setNodeAttribute(getPos(), 'alt', alt.trim()); return true }).run()
    }))
    tools.append(act('×', 'Take it out', () => removeFigure(getPos)))
    let m
    if (isVideo(src)) {
      m = el('video')
      Object.assign(m, { muted: true, loop: true, autoplay: true, playsInline: true })
      m.src = mediaUrl(src)
    } else {
      m = el('img')
      m.src = mediaUrl(src)
      m.alt = node.attrs.alt || ''
      m.onerror = () => m.replaceWith(el('div', 'missing', `${src} is not in the post's folder`))
    }
    media.replaceChildren(m, tools)
    const side = !w.inCarousel && !isVideo(src) && node.attrs.float
    dom.classList.toggle('float-left', side === 'left')
    dom.classList.toggle('float-right', side === 'right')
    dom.style.width = side ? node.attrs.width || '50%' : ''
  }
  // drawn once it is in the document, so it can tell whether it is in a carousel
  queueMicrotask(draw)
  return {
    dom, contentDOM: cap,
    update(n) {
      if (n.type.name !== 'figure') return false
      const again = ['src', 'alt', 'float', 'width'].some(k => n.attrs[k] !== node.attrs[k])
      node = n
      if (again) draw()
      else queueMicrotask(draw)   // it may have moved in or out of a carousel
      return true
    },
    ignoreMutation: m => m.type !== 'selection' && !cap.contains(m.target),
    stopEvent: e => media.contains(e.target),
  }
}

function moveSlide(getPos, by) {
  const { state, view } = editor
  const pos = getPos()
  const $pos = state.doc.resolve(pos)
  const car = $pos.parent
  const i = $pos.index()
  const j = i + by
  if (j < 0 || j >= car.childCount) return
  const kids = []
  car.forEach(k => kids.push(k))
  ;[kids[i], kids[j]] = [kids[j], kids[i]]
  const start = $pos.before()
  view.dispatch(state.tr.replaceWith(start, start + car.nodeSize, car.type.create(car.attrs, kids)))
}

function removeFigure(getPos) {
  const { state, view } = editor
  const pos = getPos()
  const $pos = state.doc.resolve(pos)
  const fig = state.doc.nodeAt(pos)
  if ($pos.parent.type.name === 'carousel') {
    const car = $pos.parent
    const start = $pos.before()
    const kids = []
    car.forEach(k => { if (k !== fig) kids.push(k) })
    // one picture left is a picture, not a carousel
    const next = kids.length === 1 ? kids[0] : car.type.create(car.attrs, kids)
    view.dispatch(state.tr.replaceWith(start, start + car.nodeSize, next))
  } else {
    view.dispatch(state.tr.delete(pos, pos + fig.nodeSize))
  }
}

async function addSlides(getPos, files) {
  const names = await uploadAll(files)
  if (!names.length) return
  const { state, view } = editor
  const pos = getPos()
  const node = state.doc.nodeAt(pos)
  const figs = names.map(n => state.schema.nodes.figure.create({ src: n }))
  if (node.type.name === 'carousel') {
    view.dispatch(state.tr.insert(pos + node.nodeSize - 1, figs))
  } else {
    const $pos = state.doc.resolve(pos)
    if ($pos.parent.type.name === 'carousel') {
      view.dispatch(state.tr.insert($pos.after() - 1, figs))
    } else {
      const whole = node.type.create({ ...node.attrs, float: null, html: false }, node.content)
      const car = state.schema.nodes.carousel.create(null, [whole, ...figs])
      view.dispatch(state.tr.replaceWith(pos, pos + node.nodeSize, car))
    }
  }
}

// ---------------------------------------------------------------- files in

let picking = null
function pick(accept, multiple, then) {
  const f = $('#file')
  f.accept = accept
  f.multiple = multiple
  f.value = ''
  picking = then
  f.click()
}
$('#file').addEventListener('change', e => {
  const files = [...e.target.files]
  if (files.length && picking) picking(files)
  picking = null
})

const usable = f => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|gif|webp|mp4|webm|mov|m4v)$/i.test(f.name)

async function uploadAll(files) {
  files = files.filter(usable)
  if (!files.length) return []
  const names = []
  const videos = files.some(f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name))
  toast(files.length > 1 ? `Adding ${files.length} files…` : videos ? 'Adding the video…' : 'Adding the picture…', false, 0)
  try {
    for (const f of files) names.push((await upload(f)).name)
    toast(files.length > 1 ? `${files.length} added` : 'Added')
  } catch (e) {
    toast(e.message, true, 6000)
  }
  if (names.length) changed()
  return names
}

// files where the text is: an empty line's own, or after the block at pos
async function insertFiles(files, at) {
  const names = await uploadAll(files)
  if (!names.length) return
  const figs = names.map(n => ({ type: 'figure', attrs: { src: n } }))
  placeBlock(figs.length > 1 ? { type: 'carousel', content: figs } : figs[0], at)
}

// a block in place of the empty line the caret is on, or after the block at pos
// A picture, a video, a carousel, put in where the caret is: in place of an
// empty line; before or after a paragraph if the caret is at its start or
// end; and in the middle of one, the paragraph is split there for it. Or at
// pos, between two blocks, or in place of {from, to}.
function placeBlock(node, at, { newLine = at == null } = {}) {
  const { state } = editor
  let where = at
  if (where == null) {
    const { $from } = state.selection
    const p = $from.parent
    if ($from.depth === 1 && p.type.name === 'paragraph') {
      if (!p.content.size) where = { from: $from.before(1), to: $from.after(1) }
      else if ($from.parentOffset === 0) where = $from.before(1)
      else if ($from.parentOffset === p.content.size) where = $from.after(1)
      else {
        editor.view.dispatch(state.tr.split($from.pos))
        where = $from.pos + 1          // between the two halves
      }
    } else where = $from.depth ? $from.after(1) : $from.pos
  }
  const start = typeof where === 'number' ? where : where.from
  // and the caret goes on to the paragraph after it; put in from the caret,
  // to a new line if there is none (a drop between two blocks makes none)
  editor.chain().focus().insertContentAt(where, node).command(({ tr }) => {
    const end = start + tr.doc.nodeAt(start).nodeSize
    const next = tr.doc.nodeAt(end)
    const para = next && next.type.name === 'paragraph'
    if (!para && !newLine) return true
    if (!para) tr.insert(end, tr.doc.type.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, end + 1))
    return true
  }).run()
}

// Where between the blocks a point on the page is: the gap nearest it, or
// an empty line it is on. line: where on the screen to show it.
function gapAt(y) {
  const { doc } = editor.state
  let best = null
  let prevBottom = null
  doc.forEach((node, offset) => {
    if (best) return
    const dom = editor.view.nodeDOM(offset)
    if (!(dom instanceof Element)) return
    const r = dom.getBoundingClientRect()
    if (node.type.name === 'paragraph' && !node.content.size && y >= r.top - 6 && y <= r.bottom + 6) {
      best = { at: { from: offset, to: offset + node.nodeSize }, line: (r.top + r.bottom) / 2 }
    } else if (y < r.top + r.height / 2) {
      best = { at: offset, line: prevBottom == null ? r.top - 8 : (prevBottom + r.top) / 2 }
    }
    prevBottom = r.bottom
  })
  return best || { at: doc.content.size, line: (prevBottom ?? 0) + 10 }
}

// Pictures and videos dragged onto the page go between the paragraphs
// nearest where they are let go, a line showing where while they are held.
// Anywhere on the page: a file let go of outside the text would otherwise
// be opened by the browser in place of the editor. The featured image's
// strip takes its own.
const dropline = el('div', 'dropline')
dropline.hidden = true
document.body.append(dropline)
const holdsFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
const forText = e => editor && !$('#edit').hidden && !(e.target instanceof Element && e.target.closest('#cover'))

document.addEventListener('dragover', e => {
  if (!holdsFiles(e)) return
  e.preventDefault()
  if (!forText(e)) { dropline.hidden = true; return }
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'copy'
  const r = editor.view.dom.getBoundingClientRect()
  Object.assign(dropline.style, { left: r.left + 'px', width: r.width + 'px', top: gapAt(e.clientY).line + 'px' })
  dropline.hidden = false
}, true)
document.addEventListener('drop', e => {
  if (!holdsFiles(e)) return
  e.preventDefault()
  dropline.hidden = true
  if (!forText(e)) return
  e.stopPropagation()
  insertFiles([...e.dataTransfer.files], gapAt(e.clientY).at)
}, true)
document.addEventListener('dragleave', e => { if (!e.relatedTarget) dropline.hidden = true })
document.addEventListener('dragend', () => { dropline.hidden = true })

// ---------------------------------------------------------------- one post

let editor = null
let review = null         // the proofreader's underlines on it
let post = null          // {slug, published, title, subtitle, date, categories, cover}
let dirty = false
let saving = null
let saveTimer = null
let coverBust = 0

function status(text) { $('#status').textContent = text }

function changed() {
  if (!post) return
  dirty = true
  status('Edited')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(), 1500)
}

function payload() {
  return {
    slug: post.slug,
    title: $('#title').textContent.trim(),
    subtitle: $('#subtitle').textContent.trim(),
    categories: post.categories,
    cover: post.cover,
    body: editor ? serialize(editor.getJSON()) : post.body,
  }
}

async function save(quiet = true) {
  clearTimeout(saveTimer)
  if (!post) return
  if (saving) await saving
  if (!dirty && quiet) return
  const body = payload()
  dirty = false
  status('Saving…')
  saving = call('/api/save', body).then(() => {
    post.draft = true
    status(post.published ? 'Unpublished changes, saved' : 'Draft, saved')
    setDiscard()
    if (!quiet) toast('Saved')
  }).catch(e => {
    dirty = true
    status('Not saved')
    toast('Could not save: ' + e.message, true, 6000)
  }).finally(() => { saving = null })
  return saving
}

function setDiscard() {
  const b = $('#discard')
  b.textContent = post.published ? (post.draft ? 'Discard changes' : '') : 'Move to trash'
  b.hidden = !b.textContent
  $('#publish').textContent = post.published ? 'Publish changes' : 'Publish'
  $('#share').hidden = !post.published
}

async function showPost(slug) {
  $('#list').hidden = true
  $('#edit').hidden = false
  if (!config.posts) config = await call('/api/posts').catch(() => config)
  if (slug) {
    post = await call('/api/post?slug=' + encodeURIComponent(slug))
  } else {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const id = `draft-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    post = { slug: id, published: false, draft: false, title: '', subtitle: '', date: '', categories: [], cover: '', body: '' }
    history.replaceState(null, '', '#/edit/' + id)
  }
  dirty = false
  document.title = (post.title || 'Untitled') + ' · Writing'
  $('#title').textContent = post.title
  $('#subtitle').textContent = post.subtitle
  $('#when').textContent = post.published ? niceDate(post.date) : 'Draft'
  drawCats()
  drawCover()
  setDiscard()
  status(post.draft ? (post.published ? 'Unpublished changes' : 'Draft') : post.published ? 'On the blog' : 'New post')

  const { doc } = parse(post.body)
  const fits = roundTrips(post.body)
  $('#old').hidden = fits
  $('#old').textContent = fits ? '' : 'This post was written before the editor and has things in it the editor can only show as plain text ' +
    '(maths, HTML in the middle of a sentence, or a link with a title). Saving here would write those out as plain text. ' +
    'It is safer to change this one in its index.md.'
  makeEditor(doc)
  if (!post.title) $('#title').focus()
}

function makeEditor(doc) {
  if (editor) editor.destroy()
  linkbox.hidden = true
  plus.classList.remove('open')
  editor = new Editor({
    element: $('#body'),
    content: doc,
    editorProps: {
      attributes: { class: 'body', spellcheck: 'true' },
      // the bar over the post is not where the line being written goes
      scrollMargin: { top: 110, bottom: 80, left: 0, right: 0 },
      scrollThreshold: { top: 110, bottom: 80, left: 0, right: 0 },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files || [])]
        if (files.length) { insertFiles(files); return true }
        const text = (event.clipboardData?.getData('text/plain') || '').trim()
        const { selection } = view.state
        if (!text || selection.$from.parent.type.spec.code) return false
        // a link pasted over a selection links it
        const url = asUrl(text)
        if (url && !selection.empty && selection instanceof TextSelection) {
          editor.chain().focus().setLink({ href: url }).run()
          return true
        }
        // a tweet's link on an empty line is the tweet
        const tw = tweetLink(text)
        if (tw && selection.empty && selection.$from.depth === 1 && selection.$from.parent.type.name === 'paragraph'
            && !selection.$from.parent.content.size) {
          insertTweet(tw)
          return true
        }
        // a YouTube link, or YouTube's embed code, is the video, where the caret is
        const video = youtubeLink(text)
        if (video && selection.empty && selection.$from.depth === 1 && selection.$from.parent.type.name === 'paragraph') {
          insertYoutube(video)
          return true
        }
        return false
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { target: null, rel: null } },
      }),
      HeadingId,
      MathNode,
      Youtube,
      Tweet,
      Figure,
      Carousel,
      RawHtml,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ editor, node }) => {
          if (node.type.name === 'heading') return 'Heading'
          if (node.type.name === 'paragraph' && editor.state.doc.childCount === 1) return 'Tell your story…'
          return ''
        },
      }),
      BubbleMenu.configure({
        element: bubble,
        shouldShow: ({ editor, state, from, to }) => {
          if (linkRange) return false
          if (from === to || !(state.selection instanceof TextSelection)) return false
          if (editor.isActive('codeBlock') || editor.isActive('rawHtml')) return false
          return true
        },
        appendTo: () => document.body,
        options: { placement: 'top', offset: 8, hide: true },
      }),
      FloatingMenu.configure({
        element: plus,
        shouldShow: ({ editor, state }) => {
          const { $from, empty } = state.selection
          const ok = empty && $from.depth === 1 && $from.parent.type.name === 'paragraph' && !$from.parent.content.size
          if (!ok) plus.classList.remove('open')
          return ok && editor.isEditable
        },
        appendTo: () => document.body,
        options: { placement: 'left-start', offset: 14, flip: false, hide: true },
      }),
    ],
    onUpdate: () => { changed(); review?.edited() },
    onSelectionUpdate: lightBubble,
    onTransaction: lightBubble,
  })
  review = reviewer(editor, { slug: () => post.slug, call, toast, factState,
    report: (text, why) => Object.assign($('#review-status'), { textContent: text, title: why || '' }) })
}

// idle, busy, or done: checked and nothing found, until the text changes
function factState(state) {
  const b = $('#facts')
  b.disabled = state === 'busy'
  b.textContent = state === 'busy' ? 'Fact checking…' : state === 'done' ? 'Fact checked ✔' : 'Fact check'
}

function lightBubble() {
  if (!editor) return
  const b = bubble
  for (const [cmd, on] of [['bold', editor.isActive('bold')], ['italic', editor.isActive('italic')], ['link', editor.isActive('link')],
    ['h2', editor.isActive('heading', { level: 2 })], ['h3', editor.isActive('heading', { level: 3 })], ['quote', editor.isActive('blockquote')]]) {
    b.querySelector(`[data-cmd="${cmd}"]`).classList.toggle('on', on)
  }
  b.classList.toggle('caption', editor.isActive('figure') || editor.isActive('youtube'))
}

// ---------------------------------------------------------------- the menus

bubble.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault() })
bubble.addEventListener('click', e => {
  const cmd = e.target.closest('button')?.dataset.cmd
  if (!cmd) return
  const c = editor.chain().focus()
  if (cmd === 'bold') c.toggleBold().run()
  if (cmd === 'italic') c.toggleItalic().run()
  if (cmd === 'h2') c.toggleHeading({ level: 2 }).run()
  if (cmd === 'h3') c.toggleHeading({ level: 3 }).run()
  if (cmd === 'quote') c.toggleBlockquote().run()
  if (cmd === 'link') startLink()
  if (cmd === 'math') insertMath()
})

function startLink() {
  const { from, to } = editor.state.selection
  linkRange = { from, to }
  linkInput.value = editor.getAttributes('link').href || ''
  // under the selection, on the page: the bubble goes while the link is typed
  const a = editor.view.coordsAtPos(from), b = editor.view.coordsAtPos(to)
  linkbox.hidden = false
  linkbox.style.left = Math.max(8, (a.left + b.right) / 2 - linkbox.offsetWidth / 2 + scrollX) + 'px'
  linkbox.style.top = b.bottom + 8 + scrollY + 'px'
  editor.view.dispatch(editor.state.tr)      // so the bubble hides
  linkInput.focus()
}

function endLink(apply) {
  if (!linkRange) return
  const href = linkInput.value.trim()
  const range = linkRange
  linkRange = null
  linkbox.hidden = true
  const c = editor.chain().setTextSelection(range).extendMarkRange('link')
  if (apply && !href) c.unsetLink()
  else if (apply) c.setLink({ href: /^(https?:|mailto:|\/|#)/.test(href) ? href : 'https://' + href })
  c.run()
  // back to the text, just after what was linked, at once
  editor.commands.setTextSelection(editor.state.selection.to)
  editor.view.focus()
}

linkInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); endLink(true) }
  if (e.key === 'Escape') { e.preventDefault(); endLink(false) }
})
linkInput.addEventListener('blur', () => endLink(true))

plus.addEventListener('mousedown', e => e.preventDefault())
plus.addEventListener('click', e => {
  const cmd = e.target.closest('button')?.dataset.cmd
  if (!cmd) return
  if (cmd === 'toggle') { plus.classList.toggle('open'); return }
  plus.classList.remove('open')
  if (cmd === 'image') pick('image/*', true, files => insertFiles(files))
  if (cmd === 'video') pick('video/mp4,video/webm,video/quicktime,.mov,.m4v', false, files => insertFiles(files))
  if (cmd === 'youtube') {
    const { from } = editor.state.selection
    const c = editor.view.coordsAtPos(from)
    ask({
      placeholder: 'Paste a YouTube link, then Enter',
      near: { left: c.left, right: c.left + 280, bottom: c.bottom },
      done: v => {
        if (!v) return editor.view.focus()
        const link = youtubeLink(v)
        if (link) insertYoutube(link)
        else toast('That is not a YouTube link', true)
      },
    })
  }
  if (cmd === 'math') insertMath()
  if (cmd === 'hr') editor.chain().focus().setHorizontalRule().run()
  if (cmd === 'code') editor.chain().focus().setCodeBlock().run()
})

// ---------------------------------------------------------------- asking for a line

let asking = null
let previewTimer = null

function ask({ value = '', placeholder = '', near, preview = null, done }) {
  asking = { done, preview }
  askInput.value = value
  askInput.placeholder = placeholder
  askPreview.replaceChildren()
  askPreview.hidden = !preview
  askbox.hidden = false
  const mid = (near.left + near.right) / 2
  askbox.style.left = Math.max(8, Math.min(mid - askbox.offsetWidth / 2, innerWidth - askbox.offsetWidth - 8)) + scrollX + 'px'
  askbox.style.top = near.bottom + 10 + scrollY + 'px'
  askInput.focus()
  askInput.select()
  showPreview()
}

function showPreview() {
  if (!asking || !asking.preview) return
  const { preview } = asking
  const v = askInput.value
  clearTimeout(previewTimer)
  previewTimer = setTimeout(async () => {
    const html = await preview(v).catch(() => '')
    if (asking && asking.preview === preview && askInput.value === v) askPreview.innerHTML = html
  }, 120)
}

function finishAsk(value) {
  if (!asking) return
  const { done } = asking
  asking = null
  askbox.hidden = true
  done(value)
}

askInput.addEventListener('input', showPreview)
askInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); finishAsk(askInput.value) }
  if (e.key === 'Escape') { e.preventDefault(); finishAsk(null) }
})
askInput.addEventListener('blur', () => finishAsk(askInput.value))

document.addEventListener('keydown', e => {
  if (!post || $('#edit').hidden) return
  const mod = e.metaKey || e.ctrlKey
  if (e.key === 'Escape') plus.classList.remove('open')
  if (mod && e.key === 's') { e.preventDefault(); dirty = true; save(false) }
  if (mod && e.key === 'k' && editor?.isFocused && !editor.state.selection.empty) { e.preventDefault(); startLink() }
})

// ---------------------------------------------------------------- the head: title, subtitle, categories, cover

for (const id of ['title', 'subtitle']) {
  const box = $('#' + id)
  box.addEventListener('input', () => {
    if (!box.textContent.trim() && box.innerHTML) box.innerHTML = ''
    if (id === 'title') document.title = (box.textContent.trim() || 'Untitled') + ' · Writing'
    changed()
  })
  box.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (id === 'title') $('#subtitle').focus()
    else editor.commands.focus('start')
  })
  box.addEventListener('paste', e => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '))
  })
}

function drawCats() {
  $('#cats').replaceChildren(...post.categories.map(c => {
    const s = el('span', 'cat', c)
    const x = el('button', '', '×')
    x.type = 'button'
    x.title = 'Take this category off'
    x.onclick = () => { post.categories = post.categories.filter(k => k !== c); drawCats(); changed() }
    s.append(x)
    return s
  }))
}

function addCat(v = $('#cat-add').value) {
  const input = $('#cat-add')
  v = v.trim().replace(/,$/, '')
  input.value = ''
  drawCatMenu()
  if (!v) return
  const known = (config.categories || []).find(c => c.toLowerCase() === v.toLowerCase())
  const c = known || v
  if (!post.categories.some(k => k.toLowerCase() === c.toLowerCase())) post.categories.push(c)
  drawCats()
  changed()
}

// the categories the blog already has, under the field, narrowed by what is typed
let catPick = -1
function drawCatMenu() {
  const input = $('#cat-add'), menu = $('#cat-menu')
  const q = input.value.trim().toLowerCase()
  const open = document.activeElement === input
  const opts = open ? (config.categories || [])
    .filter(c => !post.categories.some(k => k.toLowerCase() === c.toLowerCase()))
    .filter(c => c.toLowerCase().includes(q)) : []
  catPick = Math.min(catPick, opts.length - 1)
  menu.replaceChildren(...opts.map((c, i) => {
    const b = el('button', i === catPick ? 'on' : '', c)
    b.type = 'button'
    b.onmousedown = e => { e.preventDefault(); addCat(c) }
    return b
  }))
  menu.hidden = !opts.length
}
$('#cat-add').addEventListener('keydown', e => {
  const opts = [...$('#cat-menu').children]
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!opts.length) return
    // round through the options and back to what is typed
    const n = opts.length + 1
    catPick = (catPick + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n) % n - 1
    drawCatMenu()
  }
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addCat(catPick >= 0 && opts[catPick] ? opts[catPick].textContent : e.target.value)
    catPick = -1
  }
  if (e.key === 'Escape') { catPick = -1; e.target.blur() }
  if (e.key === 'Backspace' && !e.target.value && post.categories.length) {
    post.categories.pop(); drawCats(); changed(); drawCatMenu()
  }
})
$('#cat-add').addEventListener('input', () => { catPick = -1; drawCatMenu() })
$('#cat-add').addEventListener('focus', drawCatMenu)
$('#cat-add').addEventListener('blur', () => { catPick = -1; drawCatMenu() })

function drawCover() {
  const box = $('#cover')
  if (!post.cover) {
    const b = el('button', 'cover-add', '+ Add a featured image')
    b.type = 'button'
    b.title = 'It heads the post, and is the picture on its card'
    b.onclick = () => pick('image/*', false, files => setCover(files[0]))
    box.className = 'ed-cover'
    box.replaceChildren(b)
    return
  }
  box.className = 'ed-cover cover'
  const img = el('img')
  img.src = mediaUrl(post.cover, coverBust)
  img.alt = ''
  const tools = el('div', 'cover-tools')
  const change = el('button', '', 'Replace')
  change.type = 'button'
  change.onclick = () => pick('image/*', false, files => setCover(files[0]))
  const drop = el('button', '', 'Remove')
  drop.type = 'button'
  drop.onclick = () => { post.cover = ''; drawCover(); changed() }
  tools.append(change, drop)
  box.replaceChildren(img, tools)
}

async function setCover(file) {
  if (!file || !usable(file) || /^video\//.test(file.type)) return toast('The featured image has to be a picture', true)
  toast('Adding the featured image…', false, 0)
  try {
    const r = await upload(file, true)
    post.cover = r.name
    coverBust = Date.now()
    drawCover()
    toast('Featured image set')
    changed()
  } catch (e) {
    toast(e.message, true, 6000)
  }
}

// a picture dropped on the head of the post is its featured image
const cover = $('#cover')
cover.addEventListener('dragover', e => { e.preventDefault(); cover.classList.add('dropping') })
cover.addEventListener('dragleave', () => cover.classList.remove('dropping'))
cover.addEventListener('drop', e => {
  e.preventDefault()
  cover.classList.remove('dropping')
  const f = [...e.dataTransfer.files][0]
  if (f) setCover(f)
})

// ---------------------------------------------------------------- the bar

$('#edit .ed-bar').addEventListener('click', async e => {
  const act = e.target.closest('button')?.dataset.act
  if (act === 'save') { dirty = true; save(false) }
  if (act === 'preview') preview()
  if (act === 'facts') review?.checkFacts()
  if (act === 'publish') publishDialog()
  if (act === 'discard') discard()
  if (act === 'share') shareDialog()
})

$('[data-act="new"]').addEventListener('click', () => { location.hash = '#/new' })

async function preview() {
  const w = window.open('', '_blank')
  if (w) w.document.write('<body style="background:#333331;color:#e6e2d2;font:1.2rem Georgia,serif;padding:3rem">Building the blog for a preview… (the first time takes a while)</body>')
  dirty = true
  await save()
  try {
    await call('/api/preview', payload())
    const url = '/preview/' + post.slug
    if (w) w.location = url
    else toast('Preview ready at ' + url)
  } catch (e) {
    if (w) w.close()
    toast(e.message, true, 8000)
  }
}

async function discard() {
  const ok = await sure(post.published
    ? ['Discard the changes?', 'They go to the trash, and the post is as it is on the blog. They can come back from the trash, at the foot of the list of posts, until it is emptied.', 'Discard changes']
    : ['Move this draft to the trash?', 'With its pictures. It can come back from the trash, at the foot of the list of posts, until it is emptied.', 'Move to trash'])
  if (!ok) return
  clearTimeout(saveTimer)
  dirty = false
  try {
    await call('/api/discard', { slug: post.slug })
  } catch (e) {
    return toast(e.message, true, 8000)
  }
  if (post.published) showPost(post.slug)
  else location.hash = '#/'
}

// Asked on the page: the browser's own confirm() and prompt() are not shown
// everywhere (the app's browser answers them with a silent no).
function sure([title, text, yes]) {
  return new Promise(done => {
    const d = dialog(d => {
      const row = el('div', 'row')
      const no = el('button', 'btn', 'Cancel')
      no.onclick = () => d.close()
      const go = el('button', 'btn primary', yes)
      go.onclick = () => { d.returnValue = 'yes'; d.close() }
      row.append(no, go)
      return [el('h2', '', title), el('p', '', text), row]
    })
    d.returnValue = ''
    d.addEventListener('close', () => done(d.returnValue === 'yes'), { once: true })
  })
}

function askLine(title, value) {
  return new Promise(done => {
    let input
    const d = dialog(d => {
      input = el('input', 'line')
      input.value = value
      const row = el('div', 'row')
      const no = el('button', 'btn', 'Cancel')
      no.onclick = () => d.close()
      const go = el('button', 'btn primary', 'Done')
      go.onclick = () => { d.returnValue = 'yes'; d.close() }
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go.click() } }
      row.append(no, go)
      return [el('h2', '', title), input, row]
    })
    d.returnValue = ''
    input.focus()
    d.addEventListener('close', () => done(d.returnValue === 'yes' ? input.value : null), { once: true })
  })
}

function dialog(build) {
  const d = $('#dialog')
  d.replaceChildren(...build(d))
  if (!d.open) d.showModal()
  return d
}

async function publishDialog() {
  const title = $('#title').textContent.trim()
  if (!title) { toast('Give it a title first', true); $('#title').focus(); return }
  dirty = true
  await save()
  const { files } = await call('/api/leftovers?slug=' + encodeURIComponent(post.slug)).catch(() => ({ files: [] }))
  dialog(d => {
    const out = [el('h2', '', post.published ? 'Publish the changes' : `Publish “${title}”`)]
    let addr
    if (!post.published) {
      out.push(el('label', '', 'Its address'))
      const row = el('div', 'addr')
      addr = el('input')
      addr.value = slugify(title)
      addr.spellcheck = false
      row.append(el('span', '', 'vandesande.design/blog/'), addr)
      out.push(row, el('p', 'note', 'It cannot change once the post is out.'))
    }
    const notes = []
    if (!post.cover) notes.push('There is no featured image: the post and its card will have no picture.')
    if (!post.categories.length) notes.push('It has no categories.')
    if (files.length) notes.push(`These files in its folder are not used any more, and will be deleted: ${files.join(', ')}`)
    if (notes.length) {
      const ul = el('ul')
      ul.append(...notes.map(n => el('li', '', n)))
      out.push(ul)
    }
    out.push(el('p', 'note', 'Publishing commits this post’s folder and pushes it, and the blog deploys in a minute or two.'))
    const row = el('div', 'row')
    const cancel = el('button', 'btn', 'Cancel')
    cancel.onclick = () => d.close()
    const go = el('button', 'btn primary', post.published ? 'Publish changes' : 'Publish')
    go.onclick = async () => {
      go.disabled = cancel.disabled = true
      go.textContent = 'Publishing…'
      try {
        const r = await call('/api/publish', { ...payload(), as: addr ? slugify(addr.value) || slugify(title) : post.slug })
        dirty = false
        published(r)
      } catch (e) {
        go.disabled = cancel.disabled = false
        go.textContent = 'Try again'
        toast(e.message, true, 8000)
      }
    }
    row.append(cancel, go)
    out.push(row)
    return out
  })
}

function published(r) {
  dialog(d => {
    const out = []
    if (r.pushed) {
      out.push(el('h2', '', 'It is out'))
      out.push(el('p', '', r.branch === 'main'
        ? 'Committed and pushed. The blog deploys in a minute or two.'
        : `Committed and pushed to the branch ${r.branch}. It goes live once that is merged into main.`))
    } else if (r.committed) {
      out.push(el('h2', '', 'Committed, but not pushed'))
      out.push(el('p', '', 'The post is published in this copy of the site, but it could not be pushed. Push it yourself (git push), and it goes live.'))
    } else {
      out.push(el('h2', '', 'Published here, not committed'))
      out.push(el('p', '', 'The post is now index.md in its folder, but git did not commit it. Commit and push it yourself.'))
    }
    if (!r.pushed && r.log) out.push(el('pre', '', r.log))
    if (r.bluesky) out.push(el('p', 'note', 'Its record on Bluesky was not updated: ' + r.bluesky))
    const row = el('div', 'row')
    const back = () => {
      const to = '#/edit/' + r.slug
      if (location.hash === to) return route()
      location.hash = to
      return new Promise(ok => window.addEventListener('hashchange', () => setTimeout(ok, 300), { once: true }))
    }
    if (r.pushed && r.branch === 'main') {
      const share = el('button', 'btn', 'Share on Bluesky…')
      share.onclick = async () => { d.close(); await back(); shareDialog() }
      row.append(share)
    }
    const ok = el('button', 'btn primary', 'Done')
    ok.onclick = () => { d.close(); back() }
    row.append(ok)
    out.push(row)
    return out
  })
}

// ---------------------------------------------------------------- on Bluesky

const graphemes = s => [...new Intl.Segmenter().segment(s)].length

async function shareDialog() {
  let st
  try { st = await call('/api/bluesky?slug=' + encodeURIComponent(post.slug)) } catch (e) { toast(e.message, true, 8000); return }
  dialog(d => {
    const out = [el('h2', '', 'Share on Bluesky')]
    const row = el('div', 'row')
    const close = el('button', 'btn', 'Close')
    close.onclick = () => d.close()
    if (!st.account) {
      out.push(el('p', '', 'No Bluesky account is set up for the blog. Make an app password on bsky.app (Settings → Privacy and security → App passwords), then in a terminal:'))
      out.push(el('pre', '', 'security add-generic-password -s blog-bluesky -a YOUR.HANDLE -w\npython3 blog/crosspost.py setup'))
      out.push(el('p', 'note', 'The first keeps the password in the keychain (it asks for it). The second puts the blog on Bluesky as a publication; commit what it writes in blog/_well-known.'))
      row.append(close); out.push(row)
      return out
    }
    if (st.posted) {
      const p = el('p', '', 'It is on Bluesky: ')
      const a = el('a', '', st.posted)
      a.href = st.posted; a.target = '_blank'
      p.append(a)
      out.push(p)
      row.append(close); out.push(row)
      return out
    }
    // the card it will have, as Bluesky draws it
    const card = el('div', 'bsky-card')
    if (post.cover) {
      const img = el('img')
      img.src = mediaUrl(post.cover, coverBust)
      card.append(img)
    }
    const words = el('div')
    words.append(el('small', '', st.url.replace(/^https?:\/\//, '')), el('b', '', post.title))
    if (post.subtitle) words.append(el('span', '', post.subtitle))
    card.append(words)
    out.push(el('label', '', 'What you say over it, if anything'))
    const text = el('textarea', 'bsky-text')
    text.rows = 4
    text.placeholder = 'Nothing: the card alone'
    const count = el('span', 'count', '0 / 300')
    text.oninput = () => {
      const n = graphemes(text.value)
      count.textContent = `${n} / 300`
      count.classList.toggle('over', n > 300)
      go.disabled = n > 300
    }
    out.push(text, count, card)
    const note = el('p', 'note', st.live ? `As @${st.account}.` : `As @${st.account}. The post is not live at ${st.url} yet: it is sent once it is.`)
    out.push(note)
    const go = el('button', 'btn primary', 'Post')
    let waiting = false
    close.onclick = () => { waiting = false; d.close() }
    go.onclick = async () => {
      go.disabled = text.disabled = true
      go.textContent = 'Posting…'
      try {
        // the blog deploys a minute or two after a push: wait for the page, ten minutes at most
        waiting = true
        for (let i = 0; !st.live; i++) {
          if (!waiting || i >= 40) throw new Error(`The post is not live at ${st.url}.`)
          note.textContent = `Waiting for the post to be live at ${st.url}…`
          await new Promise(ok => setTimeout(ok, 15000))
          if (!waiting) return
          st = await call('/api/bluesky?slug=' + encodeURIComponent(post.slug))
        }
        const r = await call('/api/bluesky', { slug: post.slug, text: text.value })
        st.posted = r.posted
        shareDialog()
      } catch (e) {
        go.disabled = text.disabled = false
        go.textContent = 'Try again'
        note.textContent = e.message
      }
    }
    row.append(close, go)
    out.push(row)
    return out
  })
}

// ---------------------------------------------------------------- where we are

async function route() {
  if (post && dirty) await save()
  const h = location.hash
  try {
    if (h.startsWith('#/edit/')) await showPost(decodeURIComponent(h.slice(7)))
    else if (h === '#/new') await showPost(null)
    else { post = null; if (editor) { editor.destroy(); editor = null } await showList() }
  } catch (e) {
    toast(e.message, true, 8000)
    if (h !== '#/' && h !== '') location.hash = '#/'
  }
}
window.addEventListener('hashchange', route)
window.addEventListener('beforeunload', () => {
  if (post && dirty) fetch('/api/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
})
route()
