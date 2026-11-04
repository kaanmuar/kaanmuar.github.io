# QA-lab Live Reports for Reddit

An interactive post with the Live Reports ring from [carlosandmunoz.com](https://carlosandmunoz.com/qa-review.html#live-reports): public sites analyzed by QA-lab URL Review for SEO, AI search (GEO), analytics, security, accessibility, and speed. Turn the ring, filter by sector, scope, country, or test focus, and open any report.

- **Inline:** the newest batch and its top scores, with a button that opens the ring.
- **Expanded:** the same ring and report viewer as the site (`live.html`, `js/qa-review-live.js`).
- **Daily:** each new batch gets its own post, pinned. The moderator menu has *Post the live reports*.

## Data

The app makes no network requests. Each version carries its own copy of the reports (`assets/live-reports`), and a new version is uploaded after each daily batch (`.github/workflows/reddit-live.yml`). Links leave through Reddit's `navigateTo`.

## Build and upload

```sh
npm ci
node scripts/build.mjs        # public/ and dist/server/index.cjs from the site's files
npx devvit login              # once; CI uses ~/.devvit/token as the DEVVIT_TOKEN secret
npx devvit upload
npx devvit install r/<subreddit> qalab-live-reports@latest
```

## Privacy and terms

The app stores no user data. Its Redis holds one value, the date of the last batch it posted. Reports cover public pages only, and site owners can ask to be removed at qa@carlosandmunoz.com. [Legal](https://carlosandmunoz.com/qa-review-legal.html).
