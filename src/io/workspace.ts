import * as fs from "fs/promises";
import * as path from "path";

const INVESTIGATIONS_DIR = "investigations";

// @TODO: format must be date + keyword. For example: 20260517_kelme - agent will tell you keyword, just ask, it must be no more than 20 symbols, better a single or two words in Latin, lowercased, joined by underscore _
export async function generateCaseId(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const entries = await fs.readdir(INVESTIGATIONS_DIR);
    const existing = entries
      .filter((e) => e.startsWith(`inv-${year}-`))
      .map((e) => parseInt(e.split("-")[2], 10))
      .filter((n) => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `inv-${year}-${String(next).padStart(3, "0")}`;
  } catch {
    return `inv-${year}-001`;
  }
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
