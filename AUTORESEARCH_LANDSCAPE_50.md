# AutoResearch / AutoSurvey 前沿项目调研与架构取舍

> 调研快照：2026-08-25。本文不是按 star 数量做榜单，而是为了回答一个工程问题：怎样构建一个可接管 Codex、Claude Code、Gemini CLI 或 API agent，能并发、递归下钻、处理别名、保留叶节点证据、持续输出进度，并最终生成密集超链接报告的 npm harness。

## 1. 调研口径

- 优先阅读项目官方仓库、官方技术报告、论文和规范；表中的项目名本身就是原始链接。
- “项目”被分成研究执行系统、研究模型/训练方法、自动综述、harness/基础设施、评测五类。它们解决的问题不同，不能用同一把尺子比较。
- “吸收”表示进入目标架构；“借鉴”表示只采用局部机制；“隔离”表示可作为 worker，但不能支配系统事实层；“不采用”表示已明确排除相应做法。
- 表中结论是对公开设计的工程归纳，不代表项目作者的原话。版本会变化，所以实现必须做运行时 capability probe，不能把某个 CLI 的今天行为硬编码成永久事实。

## 2. 已核验项目矩阵（87 项）

### A. 深度检索系统与研究模型（1–28）

| # | 项目/原始来源 | 可迁移的关键设计 | 本项目取舍 |
|---:|---|---|---|
| 1 | [LangChain Open Deep Research](https://github.com/langchain-ai/open_deep_research) | 可配置搜索/API/MCP，规划与研究分离，并直接接 DeepResearch Bench | 吸收其 provider/tool 可替换性；证据图和引用编译改为更强约束 |
| 2 | [DeerFlow 2](https://github.com/bytedance/deer-flow) | 从单一 deep-research 流程改写为带 filesystem、memory、skills、sandbox、subagents 的通用 harness | 吸收“研究是 harness 上的一种 skill”，但保持研究内核独立于 UI |
| 3 | [GPT Researcher](https://github.com/assafelovic/gpt-researcher) | planner、并发 research questions、publisher、来源跟踪 | 吸收问题并发和报告发布分层；拒绝仅按固定问题数停止 |
| 4 | [STORM / Co-STORM](https://github.com/stanford-oval/storm) | 多视角专家访谈、问题追问、动态 mind map、先提纲后写作 | 吸收“视角覆盖”和 outline-first；将人物模拟降级为查询生成策略而非证据 |
| 5 | [MindSearch](https://github.com/InternLM/MindSearch) | WebPlanner 生成动态图，WebSearcher 分层并发，覆盖数百网页 | 吸收动态图和 frontier 扩展；每个节点须返回 EvidencePacket |
| 6 | [Tongyi DeepResearch](https://github.com/Alibaba-NLP/DeepResearch) | 端到端 deep-research agent、工具调用、训练与复现评测 | 允许作为受控 research worker；架构不绑定其模型 |
| 7 | [WebDancer](https://github.com/Alibaba-NLP/DeepResearch/blob/main/WebAgent/README.md#webdancer) | 原生 ReAct 搜索轨迹，数据构建、SFT、RL 分阶段训练 | 借鉴长轨迹数据飞轮；在线产品不暴露推理链 |
| 8 | [WebSailor](https://github.com/Alibaba-NLP/DeepResearch/blob/main/WebAgent/README.md#websailor) | 面向高不确定复杂检索的轨迹重建、冷启动和 RL | 借鉴困难样本课程与失败重放；不把 benchmark 分数等同于报告可信度 |
| 9 | [WebWatcher](https://github.com/Alibaba-NLP/DeepResearch/blob/main/WebAgent/README.md#webwatcher) | 搜索、访问、图片和代码联合的视觉语言研究 | 借鉴 PDF/图表/截图多模态证据；必须保留页码、框选范围和 OCR 置信度 |
| 10 | [WebShaper](https://github.com/Alibaba-NLP/DeepResearch/blob/main/WebAgent/README.md#webshaper) | 把 information-seeking 形式化并合成 agentic 训练数据 | 借鉴查询图/训练样本合成；合成事实不得进入真实报告证据层 |
| 11 | [WebThinker](https://github.com/dlbenniao/AgentRL-WebThinker) | think-search-draft 一体化、深层网页遍历、报告检查与编辑 | 吸收“检索后检查再修订”；拆开 writer 与 verifier 避免自证 |
| 12 | [Hugging Face Open Deep Research](https://github.com/huggingface/smolagents/blob/main/examples/open_deep_research/README.md) | CodeAgent 用代码组织工具结果，适合多步聚合与文件处理 | 代码 worker 放进无凭据 sandbox；不能直接写入证据库或宿主工作区 |
| 13 | [OWL](https://github.com/camel-ai/owl) | CAMEL 多 agent、丰富工具包、MCP、GAIA 流程 | 借鉴角色/工具组合；由中央 scheduler 而非 agent 自由无限派生 |
| 14 | [Jina node-DeepResearch](https://github.com/jina-ai/node-DeepResearch) | Search→Read→Reason 循环，按答案或 token budget 收敛 | 借鉴轻量迭代 reader；不采用“模型说已足够”作为唯一停止条件 |
| 15 | [Local Deep Research](https://github.com/LearningCircuit/local-deep-research) | 多搜索引擎、多策略、缓存、限速、本地运行、WebSocket 进度与 benchmark | 吸收 provider 聚合、缓存、实时事件和隐私 profile |
| 16 | [Onyx](https://github.com/onyx-dot-app/onyx) | 企业知识连接器、权限感知、混合检索与 deep research | 借鉴 connector ACL 和内部/外部证据域隔离 |
| 17 | [Khoj](https://github.com/khoj-ai/khoj) | 私人文档+互联网、自定义 agent、定时研究、本地部署 | 借鉴用户知识域、scheduled run；长期记忆必须标注来源和时效 |
| 18 | [Vane（原 Perplexica）](https://github.com/ItzCrazyKns/Vane) | SearXNG、多搜索模式、文件与隐私优先的答案引擎 | 吸收本地元搜索选项；名字变更证明实体注册表要存旧称和 alias |
| 19 | [Search-R1](https://github.com/PeterGriffinJin/Search-R1) | 用结果奖励训练交错推理/搜索，搜索服务与训练解耦 | 借鉴 search backend 分离和轨迹回放；不在第一版内置训练栈 |
| 20 | [O-Researcher](https://github.com/OPPO-PersonalAI/O-Researcher) | 多 agent 数据合成、SFT/RL、并发 worker 和缓存 | 借鉴离线 data flywheel；真实证据与合成训练数据严格分库 |
| 21 | [OpenResearcher](https://arxiv.org/abs/2603.20278) | 离线大语料、search/open/find 工具、长尾超长工具轨迹 | 借鉴长轨迹压力测试与离线可复现 corpus；不把离线覆盖冒充 live web |
| 22 | [DeepWeaver](https://github.com/KlozeWang/DeepWeaver) | 针对长上下文证据推理与 synthesis gap 设计 Thought Block Chains | 借鉴分块证据压缩和跨块冲突检查；持久化的是公开摘要，不是私密思维 |
| 23 | [Magentic-One](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/magentic-one.html) | orchestrator 协同 WebSurfer、FileSurfer、Coder、Terminal 专家 | 借鉴专用 worker 和 stall/replan；新实现优先接其继任者 Agent Framework |
| 24 | [DR Tulu](https://github.com/rlresearch/dr-tulu) | MCP 工具、高并发 async agent、SFT 与 evolving-rubric RL、完整评测脚本 | 将开源 research model 作为可插拔 worker；借鉴 evolving rubrics 做难例回归 |
| 25 | [AgentCPM](https://github.com/OpenBMB/AgentCPM) | Explore 做长程深搜；Report 采用 drafting/deepening 交错并支持本地知识库 | 借鉴“先草稿暴露缺口，再定向加深”，特别适合中文和本地私有材料 |
| 26 | [MiroThinker](https://github.com/MiroMindAI/MiroThinker) | 长上下文、大量工具轮次、验证、中文 benchmark、防污染检查 | 吸收 canary/污染检测和长程预算档；结果必须由独立引用验证器复核 |
| 27 | [MiroFlow](https://github.com/arcodergh/miroflow) | 可复现 research-agent framework、工具库、trace 收集和多 benchmark | 可作为额外 harness adapter 候选；trace 先归一化再进事件流 |
| 28 | [DiffResearch](https://github.com/alanrbtx/DiffResearch) | 同时支持开源推理服务与闭源模型的 autonomous research 框架 | 借鉴本地/远程模型统一配置；不让 provider schema 泄漏到领域模型 |

### B. AutoSurvey、科学综述与研究自动化（29–41）

| # | 项目/原始来源 | 可迁移的关键设计 | 本项目取舍 |
|---:|---|---|---|
| 29 | [AutoSurvey](https://github.com/AutoSurveys/AutoSurvey) | 检索→提纲→专门小节写作→整合/精炼→多模型评审 | 吸收 subsection work packet 和 merge critic；引用必须落到原论文位置 |
| 30 | [IterSurvey / AutoSurvey v2](https://github.com/HancCui/IterSurvey_Autosurveyv2) | 迭代提纲、稳定性检查、review/refine 循环与 Survey-Arena | 用 outline stability 作为停止信号之一，不能替代证据覆盖率 |
| 31 | [SurveyX](https://github.com/IAAR-Shanghai/SurveyX) | preparation/generation 分层、AttributeTree、重润色 | 借鉴属性树形成 coverage ontology；补上在线检索、别名与多模态叶证据 |
| 32 | [SurveyForge](https://github.com/InternScience/SurveyForge) | 人类提纲启发、scholar navigation、memory-driven 生成/精炼 | 借鉴学术引用图导航和领域 outline seed；memory 节点必须有出处 |
| 33 | [InteractiveSurvey](https://github.com/TechnicolorGUO/InteractiveSurvey) | 用户定制、论文解析/描述、聚类、提纲、小节和多模态内容 | 吸收 human steering 与主题聚类；聚类不应吞掉反例或少数观点 |
| 34 | [ARISE](https://github.com/ziwang11112/ARISE) | rubric-guided retrieval、drafting、editing、refinement | 把用户 brief 编译成可执行 rubric 与 coverage cells |
| 35 | [PaperQA2](https://github.com/Future-House/paper-qa) | agentic RAG、元数据核对、证据排序/上下文化摘要、矛盾模式 | 吸收学术 profile、Crossref/Semantic Scholar 元数据和 contradiction pass |
| 36 | [OpenScholar](https://github.com/AkariAsai/OpenScholar) | 面向科学文献的开放检索增强生成与引用式综合 | 作为 academic retrieval worker；网页事实仍走通用 provenance traversal |
| 37 | [AI Scientist](https://github.com/SakanaAI/AI-Scientist) | 创意、反思、新颖性搜索、实验、论文与审稿完整闭环 | 借鉴 reviewer/novelty 分工；执行不可信代码必须用独立强 sandbox |
| 38 | [AI Scientist v2](https://github.com/SakanaAI/AI-Scientist-v2) | progressive agentic best-first tree search，并行探索实验路线 | 吸收 best-first frontier 与分支淘汰；不复制其高风险宿主执行方式 |
| 39 | [Agent Laboratory](https://github.com/SamuelSchmidgall/AgentLaboratory) | 人类协作的端到端研究工作流和多专职 agent | 借鉴 approval gates 与 researcher/reviewer/editor 分工 |
| 40 | [ASReview](https://github.com/asreview/asreview) | 主动学习辅助系统综述筛选，透明保留人工标签 | 吸收大候选集的 active screening；高影响排除项提供人工复核队列 |
| 41 | [DeepScholar](https://github.com/guestrin-lab/deepscholar) | 文献调研 pipeline、数据集脚本和多维评测 | 借鉴端到端 scientific report eval；与通用 web benchmark 分开计分 |

### C. Harness、并发、工具、记忆与可观测性底座（42–68）

| # | 项目/原始来源 | 可迁移的关键设计 | 本项目取舍 |
|---:|---|---|---|
| 42 | [OpenAI Codex CLI](https://github.com/openai/codex) | 本地 coding harness、非交互执行、事件输出、sandbox、结构化最终输出 | 做一等 `codex` adapter；原生 schema、只读 research workspace、事件归一化 |
| 43 | [Claude Code](https://github.com/anthropics/claude-code) | 原生 subagents/Agent tool、hooks、MCP、流式 JSON | 做一等 `cc` adapter；保留原生父子关系，并在外层再做跨 harness 并发 |
| 44 | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | headless JSONL、subagents、隔离上下文/工具/MCP/策略 | 做一等 `gemini` adapter；以 capability probe 决定并行与策略能力 |
| 45 | [Deep Agents](https://github.com/langchain-ai/deepagents) | filesystem、subagents、context、skills、LangGraph durability | 借鉴 context engineering 和 subagent 文件式交付；证据层保持框架中立 |
| 46 | [LangGraph](https://github.com/langchain-ai/langgraph) | 低层状态图、checkpoint、durable execution、HITL | 借鉴事件溯源、暂停/恢复、幂等 Task DAG；npm 内核自有轻量实现 |
| 47 | [OpenAI Agents SDK for JS](https://github.com/openai/openai-agents-js) | typed agent、handoff、nested tools、structured output、trace | API adapter 可直接复用；领域证据 schema 仍由 Research OS 定义 |
| 48 | [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | AutoGen/Semantic Kernel 的生产继任者；并发、handoff、checkpoint、streaming、HITL | 新的 Microsoft 集成优先选它，不再以 AutoGen 作为长期主干 |
| 49 | [AutoGen](https://github.com/microsoft/autogen) | Core/AgentChat/Extensions 分层和成熟 multi-agent 模式 | 只作兼容 adapter/设计参考；官方已引导新用户迁移到 Agent Framework |
| 50 | [CrewAI](https://github.com/crewAIInc/crewAI) | crews、flows、角色化任务和流程状态 | 借鉴 crew/flow 分离；角色 prompt 不代替权限、schema 和事实隔离 |
| 51 | [PydanticAI](https://github.com/pydantic/pydantic-ai) | 强类型输出/依赖、model-agnostic、OTel、evals、多层 multi-agent | 借鉴 schema-first adapter 和 observability；TS 端用 Zod/JSON Schema 对应实现 |
| 52 | [LlamaIndex](https://github.com/run-llama/llama_index) | 大量数据连接器、索引和 agentic retrieval | connector/academic/RAG 插件来源；不把向量相似度当引用蕴含关系 |
| 53 | [Llama Agents / Workflows](https://github.com/run-llama/llama-agents) | 事件驱动 async steps、streaming、持久化、HITL、可插拔 durability | 借鉴 event-first workflow 和恢复协议 |
| 54 | [Haystack Agents](https://github.com/deepset-ai/haystack/blob/main/docs-website/docs/concepts/agents.mdx) | typed State、AgentTool 嵌套 agent、可搜索 toolset、MCP、HITL、streaming | 借鉴 typed shared state 和按需工具发现；worker 默认最小权限 |
| 55 | [Semantic Kernel](https://github.com/microsoft/semantic-kernel) | plugins、process、multi-agent orchestration 与并发模式 | 作为企业 .NET/Python adapter 参考；核心协议不绑定 SK |
| 56 | [Agno](https://github.com/agno-agi/agno) | agent/team/workflow、工具、知识、记忆与监控一体化 | 借鉴团队级 session 状态；证据 provenance 不写入不可解释的聊天记忆 |
| 57 | [Model Context Protocol](https://github.com/modelcontextprotocol/modelcontextprotocol) | JSON-RPC tools/resources/prompts、能力协商、授权与扩展 | 作为 search/crawl/archive/evidence 工具总线；server 分权限域和网络域 |
| 58 | [Agent Protocol](https://github.com/langchain-ai/agent-protocol) | Runs、Threads、Store 与流式事件的互操作协议 | 借鉴外部控制面 API；内部 Evidence Graph 仍需更细的领域事件 |
| 59 | [Browser Use](https://github.com/browser-use/browser-use) | agent 优化浏览器控制、持久浏览器状态、CLI/skills | 仅用于普通抓取失败后的升级通道；隔离 cookie、下载和 prompt injection |
| 60 | [Firecrawl](https://github.com/firecrawl/firecrawl) | search/scrape/crawl/map/extract、Markdown/JSON、MCP/CLI | 作为 acquisition provider；输出先归档快照再交 agent 阅读 |
| 61 | [Crawl4AI](https://github.com/unclecode/crawl4ai) | 开源 crawler、结构化抽取、并发与浏览器策略 | 本地/self-host crawl adapter；遵守 robots、限速和站点政策 |
| 62 | [GraphRAG](https://github.com/microsoft/graphrag) | 实体/关系抽取、社区层次和 global/local search | 借鉴 corpus map 与主题层次；模型生成关系只算候选，不算事实 |
| 63 | [LightRAG](https://github.com/HKUDS/LightRAG) | 轻量图+向量双层检索、增量更新 | 用作大规模已归档语料导航；最终引用仍回到原文 passage |
| 64 | [R2R](https://github.com/SciPhi-AI/R2R) | production RAG、ingestion、hybrid search、知识图和 API | 借鉴 ingestion/job API；Research OS 保持可替换存储后端 |
| 65 | [Graphiti](https://github.com/getzep/graphiti) | 时间感知 episodic knowledge graph、事件有效期 | 吸收双时间模型：事件发生时间与来源发布/抓取时间分开存 |
| 66 | [Mem0](https://github.com/mem0ai/mem0) | user/session/agent 多层记忆和可插拔存储 | 只存用户偏好、已验证实体和研究历史；事实记忆必须带证据与过期策略 |
| 67 | [Langfuse](https://github.com/langfuse/langfuse) | trace、成本/延迟、tool/retrieval spans、dataset、experiment、eval | OpenTelemetry exporter 候选；不向遥测平台发送机密文档正文或 token |
| 68 | [Phoenix](https://github.com/Arize-ai/phoenix) | OpenInference/OTel trace、eval、dataset、experiment、agent/tool/retrieval 观察 | 本地可观测/eval 后端候选；公开进度流与内部调试 trace 分层 |

### D. Deep Research / Survey / Agent 评测（69–87）

| # | 项目/原始来源 | 它真正测什么 | 本项目采用方式 |
|---:|---|---|---|
| 69 | [DeepResearch Bench](https://github.com/Ayanami0730/deep_research_bench) | 100 个中英 PhD 级任务；RACE 报告质量，FACT 引用有效性/丰富度 | 作为中英长报告主基准；增加确定性链接与叶节点指标 |
| 70 | [DeepResearch Bench II](https://github.com/imlrz/DeepResearch-Bench-II) | 从专家报告拆出层级 rubric，诊断 presentation/analysis/evidence 缺口 | 用细粒度 rubric 定位漏项，不只看一个总分 |
| 71 | [FutureSearch Deep Research Bench](https://futuresearch.ai/deep-research-bench/) | 冻结网页快照、专家答案和 agent trace，重视复现 | 建离线回归 corpus；与 live-web 评测双轨运行 |
| 72 | [LiveDRBench](https://github.com/microsoft/LiveDRBench) | 答案随现实变化的客观 deep-research 任务 | 测 freshness、时间语义和重新验证，而不是复用旧缓存 |
| 73 | [Mind2Web‑2](https://github.com/OSU-NLP-Group/Mind2Web-2) | 长程、复杂、实时、带引用的 agentic search；缓存引用网页并 agent-as-judge | 采用其 answer+web cache 复现方式；另加确定性 citation verifier |
| 74 | [BrowseComp / simple-evals](https://github.com/openai/simple-evals/blob/main/browsecomp_eval.py) | 难找事实的浏览检索；参考实现已进入维护状态 | 测深搜能力，不拿它替代长报告完整性评测 |
| 75 | [BrowseComp‑Plus](https://github.com/texttron/BrowseComp-Plus) | 固定、人工核验的大语料隔离 retrieval 与 agent 行为 | 用来测 alias/query/leaf traversal 的纯检索召回 |
| 76 | [GAIA2 / Meta Agents Research Environments](https://github.com/facebookresearch/meta-agents-research-environments) | 动态环境、失败与歧义、成本/时间、A2A 等现实 agent 能力 | 测 harness 韧性、动态性和 normalized cost，而非报告文采 |
| 77 | [AgentCompass](https://github.com/open-compass/AgentCompass) | 将 task/scorer 与 harness/environment provider 分离的多 benchmark 体系 | 直接吸收“评测不绑定执行器”的 contract 设计 |
| 78 | [ReportBench](https://github.com/ByteDance-BandAI/ReportBench) | cited claim 抓取/段落对齐，uncited claim 再上网验证，并有专家报告参照 | 引用 completeness/entailment 核心基准；对数字和直接引语再做确定性核对 |
| 79 | [SurveyBench](https://github.com/OpenDataBox/SurveyBench) | 从读者视角评自动 survey generation | 学术 profile 的可读性与覆盖指标；不用于一般公司情报 |
| 80 | [SurveyLens](https://github.com/TechnicolorGUO/SurveyLens) | 多学科、discipline-aware、基于真实人类综述的评测 | 验证不同学科 outline/写作偏差 |
| 81 | [DeepScholar](https://github.com/guestrin-lab/deepscholar) | scientific deep research 的数据、pipeline 和 holistic metrics | 作为学术端到端回归套件 |
| 82 | [DeepResearchEval](https://github.com/Infinity-AILab/DeepResearchEval) | 自动构造 deep-research 任务并做 agentic evaluation | 借鉴持续生成新题；生成题必须经过污染/可验证性审核 |
| 83 | [Promptfoo](https://github.com/promptfoo/promptfoo) | npm 友好的模型/agent eval、CI 与 prompt-injection/RAG poisoning red-team | 第一版安全与回归测试底座候选 |
| 84 | [DeepEval](https://github.com/confident-ai/deepeval) | LLM 应用单测、RAG/agent 指标与 tracing | 用作快速组件级 judge；关键门槛不能全部交给 LLM judge |
| 85 | [Ragas](https://github.com/vibrantlabsai/ragas) | RAG 检索/答案评估、实验数据集与指标 | 测 passage retrieval/context 指标；增加 provenance leaf 指标 |
| 86 | [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | 可复现实验、任务/solver/scorer、sandbox 与 agent eval | 高风险工具 worker 的隔离评测和可复现实验候选 |
| 87 | [ScienceAgentBench](https://github.com/OSU-NLP-Group/ScienceAgentBench) | 数据驱动科学发现任务、工具使用与可执行产物 | 测 code/data research profile；与开放网页情报 profile 分开 |

## 3. 从 87 个项目收敛出的目标架构

### 3.1 研究 harness 是内核，不是一次 LLM 调用

四层必须分离：

```text
Control Plane
  ├─ Run / Task DAG / budget / checkpoint / event stream
  ├─ Harness adapters: codex | cc | gemini | openai-api | custom
  ├─ Research services: search | read | crawl | browser | archive | parse
  └─ Evidence OS: ontology | claim graph | provenance | citation compiler
```

`--harness codex` 或 `--harness cc` 决定谁执行 work packet，而不是只更换模型名。Adapter 启动时探测 schema output、stream format、resume、native subagent、MCP、sandbox、取消等能力；能力不足时显式降级，不能假装支持。

### 3.2 两级并发，满足 CC subagent / subwork 要求

```text
Run scheduler（跨 harness）
  ├─ WP-1 公司/人物 ── cc lead ── native subagents...
  ├─ WP-2 技术/论文 ── codex session
  ├─ WP-3 融资/工商 ── gemini session
  └─ WP-4 反证/争议 ── cc session
                          ↓
                  reducer → evidence graph
```

- **外层 delegated concurrency**：npm scheduler 按 DAG 同时拉起多个 Codex/CC/Gemini/API session，因此不会受某一个 harness 的 subagent 实现限制。
- **内层 native concurrency**：如果 CC/Codex/Gemini 当前版本支持原生 subagent，lead 可以在一个 work packet 内继续拆分；其父子事件保留到统一事件树。
- 每个 worker 只能提交结构化 `EvidencePacket`、`GapPacket` 或 `VerificationPacket`，不能用自己的整篇报告覆盖他人的工作。
- 限制 `maxConcurrent`、`maxNativeFanout`、`maxDepth`、域名并发、token/费用/工具调用；实现取消传播、超时、重试、cycle detection 和幂等键。

### 3.3 查询图先做实体/语义展开，再做检索

对每个主题建立 `Entity → Alias → Relation → QueryFamily` 图：

1. 精确名、简称、旧称、产品名、法人/品牌名；
2. 中文、英文、拼音/音译/转写、常见错拼；
3. 上位词、下位词、行业术语、技术同义表达；
4. 人物—公司—产品—融资—论文—数据集—客户—事件关系模板；
5. 否定词、争议说法和反方表达；
6. 新来源发现的新 alias/关系反哺 frontier。

同义改写不能只靠 embedding。实体合并同时要求 lexical/semantic 候选、时间与关系一致性、可定位来源；涉及不同主体、不同时间、数值、模态或因果强度时不得自动合并。

### 3.4 自适应 frontier，递归到真正叶节点

检索采用逐级升级：元搜索/API → reader → crawler → browser → 文件/PDF/表格/视频解析。每个命中先归档快照，再提取 passage、claim 和上游引用。若网页说“据某报告/访谈/数据”，Provenance Traverser 继续沿链接、脚注、附件、引用、数据说明向上游走。

停止条件不是 `maxQueries=6`，而是综合以下量：

- 高优先级 coverage cells 是否达到来源类型、独立来源簇和新鲜度要求；
- 重要 claim 是否到达适合其类别的一手叶节点；
- 支持与反证是否都已搜索；
- 最近若干轮新增独立 claim/高质量 source/alias 的边际收益；
- 未解决 gap、预算和硬上限。

融资数字应下钻到公司公告、投资方公告、监管/工商/招股材料；论文结论到论文段落/表格；直接引语到原始采访/演讲时间戳；新闻只能在找不到上游时以“媒体报道”限定措辞。

### 3.5 报告只是 Evidence Graph 的一个视图

核心对象不是 Markdown，而是：

```text
Entity ─alias─ EntitySurface
Claim ─supports/contradicts/contextualizes─ Evidence
Evidence ─located_at─ Passage ─part_of─ Snapshot ─from─ Source
Claim ─about─ Entity / Metric / Event / Quote
```

`ReportAST` 中每个 material span 都带 `claimIds + citationAnchors`。第一次重要人物/公司/产品出现、直接引语、融资额、百分比、日期、排名、关键事件和事实判断，都渲染成短语级超链接。CitationAnchor 存原始 URL、快照 hash、抓取时间和精确 selector；网页用 quote/DOM/text-fragment，PDF 用 page+bbox，表格用 sheet+range，影音用 timestamp。

### 3.6 进度流输出公开工作产物，不输出私密思维链

CLI/SSE/UI 共享 append-only events。只要 run 未结束，5 秒内至少有一次真实活动或 heartbeat：

```text
[11:37:22] [检索图] 新增 8 个别名、4 个反证查询；frontier 31
[11:37:27] [CC 子任务 2/8] 正在追溯“融资额”上游：媒体 → 投资方公告
[11:37:32] [证据] 已归档 46 个来源；21 个 claim 到达一手叶节点
[11:37:37] [覆盖率 63%] 算法/benchmark 充分；创始人观点仍缺原始访谈
```

Heartbeat 包含 stage、active/queued/completed tasks、当前公开工作项、source/evidence/leaf/gap 数量、coverage delta、费用/token/时间。禁止虚构“正在思考”；没有新产物时明确显示当前阻塞点、重试或等待的工具。

### 3.7 Web 内容默认不可信

网页、PDF 和搜索摘要只是数据，不能获得工具权限，也不能把其中的“忽略上文/执行命令/泄露密钥”当指令。Fetcher 与 agent runtime 分容器/权限域；浏览器无宿主凭据；code worker 无生产密钥；下载文件隔离；所有写 Evidence Graph 的动作过 schema、URL、内容类型、引用和权限验证。

## 4. 评测闭环：不是“能生成一篇长文”就算成功

至少建立六层测试：

1. **确定性 contract**：adapter 事件归一化、schema/repair、取消、超时、恢复、幂等、并发合并。
2. **检索能力**：alias recall、query-family coverage、深层 leaf recall、重复源簇识别、反证召回。
3. **证据质量**：claim-passage entailment、quote exact match、数字/单位/日期一致、primary-leaf rate、独立来源簇。
4. **报告质量**：material-claim link completeness 必须 100%；再测深度、覆盖、可读性和指令遵循。
5. **实时与复现**：同一套能力分别跑冻结快照和 live benchmark，记录模型、工具、网页快照、时间、成本。
6. **对抗安全**：网页 prompt injection、RAG poisoning、恶意 PDF、下载执行、citation cycle、link rot、错 OCR、翻译转载、benchmark 污染。

第一阶段 release gate：离线 contract 全绿；模拟 corpus 中 100% material spans 有合法 anchor；直接引语/数字 deterministic match；worker 失败不丢其他 worker 证据；SSE 从连接到 terminal event 无静默窗口；注入网页不能触发额外工具授权。

## 5. 明确不采用的设计

- 不承诺“搜索整个互联网”；承诺可量化覆盖、访问盲区说明和未验证 gap。
- 不用固定 N 个查询伪装“deep”；N 只是硬预算上限。
- 不让 planner 的一段 JSON 失败毁掉已做研究；原生 structured output + 本地容错 + 单次无搜索 repair + checkpoint。
- 不用“更多 agent”代替任务正交性；并发前先做 coverage partition 和去重。
- 不把搜索摘要、二手转载、LLM 记忆、合成训练数据当叶证据。
- 不让 writer 自己决定其引用是否正确；citation compiler 与 verifier 独立。
- 不暴露私密 chain-of-thought；给用户的是可验证查询、来源、证据摘要、coverage 和 task tree。
- 不复制 `--dangerously-skip-permissions`、关闭 sandbox 或让网页内容控制终端的示例做法。

## 6. 落地优先级

**P0 — 可信可运行**：Codex/CC adapter、JSON Schema 与 repair、append-only event/SSE、Task DAG、EvidencePacket、source snapshot、基础 citation gate、离线测试。

**P1 — 真正深搜**：实体/alias graph、query families、自适应 frontier、provenance traverser、独立来源簇、反证 worker、phrase-level ReportAST 超链接。

**P2 — 大规模与持久化**：CC native subagent 事件桥接、跨 harness scheduler、Postgres/graph storage、checkpoint/resume、浏览器升级通道、PDF/表格/影音 selector、OTel。

**P3 — eval/data flywheel**：冻结 corpus + live benchmark、DeepResearch Bench/ReportBench/Mind2Web-2 adapter、失败样本聚类、rubric 演化、人工复核队列、可选开源 research model worker。
