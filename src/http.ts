import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { createAgent } from "./agents.js";
import { ResearchHarnessError } from "./errors.js";
import { ResearchWorkflow, type ResearchWorkflowOptions } from "./workflow.js";
import { ProviderSchema, type ExecutionAgent, type Provider } from "./types.js";
import { renderDashboardHtml } from "./dashboard.js";

export interface ResearchAppOptions {
  apiToken: string;
  agentFactory?: (provider: Provider) => ExecutionAgent;
  workflowFactory?: (agent: ExecutionAgent, options?: ResearchWorkflowOptions) => ResearchWorkflow;
  allowLocalSeedPaths?: boolean;
}

export function createResearchApp(options: ResearchAppOptions) {
  if (!options.apiToken.trim()) throw new ResearchHarnessError("A non-empty API token is required to start the HTTP service.", 500);
  const app = express();
  const agentFactory = options.agentFactory ?? ((provider) => createAgent(provider));
  const workflowFactory = options.workflowFactory ?? ((agent, workflowOptions) => new ResearchWorkflow(agent, workflowOptions));

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb", type: "application/json" }));
  app.get(["/", "/ui"], (_request, response) => {
    response.type("html").send(renderDashboardHtml());
  });
  app.use((request, response, next) => requireBearerToken(request, response, next, options.apiToken));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.post("/v1/research", async (request, response, next) => {
    try {
      const provider = requestedProvider(request.body);
      const agent = agentFactory(provider);
      const concurrency = requestedConcurrency(request.body);
      const result = await workflowFactory(agent, { concurrency, allowLocalSeedPaths: options.allowLocalSeedPaths }).run(normalizeResearchBody(request.body, provider));
      response.status(200).json({
        id: result.id,
        createdAt: result.createdAt,
        provider: result.request.provider,
        topic: result.request.topic,
        markdown: result.markdown,
        html: result.html,
        tasks: result.tasks,
        evidenceTasks: result.evidenceTasks,
        failedTasks: result.failedTasks,
        sources: result.sources,
        queryCount: result.tasks.length
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/research/stream", async (request, response) => {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const send = (event: string, data: unknown) => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const provider = requestedProvider(request.body);
      const agent = agentFactory(provider);
      send("connected", { ok: true, provider });
      const concurrency = requestedConcurrency(request.body);
      const result = await workflowFactory(agent, { concurrency, allowLocalSeedPaths: options.allowLocalSeedPaths, onProgress: (event) => send("progress", event) })
        .run(normalizeResearchBody(request.body, provider));
      send("result", {
        id: result.id,
        createdAt: result.createdAt,
        provider: result.request.provider,
        topic: result.request.topic,
        markdown: result.markdown,
        html: result.html,
        tasks: result.tasks,
        evidenceTasks: result.evidenceTasks,
        failedTasks: result.failedTasks,
        sources: result.sources,
        queryCount: result.tasks.length
      });
    } catch (error) {
      const statusCode = error instanceof ResearchHarnessError ? error.statusCode : error instanceof ZodError ? 400 : 500;
      send("error", {
        statusCode,
        message: error instanceof Error ? error.message : "Internal server error"
      });
    } finally {
      response.end();
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request", details: error.flatten() });
      return;
    }
    if (error instanceof ResearchHarnessError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}

function requestedProvider(body: unknown): Provider {
  const value = body && typeof body === "object"
    ? ((body as Record<string, unknown>).harness ?? (body as Record<string, unknown>).provider)
    : undefined;
  return ProviderSchema.optional().parse(value) ?? "openai";
}

function requestedConcurrency(body: unknown): number {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).concurrency : undefined;
  if (value === undefined) return 3;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 16) {
    throw new ResearchHarnessError("concurrency must be an integer between 1 and 16.", 400);
  }
  return value;
}

function normalizeResearchBody(body: unknown, provider: Provider): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { harness: _harness, ...rest } = body as Record<string, unknown>;
  return { ...rest, provider };
}

function requireBearerToken(request: Request, response: Response, next: NextFunction, expectedToken: string): void {
  const authorization = request.header("authorization");
  const actualToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  if (!actualToken || !timingSafeEqual(actualToken, expectedToken)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
