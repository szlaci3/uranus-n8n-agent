# Real n8n capture guide

The final portfolio images must be assembled from actual n8n 2.26.4 canvases and execution evidence. Do not synthesize, redraw, or use the current private Qwen-connected canvas.

## Required raw captures

Capture at least four high-resolution source images. Store unredacted originals privately under `assets/raw/`; that directory is intentionally ignored.

### A. Accepted Miranda/Gemini canvas

Use a temporary n8n copy imported from the accepted Gemini workflow.

Visible nodes:

- `When chat message received`
- `Miranda`
- `Gemini 3.5 Flash`, visibly connected to Miranda
- `read_kb_page`
- `find_kb_pages`

Requirements:

- no Qwen/Ollama node;
- node names and connections fully visible;
- canvas fitted with comfortable whitespace rather than maximum zoom-out;
- no node configuration sidebar exposing a credential;
- no unrelated workflows or browser chrome if it can be cropped cleanly.

### B. KB-navigation canvas

Capture the complete supporting workflow with both branches readable:

- exact-page validation/read/decode/result branch;
- scoped literal-search/candidate branch;
- isolated manual-test trigger at the edge.

Fit the workflow horizontally. If one full-canvas capture makes node names unreadable, take two overlapping branch captures in addition to the full overview; use the full overview in the composite and retain the detailed captures for GitHub review.

### C. “Dumb zone” execution trace

Run the exact question:

> What does Cole mean when he says an LLM gets into “the dumb zone”?

Capture the n8n execution/log view showing this ordered route:

1. `read_kb_page("index.md")`
2. `find_kb_pages("dumb zone")`
3. `read_kb_page("concepts/context-rot.md")`
4. `read_kb_page("sources/are-agent-harnesses-bringing-back-vibe-coding.md")`

The trace must show that the keyword candidate was followed by a full page read. Do not substitute a manually typed route for missing execution evidence.

### D. Final answer and Sources

Capture the corresponding final chat answer with its Sources section. The important visible paths are:

```text
concepts/context-rot.md
sources/are-agent-harnesses-bringing-back-vibe-coding.md
```

The complete KB page body does not need to be visible. If the execution trace and Sources fit legibly in one n8n view, captures C and D may be a single raw image.

## Required redaction

Crop or obscure:

- browser address, hostname, and local ports;
- n8n username, avatar, project, and unrelated workflow names;
- workflow, webhook, execution, credential, and instance IDs;
- credential selectors and provider account names;
- API keys, quota dashboards, or environment values;
- full upstream KB pages and transcripts.

Keep visible:

- n8n node names and connections;
- `Gemini 3.5 Flash` model name;
- tool-call order and literal query;
- candidate and canonical page paths;
- exact final Sources paths;
- ordinary n8n canvas styling so the artifact remains recognizably genuine.

## `workflow-composite.png`

Recommended canvas: 1920×1200, landscape.

Layout:

- **Top 58%, full width:** accepted Miranda/Gemini canvas. This is the visual focus.
- **Bottom-left 70% of the remaining area:** KB-navigation canvas.
- **Bottom-right 30% of the remaining area:** compact real “dumb zone” execution trace plus final substantive Sources.

Use only three small annotations:

1. Main canvas:

   > Accepted Gemini 3.5 Flash baseline<br>
   > Two bounded tools • eight agent iterations • citations from successfully read pages

2. Exact-read branch:

   > Exact read: allowlist → file read → size/UTF-8 checks → structured result

3. Fallback branch:

   > Literal fallback: scoped Markdown → max 5 candidates / terminal no_match

Do not add résumé claims, requirement keywords, decorative AI art, or a recreated architecture diagram to the composite.

## `dumb-zone-execution.png`

Publish a separate, larger redacted crop combining captures C and D. It should allow a technical reader to verify:

- index-first behavior;
- one literal fallback call;
- candidate-versus-evidence separation;
- direct linked-source retrieval;
- exact final citations.

Before committing either PNG, inspect the exported pixels at full resolution—not only the editing canvas—for small IDs or credential/account text.
