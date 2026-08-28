import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { parseAgentJson } from "../src/json.js";

test("JSON parser tolerates fenced output, smart quotes, and trailing commas", () => {
  const parsed = parseAgentJson(
    "```json\n{“name”: “planner”, “items”: [1, 2,],}\n```",
    z.object({ name: z.string(), items: z.array(z.number()) }),
    "Test"
  );
  assert.deepEqual(parsed, { name: "planner", items: [1, 2] });
});
