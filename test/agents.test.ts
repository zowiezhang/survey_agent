import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { ClaudeCodeAgent, CodexCliAgent, OpenAIResponsesAgent } from "../src/agents.js";

test("OpenAI adapter requests built-in web search without storing the research prompt", async () => {
  let captured: unknown;
  const agent = new OpenAIResponsesAgent({
    defaultModel: "test-model",
    client: {
      responses: {
        create: async (input) => {
          captured = input;
          return { id: "resp_test", output_text: "{}" };
        }
      }
    }
  });

  const result = await agent.complete({ phase: "evidence", prompt: "research this" });
  const request = captured as {
    model: string; input: string; store: boolean; tools: Array<{ type: string }>; include: string[];
  };
  assert.equal(result.responseId, "resp_test");
  assert.equal(request.model, "test-model");
  assert.equal(request.input, "research this");
  assert.equal(request.store, false);
  assert.deepEqual(request.tools, [{ type: "web_search" }]);
  assert.deepEqual(request.include, ["web_search_call.action.sources"]);
});

test("OpenAI adapter forwards a strict output schema", async () => {
  let captured: unknown;
  const agent = new OpenAIResponsesAgent({
    client: { responses: { create: async (input) => {
      captured = input;
      return { output_text: '{"ok":true}' };
    } } }
  });
  const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };
  await agent.complete({ phase: "plan", prompt: "structured", outputSchema: schema });
  const request = captured as { text: { format: { type: string; name: string; schema: unknown; strict: boolean } } };
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema, schema);
});

test("Codex adapter invokes a read-only ephemeral exec and reads only its final message", async () => {
  let captured: { command: string; args: string[] } | undefined;
  let capturedSchema: unknown;
  const activity: string[] = [];
  const agent = new CodexCliAgent({
    command: "fake-codex",
    defaultModel: "test-model",
    runner: async ({ command, args, onJsonEvent }) => {
      captured = { command, args };
      onJsonEvent?.({ type: "thread.started", thread_id: "thread_test" });
      onJsonEvent?.({ type: "item.completed", item: { type: "reasoning", text: "private text" } });
      onJsonEvent?.({ type: "item.started", item: { type: "web_search" } });
      onJsonEvent?.({ type: "turn.completed", usage: { total_tokens: 321 } });
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      const schemaPath = args[args.indexOf("--output-schema") + 1];
      capturedSchema = JSON.parse(await readFile(schemaPath!, "utf8"));
      await writeFile(outputPath!, '{"ok":true}', "utf8");
    }
  });

  const result = await agent.complete({
    phase: "plan",
    prompt: "return JSON",
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    onRuntimeEvent: (event) => activity.push(event.message)
  });
  assert.equal(result.text, '{"ok":true}');
  assert.equal(captured?.command, "fake-codex");
  assert.ok(captured?.args.includes("--ephemeral"));
  assert.ok(captured?.args.includes("--skip-git-repo-check"));
  assert.ok(captured?.args.includes("--json"));
  assert.ok(captured?.args.includes("--output-schema"));
  assert.deepEqual(capturedSchema, { type: "object", properties: { ok: { type: "boolean" } } });
  const sandboxIndex = captured?.args.indexOf("--sandbox") ?? -1;
  assert.equal(captured?.args[sandboxIndex + 1], "read-only");
  assert.ok(captured?.args.includes("--model"));
  assert.ok(captured?.args.includes("test-model"));
  assert.equal(captured?.args.at(-1), "return JSON");
  assert.ok(activity.some((message) => message.includes("会话已启动")));
  assert.ok(activity.some((message) => message.includes("私密思维链不输出")));
  assert.ok(activity.some((message) => message.includes("启动工具")));
  assert.ok(activity.some((message) => message.includes("321 tokens")));
  assert.ok(activity.every((message) => !message.includes("private text")));
});

test("Claude Code adapter streams safe activity, forwards native subagents, and reads structured output", async () => {
  let captured: { command: string; args: string[]; cwd: string } | undefined;
  const activity: string[] = [];
  const agent = new ClaudeCodeAgent({
    command: "fake-claude",
    maxBudgetUsd: 2,
    runner: async ({ command, args, cwd, onJsonEvent }) => {
      captured = { command, args, cwd };
      onJsonEvent?.({ type: "system", subtype: "init", session_id: "cc_session" });
      onJsonEvent?.({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "thinking", thinking: "private CC reasoning" }, { type: "tool_use", name: "Agent" }] }
      });
      onJsonEvent?.({
        type: "assistant",
        parent_tool_use_id: "agent_tool_1",
        message: { content: [{ type: "text", text: "private subagent evidence summary" }] }
      });
      onJsonEvent?.({
        type: "result",
        subtype: "success",
        session_id: "cc_session",
        structured_output: { ok: true },
        total_cost_usd: 0.25,
        subagent_stats: { completed: 1 }
      });
    }
  });

  const result = await agent.complete({
    phase: "evidence",
    prompt: "research and return JSON",
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    allowNativeSubagents: true,
    onRuntimeEvent: (event) => activity.push(event.message)
  });

  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.responseId, "cc_session");
  assert.equal(captured?.command, "fake-claude");
  assert.ok(captured?.cwd.includes("research-harness-claude-"));
  assert.ok(captured?.args.includes("--safe-mode"));
  assert.ok(captured?.args.includes("--no-session-persistence"));
  assert.ok(captured?.args.includes("--forward-subagent-text"));
  assert.ok(captured?.args.includes("--json-schema"));
  assert.ok(captured?.args.includes("--max-budget-usd"));
  const toolsIndex = captured?.args.indexOf("--tools") ?? -1;
  assert.equal(captured?.args[toolsIndex + 1], "WebSearch,WebFetch,Agent");
  const permissionIndex = captured?.args.indexOf("--permission-mode") ?? -1;
  assert.equal(captured?.args[permissionIndex + 1], "dontAsk");
  assert.ok(activity.some((message) => message.includes("原生 subagent")));
  assert.ok(activity.some((message) => message.includes("subagent 已形成")));
  assert.ok(activity.some((message) => message.includes("1 个 subagent 完成")));
  assert.ok(activity.every((message) => !message.includes("private CC reasoning")));
  assert.ok(activity.every((message) => !message.includes("private subagent evidence summary")));
});

test("Claude Code repair disables web and subagent tools", async () => {
  let args: string[] = [];
  const agent = new ClaudeCodeAgent({
    runner: async (input) => {
      args = input.args;
      input.onJsonEvent?.({ type: "result", subtype: "success", structured_output: { ok: true } });
    }
  });
  await agent.complete({
    phase: "repair",
    prompt: "repair JSON only",
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    allowNativeSubagents: true
  });
  const toolsIndex = args.indexOf("--tools");
  assert.equal(args[toolsIndex + 1], "");
  assert.ok(!args.includes("--forward-subagent-text"));
});
