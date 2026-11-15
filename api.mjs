// Peer to Pair backend: one Netlify Function that answers every /api/* call.
import crypto from "node:crypto";
import { AVATARS, BOT, STICKERS, SUBJECT_NAMES } from "../../public/catalog.mjs";
import { botReply, greeting } from "./lib/bot.mjs";
import { store } from "./lib/store.mjs";

export const config = { path: "/api/*" };

const SECRET = process.env.P2P_SECRET || "dev-secret-change-me";
const MATCH_TIMEOUT = 30_000;
const ONLINE = 70_000;
const ROOM_ACTIVE = 45_000;
const now = () => Date.now();
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const code = () => crypto.randomBytes(5).toString("hex");
const clean = (s, n) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

// ------------------------------------------------------------- auth
const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
const makeToken = (name) => { const p = Buffer.from(JSON.stringify({ u: name, e: now() + 30 * 864e5 })).toString("base64url"); return `${p}.${sign(p)}`; };
function readToken(t = "") {
  const [p, s] = t.replace(/^Bearer /, "").split(".");
  if (!p || !s || sign(p) !== s) return null;
  const d = JSON.parse(Buffer.from(p, "base64url").toString());
  return d.e > now() ? d.u : null;
}
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const uKey = (n) => `u:${n}`;
const getUser = (n) => store.get(uKey(n));
const pub = (u) => ({ name: u.name, display: u.display, avatar: u.avatar, bio: u.bio, interests: u.interests, online: now() - u.seen < ONLINE });
const priv = (u) => ({ ...pub(u), gender: u.gender, away: u.away });

async function auth(req) {
  const name = readToken(req.headers.get("authorization") || "");
  const u = name && (await getUser(name));
  if (!u) throw fail(401, "Please log in again.");
  if (now() - u.seen > 20_000) { u.seen = now(); await store.update(uKey(name), (c) => c && { ...c, seen: now() }); }
  return u;
}
const patchUser = (name, fn) => store.update(uKey(name), (c) => { if (!c) return undefined; fn(c); return c; });

// ------------------------------------------------------------- friends
const status = (me, other) => (me.name === other ? "self" : me.friends[other] || null);

async function befriend(me, other) {
  const st = status(me, other);
  if (!st && other !== me.name) {
    await patchUser(me.name, (u) => (u.friends[other] = "sent"));
    await patchUser(other, (u) => (u.friends[me.name] = "received"));
    return "sent";
  }
  if (st === "received") { await accept(me.name, other); return "friends"; }
  return st;
}
async function accept(a, b) { await patchUser(a, (u) => (u.friends[b] = "friends")); await patchUser(b, (u) => (u.friends[a] = "friends")); }
async function unfriend(a, b) { await patchUser(a, (u) => delete u.friends[b]); await patchUser(b, (u) => delete u.friends[a]); }
const friendNames = (u) => Object.keys(u.friends).filter((k) => u.friends[k] === "friends");
async function usersOf(names) { return (await Promise.all(names.map(getUser))).filter(Boolean); }

// ------------------------------------------------------------- chat + rooms
const roomKey = (c) => `room:${c}`;
const chatKey = (k) => `chat:${k}`;
const dmId = (a, b) => [a, b].sort().join(":");
const addMsg = (k, m) => store.update(chatKey(k), (c) => { const l = c || []; l.push({ id: crypto.randomUUID(), t: now(), ...m }); return l.slice(-80); });

async function newRoom(host, o) {
  const c = o.code || code();
  const r = { code: c, name: o.name, subject: o.subject, kind: o.kind, host, bot: !!o.bot, priv: !!o.priv, max: o.max || 6, created: now(),
    focus: 25, brk: 5, start: null, round: 0, members: {}, invites: {} };
  for (const m of o.members || [host]) r.members[m] = { seen: now() };
  await store.set(roomKey(c), r);
  if (!r.priv) await store.update("index", (i) => [c, ...(i || [])].slice(0, 60));
  return r;
}
async function getRoom(c) { const r = await store.get(roomKey(c)); if (!r) throw fail(404, "Room not found."); return r; }
const activeMembers = (r, win = ROOM_ACTIVE) => Object.keys(r.members).filter((m) => now() - r.members[m].seen < win);

async function needMember(c, me) {
  const r = await getRoom(c);
  if (!r.members[me.name]) throw fail(403, "Join this room first.");
  return r;
}
async function touchRoom(r, me) {
  if (now() - r.members[me.name].seen > 15_000) {
    await store.update(roomKey(r.code), (c) => { if (c?.members[me.name]) c.members[me.name].seen = now(); return c || undefined; });
    r.members[me.name].seen = now();
  }
}
function timerState(r) {
  if (!r.start) return { phase: "idle", remaining: 0 };
  const el = (now() - r.start) / 1000, f = r.focus * 60, b = r.brk * 60;
  if (el < f) return { phase: "focus", remaining: Math.ceil(f - el) };
  if (el < f + b) return { phase: "break", remaining: Math.ceil(f + b - el) };
  return { phase: "done", remaining: 0 };
}

async function claimReward(r, me) {
  if (!r.start || now() - r.start < r.focus * 60_000) return null;
  const have = (u) => u.claims.find((c) => c.room === r.code && c.round === r.round);
  if (have(me)) return have(me);
  const sticker = pick(STICKERS);
  const others = activeMembers(r, 120_000).filter((m) => m !== me.name);
  let claim = null;
  await patchUser(me.name, (u) => {
    if (have(u)) { claim = have(u); return; }
    claim = { room: r.code, round: r.round, subject: r.subject, min: r.focus, sticker, isNew: !u.stickers[sticker], bot: r.bot, t: now() };
    u.claims.push(claim);
    u.stickers[sticker] = (u.stickers[sticker] || 0) + 1;
    for (const o of others) u.costudy[o] = (u.costudy[o] || 0) + r.focus;
  });
  if (r.bot && claim.sticker === sticker) await addMsg(`room:${r.code}`, { from: null, body: "Session complete! You earned a sticker. Take your break, you earned it.", auto: 1 });
  return claim;
}

// ------------------------------------------------------------- stats
function statsOf(u, tz = 0) {
  const day = (t) => new Date(t - tz * 60_000).toISOString().slice(0, 10);
  const byDay = {}; let total = 0; const bySubject = {};
  for (const c of u.claims) { total += c.min; byDay[day(c.t)] = (byDay[day(c.t)] || 0) + c.min; bySubject[c.subject] = (bySubject[c.subject] || 0) + c.min; }
  const week = [];
  for (let i = 6; i >= 0; i--) { const t = now() - i * 864e5; week.push({ d: new Date(t - tz * 60_000).toUTCString().slice(0, 3), m: byDay[day(t)] || 0 }); }
  let streak = 0, i = byDay[day(now())] ? 0 : 1;
  while (byDay[day(now() - i * 864e5)]) { streak++; i++; }
  const friends = friendNames(u);
  return {
    total, sessions: u.claims.length, streak, level: 1 + Math.floor(total / 120), toNext: 120 - (total % 120), today: byDay[day(now())] || 0, week,
    top: Object.entries(bySubject).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([subject, m]) => ({ subject, m })),
    board: Object.entries(u.costudy).filter(([n]) => friends.includes(n)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, m]) => ({ name, m })),
    owned: u.stickers,
  };
}
async function withBoardUsers(s) { const us = await usersOf(s.board.map((b) => b.name)); s.board = s.board.map((b) => ({ ...b, user: us.find((u) => u.name === b.name) && pub(us.find((u) => u.name === b.name)) })); return s; }

// ------------------------------------------------------------- routes
const routes = {
  async signup(req, b) {
    const name = clean(b.username, 20).toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_.]{3,20}$/.test(name)) throw fail(400, "Usernames are 3 to 20 characters: letters, numbers, _ or .");
    if (String(b.password || "").length < 6) throw fail(400, "Password needs at least 6 characters.");
    const salt = crypto.randomBytes(16).toString("hex");
    let ok = false;
    await store.update(uKey(name), (c) => {
      if (c) return undefined;
      ok = true;
      return { name, display: clean(b.display, 24) || name, salt, hash: hash(b.password, salt), gender: "girl", avatar: AVATARS.girl[0], bio: "", interests: [], away: "",
        created: now(), seen: now(), friends: {}, claims: [], stickers: {}, costudy: {}, focusUntil: 0 };
    });
    if (!ok) throw fail(409, "That username is taken. Try another!");
    return { token: makeToken(name) };
  },
  async login(req, b) {
    const u = await getUser(clean(b.username, 20).toLowerCase().replace(/^@/, ""));
    if (!u || hash(String(b.password || ""), u.salt) !== u.hash) throw fail(401, "Wrong username or password.");
    return { token: makeToken(u.name) };
  },
  async me(req) { return { me: priv(await auth(req)) }; },
  async avatar(req, b) {
    const u = await auth(req);
    if (!AVATARS[b.gender]?.includes(b.avatar)) throw fail(400, "Unknown character.");
    await patchUser(u.name, (x) => { x.avatar = b.avatar; x.gender = b.gender; });
    return { ok: true };
  },
  async profile(req, b) {
    const u = await auth(req);
    await patchUser(u.name, (x) => {
      x.display = clean(b.display, 24) || x.name; x.bio = clean(b.bio, 90); x.away = clean(b.away, 90);
      x.interests = (b.interests || []).filter((s) => SUBJECT_NAMES.includes(s));
    });
    return { ok: true };
  },
  async home(req, b) {
    const u = await auth(req);
    const fr = (await usersOf(friendNames(u))).map(pub);
    const rooms = await publicRooms(3);
    const s = statsOf(u, b.tz);
    return { friendsOnline: fr.filter((f) => f.online), rooms, invites: await invitesFor(u), stats: { level: s.level, today: s.today, streak: s.streak } };
  },
  async stats(req, b) {
    const u = await auth(req);
    return { me: priv(u), stats: await withBoardUsers(statsOf(u, b.tz)) };
  },
  async user(req, b) {
    const me = await auth(req), u = await getUser(clean(b.name, 20));
    if (!u) throw fail(404, "No such student.");
    return { user: pub(u), status: status(me, u.name), stats: (({ level, total }) => ({ level, total }))(statsOf(u)) };
  },

  // ---- matchmaking (30s, then Mochi)
  async "match/start"(req, b) {
    const u = await auth(req);
    if (!SUBJECT_NAMES.includes(b.subject)) throw fail(400, "Pick a subject.");
    await store.update("queue", (q) => ({ ...(q || {}), [u.name]: { subject: b.subject, since: now(), seen: now(), room: null } }));
    return { ok: true };
  },
  async "match/poll"(req) {
    const u = await auth(req);
    const newCode = code(); let out = { state: "none" };
    await store.update("queue", async (q) => {
      q = q || {}; const me = q[u.name];
      if (!me) { out = { state: "none" }; return undefined; }
      if (me.room) { out = { state: "room", code: me.room }; delete q[u.name]; return q; }
      me.seen = now();
      const partner = Object.entries(q).filter(([n, e]) => n !== u.name && e.subject === me.subject && !e.room && now() - e.seen < 8000).sort((a, b) => a[1].since - b[1].since)[0];
      if (partner) {
        await newRoom(u.name, { code: newCode, name: `${me.subject} study match`, subject: me.subject, kind: "match", priv: true, max: 2, members: [u.name, partner[0]] });
        await addMsg(`room:${newCode}`, { from: null, body: `You two matched on ${me.subject}! Say hi, start the timer, or jump on video.`, auto: 1 });
        partner[1].room = newCode; delete q[u.name];
        out = { state: "room", code: newCode }; return q;
      }
      const left = MATCH_TIMEOUT - (now() - me.since);
      if (left <= 0) {
        await newRoom(u.name, { code: newCode, name: `${me.subject} with ${BOT.name}`, subject: me.subject, kind: "match", priv: true, max: 1, bot: true });
        await addMsg(`room:${newCode}`, { from: null, body: greeting(me.subject, u.display) });
        delete q[u.name]; out = { state: "room", code: newCode }; return q;
      }
      out = { state: "wait", left, subject: me.subject }; return q;
    });
    return out;
  },
  async "match/cancel"(req) { const u = await auth(req); await store.update("queue", (q) => { if (!q) return undefined; delete q[u.name]; return q; }); return { ok: true }; },

  // ---- rooms
  async "rooms/list"(req) { await auth(req); return { rooms: await publicRooms(30) }; },
  async "rooms/create"(req, b) {
    const u = await auth(req);
    const subject = SUBJECT_NAMES.includes(b.subject) ? b.subject : "Other";
    const r = await newRoom(u.name, { name: clean(b.name, 40) || `${subject} study room`, subject, kind: "public", priv: !!b.private, max: Math.max(2, Math.min(8, +b.max || 4)) });
    return { code: r.code };
  },
  async "rooms/join"(req, b) {
    const u = await auth(req);
    await getRoom(b.code);
    let err = null;
    await store.update(roomKey(b.code), (r) => {
      if (r.members[u.name]) { r.members[u.name].seen = now(); return r; }
      if ((r.priv && !r.invites[u.name]) || Object.keys(r.members).length >= r.max) { err = fail(403, "That room is full or private."); return undefined; }
      r.members[u.name] = { seen: now() }; delete r.invites[u.name]; return r;
    });
    if (err) throw err;
    return { code: b.code };
  },
  async "room/state"(req, b) {
    const me = await auth(req);
    const r = await needMember(b.code, me);
    await touchRoom(r, me);
    const claim = await claimReward(r, me);
    const act = await usersOf(activeMembers(r));
    return { room: { code: r.code, name: r.name, subject: r.subject, bot: r.bot, max: r.max, focus: r.focus, brk: r.brk }, timer: timerState(r), claim,
      members: act.map(pub), messages: await store.get(chatKey(`room:${r.code}`)) || [], now: now() };
  },
  async "room/send"(req, b) {
    const me = await auth(req);
    const r = await needMember(b.code, me);
    const body = clean(b.body, 400); const sticker = me.stickers[b.sticker] ? b.sticker : "";
    if (!body && !sticker) return { ok: true };
    const hist = (await store.get(chatKey(`room:${r.code}`)) || []).slice(-12).filter((m) => m.body).map((m) => [m.from ? "me" : "bot", m.body]);
    await addMsg(`room:${r.code}`, { from: me.name, body, sticker });
    if (r.bot && body) await addMsg(`room:${r.code}`, { from: null, body: await botReply(body, r.subject, hist) });
    return { ok: true };
  },
  async "room/timer"(req, b) {
    const me = await auth(req);
    const r = await needMember(b.code, me);
    const focus = Math.max(1, Math.min(180, +b.focus || 25)), brk = Math.max(1, Math.min(60, +b.brk || 5));
    await startTimer(r, focus, brk);
    return { ok: true };
  },
  async "timer/create"(req, b) {
    const me = await auth(req);
    const subject = SUBJECT_NAMES.includes(b.subject) ? b.subject : "Other";
    const r = await newRoom(me.name, { name: `${subject} focus room`, subject, kind: "friends", priv: true });
    const mine = friendNames(me);
    for (const f of b.friends || []) if (mine.includes(f)) await inviteUser(r.code, me.name, f);
    await startTimer(r, Math.max(1, Math.min(180, +b.focus || 25)), Math.max(1, Math.min(60, +b.brk || 5)));
    return { code: r.code };
  },

  // ---- friends + chat
  async friends(req, b) {
    const me = await auth(req);
    const fr = (await usersOf(friendNames(me))).map(pub);
    const req_ = (await usersOf(Object.keys(me.friends).filter((k) => me.friends[k] === "received"))).map(pub);
    let results = null;
    const text = clean(b.q, 30).toLowerCase().replace(/^@/, ""), subj = b.subject;
    if (text || subj) {
      const all = (await usersOf((await store.keys("u:")).map((k) => k.slice(2)).slice(0, 300))).filter((u) => u.name !== me.name);
      results = all.filter((u) => (!text || u.name.includes(text) || u.display.toLowerCase().includes(text)) && (!subj || u.interests.includes(subj)))
        .sort((a, b) => b.seen - a.seen).slice(0, 30).map((u) => ({ ...pub(u), status: status(me, u.name) }));
    }
    return { friends: fr, requests: req_, results };
  },
  async "friends/add"(req, b) {
    const me = await auth(req), other = await getUser(clean(b.name, 20).toLowerCase().replace(/^@/, ""));
    if (!other || other.name === me.name) throw fail(404, "We couldn't find that username.");
    return { status: await befriend(me, other.name), display: other.display };
  },
  async "friends/answer"(req, b) {
    const me = await auth(req);
    if (me.friends[b.name] !== "received") return { ok: true };
    if (b.accept) await accept(me.name, b.name); else await unfriend(me.name, b.name);
    return { ok: true };
  },
  async "dm/state"(req, b) {
    const me = await auth(req), f = await getUser(clean(b.name, 20));
    if (!f || status(me, f.name) !== "friends") throw fail(403, "You can chat once you are friends.");
    return { friend: pub(f), messages: await store.get(chatKey(`dm:${dmId(me.name, f.name)}`)) || [], now: now() };
  },
  async "dm/send"(req, b) {
    const me = await auth(req), f = await getUser(clean(b.name, 20));
    if (!f || status(me, f.name) !== "friends") throw fail(403, "You can chat once you are friends.");
    const body = clean(b.body, 400), sticker = me.stickers[b.sticker] ? b.sticker : "", k = `dm:${dmId(me.name, f.name)}`;
    if (!body && !sticker) return { ok: true };
    await addMsg(k, { from: me.name, body, sticker });
    const recent = (await store.get(chatKey(k)) || []).some((m) => m.auto && m.from === f.name && now() - m.t < 600_000);
    if (f.focusUntil > now() && !recent) await addMsg(k, { from: f.name, body: f.away || "I'm in a focus session right now. I'll reply when my timer ends!", auto: 1 });
    return { ok: true };
  },
  async "dm/study"(req, b) {
    const me = await auth(req), f = await getUser(clean(b.name, 20));
    if (!f || status(me, f.name) !== "friends") throw fail(403, "Add them as a friend first.");
    const r = await newRoom(me.name, { name: `${me.display} & ${f.display}`, subject: "Other", kind: "friends", priv: true });
    await inviteUser(r.code, me.name, f.name);
    await addMsg(`dm:${dmId(me.name, f.name)}`, { from: me.name, body: "I opened a study room, join me! (see your invites on Home)" });
    return { code: r.code };
  },
};

async function inviteUser(roomCode, from, to) {
  await store.update(roomKey(roomCode), (x) => { x.invites[to] = { from, t: now() }; return x; });
  await patchUser(to, (u) => (u.inviteCodes = [roomCode, ...(u.inviteCodes || [])].slice(0, 20)));
}
async function startTimer(r, focus, brk) {
  const next = await store.update(roomKey(r.code), (x) => { x.focus = focus; x.brk = brk; x.start = now(); x.round += 1; return x; });
  const until = now() + focus * 60_000;
  for (const m of Object.keys(next.members)) await patchUser(m, (u) => (u.focusUntil = until));
  if (next.bot) await addMsg(`room:${r.code}`, { from: null, body: pick([`Locked in! ${focus} minutes of focus. I'm right here with you.`, "Timer's running, let's go! See you at the break.", `${focus} minutes. Phones down. You've got this!`]), auto: 1 });
}
async function publicRooms(limit) {
  const codes = (await store.get("index")) || [];
  const rooms = (await Promise.all(codes.slice(0, 40).map((c) => store.get(roomKey(c))))).filter((r) => r && now() - r.created < 12 * 3600_000);
  return rooms.map((r) => ({ code: r.code, name: r.name, subject: r.subject, max: r.max, live: activeMembers(r, 90_000).length }))
    .sort((a, b) => b.live - a.live).slice(0, limit);
}
async function invitesFor(u) {
  const rooms = await Promise.all((u.inviteCodes || []).map((c) => store.get(roomKey(c))));
  return rooms.filter((r) => r && r.invites[u.name]).map((r) => ({ code: r.code, name: r.name, subject: r.subject, from: r.invites[u.name].from }));
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const handler = routes[path];
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!handler || req.method !== "POST") return json({ error: "Not found" }, 404);
  try {
    const body = await req.json().catch(() => ({}));
    return json(await handler(req, body));
  } catch (e) {
    if (!e.status) console.error(e);
    return json({ error: e.status ? e.message : "Something went wrong. Try again." }, e.status || 500);
  }
};
