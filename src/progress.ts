import type { Source } from "./types.js";

export type ResearchStage = "planning" | "researching" | "synthesizing";

export interface WorkerProgressMeta {
  workerId?: string;
  parentId?: string;
  roleId?: string;
  roleName?: string;
  entityIds?: string[];
}

export type ResearchProgressEvent =
  | { type: "run.started"; at: string; topic: string; queryCount: number; harness: string; subworkMode: string; concurrency: number }
  | { type: "seed.loaded"; at: string; path: string; companyCount: number; fundingCount: number; statementCount: number; date?: string }
  | { type: "plan.started"; at: string }
  | { type: "plan.preview"; at: string; topic: string; dimensions: string[]; sourceStrategy: string[] }
  | { type: "plan.completed"; at: string; scope: string; questions: string[]; queries: Array<{ query: string; purpose: string }> }
  | ({ type: "task.graph.ready"; at: string; workers: Array<{ workerId: string; roleId: string; roleName: string; entityCount: number; purpose: string }> } & WorkerProgressMeta)
  | ({ type: "query.started"; at: string; index: number; total: number; query: string; purpose: string } & WorkerProgressMeta)
  | ({ type: "query.retrying"; at: string; index: number; total: number; query: string; attempt: number; maxAttempts: number; message: string } & WorkerProgressMeta)
  | ({ type: "query.failed"; at: string; index: number; total: number; query: string; durationMs: number; attempts: number; message: string } & WorkerProgressMeta)
  | ({ type: "query.completed"; at: string; index: number; total: number; query: string; durationMs: number; claims: string[]; sources: Source[] } & WorkerProgressMeta)
  | { type: "synthesis.started"; at: string; sourceCount: number; findingCount: number }
  | { type: "synthesis.completed"; at: string; durationMs: number }
  | { type: "output.repair.started"; at: string; stage: ResearchStage; phase: string; validationError: string }
  | { type: "output.repair.completed"; at: string; stage: ResearchStage; phase: string }
  | ({ type: "agent.activity"; at: string; stage: ResearchStage; message: string; index?: number; total?: number } & WorkerProgressMeta)
  | ({ type: "heartbeat"; at: string; stage: ResearchStage; elapsedMs: number; message: string; publicNote: string; index?: number; total?: number } & WorkerProgressMeta)
  | { type: "run.completed"; at: string; durationMs: number; sourceCount: number; queryCount: number; failedCount: number }
  | { type: "run.failed"; at: string; durationMs: number; message: string };

export type ProgressListener = (event: ResearchProgressEvent) => void;

export interface CliProgressReporterOptions {
  format?: "human" | "json";
  write?: (line: string) => void;
}

export function createCliProgressReporter(options: CliProgressReporterOptions = {}): ProgressListener {
  const format = options.format ?? "human";
  const write = options.write ?? ((line) => process.stderr.write(`${line}\n`));
  let completedQueries = 0;

  return (event) => {
    if (format === "json") {
      write(JSON.stringify(event));
      return;
    }

    const time = new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false });
    const prefix = `[${time}]`;
    switch (event.type) {
      case "run.started":
        write(`${prefix} 开始调研：${event.topic}（工作包上限 ${event.queryCount}）`);
        write(`  调度：harness=${event.harness} · subwork=${event.subworkMode} · 外层并发=${event.concurrency}`);
        break;
      case "seed.loaded":
        write(`${prefix} [基线已导入] ${event.companyCount} 家公司 · ${event.fundingCount} 条融资 · ${event.statementCount} 条观点`);
        write(`  文件：${event.path}${event.date ? ` · 数据日期 ${event.date}` : ""}`);
        break;
      case "plan.started":
        write(`${prefix} [规划] 正在拆解问题与搜索范围…`);
        break;
      case "plan.preview":
        write(`${prefix} [预规划] 已建立第一版研究骨架（等待 planner 深化）`);
        write(`  初始维度：${event.dimensions.join("、")}`);
        write(`  来源策略：${event.sourceStrategy.join(" → ")}`);
        break;
      case "plan.completed":
        write(`${prefix} [规划完成] ${event.scope}`);
        event.queries.forEach((item, index) => write(`  ${index + 1}. ${item.query} — ${item.purpose}`));
        break;
      case "task.graph.ready":
        write(`${prefix} [任务图] 已生成 ${event.workers.length} 个角色化 subagent 工作包`);
        event.workers.forEach((worker) => write(`  ${worker.workerId} · ${worker.roleName} · ${worker.entityCount} 个实体 · ${worker.purpose}`));
        break;
      case "query.started":
        write(`${prefix} ${workerLabel(event)}[检索 ${event.index}/${event.total}] 已启动：${event.query}`);
        break;
      case "query.retrying":
        write(`${prefix} ${workerLabel(event)}[自动重试 ${event.attempt}/${event.maxAttempts}] ${event.message}`);
        break;
      case "query.failed":
        completedQueries += 1;
        write(`${prefix} ${progressBar(completedQueries, event.total)} ${workerLabel(event)}[工作包失败，已隔离] 尝试 ${event.attempts} 次 · ${formatDuration(event.durationMs)}`);
        write(`  错误：${event.message}`);
        write("  其余 subagent 会继续执行；最终报告将明确列出此证据缺口。");
        break;
      case "query.completed": {
        completedQueries += 1;
        write(`${prefix} ${progressBar(completedQueries, event.total)} ${workerLabel(event)}[检索完成 ${event.index}/${event.total}] ${formatDuration(event.durationMs)} · ${event.sources.length} 个来源`);
        event.claims.slice(0, 2).forEach((claim) => write(`  发现：${claim}`));
        uniqueSources(event.sources).slice(0, 4).forEach((source) => write(`  来源：${source.title} — ${source.url}`));
        break;
      }
      case "synthesis.started":
        write(`${prefix} [综合] 正在用 ${event.sourceCount} 个独立来源、${event.findingCount} 条证据生成报告…`);
        break;
      case "synthesis.completed":
        write(`${prefix} [综合完成] ${formatDuration(event.durationMs)}`);
        break;
      case "output.repair.started":
        write(`${prefix} [结构修复] ${event.phase} 输出未通过校验；只修复 JSON，不重复搜索。`);
        write(`  校验摘要：${event.validationError}`);
        break;
      case "output.repair.completed":
        write(`${prefix} [结构修复完成] ${event.phase} 输出已通过 JSON Schema 校验。`);
        break;
      case "agent.activity":
        write(`${prefix} ${workerLabel(event)}[Agent 活动] ${event.message}`);
        break;
      case "heartbeat":
        write(`${prefix} ${workerLabel(event)}[仍在运行] ${stageLabel(event.stage)} · 已耗时 ${formatDuration(event.elapsedMs)} · ${event.message}`);
        write(`  公开工作笔记：${event.publicNote}`);
        break;
      case "run.completed":
        write(`${prefix} ${progressBar(event.queryCount, event.queryCount)} 调研完成 · ${event.sourceCount} 个独立来源 · ${event.failedCount} 个隔离失败 · 总耗时 ${formatDuration(event.durationMs)}`);
        break;
      case "run.failed":
        write(`${prefix} [失败] ${event.message} · ${formatDuration(event.durationMs)}`);
        break;
    }
  };
}

function workerLabel(event: WorkerProgressMeta): string {
  return event.workerId ? `[${event.roleName ?? event.roleId ?? "worker"} · ${event.workerId}] ` : "";
}

function progressBar(completed: number, total: number): string {
  const width = 10;
  const filled = Math.round((Math.min(completed, total) / Math.max(1, total)) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${completed}/${total}`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function stageLabel(stage: ResearchStage): string {
  if (stage === "planning") return "规划中";
  if (stage === "researching") return "检索中";
  return "综合中";
}

function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}
