# 📘 Automated Manga Tracker & Reminder

A serverless, mobile-first automation that tracks manga reading progress and sends reminder emails when new chapters are available.

This project uses **iOS Shortcuts as a lightweight UI**, **GitHub Actions as the backend**, and a **single JSON file as persistent storage** — no servers, no databases.

---

## ✨ Features

- **Update reading progress from your phone**
  - Enter manga title + chapter via an iOS Shortcut
- **Automatic manga lookup**
  - Uses the MangaDex public API to resolve titles and fetch latest chapters
- **Weekly reminder emails**
  - Notifies you when you’re behind on chapters
- **No backend infrastructure**
  - GitHub Actions handles all execution
  - JSON file acts as a lightweight database
- **Secure by design**
  - Fine-grained GitHub token scoped to a single repo

---

## Tech Stack

**Frontend / Input**
- iOS Shortcuts (mobile UI)

**Automation / Backend**
- GitHub Actions (cron + workflow dispatch)

**Logic**
- Node.js (ES modules)

**Storage**
- GitHub repository (`tracked.json`)

**APIs**
- MangaDex Public API
- GitHub REST API

**Notifications**
- Gmail SMTP via Nodemailer

---

## Project Structure

automated-alerts/
├─ tracked.json
├─ package.json
├─ scripts/
│ ├─ update.mjs # Add/update manga progress
│ └─ check-updates.mjs # Weekly update checker
└─ .github/workflows/
├─ update-manga.yml # Triggered by iOS Shortcut
└─ manga-alerts.yml # Weekly reminder email

1. User runs an **iOS Shortcut**
2. Shortcut sends manga title + chapter to GitHub
3. GitHub Action runs `update.mjs`
4. `tracked.json` is updated and committed
5. Weekly cron checks MangaDex for new chapters
6. If you’re behind → email reminder is sent


I created this because I read a lotttt of manga/manhwa and throughout the years each time I catch up to something I end up never reading it again 
because I don't write it down anywhere so this combines my love for manga and software!
