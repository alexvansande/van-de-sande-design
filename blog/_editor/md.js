// The blog's Markdown, to and from the editor's document.
//
// parse() reads Markdown the way build.py's render_blocks() and Inline do,
// rule for rule, into the editor's JSON. serialize() writes the editor's
// document back as Markdown that build.py reads the same way. A post written
// in the editor goes round unchanged; for an older one, roundTrips() says
// whether the editor can hold all of it (raw HTML blocks are kept as they
// are, but not, say, HTML in the middle of a sentence).
//
// Three things the blog writes as HTML are read into the editor's own pieces
// and written back as the same HTML: a YouTube video, a picture at half the
// column with the text running round it, and their captions.

const HTML_BLOCK = /^<(?:\/?(?:figure|p|div|iframe|table|section|details|video|blockquote|ul|ol|h[1-6]|hr|pre|math)\b|!--)/i
const LIST_ITEM = /^( {0,3})([-*+]|\d+[.)])( +)/
const PICTURE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/
const HR = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/
const VIDEO = /\.(mp4|webm)$/i

export const isVideo = src => VIDEO.test(src || '')

// ---------------------------------------------------------------- Markdown → document

export function parse(md) {
  const state = { clean: true }
  const content = blocks(md.replace(/\r\n?/g, '\n'), state)
  return { doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, clean: state.clean }
}

function startsBlock(l) {
  return /^ {0,3}(#{1,6}\s|>|```|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l) || HTML_BLOCK.test(l.trimStart()) || LIST_ITEM.test(l)
}

function blocks(md, state) {
  const lines = md.replace(/\t/g, '    ').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const s = line.trim()
    if (!s) { i++; continue }
    if (s.startsWith('```')) {
      const lang = s.slice(3).trim()
      let j = i + 1
      while (j < lines.length && !lines[j].trim().startsWith('```')) j++
      const code = lines.slice(i + 1, j).join('\n')
      out.push({ type: 'codeBlock', attrs: { language: lang || null }, content: code ? [{ type: 'text', text: code }] : [] })
      i = j + 1
      continue
    }
    if (HTML_BLOCK.test(s)) {
      let j = i
      while (j < lines.length && lines[j].trim()) j++
      const html = lines.slice(i, j).join('\n')
      out.push(youtube(html, state) || floated(html, state) || { type: 'rawHtml', content: [{ type: 'text', text: html }] })
      i = j
      continue
    }
    let m = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/)
    if (m) {
      let text = m[2] || ''
      const given = text.match(/(?:^|\s)\{#([\w:.-]+)\}$/)
      if (given) text = text.slice(0, given.index).trimEnd()
      text = text.replace(/\s+#+$/, '')
      out.push({ type: 'heading', attrs: { level: m[1].length, hid: given ? given[1] : null }, content: inline(text, state) })
      i++
      continue
    }
    if (HR.test(line)) { out.push({ type: 'horizontalRule' }); i++; continue }
    if (/^ {0,3}>/.test(line)) {
      const quoted = []
      let j = i
      while (j < lines.length && /^ {0,3}>/.test(lines[j])) { quoted.push(lines[j].replace(/^ {0,3}> ?/, '')); j++ }
      const inner = blocks(quoted.join('\n'), state)
      out.push({ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] })
      i = j
      continue
    }
    m = line.match(LIST_ITEM)
    if (m) {
      const ordered = /\d/.test(m[2][0])
      const items = []
      let j = i
      while (j < lines.length) {
        const m2 = lines[j].match(LIST_ITEM)
        if (!m2 || /\d/.test(m2[2][0]) !== ordered) break
        const width = m2[0].length
        const pad = ' '.repeat(width)
        const body = [lines[j].slice(width)]
        j++
        while (j < lines.length) {
          const l = lines[j]
          if (l.trim() && (l.startsWith(pad) || !(startsBlock(l) || !body[body.length - 1].trim()))) {
            body.push(l.startsWith(pad) ? l.slice(width) : l.trim()); j++
          } else if (!l.trim() && j + 1 < lines.length && lines[j + 1].startsWith(pad) && lines[j + 1].trim()) {
            body.push(''); j++
          } else break
        }
        let inner = blocks(body.join('\n'), state)
        if (!inner.length || inner[0].type !== 'paragraph') {
          if (inner.length) state.clean = false
          inner = [{ type: 'paragraph' }, ...inner]
        }
        items.push({ type: 'listItem', content: inner })
        if (j < lines.length && !lines[j].trim() && j + 1 < lines.length && LIST_ITEM.test(lines[j + 1])) j++
      }
      if (ordered) {
        const start = parseInt(line.match(/\s*(\d+)/)[1], 10)
        out.push({ type: 'orderedList', attrs: { start }, content: items })
      } else out.push({ type: 'bulletList', content: items })
      i = j
      continue
    }
    let j = i + 1
    while (j < lines.length && lines[j].trim() && !startsBlock(lines[j])) j++
    const para = lines.slice(i, j).map(l => l.trim())
    const shots = para.map(l => l.match(PICTURE))
    if (shots.every(Boolean)) {
      const figs = shots.map(sm => ({ type: 'figure', attrs: { src: sm[2], alt: sm[1] }, content: sm[3] ? inline(sm[3], state) : [] }))
      out.push(figs.length > 1 ? { type: 'carousel', content: figs } : figs[0])
    } else {
      if (shots[0]) state.clean = false     // build.py would show only the picture
      const content = inline(para.join('\n'), state)
      out.push(content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
    }
    i = j
  }
  return out
}

// The inline rules, in the order build.py's Inline applies them. At each
// point the earliest match wins; at the same point, the earlier rule.
const W = '[\\p{L}\\p{N}_]'
const RULES = [
  ['math', /\$\$(.+?)\$\$/u],
  ['escape', /\\([\\`*_[\]{}()#+\-.!<>|~$])/u],
  ['code', /(`+)(.+?)\1/u],
  ['autolink', /<(https?:\/\/[^>\s]+)>/u],
  ['html', /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|<!--.*?-->/u],
  ['image', /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/u],
  ['link', /\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"([^"]*)")?\)/u],
  ['both', /\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/u],
  ['bold', /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/u],
  ['bold', /__(?=\S)([\s\S]+?)(?<=\S)__/u],
  ['italic', /\*(?=\S)([\s\S]+?)(?<=\S)\*/u],
  ['italic', new RegExp(`(?<!${W})_(?=\\S)([\\s\\S]+?)(?<=\\S)_(?!${W})`, 'u')],
  ['break', /(?: {2,}|\\)\n/u],
]

function inline(text, state, marks = []) {
  const out = []
  const push = (t, ms = marks) => {
    if (!t) return
    t = t.replace(/\n/g, ' ')
    const last = out[out.length - 1]
    if (last && last.type === 'text' && sameMarks(last.marks || [], ms)) last.text += t
    else out.push(ms.length ? { type: 'text', text: t, marks: ms } : { type: 'text', text: t })
  }
  let rest = text
  while (rest) {
    let best = null
    for (const [kind, re] of RULES) {
      const m = re.exec(rest)
      if (m && (!best || m.index < best.m.index)) best = { kind, m }
    }
    if (!best) { push(rest); break }
    const { kind, m } = best
    push(rest.slice(0, m.index))
    switch (kind) {
      case 'escape': push(m[1]); break
      case 'code': push(m[2].trim(), [...marks, { type: 'code' }]); break
      case 'link':
        if (m[3]) state.clean = false
        out.push(...inline(m[1], state, [...marks, { type: 'link', attrs: { href: m[2] } }])); break
      case 'both':
        out.push(...inline(m[1], state, [...marks, { type: 'bold' }, { type: 'italic' }])); break
      case 'bold': case 'italic':
        out.push(...inline(m[1], state, [...marks, { type: kind }])); break
      case 'break': out.push({ type: 'hardBreak' }); break
      case 'math':
        out.push(marks.length ? { type: 'math', attrs: { tex: m[1] }, marks } : { type: 'math', attrs: { tex: m[1] } }); break
      case 'html':
        if (/^<br\s*\/?>$/i.test(m[0])) { out.push({ type: 'hardBreak' }); break }
      // falls through
      default:        // other <tags>, <http://…>, a picture mid-sentence: shown as written
        state.clean = false
        push(m[0])
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return trimBreaks(merge(out))
}

// a break at the end of a paragraph shows nothing, and has nothing to write
function trimBreaks(nodes) {
  while (nodes.length && nodes[nodes.length - 1].type === 'hardBreak') nodes.pop()
  return nodes
}

function merge(nodes) {
  const out = []
  for (const n of nodes) {
    const last = out[out.length - 1]
    if (last && n.type === 'text' && last.type === 'text' && sameMarks(last.marks || [], n.marks || [])) last.text += n.text
    else out.push(n)
  }
  return out
}

// ---------------------------------------------------------------- the blocks written as HTML

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
const unescape = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITY[e.toLowerCase()] ?? all)
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = s => escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;')   // as Python's html.escape

// A caption in HTML: bold, italic, code, links and line breaks; anything
// else is not the editor's to hold.
const TAGS = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', code: 'code', a: 'link' }
function htmlInline(s, state) {
  const out = []
  const marks = []
  const re = /<(\/?)(strong|b|em|i|code|a)\b([^>]*)>|<br\s*\/?>|<[^>]*>|[^<]+/gi
  let m
  while ((m = re.exec(s))) {
    if (m[2]) {
      const type = TAGS[m[2].toLowerCase()]
      if (m[1]) {
        const k = marks.map(x => x.type).lastIndexOf(type)
        if (k >= 0) marks.splice(k, 1)
      } else {
        const h = m[3].match(/href="([^"]*)"/)
        marks.push(type === 'link' ? { type, attrs: { href: unescape(h ? h[1] : '') } } : { type })
      }
    } else if (/^<br/i.test(m[0])) out.push({ type: 'hardBreak' })
    else if (m[0][0] === '<') state.clean = false
    else {
      const t = unescape(m[0]).replace(/\s+/g, ' ')
      if (t) out.push(marks.length ? { type: 'text', text: t, marks: [...marks] } : { type: 'text', text: t })
    }
  }
  // a caption's spaces at either end show nothing
  const nodes = trimBreaks(merge(out))
  const first = nodes[0], last = nodes[nodes.length - 1]
  if (first && first.type === 'text') first.text = first.text.trimStart()
  if (last && last.type === 'text') last.text = last.text.trimEnd()
  return nodes.filter(n => n.type !== 'text' || n.text)
}

const YOUTUBE = /^<figure class="youtube">\n<iframe src="https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]+)(\?[^"]*)?"(?: title="([^"]*)")?[^>]*><\/iframe>(?:\n<figcaption>(.*)<\/figcaption>)?\n<\/figure>$/
const ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'

function youtube(html, state) {
  const m = html.match(YOUTUBE)
  if (!m) return null
  const content = m[4] ? htmlInline(m[4], state) : []
  return { type: 'youtube', attrs: { id: m[1], params: m[2] || '', title: unescape(m[3] || '') }, content }
}

function youtubeHtml(n) {
  const a = n.attrs
  const cap = captionHtml(n)
  return '<figure class="youtube">\n' +
    `<iframe src="https://www.youtube-nocookie.com/embed/${a.id}${a.params || ''}" title="${escapeAttr(a.title || '')}" loading="lazy" allowfullscreen allow="${ALLOW}"></iframe>\n` +
    (cap ? `<figcaption>${cap}</figcaption>\n` : '') + '</figure>'
}

// a picture written as HTML: at part of the column's width, the text
// running round it, or the whole width, as the older posts have them
const FLOAT = /^<figure(?: class="float-(right|left)" style="width:\s*(\d+%)")?>\n<img ([^>]*?)\s*\/?>(?:\n<figcaption>(.*)<\/figcaption>)?\n<\/figure>$/

function floated(html, state) {
  const m = html.match(FLOAT)
  if (!m) return null
  const img = {}
  for (const [, k, v] of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) img[k] = unescape(v)
  if (!img.src || Object.keys(img).some(k => !['src', 'alt', 'width', 'height'].includes(k))) return null
  const size = img.width && img.height ? `${img.width}x${img.height}` : null
  return { type: 'figure', attrs: { src: img.src, alt: img.alt || '', float: m[1] || null, width: m[2] || '50%', size, html: true },
    content: m[4] ? htmlInline(m[4], state) : [] }
}

function floatHtml(n) {
  const a = n.attrs
  const [w, h] = (a.size || '').split('x')
  const cap = captionHtml(n)
  const head = a.float ? `<figure class="float-${a.float}" style="width:${a.width || '50%'}">` : '<figure>'
  return head + '\n' +
    `<img src="${escapeAttr(a.src)}"${w && h ? ` width="${w}" height="${h}"` : ''} alt="${escapeAttr(a.alt || '')}">\n` +
    (cap ? `<figcaption>${cap}</figcaption>\n` : '') + '</figure>'
}

const captionHtml = n => emit(n.content || [], HTML).replace(/\n/g, ' ').trim()

const markKey = m => m.type + (m.type === 'link' ? ' ' + m.attrs.href : '')
const sameMarks = (a, b) => a.length === b.length && a.every(m => b.some(n => markKey(n) === markKey(m)))

// ---------------------------------------------------------------- document → Markdown

export function serialize(doc) {
  return blockList(doc.content || []) + '\n'
}

function blockList(nodes) {
  return nodes.map(block).filter(s => s !== null).join('\n\n')
}

function block(n) {
  const kids = n.content || []
  switch (n.type) {
    case 'paragraph': {
      const s = inlineMd(kids)
      return s.trim() ? s : null
    }
    case 'heading': {
      const s = inlineMd(kids).replace(/\n/g, ' ')
      if (!s.trim() && !n.attrs.hid) return null
      return ['#'.repeat(n.attrs.level), s, n.attrs.hid ? `{#${n.attrs.hid}}` : ''].filter(Boolean).join(' ')
    }
    case 'blockquote':
      return blockList(kids).split('\n').map(l => (l ? '> ' + l : '>')).join('\n')
    case 'bulletList':
    case 'orderedList': {
      const start = n.type === 'orderedList' ? (n.attrs && n.attrs.start) || 1 : 0
      return kids.map((item, k) => {
        const marker = n.type === 'orderedList' ? `${start + k}. ` : '- '
        const pad = ' '.repeat(marker.length)
        const body = blockList(item.content || []) || ''
        return body.split('\n').map((l, x) => (x === 0 ? marker + l : l ? pad + l : '')).join('\n')
      }).join('\n')
    }
    case 'codeBlock':
      return '```' + ((n.attrs && n.attrs.language) || '') + '\n' + kids.map(k => k.text).join('') + '\n```'
    case 'horizontalRule':
      return '---'
    case 'figure':
      // in HTML if it floats, or if it came as HTML (so it goes back as it came)
      return (n.attrs.float || n.attrs.html) && !isVideo(n.attrs.src) ? floatHtml(n) : picture(n)
    case 'youtube':
      return youtubeHtml(n)
    case 'carousel':
      return kids.length ? kids.map(picture).join('\n') : null
    case 'rawHtml':
      return kids.map(k => k.text).join('') || null
    default:
      return inlineMd(kids)
  }
}

function picture(n) {
  const alt = (n.attrs.alt || '').replace(/[\]\n]/g, ' ')
  const kids = (n.content || []).map(k => (k.type === 'hardBreak' ? { type: 'text', text: ' ' } : k))
  const cap = inlineMd(kids).replace(/\n/g, ' ').trim()
    .replace(/"(?=\S)/g, '“').replace(/"/g, '”')
  return `![${alt}](${n.attrs.src}${cap ? ` "${cap}"` : ''})`
}

const ORDER = ['link', 'bold', 'italic', 'code']

function escapeText(s) {
  return s.replace(/\n/g, ' ')
    .replace(/[\\`*_[\]]/g, '\\$&')
    .replace(/<(?=[A-Za-z/!])/g, '\\<')
    .replace(/\$\$/g, '\\$\\$')
}

function codeSpan(s) {
  const runs = s.match(/`+/g) || []
  const fence = '`'.repeat(Math.max(0, ...runs.map(r => r.length)) + 1)
  const pad = /^`|`$/.test(s) ? ' ' : ''
  return fence + pad + s + pad + fence
}

function href(h) {
  return /^(?:[^()\s]|\([^()\s]*\))+$/.test(h) ? h : h.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// Markdown and HTML are written by one walk over the text: they differ only
// in how a mark opens and closes, and in what is escaped.
const MD = {
  open(m, out, open) {
    if (m.type === 'link') return ['[', m]
    if (m.type === 'bold') return ['**', m]
    // inside bold, italic is _x_: build.py reads ***x*** as bold over half of italic
    const delim = open.some(o => o.type === 'bold') && !/[\p{L}\p{N}_]$/u.test(out) ? '_' : '*'
    return [delim, { ...m, delim }]
  },
  close: m => (m.type === 'link' ? `](${href(m.attrs.href)})` : m.type === 'bold' ? '**' : m.delim),
  text: escapeText,
  code: t => codeSpan(t.replace(/\n/g, ' ')),
  math: tex => `$$${tex}$$`,
  brk: '\\\n',
}
const HTML = {
  open: m => [m.type === 'link' ? `<a href="${escapeAttr(m.attrs.href)}">` : m.type === 'bold' ? '<strong>' : '<em>', m],
  close: m => (m.type === 'link' ? '</a>' : m.type === 'bold' ? '</strong>' : '</em>'),
  text: escapeHtml,
  code: t => `<code>${escapeHtml(t)}</code>`,
  math: tex => escapeHtml(`$$${tex}$$`),
  brk: '<br>',
}

function emit(nodes, fmt) {
  nodes = trimBreaks([...nodes])
  // whitespace at the edge of bold or italic is moved out of it (** a** is
  // not bold), out of just the marks that begin or end there
  const sorted = n => (n && (n.type === 'text' || n.type === 'math') ? (n.marks || []) : []).filter(m => ORDER.includes(m.type))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
  const keep = (ms, other) => ms.filter(m => m.type === 'link' || sorted(other).some(o => markKey(o) === markKey(m)))
  const pieces = []
  nodes.forEach((n, x) => {
    if (n.type !== 'text') { pieces.push({ ...n, marks: sorted(n) }); return }
    const marks = sorted(n)
    if (marks.some(m => m.type === 'code')) { pieces.push({ ...n, marks }); return }
    const [, lead, core, trail] = n.text.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (lead) pieces.push({ type: 'text', text: lead, marks: keep(marks, nodes[x - 1]) })
    if (core) pieces.push({ type: 'text', text: core, marks })
    if (trail) pieces.push({ type: 'text', text: trail, marks: keep(marks, nodes[x + 1]) })
  })
  let out = ''
  const open = []
  const close = to => { while (open.length > to) out += fmt.close(open.pop()) }
  for (const p of pieces) {
    if (p.type === 'hardBreak') { out += fmt.brk; continue }
    if (p.type !== 'text' && p.type !== 'math') continue
    const marks = p.marks.filter(m => m.type !== 'code')
    let k = 0
    while (k < open.length && k < marks.length && markKey(open[k]) === markKey(marks[k])) k++
    close(k)
    for (const m of marks.slice(k)) {
      const [s, opened] = fmt.open(m, out, open)
      out += s
      open.push(opened)
    }
    if (p.type === 'math') out += fmt.math(p.attrs.tex)
    else out += p.marks.some(m => m.type === 'code') ? fmt.code(p.text) : fmt.text(p.text)
  }
  close(0)
  return out
}

function inlineMd(nodes) {
  // what would start a block at the start of a line is written as text
  return emit(nodes, MD).split('\n')
    .map(l => l.replace(/^(\s*)(#|>|[-+](?=\s|$))/, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2')).join('\n')
}

// ---------------------------------------------------------------- going round

// Whether the editor can hold all of a post: everything in it is something
// the editor knows, and writing it back and reading that again gives the
// same post. The Markdown may come back spelt differently (*a* for _a_),
// but it says the same thing, and the blog shows it the same.
export function roundTrips(md) {
  const { doc, clean } = parse(md)
  return clean && same(doc, parse(serialize(doc)).doc)
}

function canon(n) {
  const c = { ...n }
  if (c.marks) c.marks = c.marks.map(markKey).sort()
  if (c.content) c.content = c.content.map(canon)
  return c
}

const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
