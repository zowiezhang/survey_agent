import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderDashboardHtml } from "../src/dashboard.js";

test("dashboard renders a dependency-free POST SSE research control room", () => {
  const html = renderDashboardHtml();

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /\/v1\/research\/stream/);
  assert.match(html, /method: "POST"/);
  assert.match(html, /text\/event-stream/);
  assert.match(html, /getReader\(\)/);
  assert.match(html, /query\.started/);
  assert.match(html, /query\.completed/);
  assert.match(html, /agent\.activity/);
  assert.match(html, /heartbeat/);
  assert.match(html, /SUBAGENT 任务矩阵/);
  assert.match(html, /VC \/ 融资与工商尽调/);
  assert.match(html, /downloadReport/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/i);
});

test("dashboard escapes server-rendered options and uses safe DOM sinks for runtime data", () => {
  const html = renderDashboardHtml({
    title: '<img src=x onerror="alert(1)">',
    streamEndpoint: '"><script>alert(2)</script>'
  });

  assert.doesNotMatch(html, /<img src=x/i);
  assert.doesNotMatch(html, /<script>alert\(2\)<\/script>/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&quot;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /\.textContent =/);
  assert.doesNotMatch(html, /\.innerHTML\b/);
  assert.doesNotMatch(html, /insertAdjacentHTML|document\.write|eval\(/);
  assert.match(html, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
  assert.match(html, /rel = "noopener noreferrer"/);
});

test("dashboard supports cancellation and report/log filtering", () => {
  const html = renderDashboardHtml({ streamEndpoint: "/custom/stream", title: "Research Ops" });

  assert.match(html, /value="\/custom\/stream"/);
  assert.match(html, /<title>Research Ops<\/title>/);
  assert.match(html, /new AbortController\(\)/);
  assert.match(html, /state\.controller\.abort\(\)/);
  assert.match(html, /id="logSearch"/);
  assert.match(html, /id="logLevel"/);
  assert.match(html, /id="reportSearch"/);
  assert.match(html, /id="sourceDomain"/);
  assert.match(html, /text\/markdown;charset=utf-8/);
});

test("dashboard generated browser script is syntactically valid", () => {
  const html = renderDashboardHtml();
  const start = html.indexOf("<script>") + "<script>".length;
  const end = html.indexOf("</script>", start);

  assert.ok(start >= "<script>".length);
  assert.ok(end > start);
  assert.doesNotThrow(() => new vm.Script(html.slice(start, end)));
});
