import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReplitConnectors } from "@replit/connectors-sdk";

const botRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = process.env.GITHUB_REPO ?? "issrael-09/Bot-replit";
const branch = process.env.GITHUB_BRANCH ?? "main";
const intervalMs = Number(process.env.SYNC_INTERVAL_MS ?? 5000);
const dryRun = process.env.SYNC_DRY_RUN === "1";

const ignoredNames = new Set(["node_modules", ".git", "logs"]);
const ignoredFiles = new Set([".env", ".env.local", ".env.production"]);

function shouldIgnore(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => ignoredNames.has(part))) return true;
  const normalized = relativePath.split(path.sep).join("/");
  if (ignoredFiles.has(normalized)) return true;
  if (normalized.endsWith(".cookies.json")) return true;
  if (normalized.startsWith("config/cookies") && normalized.endsWith(".json")) return true;
  return false;
}

async function walk(directory, relative = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    if (shouldIgnore(childRelative)) continue;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(child, childRelative)));
    } else if (entry.isFile()) {
      files.push(childRelative);
    }
  }
  return files;
}

async function readLocalFiles() {
  const relativePaths = await walk(botRoot);
  const files = new Map();
  for (const relativePath of relativePaths) {
    const data = await fs.readFile(path.join(botRoot, relativePath));
    const gitSha = createHash("sha1")
      .update(`blob ${data.length}\0`)
      .update(data)
      .digest("hex");
    files.set(relativePath.split(path.sep).join("/"), { data, gitSha });
  }
  return files;
}

function apiPath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

async function apiRequest(conn, requestPath, options = {}) {
  const response = await conn.proxyFetch(requestPath, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${requestPath} failed (${response.status})`);
  }
  return body;
}

async function getRemoteTree(conn) {
  const ref = await apiRequest(conn, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commitSha = ref.object?.sha;
  const commit = await apiRequest(conn, `/repos/${repo}/git/commits/${commitSha}`);
  const tree = await apiRequest(conn, `/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const files = new Map();
  for (const item of tree.tree ?? []) {
    if (item.type === "blob" && !shouldIgnore(item.path)) {
      files.set(item.path, item);
    }
  }
  return { commitSha, treeSha: commit.tree.sha, files };
}

async function syncOnce(conn) {
  const localFiles = await readLocalFiles();
  const remote = await getRemoteTree(conn);
  const changes = [];

  for (const [filePath, local] of localFiles) {
    const remoteFile = remote.files.get(filePath);
    if (!remoteFile || remoteFile.sha !== local.gitSha) {
      changes.push({
        path: filePath,
        mode: "100644",
        type: "blob",
        data: local.data,
      });
    }
  }

  for (const filePath of remote.files.keys()) {
    if (!localFiles.has(filePath)) {
      changes.push({ path: filePath, mode: "100644", type: "blob", sha: null });
    }
  }

  if (!changes.length) return { changed: false, count: 0 };

  if (dryRun) {
    return { changed: true, count: changes.length, dryRun: true, paths: changes.map((change) => change.path) };
  }

  for (const change of changes) {
    const blob = await apiRequest(conn, `/repos/${repo}/git/blobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        change.sha === null
          ? { content: "", encoding: "utf-8" }
          : { content: change.data.toString("base64"), encoding: "base64" },
      ),
    });
    change.sha = change.sha === null ? null : blob.sha;
    delete change.data;
  }

  const tree = await apiRequest(conn, `/repos/${repo}/git/trees`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      base_tree: remote.treeSha,
      tree: changes,
    }),
  });
  const commit = await apiRequest(conn, `/repos/${repo}/git/commits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `Sync Replit bot changes (${changes.length} file${changes.length === 1 ? "" : "s"})`,
      tree: tree.sha,
      parents: [remote.commitSha],
    }),
  });
  await apiRequest(conn, `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    changed: true,
    count: changes.length,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
    paths: changes.map((change) => change.path),
  };
}

async function main() {
  const connectors = new ReplitConnectors();
  const run = async () => {
    try {
      const result = await syncOnce({
        proxyFetch: (requestPath, options) => connectors.proxy("github", requestPath, options),
      });
      if (result.changed) {
        process.stdout.write(`[sync] ${JSON.stringify(result)}\n`);
      }
    } catch (error) {
      process.stderr.write(`[sync] ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };

  await run();
  setInterval(run, intervalMs);
}

main().catch((error) => {
  process.stderr.write(`[sync] fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});