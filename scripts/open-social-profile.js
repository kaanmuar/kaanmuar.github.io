#!/usr/bin/env node
/*
  Sets the QA-lab URL Review avatar and banner on Bluesky and Mastodon from the brand kit (#1848). Only the two images
  change: the name, bio and links stay as they are. Uses the open-social secrets (BLUESKY_HANDLE, BLUESKY_APP_PASSWORD,
  MASTODON_URL, MASTODON_TOKEN); a network without them is skipped.

  node scripts/open-social-profile.js [--network bluesky|mastodon] [--dry-run]
*/
const fs = require("fs");
const path = require("path");
const { bluesky, mastodon } = require("./open-social-queue");

const KIT = path.join(__dirname, "..", "media", "brand-kit-2026-10");
const IMAGES = { avatar: path.join(KIT, "instagram", "avatar-1080.jpg"), banner: path.join(KIT, "x", "header-1500x500.jpg") };

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes("--network") ? argv[argv.indexOf("--network") + 1] : process.env.NETWORK || "";
  const dry = argv.includes("--dry-run");
  for (const file of Object.values(IMAGES)) if (!fs.existsSync(file)) throw new Error("missing " + file);
  let broken = false;
  for (const [name, client] of [["bluesky", bluesky()], ["mastodon", mastodon()]]) {
    if (only && only !== name) continue;
    if (!client.ready) { console.log(name + ": no secrets, skipped"); continue; }
    try {
      const who = await client.login();
      if (dry) { console.log(name + ": would set the avatar and banner on " + who); continue; }
      console.log(name + ": set the avatar and banner on " + (await client.profile(IMAGES)));
    } catch (error) {
      broken = true;
      console.error(name + ": " + error.message);
    }
  }
  if (broken) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
