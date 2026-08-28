export type OutputJsonSchema = Record<string, unknown>;

const text = (minLength: number, maxLength: number): OutputJsonSchema => ({
  type: "string",
  minLength,
  maxLength
});

const nullableText = (minLength: number, maxLength: number): OutputJsonSchema => ({
  anyOf: [text(minLength, maxLength), { type: "null" }]
});

const sourceSchema: OutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url", "publisher", "publishedAt", "excerpt"],
  properties: {
    title: text(1, 500),
    // Codex Structured Outputs rejects the JSON Schema `uri` format. Keep the
    // provider-facing schema portable and enforce full URL semantics in Zod.
    url: { type: "string", minLength: 8, maxLength: 2_048, pattern: "^https?://[^\\s]+$" },
    publisher: nullableText(1, 200),
    publishedAt: nullableText(4, 80),
    excerpt: nullableText(1, 1_500)
  }
};

export function planOutputSchema(queryCount: number): OutputJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["scope", "researchQuestions", "queries", "recencyNeeds"],
    properties: {
      scope: text(10, 1_000),
      researchQuestions: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: text(5, 500)
      },
      queries: {
        type: "array",
        minItems: queryCount,
        maxItems: queryCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["query", "purpose"],
          properties: {
            query: text(3, 500),
            purpose: text(3, 500)
          }
        }
      },
      recencyNeeds: text(3, 500)
    }
  };
}

export function evidenceOutputSchema(maxFindings: number): OutputJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["query", "findings", "gaps"],
    properties: {
      query: text(1, 500),
      findings: {
        type: "array",
        minItems: 1,
        maxItems: Math.min(maxFindings, 30),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "source", "confidence", "caveat"],
          properties: {
            claim: text(8, 2_000),
            source: sourceSchema,
            confidence: { type: "number", minimum: 0, maximum: 1 },
            caveat: nullableText(3, 1_000)
          }
        }
      },
      gaps: {
        type: "array",
        maxItems: 10,
        items: text(3, 500)
      }
    }
  };
}

const citedItem = (properties: OutputJsonSchema, required: string[], maxSourceIds: number): OutputJsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: [...required, "sourceIds"],
  properties: {
    ...properties,
    sourceIds: {
      type: "array",
      minItems: 1,
      maxItems: maxSourceIds,
      items: { type: "string", pattern: "^S[0-9]+$" }
    }
  }
});

export const synthesisOutputSchema: OutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "executiveSummary", "keyFindings", "landscape", "risksAndUncertainties", "furtherResearch"],
  properties: {
    title: text(3, 300),
    executiveSummary: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: citedItem({ claim: text(8, 1_000) }, ["claim"], 8)
    },
    keyFindings: {
      type: "array",
      minItems: 2,
      maxItems: 40,
      items: citedItem({ heading: text(3, 300), analysis: text(15, 3_000) }, ["heading", "analysis"], 10)
    },
    landscape: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: citedItem({ entity: text(2, 300), relevance: text(8, 1_500) }, ["entity", "relevance"], 8)
    },
    risksAndUncertainties: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: citedItem({ claim: text(8, 1_500) }, ["claim"], 8)
    },
    furtherResearch: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: text(6, 1_000)
    }
  }
};
