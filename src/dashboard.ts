export interface DashboardHtmlOptions {
  /** Default SSE endpoint shown in the connection form. */
  streamEndpoint?: string;
  /** Browser tab and page title. */
  title?: string;
}

/**
 * Render a dependency-free research operations dashboard.
 *
 * The returned page talks directly to the existing POST /v1/research/stream
 * endpoint. Runtime values are always written with textContent (or validated
 * URL properties), so agent output is never interpreted as HTML.
 */
export function renderDashboardHtml(options: DashboardHtmlOptions = {}): string {
  const endpoint = options.streamEndpoint ?? "/v1/research/stream";
  const title = options.title ?? "Deep Research Control Room";
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="实时查看并行研究 Agent、证据来源与调研报告">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b10;
      --panel: rgba(17, 22, 31, .88);
      --panel-2: #131a24;
      --line: #273142;
      --muted: #8996aa;
      --text: #e9eef7;
      --cyan: #54d6d0;
      --blue: #6da8ff;
      --green: #66d49a;
      --amber: #ffc66d;
      --red: #ff7c8b;
      --shadow: 0 18px 55px rgba(0, 0, 0, .32);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 14% -10%, rgba(67, 142, 180, .19), transparent 32rem),
        radial-gradient(circle at 100% 12%, rgba(80, 94, 190, .12), transparent 30rem),
        var(--bg);
    }
    button, input, textarea, select { font: inherit; }
    button, input, textarea, select { color: var(--text); }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    a { color: var(--blue); }
    .shell { width: min(1600px, 100%); margin: auto; padding: 24px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 13px; }
    .brand-mark { width: 38px; height: 38px; border: 1px solid rgba(84,214,208,.55); border-radius: 11px; display: grid; place-items: center; color: var(--cyan); box-shadow: inset 0 0 18px rgba(84,214,208,.12); }
    h1 { font-size: 19px; line-height: 1.2; margin: 0; letter-spacing: .02em; }
    .eyebrow { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .14em; margin-bottom: 4px; }
    .connection { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: #687386; }
    .pulse.live { background: var(--green); box-shadow: 0 0 0 5px rgba(102,212,154,.09), 0 0 13px rgba(102,212,154,.8); animation: pulse 1.8s infinite; }
    .pulse.error { background: var(--red); }
    @keyframes pulse { 50% { opacity: .45; } }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 15px; box-shadow: var(--shadow); backdrop-filter: blur(12px); }
    .setup { padding: 17px; margin-bottom: 16px; }
    .setup-grid { display: grid; grid-template-columns: minmax(240px, 2fr) minmax(180px, 1fr) repeat(4, minmax(105px, .5fr)); gap: 11px; align-items: end; }
    .field { display: grid; gap: 6px; }
    .field label { color: var(--muted); font-size: 11px; letter-spacing: .04em; }
    input, textarea, select { width: 100%; border: 1px solid var(--line); background: #0d121a; border-radius: 9px; padding: 9px 11px; outline: none; }
    input:focus, textarea:focus, select:focus { border-color: rgba(84,214,208,.72); box-shadow: 0 0 0 3px rgba(84,214,208,.08); }
    textarea { min-height: 70px; resize: vertical; }
    .full { grid-column: 1 / -1; }
    .actions { display: flex; gap: 9px; justify-content: flex-end; grid-column: 1 / -1; }
    .button { border: 1px solid var(--line); background: #151c27; border-radius: 9px; padding: 9px 15px; }
    .button.primary { color: #071315; border-color: transparent; background: linear-gradient(135deg, var(--cyan), #78b8ff); font-weight: 700; }
    .button.danger { color: var(--red); border-color: rgba(255,124,139,.35); }
    .overview { display: grid; grid-template-columns: minmax(250px, 1.7fr) repeat(4, minmax(115px, .55fr)); gap: 12px; margin-bottom: 16px; }
    .metric { padding: 15px; min-height: 87px; }
    .metric-label { font-size: 11px; color: var(--muted); margin-bottom: 8px; }
    .metric-value { font-size: 22px; font-variant-numeric: tabular-nums; }
    .metric-value.small { font-size: 14px; line-height: 1.35; }
    .progress-track { height: 7px; border-radius: 99px; background: #0a0e15; overflow: hidden; margin: 9px 0 5px; }
    .progress-fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--cyan), var(--blue)); transition: width .35s ease; }
    .progress-caption { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; }
    .workspace { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(310px, .7fr); gap: 16px; align-items: start; }
    .section { overflow: hidden; }
    .section-head { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; border-bottom: 1px solid var(--line); }
    .section-title { margin: 0; font-size: 13px; letter-spacing: .03em; }
    .section-subtitle { color: var(--muted); font-size: 11px; margin-top: 4px; }
    .agents { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; padding: 12px; max-height: 670px; overflow: auto; }
    .empty { color: var(--muted); text-align: center; padding: 52px 20px; font-size: 13px; grid-column: 1 / -1; }
    .agent-card { border: 1px solid var(--line); background: linear-gradient(145deg, rgba(20,27,38,.95), rgba(12,17,25,.95)); border-radius: 12px; padding: 13px; min-width: 0; transition: border-color .2s, transform .2s; }
    .agent-card.active { border-color: rgba(84,214,208,.45); transform: translateY(-1px); }
    .agent-card.done { border-color: rgba(102,212,154,.27); }
    .agent-card.failed { border-color: rgba(255,124,139,.48); }
    .agent-top { display: flex; gap: 10px; align-items: flex-start; }
    .agent-icon { flex: 0 0 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; background: rgba(109,168,255,.1); color: var(--blue); border: 1px solid rgba(109,168,255,.18); }
    .agent-name { font-weight: 670; font-size: 13px; margin: 1px 0 3px; }
    .agent-role { color: var(--muted); font-size: 11px; }
    .status { margin-left: auto; border-radius: 99px; padding: 4px 8px; color: var(--muted); background: rgba(137,150,170,.08); font-size: 10px; white-space: nowrap; }
    .status.active { color: var(--cyan); background: rgba(84,214,208,.1); }
    .status.done { color: var(--green); background: rgba(102,212,154,.1); }
    .status.failed { color: var(--red); background: rgba(255,124,139,.1); }
    .agent-query { font-size: 11px; line-height: 1.5; color: #c6d0df; margin: 12px 0; padding-top: 10px; border-top: 1px solid rgba(39,49,66,.7); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
    .agent-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .agent-stat { border-radius: 7px; background: rgba(6,9,14,.55); padding: 7px; }
    .agent-stat span { display: block; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
    .agent-stat strong { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .agent-note { color: var(--muted); font-size: 10px; line-height: 1.45; min-height: 29px; margin-top: 9px; }
    .discoveries { margin: 9px 0 0; padding: 0 0 0 17px; font-size: 10px; line-height: 1.45; color: #bdc8d8; }
    .discoveries li + li { margin-top: 4px; }
    .log-tools, .report-tools { display: flex; gap: 7px; flex-wrap: wrap; }
    .compact { padding: 6px 8px; font-size: 11px; width: auto; }
    .log-list { height: 616px; overflow: auto; padding: 9px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 1.55; }
    .log-row { display: grid; grid-template-columns: 67px 71px 1fr; gap: 7px; padding: 5px 2px; border-bottom: 1px solid rgba(39,49,66,.42); }
    .log-time { color: #657287; }
    .log-agent { color: var(--blue); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .log-message { color: #bec8d7; overflow-wrap: anywhere; }
    .log-row.error .log-message { color: var(--red); }
    .log-row.success .log-message { color: var(--green); }
    .report { margin-top: 16px; display: none; }
    .report.visible { display: block; }
    .report-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; }
    .report-view { margin: 0; padding: 20px; min-height: 420px; max-height: 75vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace; color: #dce4ef; }
    .source-pane { border-left: 1px solid var(--line); max-height: 75vh; overflow: auto; padding: 12px; }
    .source-item { padding: 10px; border: 1px solid rgba(39,49,66,.7); border-radius: 9px; margin-bottom: 8px; }
    .source-title { display: block; font-size: 11px; line-height: 1.4; text-decoration: none; overflow-wrap: anywhere; }
    .source-meta { color: var(--muted); font-size: 9px; margin-top: 5px; overflow-wrap: anywhere; }
    .hidden { display: none !important; }
    @media (max-width: 1080px) {
      .setup-grid { grid-template-columns: repeat(3, 1fr); }
      .overview { grid-template-columns: repeat(3, 1fr); }
      .metric:first-child { grid-column: 1 / -1; }
      .workspace { grid-template-columns: 1fr; }
      .log-list { height: 360px; }
    }
    @media (max-width: 720px) {
      .shell { padding: 12px; }
      .topbar { align-items: flex-start; }
      .setup-grid, .overview { grid-template-columns: 1fr 1fr; }
      .full, .actions { grid-column: 1 / -1; }
      .agents { grid-template-columns: 1fr; }
      .report-layout { grid-template-columns: 1fr; }
      .source-pane { border-left: 0; border-top: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">⌁</div>
        <div><div class="eyebrow">Research orchestration</div><h1>${escapeHtml(title)}</h1></div>
      </div>
      <div class="connection"><span id="connectionPulse" class="pulse"></span><span id="connectionText">等待任务</span></div>
    </header>

    <form id="researchForm" class="panel setup">
      <div class="setup-grid">
        <div class="field"><label for="endpoint">SSE API</label><input id="endpoint" name="endpoint" value="${escapeHtml(endpoint)}" required></div>
        <div class="field"><label for="token">Bearer Token（仅保存在本页内存）</label><input id="token" name="token" type="password" autocomplete="off" required></div>
        <div class="field"><label for="harness">Harness</label><select id="harness" name="harness"><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="openai">OpenAI API</option></select></div>
        <div class="field"><label for="depth">深度</label><select id="depth" name="depth"><option value="deep">Deep</option><option value="standard">Standard</option><option value="quick">Quick</option></select></div>
        <div class="field"><label for="concurrency">并发</label><input id="concurrency" name="concurrency" type="number" min="1" max="16" value="6"></div>
        <div class="field"><label for="maxAgents">工作包上限</label><input id="maxAgents" name="maxAgents" type="number" min="2" max="256" value="64"></div>
        <div class="field"><label for="entitiesPerAgent">每包实体</label><input id="entitiesPerAgent" name="entitiesPerAgent" type="number" min="1" max="50" value="12"></div>
        <div class="field"><label for="maxSources">每包来源</label><input id="maxSources" name="maxSources" type="number" min="2" max="30" value="20"></div>
        <div class="field full"><label for="topic">调研任务</label><textarea id="topic" name="topic" maxlength="500" placeholder="输入目标、范围、地区、时间和每个结论所需的证据标准…" required></textarea></div>
        <div class="field full"><label for="seedPath">本地参考 HTML/JSON（服务端需使用 --allow-local-seeds）</label><input id="seedPath" name="seedPath" maxlength="2048" placeholder="/absolute/path/reference.html"></div>
        <div class="field full"><label for="brief">补充 Brief（可选）</label><textarea id="brief" name="brief" maxlength="4000" placeholder="参考文件摘要、已知公司、排除项、交付格式等"></textarea></div>
        <div class="actions"><button id="cancelButton" type="button" class="button danger" disabled>停止任务</button><button id="startButton" type="submit" class="button primary">开始深度调研</button></div>
      </div>
    </form>

    <section class="overview" aria-label="任务总览">
      <article class="panel metric">
        <div class="metric-label">总进度</div><div id="progressValue" class="metric-value">0%</div>
        <div class="progress-track"><div id="progressFill" class="progress-fill"></div></div>
        <div class="progress-caption"><span id="stageText">尚未开始</span><span id="queryProgress">0 / 0 workers</span></div>
      </article>
      <article class="panel metric"><div class="metric-label">运行时间</div><div id="elapsedValue" class="metric-value">00:00</div></article>
      <article class="panel metric"><div class="metric-label">活动 Subagents</div><div id="activeValue" class="metric-value">0</div></article>
      <article class="panel metric"><div class="metric-label">证据来源</div><div id="sourceValue" class="metric-value">0</div></article>
      <article class="panel metric"><div class="metric-label">最新心跳</div><div id="heartbeatValue" class="metric-value small">—</div></article>
    </section>

    <div class="workspace">
      <section class="panel section">
        <div class="section-head"><div><h2 class="section-title">SUBAGENT 任务矩阵</h2><div id="agentSubtitle" class="section-subtitle">角色会根据查询目的自动分配</div></div></div>
        <div id="agentGrid" class="agents"><div id="agentEmpty" class="empty">提交任务后，这里会实时出现规划、并行检索与综合 Agent。</div></div>
      </section>
      <section class="panel section">
        <div class="section-head">
          <div><h2 class="section-title">实时活动日志</h2><div class="section-subtitle">SSE 心跳、工具活动与阶段性发现</div></div>
          <div class="log-tools"><input id="logSearch" class="compact" type="search" placeholder="过滤日志"><select id="logLevel" class="compact"><option value="all">全部</option><option value="activity">活动</option><option value="heartbeat">心跳</option><option value="finding">发现</option><option value="error">错误</option></select></div>
        </div>
        <div id="logList" class="log-list" role="log" aria-live="polite"></div>
      </section>
    </div>

    <section id="reportSection" class="panel section report">
      <div class="section-head">
        <div><h2 class="section-title">最终研究报告</h2><div id="reportMeta" class="section-subtitle"></div></div>
        <div class="report-tools"><input id="reportSearch" class="compact" type="search" placeholder="搜索报告内容"><select id="sourceDomain" class="compact"><option value="all">全部来源域名</option></select><button id="interactiveButton" class="button compact" type="button">打开交互 HTML</button><button id="downloadButton" class="button compact" type="button">下载 Markdown</button></div>
      </div>
      <div class="report-layout"><pre id="reportView" class="report-view" tabindex="0"></pre><aside id="sourcePane" class="source-pane" aria-label="证据来源"></aside></div>
    </section>
  </main>

  <script>
    "use strict";
    (function () {
      const el = function (id) { return document.getElementById(id); };
      const state = { controller: null, startedAt: 0, timer: null, queryTotal: 0, queryDone: 0, stage: "idle", agents: new Map(), logs: [], sources: [], markdown: "", html: "", runId: "" };
      const form = el("researchForm");
      const agentGrid = el("agentGrid");
      const logList = el("logList");

      form.addEventListener("submit", function (event) { event.preventDefault(); startResearch(); });
      el("cancelButton").addEventListener("click", cancelResearch);
      el("logSearch").addEventListener("input", renderLogs);
      el("logLevel").addEventListener("change", renderLogs);
      el("reportSearch").addEventListener("input", renderReport);
      el("sourceDomain").addEventListener("change", renderSources);
      el("downloadButton").addEventListener("click", downloadReport);
      el("interactiveButton").addEventListener("click", openInteractiveReport);

      async function startResearch() {
        if (state.controller) return;
        resetRun();
        const endpoint = el("endpoint").value.trim();
        const token = el("token").value;
        const topic = el("topic").value.trim();
        if (!endpoint || !token || !topic) { addLog("error", "system", "请填写 API 地址、Bearer Token 与调研任务。"); return; }
        const body = {
          topic: topic,
          provider: el("harness").value,
          depth: el("depth").value,
          subworkMode: "hybrid",
          concurrency: numberInRange(el("concurrency").value, 1, 16, 6),
          maxAgents: numberInRange(el("maxAgents").value, 2, 256, 64),
          entitiesPerAgent: numberInRange(el("entitiesPerAgent").value, 1, 50, 12),
          maxSources: numberInRange(el("maxSources").value, 2, 30, 20)
        };
        const seedPath = el("seedPath").value.trim();
        if (seedPath) body.seedPath = seedPath;
        const brief = el("brief").value.trim();
        if (brief) body.brief = brief;
        state.controller = new AbortController();
        state.startedAt = Date.now();
        setRunning(true, "正在连接研究 Harness");
        state.timer = window.setInterval(updateElapsed, 1000);
        updateElapsed();
        addLog("activity", "system", "正在建立 POST SSE 连接：" + endpoint);
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "authorization": "Bearer " + token, "content-type": "application/json", "accept": "text/event-stream" },
            body: JSON.stringify(body), signal: state.controller.signal
          });
          if (!response.ok) throw new Error("HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
          if (!response.body) throw new Error("浏览器未返回可读取的 SSE 流。");
          await consumeEventStream(response.body);
        } catch (error) {
          if (error && error.name === "AbortError") {
            addLog("error", "system", "任务已由用户停止。");
            markActiveAgents("failed", "已停止");
            setConnection("error", "已停止");
          } else {
            const message = error instanceof Error ? error.message : String(error);
            addLog("error", "system", "连接或任务失败：" + message);
            markActiveAgents("failed", "失败");
            setConnection("error", "运行失败");
          }
        } finally {
          finishRequest();
        }
      }

      async function consumeEventStream(stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const packet = await reader.read();
          buffer += decoder.decode(packet.value || new Uint8Array(), { stream: !packet.done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || "";
          blocks.forEach(parseEventBlock);
          if (packet.done) break;
        }
        if (buffer.trim()) parseEventBlock(buffer);
      }

      function parseEventBlock(block) {
        let eventName = "message";
        const dataLines = [];
        block.split(/\r?\n/).forEach(function (line) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        });
        if (!dataLines.length) return;
        try { handleServerEvent(eventName, JSON.parse(dataLines.join("\n"))); }
        catch (error) { addLog("error", "stream", "无法解析 SSE 数据：" + (error instanceof Error ? error.message : String(error))); }
      }

      function handleServerEvent(name, data) {
        if (name === "connected") {
          setConnection("live", "已连接 · " + safeString(data.provider));
          addLog("activity", "system", "SSE 已连接，Provider：" + safeString(data.provider));
          return;
        }
        if (name === "error") {
          addLog("error", "server", safeString(data.message) || "服务器返回未知错误");
          markActiveAgents("failed", "失败");
          setConnection("error", "运行失败");
          return;
        }
        if (name === "result") {
          state.markdown = safeString(data.markdown);
          state.html = safeString(data.html);
          state.sources = Array.isArray(data.sources) ? data.sources : [];
          state.runId = safeString(data.id);
          showFinalReport(data);
          return;
        }
        if (name === "progress") handleProgress(data);
      }

      function handleProgress(event) {
        if (!event || typeof event.type !== "string") return;
        const type = event.type;
        if (type === "run.started") {
          state.queryTotal = finiteNumber(event.queryCount);
          addAgent("planner", "研究规划师", "问题拆解与查询图", "正在拆解任务", "◫");
          setAgentStatus("planner", "active", "规划中");
          addLog("activity", "orchestrator", "启动 " + state.queryTotal + " 个检索方向；并发 " + finiteNumber(event.concurrency));
        } else if (type === "plan.preview") {
          updateAgentNote("planner", arrayText(event.dimensions, " · "));
          addLog("activity", "planner", "研究维度：" + arrayText(event.dimensions, "、"));
        } else if (type === "plan.completed") {
          setAgentStatus("planner", "done", "已完成");
          state.stage = "researching";
          addLog("success", "planner", "查询图已完成：" + safeString(event.scope));
        } else if (type === "seed.loaded") {
          addLog("success", "seed", "已导入 " + finiteNumber(event.companyCount) + " 家公司、" + finiteNumber(event.fundingCount) + " 条融资、" + finiteNumber(event.statementCount) + " 条观点");
        } else if (type === "task.graph.ready") {
          const workers = Array.isArray(event.workers) ? event.workers : [];
          state.queryTotal = workers.length;
          workers.forEach(function (worker, offset) {
            const id = safeString(worker.workerId) || "W" + String(offset + 1).padStart(2, "0");
            const key = "worker-" + id;
            const role = safeString(worker.roleName) || inferRole("", worker.purpose);
            addAgent(key, id, role, safeString(worker.purpose), roleIcon(role, worker.purpose));
            updateAgentNote(key, finiteNumber(worker.entityCount) + " 个目标实体");
          });
          addLog("success", "orchestrator", "角色任务图已就绪：" + workers.length + " 个 subagents");
        } else if (type === "query.started") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : "query-" + finiteNumber(event.index);
          if (!state.agents.has(key)) addAgent(key, safeString(event.workerId) || "Worker " + String(event.index), safeString(event.roleName) || inferRole(event.query, event.purpose), safeString(event.query), roleIcon(event.roleName || event.query, event.purpose));
          setAgentStatus(key, "active", "检索中");
          setAgentStart(key);
          updateAgentNote(key, safeString(event.purpose));
          addLog("activity", safeString(event.workerId) || "worker-" + event.index, "开始检索：" + safeString(event.query));
        } else if (type === "query.retrying") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : "query-" + finiteNumber(event.index);
          setAgentStatus(key, "active", "重试 " + finiteNumber(event.attempt) + "/" + finiteNumber(event.maxAttempts));
          updateAgentNote(key, safeString(event.message));
          addLog("error", agentDisplayName(key), "自动重试：" + safeString(event.message));
        } else if (type === "query.failed") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : "query-" + finiteNumber(event.index);
          state.queryDone += 1;
          setAgentStatus(key, "failed", "已隔离");
          updateAgentNote(key, safeString(event.message));
          addLog("error", agentDisplayName(key), "工作包失败但不终止全局：" + safeString(event.message));
        } else if (type === "heartbeat") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : event.index ? "query-" + finiteNumber(event.index) : event.stage === "planning" ? "planner" : "synthesizer";
          updateAgentHeartbeat(key, finiteNumber(event.elapsedMs), safeString(event.publicNote));
          el("heartbeatValue").textContent = timeOnly(event.at) + " · " + agentDisplayName(key);
          addLog("heartbeat", agentDisplayName(key), safeString(event.message) + " · " + safeString(event.publicNote));
        } else if (type === "agent.activity") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : event.index ? "query-" + finiteNumber(event.index) : event.stage === "planning" ? "planner" : "synthesizer";
          addLog("activity", agentDisplayName(key), safeString(event.message));
          updateAgentNote(key, safeString(event.message));
        } else if (type === "query.completed") {
          const key = event.workerId ? "worker-" + safeString(event.workerId) : "query-" + finiteNumber(event.index);
          state.queryDone += 1;
          setAgentStatus(key, "done", "已完成");
          updateAgentCompleted(key, event);
          addLog("finding", agentDisplayName(key), "完成：" + finiteNumber(event.sources && event.sources.length) + " 个来源；" + arrayText(event.claims, "；", 2));
        } else if (type === "synthesis.started") {
          state.stage = "synthesizing";
          addAgent("synthesizer", "总报告 Agent", "证据审计与综合分析", "核对引用并生成报告", "◇");
          setAgentStatus("synthesizer", "active", "综合中");
          setAgentStart("synthesizer");
          el("sourceValue").textContent = String(finiteNumber(event.sourceCount));
          addLog("activity", "synthesizer", "开始综合 " + finiteNumber(event.findingCount) + " 条发现、" + finiteNumber(event.sourceCount) + " 个独立来源");
        } else if (type === "synthesis.completed") {
          setAgentStatus("synthesizer", "done", "已完成");
          addLog("success", "synthesizer", "报告综合完成，用时 " + formatDuration(finiteNumber(event.durationMs)));
        } else if (type === "output.repair.started") {
          addLog("error", safeString(event.phase), "结构化输出正在修复：" + safeString(event.validationError));
        } else if (type === "output.repair.completed") {
          addLog("success", safeString(event.phase), "结构化输出修复完成");
        } else if (type === "run.completed") {
          state.stage = "completed";
          el("sourceValue").textContent = String(finiteNumber(event.sourceCount));
          setProgress(100, "调研完成");
          setConnection("live", "调研完成");
          addLog("success", "orchestrator", "全部完成：" + finiteNumber(event.sourceCount) + " 个独立来源，" + finiteNumber(event.failedCount) + " 个隔离失败，总耗时 " + formatDuration(finiteNumber(event.durationMs)));
        } else if (type === "run.failed") {
          state.stage = "failed";
          markActiveAgents("failed", "失败");
          setConnection("error", "运行失败");
          addLog("error", "orchestrator", safeString(event.message));
        }
        updateOverview();
      }

      function addAgent(key, name, role, query, icon) {
        if (state.agents.has(key)) return state.agents.get(key);
        const empty = el("agentEmpty"); if (empty) empty.remove();
        const card = document.createElement("article"); card.className = "agent-card"; card.dataset.agentKey = key;
        const top = document.createElement("div"); top.className = "agent-top";
        const iconNode = document.createElement("div"); iconNode.className = "agent-icon"; iconNode.textContent = icon;
        const identity = document.createElement("div");
        const nameNode = document.createElement("div"); nameNode.className = "agent-name"; nameNode.textContent = name;
        const roleNode = document.createElement("div"); roleNode.className = "agent-role"; roleNode.textContent = role;
        identity.append(nameNode, roleNode);
        const status = document.createElement("span"); status.className = "status"; status.textContent = "等待";
        top.append(iconNode, identity, status);
        const queryNode = document.createElement("div"); queryNode.className = "agent-query"; queryNode.textContent = query;
        const meta = document.createElement("div"); meta.className = "agent-meta";
        const elapsed = statNode("用时", "00:00"); const source = statNode("来源", "0"); const heartbeat = statNode("心跳", "—");
        meta.append(elapsed.wrap, source.wrap, heartbeat.wrap);
        const note = document.createElement("div"); note.className = "agent-note"; note.textContent = "等待调度";
        const findings = document.createElement("ul"); findings.className = "discoveries";
        card.append(top, queryNode, meta, note, findings); agentGrid.appendChild(card);
        const agent = { key: key, name: name, card: card, status: status, elapsed: elapsed.value, source: source.value, heartbeat: heartbeat.value, note: note, findings: findings, startedAt: 0, statusValue: "waiting" };
        state.agents.set(key, agent); return agent;
      }

      function statNode(label, initial) {
        const wrap = document.createElement("div"); wrap.className = "agent-stat";
        const labelNode = document.createElement("span"); labelNode.textContent = label;
        const value = document.createElement("strong"); value.textContent = initial;
        wrap.append(labelNode, value); return { wrap: wrap, value: value };
      }

      function setAgentStatus(key, value, label) {
        const agent = state.agents.get(key); if (!agent) return;
        agent.statusValue = value; agent.card.classList.remove("active", "done", "failed"); agent.status.classList.remove("active", "done", "failed");
        if (value !== "waiting") { agent.card.classList.add(value); agent.status.classList.add(value); }
        agent.status.textContent = label;
      }
      function setAgentStart(key) { const agent = state.agents.get(key); if (agent && !agent.startedAt) agent.startedAt = Date.now(); }
      function updateAgentHeartbeat(key, elapsedMs, note) { const agent = state.agents.get(key); if (!agent) return; agent.elapsed.textContent = formatDuration(elapsedMs); agent.heartbeat.textContent = "刚刚"; agent.note.textContent = note; }
      function updateAgentNote(key, note) { const agent = state.agents.get(key); if (agent && note) agent.note.textContent = note; }
      function updateAgentCompleted(key, event) {
        const agent = state.agents.get(key); if (!agent) return;
        agent.elapsed.textContent = formatDuration(finiteNumber(event.durationMs));
        agent.source.textContent = String(Array.isArray(event.sources) ? event.sources.length : 0);
        agent.heartbeat.textContent = "完成"; agent.note.textContent = "已提交结构化证据包";
        while (agent.findings.firstChild) agent.findings.firstChild.remove();
        (Array.isArray(event.claims) ? event.claims.slice(0, 3) : []).forEach(function (claim) { const li = document.createElement("li"); li.textContent = safeString(claim); agent.findings.appendChild(li); });
      }
      function markActiveAgents(status, label) { state.agents.forEach(function (agent) { if (agent.statusValue === "active") setAgentStatus(agent.key, status, label); }); }
      function agentDisplayName(key) { const agent = state.agents.get(key); return agent ? agent.name : key; }

      function inferRole(query, purpose) {
        const text = (safeString(query) + " " + safeString(purpose)).toLowerCase();
        if (/(融资|估值|投资|股东|资本|天眼查|企查查|招股|ipo|funding|investor)/.test(text)) return "VC / 融资与工商尽调";
        if (/(创始人|ceo|cto|人物|采访|观点|演讲|播客|founder)/.test(text)) return "人物情报与原话核验";
        if (/(算法|训练|模型|数据|benchmark|论文|github|arxiv|技术)/.test(text)) return "技术栈与 Benchmark 审计";
        if (/(产品|客户|商业化|收入|落地|案例|product|customer)/.test(text)) return "产品与商业化分析";
        if (/(政策|监管|合规|风险|争议|反证|诉讼|policy|risk)/.test(text)) return "政策、风险与反证调查";
        if (/(中国|国内|区域|生态|产业|版图|landscape)/.test(text)) return "产业版图与实体发现";
        return "开放网络深度检索";
      }
      function roleIcon(query, purpose) { const role = inferRole(query, purpose); if (role.startsWith("VC")) return "¥"; if (role.startsWith("人物")) return "◎"; if (role.startsWith("技术")) return "⌘"; if (role.startsWith("产品")) return "▣"; if (role.startsWith("政策")) return "⚖"; return "⌕"; }

      function addLog(level, agent, message) {
        state.logs.push({ at: new Date(), level: level, agent: agent, message: message });
        if (state.logs.length > 2000) state.logs.shift();
        renderLogs();
      }
      function renderLogs() {
        const search = el("logSearch").value.trim().toLowerCase(); const level = el("logLevel").value;
        const nearBottom = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 80;
        while (logList.firstChild) logList.firstChild.remove();
        state.logs.filter(function (item) { return (level === "all" || item.level === level) && (!search || (item.agent + " " + item.message).toLowerCase().includes(search)); }).forEach(function (item) {
          const row = document.createElement("div"); row.className = "log-row " + item.level;
          const time = document.createElement("span"); time.className = "log-time"; time.textContent = item.at.toLocaleTimeString("zh-CN", { hour12: false });
          const agent = document.createElement("span"); agent.className = "log-agent"; agent.textContent = item.agent;
          const message = document.createElement("span"); message.className = "log-message"; message.textContent = item.message;
          row.append(time, agent, message); logList.appendChild(row);
        });
        if (nearBottom) logList.scrollTop = logList.scrollHeight;
      }

      function showFinalReport(data) {
        el("reportSection").classList.add("visible");
        el("reportMeta").textContent = finiteNumber(data.queryCount) + " 个查询方向 · " + state.sources.length + " 个来源 · " + safeString(data.createdAt);
        populateDomains(); renderReport(); renderSources();
        addLog("success", "report", "最终 Markdown 报告已接收，可以搜索或下载。");
      }
      function renderReport() {
        const search = el("reportSearch").value.trim().toLowerCase();
        el("reportView").textContent = search ? state.markdown.split("\n").filter(function (line) { return line.toLowerCase().includes(search); }).join("\n") : state.markdown;
      }
      function populateDomains() {
        const select = el("sourceDomain"); while (select.options.length > 1) select.remove(1);
        const domains = Array.from(new Set(state.sources.map(function (source) { return urlDomain(source && source.url); }).filter(Boolean))).sort();
        domains.forEach(function (domain) { const option = document.createElement("option"); option.value = domain; option.textContent = domain; select.appendChild(option); });
      }
      function renderSources() {
        const pane = el("sourcePane"); while (pane.firstChild) pane.firstChild.remove();
        const selected = el("sourceDomain").value;
        state.sources.filter(function (source) { return selected === "all" || urlDomain(source && source.url) === selected; }).forEach(function (source, index) {
          const item = document.createElement("div"); item.className = "source-item";
          const link = document.createElement("a"); link.className = "source-title"; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.textContent = safeString(source.id) + (source.id ? " · " : "") + (safeString(source.title) || "未命名来源");
          const validUrl = httpUrl(source.url); if (validUrl) link.href = validUrl; else link.removeAttribute("href");
          const meta = document.createElement("div"); meta.className = "source-meta"; meta.textContent = (safeString(source.publisher) || urlDomain(source.url) || "来源 " + (index + 1)) + (source.publishedAt ? " · " + safeString(source.publishedAt) : "");
          item.append(link, meta); pane.appendChild(item);
        });
      }
      function downloadReport() {
        if (!state.markdown) return;
        const blob = new Blob([state.markdown], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = "research-" + (state.runId || Date.now()) + ".md"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      }
      function openInteractiveReport() {
        if (!state.html) return;
        const blob = new Blob([state.html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }

      function updateOverview() {
        const active = Array.from(state.agents.values()).filter(function (agent) { return agent.statusValue === "active"; }).length;
        el("activeValue").textContent = String(active);
        el("queryProgress").textContent = state.queryDone + " / " + state.queryTotal + " workers";
        if (state.stage === "researching") setProgress(10 + Math.round(78 * state.queryDone / Math.max(1, state.queryTotal)), "并行检索");
        if (state.stage === "synthesizing") setProgress(92, "证据综合");
      }
      function setProgress(percent, stage) { const bounded = Math.max(0, Math.min(100, percent)); el("progressValue").textContent = bounded + "%"; el("progressFill").style.width = bounded + "%"; el("stageText").textContent = stage; }
      function updateElapsed() {
        const elapsed = state.startedAt ? Date.now() - state.startedAt : 0; el("elapsedValue").textContent = formatDuration(elapsed);
        state.agents.forEach(function (agent) { if (agent.statusValue === "active" && agent.startedAt) agent.elapsed.textContent = formatDuration(Date.now() - agent.startedAt); });
      }
      function setRunning(running, text) { el("startButton").disabled = running; el("cancelButton").disabled = !running; setConnection(running ? "live" : "", text); }
      function setConnection(kind, text) { const pulse = el("connectionPulse"); pulse.classList.remove("live", "error"); if (kind) pulse.classList.add(kind); el("connectionText").textContent = text; }
      function finishRequest() { if (state.timer) window.clearInterval(state.timer); state.timer = null; state.controller = null; el("startButton").disabled = false; el("cancelButton").disabled = true; }
      function cancelResearch() { if (state.controller) state.controller.abort(); }
      function resetRun() {
        state.queryTotal = 0; state.queryDone = 0; state.stage = "planning"; state.agents.clear(); state.logs = []; state.sources = []; state.markdown = ""; state.html = ""; state.runId = "";
        while (agentGrid.firstChild) agentGrid.firstChild.remove(); const empty = document.createElement("div"); empty.id = "agentEmpty"; empty.className = "empty"; empty.textContent = "正在等待 Planner 返回研究任务图…"; agentGrid.appendChild(empty);
        while (logList.firstChild) logList.firstChild.remove(); el("reportSection").classList.remove("visible"); el("reportView").textContent = ""; el("sourceValue").textContent = "0"; el("activeValue").textContent = "0"; el("heartbeatValue").textContent = "—"; el("queryProgress").textContent = "0 / 0 workers"; setProgress(2, "连接中");
      }
      function numberInRange(value, min, max, fallback) { const number = Number(value); return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback; }
      function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
      function safeString(value) { return typeof value === "string" ? value : value == null ? "" : String(value); }
      function arrayText(value, separator, limit) { return Array.isArray(value) ? value.slice(0, limit || value.length).map(safeString).join(separator) : ""; }
      function formatDuration(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60; return (hours ? String(hours).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0"); }
      function timeOnly(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour12: false }); }
      function httpUrl(value) { try { const url = new URL(safeString(value)); return url.protocol === "http:" || url.protocol === "https:" ? url.href : ""; } catch (_) { return ""; } }
      function urlDomain(value) { try { const url = new URL(safeString(value)); return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : ""; } catch (_) { return ""; } }
    }());
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
