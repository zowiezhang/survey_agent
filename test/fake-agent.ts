import type { AgentPrompt, AgentResult, ExecutionAgent } from "../src/types.js";

export class ScriptedResearchAgent implements ExecutionAgent {
  private evidenceCall = 0;

  async complete(input: AgentPrompt): Promise<AgentResult> {
    if (input.phase === "plan") return { text: JSON.stringify(plan) };
    if (input.phase === "evidence") {
      this.evidenceCall += 1;
      return { text: JSON.stringify(this.evidenceCall === 1 ? firstEvidence : secondEvidence) };
    }
    return { text: JSON.stringify(synthesis) };
  }
}

export class InvalidCitationAgent extends ScriptedResearchAgent {
  override async complete(input: AgentPrompt): Promise<AgentResult> {
    if (input.phase !== "synthesis") return super.complete(input);
    return {
      text: JSON.stringify({
        ...synthesis,
        executiveSummary: [
          { claim: "An unsupported claim is cited.", sourceIds: ["S99"] },
          { claim: "A second claim preserves the required summary shape.", sourceIds: ["S1"] }
        ]
      })
    };
  }
}

const plan = {
  scope: "Map the product, market position, and material uncertainty from accessible sources.",
  researchQuestions: [
    "What is the product's stated purpose and capability?",
    "What evidence describes the surrounding market and risks?"
  ],
  queries: [
    { query: "Example Research product official capability", purpose: "Find primary product information" },
    { query: "Example Research market independent analysis", purpose: "Find independent corroboration" }
  ],
  recencyNeeds: "Use the newest available information and distinguish dated announcements."
};

const firstEvidence = {
  query: "Example Research product official capability",
  findings: [
    {
      claim: "Example Research describes its product as an evidence-first research workspace.",
      source: {
        title: "Example Research Product",
        url: "https://example.com/product?utm_source=test",
        publisher: "Example Research",
        publishedAt: "2026-01-10"
      },
      confidence: 0.9
    },
    {
      claim: "A trade publication says the category is crowded and buyers compare source transparency.",
      source: {
        title: "Research tooling market review",
        url: "https://news.example.net/research-tools",
        publisher: "Example News",
        publishedAt: "2026-02-01"
      },
      confidence: 0.8,
      caveat: "This is an industry analysis rather than audited market data."
    }
  ],
  gaps: ["Independent customer adoption data was not located in this pass."]
};

const secondEvidence = {
  query: "Example Research market independent analysis",
  findings: [
    {
      claim: "The company documentation emphasizes traceable citations in generated reports.",
      source: {
        title: "Example Research Product",
        url: "https://example.com/product",
        publisher: "Example Research",
        publishedAt: "2026-01-10"
      },
      confidence: 0.9
    },
    {
      claim: "A standards body recommends exposing source provenance for AI-assisted research outputs.",
      source: {
        title: "Provenance guidance",
        url: "https://standards.example.org/provenance",
        publisher: "Example Standards Body",
        publishedAt: "2026-03-01"
      },
      confidence: 0.85
    }
  ],
  gaps: ["Pricing and revenue claims require direct company disclosures."]
};

const synthesis = {
  title: "Example Research: product and market assessment",
  executiveSummary: [
    { claim: "The product is positioned as an evidence-first research workspace.", sourceIds: ["S1"] },
    { claim: "Source transparency is a stated competitive concern in this category.", sourceIds: ["S2", "S3"] }
  ],
  keyFindings: [
    {
      heading: "Product positioning",
      analysis: "The company documentation emphasizes a research workspace with traceable citations, which provides a concrete product-level positioning claim.",
      sourceIds: ["S1"]
    },
    {
      heading: "Market requirement",
      analysis: "Independent trade coverage and standards guidance both make provenance a relevant evaluation dimension, although neither proves commercial adoption.",
      sourceIds: ["S2", "S3"]
    }
  ],
  landscape: [
    {
      entity: "Research-tool buyers",
      relevance: "They are described as comparing transparency, so citation quality is a relevant product consideration.",
      sourceIds: ["S2"]
    }
  ],
  risksAndUncertainties: [
    {
      claim: "The available evidence does not establish pricing, revenue, or independently verified customer adoption.",
      sourceIds: ["S1", "S2"]
    }
  ],
  furtherResearch: ["Verify customer references and commercial metrics against primary disclosures or interviews."]
};
