#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { createAgent } from "./agents.js";
import { createResearchApp } from "./http.js";
import { createCliProgressReporter } from "./progress.js";
import { ResearchWorkflow } from "./workflow.js";
import type { Provider, ResearchRequest } from "./types.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("research-harness")
    .description("Evidence-first web research with OpenAI Responses, Codex CLI, or Claude Code")
    .version("0.1.0");

  program.command("research <topic>")
    .description("Research a topic with role-based subagents and save cited Markdown + interactive HTML")
    .option("--harness <harness>", "openai, codex, claude, or cc")
    .option("-p, --provider <provider>", "deprecated alias for --harness", "openai")
    .option("-m, --model <model>", "model passed to the selected provider")
    .option("-b, --brief <brief>", "research angle, audience, or question")
    .option("-d, --depth <depth>", "quick, standard, or deep", "standard")
    .option("-l, --language <language>", "report language", "zh-CN")
    .option("--max-queries <count>", "number of complementary research queries", parseInteger)
    .option("--max-agents <count>", "hard cap for role-based work packets (defaults: quick 12, standard 32, deep 64; max 256)", parseInteger)
    .option("--entities-per-agent <count>", "maximum baseline entities assigned to one worker", parseInteger)
    .option("--max-sources <count>", "maximum findings per query (defaults: quick 6, standard 12, deep 20)", parseInteger)
    .option("--seed <path>", "local HTML/JSON baseline to parse into entity shards")
    .option("--subwork <mode>", "delegated, native, or hybrid", "hybrid")
    .option("--concurrency <count>", "maximum scheduler-level concurrent work packets", parseInteger, 3)
    .option("--include-domain <domains...>", "prioritize these domains")
    .option("--exclude-domain <domains...>", "exclude these domains")
    .option("-o, --out <path>", "Markdown output path")
    .option("--html-out <path>", "interactive standalone HTML output path (defaults beside Markdown)")
    .option("--no-html", "do not write the interactive HTML report")
    .option("--print-json", "also print a compact JSON manifest")
    .option("--log-format <format>", "progress log format: human or json", "human")
    .option("--heartbeat <seconds>", "seconds between still-running messages", parsePositiveNumber, 5)
    .action(async (topic: string, options: Record<string, unknown>) => {
      const provider = parseProvider(options.harness ?? options.provider);
      const subworkMode = parseSubworkMode(options.subwork);
      const concurrency = numberOption(options.concurrency) ?? 3;
      const depth = stringOption(options.depth) as ResearchRequest["depth"];
      const request: ResearchRequest = {
        topic,
        provider,
        model: stringOption(options.model),
        brief: stringOption(options.brief),
        depth,
        language: stringOption(options.language) ?? "zh-CN",
        maxQueries: numberOption(options.maxQueries),
        maxAgents: numberOption(options.maxAgents) ?? defaultMaxAgents(depth),
        entitiesPerAgent: numberOption(options.entitiesPerAgent) ?? defaultEntitiesPerAgent(depth),
        maxSources: numberOption(options.maxSources) ?? defaultMaxSources(depth),
        seedPath: stringOption(options.seed),
        subworkMode,
        concurrency,
        includeDomains: stringArray(options.includeDomain),
        excludeDomains: stringArray(options.excludeDomain)
      };
      const logFormat = options.logFormat === "json" ? "json" : "human";
      const heartbeatSeconds = numberOption(options.heartbeat) ?? 5;
      const result = await new ResearchWorkflow(createAgent(provider), {
        concurrency,
        onProgress: createCliProgressReporter({ format: logFormat }),
        heartbeatIntervalMs: heartbeatSeconds * 1_000,
        allowLocalSeedPaths: true
      }).run(request);
      const outputPath = resolve(stringOption(options.out) ?? defaultOutputPath(topic));
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, result.markdown, "utf8");
      console.log(`Research report saved: ${outputPath}`);
      let htmlPath: string | undefined;
      if (options.html !== false) {
        htmlPath = resolve(stringOption(options.htmlOut) ?? replaceExtension(outputPath, ".html"));
        await mkdir(dirname(htmlPath), { recursive: true });
        await writeFile(htmlPath, result.html, "utf8");
        console.log(`Interactive report saved: ${htmlPath}`);
      }
      console.log(`Sources: ${result.sources.length}; workers: ${result.tasks.length}; planner queries: ${result.plan.queries.length}`);
      if (options.printJson) {
        console.log(JSON.stringify({ id: result.id, createdAt: result.createdAt, sources: result.sources, workers: result.tasks, outputPath, htmlPath }, null, 2));
      }
    });

  program.command("serve")
    .description("Serve POST /v1/research with Bearer-token authentication")
    .option("--host <host>", "host to bind", "127.0.0.1")
    .option("--port <port>", "port to bind", parseInteger, 8787)
    .option("--allow-local-seeds", "allow authenticated API clients to reference server-local seed files")
    .action((options: Record<string, unknown>) => {
      const token = process.env.RESEARCH_HARNESS_API_TOKEN;
      if (!token) throw new Error("RESEARCH_HARNESS_API_TOKEN must be set before starting the service.");
      const app = createResearchApp({ apiToken: token, allowLocalSeedPaths: options.allowLocalSeeds === true });
      const host = stringOption(options.host) ?? "127.0.0.1";
      const port = numberOption(options.port) ?? 8787;
      app.listen(port, host, () => {
        console.log(`Research API listening on http://${host}:${port}`);
        console.log(`Live subagent dashboard: http://${host}:${port}/ui`);
      });
    });

  return program;
}

function parseProvider(value: unknown): Provider {
  if (value === "openai" || value === "codex" || value === "claude") return value;
  if (value === "cc") return "claude";
  throw new Error("--harness must be openai, codex, claude, or cc");
}

function parseSubworkMode(value: unknown): ResearchRequest["subworkMode"] {
  if (value === "delegated" || value === "native" || value === "hybrid") return value;
  throw new Error("--subwork must be delegated, native, or hybrid");
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Expected integer, got ${value}`);
  return parsed;
}

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected a positive number, got ${value}`);
  return parsed;
}

function defaultMaxSources(depth: ResearchRequest["depth"]): number {
  return depth === "quick" ? 6 : depth === "deep" ? 20 : 12;
}

function defaultMaxAgents(depth: ResearchRequest["depth"]): number {
  return depth === "quick" ? 12 : depth === "deep" ? 64 : 32;
}

function defaultEntitiesPerAgent(depth: ResearchRequest["depth"]): number {
  return depth === "quick" ? 25 : depth === "deep" ? 12 : 18;
}

function replaceExtension(path: string, extension: string): string {
  const current = extname(path);
  return current ? `${path.slice(0, -current.length)}${extension}` : `${path}${extension}`;
}

function defaultOutputPath(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "research";
  return `reports/${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberOption(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildProgram().parseAsync().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
