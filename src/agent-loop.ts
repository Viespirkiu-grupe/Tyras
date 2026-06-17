import { spawn } from "child_process";
import * as readline from "readline";
import { log, logTool } from "./io/logger.js";

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
  } = options;

  const builtinTools = ["Read", "Write", "Edit"];

  const allowedTools = [...builtinTools];
  if (enableMcp) {
    allowedTools.push(...MCP_TOOLS);
  }

  const args = [
    "-p",
    "--verbose",
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

  args.push(userMessage);

  log(`  🟢 ${agentName} starting...`);

  return new Promise<AgentResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
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
        logToolCall(msg, cwd);

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

      resolve({ text: finalResult, costUsd, durationMs, numTurns, sessionId });
    });

    proc.on("error", (err) => {
      reject(new Error(`[${agentName}] failed to spawn claude: ${err.message}`));
    });
  });
}

function logToolCall(msg: any, cwd: string): void {
  if (msg.type !== "assistant" || !msg.message?.content) return;
  for (const block of msg.message.content) {
    if (block.type !== "tool_use") continue;
    const name = block.name ?? "unknown";
    const input = block.input ?? {};
    const short = formatShort(name, input, cwd);
    const verbose = formatVerbose(name, input, cwd);
    logTool(`     ${short}`, verbose);
  }
}

function formatShort(name: string, input: Record<string, unknown>, cwd: string): string {
  if (name === "Read") return `📖 Read ${shortenPath(input.file_path as string, cwd)}`;
  if (name === "Write") return `📝 Write ${shortenPath(input.file_path as string, cwd)}`;
  if (name === "Edit") return `✏️  Edit ${shortenPath(input.file_path as string, cwd)}`;

  const tool = name.replace("mcp__viespirkiai-local__", "");

  if (tool === "execute_query") {
    const sql = normalize((input.query as string) || "");
    if (!sql) return `🔍 execute_query`;
    return `🔍 execute_query: ${truncate(sql, 60)}`;
  }
  if (tool === "get_schema") {
    const table = input.table as string;
    return table ? `📋 get_schema(${table})` : `📋 get_schema`;
  }

  const args = briefArgs(input);
  if (tool.startsWith("search_")) return args ? `🔍 ${tool}(${args})` : `🔍 ${tool}`;
  if (tool.startsWith("get_")) return args ? `📥 ${tool}(${args})` : `📥 ${tool}`;
  return args ? `⚙️  ${tool}(${args})` : `⚙️  ${tool}`;
}

function formatVerbose(name: string, input: Record<string, unknown>, cwd: string): string {
  const tool = name.replace("mcp__viespirkiai-local__", "");
  const args = Object.entries(input)
    .filter(([k]) => k !== "content" && k !== "old_string" && k !== "new_string")
    .map(([k, v]) => {
      const val = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : JSON.stringify(v);
      return `${k}=${truncate(val, 200)}`;
    })
    .join(", ");

  if (name === "Read" || name === "Write" || name === "Edit") {
    return `${name} ${shortenPath(input.file_path as string, cwd)}`;
  }
  return args ? `${tool}(${args})` : tool;
}

function briefArgs(input: Record<string, unknown>): string {
  return Object.entries(input)
    .filter(([k]) => k !== "content" && k !== "old_string" && k !== "new_string" && k !== "purpose")
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}=${truncate(v, 25)}`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(", ");
}

function shortenPath(filePath: string | undefined, cwd: string): string {
  if (!filePath) return "?";
  if (filePath.startsWith(cwd + "/")) return filePath.slice(cwd.length + 1);
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return parts.slice(-3).join("/");
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
