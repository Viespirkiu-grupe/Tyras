export const CONFIG = {
  model: process.env.MODEL || "sonnet",
  maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
  parallelThemes: process.env.PARALLEL === "true",
};
