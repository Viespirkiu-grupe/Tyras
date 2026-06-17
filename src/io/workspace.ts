import * as fs from "fs/promises";
import * as path from "path";

const INVESTIGATIONS_DIR = "investigations";

export async function generateCaseId(keyword: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = `${date}_${keyword}`;

  try {
    const entries = await fs.readdir(INVESTIGATIONS_DIR);
    if (!entries.includes(base)) return base;
    let suffix = 2;
    while (entries.includes(`${base}_${suffix}`)) suffix++;
    return `${base}_${suffix}`;
  } catch {
    return base;
  }
}

export function sanitizeKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
}

export async function createWorkspace(caseId: string): Promise<string> {
  const caseDir = path.join(INVESTIGATIONS_DIR, caseId);
  await fs.mkdir(caseDir, { recursive: true });
  return caseDir;
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
  await writeFile(path.join(caseDir, "state.json"), JSON.stringify(state, null, 2));
}

export async function loadState(caseDir: string): Promise<object | null> {
  try {
    const raw = await readFile(path.join(caseDir, "state.json"));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
