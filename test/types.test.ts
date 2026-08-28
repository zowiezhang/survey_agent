import assert from "node:assert/strict";
import test from "node:test";
import { ResearchRequestSchema } from "../src/types.js";

test("research depth selects an appropriate default evidence budget", () => {
  assert.equal(ResearchRequestSchema.parse({ topic: "quick research", depth: "quick" }).maxSources, 6);
  assert.equal(ResearchRequestSchema.parse({ topic: "standard research" }).maxSources, 12);
  assert.equal(ResearchRequestSchema.parse({ topic: "deep research", depth: "deep" }).maxSources, 20);
  assert.equal(ResearchRequestSchema.parse({ topic: "custom research", depth: "deep", maxSources: 27 }).maxSources, 27);
});
