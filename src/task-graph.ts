import { buildRoleTaskInstruction, selectResearchRoles, type ResearchRole } from "./research-roles.js";
import type { ResearchSeed, SeedEntity } from "./seed.js";
import type { ResearchPlan, ResearchRequest, ResearchWorkerTask } from "./types.js";

export function buildResearchTaskGraph(input: {
  request: ResearchRequest;
  plan: ResearchPlan;
  seed?: ResearchSeed;
}): ResearchWorkerTask[] {
  const roles = selectResearchRoles(input.request.depth);
  const auditRole = roles.find((role) => role.id === "source-audit");
  const primaryRoles = roles.filter((role) => role.id !== "source-audit");
  const entities = relevantEntities(input.request, prioritizedEntities(input.seed?.entities ?? []));
  const assignments = input.seed
    ? seededAssignments(primaryRoles, auditRole, entities, input.request.entitiesPerAgent, input.request.maxAgents)
    : unseededAssignments(primaryRoles, auditRole, input.request.maxAgents);

  return assignments.map(({ role, entityShard, roleOffset, roleCount }, index) => {
    const targetEntities = entityShard.map(entityLabel);
    const planQuery = input.plan.queries[index % input.plan.queries.length]!;
    const roleQuery = buildRoleQuery(role, entityShard, planQuery.query);
    const id = `W${String(index + 1).padStart(2, "0")}`;
    const instruction = [
      buildRoleTaskInstruction(role, input.request),
      input.seed ? seedContext(input.seed) : "未提供结构化参考数据；先执行实体发现，再沿关系图扩展。",
      targetEntities.length
        ? `本工作包负责以下实体分片（必须逐个查询，不得只写总体叙事）：\n${targetEntities.map((item, entityIndex) => `${entityIndex + 1}. ${item}`).join("\n")}`
        : "本工作包没有预置实体；必须先生成规范名、别名、英文名和相关术语簇。",
      roleBaselineDetails(role, entityShard),
      `本角色主查询簇：${roleQuery}\n总编分配的互补查询方向：${planQuery.query}\n用途：${planQuery.purpose}`,
      "对每个目标实体至少尝试：规范名、法律主体名、英文名/别名、产品名、创始人名与本角色关键词的组合查询。沿每个重要网页的脚注、附件、引用和原始公告继续下钻，直至叶节点或明确记录访问障碍。"
    ].join("\n\n");
    return {
      id,
      index: index + 1,
      roleId: role.id,
      roleName: role.name,
      objective: role.objective,
      query: `${roleQuery} · ${role.name} · 实体分片 ${roleOffset + 1}/${roleCount}`.slice(0, 500),
      purpose: `${role.objective}；覆盖 ${targetEntities.length || "待发现"} 个目标实体`,
      instruction,
      targetEntities
    };
  });
}

function buildRoleQuery(role: ResearchRole, entities: SeedEntity[], fallback: string): string {
  const subjects = entities.length
    ? entities.flatMap((entity) => [entity.name, entity.legalEntity, ...entity.aliases.slice(0, 2)])
      .filter((value): value is string => Boolean(value))
      .slice(0, 12)
      .map((value) => /\s/.test(value) ? `"${value}"` : value)
      .join(" OR ")
    : fallback;
  const keywords: Record<ResearchRole["id"], string> = {
    "ecosystem-discovery": "(别名 OR 旧称 OR 英文名 OR 创始人 OR 产品 OR 论文 OR 投资方 OR 客户 OR 生态)",
    "technical-due-diligence": "(数据集 OR 合成数据 OR 训练 OR 强化学习 OR verifier OR agent OR 技术报告 OR 论文 OR GitHub OR 模型卡)",
    "corporate-financing": "(法律主体 OR 统一社会信用代码 OR 股东变更 OR 融资 OR 估值 OR 投资方 OR 公示 OR 招股书 OR 监管文件)",
    "founder-theses": "(创始人 OR CEO OR 首席科学家) (专访 OR 演讲 OR 播客 OR transcript OR 公开信 OR 署名文章 OR 原话)",
    "product-adoption": "(产品文档 OR 定价 OR 更新日志 OR 客户 OR 采购 OR 招标 OR 部署 OR 活跃用户 OR 收入 OR 停服)",
    "benchmark-verification": "(benchmark OR 榜单 OR 评测日志 OR harness OR commit OR 复现 OR contamination OR leakage OR issue OR 勘误)",
    "counterevidence-compliance": "(failure OR criticism OR lawsuit OR penalty OR breach OR shutdown OR 隐私 OR 诉讼 OR 处罚 OR 漏洞 OR 撤稿 OR 争议)",
    "source-audit": "(原始公告 OR 原文 OR DOI OR PDF OR 表格 OR commit OR transcript OR 时间戳 OR 引用核验 OR 叶节点)"
  };
  return `(${subjects}) ${keywords[role.id]}`.slice(0, 430);
}

interface TaskAssignment {
  role: ResearchRole;
  entityShard: SeedEntity[];
  roleOffset: number;
  roleCount: number;
}

function seededAssignments(
  primaryRoles: readonly ResearchRole[],
  auditRole: ResearchRole | undefined,
  entities: SeedEntity[],
  batchSize: number,
  maxAgents: number
): TaskAssignment[] {
  const queues = primaryRoles.map((role) => ({ role, chunks: chunks(entities, batchSize) }));
  const requiredPrimary = queues.reduce((total, queue) => total + queue.chunks.length, 0);
  const idealAudits = auditRole ? Math.max(1, Math.min(8, Math.ceil(entities.length / Math.max(batchSize * 2, 1)))) : 0;
  const auditCount = auditRole ? Math.min(idealAudits, Math.max(1, maxAgents - Math.min(requiredPrimary, maxAgents - 1))) : 0;
  const primaryBudget = Math.max(1, maxAgents - auditCount);
  const primary: TaskAssignment[] = [];
  let round = 0;
  while (primary.length < primaryBudget && queues.some((queue) => round < queue.chunks.length)) {
    for (const queue of queues) {
      const entityShard = queue.chunks[round];
      if (!entityShard || primary.length >= primaryBudget) continue;
      primary.push({ role: queue.role, entityShard, roleOffset: round, roleCount: queue.chunks.length });
    }
    round += 1;
  }
  if (!auditRole || auditCount === 0) return primary;
  const primaryEntityMap = new Map<string, SeedEntity>();
  for (const assignment of primary) {
    for (const entity of assignment.entityShard) primaryEntityMap.set(entity.id ?? entity.name, entity);
  }
  const auditEntities = [...primaryEntityMap.values()];
  const auditShards = Array.from({ length: auditCount }, (_, index) => shard(auditEntities, index, auditCount));
  return [
    ...primary,
    ...auditShards.map((entityShard, index) => ({ role: auditRole, entityShard, roleOffset: index, roleCount: auditCount }))
  ];
}

function unseededAssignments(
  primaryRoles: readonly ResearchRole[],
  auditRole: ResearchRole | undefined,
  desired: number
): TaskAssignment[] {
  const auditCount = auditRole ? Math.min(desired - 1, Math.max(1, Math.floor(desired / 8))) : 0;
  const primaryCount = desired - auditCount;
  const roles = primaryRoles.length ? primaryRoles : auditRole ? [auditRole] : [];
  const primaryAssignments = Array.from({ length: primaryCount }, (_, index) => roles[index % roles.length]!)
    .map((role, index, all) => ({
      role,
      entityShard: [],
      roleOffset: all.slice(0, index).filter((item) => item.id === role.id).length,
      roleCount: all.filter((item) => item.id === role.id).length
    }));
  const audits = auditRole ? Array.from({ length: auditCount }, (_, index) => ({ role: auditRole, entityShard: [], roleOffset: index, roleCount: auditCount })) : [];
  return [...primaryAssignments, ...audits];
}

function relevantEntities(request: ResearchRequest, entities: SeedEntity[]): SeedEntity[] {
  const focus = `${request.topic} ${request.brief ?? ""}`;
  if (!/(中国|国内|china|chinese)/i.test(focus)) return entities;
  const china = entities.filter(isChina);
  const comparatorLimit = request.depth === "deep" ? 12 : request.depth === "standard" ? 6 : 3;
  const comparators = entities.filter((entity) => !isChina(entity) && /core|核心|t1|t2|frontier/i.test(`${entity.layer ?? ""} ${entity.category ?? ""}`)).slice(0, comparatorLimit);
  return [...china, ...comparators];
}

function isChina(entity: SeedEntity): boolean {
  return Boolean(entity.region?.includes("中国") || entity.country?.toLowerCase() === "china");
}

function chunks<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function prioritizedEntities(entities: SeedEntity[]): SeedEntity[] {
  return [...entities].sort((left, right) => priority(right) - priority(left) || left.name.localeCompare(right.name, "zh-CN"));
}

function priority(entity: SeedEntity): number {
  const china = entity.region?.includes("中国") || entity.country?.toLowerCase() === "china" ? 100 : 0;
  const startup = entity.isStartup ? 20 : 0;
  const activeLayer = /core|核心|t1|t2/i.test(entity.layer ?? "") ? 10 : 0;
  return china + startup + activeLayer;
}

function shard<T>(items: T[], index: number, count: number): T[] {
  return items.filter((_item, itemIndex) => itemIndex % count === index);
}

function entityLabel(entity: SeedEntity): string {
  const identifiers = [entity.legalEntity, ...entity.aliases].filter(Boolean);
  const metadata = [entity.region, entity.city, entity.category, entity.founded ? `成立 ${entity.founded}` : undefined]
    .filter(Boolean).join("；");
  const founders = entity.founders.length ? `；创始人 ${entity.founders.join("/")}` : "";
  return `${entity.id ? `[${entity.id}] ` : ""}${entity.name}${identifiers.length ? `（${identifiers.join(" / ")}）` : ""}${metadata ? `；${metadata}` : ""}${founders}`;
}

function seedContext(seed: ResearchSeed): string {
  return `参考数据已由 harness 解析，不需要 subagent 自行读取本地文件：${seed.path}\n参考数据日期：${seed.date ?? "未知"}；公司 ${seed.rawCompanyCount}；融资记录 ${seed.rawFundingCount}；人物观点 ${seed.rawStatementCount}。参考页仅作为实体发现和待核验线索，不得当作最终证据；所有事实仍须回到公开 HTTP(S) 原出处。`;
}

function roleBaselineDetails(role: ResearchRole, entities: SeedEntity[]): string {
  if (entities.length === 0) return "";
  const lines: string[] = ["以下是参考页中的待核验字段差异队列；它们不是事实真值，每一项都必须保留、纠正、合并、排除或标为待核，并给出新证据："];
  for (const entity of entities) {
    if (role.id === "corporate-financing") {
      const records = entity.baselineFunding.slice(0, 16).map((item) => compact({
        round: item.round, date: item.date, amount: item.amount, currency: item.currency,
        valuation: item.valuation, lead: item.lead, others: item.otherInvestors,
        status: item.status, credibility: item.credibility, url: item.url
      }));
      lines.push(`${entity.name}：${records.length ? records.join(" | ") : "参考页无逐轮融资记录，需主动查询"}${entity.baselineFunding.length > 16 ? ` | 另有 ${entity.baselineFunding.length - 16} 条基线记录` : ""}`);
    } else if (role.id === "founder-theses") {
      const statements = entity.baselineStatements.slice(0, 8).map((item) => compact({ person: item.person, date: item.date, quote: item.text, url: item.url }));
      lines.push(`${entity.name}：人物 ${entity.founders.join("/") || "待发现"}；观点线索 ${statements.length ? statements.join(" | ") : "无，需主动查询"}${entity.baselineStatements.length > 8 ? ` | 另有 ${entity.baselineStatements.length - 8} 条` : ""}`);
    } else if (role.id === "technical-due-diligence" || role.id === "benchmark-verification") {
      lines.push(`${entity.name}：RSI/路线=${clip(entity.rsiThesis)}；数据=${clip(entity.dataStrategy)}；产品=${clip(entity.product)}`);
    } else if (role.id === "product-adoption") {
      lines.push(`${entity.name}：产品=${clip(entity.product)}；商业模式=${clip(entity.businessModel)}；客户=${clip(entity.customers)}`);
    } else if (role.id === "source-audit") {
      const urls = [entity.website, ...entity.baselineFunding.map((item) => item.url), ...entity.baselineStatements.map((item) => item.url)]
        .filter((item): item is string => Boolean(item));
      lines.push(`${entity.name}：候选链接 ${[...new Set(urls)].slice(0, 12).join(" | ") || "无"}`);
    } else {
      lines.push(`${entity.name}：${clip(entity.oneLine)}；官网=${entity.website ?? "待核"}`);
    }
  }
  return lines.join("\n");
}

function compact(record: Record<string, string | undefined>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(record).filter((entry) => Boolean(entry[1]))));
}

function clip(value: string | undefined, length = 260): string {
  if (!value) return "待核";
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function roleForTask(task: ResearchWorkerTask): Pick<ResearchRole, "id" | "name"> {
  return { id: task.roleId as ResearchRole["id"], name: task.roleName };
}
