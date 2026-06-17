import { appendFileSync } from "fs";
import * as path from "path";

let logPath: string | null = null;

export function initLogger(caseDir: string): void {
  logPath = path.join(caseDir, "investigation.log");
}

function write(level: string, message: string): void {
  if (logPath) {
    appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${message}\n`);
  }
}

export function log(message: string): void {
  console.log(message);
  write("INFO", stripEmoji(message));
}

export function warn(message: string): void {
  console.warn(message);
  write("WARN", stripEmoji(message));
}

export function error(message: string): void {
  console.error(message);
  write("ERROR", stripEmoji(message));
}

export function logTool(consoleLine: string, verboseLine: string): void {
  console.log(consoleLine);
  write("TOOL", verboseLine);
}

function stripEmoji(s: string): string {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅❌✏️⚡⚠️⏳]/gu, "").replace(/\s{2,}/g, " ").trim();
}
