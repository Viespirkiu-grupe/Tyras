import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const promptDir = join(dirname(fileURLToPath(import.meta.url)), "../../docs/prompts");

export function loadPromptTemplate(name: string): string {
  return readFileSync(join(promptDir, `${name}.md`), "utf-8");
}

export function fillVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
