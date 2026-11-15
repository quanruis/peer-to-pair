// Shared by the browser and the serverless function.
export const SUBJECTS = [
  ["Biology", "mint"], ["Mathematics", "sky"], ["Chemistry", "lav"], ["Physics", "peach"],
  ["English", "pink"], ["History", "butter"], ["Computer Science", "sky"], ["Economics", "mint"],
  ["Psychology", "lav"], ["Languages", "pink"], ["Art & Design", "peach"], ["Other", "butter"],
];
export const SUBJECT_NAMES = SUBJECTS.map((s) => s[0]);
const pad = (n) => String(n).padStart(2, "0");
export const AVATARS = {
  girl: Array.from({ length: 16 }, (_, i) => `girls/girl${pad(i + 1)}.png`),
  boy: Array.from({ length: 11 }, (_, i) => `boys/boy${pad(i + 1)}.png`),
};
export const STICKERS = [
  "animal-capybara", "animal-cat", "animal-cow", "animal-dachshund", "animal-hamster", "animal-penguin",
  "animal-raccoon", "animal-sheep", "anything-clover", "anything-fire", "anything-frog", "anything-ribbon",
  "anything-star-coin", "anything-totoro", "food-burger", "food-corndog", "food-croissant", "food-fries",
  "food-fruit-tart", "food-pancakes", "food-roll-cake", "food-sandwich", "food-strawberry-cake", "food-sushi",
].map((s) => `${s}.png`);
export const stickerLabel = (n) => n.replace(".png", "").split("-").slice(1).join(" ").replace(/\b\w/g, (c) => c.toUpperCase());
export const BOT = { name: "Mochi", avatar: "stickers/animal-hamster.png" };
export const TEMPLATES = ["Let's study together!", "Can you quiz me?", "Pomodoro time?", "I'm stuck on this topic",
  "Want to compare notes?", "Take a 5 min break?", "Great job today!", "Which chapter are you on?"];
export const RESPONDERS = ["Sure!", "Give me 5 mins", "Yes, join the room", "Let's do it tomorrow", "Thank you!"];
