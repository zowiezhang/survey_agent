import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchTaskGraph } from "../src/task-graph.js";
import { ResearchRequestSchema, type ResearchPlan } from "../src/types.js";

const plan: ResearchPlan = {
  scope: "Map companies and claims with direct evidence and explicit uncertainty.",
  researchQuestions: ["Which entities qualify for inclusion?", "Which claims have primary evidence?"],
  queries: [
    { query: "self evolving AI startup", purpose: "discover entities" },
    { query: "continuous learning agent funding", purpose: "verify progress" }
  ],
  recencyNeeds: "Prefer current records and preserve event dates."
};

test("deep task graph creates traceable role workers and disjoint seed shards", () => {
  const request = ResearchRequestSchema.parse({ topic: "中国自进化 AI", depth: "deep", maxQueries: 2, maxAgents: 16 });
  const tasks = buildResearchTaskGraph({
    request,
    plan,
    seed: {
      path: "/tmp/reference.html",
      date: "2026-08-25",
      stats: {},
      rawCompanyCount: 4,
      rawFundingCount: 2,
      rawStatementCount: 1,
      entities: ["甲", "乙", "丙", "丁"].map((name, index) => ({
        id: `CN-${index}`,
        name,
        aliases: [],
        region: "中国",
        founders: [],
        fundingRoundCount: 0,
        baselineFunding: [],
        baselineStatements: []
      }))
    }
  });

  assert.equal(tasks.length, 8);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 8);
  assert.ok(tasks.some((task) => task.roleId === "corporate-financing" && /企查查、天眼查/.test(task.instruction)));
  assert.ok(tasks.some((task) => task.roleId === "corporate-financing" && /统一社会信用代码/.test(task.query)));
  assert.ok(tasks.some((task) => task.roleId === "founder-theses" && /专访/.test(task.query)));
  assert.ok(tasks.some((task) => task.roleId === "benchmark-verification" && /评测日志/.test(task.query)));
  assert.ok(tasks.every((task) => task.instruction.includes("参考页仅作为实体发现")));
  assert.equal(tasks.at(-1)?.roleId, "source-audit");
  assert.equal(tasks.at(-1)?.targetEntities.length, 4);
  const ecosystem = tasks.filter((task) => task.roleId === "ecosystem-discovery");
  assert.equal(ecosystem.length, 1);
  assert.equal(new Set(ecosystem.flatMap((task) => task.targetEntities)).size, 4);
});

test("large China-focused seeds use bounded entity batches with full per-role coverage", () => {
  const request = ResearchRequestSchema.parse({ topic: "以中国为主的自进化 AI", depth: "deep" });
  const entities = Array.from({ length: 100 }, (_, index) => ({
    id: `E-${index}`,
    name: `Company ${index}`,
    aliases: [],
    region: index < 81 ? "中国" : "美国",
    country: index < 81 ? "China" : "USA",
    layer: index < 93 ? "core" : "watch",
    founders: [],
    fundingRoundCount: 0,
    baselineFunding: [],
    baselineStatements: []
  }));
  const tasks = buildResearchTaskGraph({
    request,
    plan,
    seed: { path: "/tmp/reference.html", stats: {}, entities, rawCompanyCount: 100, rawFundingCount: 0, rawStatementCount: 0 }
  });
  const primaryRoles = new Set(tasks.filter((task) => task.roleId !== "source-audit").map((task) => task.roleId));
  assert.equal(tasks.length, 60);
  assert.equal(primaryRoles.size, 7);
  assert.ok(tasks.filter((task) => task.roleId !== "source-audit").every((task) => task.targetEntities.length <= 12));
  for (const role of primaryRoles) {
    assert.equal(new Set(tasks.filter((task) => task.roleId === role).flatMap((task) => task.targetEntities)).size, 93);
  }
});
