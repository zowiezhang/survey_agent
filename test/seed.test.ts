import assert from "node:assert/strict";
import test from "node:test";
import { detectSeedPath, extractEmbeddedJson } from "../src/seed.js";

test("detects an HTML reference path embedded in a natural-language topic", () => {
  assert.equal(
    detectSeedPath("参考/Users/example/RSI 调研/自进化AI创业者全景.html，继续深挖"),
    "/Users/example/RSI 调研/自进化AI创业者全景.html"
  );
});

test("extracts balanced embedded JSON without being confused by braces in strings", () => {
  const value = extractEmbeddedJson('<script>const D={"date":"2026","companies":[{"name":"A {lab}","founders":[{"name":"甲"}],"rounds":[{}]}],"funding":[],"statements":[]};window.x=1</script>') as Record<string, unknown>;
  assert.equal(value.date, "2026");
  assert.equal((value.companies as Array<Record<string, unknown>>)[0]?.name, "A {lab}");
});
