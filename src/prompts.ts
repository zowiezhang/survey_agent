import type { CitationSource, Evidence, ResearchPlan, ResearchRequest, ResearchWorkerTask } from "./types.js";
import type { OutputJsonSchema } from "./output-schemas.js";

export function planPrompt(request: ResearchRequest, queryCount: number): string {
  return `You are a rigorous web-research planner. Turn the user's topic into a sourceable research plan. The final report must be factual, current where needed, and cite direct sources. Do not answer the topic yet. Return ONLY valid JSON, no Markdown, in exactly this shape:
{
  "scope": "string",
  "researchQuestions": ["string"],
  "queries": [{"query":"string", "purpose":"string"}],
  "recencyNeeds":"string"
}

Topic: ${request.topic}
User brief: ${request.brief ?? "No additional brief."}
Output language: ${request.language}
Depth: ${request.depth}
Produce exactly ${queryCount} complementary search queries. Cover primary sources, key entities, independent reporting, facts/numbers, and counterevidence when relevant.
Included domains: ${request.includeDomains.join(", ") || "none"}
Excluded domains: ${request.excludeDomains.join(", ") || "none"}`;
}

export function evidencePrompt(request: ResearchRequest, plan: ResearchPlan, query: string, maxSources: number, task?: ResearchWorkerTask): string {
  return `You are an evidence-grounded web researcher. Use your web-search/browsing tools to investigate ONE query. Prefer primary and authoritative sources; corroborate material claims. Do not invent a URL, title, date, quotation, or fact. Never use a source you did not actually access.

Return ONLY valid JSON, no Markdown, in exactly this shape:
{
  "query":"${escapeForExample(query)}",
  "findings":[{
    "claim":"a precise, attributable factual finding",
    "source":{"title":"exact page title","url":"https://...","publisher":"optional","publishedAt":"optional","excerpt":"optional short supporting passage"},
    "confidence":0.0,
    "caveat":"optional limitation or disagreement"
  }],
  "gaps":["unresolved question"]
}

Topic: ${request.topic}
Research scope: ${plan.scope}
Query: ${query}
Worker identity: ${task ? `${task.id} · ${task.roleName}` : "general evidence worker"}
Role-specific contract:
${task?.instruction ?? "Investigate the assigned query and preserve disagreements."}
Language: ${request.language}
Collect at most ${maxSources} findings. Include only claims directly supported by a source. A leaf source is a directly accessible article, filing, dataset row, paper, transcript, release, commit, or official record—not a search-result page or a publisher home page. For names, quotations, dates, funding numbers, benchmark scores and product metrics, link the exact originating page whenever accessible. Record access barriers and conflicting sources in gaps/caveats instead of inventing completion. Exclude domains: ${request.excludeDomains.join(", ") || "none"}. Prioritize domains: ${request.includeDomains.join(", ") || "none"}.`;
}

export function synthesisPrompt(
  request: ResearchRequest,
  plan: ResearchPlan,
  evidence: Evidence[],
  sources: CitationSource[],
  coverage?: { totalPackets: number; totalFindings: number; totalSources: number; failedWorkers: number }
): string {
  const compactEvidence = evidence.map((item) => ({
    query: item.query,
    findings: item.findings.map((finding) => ({
      claim: finding.claim,
      sourceId: sourceIdForUrl(sources, finding.source.url),
      confidence: finding.confidence,
      caveat: finding.caveat
    })),
    gaps: item.gaps
  }));

  return `You are a senior research editor. Synthesize ONLY the supplied evidence; do not add facts from memory. Every factual statement needs one or more source IDs. Explain conflicts, weak evidence, and uncertainty. Return ONLY valid JSON, no Markdown, matching exactly this shape:
{
  "title":"string",
  "executiveSummary":[{"claim":"string","sourceIds":["S1"]}],
  "keyFindings":[{"heading":"string","analysis":"string","sourceIds":["S1"]}],
  "landscape":[{"entity":"string","relevance":"string","sourceIds":["S1"]}],
  "risksAndUncertainties":[{"claim":"string","sourceIds":["S1"]}],
  "furtherResearch":["string"]
Topic: ${request.topic}
Brief: ${request.brief ?? "No additional brief."}
Output language: ${request.language}
Research plan: ${JSON.stringify(plan)}
Coverage note: ${coverage ? JSON.stringify(coverage) : "all gathered evidence is included"}. The final deterministic evidence ledger preserves every gathered finding; this editor view is a bounded, role-balanced subset for cross-theme synthesis. Do not claim that the synthesis prose exhausts the full ledger.
Source registry (use only these IDs): ${JSON.stringify(sources.map(({ id, title, url, publisher, publishedAt }) => ({ id, title, url, publisher, publishedAt })))}
Evidence: ${JSON.stringify(compactEvidence)}`;
}

export function repairPrompt(phase: string, invalidOutput: string, schema: OutputJsonSchema, validationError: string): string {
  return `You are a deterministic JSON repair worker. Do not browse, research, add facts, or rewrite substantive content. Convert the candidate output into one JSON value matching the supplied schema. Preserve every usable fact. Fix only syntax, field names, types, missing structural fields, array bounds, and null representation. Return JSON only.

Phase: ${phase}
Validation error: ${validationError}
JSON Schema: ${JSON.stringify(schema)}
Candidate output:
${invalidOutput.slice(0, 100_000)}`;
}

function sourceIdForUrl(sources: CitationSource[], url: string): string | undefined {
  return sources.find((source) => source.url === canonicalizeUrl(url))?.id;
}

function escapeForExample(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}
