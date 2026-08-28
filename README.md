# Research Harness（自动化调研 Agent）

[English README](./README.en.md)

以证据为中心的自动化网络调研 harness：规划问题 → 并行多角色检索 → 保存明确来源 → 仅基于收集到的证据综合出报告；来源不足或引用不一致时直接失败，不编造内容。支持三种执行器（harness）：OpenAI Responses API、Codex CLI、Claude Code（含原生 subagent）。

- **多角色并行**：生态发现、技术尽调、投融资、Benchmark 复核、来源审计等角色分片并发检索（默认上限 `quick/standard/deep = 12/32/64` 个工作包）。
- **可验证输出**：每项事实带 `[S1]` 式可点击来源；同时生成 Markdown 与可离线检索的 HTML 报告。
- **机器校验**：规划/证据/综合三阶段均用 JSON Schema 约束输出，不合格自动无网修复，仍不合格则拒绝出报告。
- **凭据安全**：API key 仅从环境变量读取，不写入命令行、日志或报告。

## 环境要求

- Node.js ≥ 20
- 至少一种执行器：
  - `codex`：已安装 Codex CLI 并完成 `codex login`
  - `cc` / `claude`：已安装 Claude Code 并完成登录（`claude auth status` 可查）
  - `openai`：设置 `export OPENAI_API_KEY='...'`

## 安装与构建

```bash
npm install
npm run build
```

## 启动示例

### 方式一：一键示例脚本（推荐首次体验）

```bash
./examples/async-agentic-rl.sh                # 默认 codex，深度调研异步 Agentic RL
RH_HARNESS=cc RH_SUBWORK=hybrid ./examples/async-agentic-rl.sh   # 改用 Claude Code
RH_OUTPUT=reports/my.md ./examples/async-agentic-rl.sh "你自己的调研题目"
```

脚本自动构建并运行，完成后打开 `reports/*.html` 查看交互式报告。可用 `RH_*` 环境变量覆盖 harness、并发、输出路径等，见脚本头部注释。

### 方式二：CLI 直接调用

```bash
# Codex 执行器
npm start -- research "你的调研要求" \
  --harness codex --depth deep --max-agents 64 --concurrency 6 --heartbeat 5 \
  --out reports/result.md

# Claude Code 执行器（hybrid 模式开放 CC 原生 subagent）
npm start -- research "你的调研要求" \
  --harness cc --depth deep --subwork hybrid --concurrency 4 \
  --out reports/result.md

# OpenAI Responses 执行器
export OPENAI_API_KEY='...'
npm start -- research 'Palantir 公司的产品、客户与竞争格局' \
  --harness openai --depth deep --out reports/palantir.md
```

一次运行同时生成 `result.md` 和同名 `result.html`。运行中持续输出心跳与进度到 stderr，不会静默等待。

可选：用 `--seed path/to/参考.html` 传入本地参考页作为待核验基线（先解析成实体再分片送给 agent）。

### 方式三：HTTP API（本地服务）

```bash
export RESEARCH_HARNESS_API_TOKEN='长随机密钥'
npm start -- serve --host 127.0.0.1 --port 8787
# 浏览器打开 http://127.0.0.1:8787/ui 输入该 token 即可使用

curl http://127.0.0.1:8787/v1/research \
  -H "Authorization: Bearer $RESEARCH_HARNESS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"深度调研 Palantir","harness":"cc","depth":"deep","subworkMode":"hybrid","concurrency":4}'
```

仅绑定本机，勿直接暴露公网。

## 常用参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `--harness` | 执行器：`codex` / `cc` / `openai` | `codex` |
| `--depth` | 深度：`quick` / `standard` / `deep` | `standard` |
| `--subwork` | 子任务模式：`delegated` / `native` / `hybrid` | `delegated` |
| `--concurrency` | 同时运行的工作包数 | `4` |
| `--max-agents` | 工作包总数上限（依深度 12/32/64） | 按深度 |
| `--max-queries` / `--max-sources` | 查询数 / 每包证据预算 | `6` / 按深度 |
| `--seed` | 本地参考页（.html/.json）作为待核验基线 | 无 |
| `--out` / `--html-out` | 输出 Markdown / HTML 路径 | `reports/` 下 |
| `--heartbeat` | 心跳秒数；`--log-format json` 输出逐行 JSON 事件 | `5` |

## 测试与文档

```bash
npm test        # 完全离线，不消耗 token
npm run check   # build + test
```

- 详细手册：[docs/使用手册.zh-CN.md](./docs/使用手册.zh-CN.md)
- 目标架构：[RESEARCH_OS_ARCHITECTURE.md](./RESEARCH_OS_ARCHITECTURE.md)
- 87 个相关项目调研：[AUTORESEARCH_LANDSCAPE_50.md](./AUTORESEARCH_LANDSCAPE_50.md)
