# Local setup

This procedure reconstructs the tested architecture without bundling credentials, runtime state, or third-party knowledge-base content.

## Tested environment

- n8n 2.26.4
- Docker-hosted n8n
- Google Gemini Chat Model with `models/gemini-3.5-flash`
- Cole Medin knowledge base at commit `eba5e31bc628280c546d4828491051c308d550dc`
- Repository mounted read-only at `/home/node/.n8n-files/Uranus`

n8n node parameters, resource locators, and imports are version-sensitive. A later n8n or provider-model version may require rebinding or reevaluation; do not assume behavioral equivalence solely because the JSON imports.

## 1. Obtain the external KB

From the root of this portfolio repository:

```bash
mkdir -p knowledge
git clone https://github.com/coleam00/cole-medin-knowledge-base.git \
  knowledge/cole-medin-knowledge-base
git -C knowledge/cole-medin-knowledge-base checkout \
  eba5e31bc628280c546d4828491051c308d550dc
```

Review the upstream project and source-material terms before obtaining or using it. The dependency directory is ignored by this repository and must not be committed here.

At the tested revision, the Uranus read allowlist covered 692 Markdown pages. Literal fallback searched 689 pages under `concepts/`, `entities/`, and `sources/`. These numbers are evidence about that snapshot, not a compatibility requirement for future revisions.

## 2. Configure the read-only container mount

Mount the portfolio repository at the exact container path used by the workflow:

```yaml
services:
  n8n:
    volumes:
      - type: bind
        source: /absolute/path/to/uranus-n8n-agent
        target: /home/node/.n8n-files/Uranus
        read_only: true
```

On Windows/Docker Desktop, use an absolute host path shared with Docker. Verify the effective mount with a read-only Docker inspection rather than printing a fully rendered Compose configuration containing environment variables.

The workflow’s fixed root is:

```text
/home/node/.n8n-files/Uranus/knowledge/cole-medin-knowledge-base
```

Do not weaken the mount or change the workflow to provide arbitrary filesystem access. The wider `/workspace/Uranus` mount used during development is not required by these workflow nodes.

## 3. Configure Gemini safely

Create a Google Gemini credential through the n8n Credentials interface. Store the API key only there.

Do not place the key in:

- workflow JSON;
- Code nodes or prompts;
- this repository;
- Compose files committed to source control;
- screenshots.

Preserve n8n’s encryption key and runtime database as secrets. Neither belongs in this portfolio artifact.

## 4. Import and bind the workflows

1. Import [`workflows/kb-navigation.json`](../workflows/kb-navigation.json).
2. Import [`workflows/miranda-chat-gemini.json`](../workflows/miranda-chat-gemini.json).
3. Open `read_kb_page` and select the imported `kb-navigation` workflow.
4. Open `find_kb_pages` and select the same supporting workflow.
5. Confirm the fixed input mappings:
   - `read_kb_page`: `operation = read`, dynamic `page_path`, empty `query`;
   - `find_kb_pages`: `operation = find`, empty `page_path`, dynamic literal `query`.
6. Open `Gemini 3.5 Flash`, select the local Gemini credential, and confirm the exact model identifier `models/gemini-3.5-flash`.
7. Confirm that Gemini is the only language model connected to Miranda.
8. Confirm that imported node names have not acquired suffixes such as `Miranda1` or `read_kb_page1`.
9. Keep both workflows inactive while inspecting them.

The public chat export deliberately contains no instance-specific supporting-workflow ID, credential reference, or webhook ID. Rebinding after import is expected, not a missing repository secret.

## 5. Validate the supporting workflow

Use its isolated manual-test trigger before allowing agent calls. At minimum, exercise:

Valid reads:

- `index.md`
- `concepts/index.md`
- `concepts/chunking.md`
- one linked `sources/*.md` page

Closed controls:

- `../AGENTS.md`
- an absolute path outside the KB
- a non-Markdown path
- a nonexistent allowed Markdown path

Check that successful output includes `status`, `kb_path`, `source_path`, and `content`, while errors contain no unrelated file content. Confirm the Docker mount is still read-only.

## 6. Run Miranda

On n8n 2.26.4, Call n8n Workflow Tool required the supporting workflow to be active. After its containment checks pass:

1. Activate `kb-navigation`.
2. Leave `miranda-chat-gemini` inactive and use Chat Trigger’s manual/test interface.
3. Run the direct, literal-fallback, and unsupported questions in [Evaluation](evaluation.md).
4. Inspect ordered tool calls before judging the final answer.
5. Deactivate `kb-navigation` after testing.

Provider 429 or 503 responses are not retrieval results. Record them separately and avoid silent model, credential, or project rotation.

## 7. Run the isolated one-call pilot

This is a separate measurement and does not replace the accepted workflows.

1. Import
   [`workflows/miranda-one-call-pilot.json`](../workflows/miranda-one-call-pilot.json).
2. Keep the pilot inactive.
3. Open `Gemini 3.5 Flash`, select the same local credential used for the Q4
   control, and confirm `models/gemini-3.5-flash`.
4. Inspect the fixed canonical paths, packet limits, and model connection.
5. Run only its manual trigger. The artifact supplies the exact frozen Q4
   question itself.
6. Confirm the execution reads exactly the two answer-evidence pages, produces
   one approved packet, and contains exactly one Gemini action.
7. Record the final answer, exact Sources list, packet character count, and
   every provider usage field exposed by n8n. Compare them with the control
   record in [Evaluation](evaluation.md).

Do not activate the pilot, add a Chat Trigger, substitute a model, broaden the
question, or treat a smaller token count as success if grounding or provenance
regresses.

## 8. Validate the public artifacts

From the repository root:

```bash
node scripts/validate-workflows.mjs
```

This validates the sanitized files and accepted structure. It does not exercise n8n, call Gemini, or replace the manual execution-trace evaluation.

When the external Cole KB is present, also validate deterministic packet
assembly with its absolute root path:

```bash
node scripts/validate-pilot-packet.mjs /absolute/path/to/knowledge/cole-medin-knowledge-base
```

This reads the two frozen canonical pages locally and verifies the packet's
claim, source evidence, route, and character bounds. It does not call Gemini.
