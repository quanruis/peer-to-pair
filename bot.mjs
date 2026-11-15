// Mochi, the study bot that joins after 30 seconds with no human match.
// Set ANTHROPIC_API_KEY in Netlify for real AI answers; otherwise a small offline helper answers.
const QUIZ = {
  Biology: [["Which organelle is called the powerhouse of the cell?", "the mitochondria"], ["What molecule carries genetic information?", "DNA"]],
  Mathematics: [["What is the derivative of x squared?", "2x"], ["What do the angles of a triangle add up to?", "180 degrees"]],
  Chemistry: [["What is the chemical symbol for sodium?", "Na"], ["What is the pH of pure water?", "7"]],
  Physics: [["What is the unit of force?", "the newton"], ["What does F = ma describe?", "Newton's second law"]],
  History: [["Which year did World War II end?", "1945"]],
  English: [["A comparison using 'like' or 'as' is called?", "a simile"]],
  "Computer Science": [["What does CPU stand for?", "central processing unit"], ["Which data structure is first-in, first-out?", "a queue"]],
};
const TIPS = [
  "Try the Feynman trick: explain it out loud like you're teaching a ten year old.",
  "Active recall beats rereading. Close your notes and write down what you remember.",
  "Break big topics into small chunks. One focus session, one chunk.",
  "Past-paper questions are the best practice. Want me to quiz you?",
  "Drink some water, stretch your shoulders, then come back for round two.",
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function offline(text, subject) {
  const t = text.toLowerCase();
  if (/\b(quiz|test me|question me)\b/.test(t)) {
    const [q, a] = pick(QUIZ[subject] || [["What's one thing you learned today, in a single sentence?", "any honest answer counts!"]]);
    return `Quiz time! ${q}  (psst: ${a})`;
  }
  if (/\b(tired|sleepy|bored|unmotivated|can't focus|cant focus)\b/.test(t)) return "You're doing better than you think. Let's do one short 15 minute round together, then grab a sticker.";
  if (/\b(pomodoro|timer|break)\b/.test(t)) return "Start the shared timer and I'll focus with you. 25 minutes on, 5 off!";
  if (/\b(stuck|don't understand|dont understand|help|explain)\b/.test(t)) return `Let's untangle it. Tell me the exact step in ${subject} where it stops making sense, and what you think should happen.`;
  if (/\b(thanks|thank you|ty)\b/.test(t)) return "Anytime! Study buddies forever.";
  if (/\b(hi|hello|hey)\b/.test(t)) return `Hi hi! Ready for some ${subject}? Tell me what you're working on.`;
  return pick(TIPS);
}

export async function botReply(text, subject, history) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const msgs = [];
      for (const [who, body] of [...history.slice(-10), ["me", text]]) {
        const role = who === "me" ? "user" : "assistant";
        if (msgs.length && msgs.at(-1).role === role) msgs.at(-1).content += "\n" + body;
        else msgs.push({ role, content: body });
      }
      while (msgs.length && msgs[0].role !== "user") msgs.shift();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctl.signal,
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.P2P_BOT_MODEL || "claude-haiku-4-5", max_tokens: 300,
          system: `You are Mochi, a warm, encouraging study buddy inside a student website called Peer to Pair. The student is studying ${subject}. Answer clearly and briefly (under 90 words), explain step by step when useful, offer to quiz them, and guide them rather than doing graded homework outright. Plain text only.`,
          messages: msgs,
        }),
      });
      clearTimeout(timer);
      const data = await r.json();
      const out = (data.content || []).map((b) => b.text || "").join("").trim();
      if (out) return out;
    } catch { /* fall through to offline helper */ }
  }
  return offline(text, subject);
}

export const greeting = (subject, name) =>
  `Hi ${name}! No human pair showed up in 30 seconds, so I'll study ${subject} with you. Hit start on the timer, ask me anything, or say 'quiz me'.`;
