import type { IWorkspace } from "./workspace.js";

export class MockWorkspace implements IWorkspace {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly prompts = new Map<string, string>();

  async createCaseDir(caseId: string): Promise<string> {
    const caseDir = `investigations/${caseId}`;
    this.dirs.add(caseDir);
    return caseDir;
  }

  caseMdPath(caseDir: string): string {
    return `${caseDir}/case.md`;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return content;
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const existing = this.files.get(filePath) ?? "";
    this.files.set(filePath, existing + content);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  async listThemeFiles(caseDir: string): Promise<string[]> {
    const prefix = `${caseDir}/`;
    return [...this.files.keys()]
      .filter((f) => f.startsWith(prefix))
      .map((f) => f.slice(prefix.length))
      .filter((f) => f.startsWith("theme-") && f.endsWith(".md") && !f.includes("/"))
      .sort();
  }

  async saveState(caseDir: string, state: object): Promise<void> {
    await this.writeFile(`${caseDir}/investigation-state.json`, JSON.stringify(state, null, 2));
  }

  async loadState(caseDir: string): Promise<object | null> {
    try {
      const raw = await this.readFile(`${caseDir}/investigation-state.json`);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  loadPromptTemplate(name: string): string {
    const content = this.prompts.get(name);
    if (content === undefined) throw new Error(`Prompt template not found: ${name}`);
    return content;
  }
}
