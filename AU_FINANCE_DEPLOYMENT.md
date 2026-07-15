# AU Finance Pulse deployment

The iPhone-first dashboard is isolated under `docs/` so the existing Aurora Life OS project remains unchanged.

- The public feed is generated from Google News Australia finance searches and official RBA RSS feeds.
- `.github/workflows/au-finance-pages.yml` refreshes the feed at minutes 17 and 47 of every hour and deploys `docs/` to GitHub Pages.
- The app works as a PWA and can be added to an iPhone Home Screen from Safari.
- No API key is required. The quick brief is generated locally from displayed headlines.
