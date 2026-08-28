import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createResearchApp } from "../src/http.js";
import type { Provider } from "../src/types.js";
import { ScriptedResearchAgent } from "./fake-agent.js";

test("HTTP API rejects missing bearer token and returns a report to an authenticated client", async (context) => {
  let selectedProvider: Provider | undefined;
  const app = createResearchApp({
    apiToken: "test-secret",
    agentFactory: (provider) => {
      selectedProvider = provider;
      return new ScriptedResearchAgent();
    }
  });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const dashboard = await fetch(`${url}/ui`);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /SUBAGENT 任务矩阵/);

  const unauthenticated = await fetch(`${url}/healthz`);
  assert.equal(unauthenticated.status, 401);

  const response = await fetch(`${url}/v1/research`, {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ topic: "Example Research", harness: "cc", subworkMode: "hybrid", concurrency: 2, maxQueries: 2 })
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { provider: string; markdown: string; html: string; tasks: unknown[]; sources: unknown[]; queryCount: number };
  assert.equal(selectedProvider, "claude");
  assert.equal(body.provider, "claude");
  assert.equal(body.queryCount, 2);
  assert.equal(body.sources.length, 3);
  assert.equal(body.tasks.length, 2);
  assert.match(body.html, /证据账本/);
  assert.match(body.markdown, /## 来源/);
});

test("HTTP API rejects provider tokens in request bodies instead of accepting secrets", async (context) => {
  const app = createResearchApp({ apiToken: "test-secret", agentFactory: () => new ScriptedResearchAgent() });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/research`, {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ topic: "Example Research", apiKey: "must-not-be-accepted" })
  });
  assert.equal(response.status, 400);
});

test("streaming HTTP API emits progress before the final report", async (context) => {
  const app = createResearchApp({ apiToken: "test-secret", agentFactory: () => new ScriptedResearchAgent() });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/research/stream`, {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ topic: "Example Research", provider: "openai", maxQueries: 2 })
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const stream = await response.text();
  const firstProgress = stream.indexOf("event: progress");
  const result = stream.indexOf("event: result");
  assert.ok(firstProgress >= 0);
  assert.ok(result > firstProgress);
  assert.match(stream, /"type":"run.started"/);
  assert.match(stream, /"type":"query.completed"/);
  assert.match(stream, /# 调研报告:/);
});
