// Local preview without the Netlify CLI:  node dev-server.mjs   (data lives in memory, resets on restart)
process.env.P2P_MEMORY = process.env.P2P_MEMORY || "1";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { default: api } = await import("./netlify/functions/api.mjs");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" };

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await api(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
    }
    let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(root)) throw new Error("no");
    let data; try { data = await readFile(f); } catch { f = path.join(root, "index.html"); data = await readFile(f); }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(process.env.PORT || 8888, () => console.log(`http://localhost:${process.env.PORT || 8888}`));
