# URL review release: 3-week social series (drafts) · #3395

Drafts only: nothing here is scheduled, queued or published. Child of #3325; builds on the held `release-2026-11` tips (#3331, PR #3358), which stay as they are.

- `calendar.csv`: one row per post and language: date, time (ET, UTC-5), network, post id, language, feature, hook, status, UTM link, hashtags, visual, pitch visual, alt text, copy.
- `linkedin.md`: 12 posts × en, de, es, fr, it, pt (16 Nov to 4 Dec, no posts on 26–27 Nov).
- `x.md`: 18 posts × 6 languages, including 2 threads (wordpress.org case story on 18 Nov, rivals map on 2 Dec).
- `reddit.md`: 4 value-first posts in English: r/QALabLiveReports, r/webdev (Showoff Saturday), r/Wordpress and r/sysadmin. The last two have no link or product name.
- `instagram-tiktok.md`: captions for 6 clips.
- `facebook.md` and `facebook-captions.json`: 12 posts × en, es, pt in the `captions.json` shape `scripts/facebook-queue.js` reads, every entry `hold: true`. They sit in `drafts/`, which no queue reads.

Links follow the repo's convention: `utm_source=<network>&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=<post id>-<lang>`. Hashtags follow `scripts/social-tags.js`: #QAlab first, at most 2 on X, 5 on Instagram, 4 on Facebook, 6 on LinkedIn.

No statistics are claimed. The case stories quote only the wordpress.org live report from the release tour.

## Before publishing (Carlos)

1. Launch prices "until December 10": the site and `functions/url-review-fix-offers.js` give no end date. Confirm the date, or drop it (li11, x11, x18, clip06).
2. Naming wordpress.org's findings in public (a lookalike domain with a login page; a spam blocklist listing its mail server): li04, li08, x03, x13, rd01–rd03.
3. "Past reviewers get a special code by email": confirm the mail goes out before 25 Nov (li07, x10).
4. The 48-hour promise: the splash doesn't say "48 hours" yet (#3324), and a report the Mac finishes after 40 h isn't sent (#3257). The copy says "report by email, or an apology after 48 hours", not "always".
5. Reddit rules: re-read each sidebar before posting.
