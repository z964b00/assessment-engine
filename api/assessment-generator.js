import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  if (url.includes("youtube.com")) {
    return res.status (501).json({ error: "YouTube transcripts not implemented."});
  }

  try {
    // 1. Fetch page
    const html = await (await fetch(url)).text();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();
    const text = article?.textContent || "";

    if (text.length < 200)
      return res.status(422).json({ error: "Could not extract enough text." });
    
    if (text.length > 10000)
        return res.status(422).json({ error: "Article too long (10,000+ characters)." });

    // 2. Call GPT-4o
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a tutor creating short quizzes." },
        {
          role: "user",
          content:
            `Create EXACTLY three multiple-choice questions (A-D) with answers:\n\n---\n${text}.
            Each question must start with Q1., Q2., etc.
            Each answer option must start with A., B., C., D.
            The answer line must be in the form: Answer: X (X being A–D).
            Do not include any markdown, bullets, or decorative symbols.
            Here's an example of a properly formatted question:
            Q1. What is the capital of France?  
            A. Berlin  
            B. Madrid  
            C. Paris  
            D. Rome  
            Answer: C`,
        },
      ],
    });

    // 2b. Ask GPT for a broad subject (one word)
    const subjectChat = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: "You label topics." },
            { role: "user", content: `In one word, what subject is this quiz about?\n\n---\n${text}` },
        ],
    });
    const subject = subjectChat.choices[0].message.content.trim().split(/\s/)[0];

    res.status(200).json({ quiz: chat.choices[0].message.content, subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}