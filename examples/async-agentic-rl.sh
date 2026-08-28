#!/usr/bin/env bash
set -euo pipefail

# 可复现示例：深度调研“异步 Agentic RL 的学界与工业界现状”。
#
# 最常用的覆盖项：
#   RH_HARNESS=cc RH_SUBWORK=hybrid ./examples/async-agentic-rl.sh
#   RH_CONCURRENCY=4 RH_MAX_AGENTS=32 ./examples/async-agentic-rl.sh
#   RH_OUTPUT=reports/my_report.md ./examples/async-agentic-rl.sh "你自己的调研题目"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

RH_HARNESS="${RH_HARNESS:-codex}"
RH_MODEL="${RH_MODEL:-}"
RH_DEPTH="${RH_DEPTH:-deep}"
RH_SUBWORK="${RH_SUBWORK:-hybrid}"
RH_MAX_QUERIES="${RH_MAX_QUERIES:-6}"
RH_MAX_AGENTS="${RH_MAX_AGENTS:-64}"
RH_ENTITIES_PER_AGENT="${RH_ENTITIES_PER_AGENT:-12}"
RH_MAX_SOURCES="${RH_MAX_SOURCES:-20}"
RH_CONCURRENCY="${RH_CONCURRENCY:-6}"
RH_HEARTBEAT="${RH_HEARTBEAT:-5}"
RH_OUTPUT="${RH_OUTPUT:-reports/async_agentic_rl_example.md}"
RH_HTML_OUTPUT="${RH_HTML_OUTPUT:-${RH_OUTPUT%.*}.html}"
RH_SEED="${RH_SEED:-}"
RH_DRY_RUN="${RH_DRY_RUN:-0}"

DEFAULT_TOPIC='深度调研异步 Agentic Reinforcement Learning（异步智能体强化学习、asynchronous agentic RL、async rollout、decoupled acting and learning、off-policy agent RL）的当前学界与工业界研究现状。系统梳理概念边界、同义词与相邻范式；训练和推理架构；异步 rollout、actor-learner 解耦、策略陈旧性、off-policy 校正、长程工具调用、多 Agent 并发与环境调度；代表论文、实验室、公司、开源框架和产品；Benchmark、可复现结果、吞吐和成本指标；工业部署案例；研究者观点；失败模式、安全风险、争议和尚未解决的问题。追溯至论文、官方技术报告、代码仓库、模型卡、演讲或公司原始公告等叶节点，每项重要事实、数字和引语必须附超链接，并区分厂商自报、论文实验与独立复测。'
TOPIC="${1:-${DEFAULT_TOPIC}}"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js；需要 Node.js 20 或更高版本。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm。" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "错误：尚未安装依赖。请先在项目目录运行 npm install。" >&2
  exit 1
fi

case "${RH_HARNESS}" in
  codex)
    if ! command -v "${CODEX_COMMAND:-codex}" >/dev/null 2>&1; then
      echo "错误：未找到 Codex CLI。请先安装并执行 codex login。" >&2
      exit 1
    fi
    ;;
  claude|cc)
    if ! command -v "${CLAUDE_COMMAND:-claude}" >/dev/null 2>&1; then
      echo "错误：未找到 Claude Code CLI。请先安装并登录。" >&2
      exit 1
    fi
    ;;
  openai)
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      echo "错误：RH_HARNESS=openai 时必须设置 OPENAI_API_KEY。" >&2
      exit 1
    fi
    ;;
  *)
    echo "错误：RH_HARNESS 只能是 codex、cc、claude 或 openai。" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname -- "${RH_OUTPUT}")" "$(dirname -- "${RH_HTML_OUTPUT}")"

echo "[示例] 构建 Research Harness…"
npm run build

ARGS=(
  research "${TOPIC}"
  --harness "${RH_HARNESS}"
  --depth "${RH_DEPTH}"
  --subwork "${RH_SUBWORK}"
  --max-queries "${RH_MAX_QUERIES}"
  --max-agents "${RH_MAX_AGENTS}"
  --entities-per-agent "${RH_ENTITIES_PER_AGENT}"
  --max-sources "${RH_MAX_SOURCES}"
  --concurrency "${RH_CONCURRENCY}"
  --heartbeat "${RH_HEARTBEAT}"
  --out "${RH_OUTPUT}"
  --html-out "${RH_HTML_OUTPUT}"
)

if [[ -n "${RH_MODEL}" ]]; then
  ARGS+=(--model "${RH_MODEL}")
fi

if [[ -n "${RH_SEED}" ]]; then
  ARGS+=(--seed "${RH_SEED}")
fi

echo "[示例] harness=${RH_HARNESS} depth=${RH_DEPTH} subwork=${RH_SUBWORK} concurrency=${RH_CONCURRENCY}"
echo "[示例] Markdown：${RH_OUTPUT}"
echo "[示例] HTML：${RH_HTML_OUTPUT}"
echo "[示例] 开始运行；实时进度将持续输出到终端。"

if [[ "${RH_DRY_RUN}" == "1" ]]; then
  printf '[示例] Dry run：npm start --'
  printf ' %q' "${ARGS[@]}"
  printf '\n'
  exit 0
fi

npm start -- "${ARGS[@]}"

echo "[示例] 完成。优先打开交互报告：${RH_HTML_OUTPUT}"
