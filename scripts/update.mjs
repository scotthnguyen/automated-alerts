import fs from "node:fs/promises";
import path from "node:path";

const TRACKED_PATH = path.resolve("tracked.json");

function usage() {
  console.log('Usage: node scripts/update.mjs "Manga Title" <chapterNumber>');
  process.exit(1);
}

const titleQuery = process.argv[2];
const chapterArg = process.argv[3];
if (!titleQuery || !chapterArg) usage();

const myChapter = Number(chapterArg);
if (!Number.isFinite(myChapter) || myChapter < 0) {
  console.error("Chapter must be a non-negative number (e.g., 20 or 76.5).");
  process.exit(1);
}

async function readTracked() {
  try {
    const raw = await fs.readFile(TRACKED_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { defaultLanguage: "en", manga: [] };
  }
}

async function writeTracked(obj) {
  await fs.writeFile(TRACKED_PATH, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function searchMangaDex(title) {
  const url = new URL("https://api.mangadex.org/manga");
  url.searchParams.set("limit", "5");
  url.searchParams.set("title", title);

  const res = await fetch(url, {
    headers: { "User-Agent": "manga-alerts-bot/1.0 (personal project)" }
  });
  if (!res.ok) throw new Error(`MangaDex search error ${res.status}`);

  const data = await res.json();
  const results = data?.data ?? [];
  if (results.length === 0) return null;

  const top = results[0];
  const titles = top.attributes?.title ?? {};
  const resolvedTitle =
    titles.en || titles["ja-ro"] || titles.ja || Object.values(titles)[0] || title;

  return { mangaId: top.id, title: resolvedTitle };
}

async function main() {
  const tracked = await readTracked();
  tracked.manga ??= [];

  const found = await searchMangaDex(titleQuery);
  if (!found) {
    console.error(`No MangaDex results for: ${titleQuery}`);
    process.exit(1);
  }

  // Match by mangaId if already present
  const existing = tracked.manga.find((m) => m.mangaId === found.mangaId);

  if (existing) {
    existing.title = found.title;
    existing.myChapter = myChapter;
    console.log(`Updated: ${found.title} → myChapter=${myChapter}`);
  } else {
    tracked.manga.push({
      title: found.title,
      mangaId: found.mangaId,
      myChapter
    });
    console.log(`Added: ${found.title} → myChapter=${myChapter}`);
  }

  await writeTracked(tracked);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
