// Tiny key/value layer. Netlify Blobs in production, a Map for local tests (P2P_MEMORY=1).
// update(key, fn) is a read-modify-write that retries if someone else wrote in between.
const mem = new Map();
let blobs;

async function real() {
  if (!blobs) {
    const { getStore } = await import("@netlify/blobs");
    blobs = getStore({ name: "p2p", consistency: "strong" });
  }
  return blobs;
}

export const store = {
  async get(key) {
    if (process.env.P2P_MEMORY) return mem.has(key) ? structuredClone(mem.get(key)) : null;
    return (await (await real()).get(key, { type: "json" })) ?? null;
  },
  async set(key, value) {
    if (process.env.P2P_MEMORY) return void mem.set(key, structuredClone(value));
    await (await real()).setJSON(key, value);
  },
  async update(key, fn) {
    if (process.env.P2P_MEMORY) {
      const next = await fn(mem.has(key) ? structuredClone(mem.get(key)) : null);
      if (next !== undefined) mem.set(key, structuredClone(next));
      return next;
    }
    const s = await real();
    for (let i = 0; i < 8; i++) {
      const r = await s.getWithMetadata(key, { type: "json" });
      const next = await fn(r ? structuredClone(r.data) : null);
      if (next === undefined) return r ? r.data : null;
      const res = await s.setJSON(key, next, r?.etag ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
      if (!res || res.modified !== false) return next;
      await new Promise((ok) => setTimeout(ok, 30 + Math.random() * 60));
    }
    throw new Error("busy, try again");
  },
  async keys(prefix) {
    if (process.env.P2P_MEMORY) return [...mem.keys()].filter((k) => k.startsWith(prefix));
    const { blobs: list } = await (await real()).list({ prefix });
    return list.map((b) => b.key);
  },
};
