import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  try {
    // 1. Fetch page
    const html = await (await fetch(url)).text();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();
    const text = article?.textContent || "";

    if (text.length < 200)
      return res.status(422).json({ error: "Could not extract enough text." });

    // 2. Call GPT-4o
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a tutor creating short quizzes." },
        {
          role: "user",
          content:
            `Generate a 3-question multiple-choice quiz based on the article at this URL.
            Return the quiz as a JSON object in the following format:
            {
                "questions": [
                    {
                    "question": "What is the capital of France?",
                    "options": ["Berlin", "Madrid", "Paris", "Rome"],
                    "answer": "C"
                    }
                ]
            }
            Do not include any explanation or commentary. Just return the JSON object only`,
        },
      ],
    });

    res.status(200).json({ quiz: chat.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}