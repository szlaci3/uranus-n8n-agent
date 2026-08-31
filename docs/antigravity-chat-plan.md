# Antigravity one-call chat plan

**Status:** Proposed. No workflow implementation has been made from this plan.

## Objective

Add n8n's chat interface to
`workflows/miranda-one-call-antigravity.json` while preserving the generalized
one-call architecture:

- deterministic, model-free retrieval for every user message;
- one Antigravity interaction for a supported answer;
- zero Antigravity interactions for terminal `no_match` and pre-model errors;
- evidence-only generation with exact `kb_path` provenance; and
- the existing Antigravity HTTP request, token budget, tool restriction, and
  response validation.

`workflows/miranda-one-call-gemini.json` remains unchanged during this first
implementation. Once the Antigravity chat path passes, the transport and
response-shaping changes can be applied separately to the Gemini copy.

## First-version decision: chat UI, stateless turns

The first version will support sending questions through n8n's Chat Trigger,
but each message will remain an independent retrieval-and-answer execution.
It will not add an n8n memory node, persist conversation history, or send
`previous_interaction_id` to Antigravity.

This preserves the current grounding boundary. Carrying prior conversation or
an Antigravity environment into a later turn could allow old evidence or model
context to affect a new answer without being present in that turn's validated
packet. A user must therefore phrase each message as a complete question in
the first version.

## Planned topology

```text
When chat message received
  -> Normalize chat question
  -> existing deterministic index and fallback retrieval
  -> existing evidence-packet assembly and final bounds
     -> supported: Run Antigravity answer
                   -> Validate Antigravity answer
                   -> Return chat answer
     -> no match:   Return chat no_match
     -> error:      Return chat error
```

The retrieval, packet, and Antigravity nodes remain on their current branches.
Only the entry adapter, terminal response shapes, workflow identity, and
chat-specific checks change.

## Node changes

### 1. Replace the manual entry path

Remove:

- `When clicking ‘Execute workflow’`;
- the hard-coded behavior in `Manual test — set question`.

Add one Chat Trigger node using the same type and version already exercised by
the project:

- type: `@n8n/n8n-nodes-langchain.chatTrigger`;
- type version: `1.4`;
- name: `When chat message received`;
- response mode: `When Last Node Finishes`.

Streaming response will not be enabled. The deterministic file-processing and
HTTP Request path is not a streaming chain, so every terminal branch will
return one completed chat response.

Do not publish a `webhookId` in the repository export. n8n can create the
instance-specific binding after import.

### 2. Normalize the Chat Trigger payload

Rename the existing manual-input Code node to `Normalize chat question` and
replace its hard-coded question with a mapping from `chatInput` to `question`.
The adapter will:

- require `chatInput` to be a string;
- trim it into `question`;
- retain `sessionId` as diagnostic metadata;
- emit exactly one item; and
- leave the existing 300-character and control-character checks to
  `Validate question and emit fixed indexes`.

The rest of the retrieval path continues to consume `question`; it does not
need to know that the execution originated in chat.

### 3. Shape every terminal branch for Chat Trigger

n8n's last-node chat response expects a text field named `output` or `text`.
All terminal branches must therefore expose `output` while retaining their
current structured fields for execution inspection.

Supported answer:

```json
{
  "status": "success",
  "output": "<grounded answer>",
  "answer": "<grounded answer>",
  "model": "antigravity-preview-05-2026",
  "interaction_id": "<provider interaction id>",
  "usage": {}
}
```

Terminal no-match:

```json
{
  "status": "no_match",
  "terminal": true,
  "output": "The Cole knowledge base does not provide enough evidence to answer this question.",
  "answer": "The Cole knowledge base does not provide enough evidence to answer this question.",
  "model_called": false,
  "expected_model_actions": 0
}
```

Pre-model or provider error:

```json
{
  "status": "error",
  "output": "I could not complete that request because the grounded-answer workflow stopped safely.",
  "error_code": "<stable code>",
  "message": "<diagnostic message>",
  "model_called": false
}
```

For a provider error after the HTTP Request begins, `model_called` will remain
`true`. The user-facing `output` stays short, while the execution retains the
diagnostic fields.

### 4. Preserve the Antigravity boundary

Do not change the request contract:

- endpoint: `POST /v1beta/interactions`;
- agent: `antigravity-preview-05-2026`;
- input: the validated `model_prompt`;
- `tools: []`;
- `max_total_tokens: 20000`;
- synchronous timeout: 300 seconds; and
- extract only text parts from `model_output` steps.

Do not send `sessionId`, chat history, earlier packets, earlier answers,
`environment_id`, or `previous_interaction_id` to Antigravity in this phase.

### 5. Give the copied workflow an unambiguous identity

Change the workflow's internal `name` from the copied
`miranda-one-call-generalized` value to `miranda-one-call-antigravity` before
import testing. Keep the filename unchanged.

Keep the workflow inactive and unpinned in the repository. Credentials remain
an instance-local setup concern.

## Validation plan

### Static checks

Verify that:

- the export parses as JSON;
- every connection source and target exists;
- every Code node parses as JavaScript;
- exactly one Chat Trigger exists;
- no Manual Trigger or hard-coded test question remains;
- no memory node or Antigravity continuation field is present;
- the supported path contains exactly one Antigravity HTTP Request;
- `tools: []` and the 20,000-token cap remain in the request;
- all three terminal branches expose a string `output`; and
- the export remains inactive and contains no published webhook ID or secret.

The existing Gemini-specific project validator and documentation are outside
this first implementation and remain unchanged.

### Live chat checks

Run these exact questions from the n8n chat panel:

1. `Why does chunking matter in RAG?`
   - Chat displays the grounded answer.
   - One Antigravity interaction occurs.
   - Citations remain a subset of exact packet `kb_path` values.

2. `What does Cole mean when he says an LLM gets into “the dumb zone”?`
   - Literal fallback is `dumb zone`.
   - The expected concept and linked source are loaded.
   - Chat displays the answer with both exact source paths.
   - One Antigravity interaction occurs.

3. `What does Cole recommend for Kubernetes cluster autoscaling?`
   - Literal fallback returns zero candidates.
   - Chat displays the deterministic insufficient-evidence answer.
   - `Run Antigravity answer` is not executed.
   - Provider token usage is zero.

Also test an empty message, a question over 300 characters, a forbidden control
character, and a simulated provider failure. Each must produce a readable chat
response without bypassing its existing structured error contract.

### Stateless behavior check

After a successful question, send `What about the other one?`. Record that
the first version does not resolve implicit conversational references. This is
an intentional limitation, not a retrieval failure. Genuine multi-turn
continuity requires a separate design and evaluation before it can be enabled.

## Acceptance criteria

The Antigravity chat conversion passes when:

- all three recorded knowledge cases preserve their existing retrieval and
  provider-call behavior;
- the n8n chat panel renders the final answer or refusal as text;
- every supported message uses at most one Antigravity interaction;
- terminal `no_match` uses no Antigravity interaction;
- prior chat turns cannot influence the current evidence boundary; and
- the original non-chat copy can be recovered from version control or the
  separately retained Gemini/Antigravity exports.

## Deferred work

The following are deliberately excluded from the first version:

- conversational memory;
- Antigravity `previous_interaction_id` continuation;
- reuse of `environment_id`;
- pronoun or follow-up-question rewriting;
- response streaming;
- changes to the Gemini copy;
- changes to the Gemini-oriented validator or existing documentation; and
- activation, public exposure, authentication, or embedding in an external
  website.

