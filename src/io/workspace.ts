import * as fs from "fs/promises";
import * as path from "path";

const INVESTIGATIONS_DIR = "investigations";
const STATE_FILE = "investigation-state.json";

export async function createWorkspace(caseId: string): Promise<string> {
  const caseDir = path.join(INVESTIGATIONS_DIR, caseId);
  await fs.mkdir(caseDir, { recursive: true });
  return caseDir;
}

export function caseMdPath(caseDir: string): string {
  return path.join(caseDir, "case.md");
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function appendFile(filePath: string, content: string): Promise<void> {
  await fs.appendFile(filePath, content, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listThemeFiles(caseDir: string): Promise<string[]> {
  const entries = await fs.readdir(caseDir);
  return entries
    .filter((e) => e.startsWith("theme-") && e.endsWith(".md"))
    .sort();
}

export async function saveState(caseDir: string, state: object): Promise<void> {
  await writeFile(path.join(caseDir, STATE_FILE), JSON.stringify(state, null, 2));
}

export async function loadState(caseDir: string): Promise<object | null> {
  try {
    const raw = await readFile(path.join(caseDir, STATE_FILE));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
