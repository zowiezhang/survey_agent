import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_ROLES,
  buildRoleResearchTasks,
  buildRoleTaskInstruction,
  getResearchRole,
  selectResearchRoles,
  type ResearchRoleId
} from "../src/research-roles.js";

const EXPECTED_ROLE_IDS: ResearchRoleId[] = [
  "ecosystem-discovery",
  "technical-due-diligence",
  "corporate-financing",
  "founder-theses",
  "product-adoption",
  "benchmark-verification",
  "counterevidence-compliance",
  "source-audit"
];

test("defines every specialist role with a complete evidence contract", () => {
  assert.deepEqual(RESEARCH_ROLES.map((role) => role.id), EXPECTED_ROLE_IDS);
  assert.equal(new Set(RESEARCH_ROLES.map((role) => role.id)).size, RESEARCH_ROLES.length);

  for (const role of RESEARCH_ROLES) {
    assert.ok(role.name.length >= 4, role.id);
    assert.ok(role.objective.length >= 20, role.id);
    assert.ok(role.queryStrategies.length >= 4, role.id);
    assert.ok(role.preferredSources.length >= 4, role.id);
    assert.ok(role.prohibitedInferences.length >= 3, role.id);
    assert.ok(role.outputRequirements.length >= 6, role.id);
  }
});

test("depth selection is monotonic and deep research uses all roles", () => {
  const quick = selectResearchRoles("quick").map((role) => role.id);
  const standard = selectResearchRoles("standard").map((role) => role.id);
  const deep = selectResearchRoles("deep").map((role) => role.id);

  assert.deepEqual(quick, [
    "ecosystem-discovery",
    "technical-due-diligence",
    "counterevidence-compliance",
    "source-audit"
  ]);
  assert.ok(quick.every((id) => standard.includes(id)));
  assert.ok(standard.every((id) => deep.includes(id)));
  assert.deepEqual(deep, EXPECTED_ROLE_IDS);
});

test("role task instruction contains role-specific routes, guardrails, output, and progress contract", () => {
  const instruction = buildRoleTaskInstruction("corporate-financing", {
    topic: "中国自进化 AI 初创公司",
    depth: "deep",
    language: "zh-CN",
    brief: "重点核查 2024—2026 年融资"
  });

  assert.match(instruction, /工商与投融资尽调/);
  assert.match(instruction, /中国自进化 AI 初创公司/);
  assert.match(instruction, /国家企业信用信息公示系统/);
  assert.match(instruction, /企查查、天眼查/);
  assert.match(instruction, /不得把工商注册资本当作融资金额/);
  assert.match(instruction, /逐轮融资表/);
  assert.match(instruction, /已访问来源数/);
  assert.doesNotMatch(instruction, /undefined/);
});

test("builds one stable, traceable task for each role selected by depth", () => {
  const tasks = buildRoleResearchTasks({
    topic: "self-evolving AI startups",
    depth: "standard"
  });
  const selected = selectResearchRoles("standard");

  assert.equal(tasks.length, selected.length);
  assert.deepEqual(tasks.map((task) => task.id), selected.map((role) => `role:${role.id}`));
  assert.ok(tasks.every((task) => task.instruction.includes(task.roleName)));
  assert.ok(tasks.every((task) => task.instruction.includes("每条事实附可直达")));
});

test("rejects an empty topic and an unknown runtime role id", () => {
  assert.throws(
    () => buildRoleResearchTasks({ topic: "   ", depth: "deep" }),
    /topic must not be empty/
  );
  assert.throws(
    () => getResearchRole("unknown-role" as ResearchRoleId),
    /Unknown research role/
  );
});
