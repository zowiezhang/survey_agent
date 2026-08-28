import { z } from "zod";
import { AgentOutputError } from "./errors.js";

export function parseAgentJson<T>(text: string, schema: z.ZodType<T, z.ZodTypeDef, any>, phase: string): T {
  const candidate = extractJson(text);
  try {
    return schema.parse(parseJsonWithRepairs(candidate));
  } catch (error) {
    throw new AgentOutputError(
      `${phase} agent output did not match the required JSON schema${validationSummary(error)}.`,
      error
    );
  }
}

export function extractAgentJson(text: string): string {
  return extractJson(text);
}

function parseJsonWithRepairs(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch (originalError) {
    const normalized = candidate
      .replace(/^\uFEFF/, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(normalized);
    } catch {
      throw originalError;
    }
  }
}

function validationSummary(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issues = error.issues.slice(0, 5).map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    const suffix = error.issues.length > issues.length ? `; +${error.issues.length - issues.length} more` : "";
    return ` (${issues.join("; ")}${suffix})`;
  }
  if (error instanceof SyntaxError) return ` (${error.message})`;
  return "";
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}
