# Conversational demonstration evidence

The accepted [n8n screenshot](../assets/workflow.png) shows the later conversational workflow answering “Why does chunking matter in RAG?”. The original capture was reviewed on 2026-09-10 and confirmed done and accepted by the user on 2026-09-13. It is preserved without image edits.

## Retrieved paths and citations

The operator reported excerpts for these four pages in the input to `Run Antigravity answer`; the screenshot displays the paths and the chunking excerpt:

- `concepts/chunking.md`
- `concepts/rag.md`
- `sources/every-rag-strategy-explained-in-13-minutes-no-fluff.md`
- `sources/why-the-best-ai-coding-tools-abandoned-rag-and-what-they-use-instead.md`

The answer cites `concepts/chunking.md` and `sources/why-the-best-ai-coding-tools-abandoned-rag-and-what-they-use-instead.md`. Both are members of the reported retrieved set. An answer may cite only the subset of retrieved material it uses.

## Review of claim support

The operator separately supplied both cited excerpts for comparison with the captured answer. No full execution export was reviewed for this check.

| Captured answer point | Finding from supplied evidence |
|---|---|
| Targeted context | Supported by the chunking excerpt's explanation of retrieving small, relevant pieces. |
| Retrieval quality | Supported by the concept page's discussion of chunking and retrieval quality. Direct attribution of all KB prose to Cole was not independently verified. |
| Cost efficiency at scale | The approximate 100x comparison is present in the linked source, but the answer omits its unstructured-knowledge context. It should not be read as a general result or a Uranus measurement. |

The screenshot remains the exact captured result, including that qualification gap. No revised answer is presented as a new model run. This check concerns fidelity to the supplied KB excerpts, not independent verification against the original videos or proof of reliability on other questions.

This is separate from the historical phantom-citation failure and retry in [Evaluation](evaluation.md). The supplied evidence does not show that unread-source failure in this demonstration, but it does show why citation membership alone is insufficient to establish complete claim fidelity.
