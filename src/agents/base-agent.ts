import { runAgent } from "../agent-loop.js";
import type { AgentResult } from "../agent-loop.js";
import { formatDuration } from "../io/format.js";
import type { IWorkspace } from "../io/workspace.js";
import { fillVars } from "../io/workspace.js";
import type { StepResult } from "../types.js";

export interface AgentRunResult {
  step: StepResult;
}

export abstract class BaseAgent<TResult extends AgentRunResult = AgentRunResult> {
  private _promptTemplate: string | null = null;

  constructor(protected readonly workspace: IWorkspace) {}

  protected get promptTemplate(): string {
    if (this._promptTemplate === null) {
      this._promptTemplate = this.workspace.loadPromptTemplate(this.templateName);
    }
    return this._promptTemplate;
  }

  abstract readonly templateName: string;
  abstract readonly stepName: string;
  abstract readonly agentName: string;
  readonly enableMcp: boolean = false;

  abstract getTemplateVars(): Record<string, string>;
  abstract buildUserMessage(): string | Promise<string>;

  buildSystemPrompt(): string {
    return fillVars(this.promptTemplate, this.getTemplateVars());
  }

  protected async validateOutput(_result: AgentResult): Promise<void> {}

  protected async buildResult(_result: AgentResult, step: StepResult): Promise<TResult> {
    return { step } as TResult;
  }

  protected todayDate(): string {
    return new Date().toISOString().split("T")[0];
  }

  async run(model: string): Promise<TResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = await this.buildUserMessage();

    const result = await runAgent({
      systemPrompt,
      userMessage,
      model,
      agentName: this.agentName,
      enableMcp: this.enableMcp,
    });

    await this.validateOutput(result);

    const step: StepResult = {
      stepName: this.stepName,
      durationMs: result.durationMs,
      duration: formatDuration(result.durationMs),
      costUsd: result.costUsd,
      success: true,
      retries: 0,
      numTurns: result.numTurns,
      tokenUsage: result.tokenUsage,
    };

    return this.buildResult(result, step);
  }
}

export abstract class FileOutputAgent extends BaseAgent {
  abstract readonly outputPath: string;

  protected override async validateOutput(result: AgentResult): Promise<void> {
    if (!(await this.workspace.fileExists(this.outputPath))) {
      throw new Error(
        `${this.agentName} finished (${result.numTurns} turns, ${formatDuration(result.durationMs)}) but output file missing: ${this.outputPath}`,
      );
    }
  }
}
