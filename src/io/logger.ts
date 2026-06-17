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
  write("INFO", message);
}

export function warn(message: string): void {
  console.warn(message);
  write("WARN", message);
}

export function error(message: string): void {
  console.error(message);
  write("ERROR", message);
}
