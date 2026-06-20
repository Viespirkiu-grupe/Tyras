export const CONFIG = {
  model: process.env.MODEL || "sonnet",
  maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
  parallelThemes: process.env.PARALLEL === "true",
  quotaProbeIntervalMs: parseInt(process.env.QUOTA_PROBE_INTERVAL_MS || "300000", 10),
  quotaMaxWaitMs: parseInt(process.env.QUOTA_MAX_WAIT_MS || "28800000", 10),
};
