import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import chatHandler from "../api/chat.js";
import healthHandler from "../api/health.js";
import ticketsHandler from "../api/tickets/index.js";
import replyHandler from "../api/tickets/[id]/reply.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/chat") return chatHandler(req, res);
  if (url.pathname === "/api/health") return healthHandler(req, res);
  if (url.pathname === "/api/tickets") return ticketsHandler(req, res);

  const replyMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/reply$/);
  if (replyMatch) {
    req.query = { id: decodeURIComponent(replyMatch[1]) };
    return replyHandler(req, res);
  }

  return serveStatic(url.pathname, res);
});

server.listen(port, () => {
  console.log(`Raccoon AI Support Demo running at http://localhost:${port}`);
});

async function serveStatic(pathname, res) {
  const routePath = pathname === "/" || pathname.startsWith("/products/") || pathname === "/admin"
    ? "/index.html"
    : pathname;
  const relativePath = normalize(routePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, relativePath);

  try {
    const content = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", contentType(filePath));
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
}

function contentType(filePath) {
  const ext = extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}
