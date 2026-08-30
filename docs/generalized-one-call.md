# Generalized one-call evidence packets

**Status:** Prepared artifact. Static topology checks and local five-case
retrieval/packet validation pass. One of five live n8n cases has passed; four
remain for the next session.

## Decision

Generalize the passed Q4 evidence-packet method into a separate inactive n8n
workflow. Preserve all three existing artifacts unchanged:

- `miranda-chat-gemini.json` remains the accepted agentic control;
- `kb-navigation.json` remains the accepted read and literal-fallback boundary;
- `miranda-one-call-pilot.json` remains the frozen, passed Q4 measurement.

The generalized workflow performs local deterministic retrieval before one
Gemini answer call. It does not add a generated lexical index, database,
embeddings, vectors, query expansion, synonyms, reranking model, or retrieval
LLM. It reads the KB's existing section indexes, scores their canonical
Markdown links by literal question-term overlap, follows selected pages to
linked source records, and uses a scoped literal scan only when the indexes
produce no plausible candidate.

This is an experimental architecture revision justified by the Q4 result. It
does not replace the accepted baseline until broader live evaluation passes.

## Retrieval contract

```text
question
  -> validate and tokenize locally
  -> read fixed canonical section indexes
  -> deterministic title/slug/description scoring
     -> plausible indexed match: read at most two canonical pages
     -> no indexed match: one scoped case-insensitive literal scan
  -> select at most one linked source per canonical page
  -> reload and validate every selected page
  -> assemble one bounded provenance packet
  -> one Gemini 3.5 Flash answer call
```

The fixed section indexes are:

- `concepts/index.md`
- `entities/tools/index.md`
- `entities/people/index.md`
- `entities/organizations/index.md`
- `sources/index.md`

Index text is locator input and is never answer evidence. Every positive claim
must come from a canonical page reloaded after selection. A fallback snippet
is also only a locator; its page must be reloaded before packet assembly.

## Deterministic selection

Question and index text are normalized to lowercase Unicode words. A small
fixed stop-word list removes grammatical noise, and a conservative plural
normalizer maps forms such as `bases` to `base`. Scoring is fixed:

- exact normalized title phrase in the question: 30 points;
- exact one-token slug in the question: 30 points;
- each overlapping title token: 12 points;
- each overlapping slug token: 8 points;
- each overlapping description token: 2 points.

A candidate requires at least one title or slug token overlap and at least 12
points. Results are ordered by score, title-token hits, slug-token hits, then
canonical path. At most two canonical pages are selected.

When a question contains a quoted phrase and that phrase is absent from every
indexed title and description, broad matches on surrounding words do not count
as a plausible indexed route. The exact quoted phrase goes directly to the
literal fallback. This prevents `LLM` from diverting the “dumb zone” question
to unrelated broad pages.

This is intentionally lexical and transparent. It may miss paraphrases. It
must return insufficient evidence rather than silently widen the query or use
model knowledge.

## Literal fallback

Fallback runs only when index scoring returns no candidate. Its one query is
derived deterministically:

1. Use the first quoted phrase, stripping a leading `the`, when present.
2. Otherwise remove a fixed leading question frame such as
   `What does Cole recommend for` and use the remaining literal text.

The scan remains case-insensitive and limited to Markdown below `concepts/`,
`entities/`, and `sources/`. It excludes raw transcripts and maintenance
material. It returns at most two canonical locators. Zero matches are terminal
and produce a deterministic insufficient-evidence response with no Gemini
call.

## Evidence and provenance

For each selected non-source page, take its synthesized opening section and
select at most one line from its `## Sources` section. Source-line choice uses
the same question-term overlap with canonical file order as the final
tie-break. The linked `sources/*.md` page is then reloaded; a copied Markdown
link alone is not evidence.

For a selected source page, its own synthesized opening section is sufficient
provenance. Duplicate paths are collapsed without losing their first route
position.

The generalized packet uses schema `uranus-evidence-packet-2` and these hard
bounds:

- at most two selected canonical pages;
- at most one linked source per selected non-source page;
- at most four total evidence pages;
- at most 5,000 characters per excerpt;
- at most 20,000 serialized packet characters;
- at most one Gemini action on a supported execution; and
- zero Gemini actions on terminal `no_match`.

An overflow, missing page, invalid UTF-8 sequence, duplicate/mismatched route,
missing linked source, or unresolved provenance stops before Gemini. Content
is never silently truncated.

## Initial generalized gate

Run the existing accepted questions without changing their text:

| Case | Expected deterministic selection |
|---|---|
| Direct chunking | `concepts/chunking.md`, optionally `concepts/rag.md`, plus linked source evidence |
| Chunking + knowledge bases | `concepts/chunking.md` and `concepts/knowledge-bases.md`, plus one linked source each |
| RAG + chunking boundary | `concepts/rag.md` and `concepts/chunking.md`, plus one linked source each |
| “Dumb zone” | No index match → literal `dumb zone` → `concepts/context-rot.md` plus linked source |
| Kubernetes autoscaling | No index match → literal `Kubernetes cluster autoscaling` → terminal `no_match`, no model call |

For each supported case, record selected paths, packet size, answer, Sources,
Gemini action count, total tokens, duration, grounding, completeness, and
provenance. The generalized method passes only if all four supported cases
pass and the unsupported control remains terminal without a Gemini call.

One passed Q4 pilot is evidence for this experiment, not evidence that these
new routes work. Static tests and local packet construction must pass before
the first live Gemini run; live results remain the acceptance authority.

## Prepared artifact and local evidence

The inactive artifact is
`workflows/miranda-one-call-generalized.json`. It uses only n8n 2.26.4 nodes,
contains no credential reference or instance binding, and keeps the accepted
workflows and frozen Q4 pilot unchanged.

Two independent local checks pass against the authoritative Uranus KB. The
reference selector and the actual embedded n8n Code-node logic produced the
same results:

| Case | Method | Packet characters | Evidence route |
|---|---|---:|---|
| Direct chunking | `deterministic_index_score` | 7,896 | `concepts/chunking.md` → `concepts/rag.md` → two linked source pages |
| Chunking + knowledge bases | `deterministic_index_score` | 7,817 | `concepts/chunking.md` → `concepts/knowledge-bases.md` → two linked source pages |
| RAG + chunking | `deterministic_index_score` | 7,916 | `concepts/chunking.md` → `concepts/rag.md` → two linked source pages |
| “Dumb zone” | `keyword_literal` | 6,094 | `concepts/context-rot.md` → `sources/are-agent-harnesses-bringing-back-vibe-coding.md` |
| Kubernetes autoscaling | terminal `no_match` | — | No evidence; zero model actions |

These are deterministic local retrieval results, not live n8n executions or
Gemini answer results. Import, credential selection, execution traces, answer
quality, token usage, and duration remain manual gates.

## Live gate progress

### Case 1 — direct chunking: pass

The user ran `Why does chunking matter in RAG?` through the generalized
workflow on 2026-08-30.

- Method: `deterministic_index_score`
- Packet: 7,896 characters
- Evidence route:
  `concepts/chunking.md` → `concepts/rag.md` →
  `sources/every-rag-strategy-explained-in-13-minutes-no-fluff.md` →
  `sources/why-the-best-ai-coding-tools-abandoned-rag-and-what-they-use-instead.md`
- Provider usage: 2,586 total tokens
- Duration: 4.906 seconds
- Answer quality: pass
- Completeness: pass
- Grounding: pass; every material claim is present in packet evidence
- Provenance: pass; the Sources list exactly matches the four packet paths

The extra `concepts/rag.md` page is relevant and was allowed by the expected
route, so it is an efficiency observation rather than a failure. The user's
message did not separately state “one Gemini action, no retry”; confirm that
trace detail before final closure even though the artifact contains only one
model path.

Cases 2–5 remain pending.
