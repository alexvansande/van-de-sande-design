// The editor's page: the list of posts, and one post written on the paper
// the blog will set it on. Formatting comes up on a selection; a + on an
// empty line adds a picture, a video, a divider. Everything is saved into
// the post's folder by editor.py, as Markdown and files beside it.

import { Editor, Node, Extension, StarterKit, BubbleMenu, FloatingMenu, Placeholder, TextSelection } from './vendor/tiptap.js'
import { parse, serialize, roundTrips, isVideo } from './md.js'

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
    return { src: { default: null }, alt: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'figure[data-src]', contentElement: 'figcaption',
      getAttrs: e => ({ src: e.getAttribute('data-src'), alt: e.getAttribute('data-alt') || '' }) }]
  },
  renderHTML({ node }) {
    return ['figure', { 'data-src': node.attrs.src, 'data-alt': node.attrs.alt }, ['figcaption', 0]]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => figureView(node, getPos, editor)
  },
  addKeyboardShortcuts() {
    // Enter in a caption goes on to a new paragraph under the picture
    const out = ({ editor }) => {
      const { $from } = editor.state.selection
      if ($from.parent.type.name !== 'figure') return false
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
    }
    tools.append(act('alt', 'Describe it, for anyone who cannot see it', () => {
      const alt = prompt('Describe the picture, for anyone who cannot see it:', node.attrs.alt || '')
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
  }
  // drawn once it is in the document, so it can tell whether it is in a carousel
  queueMicrotask(draw)
  return {
    dom, contentDOM: cap,
    update(n) {
      if (n.type.name !== 'figure') return false
      const again = n.attrs.src !== node.attrs.src || n.attrs.alt !== node.attrs.alt
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
      const car = state.schema.nodes.carousel.create(null, [node, ...figs])
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
  const node = figs.length > 1 ? { type: 'carousel', content: figs } : figs[0]
  const { state } = editor
  if (at == null) {
    const { $from } = state.selection
    const block = $from.node(1)
    if (block && block.type.name === 'paragraph' && !block.textContent && $from.depth === 1) {
      editor.chain().focus().insertContentAt({ from: $from.before(1), to: $from.after(1) }, node).run()
      return
    }
    at = $from.depth ? $from.after(1) : $from.pos
  }
  editor.chain().focus().insertContentAt(at, node).run()
}

// ---------------------------------------------------------------- one post

let editor = null
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
  b.textContent = post.published ? (post.draft ? 'Discard changes' : '') : 'Delete draft'
  b.hidden = !b.textContent
  $('#publish').textContent = post.published ? 'Publish changes' : 'Publish'
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
  $('#cat-list').replaceChildren(...(config.categories || []).map(c => Object.assign(el('option'), { value: c })))
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
      handleDrop(view, event, slice, moved) {
        const files = [...(event.dataTransfer?.files || [])]
        if (moved || !files.length) return false
        event.preventDefault()
        const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
        let at = null
        if (hit) {
          const $p = view.state.doc.resolve(hit.pos)
          at = $p.depth ? $p.after(1) : hit.pos
        }
        insertFiles(files, at)
        return true
      },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files || [])]
        if (!files.length) return false
        insertFiles(files)
        return true
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
          const ok = empty && $from.depth === 1 && $from.parent.type.name === 'paragraph' && !$from.parent.textContent
          if (!ok) plus.classList.remove('open')
          return ok && editor.isEditable
        },
        appendTo: () => document.body,
        options: { placement: 'left-start', offset: 14, flip: false, hide: true },
      }),
    ],
    onUpdate: changed,
    onSelectionUpdate: lightBubble,
    onTransaction: lightBubble,
  })
}

function lightBubble() {
  if (!editor) return
  const b = bubble
  for (const [cmd, on] of [['bold', editor.isActive('bold')], ['italic', editor.isActive('italic')], ['link', editor.isActive('link')],
    ['h2', editor.isActive('heading', { level: 2 })], ['h3', editor.isActive('heading', { level: 3 })], ['quote', editor.isActive('blockquote')]]) {
    b.querySelector(`[data-cmd="${cmd}"]`).classList.toggle('on', on)
  }
  b.classList.toggle('caption', editor.isActive('figure'))
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
  if (cmd === 'hr') editor.chain().focus().setHorizontalRule().run()
  if (cmd === 'code') editor.chain().focus().setCodeBlock().run()
})

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

function addCat() {
  const input = $('#cat-add')
  const v = input.value.trim().replace(/,$/, '')
  input.value = ''
  if (!v) return
  const known = (config.categories || []).find(c => c.toLowerCase() === v.toLowerCase())
  const c = known || v
  if (!post.categories.some(k => k.toLowerCase() === c.toLowerCase())) post.categories.push(c)
  drawCats()
  changed()
}
$('#cat-add').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCat() }
  if (e.key === 'Backspace' && !e.target.value && post.categories.length) {
    post.categories.pop(); drawCats(); changed()
  }
})
$('#cat-add').addEventListener('change', addCat)

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
  if (act === 'publish') publishDialog()
  if (act === 'discard') discard()
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
  const sure = post.published
    ? confirm('Throw away the changes, and go back to the post as it is on the blog?')
    : confirm('Delete this draft, and the pictures in it? This cannot be undone.')
  if (!sure) return
  clearTimeout(saveTimer)
  dirty = false
  await call('/api/discard', { slug: post.slug })
  if (post.published) showPost(post.slug)
  else location.hash = '#/'
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
    const row = el('div', 'row')
    const ok = el('button', 'btn primary', 'Done')
    ok.onclick = () => {
      d.close()
      const to = '#/edit/' + r.slug
      if (location.hash === to) route()
      else location.hash = to
    }
    row.append(ok)
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
