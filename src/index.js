import { createServer } from "node:http";
import { BOT_CONFIG, RUNTIME_CONFIG } from "./config.js";
import { ModerationBot } from "./moderation.js";

class ConsoleAdapter {
  async execute(action) {
    process.stdout.write(`[adapter] ${JSON.stringify(action)}\n`);
  }
}

const bot = new ModerationBot(new ConsoleAdapter());
const port = RUNTIME_CONFIG.port;

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) chunks.push(chunk);
  for (const chunk of chunks) size += chunk.length;
  if (size > RUNTIME_CONFIG.bodyLimitBytes) {
    throw new Error("request body is too large");
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (
      RUNTIME_CONFIG.webhookToken &&
      url.pathname === "/webhook" &&
      req.headers.authorization !== `Bearer ${RUNTIME_CONFIG.webhookToken}`
    ) {
      return json(res, 401, { error: "unauthorized" });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: BOT_CONFIG.shortName });
    }

    if (req.method === "GET" && url.pathname === "/") {
      return json(res, 200, {
        name: BOT_CONFIG.name,
        shortName: BOT_CONFIG.shortName,
        message: "Platform-neutral moderation bot core is running.",
        endpoints: ["POST /webhook", "GET /groups/:groupId"],
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/groups/")) {
      const groupId = decodeURIComponent(url.pathname.slice("/groups/".length));
      return json(res, 200, bot.snapshot(groupId));
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      const event = await readBody(req);
      const result = await bot.handle(event);
      return json(res, 200, result);
    }

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    const statusCode = error instanceof Error && error.message === "request body is too large" ? 413 : 400;
    return json(res, statusCode, {
      error: "bad_request",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

server.listen(port, () => {
  process.stdout.write(`Safe bot core listening on port ${port}\n`);
});
