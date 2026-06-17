import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const promptDir = join(dirname(fileURLToPath(import.meta.url)));

export function loadPrompt(name: string): string {
  return readFileSync(join(promptDir, `${name}.md`), "utf-8");
}
