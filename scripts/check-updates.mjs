import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

const TRACKED_PATH = path.resolve("tracked.json");

const {
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
  TO_EMAIL,
} = process.env;

if (!SMTP_USER) throw new Error("Missing SMTP_USER");
if (!SMTP_PASS) throw new Error("Missing SMTP_PASS");
if (!FROM_EMAIL) throw new Error("Missing FROM_EMAIL");
if (!TO_EMAIL) throw new Error("Missing TO_EMAIL");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS, // App Password (not your real password)
  },
});

async function readTracked() {
  const raw = await fs.readFile(TRACKED_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeTracked(obj) {
  const pretty = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(TRACKED_PATH, pretty, "utf8");
}

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

async function sendEmail(updates) {
  const subject =
    updates.length === 1
      ? `New chapter: ${updates[0].mangaTitle}`
      : `New manga chapters: ${updates.length} updates`;

  const lines = updates.map(u => {
    const label = `Ch. ${u.chapter}${u.chapterTitle ? ` — ${u.chapterTitle}` : ""}`;
    return `• ${u.mangaTitle}: ${label}\n  ${u.url}`;
  });

  const text = `New updates from MangaDex:\n\n${lines.join("\n\n")}\n`;

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject,
    text,
  });
}

async function main() {
  const tracked = await readTracked();
  const langDefault = tracked.defaultLanguage ?? "en";

  const updates = [];

  for (const item of tracked.manga ?? []) {
    const lang = item.language ?? langDefault;
    const latest = await fetchLatestChapter(item.mangaId, lang);
    if (!latest) continue;

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

  updates.sort((a, b) => (b.publishAt || "").localeCompare(a.publishAt || ""));

  await sendEmail(updates);

  for (const u of updates) {
    const entry = tracked.manga.find(m => m.mangaId === u.mangaId);
    if (entry) entry.lastNotifiedChapterId = u.latestChapterId;
  }

  await writeTracked(tracked);
  console.log(`Sent ${updates.length} update(s) to ${TO_EMAIL} and updated tracked.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
