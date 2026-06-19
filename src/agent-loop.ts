import { spawn, execSync } from "child_process";
import * as readline from "readline";
import { log, logTool, logTokens } from "./io/logger.js";
import type { TokenUsage } from "./types.js";

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

export class QuotaExhaustedError extends Error {
  numTurns: number;
  durationMs: number;
  stderr: string;

  constructor(agentName: string, numTurns: number, durationMs: number, stderr: string) {
    const hint = stderr.trim() ? ` | stderr: ${stderr.trim().slice(0, 300)}` : "";
    super(`[${agentName}] session quota exhausted — ${numTurns} turn(s), ${durationMs}ms${hint}`);
    this.name = "QuotaExhaustedError";
    this.numTurns = numTurns;
    this.durationMs = durationMs;
    this.stderr = stderr;
  }
}

export function parseResetTime(stderr: string): number | null {
  if (!stderr) return null;
  const lower = stderr.toLowerCase();

  const retryAfterMatch = lower.match(/retry[\s-]*after[\s:]*(\d+)/);
  if (retryAfterMatch) {
    const seconds = parseInt(retryAfterMatch[1], 10);
    if (seconds > 0 && seconds < 86400) return seconds * 1000;
  }

  const resetInMatch = lower.match(/resets?\s+in\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?)/);
  if (resetInMatch) {
    const value = parseInt(resetInMatch[1], 10);
    const unit = resetInMatch[2][0];
    const multiplier = unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000;
    const ms = value * multiplier;
    if (ms > 0 && ms < 86400000) return ms;
  }

  return null;
}

export interface QuotaProbeResult {
  available: boolean;
  retryAfterMs: number | null;
  stderr: string;
}

export async function probeQuota(model: string): Promise<QuotaProbeResult> {
  return new Promise<QuotaProbeResult>((resolve) => {
    const proc = spawn("claude", [
      "-p",
      "--output-format", "json",
      "--model", model,
      "--max-tokens", "5",
      "--no-session-persistence",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ available: false, retryAfterMs: null, stderr: "probe timed out" });
    }, 15_000);

    proc.stdout!.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr!.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.stdin!.write("Reply OK");
    proc.stdin!.end();

    proc.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(stdout);
        const turns = result.num_turns ?? 0;
        const duration = result.duration_ms ?? 0;
        if (code === 0 && turns >= 1 && duration >= HOLLOW_SESSION_MAX_MS) {
          resolve({ available: true, retryAfterMs: null, stderr });
          return;
        }
      } catch {
        // non-JSON output — treat as unavailable
      }
      resolve({
        available: false,
        retryAfterMs: parseResetTime(stderr),
        stderr,
      });
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve({ available: false, retryAfterMs: null, stderr: "failed to spawn claude" });
    });
  });
}

const HOLLOW_SESSION_MAX_TURNS = 1;
const HOLLOW_SESSION_MAX_MS = 5_000;

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
      `echo "Call get_schema with no arguments and return the result exactly." | claude -p --output-format json --no-session-persistence --tools "" --allowed-tools "${getSchemaTool}"`,
      { encoding: "utf-8", timeout: 90_000 },
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
  tokenUsage: TokenUsage;
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

  const tag = agentShortTag(agentName);
  log(`  🟢 ${agentName} starting...`, tag);

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

    let turnIndex = 0;
    let prevCtxTokens = 0;
    let cumInputTokens = 0;
    let cumOutputTokens = 0;
    let cumCacheRead = 0;
    let cumCacheCreate = 0;

    const rl = readline.createInterface({ input: proc.stdout! });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "assistant" && msg.message?.usage) {
          turnIndex++;
          const u = msg.message.usage;
          const input = u.input_tokens ?? 0;
          const output = u.output_tokens ?? 0;
          const cacheRead = u.cache_read_input_tokens ?? 0;
          const cacheCreate = u.cache_creation_input_tokens ?? 0;
          const ctx = input + cacheRead + cacheCreate;

          const growth = turnIndex === 1
            ? "(initial)"
            : `(+${ctx - prevCtxTokens})`;

          logTokens(
            `turn ${turnIndex} | ctx: ${ctx} ${growth} | out: ${output} | cache: ${cacheRead}r ${cacheCreate}w`,
            tag,
          );

          prevCtxTokens = ctx;
          cumInputTokens += input;
          cumOutputTokens += output;
          cumCacheRead += cacheRead;
          cumCacheCreate += cacheCreate;
        }

        logToolCall(msg, cwd, tag);

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

      if (numTurns <= HOLLOW_SESSION_MAX_TURNS && durationMs < HOLLOW_SESSION_MAX_MS) {
        reject(new QuotaExhaustedError(agentName, numTurns, durationMs, stderr));
        return;
      }

      const tokenUsage: TokenUsage = {
        inputTokens: cumInputTokens,
        outputTokens: cumOutputTokens,
        cacheReadTokens: cumCacheRead,
        cacheCreationTokens: cumCacheCreate,
      };

      logTokens(
        `total | in: ${cumInputTokens} | out: ${cumOutputTokens} | cache: ${cumCacheRead}r ${cumCacheCreate}w | peak_ctx: ${prevCtxTokens}`,
        tag,
      );

      resolve({ text: finalResult, costUsd, durationMs, numTurns, sessionId, tokenUsage });
    });

    proc.on("error", (err) => {
      reject(new Error(`[${agentName}] failed to spawn claude: ${err.message}`));
    });
  });
}

function agentShortTag(agentName: string): string {
  const match = agentName.match(/^(investigator|planner|reporter|tech-reviewer)(?:-(\d+))?$/);
  if (!match) return agentName;
  const [, role, num] = match;
  const prefix = role === "investigator" ? "I" : role === "planner" ? "P" : role === "reporter" ? "R" : "T";
  return `${prefix}-${num || "1"}`;
}

function logToolCall(msg: any, cwd: string, tag: string): void {
  if (msg.type !== "assistant" || !msg.message?.content) return;
  for (const block of msg.message.content) {
    if (block.type !== "tool_use") continue;
    const name = block.name ?? "unknown";
    const input = block.input ?? {};
    const short = formatShort(name, input, cwd);
    const verbose = formatVerbose(name, input, cwd);
    logTool(`     ${short}`, verbose, tag);
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
