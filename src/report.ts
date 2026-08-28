import { AgentOutputError } from "./errors.js";
import type { CitationSource, Evidence, ResearchPlan, ResearchRequest, ResearchTaskFailure, Synthesis } from "./types.js";

export function renderReport(input: {
  request: ResearchRequest;
  plan: ResearchPlan;
  evidence: Evidence[];
  synthesis: Synthesis;
  sources: CitationSource[];
  createdAt: string;
  failedTasks?: ResearchTaskFailure[];
}): string {
  assertKnownSourceIds(input.synthesis, input.sources);
  const zh = input.request.language.toLowerCase().startsWith("zh");
  const label = zh
    ? {
        report: "调研报告", metadata: "调研元数据", summary: "结论摘要", findings: "关键发现",
        landscape: "相关主体与脉络", risks: "风险、不确定性与反证", gaps: "待进一步验证",
        ledger: "证据账本（逐叶节点）", unresolved: "本工作包未解决", confidence: "置信度", caveat: "限制",
        failed: "未完成的 Subagent 工作包", sources: "来源"
      }
    : {
        report: "Research Report", metadata: "Research Metadata", summary: "Executive Summary", findings: "Key Findings",
        landscape: "Landscape", risks: "Risks, Uncertainty, and Counterevidence", gaps: "Further Research",
        ledger: "Evidence Ledger (leaf-level)", unresolved: "Unresolved in this work packet", confidence: "Confidence", caveat: "Caveat",
        failed: "Incomplete Subagent Work Packets", sources: "Sources"
      };
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const sourceByUrl = new Map(input.sources.map((source) => [canonicalizeUrl(source.url), source]));

  const lines = [
    `# ${label.report}: ${input.synthesis.title}`,
    "",
    `> ${zh ? "生成时间" : "Generated"}: ${input.createdAt} · ${zh ? "研究主题" : "Topic"}: ${input.request.topic}`,
    "",
    `## ${label.metadata}`,
    "",
    `- ${zh ? "范围" : "Scope"}: ${input.plan.scope}`,
    `- ${zh ? "时效要求" : "Recency needs"}: ${input.plan.recencyNeeds}`,
    `- ${zh ? "调研问题" : "Research questions"}: ${input.plan.researchQuestions.join("； ")}`,
    "",
    `## ${label.summary}`,
    "",
    ...input.synthesis.executiveSummary.map((item) => `- ${item.claim} ${citationText(item.sourceIds, sourceById)}`),
    "",
    `## ${label.findings}`,
    ""
  ];

  for (const finding of input.synthesis.keyFindings) {
    lines.push(`### ${finding.heading}`, "", `${finding.analysis} ${citationText(finding.sourceIds, sourceById)}`, "");
  }

  lines.push(`## ${label.landscape}`, "");
  for (const item of input.synthesis.landscape) {
    lines.push(`- **${item.entity}** — ${item.relevance} ${citationText(item.sourceIds, sourceById)}`);
  }

  lines.push("", `## ${label.risks}`, "");
  for (const item of input.synthesis.risksAndUncertainties) {
    lines.push(`- ${item.claim}${item.sourceIds.length ? ` ${citationText(item.sourceIds, sourceById)}` : ""}`);
  }

  lines.push("", `## ${label.gaps}`, "");
  for (const item of input.synthesis.furtherResearch) lines.push(`- ${item}`);

  // Preserve every retrieved claim instead of forcing a deep run's evidence
  // through the necessarily lossy synthesis summary. This deterministic ledger
  // also makes source coverage auditable without another model call.
  lines.push("", `## ${label.ledger}`, "");
  for (const [index, packet] of input.evidence.entries()) {
    lines.push(`### ${index + 1}. ${packet.query}`, "");
    for (const finding of packet.findings) {
      const source = sourceByUrl.get(canonicalizeUrl(finding.source.url));
      if (!source) throw new AgentOutputError(`Evidence source is missing from registry: ${finding.source.url}`);
      const details = [
        `${label.confidence}: ${Math.round(finding.confidence * 100)}%`,
        finding.caveat ? `${label.caveat}: ${finding.caveat}` : undefined
      ].filter(Boolean).join(" · ");
      lines.push(`- ${finding.claim} — [${source.id} · ${escapeLinkText(source.title)}](${source.url}) · ${details}`);
    }
    for (const gap of packet.gaps) lines.push(`- *${label.unresolved}: ${gap}*`);
    lines.push("");
  }

  if (input.failedTasks?.length) {
    lines.push(`## ${label.failed}`, "");
    for (const failure of input.failedTasks) {
      lines.push(`- **${failure.task.id} · ${failure.task.roleName}** — ${failure.attempts} ${zh ? "次尝试后失败" : "attempts failed"}: ${failure.message}`);
    }
    lines.push("");
  }

  lines.push(`## ${label.sources}`, "");
  for (const source of input.sources) {
    const details = [source.publisher, source.publishedAt].filter(Boolean).join(" · ");
    lines.push(`- [${source.id}](${source.url}) [${escapeLinkText(source.title)}](${source.url})${details ? ` — ${details}` : ""}`);
  }

  const markdown = `${lines.join("\n").trim()}\n`;
  validateReport(markdown, input.sources);
  return markdown;
}

export function validateReport(markdown: string, sources: CitationSource[]): void {
  if (sources.length < 2) throw new AgentOutputError("Research requires at least two distinct HTTP(S) sources.");
  const requiredSections = ["# ", "## ", "### ", "[S1]", "##"];
  if (requiredSections.some((section) => !markdown.includes(section))) {
    throw new AgentOutputError("Rendered report is missing mandatory structure or citations.");
  }
  const cited = new Set([...markdown.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]));
  if (cited.size < 2) throw new AgentOutputError("Rendered report must cite at least two sources.");
  const known = new Set(sources.map((source) => source.id));
  if ([...cited].some((id) => !known.has(id))) {
    throw new AgentOutputError("Rendered report contains an unknown source citation.");
  }
}

function assertKnownSourceIds(synthesis: Synthesis, sources: CitationSource[]): void {
  const known = new Set(sources.map((source) => source.id));
  const citations = [
    ...synthesis.executiveSummary.flatMap((item) => item.sourceIds),
    ...synthesis.keyFindings.flatMap((item) => item.sourceIds),
    ...synthesis.landscape.flatMap((item) => item.sourceIds),
    ...synthesis.risksAndUncertainties.flatMap((item) => item.sourceIds)
  ];
  const unknown = citations.find((id) => !known.has(id));
  if (unknown) throw new AgentOutputError(`Synthesis cited unknown source ID: ${unknown}.`);
}

function citationText(ids: string[], sources: Map<string, CitationSource>): string {
  return ids.map((id) => {
    const source = sources.get(id);
    if (!source) throw new AgentOutputError(`Synthesis cited unknown source ID: ${id}.`);
    return `[${id}](${source.url})`;
  }).join(" ");
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function escapeLinkText(value: string): string {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]");
}
