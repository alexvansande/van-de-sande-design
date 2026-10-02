// The proofreader's underlines. Grammar is asked of the model on this
// machine when the typing pauses; facts are asked of Claude, online, only
// when "Check facts" is pressed. Neither writes in the post: each answers
// with a span quoted from a paragraph, and only a click on "Replace" puts its
// correction there, over exactly those words.
//
// A paragraph is known by a hash of its text, not by where it is: text
// moves while he types, and an issue found in a paragraph is shown only for
// as long as that paragraph reads as it did. Edit it, and the next pause
// looks at it again. The underlines are CSS highlights over the text, so
// the document itself is never touched by them.

const PAUSE = 2000          // ms without typing before the grammar is looked at; Enter does not wait
const AT_ONCE = 1           // paragraphs to a request: one, so nothing waits behind a batch

const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// two 32-bit FNV-1a hashes of the text: a paragraph's name for as long as it reads so
function hash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return 'p' + (a >>> 0).toString(36) + (b >>> 0).toString(36)
}

// what the grammar said about each paragraph, kept between visits so a post
// opened again is not read again: {id: [issues]}
const CACHE = 'review-local-3'   // a new name when the prompt changes, so old readings are not trusted
const remembered = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || {} } catch { return {} } })()
function forget(id) {
  delete remembered[id]
  try { localStorage.setItem(CACHE, JSON.stringify(remembered)) } catch {}
}
function remember(id, issues) {
  remembered[id] = issues
  const ids = Object.keys(remembered)
  for (const old of ids.slice(0, Math.max(0, ids.length - 3000))) delete remembered[old]
  try { localStorage.setItem(CACHE, JSON.stringify(remembered)) } catch {}
}

// the paragraph a node is, as the models read it: its text, its links, and
// where each run of text in it is in the document
const read = new WeakMap()
function paragraph(node) {
  if (read.has(node)) return read.get(node)
  let text = ''
  const runs = [], links = []
  node.forEach((child, offset) => {
    if (child.isText) {
      const link = child.marks.find(m => m.type.name === 'link')
      const last = links[links.length - 1]
      if (link && last && last.href === link.attrs.href && last.end === text.length) {
        last.text += child.text
        last.end += child.text.length
      } else if (link) links.push({ text: child.text, href: link.attrs.href, end: text.length + child.text.length })
      runs.push({ start: text.length, end: text.length + child.text.length, offset })
      text += child.text
    } else if (child.type.name === 'math') text += `$$${child.attrs.tex}$$`
    else if (child.type.name === 'hardBreak') text += '\n'
    else text += '￼'
  })
  const p = { id: hash(text), text, runs, links: links.map(({ text, href }) => ({ text, href })) }
  read.set(node, p)
  return p
}

function paragraphs(doc) {
  const out = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.spec.code) return false        // code and kept HTML are not prose
    const p = paragraph(node)
    if (p.text.trim()) out.push({ ...p, pos })
    return false
  })
  return out
}

// where in the document a quoted span is, if it is all text (not across maths)
function anchor(p, span) {
  for (let i = p.text.indexOf(span); i >= 0; i = p.text.indexOf(span, i + 1)) {
    const j = i + span.length
    let covered = 0, from = null, to = null
    for (const r of p.runs) {
      covered += Math.max(0, Math.min(j, r.end) - Math.max(i, r.start))
      if (from == null && i >= r.start && i < r.end) from = p.pos + 1 + r.offset + (i - r.start)
      if (j > r.start && j <= r.end) to = p.pos + 1 + r.offset + (j - r.start)
    }
    if (covered === span.length && from != null && to != null) return { from, to }
  }
  return null
}

export function reviewer(editor, { slug, call, toast, factState = () => {}, report = () => {} }) {
  const { view } = editor
  // Two reviewers, any kind of suggestion from either: the model here reads
  // each paragraph as it is written; Claude reads the post on Fact check.
  const grammar = new Map()      // paragraph id -> the local model's issues, this visit
  const facts = new Map()        // paragraph id -> Claude's issues, from the last fact check
  let checked = null             // {ids}: the paragraphs the last fact check read
  let dismissed = new Set()
  let shown = []                 // [{issue, from, to, range}] on the page now
  let open = null                // the issue whose box is open
  let dead = false

  call('/api/review?slug=' + encodeURIComponent(slug())).then(r => {
    dismissed = new Set(r.dismissed.map(d => d.key))
    // the last fact check, on whichever paragraphs still read as they did
    if (r.facts && !facts.size) {
      for (const i of r.facts.issues) facts.set(i.block, [...(facts.get(i.block) || []), i])
      checked = { ids: new Set(r.facts.blocks || []) }
    }
    redraw()
  }).catch(() => {})

  // ---------------------------------------------------------- the underlines

  let frame = 0
  function redraw() {
    if (frame || dead) return
    // a timer, not an animation frame: those stop in a tab that is not in front
    frame = setTimeout(() => { frame = 0; if (!dead) draw() })
  }

  function draw() {
    shown = []
    for (const p of paragraphs(editor.state.doc)) {
      const found = [...(grammar.get(p.id) || remembered[p.id] || []), ...(facts.get(p.id) || [])]
      for (const issue of found) {
        if (dismissed.has(issue.key)) continue
        const at = anchor(p, issue.span)
        if (!at) continue
        const range = document.createRange()
        try {
          const a = view.domAtPos(at.from), b = view.domAtPos(at.to)
          range.setStart(a.node, a.offset)
          range.setEnd(b.node, b.offset)
        } catch { continue }
        shown.push({ issue, ...at, range })
      }
    }
    if (open && !shown.some(s => s.issue === open.issue)) closeBox()
    say()
    if (!window.CSS?.highlights) return
    const mark = (name, list) => CSS.highlights.set(name, new Highlight(...list.map(s => s.range)))
    mark('review-grammar', shown.filter(s => s.issue.kind === 'grammar'))
    mark('review-facts', shown.filter(s => s.issue.kind === 'facts'))
    mark('review-links', shown.filter(s => s.issue.kind === 'links'))
    for (const kind of ['grammar', 'facts', 'links']) mark('review-open-' + kind, shown.filter(s => open && s.issue === open.issue && s.issue.kind === kind))
  }

  // ---------------------------------------------------------- grammar, on a pause

  let timer = null, running = false, again = false, typed = 0, failed = null
  let first = null               // a paragraph to read before the rest: one he has just answered about

  // where the proofreading is, for the bar: so he can tell it is working
  function say() {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    const all = paragraphs(editor.state.doc)
    // Fact checked ✔ while every paragraph is one Claude has read, and nothing it raised is left
    if (!checking) factState(checked && all.every(p => checked.ids.has(p.id)) && !shown.some(s => s.issue.by === 'claude')
      ? 'done' : 'idle')
    if (failed) return report('Proofreader off', failed)
    if (running) return report('Proofreading…', 'Being read by the model on this machine')
    const unread = new Set(all.filter(p => !grammar.has(p.id) && !remembered[p.id]).map(p => p.id)).size
    if (unread) return report(`${plural(unread, 'paragraph', 'paragraphs')} to proofread`, 'Read when the typing pauses, or on Enter')
    const n = shown.length
    report(n ? `Proofread · ${plural(n, 'suggestion', 'suggestions')}` : 'Proofread · no suggestions',
      'Read by the model on this machine, and by Claude on Fact check')
  }

  function edited() {
    typed++
    closeBox()
    clearTimeout(timer)
    timer = setTimeout(checkGrammar, PAUSE)
  }

  async function checkGrammar() {
    if (dead) return
    if (running) { again = true; return }
    try {
      for (;;) {
        const now = typed
        // the paragraph being written first, then outwards from it
        const caret = editor.state.selection.from
        const todo = paragraphs(editor.state.doc).filter(p => !grammar.has(p.id) && !remembered[p.id])
          .sort((a, b) => (b.id === first) - (a.id === first) || Math.abs(a.pos - caret) - Math.abs(b.pos - caret))
        const seen = new Set()
        const batch = todo.filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, AT_ONCE)
        if (!batch.length) break
        if (!running) { running = true; say() }
        // with what Claude has flagged in it, so the two do not say the same thing
        const r = await call('/api/review', { slug: slug(), kind: 'local',
          blocks: batch.map(({ id, text, links }) => ({ id, text, links, flagged: flags(facts.get(id)) })) })
        for (const p of batch) {
          const mine = r.issues.filter(i => i.block === p.id)
          grammar.set(p.id, mine)
          remember(p.id, mine)
        }
        failed = null
        redraw()
        if (dead || typed !== now) break        // typing again: the next pause goes on
      }
    } catch (e) {
      if (!failed) toast(e.message, true, 6000)
      failed = e.message
    } finally {
      running = false
      say()
      if (again && !dead) { again = false; clearTimeout(timer); timer = setTimeout(checkGrammar, PAUSE) }
    }
  }

  // ---------------------------------------------------------- facts, on the button

  const flags = list => (list || []).map(({ span, category }) => ({ span, category }))

  let checking = false
  async function checkFacts() {
    if (checking) return
    checking = true
    factState('busy')
    try {
      const all = paragraphs(editor.state.doc)
      // with what the local model has flagged in each, so Claude only adds what it missed
      const blocks = [...new Map(all.map(({ id, text, links }) => [id, { id, text, links,
        flagged: flags(grammar.get(id) || remembered[id]) }])).values()]
      const r = await call('/api/review', { slug: slug(), kind: 'claude', blocks })
      if (dead) return
      facts.clear()
      for (const i of r.issues) facts.set(i.block, [...(facts.get(i.block) || []), i])
      checked = { ids: new Set(blocks.map(b => b.id)) }
      const count = kind => r.issues.filter(i => i.kind === kind).length
      const n = count('facts'), l = count('links'), g = count('grammar')
      const said = [n ? `${n} ${n === 1 ? 'claim' : 'claims'} to look at, in green` : '',
        g ? `${g} more to proofread, in yellow` : '',
        l ? `${l} ${l === 1 ? 'link' : 'links'} to your own pages, in blue` : '']
      toast(said.filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase()) || 'Nothing to flag', false, 6000)
    } catch (e) {
      toast(e.message, true, 10000)
    } finally {
      checking = false
      redraw()                  // and the button says where it is
    }
  }

  // ---------------------------------------------------------- the box on a click

  const box = el('div', 'review-box')
  box.hidden = true
  document.body.append(box)

  function closeBox() {
    if (!open) return
    open = null
    box.hidden = true
    redraw()
  }

  function openBox(s) {
    open = s
    const { issue } = s
    const what = issue.kind === 'links' ? 'A link to your own page' : issue.kind === 'facts' ? `Fact · ${issue.category}`
      : `Proofread · ${issue.category}`
    const head = el('div', 'review-head', `${what} · ${issue.by === 'claude' ? 'Claude' : 'local model'}`)
    head.classList.add(issue.kind)
    const why = el('p', 'review-why', issue.why)
    const row = el('div', 'review-row')
    if (issue.kind === 'links') {
      const b = el('button', 'fix', 'Link it')
      b.type = 'button'
      b.onclick = () => linkIt(issue)
      row.append(b)
    } else if (issue.href) {
      const b = el('button', 'fix')
      b.type = 'button'
      b.title = issue.href
      b.append('Fix the link: ', el('b', '', issue.href.replace(/^mailto:/, '✉ ').replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)))
      b.onclick = () => relink(issue)
      row.append(b)
    }
    if (issue.kind !== 'links' && issue.replacement != null) {
      const b = el('button', 'fix')
      b.type = 'button'
      b.append('Replace with ', el('b', '', issue.replacement))
      b.onclick = () => replace(issue)
      row.append(b)
    }
    const no = el('button', '', 'Ignore')
    no.type = 'button'
    no.title = 'Never raise this again for these words'
    no.onclick = () => ignore(issue)
    row.append(no)
    const parts = [head, why]
    // what he has said before about these words, and a line to say more
    const said = el('div', 'review-thread')
    for (const c of issue.thread || []) said.append(el('p', '', c.comment))
    const reply = el('input', 'review-reply')
    reply.placeholder = 'Reply, so it learns (Enter)'
    reply.spellcheck = true
    reply.onkeydown = e => {
      if (e.key === 'Enter' && reply.value.trim()) { e.preventDefault(); answer(issue, reply.value.trim(), said, reply) }
    }
    if (issue.source) {
      const a = el('a', 'review-source', issue.source.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))
      a.href = issue.source
      a.target = '_blank'
      a.rel = 'noopener'
      parts.push(a)
    }
    box.replaceChildren(...parts, said, reply, row)
    box.hidden = false
    const rects = [...s.range.getClientRects()]
    const r = rects[rects.length - 1] || s.range.getBoundingClientRect()
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + scrollX + 'px'
    box.style.top = r.bottom + 8 + scrollY + 'px'
    redraw()
  }

  // His answer is kept beside the post and read with every paragraph from
  // now on; the paragraph it is about is read again at once, with it.
  async function answer(issue, text, said, input) {
    input.disabled = true
    try {
      const c = await call('/api/review/comment', { slug: slug(), issue, comment: text })
      issue.thread = [...(issue.thread || []), c]
      said.append(el('p', '', text))
      input.value = ''
      // answered: it goes, and the paragraph is read again here with the answer
      // (Claude reads it too, at the next fact check)
      if (facts.has(issue.block)) facts.set(issue.block, facts.get(issue.block).filter(i => i.key !== issue.key))
      grammar.delete(issue.block)
      forget(issue.block)
      first = issue.block
      closeBox()
      clearTimeout(timer)
      checkGrammar()
      toast('Noted. Reading the paragraph again with it…')
    } catch (e) {
      toast('Could not keep that: ' + e.message, true)
    } finally {
      input.disabled = false
    }
  }

  function linkIt(issue) {
    const p = paragraphs(editor.state.doc).find(p => p.id === issue.block)
    const at = p && anchor(p, issue.span)
    closeBox()
    if (!at) return toast('That text has changed since', true)
    const { link } = editor.state.schema.marks
    view.dispatch(editor.state.tr.addMark(at.from, at.to, link.create({ href: issue.source })))
    view.focus()
  }

  // a link pointing at the wrong place: only its address changes, wherever
  // in the span the old one was (or the span is linked, if it had none)
  function relink(issue) {
    const p = paragraphs(editor.state.doc).find(p => p.id === issue.block)
    const at = p && anchor(p, issue.span)
    closeBox()
    if (!at) return toast('That text has changed since', true)
    const { state } = editor
    const { link } = state.schema.marks
    const tr = state.tr
    let found = false
    state.doc.nodeAt(p.pos).forEach((child, offset) => {
      const a = p.pos + 1 + offset, b = a + child.nodeSize
      if (b <= at.from || a >= at.to || !child.marks.some(m => m.type === link)) return
      tr.removeMark(a, b, link).addMark(a, b, link.create({ href: issue.href }))
      found = true
    })
    if (!found) tr.addMark(at.from, at.to, link.create({ href: issue.href }))
    view.dispatch(tr)
    view.focus()
  }

  function replace(issue) {
    // found again now, in case the text moved since the box opened
    const p = paragraphs(editor.state.doc).find(p => p.id === issue.block)
    const at = p && anchor(p, issue.span)
    closeBox()
    if (!at) return toast('That text has changed since', true)
    const tr = editor.state.tr.insertText(issue.replacement, at.from, at.to)
    // the paragraph reads differently now, so it has a new name: the other
    // issues in it go over to that, and it is not read again for a fix it asked for
    const node = tr.doc.nodeAt(tr.mapping.map(p.pos))
    if (node?.isTextblock) {
      const next = paragraph(node)
      const rest = list => (list || []).filter(i => !(i.key === issue.key && i.span === issue.span) && next.text.includes(i.span))
        .map(i => ({ ...i, block: next.id }))
      if (checked?.ids.has(p.id)) checked.ids.add(next.id)    // a fix from the suggestions: still read
      const g = rest(grammar.get(p.id) || remembered[p.id])
      grammar.set(next.id, g)
      remember(next.id, g)
      if (facts.has(p.id)) facts.set(next.id, rest(facts.get(p.id)))
    }
    view.dispatch(tr)
    view.focus()
  }

  async function ignore(issue) {
    dismissed.add(issue.key)
    closeBox()
    try {
      await call('/api/review/dismiss', { slug: slug(), issue })
    } catch (e) {
      dismissed.delete(issue.key)
      redraw()
      toast('Could not keep that: ' + e.message, true)
    }
  }

  const onClick = e => {
    if (!editor.state.selection.empty) return
    const hit = shown.find(s => [...s.range.getClientRects()].some(r =>
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2))
    if (hit) openBox(hit)
    else closeBox()
  }
  const onDown = e => { if (open && !box.contains(e.target) && !view.dom.contains(e.target)) closeBox() }
  const onKey = e => { if (e.key === 'Escape') closeBox() }
  const onEnter = e => {
    if (e.key !== 'Enter' || e.isComposing) return
    clearTimeout(timer)
    setTimeout(checkGrammar)          // after the split, so the finished paragraph is whole
  }
  view.dom.addEventListener('keydown', onEnter)
  view.dom.addEventListener('click', onClick)
  document.addEventListener('mousedown', onDown)
  document.addEventListener('keydown', onKey)
  editor.on('transaction', redraw)

  function destroy() {
    dead = true
    clearTimeout(timer)
    clearTimeout(frame)
    view.dom.removeEventListener('click', onClick)
    view.dom.removeEventListener('keydown', onEnter)
    document.removeEventListener('mousedown', onDown)
    document.removeEventListener('keydown', onKey)
    box.remove()
    for (const name of ['review-grammar', 'review-facts', 'review-links', 'review-open-grammar', 'review-open-facts', 'review-open-links']) window.CSS?.highlights?.delete(name)
  }
  editor.on('destroy', destroy)

  redraw()
  timer = setTimeout(checkGrammar, PAUSE)
  return { edited, checkFacts, destroy }
}
