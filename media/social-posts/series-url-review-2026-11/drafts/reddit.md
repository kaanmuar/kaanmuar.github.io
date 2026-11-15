# Reddit: 4 value-first posts, English (drafts, post by hand)

Re-read each subreddit's sidebar rules before posting (reddit.com refused an unauthenticated rules fetch on 2026-11-10). Only r/QALabLiveReports (ours) and r/webdev's Showoff Saturday carry a link; the other two are discussion posts with no product name or link, as in the repo's earlier Reddit drafts (scripts/post-studio/build.js). Answer comments for the first two hours.

## r/QALabLiveReports · 2026-11-18 10:00 ET (`rd01-qalab-live-reports`)

- Feature: The new checks on a real site (wordpress.org)
- Subreddit rule: Our own subreddit (the Live Reports app posts there). A walkthrough with a link is fine; pin it next to the day's batch.
- Link: https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=rd01-qalab-live-reports-en
- Image: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02-report-checks.png`, alt: Security section of the wordpress.org report: Safe Browsing, mail, domain and blocklist checks, 2 fail, 12 at risk, 16 pass.

**Title:** What's new in every review, walked through on the wordpress.org live report

Every review now runs a set of safety checks it didn't have last month. Here is what each one returned on wordpress.org, read on production:

- **Security section:** Safe Browsing, mail, domain and blocklist checks now sit together. wordpress.org: 2 fail, 12 at risk, 16 pass.
- **Phishing and malware lists:** the Cloudflare URL Scanner has no current verdict against the site. A hit would be a critical finding, and a listed site never appears in Live Reports.
- **Linked hosts:** the pages link to 37 third-party hosts; each was checked with Google Safe Browsing. A listed *script* host is critical, because that code runs in visitors' browsers.
- **Lookalike domains:** a registered lookalike domain asks for a password and receives mail. We only flag lookalikes that have a website or a mail server.
- **Hacked-site signs:** Googlebot and a phone get the same page (no cloaking) and there are no hidden spam links. The search-spam check asks a person to look instead of guessing.
- **Mail:** DMARC rejects spoofed mail and SPF is published, but one spam blocklist lists the mail server's address.

How severity works: high only on strong evidence (a spam term in a title or address, an orphan page, a script that differs). A mention is info, and a check that couldn't run says "not checked", never "pass".

Questions about any finding? Ask below and we'll answer in the thread.

Run the same checks on a site you own: https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=rd01-qalab-live-reports-en

---

## r/webdev · 2026-11-21 10:00 ET (`rd02-webdev-showoff`)

- Feature: Hacked-site signs
- Subreddit rule: Self-promotion only on Showoff Saturday (flair it Showoff Saturday). Lead with how it works; one link, disclosed as ours.
- Link: https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=rd02-webdev-showoff-en
- Image: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02d-hacked-signs.png`, alt: Report finding on hacked-site signs: search results are checked for spam on the domain, and here the report asks a person to look.

**Title:** [Showoff Saturday] Hacked-site checks that try hard not to cry wolf: search spam, cloaking and hidden links

I build a site reviewer, and this month I added three checks for signs that a site was quietly hacked. The hard part wasn't detecting things, it was not raising false alarms. Here's how each one works and where it draws the line:

**1. Spam injected into search results.** A `site:` query on the domain (Brave Search API) looks for pages spammers inject: pharma, gambling, replica goods, crypto giveaways. A hit is only *high* severity when the evidence is strong: the term is in a page title or URL slug, the page is an orphan (nothing on the site links to it), or it loads a different script. A page that merely *mentions* the word is info.

**2. Cloaking.** We fetch the same page as Googlebot and as a phone browser and compare. Injected SEO spam often shows only to crawlers, so owners never see it.

**3. Spam links and text in the HTML**, hidden with CSS (display:none, off-screen offsets, 0–1 px text) or not.

The rule that saves the most false alarms: we match the *phrases* spammers use ("buy cheap …", "no deposit bonus", "replica rolex"), not bare topic words. A news story about a casino doesn't count, and a site whose own subject is a pharmacy or a casino (read from its schema type, title and h1) isn't flagged for being itself.

**When the search API fails**, the finding reads "not checked", not "pass". Silence shouldn't look like a clean bill of health.

On wordpress.org, for example: same page for Googlebot and a phone, no hidden links, and the search check asked a person to look.

Disclosure: it's my project, QA-lab URL Review: https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=rd02-webdev-showoff-en. I'd love feedback on the thresholds. What would you count as strong evidence of injected spam?

---

## r/Wordpress · 2026-11-24 11:00 ET (`rd03-wordpress-lookalikes`)

- Feature: Lookalike domains
- Subreddit rule: No self-promotion or product links in posts. A how-to with no product name or link; disclose the tool only if someone asks.
- Link: none (rule)
- Image: none (text post)

**Title:** PSA: check who registered lookalikes of your site's domain (a 15-minute routine)

Phishing kits aimed at a specific site almost always start with a lookalike domain: a swapped letter, a dropped dot, `-login` or `-support` added, a different TLD. Here's a routine any site owner can run:

1. **Generate the variants.** The open-source tool `dnstwist` lists typos, homoglyphs, added words and other TLDs for your domain.
2. **Keep only the registered ones that are set up.** A parked domain is noise. The ones that matter have an A record (a website) or, especially, an **MX record (they can send and receive mail)**.
3. **Look at the site, carefully.** Use a sandboxed browser or a screenshot service. A login form or a copy of your wp-login page is the red flag.
4. **Report it.** Google Safe Browsing's phishing report form, the registrar's abuse contact (from WHOIS/RDAP) and the host's abuse contact. If it uses your trademark, UDRP is the slower, permanent route.
5. **Protect your own domain too.** Publish DMARC at `p=reject` once SPF and DKIM pass, so mail can't be spoofed from your *real* domain. Lookalikes are the next thing attackers try, so tell customers which domain you send from.

We ran this on a big, well-known WordPress site recently and found a registered lookalike with a login page and a mail server. Big sites get targeted first, but small shops are easier marks.

Does anyone here monitor for this automatically? What do you use?

*(Disclosure if asked: I build a site-review tool that runs this check. Not linking it here, per the sub's rules.)*

---

## r/sysadmin · 2026-12-01 10:00 ET (`rd04-sysadmin-blocklists`)

- Feature: Mail authentication + blocklists
- Subreddit rule: No vendor promotion. A discussion post with no product name or link.
- Link: none (rule)
- Image: none (text post)

**Title:** Which DNS blocklists do you actually trust for monitoring your own mail servers? Notes on the free ones and their terms

I've been wiring blocklist checks for our own domains and mail IPs, and the terms of use turned out to matter more than the list of lists. What I found:

- **Free to query, no registration in my reading of their terms:** SpamCop, Mailspike, PSBL, 0spam, NordSpam (IP and domain).
- **Barracuda** answers only resolvers registered with them, so queries through a public resolver usually come back empty. An empty answer there means "unknown", not "not listed".
- **Spamhaus, SURBL, URIBL:** free use comes with limits (volume, and non-commercial use for some), and Spamhaus answers queries from big public resolvers with an error code rather than a listing. Read their terms before you put them in anything a customer pays for.
- Treat **"no answer" as unknown**, never as clean.

And blocklists are only half of it. "Our mail lands in spam" often comes down to SPF with too many lookups, DKIM not signing for one sending service, or DMARC stuck at `p=none`.

Which lists do you check, and has a listing on any of them actually changed whether your mail was delivered?

---
