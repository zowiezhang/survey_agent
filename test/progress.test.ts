import assert from "node:assert/strict";
import test from "node:test";
import { createCliProgressReporter, type ResearchProgressEvent } from "../src/progress.js";
import type { AgentPrompt, AgentResult, ExecutionAgent } from "../src/types.js";
import { ResearchWorkflow } from "../src/workflow.js";
import { ScriptedResearchAgent } from "./fake-agent.js";

class RepairingPlanAgent extends ScriptedResearchAgent {
  repairCalls = 0;

  override async complete(input: AgentPrompt): Promise<AgentResult> {
    if (input.phase === "plan") {
      return { text: JSON.stringify({ scope: "wrong fields need deterministic repair", questions: [], queries: [] }) };
    }
    if (input.phase === "repair") {
      this.repairCalls += 1;
      return {
        text: JSON.stringify({
          scope: "Map the product, market position, and material uncertainty from accessible sources.",
          researchQuestions: [
            "What is the product's stated purpose and capability?",
            "What evidence describes the surrounding market and risks?"
          ],
          queries: [
            { query: "Example Research product official capability", purpose: "Find primary product information" },
            { query: "Example Research market independent analysis", purpose: "Find independent corroboration" }
          ],
          recencyNeeds: "Use the newest available information and distinguish dated announcements."
        })
      };
    }
    return super.complete(input);
  }
}

class SlowAgent implements ExecutionAgent {
  private readonly delegate = new ScriptedResearchAgent();

  async complete(input: AgentPrompt): Promise<AgentResult> {
    await new Promise((resolve) => setTimeout(resolve, 12));
    return this.delegate.complete(input);
  }
}

class FlakyPlanningAgent extends ScriptedResearchAgent {
  planCalls = 0;

  override async complete(input: AgentPrompt): Promise<AgentResult> {
    if (input.phase === "plan") {
      this.planCalls += 1;
      if (this.planCalls === 1) throw new Error("temporary planner transport failure");
    }
    return super.complete(input);
  }
}

class PartiallyFailingAgent implements ExecutionAgent {
  private evidenceCalls = 0;

  async complete(input: AgentPrompt): Promise<AgentResult> {
    if (input.phase === "plan") return { text: JSON.stringify({
      scope: "Test isolated worker failures without discarding successful evidence packets.",
      researchQuestions: ["Which worker fails?", "Does the remaining evidence survive?"],
      queries: [
        { query: "broken evidence route", purpose: "Exercise retry and isolation" },
        { query: "working evidence route", purpose: "Return enough valid leaf sources" }
      ],
      recencyNeeds: "No special recency requirement for this deterministic test."
    }) };
    if (input.phase === "evidence") {
      this.evidenceCalls += 1;
      if (this.evidenceCalls <= 2) throw new Error("simulated worker transport failure");
      return { text: JSON.stringify({
        query: "working evidence route",
        findings: [
          { claim: "The surviving packet contains a first independently addressable source.", source: { title: "Primary", url: "https://primary.example.org/item" }, confidence: .9 },
          { claim: "The surviving packet contains a second independently addressable source.", source: { title: "Independent", url: "https://independent.example.net/item" }, confidence: .8 }
        ],
        gaps: []
      }) };
    }
    return { text: JSON.stringify({
      title: "Partial worker failure test",
      executiveSummary: [
        { claim: "Successful evidence remains available after another worker fails.", sourceIds: ["S1"] },
        { claim: "The report retains two distinct leaf sources for auditability.", sourceIds: ["S1", "S2"] }
      ],
      keyFindings: [
        { heading: "Isolation", analysis: "The failed work packet is isolated while the successful packet proceeds into synthesis.", sourceIds: ["S1"] },
        { heading: "Evidence", analysis: "Two distinct sources satisfy the minimum evidence threshold for generating a partial report.", sourceIds: ["S1", "S2"] }
      ],
      landscape: [{ entity: "Surviving worker", relevance: "It preserves usable evidence despite a peer worker failure.", sourceIds: ["S1"] }],
      risksAndUncertainties: [{ claim: "The failed work packet remains an explicit coverage gap in this report.", sourceIds: ["S2"] }],
      furtherResearch: ["Retry the isolated work packet in a later run."]
    }) };
  }
}

test("workflow continuously emits stage, heartbeat, intermediate evidence, and completion events", async () => {
  const events: ResearchProgressEvent[] = [];
  const workflow = new ResearchWorkflow(new SlowAgent(), {
    concurrency: 1,
    heartbeatIntervalMs: 2,
    onProgress: (event) => events.push(event)
  });

  await workflow.run({ topic: "Example Research", provider: "openai", maxQueries: 2 });

  assert.equal(events[0]?.type, "run.started");
  assert.ok(events.some((event) => event.type === "plan.completed"));
  assert.ok(events.some((event) => event.type === "heartbeat" && event.stage === "planning"));
  assert.equal(events.filter((event) => event.type === "query.started").length, 2);
  assert.equal(events.filter((event) => event.type === "query.completed").length, 2);
  assert.ok(events.some((event) => event.type === "query.completed" && event.claims.length > 0 && event.sources.length > 0));
  assert.ok(events.some((event) => event.type === "heartbeat" && event.stage === "researching"));
  assert.ok(events.some((event) => event.type === "heartbeat" && event.stage === "synthesizing"));
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("human progress reporter makes liveness and intermediate findings visible", () => {
  const lines: string[] = [];
  const report = createCliProgressReporter({ write: (line) => lines.push(line) });

  report({
    type: "heartbeat",
    at: "2026-08-25T10:00:05.000Z",
    stage: "researching",
    elapsedMs: 5_000,
    message: "检索 1/2：example",
    publicNote: "正在寻找一手来源。"
  });
  report({
    type: "query.completed",
    at: "2026-08-25T10:00:06.000Z",
    index: 1,
    total: 2,
    query: "example",
    durationMs: 6_000,
    claims: ["A newly gathered fact with evidence."],
    sources: [{ title: "Primary source", url: "https://example.com/source" }]
  });

  assert.ok(lines.some((line) => line.includes("仍在运行")));
  assert.ok(lines.some((line) => line.includes("公开工作笔记：正在寻找一手来源")));
  assert.ok(lines.some((line) => line.includes("发现：A newly gathered fact")));
  assert.ok(lines.some((line) => line.includes("https://example.com/source")));
  assert.ok(lines.some((line) => line.includes("1/2")));
});

test("workflow repairs a structurally invalid plan without repeating research", async () => {
  const events: ResearchProgressEvent[] = [];
  const agent = new RepairingPlanAgent();
  const workflow = new ResearchWorkflow(agent, {
    concurrency: 1,
    onProgress: (event) => events.push(event)
  });

  const result = await workflow.run({ topic: "Example Research", provider: "openai", maxQueries: 2 });
  assert.equal(result.plan.queries.length, 2);
  assert.equal(agent.repairCalls, 1);
  assert.ok(events.some((event) => event.type === "output.repair.started"));
  assert.ok(events.some((event) => event.type === "output.repair.completed"));
  assert.equal(events.filter((event) => event.type === "query.completed").length, 2);
});

test("one evidence worker is retried and isolated without killing successful work", async () => {
  const events: ResearchProgressEvent[] = [];
  const workflow = new ResearchWorkflow(new PartiallyFailingAgent(), {
    concurrency: 1,
    onProgress: (event) => events.push(event)
  });

  const result = await workflow.run({ topic: "Partial failure research", provider: "openai", maxQueries: 2 });
  assert.equal(result.failedTasks.length, 1);
  assert.equal(result.failedTasks[0]?.attempts, 2);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidenceTasks.length, 1);
  assert.equal(result.sources.length, 2);
  assert.match(result.markdown, /未完成的 Subagent 工作包/);
  assert.ok(events.some((event) => event.type === "query.retrying"));
  assert.ok(events.some((event) => event.type === "query.failed"));
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("temporary planner execution errors are retried without losing the run", async () => {
  const events: ResearchProgressEvent[] = [];
  const agent = new FlakyPlanningAgent();
  const workflow = new ResearchWorkflow(agent, { concurrency: 1, onProgress: (event) => events.push(event) });

  const result = await workflow.run({ topic: "Planner retry research", provider: "openai", maxQueries: 2 });
  assert.equal(agent.planCalls, 2);
  assert.equal(result.sources.length, 3);
  assert.ok(events.some((event) => event.type === "agent.activity" && event.message.includes("自动重试")));
});
