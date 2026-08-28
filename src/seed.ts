import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { ResearchHarnessError } from "./errors.js";

const MAX_SEED_BYTES = 25 * 1024 * 1024;
const EMBEDDED_DATA_MARKERS = ["const D=", "const D =", "window.__RESEARCH_DATA__="] as const;

export interface SeedEntity {
  id?: string;
  name: string;
  legalEntity?: string;
  aliases: string[];
  region?: string;
  country?: string;
  city?: string;
  founded?: string;
  category?: string;
  subcategory?: string;
  oneLine?: string;
  layer?: string;
  isStartup?: boolean;
  founders: string[];
  fundingRoundCount: number;
  website?: string;
  product?: string;
  rsiThesis?: string;
  dataStrategy?: string;
  businessModel?: string;
  customers?: string;
  baselineFunding: BaselineFundingRecord[];
  baselineStatements: BaselineStatement[];
}

export interface BaselineFundingRecord {
  round?: string;
  date?: string;
  amount?: string;
  currency?: string;
  valuation?: string;
  lead?: string;
  otherInvestors?: string;
  status?: string;
  credibility?: string;
  notes?: string;
  url?: string;
}

export interface BaselineStatement {
  person?: string;
  date?: string;
  text: string;
  type?: string;
  url?: string;
}

export interface ResearchSeed {
  path: string;
  date?: string;
  stats: Record<string, number>;
  entities: SeedEntity[];
  rawCompanyCount: number;
  rawFundingCount: number;
  rawStatementCount: number;
}

/** Find an absolute HTML/JSON seed path in a natural-language topic. */
export function detectSeedPath(topic: string): string | undefined {
  const matches = topic.match(/(?:参考|基于|seed(?:\s+file)?[:：]?\s*)?((?:\/[\p{L}\p{N}_.()（）\- ]+)+\.(?:html?|json))/iu);
  return matches?.[1]?.trim();
}

export async function loadResearchSeed(inputPath: string): Promise<ResearchSeed> {
  const path = resolve(inputPath);
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    throw new ResearchHarnessError(`Seed file does not exist: ${path}`, 400);
  }
  if (!metadata.isFile()) throw new ResearchHarnessError(`Seed path is not a file: ${path}`, 400);
  if (metadata.size > MAX_SEED_BYTES) {
    throw new ResearchHarnessError(`Seed file exceeds ${MAX_SEED_BYTES / 1024 / 1024} MB: ${path}`, 413);
  }
  const text = await readFile(path, "utf8");
  const data = path.toLowerCase().endsWith(".json") ? parseJson(text, path) : extractEmbeddedJson(text, path);
  return normalizeSeed(path, data);
}

export function extractEmbeddedJson(html: string, label = "HTML seed"): unknown {
  let start = -1;
  for (const marker of EMBEDDED_DATA_MARKERS) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      start = html.indexOf("{", markerIndex + marker.length);
      break;
    }
  }
  if (start < 0) throw new ResearchHarnessError(`${label} does not contain a supported embedded research dataset.`, 400);

  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return parseJson(html.slice(start, index + 1), label);
    }
  }
  throw new ResearchHarnessError(`${label} contains an unterminated embedded dataset.`, 400);
}

function normalizeSeed(path: string, value: unknown): ResearchSeed {
  const root = asRecord(value);
  if (!root) throw new ResearchHarnessError(`Seed dataset must be a JSON object: ${path}`, 400);
  const companies = Array.isArray(root.companies) ? root.companies : [];
  const funding = Array.isArray(root.funding) ? root.funding : [];
  const statements = Array.isArray(root.statements) ? root.statements : [];
  const statsRecord = asRecord(root.stats) ?? {};
  const stats = Object.fromEntries(
    Object.entries(statsRecord).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
  );
  const entities = companies.map(normalizeEntity).filter((entity): entity is SeedEntity => Boolean(entity));
  mergeGlobalFunding(entities, funding);
  mergeGlobalStatements(entities, statements);
  if (entities.length === 0) throw new ResearchHarnessError(`Seed dataset contains no usable companies: ${path}`, 400);

  return {
    path,
    date: text(root.date),
    stats,
    entities,
    rawCompanyCount: companies.length,
    rawFundingCount: funding.length,
    rawStatementCount: statements.length
  };
}

function normalizeEntity(value: unknown): SeedEntity | undefined {
  const record = asRecord(value);
  const name = record && text(record.name);
  if (!record || !name) return undefined;
  const aliases = arrayOfText(record.aliases);
  const legalEntity = text(record.legal_entity);
  const founders = Array.isArray(record.founders)
    ? record.founders.flatMap((founder) => {
        if (typeof founder === "string") return [founder.trim()].filter(Boolean);
        const person = asRecord(founder);
        return person ? [text(person.name), text(person.en_name)].filter((item): item is string => Boolean(item)) : [];
      })
    : [];
  const baselineFunding = Array.isArray(record.rounds) ? record.rounds.map(normalizeFunding).filter((item): item is BaselineFundingRecord => Boolean(item)) : [];
  const baselineStatements = Array.isArray(record.statements) ? record.statements.map(normalizeStatement).filter((item): item is BaselineStatement => Boolean(item)) : [];
  const names = unique([name, legalEntity, ...aliases]);
  return {
    id: text(record.id),
    name,
    legalEntity,
    aliases: names.filter((item) => item !== name && item !== legalEntity),
    region: text(record.region),
    country: text(record.country),
    city: text(record.city),
    founded: text(record.founded),
    category: text(record.category),
    subcategory: text(record.subcategory),
    oneLine: text(record.one_line),
    layer: text(record.layer),
    isStartup: typeof record.is_startup === "boolean" ? record.is_startup : undefined,
    founders: unique(founders),
    fundingRoundCount: baselineFunding.length,
    website: httpUrl(record.website),
    product: text(record.product),
    rsiThesis: text(record.rsi_thesis),
    dataStrategy: text(record.data_strategy),
    businessModel: text(record.business_model),
    customers: text(record.customers),
    baselineFunding,
    baselineStatements
  };
}

function normalizeFunding(value: unknown): BaselineFundingRecord | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const item = {
    round: text(record.round) ?? text(record.round_name),
    date: text(record.date) ?? text(record.round_date),
    amount: text(record.amount) ?? text(record.amount_original) ?? text(record.amount_usd),
    currency: text(record.currency),
    valuation: text(record.valuation) ?? text(record.valuation_usd),
    lead: text(record.lead) ?? text(record.lead_investors),
    otherInvestors: text(record.others) ?? text(record.other_investors),
    status: text(record.status),
    credibility: text(record.credibility),
    notes: text(record.notes),
    url: httpUrl(record.url) ?? httpUrl(record._url)
  };
  return Object.values(item).some(Boolean) ? item : undefined;
}

function normalizeStatement(value: unknown): BaselineStatement | undefined {
  const record = asRecord(value);
  const statementText = record && text(record.text);
  if (!record || !statementText) return undefined;
  return {
    person: text(record.person),
    date: text(record.date),
    text: statementText,
    type: text(record.type),
    url: httpUrl(record.url)
  };
}

function mergeGlobalFunding(entities: SeedEntity[], funding: unknown[]): void {
  for (const value of funding) {
    const record = asRecord(value);
    const item = normalizeFunding(value);
    if (!record || !item) continue;
    const id = text(record._cid);
    const name = text(record.entity_name);
    const entity = entities.find((candidate) => candidate.id === id || sameEntityName(candidate, name));
    if (!entity) continue;
    const fingerprint = fundingFingerprint(item);
    if (!entity.baselineFunding.some((existing) => fundingFingerprint(existing) === fingerprint)) {
      entity.baselineFunding.push(item);
      entity.fundingRoundCount = entity.baselineFunding.length;
    }
  }
}

function mergeGlobalStatements(entities: SeedEntity[], statements: unknown[]): void {
  for (const value of statements) {
    const record = asRecord(value);
    const item = normalizeStatement(value);
    if (!record || !item) continue;
    const id = text(record._cid);
    const company = text(record.company);
    const entity = entities.find((candidate) => candidate.id === id || sameEntityName(candidate, company));
    if (entity && !entity.baselineStatements.some((existing) => existing.text === item.text)) entity.baselineStatements.push(item);
  }
}

function sameEntityName(entity: SeedEntity, name: string | undefined): boolean {
  if (!name) return false;
  const normalized = normalizeName(name);
  return [entity.name, entity.legalEntity, ...entity.aliases].some((candidate) => normalizeName(candidate ?? "") === normalized);
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function fundingFingerprint(item: BaselineFundingRecord): string {
  return [item.date, item.round, item.amount, item.currency].map((value) => value ?? "").join("|");
}

function parseJson(textValue: string, label: string): unknown {
  try {
    return JSON.parse(textValue);
  } catch (error) {
    throw new ResearchHarnessError(`${label} contains invalid JSON: ${error instanceof Error ? error.message : "parse error"}`, 400);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayOfText(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

function httpUrl(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : undefined;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((item): item is string => Boolean(item)))];
}
