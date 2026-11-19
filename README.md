# FLIPNOTE — Your Notes. Your Memory.

A free-first, offline-ready, Apple-inspired Progressive Web App (PWA) that converts your notes and PDFs into flashcards, MCQ quizzes, and spaced-revision sessions in 15 languages.

## Features
- **Smart Notes**: Paste notes, edit/preview Markdown, import PDFs (lazy-loaded PDF.js), scan images with OCR (lazy-loaded Tesseract.js), save and search locally in IndexedDB.
- **Flashcard Studio**: Deterministic Unicode-aware Q&A extraction (works 100% offline with zero paid APIs), 3D flip animation, edit/delete/add/shuffle cards, save study sets, export JSON.
- **Quiz Engine**: Auto-generated MCQs with source explanations, score calculation, random question order, and retry-incorrect mode.
- **Spaced Revision**: Easy (+4d), Medium (+1d), Difficult (10m) scheduling + weak-topic identification.
- **15-Language Global i18n + RTL**: English, Hindi, Bengali, German, French, Spanish, Portuguese, Arabic (RTL), Urdu (RTL), Japanese, Korean, Tamil, Telugu, Marathi, and Gujarati.
- **Two Sharing Methods**:
  1. **Instant Sharing**: Compact JSON export/import and `#share=` URL payloads (with size warnings for large decks).
  2. **Optional Online Sharing (Supabase Free)**: Public study sets, shared quizzes, and discovery library using Row Level Security (RLS) and only the public anon key.
- **Optional AI Enhancement**: Disabled by default. Users may optionally supply their own API key (stored strictly locally in IndexedDB).

## GitHub Pages Deployment
1. Push the contents of the `flipnote/` folder to a GitHub repository (e.g. `username/flipnote`).
2. Update `<link rel="canonical">` and `og:url` in `index.html`, plus `robots.txt` and `sitemap.xml` with your GitHub Pages URL (`https://username.github.io/flipnote/`).
3. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch** (`main` / `root`).
4. Open the published HTTPS URL.

## Android PWA Installation
1. Open your deployed FLIPNOTE HTTPS URL in **Google Chrome** on Android.
2. Tap the **Install** button in the header (or Chrome menu `⋮` → **Add to Home screen** / **Install app**).
3. FLIPNOTE installs as a standalone app and caches its app shell & 15 locales for offline access.

## Optional Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql`, then `supabase/policies.sql`.
3. In **Project Settings → API**, copy your **Project URL** and **anon public** key (never use `service_role`).
4. Paste them into FLIPNOTE **Settings → Optional Supabase Online Sharing** and click **Save**.

## Support & Feedback

Reach out anytime at **flipnote.app2006@gmail.com**.
