import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderInteractiveReport } from "../src/html-report.js";
import { ResearchRequestSchema } from "../src/types.js";

test("interactive report is searchable, exportable, and safely embeds untrusted content", () => {
  const html = renderInteractiveReport({
    id: "r1",
    createdAt: "2026-08-26T00:00:00Z",
    request: ResearchRequestSchema.parse({ topic: "<script>alert(1)</script> AI", maxQueries: 2 }),
    plan: { scope: "A sufficiently detailed research scope.", researchQuestions: ["What entities exist?", "What supports the claim?"], queries: [{ query: "a", purpose: "discover" }, { query: "b", purpose: "verify" }], recencyNeeds: "Prefer current primary records." },
    tasks: [{ id: "W01", index: 1, roleId: "vc", roleName: "VC", objective: "verify funding", query: "a", purpose: "funding", instruction: "do it", targetEntities: ["甲"] }],
    evidence: [{ query: "a", findings: [{ claim: "A supported claim has enough detail.", source: { title: "Source", url: "https://example.com" }, confidence: .9 }], gaps: [] }],
    synthesis: { title: "Safe </script> report", executiveSummary: [{ claim: "A supported summary claim.", sourceIds: ["S1"] }, { claim: "A second supported summary.", sourceIds: ["S1"] }], keyFindings: [{ heading: "One", analysis: "A sufficiently detailed first analytical finding.", sourceIds: ["S1"] }, { heading: "Two", analysis: "A sufficiently detailed second analytical finding.", sourceIds: ["S1"] }], landscape: [{ entity: "甲", relevance: "A sufficiently detailed relevance statement.", sourceIds: ["S1"] }], risksAndUncertainties: [{ claim: "A sufficiently detailed uncertainty exists.", sourceIds: ["S1"] }], furtherResearch: ["Verify more public records in a subsequent pass."] },
    sources: [{ id: "S1", title: "Source", url: "https://example.com" }]
  });
  assert.match(html, /id="search"/);
  assert.match(html, /导出 JSON/);
  assert.match(html, /textContent/);
  assert.doesNotMatch(html, /Safe <\/script>/);
  assert.match(html, /Safe \\u003c\/script\\u003e report/);
  const runtime = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(runtime);
  assert.doesNotThrow(() => new vm.Script(runtime));
});
