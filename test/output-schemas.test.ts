import assert from "node:assert/strict";
import test from "node:test";
import { evidenceOutputSchema, synthesisOutputSchema } from "../src/output-schemas.js";

test("evidence schema uses Codex-compatible HTTP URL constraints", () => {
  const serialized = JSON.stringify(evidenceOutputSchema(12));
  assert.doesNotMatch(serialized, /"format":"uri"/);
  assert.match(serialized, /\^https\?/);
});

test("provider synthesis citation limits match local validation limits", () => {
  const properties = synthesisOutputSchema.properties as Record<string, any>;
  assert.equal(properties.executiveSummary.items.properties.sourceIds.maxItems, 8);
  assert.equal(properties.keyFindings.items.properties.sourceIds.maxItems, 10);
  assert.equal(properties.landscape.items.properties.sourceIds.maxItems, 8);
  assert.equal(properties.risksAndUncertainties.items.properties.sourceIds.minItems, 1);
  assert.equal(properties.risksAndUncertainties.items.properties.sourceIds.maxItems, 8);
});
