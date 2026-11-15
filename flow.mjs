// End-to-end test of the API with the in-memory store:  npm test
process.env.P2P_MEMORY = "1";
const { default: api } = await import("../netlify/functions/api.mjs");
import assert from "node:assert/strict";

const call = async (tok, path, body = {}) => {
  const r = await api(new Request(`http://x/api/${path}`, { method: "POST", headers: tok ? { authorization: `Bearer ${tok}` } : {}, body: JSON.stringify(body) }));
  const j = await r.json();
  return { s: r.status, ...j };
};
const signup = async (u) => (await call(null, "signup", { username: u, password: "secret1", display: u.toUpperCase() })).token;

const a = await signup("mika"), b = await signup("ren"), c = await signup("lee");
assert.equal((await call(null, "signup", { username: "mika", password: "secret1" })).s, 409);
assert.equal((await call(null, "login", { username: "mika", password: "wrong!!" })).s, 401);
assert.ok((await call(null, "login", { username: "mika", password: "secret1" })).token);

// characters, split by gender
assert.equal((await call(a, "avatar", { gender: "girl", avatar: "girls/girl03.png" })).ok, true);
assert.equal((await call(b, "avatar", { gender: "boy", avatar: "boys/boy04.png" })).ok, true);
assert.equal((await call(b, "avatar", { gender: "boy", avatar: "girls/girl03.png" })).s, 400);
await call(a, "profile", { display: "Mika", interests: ["Biology"] });

// human pair
await call(a, "match/start", { subject: "Biology" }); await call(b, "match/start", { subject: "Biology" });
const pa = await call(a, "match/poll"); assert.equal(pa.state, "room");
const pb = await call(b, "match/poll"); assert.equal(pb.code, pa.code);
const code = pa.code;
console.log("human pair ok");

// bot fallback after 30s
await call(c, "match/start", { subject: "Physics" });
let w = await call(c, "match/poll"); assert.equal(w.state, "wait");
const realNow = Date.now; Date.now = () => realNow() + 31_000;
const pc = await call(c, "match/poll"); Date.now = realNow;
assert.equal(pc.state, "room");
await call(c, "room/send", { code: pc.code, body: "quiz me please" });
const cs = await call(c, "room/state", { code: pc.code });
assert.ok(cs.messages.some((m) => /Quiz time/.test(m.body)) && cs.room.bot);
console.log("bot fallback ok");

// friends by username
assert.equal((await call(a, "friends/add", { name: "ren" })).status, "sent");
assert.equal((await call(b, "friends", {})).requests.length, 1);
await call(b, "friends/answer", { name: "mika", accept: true });
assert.equal((await call(a, "friends", {})).friends[0].name, "ren");
assert.equal((await call(a, "friends", { q: "re" })).results[0].name, "ren");
assert.equal((await call(c, "dm/state", { name: "mika" })).s, 403);
console.log("friends ok");

// chat templates + auto-responder while friend is in focus
await call(a, "dm/send", { name: "ren", body: "Let's study together!" });
assert.equal((await call(b, "dm/state", { name: "mika" })).messages.length, 1);

// shared timer, sticker reward, stats
await call(a, "room/timer", { code, focus: 1, brk: 1 });
const t = await call(b, "room/state", { code });
assert.equal(t.timer.phase, "focus");
await call(a, "dm/send", { name: "ren", body: "reply?" });
assert.ok((await call(a, "dm/state", { name: "ren" })).messages.some((m) => m.auto), "auto-reply while in focus");
Date.now = () => realNow() + 70_000;
const ra = await call(a, "room/state", { code }), rb = await call(b, "room/state", { code });
Date.now = realNow;
assert.ok(ra.claim.sticker && rb.claim.sticker);
const st = await call(a, "stats", { tz: 0 });
assert.equal(st.stats.total, 1); assert.equal(st.stats.board[0].name, "ren"); assert.equal(st.stats.top[0].subject, "Biology");
assert.ok(Object.keys(st.stats.owned).length === 1);
console.log("timer/rewards/stats ok");

// rooms + invites
const nr = await call(a, "rooms/create", { name: "Cram club", subject: "Biology", max: 3 });
assert.equal((await call(b, "rooms/list")).rooms[0].name, "Cram club");
await call(b, "rooms/join", { code: nr.code });
const sr = await call(a, "dm/study", { name: "ren" });
assert.equal((await call(b, "home", {})).invites[0].code, sr.code);
assert.equal((await call(b, "rooms/join", { code: sr.code })).code, sr.code);
assert.equal((await call(c, "rooms/join", { code: sr.code })).s, 403);
console.log("ALL OK");
