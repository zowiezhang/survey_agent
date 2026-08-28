import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AgentOutputError, ResearchHarnessError } from "./errors.js";
import { parseAgentJson } from "./json.js";
import { evidenceOutputSchema, planOutputSchema, synthesisOutputSchema, type OutputJsonSchema } from "./output-schemas.js";
import { evidencePrompt, planPrompt, repairPrompt, synthesisPrompt } from "./prompts.js";
import type { ProgressListener, ResearchStage } from "./progress.js";
import { renderReport } from "./report.js";
import { renderInteractiveReport } from "./html-report.js";
import { detectSeedPath, loadResearchSeed, type ResearchSeed } from "./seed.js";
import { buildResearchTaskGraph } from "./task-graph.js";
import {
  EvidenceSchema,
  PlanSchema,
  ResearchRequestSchema,
  SynthesisSchema,
  type CitationSource,
  type ExecutionAgent,
  type AgentResult,
  type Evidence,
  type ResearchRequest,
  type ResearchPlan,
  type ResearchResult,
  type ResearchTaskFailure,
  type ResearchWorkerTask,
  type Source,
  type Synthesis
} from "./types.js";

const DEFAULT_QUERY_COUNT: Record<ResearchRequest["depth"], number> = {
  quick: 2,
  standard: 4,
  deep: 6
};

export interface ResearchWorkflowOptions {
  now?: () => Date;
  concurrency?: number;
  onProgress?: ProgressListener;
  heartbeatIntervalMs?: number;
  allowLocalSeedPaths?: boolean;
}

export class ResearchWorkflow {
  private readonly now: () => Date;
  private readonly concurrency: number;
  private readonly onProgress?: ProgressListener;
  private readonly heartbeatIntervalMs: number;
  private readonly allowLocalSeedPaths: boolean;

  constructor(private readonly agent: ExecutionAgent, options: ResearchWorkflowOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.concurrency = options.concurrency ?? 3;
    this.onProgress = options.onProgress;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    this.allowLocalSeedPaths = options.allowLocalSeedPaths ?? false;
  }

  async run(input: unknown): Promise<ResearchResult> {
    const startedAt = Date.now();
    try {
      return await this.execute(input, startedAt);
    } catch (error) {
      this.emit({
        type: "run.failed",
        at: this.timestamp(),
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown research error"
      });
      throw error;
    }
  }

  private async execute(input: unknown, startedAt: number): Promise<ResearchResult> {
    const request = ResearchRequestSchema.parse(input);
    const queryCount = request.maxQueries ?? DEFAULT_QUERY_COUNT[request.depth];
    const taskCount = request.maxAgents;
    const delegatedConcurrency = request.subworkMode === "native" ? 1 : Math.min(request.concurrency, this.concurrency);
    const seed = await this.loadSeed(request);
    this.emit({
      type: "run.started",
      at: this.timestamp(),
      topic: request.topic,
      queryCount: taskCount,
      harness: request.provider,
      subworkMode: request.subworkMode,
      concurrency: delegatedConcurrency
    });
    if (seed) {
      this.emit({
        type: "seed.loaded",
        at: this.timestamp(),
        path: seed.path,
        companyCount: seed.rawCompanyCount,
        fundingCount: seed.rawFundingCount,
        statementCount: seed.rawStatementCount,
        date: seed.date
      });
    }
    const responseIds: string[] = [];
    const planJsonSchema = planOutputSchema(queryCount);
    this.emit({ type: "plan.started", at: this.timestamp() });
    const preview = buildPlanPreview(request.topic);
    this.emit({
      type: "plan.preview",
      at: this.timestamp(),
      topic: request.topic,
      dimensions: preview.dimensions,
      sourceStrategy: preview.sourceStrategy
    });
    const planResult = await this.withHeartbeat("planning", "正在生成研究问题和查询图", () =>
      this.completeWithRetry(() => this.agent.complete({
        phase: "plan",
        prompt: planPrompt(request, queryCount),
        model: request.model,
        outputSchema: planJsonSchema,
        onRuntimeEvent: this.forwardAgentActivity("planning")
      }), "planning", "规划 Agent"),
      planningPublicNotes(request.topic)
    );
    if (planResult.responseId) responseIds.push(planResult.responseId);
    const plan = await this.parseOrRepair<ResearchPlan>({
      result: planResult,
      schema: PlanSchema,
      outputSchema: planJsonSchema,
      phase: "Planning",
      stage: "planning",
      model: request.model,
      responseIds,
      validate: (value) => {
        if (value.queries.length !== queryCount) {
          throw new AgentOutputError(`Planner returned ${value.queries.length} queries; expected exactly ${queryCount}.`);
        }
      }
    });
    this.emit({
      type: "plan.completed",
      at: this.timestamp(),
      scope: plan.scope,
      questions: plan.researchQuestions,
      queries: plan.queries
    });

    const tasks = buildResearchTaskGraph({ request, plan, seed });
    const totalTasks = tasks.length;
    this.emit({
      type: "task.graph.ready",
      at: this.timestamp(),
      workers: tasks.map((task) => ({
        workerId: task.id,
        roleId: task.roleId,
        roleName: task.roleName,
        entityCount: task.targetEntities.length,
        purpose: task.purpose
      }))
    });
    const executeTask = async (task: ResearchWorkerTask) => {
      const { query, purpose, index } = task;
      const queryStartedAt = Date.now();
      const meta = workerMeta(task);
      this.emit({ type: "query.started", at: this.timestamp(), index, total: totalTasks, query, purpose, ...meta });
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await this.withHeartbeat(
            "researching",
            `检索 ${index}/${totalTasks}：${query}${attempt > 1 ? `（重试 ${attempt}/${maxAttempts}）` : ""}`,
            () => this.agent.complete({
              phase: "evidence",
              prompt: evidencePrompt(request, plan, query, request.maxSources, task),
              model: request.model,
              outputSchema: evidenceOutputSchema(request.maxSources),
              allowNativeSubagents: request.subworkMode === "native" || request.subworkMode === "hybrid",
              onRuntimeEvent: this.forwardAgentActivity("researching", index, totalTasks, task)
            }),
            researchPublicNotes(query, purpose),
            index,
            totalTasks,
            task
          );
          if (result.responseId) responseIds.push(result.responseId);
          const evidence = await this.parseOrRepair<Evidence>({
            result,
            schema: EvidenceSchema,
            outputSchema: evidenceOutputSchema(request.maxSources),
            phase: `Evidence (${query})`,
            stage: "researching",
            model: request.model,
            responseIds,
            index,
            total: totalTasks
          });
          this.emit({
            type: "query.completed",
            at: this.timestamp(),
            index,
            total: totalTasks,
            query,
            durationMs: Date.now() - queryStartedAt,
            claims: evidence.findings.map((finding) => finding.claim),
            sources: evidence.findings.map((finding) => finding.source),
            ...meta
          });
          return evidence;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown evidence worker error";
          if (attempt < maxAttempts) {
            this.emit({
              type: "query.retrying",
              at: this.timestamp(),
              index,
              total: totalTasks,
              query,
              attempt: attempt + 1,
              maxAttempts,
              message,
              ...meta
            });
            continue;
          }
          this.emit({
            type: "query.failed",
            at: this.timestamp(),
            index,
            total: totalTasks,
            query,
            durationMs: Date.now() - queryStartedAt,
            attempts: maxAttempts,
            message,
            ...meta
          });
          throw new TaskExecutionError(message, maxAttempts);
        }
      }
      throw new TaskExecutionError("Evidence worker exhausted all attempts.", maxAttempts);
    };
    const primaryTasks = tasks.filter((task) => task.roleId !== "source-audit");
    const auditTasks = tasks.filter((task) => task.roleId === "source-audit");
    const primaryOutcomes = await settledMapWithConcurrency(primaryTasks, delegatedConcurrency, executeTask);
    const primaryEvidence = successfulValues(primaryOutcomes);
    const primaryEvidenceTasks = successfulItems(primaryOutcomes);
    const contextualAuditTasks = auditTasks.map((task) => ({
        ...task,
        instruction: `${task.instruction}\n\n这是与本审计分片对应的前序专业 subagent 待审计证据索引。必须实际打开并核对链接；不要仅复述：\n${auditContextForEvidence(primaryEvidence, primaryEvidenceTasks, task)}`
      }));
    const auditOutcomes = await settledMapWithConcurrency(contextualAuditTasks, delegatedConcurrency, executeTask);
    const auditEvidence = successfulValues(auditOutcomes);
    const auditEvidenceTasks = successfulItems(auditOutcomes);
    const evidenceResults = [...primaryEvidence, ...auditEvidence];
    const evidenceTasks = [...primaryEvidenceTasks, ...auditEvidenceTasks];
    const failedTasks = [...failuresFor(primaryOutcomes), ...failuresFor(auditOutcomes)];
    const sources = sourceRegistry(evidenceResults.flatMap((item) => item.findings.map((finding) => finding.source)));
    if (sources.length < 2) {
      throw new ResearchHarnessError("Research returned fewer than two distinct, valid sources; report was not generated.", 422);
    }

    const synthesisStartedAt = Date.now();
    const synthesisEvidence = boundedSynthesisEvidence(evidenceResults);
    const synthesisSourceUrls = new Set(synthesisEvidence.flatMap((packet) => packet.findings.map((finding) => canonicalizeUrl(finding.source.url))));
    const synthesisSources = sources.filter((source) => synthesisSourceUrls.has(source.url));
    this.emit({
      type: "synthesis.started",
      at: this.timestamp(),
      sourceCount: sources.length,
      findingCount: evidenceResults.reduce((total, evidence) => total + evidence.findings.length, 0)
    });
    const synthesisResult = await this.withHeartbeat("synthesizing", "正在核对引用并组织最终报告", () =>
      this.completeWithRetry(() => this.agent.complete({
        phase: "synthesis",
        prompt: synthesisPrompt(request, plan, synthesisEvidence, synthesisSources, {
          totalPackets: evidenceResults.length,
          totalFindings: evidenceResults.reduce((total, evidence) => total + evidence.findings.length, 0),
          totalSources: sources.length,
          failedWorkers: failedTasks.length
        }),
        model: request.model,
        outputSchema: synthesisOutputSchema,
        onRuntimeEvent: this.forwardAgentActivity("synthesizing")
      }), "synthesizing", "综合 Agent"),
      synthesisPublicNotes(sources.length)
    );
    if (synthesisResult.responseId) responseIds.push(synthesisResult.responseId);
    const synthesis = await this.parseOrRepair<Synthesis>({
      result: synthesisResult,
      schema: SynthesisSchema,
      outputSchema: synthesisOutputSchema,
      phase: "Synthesis",
      stage: "synthesizing",
      model: request.model,
      responseIds,
      validate: (value) => validateSynthesisSourceIds(value, synthesisSources)
    });
    this.emit({ type: "synthesis.completed", at: this.timestamp(), durationMs: Date.now() - synthesisStartedAt });
    const createdAt = this.now().toISOString();
    const id = randomUUID();
    const markdown = renderReport({ request, plan, evidence: evidenceResults, synthesis, sources, createdAt, failedTasks });
    const html = renderInteractiveReport({ id, request, plan, tasks, evidenceTasks, failedTasks, evidence: evidenceResults, synthesis, sources, createdAt });
    this.emit({
      type: "run.completed",
      at: this.timestamp(),
      durationMs: Date.now() - startedAt,
      sourceCount: sources.length,
      queryCount: totalTasks,
      failedCount: failedTasks.length
    });

    return {
      id,
      createdAt,
      request,
      plan,
      evidence: evidenceResults,
      evidenceTasks,
      tasks,
      failedTasks,
      sources,
      markdown,
      html,
      responseIds
    };
  }

  private async loadSeed(request: ResearchRequest): Promise<ResearchSeed | undefined> {
    const path = request.seedPath ?? detectSeedPath(request.topic);
    if (!path) return undefined;
    if (!this.allowLocalSeedPaths) {
      throw new ResearchHarnessError("Local seed paths are disabled for this workflow. Use the CLI or explicitly enable trusted local seed access.", 403);
    }
    return loadResearchSeed(path);
  }

  private async parseOrRepair<T>(options: {
    result: AgentResult;
    schema: z.ZodType<T, z.ZodTypeDef, any>;
    outputSchema: OutputJsonSchema;
    phase: string;
    stage: ResearchStage;
    model?: string;
    responseIds: string[];
    validate?: (value: T) => void;
    index?: number;
    total?: number;
  }): Promise<T> {
    let candidate = options.result;
    const maxRepairAttempts = 2;
    for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
      try {
        const parsed = parseAgentJson(candidate.text, options.schema, repairAttempt ? `${options.phase} (after repair ${repairAttempt})` : options.phase);
        options.validate?.(parsed);
        if (repairAttempt) {
          this.emit({ type: "output.repair.completed", at: this.timestamp(), stage: options.stage, phase: options.phase });
        }
        return parsed;
      } catch (error) {
        if (!(error instanceof AgentOutputError) || repairAttempt === maxRepairAttempts) throw error;
      this.emit({
        type: "output.repair.started",
        at: this.timestamp(),
        stage: options.stage,
        phase: options.phase,
          validationError: `${error.message} (repair ${repairAttempt + 1}/${maxRepairAttempts})`
      });
      const repairResult = await this.withHeartbeat(
        options.stage,
        `正在修复 ${options.phase} 的结构化输出`,
        () => this.agent.complete({
          phase: "repair",
          prompt: repairPrompt(options.phase, candidate.text, options.outputSchema, error.message),
          model: options.model,
          outputSchema: options.outputSchema,
          onRuntimeEvent: this.forwardAgentActivity(options.stage, options.index, options.total)
        }),
        [
          "正在保留已有调研内容，只纠正 JSON 语法、字段和数组边界。",
          "此步骤不会重新执行网页搜索；完成后将再次运行本地 Zod 校验。"
        ],
        options.index,
        options.total
      );
      if (repairResult.responseId) options.responseIds.push(repairResult.responseId);
        candidate = repairResult;
      }
    }
    throw new AgentOutputError(`${options.phase} could not be repaired.`);
  }

  private async completeWithRetry<T>(operation: () => Promise<T>, stage: ResearchStage, label: string): Promise<T> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        this.emit({
          type: "agent.activity",
          at: this.timestamp(),
          stage,
          message: `${label} 调用失败，正在自动重试 ${attempt + 1}/${maxAttempts}：${error instanceof Error ? error.message : "unknown error"}`
        });
      }
    }
    throw new ResearchHarnessError(`${label} exhausted all attempts.`, 502);
  }

  private async withHeartbeat<T>(
    stage: ResearchStage,
    message: string,
    operation: () => Promise<T>,
    publicNotes: string[],
    index?: number,
    total?: number,
    task?: ResearchWorkerTask
  ): Promise<T> {
    if (!this.onProgress || this.heartbeatIntervalMs <= 0) return operation();
    const startedAt = Date.now();
    let heartbeatCount = 0;
    const timer = setInterval(() => {
      const publicNote = publicNotes[heartbeatCount % publicNotes.length] ?? "当前工作仍在执行，等待新的可验证中间结果。";
      heartbeatCount += 1;
      this.emit({
        type: "heartbeat",
        at: this.timestamp(),
        stage,
        elapsedMs: Date.now() - startedAt,
        message,
        publicNote,
        index,
        total,
        ...workerMeta(task)
      });
    }, this.heartbeatIntervalMs);
    timer.unref();
    try {
      return await operation();
    } finally {
      clearInterval(timer);
    }
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  private emit(event: Parameters<ProgressListener>[0]): void {
    this.onProgress?.(event);
  }

  private forwardAgentActivity(stage: ResearchStage, index?: number, total?: number, task?: ResearchWorkerTask) {
    return (event: { message: string }) => this.emit({
      type: "agent.activity",
      at: this.timestamp(),
      stage,
      message: event.message,
      index,
      total,
      ...workerMeta(task)
    });
  }
}

function workerMeta(task?: ResearchWorkerTask) {
  return task ? {
    workerId: task.id,
    parentId: "research-root",
    roleId: task.roleId,
    roleName: task.roleName,
    entityIds: task.targetEntities
  } : {};
}

function buildPlanPreview(topic: string): { dimensions: string[]; sourceStrategy: string[] } {
  return {
    dimensions: [`主体与别名（${topic}）`, "时间线与关键事件", "人物/组织/产品关系", "数据与原始出处", "争议与反证"],
    sourceStrategy: ["发现多种表达和相关实体", "优先获取一手材料", "沿引用追到叶节点", "独立来源交叉验证"]
  };
}

function planningPublicNotes(topic: string): string[] {
  return [
    `正在识别“${topic}”涉及的主体、别名、缩写、旧称与多语言表达。`,
    "正在把主题拆成时间线、人物、产品/能力、数据、关系、争议与反证等互补维度。",
    "正在设计一手来源优先的查询路线：官方文件 → 原始数据/访谈 → 独立报道。",
    "正在加入出处追溯要求：重要数字、引语和事件必须下钻到可定位的叶节点。",
    "正在检查查询之间是否重叠，以便后续并发 worker 覆盖不同信息面。"
  ];
}

function researchPublicNotes(query: string, purpose: string): string[] {
  return [
    `当前工作包目标：${purpose}`,
    `正在围绕“${query}”寻找可访问的一手材料及其同义表达。`,
    "正在等待结构化 EvidencePacket；返回后会立即公开发现、来源标题和 URL。",
    "将对转载和同源内容去重，多个转载不会被计算为多个独立证据。",
    "重要线索会继续沿脚注、外链、附件和原始引语向上游追溯。"
  ];
}

function synthesisPublicNotes(sourceCount: number): string[] {
  return [
    `正在对 ${sourceCount} 个独立来源建立 claim-to-source 对应关系。`,
    "正在检查数字、日期、人物表述和直接引语是否有可点击的原始出处。",
    "正在区分支持、反证、尚未证实与来源间冲突，避免把报道强度写高。",
    "正在清理未知引用和重复来源，并组织结论、风险与待验证问题。"
  ];
}

function auditContextForEvidence(evidence: Evidence[], tasks: ResearchWorkerTask[], auditTask: ResearchWorkerTask): string {
  const auditEntities = new Set(auditTask.targetEntities);
  const relevantPacketIndexes = new Set(tasks.flatMap((task, index) =>
    task.targetEntities.some((entity) => auditEntities.has(entity)) ? [index] : []
  ));
  const selected = relevantPacketIndexes.size
    ? evidence.filter((_packet, index) => relevantPacketIndexes.has(index))
    : evidence;
  const index = selected.flatMap((packet) => packet.findings.map((finding) => ({
    workerQuery: packet.query,
    claim: finding.claim,
    url: finding.source.url,
    title: finding.source.title,
    confidence: finding.confidence,
    caveat: finding.caveat
  })));
  const serialized = JSON.stringify(index);
  return serialized.length <= 120_000 ? serialized : `${serialized.slice(0, 120_000)}\n[证据索引因上下文限制截断；优先审计高风险数字、引语、融资和 benchmark]`;
}

export function boundedSynthesisEvidence(evidence: Evidence[], maxCharacters = 120_000): Evidence[] {
  if (evidence.length === 0) return [];
  const findings = evidence.map(() => [] as Evidence["findings"]);
  const gaps = evidence.map((packet) => packet.gaps.slice(0, 3));
  let used = JSON.stringify(evidence.map((packet, index) => ({ query: packet.query, findings: findings[index], gaps: gaps[index] }))).length;
  const maxRounds = Math.max(...evidence.map((packet) => packet.findings.length));
  outer: for (let round = 0; round < maxRounds; round += 1) {
    for (let index = 0; index < evidence.length; index += 1) {
      const finding = evidence[index]!.findings[round];
      if (!finding) continue;
      const cost = JSON.stringify(finding).length + 2;
      if (used + cost > maxCharacters) break outer;
      findings[index]!.push(finding);
      used += cost;
    }
  }
  return evidence.flatMap((packet, index) => findings[index]!.length ? [{ ...packet, findings: findings[index]!, gaps: gaps[index]! }] : []);
}

function sourceRegistry(sources: Source[]): CitationSource[] {
  const unique = new Map<string, Source>();
  for (const source of sources) {
    const canonicalUrl = canonicalizeUrl(source.url);
    if (!unique.has(canonicalUrl)) unique.set(canonicalUrl, { ...source, url: canonicalUrl });
  }
  return [...unique.values()].map((source, index) => ({ ...source, id: `S${index + 1}` }));
}

function validateSynthesisSourceIds(synthesis: Synthesis, sources: CitationSource[]): void {
  const known = new Set(sources.map((source) => source.id));
  const ids = [
    ...synthesis.executiveSummary.flatMap((item) => item.sourceIds),
    ...synthesis.keyFindings.flatMap((item) => item.sourceIds),
    ...synthesis.landscape.flatMap((item) => item.sourceIds),
    ...synthesis.risksAndUncertainties.flatMap((item) => item.sourceIds)
  ];
  const unknown = [...new Set(ids.filter((id) => !known.has(id)))];
  if (unknown.length) {
    throw new AgentOutputError(`Synthesis cited unavailable source IDs: ${unknown.join(", ")}. Allowed IDs: ${[...known].join(", ")}.`);
  }
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

type SettledItem<T, R> =
  | { item: T; status: "fulfilled"; value: R }
  | { item: T; status: "rejected"; error: unknown };

class TaskExecutionError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
    this.name = "TaskExecutionError";
  }
}

async function settledMapWithConcurrency<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>): Promise<Array<SettledItem<T, R>>> {
  const output = new Array<SettledItem<T, R>>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const item = items[index]!;
      try {
        output[index] = { item, status: "fulfilled", value: await operation(item) };
      } catch (error) {
        output[index] = { item, status: "rejected", error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return output;
}

function successfulValues<T, R>(outcomes: Array<SettledItem<T, R>>): R[] {
  return outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
}

function successfulItems<T, R>(outcomes: Array<SettledItem<T, R>>): T[] {
  return outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.item] : []);
}

function failuresFor(outcomes: Array<SettledItem<ResearchWorkerTask, Evidence>>): ResearchTaskFailure[] {
  return outcomes.flatMap((outcome) => {
    if (outcome.status === "fulfilled") return [];
    return [{
      task: outcome.item,
      message: outcome.error instanceof Error ? outcome.error.message : "Unknown evidence worker error",
      attempts: outcome.error instanceof TaskExecutionError ? outcome.error.attempts : 1
    }];
  });
}
