export type ResearchDepth = "quick" | "standard" | "deep";

export type ResearchRoleId =
  | "ecosystem-discovery"
  | "technical-due-diligence"
  | "corporate-financing"
  | "founder-theses"
  | "product-adoption"
  | "benchmark-verification"
  | "counterevidence-compliance"
  | "source-audit";

export interface ResearchRole {
  readonly id: ResearchRoleId;
  readonly name: string;
  readonly minimumDepth: ResearchDepth;
  readonly objective: string;
  readonly queryStrategies: readonly string[];
  readonly preferredSources: readonly string[];
  readonly prohibitedInferences: readonly string[];
  readonly outputRequirements: readonly string[];
}

export interface RoleTaskContext {
  readonly topic: string;
  readonly depth: ResearchDepth;
  readonly language?: string;
  readonly brief?: string;
}

export interface RoleResearchTask {
  readonly id: `role:${ResearchRoleId}`;
  readonly roleId: ResearchRoleId;
  readonly roleName: string;
  readonly objective: string;
  readonly instruction: string;
}

const COMMON_OUTPUT_REQUIREMENTS = [
  "提交实际执行过的查询词、查询语言、检索入口和查询时间，保留没有结果的关键路线",
  "把结论拆成原子事实；每条事实附可直达正文、文件、记录或数据行的叶节点 HTTP(S) 链接",
  "逐条标注来源类型、发布日期或记录日期、置信度、适用时间范围和证据局限",
  "分别列出已证实事实、相互冲突的证据、尚未解决的问题以及建议交给其他角色的线索"
] as const;

export const RESEARCH_ROLES = [
  {
    id: "ecosystem-discovery",
    name: "生态与实体发现",
    minimumDepth: "quick",
    objective: "建立尽可能完整的实体、人物、产品、投资方与技术概念图谱，并识别别名、旧称、缩写和多语言表达。",
    queryStrategies: [
      "从主题词生成中英文术语簇、上下位概念、相邻概念、旧称、拼写变体和行业黑话，再分别检索",
      "沿公司→创始人→前雇主/实验室→产品→论文/代码→客户→投资方双向扩图，直到连续扩展不再出现新实体",
      "用行业名录、会议议程、孵化器/投资组合、招聘信息和专利作者做集合补漏，并与已知名单求差集",
      "按时间线查询公司成立、产品发布、改名、团队变动、融资和停止运营等状态变化"
    ],
    preferredSources: [
      "公司官网、产品文档、团队页、官方账号和可定位的发布记录",
      "论文、专利、代码仓库、会议议程和高校/实验室名录",
      "投资机构 portfolio、孵化器名单、行业协会和权威数据库",
      "高质量行业媒体仅用于发现线索，重要实体需回查一手来源"
    ],
    prohibitedInferences: [
      "不得因营销材料共享同一关键词就断言公司具有对应技术能力",
      "不得把同名人物或相似公司名合并；必须用履历、地域、产品或工商标识消歧",
      "不得把名单未收录推断为实体不存在，也不得把历史页面视为当前仍在运营"
    ],
    outputRequirements: [
      "输出实体清单及规范名、别名、旧称、英文名、实体类型、所在地和发现路径",
      "输出实体关系边和可继续下钻的叶节点队列，说明本轮停止扩展的理由",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "technical-due-diligence",
    name: "技术尽调",
    minimumDepth: "quick",
    objective: "复原项目在数据、训练、算法、Agent、系统工程和评测上的真实技术方案、实现成熟度与差异化。",
    queryStrategies: [
      "按实体联查论文、技术报告、专利、代码、模型卡、数据卡、系统卡、API 文档、更新日志和工程招聘描述",
      "把宣传能力拆为数据来源、训练目标、反馈回路、推理时机制、工具权限、记忆、部署约束和成本指标",
      "追踪论文引用、仓库 commit/release/issue、模型版本和作者流动，区分概念演示、原型、生产系统和停止维护",
      "用 competing approach、failure、limitation、ablation、reproducibility 等反向关键词寻找失败边界"
    ],
    preferredSources: [
      "同行评审论文、作者技术报告、补充材料和公开实验记录",
      "官方代码仓库的具体 commit、release、issue、模型卡和数据卡",
      "产品 API/SDK 文档、状态页、更新日志和技术演讲原始视频/文字稿",
      "独立复现、技术测评和安全评估用于交叉验证"
    ],
    prohibitedInferences: [
      "不得把愿景、路线图、招聘要求或专利申请等同于已经交付的能力",
      "不得把相关性描述成因果，把 demo 表现外推到生产可靠性，或用模型规模代替效果证据",
      "不得猜测未披露的数据集、训练算力、参数、成本或闭源系统架构",
      "不得把预印本、厂商自测和独立复现视为同等级证据"
    ],
    outputRequirements: [
      "按数据→训练→算法→Agent/系统→Benchmark 链条输出可核查技术卡，并区分披露、复现与推断",
      "为关键能力给出成熟度、最后验证时间、版本号、复现状态和已知失败模式",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "corporate-financing",
    name: "工商与投融资尽调",
    minimumDepth: "standard",
    objective: "核验公司的法律主体、股权与关键人员变化、融资轮次、投资方、金额、估值口径和资本市场事件。",
    queryStrategies: [
      "先确定公司中文全称、统一社会信用代码、历史名称、关联主体和境外持股实体，再检索资本事件",
      "逐轮交叉查询公司公告、投资方公告、基金 portfolio、监管披露、交易所文件、工商变更和主流财经报道",
      "在国家企业信用信息公示系统、企查查、天眼查等入口核对成立日期、股东、法定代表人和变更记录；聚合平台信息回查原始登记或公告",
      "区分注册资本、认缴/实缴资本、融资金额、累计融资、投后估值和媒体估算，并记录币种与公告日期"
    ],
    preferredSources: [
      "国家企业信用信息公示系统及地方市场监管、司法和知识产权公开记录",
      "证监会、交易所、港交所/SEC 等监管或上市申报文件",
      "公司与投资机构的融资公告、基金 portfolio 和正式新闻稿",
      "企查查、天眼查、IT 桔子等聚合平台作为发现和交叉核对入口",
      "主流财经媒体、创始人或投资人原始访谈作为补充证据"
    ],
    prohibitedInferences: [
      "不得把工商注册资本当作融资金额、公司估值或可用现金",
      "不得依据股东名称、董事席位或传闻断言实际控制、投资金额、持股比例或关联交易",
      "不得把计划融资、市场传闻、未完成交割和已完成融资混写",
      "不得在币种、轮次、投前/投后口径不明时自行换算或合计"
    ],
    outputRequirements: [
      "输出法律主体与品牌映射表、工商变更时间线和逐轮融资表，所有空白字段明确标为未披露",
      "每一轮至少给出事件日期、轮次、金额与币种、投资方、估值口径、事件状态和相互独立的证据",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "founder-theses",
    name: "创始人与观点追踪",
    minimumDepth: "standard",
    objective: "核验核心人物身份、履历、创业动机、关键论点及其随时间的变化，区分原话、可靠转述和研究者概括。",
    queryStrategies: [
      "组合人物中英文名、曾用名、公司、院校/前雇主与 interview、podcast、speech、transcript、letter 等词检索",
      "优先定位完整采访、演讲视频及时间戳、播客文字稿、署名文章、论文和官方社交账号原帖",
      "按年份比较对技术路线、商业模式、融资、开源、安全和竞争的表述，识别观点转变和自相矛盾",
      "用履历关键节点交叉检索学校、前雇主、论文作者页和工商关键人员以防同名误认"
    ],
    preferredSources: [
      "创始人署名文章、公开信、论文、官方账号原帖和公司官方问答",
      "带时间戳的完整视频/播客及原始文字稿",
      "学校、前雇主、会议和奖项机构的个人档案",
      "信誉媒体完整专访；二次摘录只作线索"
    ],
    prohibitedInferences: [
      "不得把记者概括、标题、匿名消息或二次摘录写成创始人原话",
      "不得将个人早期论文立场自动等同于当前公司路线或全体团队观点",
      "不得从教育或任职经历推断政治倾向、技术能力、财富或人际关系",
      "不得省略引语的时间、上下文和关键限定语"
    ],
    outputRequirements: [
      "输出经消歧的创始人档案、履历时间线和观点时间线",
      "直接引语必须附原文、上下文、发布日期以及视频时间戳或正文锚点；转述必须显式标注",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "product-adoption",
    name: "产品与采用尽调",
    minimumDepth: "standard",
    objective: "验证产品能力、版本演进、定价与可用性，并以可审计指标判断客户采用、留存、商业化和生产部署。",
    queryStrategies: [
      "追踪产品页、文档、定价页、发布日志、状态页、API 变更、应用商店版本和停止服务公告",
      "按客户名联查双方公告、采购/招标、案例正文、技术演讲和财报，区分试用、合作、采购与生产部署",
      "寻找用户数、活跃度、调用量、收入、续约、席位、地域、开源下载等指标的统计口径、时间点和来源",
      "检索 outage、deprecation、complaint、migration、security incident 等信号验证可靠性和用户摩擦"
    ],
    preferredSources: [
      "产品文档、定价页、更新日志、状态页和官方 API/SDK",
      "客户官网、财报、采购/招标文件和客户技术分享",
      "应用商店、公开遥测、代码包注册表等带时间戳的原始指标",
      "独立产品测评、用户社区和投诉仅用于发现反例并需说明代表性"
    ],
    prohibitedInferences: [
      "不得把战略合作、测试、免费用户、下载量或网页访问量直接写成付费客户、收入或留存",
      "不得把一方发布的客户 logo 当作另一方确认的生产部署",
      "不得把当前文档能力追溯到旧版本，也不得用累计注册数代替活跃用户",
      "不得用个别用户评论概括总体满意度或市场份额"
    ],
    outputRequirements: [
      "输出产品版本/定价/可用性时间线和采用指标表，逐项记录指标定义、分母、地域、时间窗和发布方",
      "客户案例标记为声称、双方确认、独立确认或公开采购四种证据状态",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "benchmark-verification",
    name: "Benchmark 独立复核",
    minimumDepth: "deep",
    objective: "独立核查评测成绩的原始记录、版本、设置、可比性、可复现性、污染风险和现实任务代表性。",
    queryStrategies: [
      "定位榜单具体行、论文表格、评测日志、提交记录、模型/数据版本、评测 harness commit 和发布日期",
      "核对任务版本、测试集、pass@k/采样次数、提示、工具权限、token/时间/成本预算、人工筛选和基线设置",
      "搜索复现报告、issue、勘误、榜单移除、数据污染、test leakage、overfitting 和 benchmark saturation",
      "选择至少一个独立评测或使用公开 harness 复核关键结果；不可复现时记录缺失材料"
    ],
    preferredSources: [
      "Benchmark 官方榜单的具体提交、原始日志、任务集版本和评测代码",
      "论文实验表、附录、勘误、模型卡和数据集卡",
      "可定位 commit 的复现仓库、issue 和独立评测机构报告",
      "厂商新闻稿只用于找到成绩声明，不作为独立验证"
    ],
    prohibitedInferences: [
      "不得比较任务版本、预算、工具权限或评分协议不同的数字",
      "不得把厂商自报、挑选后的最佳运行或未公开测试集成绩描述为独立验证",
      "不得用单一 Benchmark 推断通用智能、生产性能、安全性或成本优势",
      "不得在缺少原始日志和设置时自行补全实验条件"
    ],
    outputRequirements: [
      "输出成绩核查矩阵：声明值、原始值、版本、设置、预算、提交方、独立复现、污染风险和可比结论",
      "对每项关键成绩给出 verified、partially verified、not reproducible 或 not comparable 状态及理由",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "counterevidence-compliance",
    name: "反证、风险与合规",
    minimumDepth: "quick",
    objective: "主动寻找不支持主叙事的证据，核查监管、诉讼、知识产权、隐私、安全、伦理与持续经营风险。",
    queryStrategies: [
      "对每个核心结论生成反向查询，加入 failure、criticism、lawsuit、penalty、recall、breach、shutdown、撤稿等中英文词",
      "查询监管处罚、裁判文书、被执行/破产、知识产权争议、数据跨境、隐私政策、安全事件和服务状态",
      "寻找竞争者、前员工、客户、研究者的反驳，并追溯其利益关系与原始证据",
      "核对报道后续、裁判阶段、整改状态和公司回应，避免把旧风险写成当前事实"
    ],
    preferredSources: [
      "监管机关、法院、交易所、政府采购与知识产权机关的正式记录",
      "公司安全公告、隐私政策、透明度报告、状态页和正式回应",
      "漏洞数据库、论文勘误/撤稿记录和独立安全研究",
      "信誉媒体调查及其引用的原始文件"
    ],
    prohibitedInferences: [
      "不得把指控、立案、争议、负面评论等同于违法成立或最终裁判",
      "不得把未找到处罚记录解释为合规，也不得把关联方事件自动归因于目标公司",
      "不得省略案件阶段、司法辖区、处理结果、公司回应和信息时效",
      "不得为追求平衡而制造没有证据的反方观点"
    ],
    outputRequirements: [
      "输出风险登记册，含风险类型、事实/指控状态、时间、辖区、影响范围、公司回应、后续状态和来源",
      "逐条列出对主叙事的支持、削弱或推翻程度，并指出哪些结论仍缺乏反证检验",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  },
  {
    id: "source-audit",
    name: "来源与引用审计",
    minimumDepth: "quick",
    objective: "独立审计证据链的可访问性、叶节点深度、来源独立性、引文忠实度、时效与结论覆盖率。",
    queryStrategies: [
      "逐个打开引用 URL，确认 HTTP(S) 可访问、页面标题/发布方/日期一致且链接直达支持内容而非首页或搜索页",
      "沿聚合报道、新闻转载和搜索摘要回溯到公告、文件、数据行、视频时间戳或原始访谈",
      "按 canonical URL、标题、文稿来源和所有权关系去重，识别多篇转载共用同一匿名来源的伪交叉验证",
      "从报告每个句子反向映射证据，抽查数字、引语、人物身份、融资事件和因果表述"
    ],
    preferredSources: [
      "原始公告、监管/司法文件、论文、原始数据、代码记录和完整访谈",
      "网页存档、DOI、文档页码、表格行、代码 commit 和视频时间戳等稳定定位符",
      "来源之间的编辑独立性和利益关系说明",
      "二手来源只在无法取得一手材料时保留，并明确降级"
    ],
    prohibitedInferences: [
      "不得把链接存在等同于链接内容支持结论，也不得用搜索摘要作为最终证据",
      "不得把转载数量视为独立证据数量，不得用同一公司控制的多个页面完成交叉验证",
      "不得修饰或补写原文没有表达的数字、引语、因果关系和确定性",
      "不得删除不一致证据；必须保留冲突并说明无法裁决的原因"
    ],
    outputRequirements: [
      "输出逐条 citation audit：结论、链接、叶节点定位、支持/部分支持/不支持、来源等级、独立性和修订建议",
      "汇总引用覆盖率、叶节点率、一手来源率、独立交叉验证率、失效链接率和未支持结论数",
      ...COMMON_OUTPUT_REQUIREMENTS
    ]
  }
] as const satisfies readonly ResearchRole[];

const DEPTH_RANK: Readonly<Record<ResearchDepth, number>> = {
  quick: 0,
  standard: 1,
  deep: 2
};

const ROLE_INDEX = new Map<ResearchRoleId, ResearchRole>(
  RESEARCH_ROLES.map((role) => [role.id, role])
);

export function getResearchRole(id: ResearchRoleId): ResearchRole {
  const role = ROLE_INDEX.get(id);
  if (!role) throw new Error(`Unknown research role: ${id}`);
  return role;
}

export function selectResearchRoles(depth: ResearchDepth): readonly ResearchRole[] {
  const rank = DEPTH_RANK[depth];
  return RESEARCH_ROLES.filter((role) => DEPTH_RANK[role.minimumDepth] <= rank);
}

export function buildRoleTaskInstruction(role: ResearchRole | ResearchRoleId, context: RoleTaskContext): string {
  const config = typeof role === "string" ? getResearchRole(role) : role;
  const topic = requireText(context.topic, "topic");
  const language = context.language?.trim() || "zh-CN";
  const brief = context.brief?.trim() || "无补充要求";

  return `你是并发调研团队中的“${config.name}”专职 subagent。只负责本角色的证据搜集与核验，不代替总编做跨角色综合，也不使用模型记忆补写事实。

研究主题：${topic}
调研深度：${context.depth}
输出语言：${language}
用户补充要求：${brief}

角色目标：
${config.objective}

查询策略：
${numbered(config.queryStrategies)}

首选来源（从上到下优先；二手线索必须尽量回溯到原出处）：
${numbered(config.preferredSources)}

禁止过度推断：
${numbered(config.prohibitedInferences)}

任务产出要求：
${numbered(config.outputRequirements)}

执行纪律：先报告计划检索的术语簇、目标实体和来源入口；每完成一个检索分支，报告已访问来源数、新增实体数、已形成证据数、冲突数和下一步。若网站不可访问、需要登录或证据缺失，记录障碍并改查公开的一手替代来源，绝不伪造访问结果。`;
}

export function buildRoleResearchTasks(context: RoleTaskContext): readonly RoleResearchTask[] {
  return selectResearchRoles(context.depth).map((role) => ({
    id: `role:${role.id}`,
    roleId: role.id,
    roleName: role.name,
    objective: role.objective,
    instruction: buildRoleTaskInstruction(role, context)
  }));
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
}
