import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { XMLParser } from "fast-xml-parser";
import crypto from "crypto";

/**
 * Helper – quick heuristic to decide if the incoming URL points to a podcast episode
 */
function isPodcastUrl(url) {
  return url.includes("podcasts.apple.com") || url.includes("open.spotify.com");
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * 1. Feed discovery
 * ────────────────────────────────────────────────────────────────────────────────
 * Apple → iTunes Lookup
 * Spotify → Podcast Index fallback (requires PODCASTINDEX_API_KEY + _SECRET)
 */
async function getFeedUrlFromPodcastLink(url) {
  if (url.includes("podcasts.apple.com")) {
    const idMatch = url.match(/id(\d{5,})/);
    if (!idMatch) return null;
    const lookup = await fetch(
      `https://itunes.apple.com/lookup?id=${idMatch[1]}&country=us`
    ).then((r) => r.json());
    return lookup?.results?.[0]?.feedUrl ?? null;
  }

  if (url.includes("open.spotify.com")) {
    // 1) Grab show title via oEmbed (no auth required)
    const embed = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    ).then((r) => r.json());
    const rawTitle = embed?.title || ""; // "Episode Title – Show Title"
    const showTitle = rawTitle.split(" – ").pop()?.trim();
    if (!showTitle) return null;

    // 2) Search Podcast Index by title (needs API key + secret)
    const feedUrl = await searchPodcastIndexByTitle(showTitle);
    return feedUrl;
  }

  return null;
}

async function searchPodcastIndexByTitle(title) {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) return null;

  const epoch = Math.floor(Date.now() / 1000);
  const authHash = crypto
    .createHash("sha1")
    .update(key + secret + epoch)
    .digest("hex");

  const headers = {
    "X-Auth-Date": epoch,
    "X-Auth-Key": key,
    Authorization: authHash,
    "User-Agent": "Savant-Quiz-App/1.0",
  };

  const resp = await fetch(
    `https://api.podcastindex.org/api/1.0/search/bytitle?q=${encodeURIComponent(
      title
    )}`,
    { headers }
  ).then((r) => r.json());

  if (resp?.feeds?.length) return resp.feeds[0].url;
  return null;
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * 2. Episode matching & transcript extraction
 * ────────────────────────────────────────────────────────────────────────────────
 */
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

async function extractTranscript(url) {
  const feedUrl = await getFeedUrlFromPodcastLink(url);
  if (!feedUrl) throw new Error("Could not locate RSS feed for podcast.");

  const xml = await fetch(feedUrl).then((r) => r.text());
  const feed = xmlParser.parse(xml);
  const items = feed?.rss?.channel?.item || [];

  // crude matching → compare link or enclosure against incoming URL
  const episode = items.find((item) => {
    if (item.link && url.startsWith(item.link)) return true;
    const encUrl = item?.enclosure?.["@_url"] || "";
    return url.includes(encUrl);
  });
  if (!episode) throw new Error("Episode not found in RSS feed.");

  const transcriptTag = episode["podcast:transcript"];
  if (!transcriptTag) throw new Error("No transcript available");

  // tag may be array or single object
  const tagObj = Array.isArray(transcriptTag) ? transcriptTag[0] : transcriptTag;
  const tUrl = tagObj["@_url"];
  const tType = tagObj["@_type"] || "text/plain";
  if (!tUrl) throw new Error("Transcript tag missing url attribute");

  const raw = await fetch(tUrl).then((r) => r.text());
  return normaliseTranscript(raw, tType);
}

function normaliseTranscript(raw, type) {
  // Strip WebVTT timestamps & header
  if (type === "text/vtt" || type === "application/x-subrip") {
    return raw
      .replace(/WEBVTT[^\n]*\n/gi, "")
      .replace(/\d+\n/g, "") // sequence numbers (SRT)
      .replace(/(\d{2}:){1,2}\d{2}[.,]\d{3} --> (\d{2}:){1,2}\d{2}[.,]\d{3}[^"]*\n/g, "")
      .replace(/(\d{2}:){1,2}\d{2}\.\n\d{3} --> (\d{2}:){1,2}\d{2}\.\n\d{3}[^"]*\n/g, "")
      .replace(/\n+/g, " ")
      .trim();
  }

  if (type === "application/json") {
    try {
      const js = JSON.parse(raw);
      if (Array.isArray(js)) return js.map((x) => x.text || "").join(" ");
      if (js?.results?.transcripts)
        return js.results.transcripts.map((t) => t.text).join(" ");
    } catch (e) {
      // fall through → plain text
    }
  }

  // Default: treat as plain text
  return raw.replace(/\n+/g, " ").trim();
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * 3. Main handler – unchanged prompts, added branching for podcasts
 * ────────────────────────────────────────────────────────────────────────────────
 */
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  if (url.includes("youtube.com")) {
    return res.status(501).json({ error: "YouTube transcripts not implemented." });
  }

  try {
    // ── A) PODCAST BRANCH ────────────────────────────────────────────
    let extractedText = "";
    if (isPodcastUrl(url)) {
      extractedText = await extractTranscript(url);
    } else {
      // ── B) ARTICLE BRANCH (original behaviour) ────────────────────
      const html = await (await fetch(url)).text();
      const doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();
      extractedText = article?.textContent || "";
    }

    // Length checks – keep existing thresholds to avoid runaway cost
    if (extractedText.length < 200)
      return res.status(422).json({ error: "Could not extract enough text." });

    if (extractedText.length > 20000)
      return res.status(422).json({ error: "Article too long (20,000+ characters)." });

    // ── GPT-4o calls (prompts unchanged) ─────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a tutor creating short quizzes." },
        {
          role: "user",
          content: `Create EXACTLY three multiple-choice questions (A-D) with answers:\n\n---\n${extractedText}.\n            Each question must start with Q1., Q2., etc.\n            Each answer option must start with A., B., C., D.\n            The answer line must be in the form: Answer: X (X being A–D).\n            Do not include any markdown, bullets, or decorative symbols.\n            Here's an example of a properly formatted question:\n            Q1. What is the capital of France?  \n            A. Berlin  \n            B. Madrid  \n            C. Paris  \n            D. Rome  \n            Answer: C`,
        },
      ],
    });

    const subjectChat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You label topics." },
        {
          role: "user",
          content: `In one word, what subject is this quiz about?\n\n---\n${extractedText}`,
        },
      ],
    });
    const subject = subjectChat.choices[0].message.content.trim().split(/\s/)[0];

    res.status(200).json({ quiz: chat.choices[0].message.content, subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}