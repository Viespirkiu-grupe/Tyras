import * as fs from "fs/promises";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const INVESTIGATIONS_DIR = "investigations";
const STATE_FILE = "investigation-state.json";

export interface IWorkspace {
  createCaseDir(caseId: string): Promise<string>;
  caseMdPath(caseDir: string): string;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  appendFile(filePath: string, content: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  listThemeFiles(caseDir: string): Promise<string[]>;
  saveState(caseDir: string, state: object): Promise<void>;
  loadState(caseDir: string): Promise<object | null>;
  loadPromptTemplate(name: string): string;
}

export function fillVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

export class Workspace implements IWorkspace {
  private readonly promptDir: string;

  constructor(promptDir?: string) {
    this.promptDir = promptDir ?? path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/prompts",
    );
  }

  async createCaseDir(caseId: string): Promise<string> {
    const caseDir = path.join(INVESTIGATIONS_DIR, caseId);
    await fs.mkdir(caseDir, { recursive: true });
    return caseDir;
  }

  caseMdPath(caseDir: string): string {
    return path.join(caseDir, "case.md");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    await fs.appendFile(filePath, content, "utf-8");
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listThemeFiles(caseDir: string): Promise<string[]> {
    const entries = await fs.readdir(caseDir);
    return entries
      .filter((e) => e.startsWith("theme-") && e.endsWith(".md"))
      .sort();
  }

  async saveState(caseDir: string, state: object): Promise<void> {
    await this.writeFile(
      path.join(caseDir, STATE_FILE),
      JSON.stringify(state, null, 2),
    );
  }

  async loadState(caseDir: string): Promise<object | null> {
    try {
      const raw = await this.readFile(path.join(caseDir, STATE_FILE));
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  loadPromptTemplate(name: string): string {
    return readFileSync(path.join(this.promptDir, `${name}.md`), "utf-8");
  }
}
