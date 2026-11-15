import { AVATARS, BOT, RESPONDERS, STICKERS, SUBJECTS, SUBJECT_NAMES, TEMPLATES, stickerLabel } from "/catalog.mjs";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = (src, cls = "", alt = "") => `<img class="pix ${cls}" src="/img/${esc(src)}" alt="${esc(alt)}">`;
const colorOf = Object.fromEntries(SUBJECTS);
const hours = (m) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
const tz = new Date().getTimezoneOffset();

let token = localStorage.getItem("p2p_token");
let me = null;
let cleanups = [];
const later = (fn) => cleanups.push(fn);
const every = (fn, ms) => { const id = setInterval(fn, ms); later(() => clearInterval(id)); };

async function api(path, body = {}) {
  const r = await fetch(`/api/${path}`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); }
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}
function toast(msg, bad) {
  const t = Object.assign(document.createElement("div"), { className: `toast ${bad ? "bad" : ""}`, textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
function logout() { token = null; me = null; localStorage.removeItem("p2p_token"); location.hash = "#/"; }
const go = (h) => (location.hash = h);

// ------------------------------------------------------------------ shell
const NAV = [["home", "Home", "#/home"], ["match", "Match", "#/home"], ["rooms", "Rooms", "#/rooms"], ["friends", "Friends", "#/friends"], ["timer", "Timer", "#/timer"], ["stats", "Stats", "#/stats"]];
function bar(active) {
  $("#bar").innerHTML = me
    ? `<div class="bar"><div class="in"><a class="brand" href="#/home">${img("logo.png")}Peer to Pair</a>
        <nav class="nav">${NAV.map(([k, l, h]) => `<a href="${h}" class="${k === active ? "on" : ""}">${l}</a>`).join("")}</nav>
        <div class="me"><a href="#/stats">${img(me.avatar)}</a><a href="#/stats">@${esc(me.name)}</a><button class="btn small white" id="out">Log out</button></div></div></div>`
    : `<div class="bar"><div class="in"><a class="brand" href="#/">${img("logo.png")}Peer to Pair</a><nav class="nav"></nav>
        <a class="btn small white" href="#/login">Log in</a><a class="btn small pink" href="#/signup">Sign up</a></div></div>`;
  $("#out")?.addEventListener("click", logout);
}
const view = (html, active = "") => { bar(active); $("#app").innerHTML = html; };
const person = (u, status) => {
  const act = { friends: `<a class="btn small sky" href="#/chat/${u.name}">Chat</a>`, sent: `<span class="chip">Request sent</span>`,
    received: `<button class="btn small mint" data-answer="${u.name}" data-yes="1">Accept</button><button class="btn small white" data-answer="${u.name}">Decline</button>`,
    null: `<button class="btn small pink" data-add="${u.name}">Add friend</button>` }[status ?? "null"];
  return `<div class="rank"><span class="dot ${u.online ? "on" : ""}"></span>${img(u.avatar, "", "")}
    <div class="grow"><a href="#/u/${u.name}"><b>${esc(u.display)}</b></a> <small class="muted">@${esc(u.name)}</small><br>${u.interests.slice(0, 4).map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>${act}</div>`;
};
function wirePeople(root, reload) {
  root.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", guard(async () => { const r = await api("friends/add", { name: b.dataset.add }); toast(r.status === "friends" ? `You and ${r.display} are now friends!` : "Friend request sent."); reload(); })));
  root.querySelectorAll("[data-answer]").forEach((b) => b.addEventListener("click", guard(async () => { await api("friends/answer", { name: b.dataset.answer, accept: !!b.dataset.yes }); reload(); })));
}

// ------------------------------------------------------------------ pages
function landing() {
  const feats = [["pink", "Matched in 30 seconds", "Pick a subject and we pair you with a student studying the same thing. Nobody around? Mochi the study bot sits down with you."],
    ["mint", "Study on video", "Every room has a video call so you can study with your friends like a real study cafe, plus a chat and a shared timer."],
    ["butter", "Earn pixel stickers", "Finish a focus session and win a random sticker to send in chats. Collect all 24."]];
  view(`<section class="hero">${img("logo.png", "logo bob")}<h1>Find your study match</h1>
    <p class="muted">Peer to Pair helps students meet, add each other, and study together by topic. Biology, maths, anything.</p>
    <a class="btn big pink" href="#/signup">Start studying</a><a class="btn big white" href="#/login">I have an account</a></section>
    <div class="parade">${["girls/girl01.png", "stickers/food-pancakes.png", "boys/boy02.png", "stickers/animal-penguin.png", "girls/girl06.png", "stickers/anything-frog.png", "boys/boy05.png"].map((s) => img(s, "bob")).join("")}</div>
    <div class="row">${feats.map(([c, t, d]) => `<div class="card px c-${c}"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>`);
}

function authPage(mode) {
  const su = mode === "signup";
  view(`<div class="card px c-cream" style="max-width:460px;margin:30px auto"><h2>${su ? "Create your account" : "Welcome back"}</h2>
    <p class="muted">${su ? "Pick a username your friends can find you with." : "Good to see you again."}</p>
    <form id="f"><label>Username</label><input type="text" name="username" required maxlength="20" autocomplete="username" placeholder="e.g. mika_bio">
    ${su ? `<label>Display name</label><input type="text" name="display" maxlength="24" placeholder="What should we call you?">` : ""}
    <label>Password</label><input type="password" name="password" required minlength="6" autocomplete="${su ? "new-password" : "current-password"}">
    <p><button class="btn pink big">${su ? "Create account" : "Log in"}</button></p></form>
    <p>${su ? `Already have one? <a href="#/login">Log in</a>` : `New here? <a href="#/signup">Sign up</a>`}</p></div>`);
  $("#f").addEventListener("submit", guard(async (e) => {
    e.preventDefault();
    const r = await api(su ? "signup" : "login", Object.fromEntries(new FormData(e.target)));
    token = r.token; localStorage.setItem("p2p_token", token);
    await loadMe(); go(su ? "#/avatar?first=1" : "#/home");
  }));
}

function avatarPage(query) {
  let g = new URLSearchParams(query).get("g") || me.gender || "girl";
  const draw = () => {
    view(`<h1>Choose your character</h1><p class="muted">Pick the pixel character that feels most like you. It shows on your profile and in your stats.</p>
      <div class="tabs"><button class="btn ${g === "girl" ? "pink" : "white"}" data-g="girl">Girl characters</button><button class="btn ${g === "boy" ? "pink" : "white"}" data-g="boy">Boy characters</button></div>
      <div class="grid">${AVATARS[g].map((a) => `<button class="pick ${a === me.avatar ? "sel" : ""}" data-a="${a}">${img(a)}</button>`).join("")}</div>
      <p><a class="btn mint big" href="#/profile">Next: pick your subjects</a></p>`);
    document.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { g = b.dataset.g; draw(); }));
    document.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", guard(async () => { await api("avatar", { avatar: b.dataset.a, gender: g }); me.avatar = b.dataset.a; me.gender = g; toast("Looking good! Your character is saved."); draw(); })));
  };
  draw();
}

function profilePage() {
  view(`<h1>Your profile</h1><div class="card px c-cream" style="max-width:680px"><form id="f">
    <label>Display name</label><input type="text" name="display" value="${esc(me.display)}" maxlength="24">
    <label>Bio</label><input type="text" name="bio" value="${esc(me.bio)}" maxlength="90" placeholder="Pre-med, coffee-powered, loves flashcards">
    <label>What do you study? (this is how study buddies find you)</label>
    <div>${SUBJECT_NAMES.map((s) => `<label style="display:inline-block;margin:6px 18px 6px 0;font-weight:400"><input type="checkbox" value="${esc(s)}" ${me.interests.includes(s) ? "checked" : ""}> ${esc(s)}</label>`).join("")}</div>
    <label>Auto-reply while you are in a focus session</label><input type="text" name="away" value="${esc(me.away)}" maxlength="90" placeholder="Focus mode on, I'll reply after my timer!">
    <p><button class="btn pink big">Save</button> <a class="btn white" href="#/avatar">Change character</a></p></form></div>`);
  $("#f").addEventListener("submit", guard(async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await api("profile", { ...f, interests: [...document.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value) });
    await loadMe(); toast("Profile saved."); go("#/home");
  }));
}

async function homePage() {
  const d = await api("home", { tz });
  view(`<div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">${img(me.avatar, "bob")}
    <div><h1>Hi, ${esc(me.display)}!</h1><p class="muted">Level ${d.stats.level} · ${hours(d.stats.today)} studied today · ${d.stats.streak} day streak</p></div></div>
    ${d.invites.map((i) => `<div class="flash px">${esc(i.from)} invited you to <b>${esc(i.name)}</b> <button class="btn small mint" data-join="${i.code}">Join</button></div>`).join("")}
    <section class="card px c-pink" id="match"><h2>Find my study match</h2><p>Pick a subject. If nobody joins within 30 seconds, <b>${BOT.name}</b> the study bot will study with you instead.</p>
      <div class="folders">${SUBJECTS.map(([s, c]) => `<button class="folder c-${c}" data-subject="${esc(s)}"><b>${esc(s)}</b><small>Find a study pair</small></button>`).join("")}</div></section>
    <div class="row"><div class="card px c-sky"><h3>Friends online</h3>${d.friendsOnline.map((f) => `<div><span class="dot on"></span>${img(f.avatar)} ${esc(f.display)} <a class="btn small sky" style="float:right" href="#/chat/${f.name}">Chat</a></div>`).join("") || `<p class="muted">No friends online right now.</p>`}<a class="btn small white" href="#/friends">All friends</a></div>
    <div class="card px c-mint"><h3>Open study rooms</h3>${d.rooms.map((r) => `<div><b>${esc(r.name)}</b> <span class="muted">· ${r.live} here</span> <button class="btn small mint" style="float:right" data-join="${r.code}">Join</button></div>`).join("") || `<p class="muted">No rooms yet. Start one!</p>`}<a class="btn small white" href="#/rooms">See rooms</a></div></div>`, "home");
  document.querySelectorAll("[data-subject]").forEach((b) => b.addEventListener("click", guard(async () => { await api("match/start", { subject: b.dataset.subject }); go("#/match"); })));
  wireJoin();
}
function wireJoin() {
  document.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", guard(async () => { const r = await api("rooms/join", { code: b.dataset.join }); go(`#/room/${r.code}`); })));
}

function matchPage() {
  view(`<div class="card px c-pink wait" style="max-width:560px;margin:60px auto"><h2 id="t">Looking for a study buddy</h2>
    <div class="duo">${img(me.avatar)}<div class="qmark">?</div></div><p class="muted">Seconds until ${BOT.name} steps in if nobody joins:</p>
    <div class="cd" id="cd" style="margin:6px 0 18px">00:30</div><button class="btn white" id="cancel">Cancel</button></div>`);
  let endAt = Date.now() + 30000;
  $("#cancel").addEventListener("click", guard(async () => { await api("match/cancel"); go("#/home"); }));
  const tick = () => { const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000)); $("#cd").textContent = `00:${String(s).padStart(2, "0")}`; };
  const poll = async () => {
    try {
      const r = await api("match/poll");
      if (r.state === "room") return go(`#/room/${r.code}`);
      if (r.state === "none") return go("#/home");
      endAt = Date.now() + r.left; $("#t").textContent = `Looking for a ${r.subject} buddy`;
    } catch { /* keep trying */ }
  };
  poll(); every(poll, 2000); every(tick, 250);
}

async function roomsPage() {
  const { rooms } = await api("rooms/list");
  view(`<h1>Study rooms</h1><p class="muted">Drop into a video study room like a library table. Camera on or off, your call.</p>
    <div class="row"><div class="card px c-cream"><h3>Open a new room</h3><form id="f"><label>Room name</label><input type="text" name="name" maxlength="40" placeholder="Quiet cram session">
      <label>Subject</label><select name="subject">${SUBJECT_NAMES.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
      <label>Max people</label><select name="max">${[2, 3, 4, 6, 8].map((n) => `<option ${n === 4 ? "selected" : ""}>${n}</option>`).join("")}</select>
      <label style="font-weight:400"><input type="checkbox" name="private"> Private (invite only)</label><p><button class="btn pink">Create room</button></p></form></div>
    <div style="flex:2 1 400px">${rooms.map((r) => `<div class="card px c-${colorOf[r.subject] || "sky"}"><h3>${esc(r.name)}</h3><span class="chip">${esc(r.subject)}</span><p class="muted">${r.live} studying now · up to ${r.max}</p><button class="btn mint" data-join="${r.code}">Join & turn on video</button></div>`).join("") || `<div class="card px c-butter">No public rooms right now. Make the first one!</div>`}</div></div>`, "rooms");
  wireJoin();
  $("#f").addEventListener("submit", guard(async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const r = await api("rooms/create", { name: f.get("name"), subject: f.get("subject"), max: f.get("max"), private: !!f.get("private") });
    go(`#/room/${r.code}`);
  }));
}

// ------------------------------------------------------------------ chat widget (rooms + friends)
let owned = {};
async function loadOwned() { try { owned = (await api("stats", { tz })).stats.owned; } catch { /* ignore */ } }
const bubble = (m, users, mine, botRoom = true) => {
  const u = m.from ? users[m.from] : null;
  const sys = !m.from && m.auto && !botRoom;
  const name = m.from ? (u?.display || m.from) : sys ? "Peer to Pair" : BOT.name, av = m.from ? (u?.avatar || "girls/girl01.png") : sys ? "logo.png" : BOT.avatar;
  return `<div class="msg ${m.from === mine ? "mine" : ""}">${img(av, "av")}<div class="bubble ${m.auto ? "auto" : ""}"><small>${esc(name)}${m.auto && m.from ? " (auto-reply)" : ""}</small>${esc(m.body)}${m.sticker ? img(`stickers/${m.sticker}`, "sticker-big", "sticker") : ""}</div></div>`;
};
function chatBox(root, send, { responders = false } = {}) {
  root.innerHTML = `<div class="log" id="log"><p class="muted" style="text-align:center;margin:30px">Say hi! Use a quick reply below to break the ice.</p></div>
    <div class="compose"><div class="tpl">${[...TEMPLATES.slice(0, 6), ...(responders ? RESPONDERS : [])].map((t) => `<button class="btn small white" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <details class="st"><summary>Stickers</summary><div class="stgrid" id="stk"></div></details>
    <form class="send"><input type="text" maxlength="400" placeholder="Message about your studies…" autocomplete="off"><button class="btn pink small">Send</button></form></div>`;
  const input = $("input", root);
  root.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); send({ body: b.dataset.t }); }));
  $("form", root).addEventListener("submit", (e) => { e.preventDefault(); if (input.value.trim()) { send({ body: input.value }); input.value = ""; } });
  let lastId = null, lastStk = "";
  return {
    render(messages, users, mineName, botRoom = true) {
      const k = messages.at(-1)?.id || "";
      if (k !== lastId) {
        lastId = k; const log = $("#log", root); const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80 || !log.dataset.init;
        if (messages.length) log.innerHTML = messages.map((m) => bubble(m, users, mineName, botRoom)).join("");
        if (atEnd) log.scrollTop = log.scrollHeight; log.dataset.init = 1;
      }
      const keys = Object.keys(owned).sort().join();
      if (keys !== lastStk) {
        lastStk = keys;
        $("#stk", root).innerHTML = keys ? Object.keys(owned).sort().map((s) => `<button data-s="${s}" title="${esc(stickerLabel(s))}">${img(`stickers/${s}`)}</button>`).join("") : `<span class="muted">Finish a focus session to unlock stickers for chat.</span>`;
        root.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => send({ sticker: b.dataset.s })));
      }
    },
  };
}

// ------------------------------------------------------------------ room
async function roomPage(code) {
  const first = await api("room/state", { code });
  const jitsi = `https://meet.jit.si/PeerToPair-${code}#userInfo.displayName=${encodeURIComponent(JSON.stringify(me.display))}&config.prejoinPageEnabled=false`;
  await loadOwned();
  view(`<div><h1 style="display:inline-block;margin-right:12px">${esc(first.room.name)}</h1><span class="chip">${esc(first.room.subject)}</span><span class="chip">${first.room.bot ? "with " + BOT.name : "up to " + first.room.max + " students"}</span>
    <a class="btn small white" style="float:right" href="#/home">Leave room</a></div>
    <div class="room"><div class="px panel" style="padding-bottom:1px"><iframe class="video" src="${esc(jitsi)}" allow="camera; microphone; display-capture; autoplay; fullscreen" title="video study room"></iframe>
      <p class="muted" style="margin:12px">Share this room's link: <b>${esc(location.origin)}/#/join/${code}</b> · <a href="${esc(jitsi)}" target="_blank" rel="noopener">Open video in a new tab</a></p></div>
    <div><div class="px panel" style="margin-bottom:24px"><div class="members" id="mem"></div><div class="timerbox" id="timer"></div></div>
      <div class="px panel chatpanel" id="chat"></div></div></div>`, "rooms");
  let endAt = 0, shown = "";
  const chat = chatBox($("#chat"), guard(async (m) => { await api("room/send", { code, ...m }); await refresh(); }));
  const users = {};
  const drawTimer = (d) => {
    const sig = `${d.timer.phase}|${d.room.focus}|${d.room.brk}|${d.claim?.sticker || ""}`;
    if (sig === shown) return; shown = sig;
    const t = d.timer, box = $("#timer"); let html = "";
    if (t.phase === "idle") html = `<h3>Shared focus timer</h3><p class="muted">Everyone in this room sees the same countdown.</p><div class="pills"><button class="btn small pink" data-p="25-5">25 / 5</button><button class="btn small sky" data-p="50-10">50 / 10</button><button class="btn small mint" data-p="15-3">15 / 3</button></div>
      <p><input type="number" id="cf" min="1" max="180" placeholder="focus min" style="width:38%"><input type="number" id="cb" min="1" max="60" placeholder="break min" style="width:38%"><button class="btn small lav" data-p="custom">Go</button></p>`;
    else if (t.phase === "done") html = `<h3>Round finished</h3><p class="muted">Nice work. Ready for another?</p><button class="btn small pink" data-p="${d.room.focus}-${d.room.brk}">Again ${d.room.focus}/${d.room.brk}</button>`;
    else html = `<h3>${t.phase === "focus" ? "Focus time" : "Break time. Stretch!"}</h3><div class="cd" id="cd">--:--</div><p class="muted">${d.room.focus} min focus · ${d.room.brk} min break · synced with the room</p>`;
    if (d.claim) html += `<div class="reward c-butter" style="margin-top:12px;padding:8px"><p><b>${d.claim.isNew ? "Sticker unlocked!" : "Another sticker!"}</b> +${d.claim.min} min logged</p>${img(`stickers/${d.claim.sticker}`)}<p class="muted">${esc(stickerLabel(d.claim.sticker))}</p></div>`;
    box.innerHTML = html;
    box.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", guard(async () => {
      let [focus, brk] = b.dataset.p === "custom" ? [$("#cf").value || 25, $("#cb").value || 5] : b.dataset.p.split("-");
      await api("room/timer", { code, focus: +focus, brk: +brk }); await refresh();
    })));
  };
  const apply = (d) => {
    d.members.forEach((u) => (users[u.name] = u)); users[me.name] = me;
    $("#mem").innerHTML = d.members.map((u) => img(u.avatar, "", u.display)).join("") + (d.room.bot ? img(BOT.avatar, "", BOT.name) : "") + `<small>${d.members.length} here${d.room.bot ? " + " + BOT.name : ""}</small>`;
    endAt = Date.now() + d.timer.remaining * 1000;
    drawTimer(d); chat.render(d.messages, users, me.name, d.room.bot);
    if (d.claim && !owned[d.claim.sticker]) { owned[d.claim.sticker] = 1; chat.render(d.messages, users, me.name, d.room.bot); }
  };
  const refresh = async () => { try { apply(await api("room/state", { code })); } catch (e) { if (/Join this room|not found/.test(e.message)) go("#/home"); } };
  apply(first); every(refresh, 4000);
  every(() => { const el = $("#cd"); if (el) { const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000)); el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; if (!s) refresh(); } }, 250);
}

// ------------------------------------------------------------------ friends
async function friendsPage(query) {
  const p = new URLSearchParams(query), q = p.get("q") || "", subject = p.get("subject") || "";
  const d = await api("friends", { q, subject });
  view(`<h1>Friends</h1><div class="row"><div class="card px c-cream"><h3>Find people to study with</h3><form id="f"><label>Username or name</label><input type="text" name="q" value="${esc(q)}" placeholder="@username">
    <label>Studying</label><select name="subject"><option value="">Any subject</option>${SUBJECT_NAMES.map((s) => `<option ${s === subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><p><button class="btn pink">Search</button></p></form></div>
    <div class="card px c-sky" style="flex:2 1 420px"><h3>${d.results ? "Search results" : "Your friends"}</h3>
    ${(d.results ? d.results.map((u) => person(u, u.status)) : d.friends.map((u) => person(u, "friends"))).join("") || `<p class="muted">${d.results ? "Nobody found. Try another name or subject." : "No friends yet. Search for a username on the left!"}</p>`}</div></div>
    ${d.requests.length ? `<div class="card px c-butter"><h3>Friend requests</h3>${d.requests.map((u) => person(u, "received")).join("")}</div>` : ""}`, "friends");
  $("#f").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); go(`#/friends?q=${encodeURIComponent(f.get("q"))}&subject=${encodeURIComponent(f.get("subject"))}`); });
  wirePeople($("#app"), () => friendsPage(query));
}

async function chatPage(name) {
  const first = await api("dm/state", { name });
  await loadOwned();
  const f = first.friend;
  view(`<div>${img(f.avatar, "", "")} <h1 style="display:inline;margin-left:12px">${esc(f.display)}</h1> <span class="dot ${f.online ? "on" : ""}" style="margin-left:12px"></span><span class="muted">${f.online ? "online" : "offline"}</span>
    <button class="btn mint" id="study" style="float:right">Study together</button></div><div class="px panel chatpanel" id="chat" style="max-width:760px;margin-top:20px"></div>`, "friends");
  const users = { [me.name]: me, [f.name]: f };
  const box = chatBox($("#chat"), guard(async (m) => { await api("dm/send", { name, ...m }); await refresh(); }), { responders: true });
  const refresh = async () => { try { box.render((await api("dm/state", { name })).messages, users, me.name); } catch { /* ignore */ } };
  box.render(first.messages, users, me.name); every(refresh, 4000);
  $("#study").addEventListener("click", guard(async () => { const r = await api("dm/study", { name }); go(`#/room/${r.code}`); }));
}

// ------------------------------------------------------------------ stats + public profile
const idCard = (u, level, extra = "") => `<div class="idcard px"><div class="photo">${img(u.avatar, "", "avatar")}</div><div class="meta"><small class="muted">PEER TO PAIR · STUDENT ID</small><b>${esc(u.display)}</b><span>@${esc(u.name)}</span><br>
  <span class="chip">Level ${level}</span>${u.interests.slice(0, 3).map((i) => `<span class="chip">${esc(i)}</span>`).join("")}<p class="muted">${esc(u.bio || "Ready to study!")}</p>
  <div class="barcode">${[...u.name].slice(0, 20).map((c) => `<i style="width:${1 + (c.charCodeAt(0) % 4)}px"></i>`).join("")}</div></div></div>${extra}`;

async function statsPage() {
  const { me: u, stats: s } = await api("stats", { tz });
  me = u; owned = s.owned;
  const peak = Math.max(30, ...s.week.map((w) => w.m));
  view(`<h1>My stats</h1><div class="row"><div>${idCard(u, s.level, `<p><a class="btn small pink" href="#/avatar">Change character</a><a class="btn small white" href="#/profile">Edit profile</a></p>`)}</div>
    <div style="flex:1.4 1 360px"><div style="display:flex;gap:14px"><div class="stat card px c-mint" style="flex:1"><b>${hours(s.total)}</b>study time</div><div class="stat card px c-sky" style="flex:1"><b>${s.sessions}</b>sessions</div><div class="stat card px c-butter" style="flex:1"><b>${s.streak}</b>day streak</div></div>
    <div class="card px c-cream"><h3>This week</h3><div class="bars">${s.week.map((w) => `<div><i style="height:${Math.round((100 * w.m) / peak)}px"></i>${w.d}</div>`).join("")}</div><p class="muted">${s.toNext} min to level ${s.level + 1}</p></div></div></div>
    <div class="row"><div class="card px c-lav"><h3>Most studied subjects</h3>${s.top.map((t, i) => `<div class="rank"><div class="n">${i + 1}</div><div class="grow"><b>${esc(t.subject)}</b> <small class="muted">${hours(t.m)}</small></div></div>`).join("") || `<p class="muted">Finish a focus session to see your top subjects.</p>`}</div>
    <div class="card px c-pink"><h3>Study buddy leaderboard</h3>${s.board.map((b, i) => `<div class="rank"><div class="n">${i + 1}</div>${b.user ? img(b.user.avatar) : ""}<div class="grow"><b>${esc(b.user?.display || b.name)}</b> <small class="muted">@${esc(b.name)}</small></div><span class="chip">${hours(b.m)} together</span></div>`).join("") || `<p class="muted">Study with friends to fill the top 5.</p>`}</div></div>
    <div class="card px c-butter"><h3>Sticker collection · ${Object.keys(s.owned).length}/${STICKERS.length}</h3><div class="collection">${STICKERS.map((k) => `<div>${img(`stickers/${k}`, s.owned[k] ? "" : "locked")}${s.owned[k] ? "x" + s.owned[k] : "?"}</div>`).join("")}</div></div>`, "stats");
}

async function userPage(name) {
  const d = await api("user", { name });
  view(`${idCard(d.user, d.stats.level)}<p>${d.status === "self" ? `<a class="btn pink" href="#/profile">Edit profile</a>` : `<div class="card px c-sky" style="max-width:520px">${person(d.user, d.status)}</div>`}</p>`);
  wirePeople($("#app"), () => userPage(name));
}

async function timerPage() {
  const [d, f] = await Promise.all([api("home", { tz }), api("friends", {})]);
  view(`<h1>Study timer</h1><p class="muted">Start a pomodoro with friends. Everyone sees the same countdown and every finished session gives each of you a pixel sticker.</p>
    ${d.invites.map((i) => `<div class="flash px">${esc(i.from)} wants to focus on <b>${esc(i.subject)}</b> <button class="btn small mint" data-join="${i.code}">Join</button></div>`).join("")}
    <div class="card px c-sky" style="max-width:560px"><form id="f"><label>Subject</label><select name="subject">${SUBJECT_NAMES.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
    <label>Focus minutes</label><input type="number" name="focus" value="25" min="1" max="180"><label>Break minutes</label><input type="number" name="brk" value="5" min="1" max="60">
    <label>Invite friends</label><div>${f.friends.map((u) => `<label style="font-weight:400"><input type="checkbox" value="${u.name}"> ${esc(u.display)} <span class="dot ${u.online ? "on" : ""}"></span></label>`).join("") || `<p class="muted">Add friends first to invite them. You can also study solo.</p>`}</div>
    <p><button class="btn pink big">Start timer</button></p></form></div>`, "timer");
  wireJoin();
  $("#f").addEventListener("submit", guard(async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const r = await api("timer/create", { subject: fd.get("subject"), focus: +fd.get("focus"), brk: +fd.get("brk"), friends: [...document.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value) });
    go(`#/room/${r.code}`);
  }));
}

// ------------------------------------------------------------------ router
async function loadMe() { if (token) try { me = (await api("me")).me; } catch { me = null; } }

async function route() {
  cleanups.forEach((fn) => fn()); cleanups = [];
  const [path, query = ""] = (location.hash.slice(1) || "/").split("?");
  const parts = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  if (!me && token) await loadMe();
  const open = ["", "login", "signup"].includes(parts[0] || "");
  if (!me && !open) return go("#/login");
  if (me && open) return go("#/home");
  try {
    switch (parts[0] || "") {
      case "": return landing();
      case "login": case "signup": return authPage(parts[0]);
      case "avatar": return avatarPage(query);
      case "profile": return profilePage();
      case "home": return await homePage();
      case "match": return matchPage();
      case "rooms": return await roomsPage();
      case "join": { const r = await api("rooms/join", { code: parts[1] }); return go(`#/room/${r.code}`); }
      case "room": return await roomPage(parts[1]);
      case "friends": return await friendsPage(query);
      case "chat": return await chatPage(parts[1]);
      case "stats": return await statsPage();
      case "timer": return await timerPage();
      case "u": return await userPage(parts[1]);
      default: return go("#/home");
    }
  } catch (e) { toast(e.message, true); if (location.hash !== "#/home") go("#/home"); }
}
addEventListener("hashchange", route);
route();
