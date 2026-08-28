# Evidence-First Research OS — Target Architecture

## 1. Product boundary

This product is a durable, multi-harness research operating system. A harness is the runtime that performs agent work; it is not merely a model provider. The first adapters are `codex-cli`, `claude-code`, and `gemini-cli`, with an extension mechanism for other local or remote harnesses.

The product does not claim to crawl all of the internet. It does guarantee a measurable process: broad, query-family-driven discovery; recursive upstream provenance tracing; source and claim deduplication; adversarial verification; and a report in which every externally verifiable material claim is linked to its evidence.

### 1.1 Research basis and 2026 decisions

The design is grounded in a primary-source review of **87 project entries across deep-research systems, research-model training, AutoSurvey/scientific workflows, harness infrastructure, and evaluation**. The source-by-source matrix and the mechanisms accepted or rejected are in [AUTORESEARCH_LANDSCAPE_50.md](./AUTORESEARCH_LANDSCAPE_50.md).

Material decisions that changed after that review:

- A research product is a durable harness plus evidence operating system, not a planner/search/writer prompt chain.
- Harness-native subagents and scheduler-level cross-harness sessions are separate concurrency layers and must compose.
- Microsoft Agent Framework is the forward integration target; AutoGen is a compatibility surface, not the new core.
- Query generation starts from a temporal multilingual entity/alias graph and expands an adaptive frontier; a fixed query count is only a hard safety ceiling.
- STORM/AutoSurvey-style outline iteration and AgentCPM-style drafting/deepening are useful, but cannot decide truth. Truth remains in the Claim–Evidence–Passage–Snapshot graph.
- BrowseComp, long-report benches, live benches, survey benches, and agent-environment benches measure different things. The eval suite must remain decomposed.
- Fetched content is untrusted data. Browser/code workers, credentials, and the evidence write path live in separate permission domains.

### 1.2 Current implementation boundary

The npm POC currently runs `openai`, `codex`, and `claude`/`cc` adapters; launches evidence work packets concurrently; forwards Codex/CC activity; supports CC's native `Agent` channel in `native` or `hybrid` mode; enforces native structured output; performs one no-search JSON repair; streams heartbeats and public work notes; deduplicates URLs; and rejects unknown citations.

The ontology/evidence graph, adaptive frontier, recursive provenance service, durable checkpoint store, exact passage selectors, phrase-level `ReportAST`, browser escalation, and benchmark adapters below are the target production phases. Documentation and CLI must never present those target components as already shipped.

## 2. Non-negotiable requirements

1. `harness` is a first-class run parameter. A user can run all roles through one harness or route roles across harnesses.
2. Both harness-native subagents and host-scheduled cross-harness subwork are supported.
3. No factual prose enters a report without a Claim, a recorded EvidenceEdge, and at least one traceable leaf evidence node.
4. Every material named entity, direct quote, date, event, and numerical value in a report has an inline hyperlink to its original source or an evidence-viewer fallback that resolves to that source and exact passage.
5. Important claims follow upstream citations until a source is primary enough for the claim type. Secondary reporting alone is not a verified leaf.
6. Search is semantic, multilingual, alias-aware, recursively expanded, and coverage-driven; it is never a fixed number of keyword queries.
7. The run is checkpointed, replayable, cancellable, budgeted, and observable.
8. No active run may be silent: a client receives an immediate acknowledgement, periodic liveness heartbeats, normalized harness/tool/subagent events, intermediate evidence summaries, coverage changes, and a terminal success/failure event.

## 3. System shape

```text
CLI / API / UI
      │
      ▼
Control Plane ── Run, Task DAG, routing, budget, checkpoint, audit, SSE
      │
      ├──────────── Harness adapters ────────────┐
      │   Codex CLI · Claude Code · Gemini CLI   │
      │                                          ▼
      │                                 native subagents
      ▼
Research MCP Gateway ── search · crawl · parse · archive · recordEvidence
      │
      ▼
Ontology + Evidence Graph ── entities · documents · passages · claims · edges
      │
      ▼
Citation Compiler + Report Renderer ── HTML · Markdown · evidence ledger
```

## 4. Harness and subwork runtime

### 4.1 Adapter contract

```ts
interface HarnessAdapter {
  id: string;
  probe(): Promise<Capabilities>;
  start(task: TaskSpec, context: RunContext): AsyncIterable<ResearchEvent>;
  cancel(sessionId: string): Promise<void>;
  resume(checkpoint: Checkpoint): AsyncIterable<ResearchEvent>;
}
```

Adapters use argv arrays, isolated run workspaces, a credential broker, process timeouts, and a normalized event protocol. An HTTP caller never supplies provider credentials or an executable path.

`codex-cli` runs non-interactively with an ephemeral, read-only profile and a controlled MCP configuration. `claude-code` uses headless `stream-json`, a JSON schema for final artifacts, an isolated empty working directory, safe mode, no session persistence, an explicit tool allowlist, and an optional spend cap; it forwards native subagent transcript events while discarding thinking blocks. CC's documented native subagents are one isolated child layer and cannot themselves spawn further subagents, so deeper trees are produced by the host Task DAG. `gemini-cli` uses headless JSONL output. Capability probing decides which features a particular installed version can actually use.

### 4.2 Native and delegated concurrency

`native`: the harness lead may create subagents using its own mechanism. Their parent/child event topology is captured.

`delegated`: the scheduler launches independent adapter sessions for ready Task DAG nodes.

`hybrid` (default): a lead proposes a typed Task DAG; the scheduler dispatches independent work packets while allowing bounded native subagent fan-out inside a packet.

```ts
interface WorkPacket {
  id: string;
  parentId?: string;
  objective: string;
  questions: string[];
  entityScope: EntityRef[];
  allowedTools: ToolName[];
  sourcePolicy: SourcePolicy;
  dependencies: string[];
  outputSchema: "EvidencePacket" | "CoverageReview" | "ReportAST";
  budget: { wallTimeMs: number; toolCalls: number; tokens?: number; dollars?: number };
}
```

Workers return evidence, not report prose. A parallel reducer merges evidence graph updates, never lets the last worker overwrite other workers, and deduplicates source clusters before any coverage score is calculated. The scheduler enforces a maximum worker count, per-harness capacity, depth limit, retry policy, cycle detection, idempotency key, cancellation propagation, and a hard run budget.

### 4.3 Structured artifact recovery

Every phase supplies a strict JSON Schema to a harness-native structured-output mechanism where available. A malformed artifact follows a bounded recovery path:

```text
native schema output
  → local extraction/normalization
  → Zod/domain invariant validation
  → one repair work packet with search/tools disabled
  → validation or terminal failure
```

Repair preserves the previous artifact and never repeats research. Exact domain invariants—such as the requested number of query partitions or valid citation IDs—are checked locally even when the provider claims schema success. The event stream exposes the validation summary and repair state without emitting the original private reasoning.

## 5. Research graph

### 5.1 Ontology and semantic resolution

The ontology has typed entities (organization, person, product, event, place, document, dataset, metric, date, contract), relationships, aliases, and time scopes. The resolver keeps both a canonical entity and all observed surface forms.

```text
surface form → candidate entity → disambiguation evidence → canonical entity
```

Query construction uses a hybrid of exact terms, aliases, translations, transliterations, historical names, ticker symbols, industry vocabulary, semantic neighbors, relation templates, negative terms, and source-specific query syntax. Newly discovered aliases and relations feed the query graph in later rounds.

Claims are normalized without erasing their qualifiers:

```ts
interface Claim {
  subject: EntityId;
  predicate: CanonicalPredicate;
  object: EntityId | Value;
  time?: TimeRange;
  modality: "confirmed" | "reported" | "alleged" | "denied" | "estimated";
  qualifiers: Record<string, Value>;
}
```

Semantic clustering can label two statements as `same`, `related`, `supports`, `contradicts`, or `uncertain`; it cannot silently merge statements with different actors, dates, quantities, modality, or causal strength. High-impact merges require deterministic constraints plus a reviewer decision.

### 5.2 Discovery and coverage

The planner emits a coverage matrix rather than a fixed query count. For company intelligence, it covers official materials, product, market, competitors, customers, people, finance, contracts, regulatory/court records, technical sources, news, community signals, and adverse evidence. Specialized workers own disjoint slices of that matrix.

The critic compares completed evidence to open research questions and dispatches targeted follow-ups. A run can converge only when high-priority cells meet their required source diversity, independent-cluster count, freshness, upstream provenance depth, and counterevidence requirements, or are explicitly marked not publicly verifiable.

## 6. Evidence graph and leaf tracing

```text
Run → Task → Attempt → HarnessSession → ToolEvent
    → Source → DocumentSnapshot → Passage
    → Claim → EvidenceEdge → CitationAnchor
```

`EvidenceEdge` records `supports`, `contradicts`, `contextualizes`, or `mentions`, as well as directness, source quality, independence cluster, extraction method, and reviewer status.

The Provenance Traverser follows external links, footnotes, quoted attributions, referenced filings, attachments, author statements, data-table provenance, and earlier reports. It dispatches subwork to retrieve upstream documents until it reaches a claim-appropriate leaf node:

- primary official record, filing, court/regulatory document, contract, first-party dataset, source code, paper, transcript, or direct interview;
- exact supporting paragraph, table cell/range, PDF page and bounding box, media timestamp, or archived document snapshot;
- no unresolved upstream citation that is material to the claim.

Stopping is claim-sensitive, not simply hop-sensitive. A low-risk historical fact may need one authoritative direct source. Financial, legal, contractual, medical, safety, defense, or contested claims require primary leaves and independent corroboration. A source cluster is one underlying origin even if it appears in dozens of syndicated pages.

## 7. Citation and hyperlink contract

### 7.1 Report AST

The writer produces a typed `ReportAST`; it cannot emit free Markdown as its source of truth.

```ts
interface ClaimSpan {
  text: string;
  claimIds: ClaimId[];
  anchors: CitationAnchorId[];
  kind: "entity" | "quote" | "number" | "date" | "event" | "assertion";
}

interface CitationAnchor {
  sourceUrl: string;
  preferredUrl: string;
  evidenceViewerUrl: string;
  selector: Selector;
  snapshotHash: string;
  retrievedAt: string;
  passageId: PassageId;
}
```

The renderer turns `ClaimSpan`s into phrase-level hyperlinks, not just end-of-paragraph bibliography markers. It keeps prose readable by linking the smallest meaningful span and grouping genuinely joint citations after a clause.

Required inline links:

| Visible content | Link target |
| --- | --- |
| First material mention of a person, company, product, event, or document | Strongest canonical/primary source for that entity in context |
| Direct quotation | Exact quoted passage |
| Number, metric, amount, percentage, ranking, date | Original table, filing, dataset, or exact source passage |
| Factual assertion | One or more evidence passages that entail it |
| Contested assertion | Supporting and contradictory evidence, visibly distinguished |

The title of every source card links to the canonical original. Inline links first use a direct original URL with a stable fragment when possible. A report-hosted evidence viewer is always available as a fallback and displays source metadata, archived snapshot, exact excerpt, surrounding context, selectors, retrieval time, and content hash. It never disguises the original URL.

### 7.2 Exact location

Web pages store a resilient selector bundle: canonical URL, heading/DOM selector where stable, quote exact/prefix/suffix, text offsets, and retrieval-time snapshot. When supported, the direct URL may use a text-fragment anchor (`#:~:text=`). PDFs store page number plus bounding box and extracted quote; spreadsheets store workbook/sheet/range; data APIs store endpoint, request version, field/row selector; audio/video store time range.

Text quote and position selectors follow the concepts in the W3C Web Annotation Data Model. Text-fragment URLs improve direct navigation but are optional because browser and publisher behavior is not universal.

### 7.3 Rendering example

```md
[Ada Example](https://origin.example/bio) 在 [2024 年采访](https://origin.example/interview#:~:text=...) 中表示，
“[精确引语](https://origin.example/interview#:~:text=...)”。公司披露的
[2025 年收入 2.4 亿美元](https://origin.example/annual-report.pdf#page=71) 来自其年报表格。
```

If no public primary source is available, the wording is explicitly qualified and links to the best available report plus the evidence viewer. The system does not turn a weak source into a strong fact merely by hyperlinking it.

## 8. Citation quality gates

The compiler rejects or repairs a report when any material ClaimSpan lacks an anchor. A final verifier evaluates:

1. **Link completeness** — 100% of material claim spans, quotes, numbers, and material first-mention entities have at least one anchor.
2. **Link validity** — canonical URL is syntactically valid, fetchable at acquisition time, and has a stored snapshot.
3. **Entailment** — source passage supports the exact visible claim; direct quotes must match deterministically, and numerical/date values must match after unit and time-scope normalization.
4. **Provenance depth** — claim class meets primary leaf and independent-cluster thresholds.
5. **Citation diversity** — syndicated copies and mutually dependent sources do not inflate confidence.
6. **Qualifier fidelity** — words such as reported, estimated, denied, and alleged are preserved.
7. **Copyright and privacy** — reports link short necessary excerpts instead of reproducing source text, and remove personal data not needed for the research purpose.

Failures create repair subwork. They cannot be silently converted into an uncited sentence.

## 9. APIs and profiles

```json
{
  "question": "…",
  "profile": "company-intelligence",
  "routing": {
    "lead": "claude-code",
    "research": ["claude-code", "codex-cli"],
    "verifier": "codex-cli",
    "writer": "claude-code"
  },
  "subwork": { "mode": "hybrid", "maxConcurrent": 8, "maxDepth": 2 },
  "provenancePolicy": {
    "requirePrimaryLeavesFor": ["financial", "legal", "contract", "high-impact"],
    "minIndependentClusters": 2
  },
  "citationPolicy": { "inlineHyperlinks": "all-material-claims", "exactLocation": true }
}
```

The service returns `202 Accepted` with a `runId`; clients consume events by SSE or poll a run endpoint. They can inspect the task tree, source map, claim/evidence graph, coverage matrix, report AST, and final report. Human review may approve the plan, resolve a high-impact entity merge, accept an uncertainty, or reject a report.

### 9.1 Live execution experience

CLI, API, and UI are projections of one append-only normalized event stream. The user sees what the system is doing without exposing private chain-of-thought:

```text
run.started
plan.started → plan.completed
subwork.created → harness.session.started
agent.message.summary
tool.started → tool.completed
source.discovered → document.archived → evidence.recorded
coverage.updated
heartbeat
subwork.completed / subwork.failed
report.compiling → citation.validating
run.completed / run.failed / run.cancelled
```

Every event has `runId`, `eventId`, `timestamp`, `parentEventId`, `taskId`, `harnessSessionId`, retry/attempt metadata, elapsed time, and safe structured payload. Native CC subagent events retain their `parent_tool_use_id` relationship. Heartbeats are emitted at least every five seconds while a stage has produced no other visible event and contain current stage, active/queued/completed subwork counts, source/evidence counts, budget consumption, and elapsed time. They stop only after a terminal event.

The CLI renders an append-only log plus progress bars. JSONL mode emits the raw normalized events to stderr. The HTTP API exposes `GET /v1/runs/{id}/events` as resumable SSE using `Last-Event-ID`; the UI reconstructs a Codex-like expandable parent/subagent/task tree. Disconnecting a viewer does not stop the durable run, and reconnecting replays missed events before following live output.

Intermediate output means auditable work products—an immediate preliminary research skeleton, rotating public work notes, research questions, active queries, normalized harness activity, newly discovered sources, extracted evidence summaries, contradiction flags, coverage deltas, retries, and budget state. A heartbeat must therefore communicate both liveness and the current public work item; repeating only an elapsed-time line is insufficient. Hidden chain-of-thought, raw commands, and secrets are never emitted.

## 10. Test and evaluation contract

1. Adapter-contract fixtures replay Codex, Claude Code, and Gemini JSON events into the same normalized event tree.
2. A deterministic offline corpus tests Task DAG replay, pause/resume, cancellation, worker failure, and deduplication without calling models.
3. Property tests prove no material ClaimSpan can render without a recorded EvidenceEdge and leaf-compliant CitationAnchor.
4. Adversarial fixtures cover prompt injection, poisoned pages, link rot, dynamic content, PDFs, OCR errors, translated reposts, citation cycles, and conflicting numbers.
5. Golden research tasks measure coverage, primary-leaf rate, semantic-resolution precision, counterevidence retrieval, claim entailment, inline-link completeness, cost, and latency.
6. A browser test opens every rendered link, verifies external-original/evidence-viewer fallback behavior, and checks that a text selector or page location displays the recorded passage.

## 11. Research basis

The full, categorized primary-source matrix is [AutoResearch / AutoSurvey 前沿项目调研与架构取舍](./AUTORESEARCH_LANDSCAPE_50.md). Particularly direct inputs to this specification include:

- [DeerFlow](https://github.com/bytedance/deer-flow): harness combining subagents, memory, sandboxes, filesystem, and skills.
- [Open Deep Research](https://github.com/langchain-ai/open_deep_research): model/search/MCP configurability and separate research roles.
- [Claude Code headless mode](https://code.claude.com/docs/en/headless) and [subagents](https://code.claude.com/docs/en/sub-agents): structured output, streaming, budgets, child event forwarding, and current native-subagent limits.
- [Gemini CLI headless mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md): JSON/JSONL events.
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/): selectors for source segments, including text quote and position selectors.
- [MDN text fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments): best-effort direct navigation to cited web text.
