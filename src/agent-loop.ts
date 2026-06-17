import { spawn, execSync } from "child_process";
import * as readline from "readline";
import { log, logTool } from "./io/logger.js";

const MCP_BASE_TOOLS = [
  "execute_query",
  "get_failas",
  "get_failas_tekstas",
  "get_juridinis",
  "get_pinreg_asmuo",
  "get_pinreg_jar",
  "get_schema",
  "get_sutartis",
  "get_viesasis_pirkimas",
  "search_failai",
  "search_juridiniai",
  "search_sutartys",
  "search_viesieji_pirkimai",
];

let _mcpPrefix: string | null = null;

function detectMcpPrefix(): string {
  if (_mcpPrefix !== null) return _mcpPrefix;

  if (process.env.MCP_SERVER) {
    const name = process.env.MCP_SERVER;
    if (!name.toLowerCase().includes("viespirkiai")) {
      throw new Error(
        `MCP_SERVER="${name}" does not contain "viespirkiai". ` +
          `Tyras requires a Viešpirkiai MCP server.`,
      );
    }
    _mcpPrefix = `mcp__${name}__`;
    return _mcpPrefix;
  }

  try {
    const output = execSync("claude mcp list 2>&1", { encoding: "utf-8", timeout: 10_000 });
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^(.+?):\s+https?:\/\/.+?-\s+.+Connected/);
      if (match) {
        const serverName = match[1].trim();
        if (serverName.toLowerCase().includes("viespirkiai")) {
          _mcpPrefix = `mcp__${serverName}__`;
          return _mcpPrefix;
        }
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    "No connected MCP server with \"viespirkiai\" in its name was detected.\n" +
      "Configure one via: claude mcp add <name> --transport http <url>\n" +
      "Or set the MCP_SERVER environment variable.",
  );
}

export async function preflightMcp(): Promise<void> {
  const prefix = detectMcpPrefix();
  const serverName = prefix.slice(5, -2); // strip "mcp__" and trailing "__"
  const getSchemaTool = `${prefix}get_schema`;

  try {
    const output = execSync(
      `claude -p --output-format json --no-session-persistence --tools "" --allowed-tools "${getSchemaTool}" "Call get_schema with no arguments and return the result exactly."`,
      { encoding: "utf-8", timeout: 30_000 },
    );
    const result = JSON.parse(output);
    if (result?.result && !result.result.includes("error")) {
      return;
    }
    throw new Error(result?.result || "empty response");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Viešpirkiai database is not available via MCP server "${serverName}".\n` +
        `The get_schema health check failed: ${msg}\n` +
        `Verify the MCP server is running and the database is accessible.`,
    );
  }
}

function getMcpTools(): string[] {
  const prefix = detectMcpPrefix();
  return MCP_BASE_TOOLS.map((t) => `${prefix}${t}`);
}

function stripMcpPrefix(name: string): string {
  const prefix = detectMcpPrefix();
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

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

  const builtinTools = ["Read", "Write", "Edit", "WebSearch"];

  const allowedTools = [...builtinTools];
  if (enableMcp) {
    allowedTools.push(...getMcpTools());
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

  const tool = stripMcpPrefix(name);

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
  const tool = stripMcpPrefix(name);
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
