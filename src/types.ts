import { z } from "zod";
import type { OutputJsonSchema } from "./output-schemas.js";

function optionalTrimmedString(min: number, max: number) {
  return z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().trim().min(min).max(max).optional()
  );
}

export const ProviderSchema = z.preprocess(
  (value) => value === "cc" ? "claude" : value,
  z.enum(["openai", "codex", "claude"])
);
export type Provider = z.infer<typeof ProviderSchema>;

const ResearchRequestObjectSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  brief: z.string().trim().max(4_000).optional(),
  provider: ProviderSchema.default("openai"),
  model: z.string().trim().min(1).max(120).optional(),
  language: z.string().trim().min(2).max(35).default("zh-CN"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  maxQueries: z.number().int().min(2).max(8).optional(),
  maxAgents: z.number().int().min(2).max(256),
  entitiesPerAgent: z.number().int().min(1).max(50),
  maxSources: z.number().int().min(2).max(30),
  seedPath: z.string().trim().min(1).max(2_048).optional(),
  subworkMode: z.enum(["delegated", "native", "hybrid"]).default("hybrid"),
  concurrency: z.number().int().min(1).max(16).default(3),
  includeDomains: z.array(z.string().trim().min(3).max(255)).max(20).default([]),
  excludeDomains: z.array(z.string().trim().min(3).max(255)).max(20).default([])
}).strict();

export const ResearchRequestSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const depth = record.depth === "quick" || record.depth === "deep" ? record.depth : "standard";
  const maxSources = "maxSources" in record ? record.maxSources : defaultMaxSources(depth);
  const maxAgents = "maxAgents" in record
    ? record.maxAgents
    : typeof record.maxQueries === "number" ? record.maxQueries : defaultMaxAgents(depth);
  const entitiesPerAgent = "entitiesPerAgent" in record ? record.entitiesPerAgent : defaultEntitiesPerAgent(depth);
  if (!("harness" in record)) return { ...record, maxSources, maxAgents, entitiesPerAgent };
  const { harness, ...rest } = record;
  return { ...rest, provider: harness, maxSources, maxAgents, entitiesPerAgent };
}, ResearchRequestObjectSchema);

export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

function defaultMaxSources(depth: "quick" | "standard" | "deep"): number {
  return depth === "quick" ? 6 : depth === "deep" ? 20 : 12;
}

function defaultMaxAgents(depth: "quick" | "standard" | "deep"): number {
  return depth === "quick" ? 12 : depth === "deep" ? 64 : 32;
}

function defaultEntitiesPerAgent(depth: "quick" | "standard" | "deep"): number {
  return depth === "quick" ? 25 : depth === "deep" ? 12 : 18;
}

export const SourceSchema = z.object({
  title: z.string().trim().min(1).max(500),
  url: z.string().url().refine((url) => /^https?:\/\//i.test(url), "Only HTTP(S) sources are allowed"),
  publisher: optionalTrimmedString(1, 200),
  publishedAt: optionalTrimmedString(4, 80),
  excerpt: optionalTrimmedString(1, 1_500)
});

export type Source = z.infer<typeof SourceSchema>;

export const PlanSchema = z.object({
  scope: z.string().trim().min(10).max(1_000),
  researchQuestions: z.array(z.string().trim().min(5).max(500)).min(2).max(8),
  queries: z.array(z.object({
    query: z.string().trim().min(3).max(500),
    purpose: z.string().trim().min(3).max(500)
  })).min(2).max(8),
  recencyNeeds: z.string().trim().min(3).max(500)
});

export type ResearchPlan = z.infer<typeof PlanSchema>;

export const EvidenceSchema = z.object({
  query: z.string().trim().min(1).max(500),
  findings: z.array(z.object({
    claim: z.string().trim().min(8).max(2_000),
    source: SourceSchema,
    confidence: z.number().min(0).max(1),
    caveat: optionalTrimmedString(3, 1_000)
  })).min(1).max(30),
  gaps: z.array(z.string().trim().min(3).max(500)).max(10)
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const SynthesisSchema = z.object({
  title: z.string().trim().min(3).max(300),
  executiveSummary: z.array(z.object({
    claim: z.string().trim().min(8).max(1_000),
    sourceIds: z.array(z.string().regex(/^S\d+$/)).min(1).max(8)
  })).min(2).max(8),
  keyFindings: z.array(z.object({
    heading: z.string().trim().min(3).max(300),
    analysis: z.string().trim().min(15).max(3_000),
    sourceIds: z.array(z.string().regex(/^S\d+$/)).min(1).max(10)
  })).min(2).max(40),
  landscape: z.array(z.object({
    entity: z.string().trim().min(2).max(300),
    relevance: z.string().trim().min(8).max(1_500),
    sourceIds: z.array(z.string().regex(/^S\d+$/)).min(1).max(8)
  })).min(1).max(100),
  risksAndUncertainties: z.array(z.object({
    claim: z.string().trim().min(8).max(1_500),
    sourceIds: z.array(z.string().regex(/^S\d+$/)).min(1).max(8)
  })).min(1).max(10),
  furtherResearch: z.array(z.string().trim().min(6).max(1_000)).min(1).max(10)
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

export type AgentPhase = "plan" | "evidence" | "synthesis" | "repair";

export interface AgentPrompt {
  phase: AgentPhase;
  prompt: string;
  model?: string;
  outputSchema?: OutputJsonSchema;
  allowNativeSubagents?: boolean;
  onRuntimeEvent?: (event: AgentRuntimeEvent) => void;
}

export interface AgentRuntimeEvent {
  type: "session" | "turn" | "tool" | "output" | "usage" | "status";
  message: string;
}

export interface AgentResult {
  text: string;
  responseId?: string;
}

export interface ExecutionAgent {
  complete(input: AgentPrompt): Promise<AgentResult>;
}

export interface CitationSource extends Source {
  id: string;
}

export interface ResearchWorkerTask {
  id: string;
  index: number;
  roleId: string;
  roleName: string;
  objective: string;
  query: string;
  purpose: string;
  instruction: string;
  targetEntities: string[];
}

export interface ResearchTaskFailure {
  task: ResearchWorkerTask;
  message: string;
  attempts: number;
}

export interface ResearchResult {
  id: string;
  createdAt: string;
  request: ResearchRequest;
  plan: ResearchPlan;
  evidence: Evidence[];
  evidenceTasks: ResearchWorkerTask[];
  tasks: ResearchWorkerTask[];
  failedTasks: ResearchTaskFailure[];
  sources: CitationSource[];
  markdown: string;
  html: string;
  responseIds: string[];
}
