import { investigate } from "./orchestrator.js";
import { HELP_TEXT } from "./help.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const command = args[0];

  if (command === "investigate") {
    const promptParts = args.slice(1).filter((a) => !a.startsWith("--"));
    if (promptParts.length === 0) {
      console.error("Error: provide a case prompt as argument");
      console.error('Usage: npm run investigate -- investigate "Case description..." --keyword kelme');
      process.exit(1);
    }
    await investigate({
      casePrompt: promptParts.join(" "),
      caseId: getFlagValue(args, "--case-id"),
      keyword: getFlagValue(args, "--keyword"),
      resume: false,
    });
  } else if (command === "resume") {
    const caseId = args[1];
    if (!caseId) {
      console.error("Error: provide case ID to resume");
      console.error("Usage: npm run investigate -- resume 20260617_kelme");
      process.exit(1);
    }
    await investigate({
      casePrompt: "",
      caseId,
      resume: true,
    });
  } else {
    const promptParts = args.filter((a) => !a.startsWith("--"));
    if (promptParts.length === 0) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    await investigate({
      casePrompt: promptParts.join(" "),
      caseId: getFlagValue(args, "--case-id"),
      keyword: getFlagValue(args, "--keyword"),
      resume: false,
    });
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
