import fs from "node:fs/promises";
import path from "node:path";
import sgMail from "@sendgrid/mail";

const TRACKED_PATH = path.resolve("tracked.json");

const {
  SENDGRID_API_KEY,
  FROM_EMAIL
} = process.env;

if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY");
if (!FROM_EMAIL) throw new Error("Missing FROM_EMAIL");

sgMail.setApiKey(SENDGRID_API_KEY);

async function readTracked() {
  const raw = await fs.readFile(TRACKED_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeTracked(obj) {
  const pretty = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(TRACKED_PATH, pretty, "utf8");
}

// Fetch newest chapter for a manga (English by default)
// Uses MangaDex manga feed endpoint and sorts newest first.
async function fetchLatestChapter(mangaId, lang) {
  const url = new URL(`https://api.mangadex.org/manga/${mangaId}/feed`);
  url.searchParams.set("limit", "1");
  url.searchParams.append("translatedLanguage[]", lang);
  url.searchParams.set("order[publishAt]", "desc");

  const res = await fetch(url, {
    headers: { "User-Agent": "manga-alerts-bot/1.0 (personal project)" }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MangaDex error ${res.status} for ${mangaId}: ${text}`);
  }

  const data = await res.json();
  const ch = data?.data?.[0];
  if (!ch) return null;

  return {
    id: ch.id,
    chapter: ch.attributes?.chapter ?? "?",
    title: ch.attributes?.title ?? "",
    publishAt: ch.attributes?.publishAt ?? ch.attributes?.createdAt ?? null
  };
}

function chapterUrl(chapterId) {
  return `https://mangadex.org/chapter/${chapterId}`;
}

async function sendEmail(to, from, updates) {
  const subject =
    updates.length === 1
      ? `New chapter: ${updates[0].mangaTitle}`
      : `New manga chapters: ${updates.length} updates`;

  const lines = updates.map(u => {
    const label = `Ch. ${u.chapter}${u.chapterTitle ? ` — ${u.chapterTitle}` : ""}`;
    return `• ${u.mangaTitle}: ${label}\n  ${u.url}`;
  });

  const text =
    `New updates from MangaDex:\n\n` +
    lines.join("\n\n") +
    `\n`;

  await sgMail.send({ to, from, subject, text });
}

async function main() {
  const tracked = await readTracked();
  const email = tracked.email;
  const langDefault = tracked.defaultLanguage ?? "en";

  const updates = [];

  for (const item of tracked.manga ?? []) {
    const lang = item.language ?? langDefault;

    const latest = await fetchLatestChapter(item.mangaId, lang);
    if (!latest) continue;

    // Dedupe: only notify if the chapter id changed since last run
    if (latest.id === item.lastNotifiedChapterId) continue;

    updates.push({
      mangaTitle: item.title,
      chapter: latest.chapter,
      chapterTitle: latest.title,
      url: chapterUrl(latest.id),
      publishAt: latest.publishAt,
      mangaId: item.mangaId,
      latestChapterId: latest.id
    });
  }

  if (updates.length === 0) {
    console.log("No new updates.");
    return;
  }

  // Sort newest first for a nicer email
  updates.sort((a, b) => (b.publishAt || "").localeCompare(a.publishAt || ""));

  await sendEmail(email, FROM_EMAIL, updates);

  // Update tracked.json so you don’t get duplicate emails next run
  for (const u of updates) {
    const entry = tracked.manga.find(m => m.mangaId === u.mangaId);
    if (entry) entry.lastNotifiedChapterId = u.latestChapterId;
  }

  await writeTracked(tracked);
  console.log(`Sent ${updates.length} update(s) to ${email} and updated tracked.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
