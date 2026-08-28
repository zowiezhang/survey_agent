import assert from "node:assert/strict";
import test from "node:test";
import { boundedSynthesisEvidence, ResearchWorkflow } from "../src/workflow.js";
import { InvalidCitationAgent, ScriptedResearchAgent } from "./fake-agent.js";

test("workflow produces a cited, structured report and removes tracking parameters", async () => {
  const workflow = new ResearchWorkflow(new ScriptedResearchAgent(), {
    now: () => new Date("2026-08-25T00:00:00.000Z"),
    concurrency: 1
  });
  const result = await workflow.run({ topic: "Example Research", provider: "openai", maxQueries: 2 });

  assert.equal(result.plan.queries.length, 2);
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources[0]?.url, "https://example.com/product");
  assert.match(result.markdown, /^# 调研报告:/m);
  assert.match(result.markdown, /## 结论摘要/);
  assert.match(result.markdown, /## 风险、不确定性与反证/);
  assert.match(result.markdown, /## 证据账本（逐叶节点）/);
  assert.match(result.markdown, /\[S1\]\(https:\/\/example\.com\/product\)/);
  assert.match(result.markdown, /\[S3\]\(https:\/\/standards\.example\.org\/provenance\)/);
  assert.match(result.markdown, /The company documentation emphasizes traceable citations/);
  assert.match(result.markdown, /置信度: 90%/);
  assert.doesNotMatch(result.markdown, /utm_source/);
});

test("workflow repairs a synthesis that cites a source not in the evidence registry", async () => {
  const workflow = new ResearchWorkflow(new InvalidCitationAgent(), { concurrency: 1 });
  const result = await workflow.run({ topic: "Example Research", provider: "openai", maxQueries: 2 });
  assert.doesNotMatch(result.markdown, /S99/);
  assert.match(result.markdown, /\[S3\]/);
});

test("large evidence sets are round-robin bounded for synthesis without changing the ledger", () => {
  const evidence = Array.from({ length: 4 }, (_, packetIndex) => ({
    query: `packet ${packetIndex}`,
    findings: Array.from({ length: 8 }, (_, findingIndex) => ({
      claim: `Packet ${packetIndex} finding ${findingIndex} ${"x".repeat(350)}`,
      source: { title: `Source ${packetIndex}-${findingIndex}`, url: `https://example.org/${packetIndex}/${findingIndex}` },
      confidence: .8
    })),
    gaps: []
  }));

  const bounded = boundedSynthesisEvidence(evidence, 4_000);
  assert.equal(bounded.length, 4);
  assert.ok(bounded.every((packet) => packet.findings.length >= 1));
  assert.ok(bounded.reduce((sum, packet) => sum + packet.findings.length, 0) < 32);
  assert.equal(evidence.reduce((sum, packet) => sum + packet.findings.length, 0), 32);
});
