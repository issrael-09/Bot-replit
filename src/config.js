import fs from "node:fs";
import { fileURLToPath } from "node:url";

const nameConfigPath = fileURLToPath(new URL("../config/bot-name.json", import.meta.url));

function readBotNameConfig() {
  try {
    return JSON.parse(fs.readFileSync(nameConfigPath, "utf8"));
  } catch {
    return {
      name: "بوت الحماية",
      shortName: "Safe Bot",
      prefix: "",
      welcomeTitle: "مرحبا بكم",
    };
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const BOT_CONFIG = readBotNameConfig();

export const RUNTIME_CONFIG = {
  port: positiveInteger(process.env.PORT, 3000),
  windowMs: positiveInteger(process.env.SPAM_WINDOW_MS, 10000),
  maxMessages: positiveInteger(process.env.SPAM_MAX_MESSAGES, 6),
  strikeLimit: positiveInteger(process.env.SPAM_STRIKE_LIMIT, 3),
  bodyLimitBytes: positiveInteger(process.env.MAX_BODY_BYTES, 64 * 1024),
  webhookToken: process.env.WEBHOOK_TOKEN?.trim() || null,
};