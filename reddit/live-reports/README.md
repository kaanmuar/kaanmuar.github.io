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

## Subreddit sidebar

Set by hand in r/QALabLiveReports; the app cannot write them.

**Community description** (*Mod Tools > General settings*, at most 500 characters):

```text
Every day, QA-lab URL Review analyzes public websites for SEO, AI search (GEO), analytics, security, accessibility and speed, and posts the newest batch here. Turn the ring, filter by sector or country, and open any report. Each report is one automated analysis of public pages, a starting point, not a verdict. Site owners can ask for removal at qa@carlosandmunoz.com. Review your own site at carlosandmunoz.com.
```

**Links widget** (on the community page, *Edit widgets > Add widget > Button*, titled *Links*; button text is at most 30 characters):

| Button | Link |
| --- | --- |
| Live Reports | https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=live-reports#live-reports |
| Telegram channel | https://t.me/qalab_live |
| Follow QA-lab (EN, DE, FR, IT) | https://carlosandmunoz.com/qalaburlreview.html |
| Sigue a QA-lab (ES, PT) | https://carlosandmunoz.com/qaurlreview.html |
| Social hub | https://carlosandmunoz.com/qa-review-social.html |

## Privacy and terms

The app stores no user data. Its Redis holds one value, the date of the last batch it posted. Reports cover public pages only, and site owners can ask to be removed at qa@carlosandmunoz.com. [Legal](https://carlosandmunoz.com/qa-review-legal.html).
