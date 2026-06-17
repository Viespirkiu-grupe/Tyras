export const CONFIG = {
  model: process.env.MODEL || "sonnet",
  maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
  maxBudgetPerStep: parseFloat(process.env.MAX_BUDGET_PER_STEP || "5.0"),
  parallelThemes: process.env.PARALLEL === "true",
};
