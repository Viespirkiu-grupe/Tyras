import { spawn } from "child_process";
import * as readline from "readline";
import type { TokenUsage } from "./types.js";

const MCP_TOOLS = [
  "mcp__viespirkiai-local__execute_query",
  "mcp__viespirkiai-local__get_failas",
  "mcp__viespirkiai-local__get_failas_tekstas",
  "mcp__viespirkiai-local__get_juridinis",
  "mcp__viespirkiai-local__get_pinreg_asmuo",
  "mcp__viespirkiai-local__get_pinreg_jar",
  "mcp__viespirkiai-local__get_schema",
  "mcp__viespirkiai-local__get_sutartis",
  "mcp__viespirkiai-local__get_viesasis_pirkimas",
  "mcp__viespirkiai-local__search_failai",
  "mcp__viespirkiai-local__search_juridiniai",
  "mcp__viespirkiai-local__search_sutartys",
  "mcp__viespirkiai-local__search_viesieji_pirkimai",
];

export interface AgentOptions {
  systemPrompt: string;
  userMessage: string;
  model: string;
  agentName: string;
  cwd?: string;
  enableMcp?: boolean;
  maxBudgetUsd?: number;
}

export interface AgentResult {
  text: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  sessionId: string;
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const {
    systemPrompt,
    userMessage,
    model,
    agentName,
    cwd = process.cwd(),
    enableMcp = true,
    maxBudgetUsd,
  } = options;

  const builtinTools = ["Read", "Write", "Edit"];

  const allowedTools = [...builtinTools];
  if (enableMcp) {
    allowedTools.push(...MCP_TOOLS);
  }

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--model",
    model,
    "--append-system-prompt",
    systemPrompt,
    "--tools",
    builtinTools.join(","),
    "--allowed-tools",
    allowedTools.join(","),
    "--no-session-persistence",
  ];

  if (maxBudgetUsd) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  args.push(userMessage);

  console.log(`  [${agentName}] starting (model=${model}, mcp=${enableMcp})`);

  return new Promise<AgentResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let finalResult = "";
    let costUsd = 0;
    let durationMs = 0;
    let numTurns = 0;
    let sessionId = "";
    let isError = false;
    let errorMsg = "";
    let stderr = "";

    const rl = readline.createInterface({ input: proc.stdout! });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        logMessage(msg, agentName);

        if (msg.type === "result") {
          if (msg.subtype === "success") {
            finalResult = msg.result ?? "";
            costUsd = msg.cost_usd ?? 0;
            durationMs = msg.duration_ms ?? 0;
            numTurns = msg.num_turns ?? 0;
            sessionId = msg.session_id ?? "";
          } else {
            isError = true;
            errorMsg = msg.error ?? msg.result ?? "Unknown error";
          }
        }
      } catch {
        // non-JSON line — ignore
      }
    });

    proc.stderr!.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (isError) {
        reject(new Error(`[${agentName}] ${errorMsg}`));
        return;
      }
      if (code !== 0 && !finalResult) {
        reject(
          new Error(`[${agentName}] claude exited with code ${code}: ${stderr.slice(0, 500)}`),
        );
        return;
      }

      console.log(
        `  [${agentName}] done (${numTurns} turns, $${costUsd.toFixed(4)}, ${(durationMs / 1000).toFixed(0)}s)`,
      );
      resolve({ text: finalResult, costUsd, durationMs, numTurns, sessionId });
    });

    proc.on("error", (err) => {
      reject(new Error(`[${agentName}] failed to spawn claude: ${err.message}`));
    });
  });
}

function logMessage(msg: any, agentName: string): void {
  if (msg.type === "assistant" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "tool_use") {
        const name = block.name ?? "unknown";
        const shortName = name.replace("mcp__viespirkiai-local__", "");
        const argStr = summarizeArgs(block.input ?? {});
        console.log(`  [${agentName}] ${shortName}(${argStr})`);
      }
    }
  }
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && v.length > 80) {
      parts.push(`${k}="${v.slice(0, 77)}..."`);
    } else if (typeof v === "string") {
      parts.push(`${k}="${v}"`);
    } else {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  return parts.join(", ");
}
