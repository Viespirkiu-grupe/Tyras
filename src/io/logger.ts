import { appendFileSync } from "fs";
import * as path from "path";

let logPath: string | null = null;

export function initLogger(caseDir: string): void {
  logPath = path.join(caseDir, "investigation.log");
}

function localTimestamp(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ` +
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}.${pad3(now.getMilliseconds())}`
  );
}

function write(level: string, message: string, tag?: string): void {
  if (!logPath) return;
  const stripped = message.trim();
  if (!stripped) return;
  const tagStr = tag ? `[${tag}]` : "";
  appendFileSync(logPath, `${localTimestamp()} [${level}]${tagStr} ${stripped}\n`);
}

export function log(message: string, tag?: string): void {
  console.log(message);
  write("INFO", stripEmoji(message), tag);
}

export function warn(message: string, tag?: string): void {
  console.warn(message);
  write("WARN", stripEmoji(message), tag);
}

export function error(message: string, tag?: string): void {
  console.error(message);
  write("ERROR", stripEmoji(message), tag);
}

export function logTool(consoleLine: string, verboseLine: string, tag?: string): void {
  console.log(consoleLine);
  write("TOOL", verboseLine, tag);
}

function stripEmoji(s: string): string {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅❌✏️⚡⚠️⏳]/gu, "").replace(/\s{2,}/g, " ").trim();
}
