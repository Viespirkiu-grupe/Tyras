import { investigate } from "./orchestrator.js";
import { HELP_TEXT } from "./help.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const caseId = args[0];
  await investigate(caseId);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
