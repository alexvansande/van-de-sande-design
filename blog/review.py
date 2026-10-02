"""The proofreader behind the editor's highlights. It flags; it never writes.

Two reviewers, one job and one answer:

    local   a model in Ollama on this machine, reading each paragraph as the
            typing pauses (or on Enter); it cannot look anything up
    claude  Claude, online, the whole post when Fact check is pressed; it
            looks things up

Both may raise any of the three kinds of suggestion: proofreading (yellow),
facts (green), and links to his own pages (blue). Each is given, under every
paragraph, what the other has already flagged there, so neither repeats the
other, and both read every answer he has given to either.

They are given paragraphs as {id, text, links, flagged} and answer with
issues, each {block, span, category, why, replacement, source, href,
confidence}: the span is quoted exactly from its paragraph so the editor can
find it again, and nothing else in the answer can touch the text. What comes
back is checked here before the editor sees it: a span that is not in its
paragraph, a "fix" that rewrites more than it flags, a low confidence, a
repeat of the other's flag, or anything he has dismissed is dropped. An
empty list is the usual answer.

What he dismisses, what he answers, and Claude's last reading are kept beside
the post, in index.review.json.
"""
import concurrent.futures, contextlib, difflib, hashlib, json, os, re, shutil, subprocess, sys, tempfile, threading, urllib.request
from datetime import datetime, timezone

OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
LOCAL_MODEL = os.environ.get("REVIEW_MODEL")          # else the first model Ollama has
ONLINE_MODEL = os.environ.get("REVIEW_ONLINE_MODEL", "fable")  # the best the claude CLI has: it follows `claude update`
CLAUDE = shutil.which("claude")
SURE = 0.6                  # below this, an issue is not shown: a wrong underline costs more than a miss
SURE_UNCHECKED = 0.8        # and for a fact from the local model, which cannot look it up
CHUNK = 2500                # characters of the post to one online call: given the whole post, it skims

AGENTS = ("local", "claude")
PROOF = ("agreement", "tense", "typo", "punctuation", "word")
FACTS = ("name", "date", "number", "quote", "attribution", "claim", "link")
CATEGORIES = PROOF + FACTS + ("related",)


def kind_of(category):
    """The highlighter a category is shown in."""
    return "grammar" if category in PROOF else "links" if category == "related" else "facts"


class Unavailable(Exception):
    pass


class Gone(Exception):
    pass


# ---------------------------------------------------------------- what the models are told

CORE = """You are a proofreader for a blog post that is already finished. You flag; you never rewrite. Improving the piece is not your job.

Never comment on tone, voice, style, word choice, tightening, clarity, structure or headings. Do not flag informality, sentence fragments, or the author's punctuation habits (dashes, commas, ellipses, quotation marks, capitalisation for emphasis). Do not engage with opinions. Never output a rewritten sentence or paragraph, and never output the document.

The post is given as paragraphs, each with an id. $$…$$ is maths: leave it alone.

Answer with JSON: {"issues": [...]}, one item per issue:
- "block": the id of the paragraph the issue is in
- "span": the exact words at fault, copied character for character from that paragraph (as short as identifies it, usually one to five words)
- "category": one of %(categories)s
- "why": one sentence
- "replacement": the corrected text for the whole span, word for word except the fix (it replaces the span exactly), or null if it is only a flag
- "source": the URL that shows it, or for "related" the page's URL; otherwise null
- "href": for a "link" issue, the address the link should have, if you know it (the words stay as they are); otherwise null
- "confidence": 0 to 1, how sure you are it is really wrong (when a source shows it is wrong, that is 0.9 or more)

When unsure, leave it out. Precision matters far more than recall: a few wrong flags and the author stops reading all of them. {"issues": []} is a normal, expected answer, and the right one for most paragraphs.

You look for three kinds of thing, and nothing else.

1. Proofreading, by these rules only:
- agreement: subject and verb, pronoun and antecedent
- tense: a verb form that is plainly wrong ("yesterday he go"); choosing the simple past over the present perfect, or the other way round, is the author's choice, never an error
- typo: a misspelt or doubled word
- punctuation: a plain error (a missing full stop between sentences, an apostrophe in a plural such as "contribution's" for "contributions", a missing one such as "Im" or "dont", an unclosed bracket), never a matter of style
- word: a genuine wrong word (its/it's, their/there, then/than, loose/lose)
An informal voice is not an error. Names, foreign words and technical terms are not typos. A replacement is required for proofreading.

2. Facts: checkable claims. Names (spelling, who is who), dates, numbers, quotes, attributions (who said or made what), claims (what something is, does or explains, in science, history or anywhere else), and links that don't say what the text claims they say (each paragraph's links are given with it). Claims about the author's own life, work and opinions are not checkable: leave them alone. But a claim about science, history or how something works is checkable even when it is made in passing, in brackets, or in a casual voice; a confidently wrong one is exactly what to flag. Do not assume a wrong claim is a joke unless the text plainly marks it as one.

3. Links to the author's own pages, which are listed with the post. Where the post plainly mentions the subject of one of them (a project, an earlier post) and those words are not already a link, you may suggest linking them: category "related", the span is the words to link, replacement null, "source" is that page's URL exactly as listed, "why" says what the page is. Only clear matches, never one page twice.

Two reviewers work on this post: a small model on the author's machine, which reads each paragraph as it is written, and Claude, online, which reads the whole post when the author asks. What the other has already flagged is listed under a paragraph as "already flagged": never repeat it, or flag the same words again.

Never raise anything on the dismissed list: the author has already seen it and said no. The author may also have answered earlier suggestions, from either reviewer: follow what he says there over your own judgement, here and in every paragraph."""

LOCAL = """

You are the model on the author's machine. You cannot look anything up, but you know a great deal: a claim that is plainly false by common knowledge (a wrong capital, a famous event in the wrong year or place, a well-known person given someone else's work) is yours to flag, with a correction and a high confidence. Leave obscure or specialised claims to Claude, which can look them up. Never give a link's address you have not been given."""

ONLINE = """

You are Claude, online. You must actually look things up, with web search and fetch, before flagging a fact. Give a replacement only when a source you found states the right value, and put that source's URL in "source". If a claim looks wrong but you cannot verify it either way, you may flag it with replacement null and say in "why" that you could not verify it; never guess a correction."""


def prompt(agent):
    return CORE % {"categories": ", ".join('"%s"' % c for c in CATEGORIES)} + (LOCAL if agent == "local" else ONLINE)


def message(blocks, dismissed, comments=(), pages=()):
    """The paragraphs, what he has said no to in them, and what he has said
    about earlier suggestions, as the user's turn."""
    q = lambda s: json.dumps(s, ensure_ascii=False)
    parts = ["Dismissed (never raise these again):"]
    parts += ["- [%s] %s" % (d.get("category"), q(d.get("span"))) for d in dismissed] or ["(none)"]
    if comments:
        parts.append("\nConversations with the author about earlier suggestions:")
        parts += [line for c in comments for line in said(c)]
    if pages:
        parts.append("\nThe author's own pages (for \"related\" links only):")
        parts += ["- %s <%s>%s" % (p["title"], p["url"], ": " + p["about"] if p.get("about") else "") for p in pages]
    parts.append("\nThe text:")
    for b in blocks:
        parts.append("\n[%s]\n%s" % (b["id"], b["text"]))
        for l in b.get("links") or []:
            parts.append("  link: %s -> %s" % (q(l.get("text")), l.get("href")))
        for f in b.get("flagged") or []:
            parts.append("  already flagged: [%s] %s" % (f.get("category"), q(f.get("span"))))
    return "\n".join(parts)


WHO = {"claude": "Claude", "local": "the local model"}


def said(c):
    """One turn of a conversation about a suggestion, as the models read it."""
    q = lambda s: json.dumps(s, ensure_ascii=False)
    if c.get("from") in WHO:
        return ["  %s replied: %s%s" % (WHO[c["from"]], q(c.get("comment")), " (and withdrew it)" if c.get("withdrew") else "")]
    was = " -> %s" % q(c["replacement"]) if c.get("replacement") else ""
    return ["- %s flagged [%s] %s%s (%s)" % (WHO.get(c.get("by"), "a reviewer"), c.get("category"), q(c.get("span")), was,
                                           c.get("why", "")),
            "  the author: %s" % q(c.get("comment"))]


def schema():
    item = {
        "type": "object",
        "properties": {
            "block": {"type": "string"},
            "span": {"type": "string"},
            "category": {"type": "string", "enum": list(CATEGORIES)},
            "why": {"type": "string"},
            "replacement": {"type": ["string", "null"]},
            "source": {"type": ["string", "null"]},
            "href": {"type": ["string", "null"]},
            "confidence": {"type": "number"},
        },
        "required": ["block", "span", "category", "why", "replacement", "source", "href", "confidence"],
    }
    return {"type": "object", "properties": {"issues": {"type": "array", "items": item}}, "required": ["issues"]}


# ---------------------------------------------------------------- the two models

class Turns:
    """One request at a time on this machine's model, and an answer to him
    goes before the paragraphs waiting to be read: he is waiting for it."""

    def __init__(self):
        self.c = threading.Condition()
        self.busy = False
        self.urgent = 0

    @contextlib.contextmanager
    def take(self, urgent=False):
        with self.c:
            self.urgent += urgent
            while self.busy or (self.urgent and not urgent):
                self.c.wait()
            self.urgent -= urgent
            self.busy = True
        try:
            yield
        finally:
            with self.c:
                self.busy = False
                self.c.notify_all()


turns = Turns()


def local_model():
    if LOCAL_MODEL:
        return LOCAL_MODEL
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=3) as r:
            models = [m["name"] for m in json.load(r).get("models", [])]
    except (OSError, ValueError):
        raise Unavailable("Ollama is not running, so nothing is read as you write (ollama serve).")
    if not models:
        raise Unavailable("Ollama has no model to read with (ollama pull …, or set REVIEW_MODEL).")
    return models[0]


def context(model):
    """The context the model is loaded with now, if it is: asking for another
    size makes Ollama load all of it again, and so would whatever else uses it
    (OpenClaw) on its next turn."""
    try:
        with urllib.request.urlopen(OLLAMA + "/api/ps", timeout=3) as r:
            for m in json.load(r).get("models", []):
                if m.get("name") == model and m.get("context_length"):
                    return m["context_length"]
    except (OSError, ValueError):
        pass
    return 8192


def ask_local(blocks, dismissed, comments=(), gone=lambda: False, pages=()):
    return loads(local_chat(prompt("local"), message(blocks, dismissed, comments, pages), schema(), gone))


def local_chat(system, user, shape, gone=lambda: False, urgent=False):
    model = local_model()
    body = json.dumps({
        "model": model,
        "stream": False,
        "think": True,              # slower (half a minute on a long paragraph), but without it it misses most errors
        "format": shape,
        "options": {"temperature": 0, "num_ctx": context(model)},
        "keep_alive": "30m",        # loaded while he writes: loading it takes a minute
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(OLLAMA + "/api/chat", data=body, headers={"Content-Type": "application/json"})
    with turns.take(urgent):
        if gone():
            raise Gone()            # the page that asked was closed or reloaded while it waited
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                reply = json.load(r)
        except OSError as e:
            raise Unavailable("The local model did not answer: %s" % e)
    return reply.get("message", {}).get("content", "")


def ask_online(blocks, dismissed, comments=(), gone=lambda: False, pages=()):
    out = online_chat(prompt("claude"), message(blocks, dismissed, comments, pages), schema())
    return out.get("issues") if isinstance(out, dict) else out


def online_chat(system, user, shape):
    """Claude's structured answer, as a dict (or what could be read of it)."""
    if not CLAUDE:
        raise Unavailable("The claude command is not installed, so there is no fact check.")
    args = [CLAUDE, "-p", user, "--output-format", "json",
            "--system-prompt", system, "--json-schema", json.dumps(shape),
            # it may look things up, and nothing else: no files, no shell
            "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch",
            "--setting-sources", "", "--no-session-persistence"]
    if ONLINE_MODEL:
        args += ["--model", ONLINE_MODEL]
    # somewhere empty, so it reads nothing of the site
    with tempfile.TemporaryDirectory() as cwd:
        try:
            r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            raise Unavailable("The fact check took more than 15 minutes and was stopped.")
    try:
        out = json.loads(r.stdout)
    except ValueError:
        raise Unavailable("The fact check failed: " + (r.stderr or r.stdout)[-400:].strip())
    if out.get("is_error"):
        msg = str(out.get("result") or "unknown error")
        if "authenticate" in msg.lower() or "login" in msg.lower():
            msg += ". Run claude auth login in a terminal, then try again."
        raise Unavailable("The fact check failed: " + msg)
    if isinstance(out.get("structured_output"), dict):
        return out["structured_output"]
    m = re.search(r"\{.*\}", out.get("result", "") or "", re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}


def loads(text):
    """The issues in a model's answer, even with a little prose round it."""
    m = re.search(r"\{.*\}|\[.*\]", text or "", re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except ValueError:
        return []
    return data.get("issues", []) if isinstance(data, dict) else data


# ---------------------------------------------------------------- what is let through

def key(category, span):
    return hashlib.sha1(("%s\0%s" % (category, span)).encode()).hexdigest()[:16]


QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..."})


def only_style(a, b):
    """Two spellings of the same thing: his dashes and quotes, his spacing."""
    norm = lambda s: re.sub(r"\s+", " ", s.translate(QUOTES)).strip()
    return norm(a) == norm(b)


def keep(agent, issues, blocks, dismissed, pages=()):
    texts = {b["id"]: b["text"] for b in blocks}
    linked = {b["id"]: [l.get("text") or "" for l in b.get("links") or []] for b in blocks}
    flagged = {b["id"]: b.get("flagged") or [] for b in blocks}
    ours = {p["url"] for p in pages}
    no = {d.get("key") for d in dismissed}
    out, seen = [], set()
    for i in issues if isinstance(issues, list) else []:
        if not isinstance(i, dict):
            continue
        block, span, cat = i.get("block"), i.get("span"), i.get("category")
        rep = i.get("replacement")
        try:
            sure = float(i.get("confidence", 0))
        except (TypeError, ValueError):
            sure = 0
        if not (isinstance(span, str) and span.strip() and block in texts and span in texts[block]):
            continue                    # not quoted from its paragraph: it cannot be anchored
        kind = kind_of(cat)
        floor = SURE_UNCHECKED if agent == "local" and kind == "facts" else SURE
        if cat not in CATEGORIES or sure < floor:
            print("  review (%s): dropped [%s] %r at %.2f" % (agent, cat, span, sure), file=sys.stderr)
            continue
        if not isinstance(rep, str) or not rep.strip():
            rep = None
        if rep is not None and (rep == span or only_style(span, rep)):
            continue
        # what the other reviewer already flagged in these words is its, not this one's to repeat
        if any(f.get("span") and (f["span"] in span or span in f["span"]) for f in flagged.get(block, [])):
            continue
        if kind == "grammar":
            # a flag on a few words, never a rewrite
            # and the fix looks like what it fixes: "Its remarkable" -> "It's" would lose a word
            if (rep is None or len(span) > 80 or len(rep.split()) > len(span.split()) + 3
                    or difflib.SequenceMatcher(None, span, rep).ratio() < 0.5):
                continue
        elif len(span) > 240:
            continue
        if cat == "related":
            # a link to one of his pages, offered: never on words already linked, never to anywhere else
            if i.get("source") not in ours or any(span in t or t in span for t in linked[block] if t):
                continue
            if i["source"] in seen:
                continue
            seen.add(i["source"])
            rep = None
        k = key(cat, span)
        if k in no or (block, span) in seen:
            continue
        seen.add((block, span))
        src = i.get("source") if isinstance(i.get("source"), str) else None
        href = i.get("href") if cat == "link" and isinstance(i.get("href"), str) else None
        if href and not re.match(r"(https?://|mailto:)\S+$", href.strip()):
            href = None
        out.append({"kind": kind, "by": agent, "key": k, "block": block, "span": span, "category": cat,
                    "why": str(i.get("why") or "").strip(), "replacement": rep,
                    "source": src if src and re.match(r"https?://", src) else None,
                    "href": href.strip() if href else None, "confidence": round(sure, 2)})
    return out


def review(folder, agent, blocks, gone=lambda: False, pages=()):
    if agent not in AGENTS:
        raise ValueError("no such reviewer: %r" % agent)
    blocks = [{"id": str(b["id"]), "text": str(b["text"]), "links": b.get("links") or [],
               "flagged": [f for f in b.get("flagged") or [] if isinstance(f, dict)]}
              for b in blocks if str(b.get("text") or "").strip()]
    if not blocks:
        return {"issues": []}
    data = sidecar(folder)
    # only what bears on these paragraphs: the model reads the paragraph, not the post
    dismissed = [d for d in data["dismissed"] if any(d.get("span", "\0") in b["text"] for b in blocks)]
    comments = data["comments"][-60:]       # his answers to either, read by both
    if agent == "local":
        found = ask_local(blocks, dismissed, comments, gone, pages)
    else:
        # a few paragraphs to each call, all at once: each is read closely, and it takes no longer
        chunks, size = [[]], 0
        for b in blocks:
            if chunks[-1] and size + len(b["text"]) > CHUNK:
                chunks.append([])
                size = 0
            chunks[-1].append(b)
            size += len(b["text"])
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            parts = list(pool.map(lambda c: ask_online(c, dismissed, comments, gone, pages) or [], chunks))
        found = [i for part in parts for i in part]
    issues = keep(agent, found, blocks, data["dismissed"], pages)
    for i in issues:
        i["thread"] = [c for c in data["comments"] if c.get("key") == i["key"]]
    if agent == "claude":
        # kept, so a reload or another day shows them again on the paragraphs that still read so,
        # and the button knows which paragraphs it has read
        data = sidecar(folder)
        data["facts"] = {"at": stamp(), "issues": issues, "blocks": [b["id"] for b in blocks]}
        write(folder, data)
    return {"issues": issues}


# ---------------------------------------------------------------- index.review.json

def sidecar(folder):
    try:
        with open(os.path.join(folder, "index.review.json"), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    data.setdefault("dismissed", [])
    data.setdefault("comments", [])
    return data


def write(folder, data):
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.review.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


REPLY = """You are one of two reviewers of a blog post (a small model on the author's machine, and Claude, online). You made a suggestion on the post, and the author has answered it. Answer him.

Reply in one or two plain sentences, as a colleague would: no flattery, no apology. If he is right, or you are no longer sure, say so and withdraw the suggestion. If he says the words are meant as they are (a joke, a parody, a quotation, his own way of putting it), that is his call: withdraw it. If you still think the text is wrong, say why, briefly, with what you know; you may revise your correction, which replaces exactly the quoted words. You flag; you never rewrite more than those words, and you never comment on style, tone or opinions.

Answer with JSON: {"reply": "...", "withdraw": true or false, "replacement": the corrected text for the quoted words, or null to keep your correction as it was}."""

REPLY_LOCAL = " You cannot look anything up: answer from what you know."
REPLY_ONLINE = " Look things up if it helps you answer."


def reply_shape():
    return {"type": "object", "properties": {"reply": {"type": "string"}, "withdraw": {"type": "boolean"},
                                             "replacement": {"type": ["string", "null"]}},
            "required": ["reply", "withdraw", "replacement"]}


def comment(folder, issue, text, paragraph=""):
    """His answer to a suggestion, and the answer of the reviewer that made it.
    Both are kept, and read by both reviewers from then on. Withdrawn, the
    suggestion goes and is not raised again; otherwise it stays, its
    correction perhaps revised."""
    text = (text or "").strip()
    if not text:
        raise ValueError("an empty comment")
    k = key(issue["category"], issue["span"])
    data = sidecar(folder)
    c = {"key": k, "kind": issue.get("kind"), "by": issue.get("by"), "category": issue["category"],
         "span": issue["span"], "why": issue.get("why", ""), "replacement": issue.get("replacement"),
         "comment": text[:1000], "at": stamp()}
    data["comments"].append(c)
    write(folder, data)

    agent = issue.get("by") if issue.get("by") in AGENTS else "local"
    thread = [t for t in data["comments"] if t.get("key") == k]
    ask = "\n".join(["The paragraph:", paragraph or "(not given)", "",
                     "Your suggestion: [%s] %s -> %s" % (issue["category"], json.dumps(issue["span"], ensure_ascii=False),
                                                        json.dumps(issue.get("replacement"), ensure_ascii=False)),
                     "Why you said so: " + issue.get("why", ""), "", "The conversation so far:"]
                    + [line for t in thread for line in said(t)])
    for _ in range(2):              # an empty answer is asked for again, once
        if agent == "local":
            out = loads_obj(local_chat(REPLY + REPLY_LOCAL, ask, reply_shape(), urgent=True))
        else:
            out = online_chat(REPLY + REPLY_ONLINE, ask, reply_shape())
        if str(out.get("reply") or "").strip():
            break
    answer = str(out.get("reply") or "").strip() or "(it did not answer)"
    withdrew = bool(out.get("withdraw"))
    rep = out.get("replacement")
    if isinstance(rep, str) and rep.strip() and rep != issue["span"] and not withdrew:
        issue = {**issue, "replacement": rep.strip()}
    r = {"key": k, "from": agent, "comment": answer[:1000], "withdrew": withdrew, "at": stamp()}

    data = sidecar(folder)
    data["comments"].append(r)
    if withdrew and not any(d.get("key") == k for d in data["dismissed"]):
        data["dismissed"].append({"key": k, "kind": issue.get("kind"), "category": issue["category"], "span": issue["span"],
                                  "why": "withdrawn after the author answered", "at": stamp()})
    if data.get("facts"):
        kept = []
        for i in data["facts"]["issues"]:
            if i.get("key") == k and i.get("block") == issue.get("block"):
                if withdrew:
                    continue
                i = {**i, "replacement": issue.get("replacement")}
            kept.append(i)
        data["facts"]["issues"] = kept
    write(folder, data)
    issue = {**issue, "thread": [t for t in data["comments"] if t.get("key") == k]}
    return {"withdrew": withdrew, "issue": issue}


def loads_obj(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}


def dismiss(folder, issue):
    data = sidecar(folder)
    k = key(issue["category"], issue["span"])
    if not any(d.get("key") == k for d in data["dismissed"]):
        data["dismissed"].append({"key": k, "kind": issue.get("kind"), "category": issue["category"],
                                  "span": issue["span"], "why": issue.get("why", ""),
                                  "at": stamp()})
        write(folder, data)
    return {"key": k}
