import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

const TRACKED_PATH = path.resolve("tracked.json");

const { SMTP_USER, SMTP_PASS, FROM_EMAIL, TO_EMAIL } = process.env;

if (!SMTP_USER) throw new Error("Missing SMTP_USER");
if (!SMTP_PASS) throw new Error("Missing SMTP_PASS");
if (!FROM_EMAIL) throw new Error("Missing FROM_EMAIL");
if (!TO_EMAIL) throw new Error("Missing TO_EMAIL");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

async function readTracked() {
  const raw = await fs.readFile(TRACKED_PATH, "utf8");
  return JSON.parse(raw);
}

async function fetchLatestChapter(mangaId, lang) {
  const url = new URL(`https://api.mangadex.org/manga/${mangaId}/feed`);
  url.searchParams.set("limit", "1");
  url.searchParams.append("translatedLanguage[]", lang);
  url.searchParams.set("order[publishAt]", "desc");

  const res = await fetch(url, {
    headers: { "User-Agent": "manga-alerts-bot/1.0 (personal project)" }
  });
  if (!res.ok) return null;

  const data = await res.json();
  const ch = data?.data?.[0];
  if (!ch) return null;

  return {
    id: ch.id,
    chapter: ch.attributes?.chapter ?? null,
    title: ch.attributes?.title ?? "",
    publishAt: ch.attributes?.publishAt ?? ch.attributes?.createdAt ?? null
  };
}

function safeNum(x) {
  // Handles "76", "76.5"; returns NaN if null/""/"extra"
  return Number.parseFloat(String(x));
}

async function sendEmail(updates) {
  const subject =
    updates.length === 1
      ? `Manga update: ${updates[0].mangaTitle}`
      : `Manga updates: ${updates.length} series`;

  const lines = updates.map(u => {
    return `• ${u.mangaTitle}: latest ${u.latestLabel} (you’re on ${u.myChapter})`;
  });

  const text = `You have new chapters to read:\n\n${lines.join("\n")}\n`;

  await transporter.sendMail({ from: FROM_EMAIL, to: TO_EMAIL, subject, text });
}

async function main() {
  const tracked = await readTracked();
  const langDefault = tracked.defaultLanguage ?? "en";

  const updates = [];

  for (const item of tracked.manga ?? []) {
    const latest = await fetchLatestChapter(item.mangaId, item.language ?? langDefault);
    if (!latest) continue;

    const latestNum = safeNum(latest.chapter);
    const myNum = safeNum(item.myChapter);

    // If we can compare numbers, only include if you're behind.
    if (Number.isFinite(latestNum) && Number.isFinite(myNum)) {
      if (latestNum > myNum) {
        updates.push({
          mangaTitle: item.title,
          myChapter: item.myChapter,
          latestLabel: `Ch. ${latest.chapter}${latest.title ? ` — ${latest.title}` : ""}`,
          publishAt: latest.publishAt
        });
      }
    } else {
      // If numbering is weird/missing, you can choose to include it anyway:
      // comment this block out if you prefer skipping un-numbered chapters.
      updates.push({
        mangaTitle: item.title,
        myChapter: item.myChapter ?? "?",
        latestLabel: latest.chapter ? `Ch. ${latest.chapter}` : "New chapter (un-numbered)",
        publishAt: latest.publishAt
      });
    }
  }

  if (updates.length === 0) {
    console.log("No updates (or nothing comparable).");
    return;
  }

  updates.sort((a, b) => (b.publishAt || "").localeCompare(a.publishAt || ""));
  await sendEmail(updates);
  console.log(`Sent ${updates.length} update(s) to ${TO_EMAIL}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
