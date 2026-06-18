export const CONFIG = {
  model: process.env.MODEL || "sonnet",
  maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
  parallelThemes: process.env.PARALLEL === "true",
  quotaMaxRetries: parseInt(process.env.QUOTA_MAX_RETRIES || "30", 10),
  quotaBaseDelayMs: parseInt(process.env.QUOTA_BASE_DELAY_MS || "60000", 10),
  quotaMaxDelayMs: parseInt(process.env.QUOTA_MAX_DELAY_MS || "1800000", 10),
};
