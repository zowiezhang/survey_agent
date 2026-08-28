export class ResearchHarnessError extends Error {
  constructor(message: string, public readonly statusCode = 500, public readonly cause?: unknown) {
    super(message);
    this.name = "ResearchHarnessError";
  }
}

export class AgentOutputError extends ResearchHarnessError {
  constructor(message: string, cause?: unknown) {
    super(message, 422, cause);
    this.name = "AgentOutputError";
  }
}
