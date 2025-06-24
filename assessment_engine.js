require("dotenv").config();
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const prompt = require("prompt-sync")();
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  // Ask for a link
  const url = prompt("Paste a link and press Enter: ");
  console.log("\nFetching article...");

  // 1. Download raw HTML
  const res = await fetch(url);
  const html = await res.text();

  // 2. Extract main text
  const doc = new JSDOM(html, { url });
  const reader = new Readability(doc.window.document);
  const article = reader.parse();
  const text = article?.textContent || "";

  if (text.length < 200) {
    console.log("❌ Couldn't extract enough text. Try another link.");
    return;
  }

  // 3. Ask GPT-4o for a quiz
  console.log("Generating quiz...");
  const system = "You are a tutor creating short quizzes.";
  const userPrompt =
    `Read the passage below and create EXACTLY three multiple-choice questions. ` +
    `Each question should have four options labeled A–D, followed by "Answer: X".\n\n---\n${text}`;
  const chat = await openai.chat.completions.create({
    model: "gpt-4o", // cheaper than full gpt-4o, tweak later if needed
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
  });

  console.log("\n=== QUIZ ===\n");
  console.log(chat.choices[0].message.content);
})();