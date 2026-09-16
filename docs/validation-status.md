# Validation status — 2026-09-16

**Status: accepted for the current proof-of-concept and application scope. No validation remains pending.** The user confirmed closure on 2026-09-16.

The current 49-node chat export passes its static validator. Both Antigravity requests pin `agent_config.model` to `gemini-3.7-flash`, with the existing 12,000-token resolver and 20,000-token answer budgets.

## Successful checks

- Static validation: `node scripts/validate-chat-antigravity.mjs` returned `Antigravity chat workflow validation passed (49 nodes).`
- Operator-reported live literal fallback: the question about "the dumb zone" succeeded with double quotes and `selection_method: keyword_literal`.
- Operator-reported live conversation after pinning 3.7: "Why does chunking matter in RAG?" produced a cited answer. "What are its costs?" correctly referred to chunking and produced an answer that acknowledged insufficient evidence for a full list of costs.

These observations establish that the reported conversation now completes. They do not establish that every regression scenario has been rerun or that the provider's underlying default model change caused the earlier failures.

## Known limits outside the accepted validation scope

- The full historical regression suite was not rerun during this check. Separate-session isolation and unsupported-query passing results remain historical evidence; additional runs are optional future work.
- Curly single quotes around a phrase are not recognized by the current phrase extractor. Double quotes activate the expected literal fallback; no code fix for curly single quotes has been made.
- The costs answer was appropriately bounded by its evidence, but did not provide a full account of chunking's drawbacks.
- Earlier supplied traces showed built-in tool calls and incomplete Antigravity responses despite `tools: []`. The successful conversation does not prove tool use is disabled.
