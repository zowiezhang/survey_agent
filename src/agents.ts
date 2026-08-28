import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { ResearchHarnessError } from "./errors.js";
import type { AgentPrompt, AgentResult, AgentRuntimeEvent, ExecutionAgent, Provider } from "./types.js";

export interface OpenAIResponsesAgentOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  client?: ResponsesClient;
}

export interface ResponsesClient {
  responses: {
    create(input: unknown): Promise<unknown>;
  };
}

export class OpenAIResponsesAgent implements ExecutionAgent {
  private readonly client: ResponsesClient;
  private readonly defaultModel: string;

  constructor(options: OpenAIResponsesAgentOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new ResearchHarnessError("OPENAI_API_KEY is required for the openai provider.", 401);
      this.client = new OpenAI({ apiKey, baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL });
    }
    this.defaultModel = options.defaultModel ?? process.env.OPENAI_MODEL ?? "gpt-5.4";
  }

  async complete(input: AgentPrompt): Promise<AgentResult> {
    try {
      input.onRuntimeEvent?.({ type: "session", message: `OpenAI Responses 已接收 ${input.phase} 工作包，等待模型和网页工具返回。` });
      const response = await this.client.responses.create({
        model: input.model ?? this.defaultModel,
        instructions: "Return exactly the requested output. Do not expose private chain-of-thought.",
        input: input.prompt,
        ...(input.phase === "repair" ? {} : {
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"]
        }),
        ...(input.outputSchema ? {
          text: {
            format: {
              type: "json_schema",
              name: `research_${input.phase}`,
              schema: input.outputSchema,
              strict: true
            }
          }
        } : {}),
        store: false
      });
      const text = extractOutputText(response);
      if (!text) throw new ResearchHarnessError(`OpenAI returned no text for ${input.phase}.`, 502);
      input.onRuntimeEvent?.({ type: "output", message: `OpenAI 已返回 ${text.length} 个字符，正在校验结构化结果。` });
      return { text, responseId: responseId(response) };
    } catch (error) {
      if (error instanceof ResearchHarnessError) throw error;
      throw new ResearchHarnessError(`OpenAI ${input.phase} request failed.`, 502, error);
    }
  }
}

export interface CodexRunInput {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  onJsonEvent?: (event: unknown) => void;
}

export type CodexRunner = (input: CodexRunInput) => Promise<void>;

export interface CodexCliAgentOptions {
  command?: string;
  defaultModel?: string;
  tokenEnv?: string;
  runner?: CodexRunner;
}

export class CodexCliAgent implements ExecutionAgent {
  private readonly command: string;
  private readonly defaultModel?: string;
  private readonly tokenEnv?: string;
  private readonly runner: CodexRunner;

  constructor(options: CodexCliAgentOptions = {}) {
    this.command = options.command ?? process.env.CODEX_COMMAND ?? "codex";
    this.defaultModel = options.defaultModel ?? process.env.CODEX_MODEL;
    this.tokenEnv = options.tokenEnv ?? process.env.CODEX_TOKEN_ENV;
    this.runner = options.runner ?? defaultCodexRunner;
  }

  async complete(input: AgentPrompt): Promise<AgentResult> {
    if (this.tokenEnv && !process.env[this.tokenEnv]) {
      throw new ResearchHarnessError(`Codex token environment variable ${this.tokenEnv} is not set.`, 401);
    }
    const tempDirectory = await mkdtemp(join(tmpdir(), "research-harness-codex-"));
    const outputPath = join(tempDirectory, `${input.phase}-${randomUUID()}.txt`);
    const schemaPath = join(tempDirectory, `${input.phase}-${randomUUID()}.schema.json`);
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox", "read-only",
      "--json",
      "--output-last-message", outputPath
    ];
    if (input.outputSchema) {
      await writeFile(schemaPath, JSON.stringify(input.outputSchema), "utf8");
      args.push("--output-schema", schemaPath);
    }
    if (input.model ?? this.defaultModel) args.push("--model", input.model ?? this.defaultModel!);
    args.push(input.prompt);

    let eventFailure: string | undefined;
    try {
      input.onRuntimeEvent?.({ type: "session", message: `正在启动 Codex ${input.phase} 会话。` });
      await this.runner({
        command: this.command,
        args,
        env: process.env,
        onJsonEvent: (event) => {
          eventFailure = codexFailureDiagnostic(event) ?? eventFailure;
          const runtimeEvent = codexRuntimeEvent(event);
          if (runtimeEvent) input.onRuntimeEvent?.(runtimeEvent);
        }
      });
      const text = await readFile(outputPath, "utf8");
      if (!text.trim()) throw new ResearchHarnessError(`Codex returned no final message for ${input.phase}.`, 502);
      return { text };
    } catch (error) {
      if (error instanceof ResearchHarnessError) throw error;
      const detail = error instanceof Error ? sanitizeDiagnostic(error.message) : "unknown Codex CLI error";
      throw new ResearchHarnessError(
        `Codex ${input.phase} run failed: ${eventFailure ? `${eventFailure}; ` : ""}${detail}`,
        502,
        error
      );
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}

export interface ClaudeCodeRunInput {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  onJsonEvent?: (event: unknown) => void;
}

export type ClaudeCodeRunner = (input: ClaudeCodeRunInput) => Promise<void>;

export interface ClaudeCodeAgentOptions {
  command?: string;
  defaultModel?: string;
  tokenEnv?: string;
  maxBudgetUsd?: number;
  runner?: ClaudeCodeRunner;
}

/**
 * Claude Code is a harness adapter, not an Anthropic API wrapper.  It keeps
 * Claude's native Agent/subagent topology while restricting research sessions
 * to web tools and an isolated empty working directory.
 */
export class ClaudeCodeAgent implements ExecutionAgent {
  private readonly command: string;
  private readonly defaultModel?: string;
  private readonly tokenEnv?: string;
  private readonly maxBudgetUsd?: number;
  private readonly runner: ClaudeCodeRunner;

  constructor(options: ClaudeCodeAgentOptions = {}) {
    this.command = options.command ?? process.env.CLAUDE_COMMAND ?? "claude";
    this.defaultModel = options.defaultModel ?? process.env.CLAUDE_MODEL;
    this.tokenEnv = options.tokenEnv ?? process.env.CLAUDE_TOKEN_ENV;
    this.maxBudgetUsd = options.maxBudgetUsd ?? positiveNumber(process.env.CLAUDE_MAX_BUDGET_USD);
    this.runner = options.runner ?? defaultClaudeCodeRunner;
  }

  async complete(input: AgentPrompt): Promise<AgentResult> {
    if (this.tokenEnv && !process.env[this.tokenEnv]) {
      throw new ResearchHarnessError(`Claude token environment variable ${this.tokenEnv} is not set.`, 401);
    }
    const tempDirectory = await mkdtemp(join(tmpdir(), "research-harness-claude-"));
    const nativeSubagents = input.phase === "evidence" && input.allowNativeSubagents === true;
    const tools = input.phase === "repair"
      ? ""
      : nativeSubagents ? "WebSearch,WebFetch,Agent" : "WebSearch,WebFetch";
    const args = [
      "-p", input.prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--safe-mode",
      "--no-session-persistence",
      "--permission-mode", "dontAsk",
      "--tools", tools,
      "--append-system-prompt",
      nativeSubagents
        ? "Use native subagents for independent search or verification branches when useful, run independent branches concurrently, then merge only their sourced findings. Never reveal private chain-of-thought."
        : "Do not reveal private chain-of-thought. Return only the requested structured artifact."
    ];
    if (nativeSubagents) args.push("--forward-subagent-text");
    if (input.outputSchema) args.push("--json-schema", JSON.stringify(input.outputSchema));
    if (input.model ?? this.defaultModel) args.push("--model", input.model ?? this.defaultModel!);
    if (this.maxBudgetUsd) args.push("--max-budget-usd", String(this.maxBudgetUsd));

    let finalText = "";
    let sessionId: string | undefined;
    try {
      input.onRuntimeEvent?.({
        type: "session",
        message: nativeSubagents
          ? "正在启动 Claude Code evidence 会话；已启用受限的原生 subagent 通道。"
          : `正在启动 Claude Code ${input.phase} 会话。`
      });
      await this.runner({
        command: this.command,
        args,
        env: process.env,
        cwd: tempDirectory,
        onJsonEvent: (event) => {
          const result = claudeFinalResult(event);
          if (result?.text) finalText = result.text;
          if (result?.sessionId) sessionId = result.sessionId;
          const runtimeEvent = claudeRuntimeEvent(event);
          if (runtimeEvent) input.onRuntimeEvent?.(runtimeEvent);
        }
      });
      if (!finalText.trim()) throw new ResearchHarnessError(`Claude Code returned no final message for ${input.phase}.`, 502);
      return { text: finalText, responseId: sessionId };
    } catch (error) {
      if (error instanceof ResearchHarnessError) throw error;
      throw new ResearchHarnessError(`Claude Code ${input.phase} run failed.`, 502, error);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}

export function createAgent(provider: Provider, options: {
  openai?: OpenAIResponsesAgentOptions;
  codex?: CodexCliAgentOptions;
  claude?: ClaudeCodeAgentOptions;
} = {}): ExecutionAgent {
  if (provider === "openai") return new OpenAIResponsesAgent(options.openai);
  if (provider === "codex") return new CodexCliAgent(options.codex);
  return new ClaudeCodeAgent(options.claude);
}

async function defaultCodexRunner(input: CodexRunInput): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdoutBuffer = "";
    let stderrTail = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex execution timed out after 20 minutes."));
    }, 20 * 60 * 1000);
    timeout.unref();

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) emitJsonLine(line, input.onJsonEvent);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-4_000);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (stdoutBuffer.trim()) emitJsonLine(stdoutBuffer, input.onJsonEvent);
      if (code === 0) resolve();
      else {
        const diagnostic = sanitizeDiagnostic(stderrTail);
        reject(new Error(`Codex exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}${diagnostic ? `: ${diagnostic}` : ""}.`));
      }
    });
  });
}

async function defaultClaudeCodeRunner(input: ClaudeCodeRunInput): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      env: input.env,
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdoutBuffer = "";
    let stderrTail = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("Claude Code execution timed out after 20 minutes.")));
    }, 20 * 60 * 1000);
    timeout.unref();

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) emitJsonLine(line, input.onJsonEvent);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-4_000);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      finish(() => reject(error));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (stdoutBuffer.trim()) emitJsonLine(stdoutBuffer, input.onJsonEvent);
      finish(() => code === 0
        ? resolve()
        : reject(new Error(`Claude Code exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}${stderrTail ? ": see filtered stderr for details" : ""}.`)));
    });
  });
}

function emitJsonLine(line: string, listener?: (event: unknown) => void): void {
  if (!listener || !line.trim()) return;
  try {
    listener(JSON.parse(line));
  } catch {
    // Codex --json should emit JSONL. Unknown non-JSON diagnostics stay private.
  }
}

function codexRuntimeEvent(value: unknown): AgentRuntimeEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "thread.started") return { type: "session", message: "Codex 会话已启动。" };
  if (type === "turn.started") return { type: "turn", message: "Codex 已开始处理当前工作包。" };
  if (type === "turn.completed") {
    const usage = event.usage && typeof event.usage === "object" ? event.usage as Record<string, unknown> : undefined;
    const total = usage?.total_tokens ?? usage?.totalTokens;
    return { type: "usage", message: total ? `Codex 本轮完成，累计使用 ${String(total)} tokens。` : "Codex 本轮处理完成。" };
  }
  if (type === "turn.failed") return { type: "status", message: "Codex 报告当前工作包失败，正在等待进程返回错误信息。" };
  if (type !== "item.started" && type !== "item.completed" && type !== "item.updated") return undefined;

  const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : undefined;
  const itemType = typeof item?.type === "string" ? item.type : "";
  if (/web_search|mcp_tool|tool_call/i.test(itemType)) {
    const name = typeof item?.name === "string" ? item.name : itemType;
    return { type: "tool", message: `Codex ${type === "item.completed" ? "完成" : "启动"}工具：${name}。` };
  }
  if (/command_execution|file_change/i.test(itemType)) {
    return { type: "tool", message: `Codex ${type === "item.completed" ? "完成" : "启动"}一个受控工具步骤（详情已过滤，避免泄露命令或密钥）。` };
  }
  if (itemType === "reasoning" && type === "item.completed") {
    return { type: "status", message: "Codex 完成一个内部分析步骤；私密思维链不输出。" };
  }
  if (itemType === "agent_message" && type === "item.completed") {
    const text = typeof item?.text === "string" ? item.text : "";
    return { type: "output", message: `Codex 已形成阶段性输出${text ? `（${text.length} 个字符）` : ""}，正在读取并校验。` };
  }
  return undefined;
}

function codexFailureDiagnostic(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  if (event.type !== "turn.failed") return undefined;
  const error = event.error;
  if (typeof error === "string") return sanitizeDiagnostic(error);
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.code;
    if (typeof message === "string") return sanitizeDiagnostic(message);
  }
  const message = event.message;
  return typeof message === "string" ? sanitizeDiagnostic(message) : undefined;
}

function claudeFinalResult(value: unknown): { text: string; sessionId?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  if (event.type !== "result" || event.subtype !== "success") return undefined;
  const sessionId = typeof event.session_id === "string" ? event.session_id : undefined;
  if (event.structured_output !== undefined) {
    return { text: JSON.stringify(event.structured_output), sessionId };
  }
  return typeof event.result === "string" ? { text: event.result, sessionId } : undefined;
}

function claudeRuntimeEvent(value: unknown): AgentRuntimeEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "system" && event.subtype === "init") return { type: "session", message: "Claude Code 会话已启动。" };
  if (type === "system" && event.subtype === "api_retry") return { type: "status", message: "Claude Code 遇到可重试 API 错误，正在重试。" };
  if (type === "result") {
    if (event.subtype !== "success") return { type: "status", message: "Claude Code 报告当前工作包失败。" };
    const cost = typeof event.total_cost_usd === "number" ? `，费用 $${event.total_cost_usd.toFixed(4)}` : "";
    const stats = event.subagent_stats && typeof event.subagent_stats === "object"
      ? event.subagent_stats as Record<string, unknown>
      : undefined;
    const completed = typeof stats?.completed === "number" ? `，${stats.completed} 个 subagent 完成` : "";
    return { type: "usage", message: `Claude Code 本轮处理完成${completed}${cost}。` };
  }
  if (type !== "assistant") return undefined;

  const parentToolUseId = typeof event.parent_tool_use_id === "string" ? event.parent_tool_use_id : undefined;
  const message = event.message && typeof event.message === "object" ? event.message as Record<string, unknown> : undefined;
  const content = Array.isArray(message?.content) ? message.content : [];
  for (const rawPart of content) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    if (part.type === "thinking") continue;
    if (part.type === "tool_use") {
      const name = typeof part.name === "string" ? part.name : "tool";
      if (name === "Agent") return { type: "status", message: "Claude Code 已派生一个原生 subagent 工作包。" };
      if (name === "StructuredOutput") return { type: "output", message: "Claude Code 已形成结构化阶段输出，正在校验。" };
      return { type: "tool", message: `Claude Code 启动工具：${name}。` };
    }
    if (part.type === "text" && typeof part.text === "string") {
      return {
        type: "output",
        message: parentToolUseId
          ? `Claude Code subagent 已形成 ${part.text.length} 个字符的阶段摘要，正在交回主 agent。`
          : `Claude Code 已形成 ${part.text.length} 个字符的阶段输出，正在读取并校验。`
      };
    }
  }
  return undefined;
}

function positiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/(?:sk|pk|Bearer)[-_ A-Za-z0-9.]{12,}/gi, "[REDACTED]")
    .replace(/(api[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-1_500);
}

function extractOutputText(response: unknown): string {
  const candidate = response as { output_text?: unknown; output?: unknown[] };
  if (typeof candidate.output_text === "string") return candidate.output_text;
  const parts: string[] = [];
  for (const item of candidate.output ?? []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    for (const part of content ?? []) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        parts.push((part as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
}

function responseId(response: unknown): string | undefined {
  const id = response && typeof response === "object" ? (response as { id?: unknown }).id : undefined;
  return typeof id === "string" ? id : undefined;
}
