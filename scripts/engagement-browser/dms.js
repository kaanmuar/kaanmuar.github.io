"use strict";
/*
 * Direct messages from the Mac's browser agent (#3137): the cheerful DM with a 2-day URL review pass that Carlos
 * approved in Jarvis (functions/chain-trials.js), sent as the signed-in account from the person's profile. Each
 * network's dm(page, task) => { url, card, cardError } or a throw; a Refused throw (signed out, a check, a limit)
 * keeps the DM queued. task: { network, url, author { handle, id, name }, draft, cardFile, alt }. The card goes
 * through the conversation's file input where the web UI takes images; where it does not (TikTok, a Reddit message)
 * or the image will not attach, the DM goes as text, whose pass link is the same, and card says "text".
 *
 * Who can be messaged is the network's rule, not ours: X only when their DMs are open to us, LinkedIn a connection,
 * TikTok a mutual follow, Facebook from the signed-in profile (a page only answers). A missing Message button throws
 * a plain error that Jarvis shows on the DM. Threads has no web inbox, so a Threads DM goes to the same handle on
 * Instagram. networks.js installs these with its own page helpers (install), so the two files do not require each other.
 */

const enc = encodeURIComponent;
const SUBJECT = { en: "A little thank-you", es: "Un pequeño agradecimiento", pt: "Um pequeno agradecimento", de: "Ein kleines Dankeschön", fr: "Un petit merci", it: "Un piccolo grazie" };

function install(NETS, H) {
  const { go, click, type, need, visible, has, pause, Refused, rdCall } = H;
  const handleOf = (task) => String(((task || {}).author || {}).handle || "").replace(/^@/, "").trim();
  const must = (task, net) => {
    const handle = handleOf(task);
    if (!handle && !((task.author || {}).id)) throw new Error("No handle to message on " + net.name + ".");
    if (String(task.draft || "").trim().length < 5) throw new Error("The DM has no text.");
    return handle;
  };

  // The card through the conversation's file input; anything that goes wrong leaves the DM as text.
  async function attach(page, input, shown, task) {
    if (!task.cardFile) return { card: "", cardError: "" };
    try {
      if (!(await has(input))) throw new Error("no image input in the conversation");
      await input.first().setInputFiles(task.cardFile, { timeout: 10000 });
      if (shown && !(await visible(shown, 15000))) throw new Error("the image did not show in the conversation");
      await pause(800, 1600);
      return { card: "attached", cardError: "" };
    } catch (error) {
      return { card: "text", cardError: String(error.message || error).slice(0, 160) };
    }
  }

  // The message box keeps our text until it sends.
  async function sent(box, draft) {
    await pause(2500, 4500);
    const left = await box.innerText({ timeout: 2000 }).catch(() => "");
    if (left.includes(String(draft).slice(0, 20))) throw new Error("The DM did not send.");
  }

  async function messageButton(page, net, names, extra, who) {
    const re = new RegExp("^(" + names.join("|") + ")$", "i");
    const btn = page.getByRole("button", { name: re }).or(page.getByRole("link", { name: re })).or(page.locator(extra || "[data-qalab-none]"));
    if (!(await visible(btn, 10000))) throw new Error(net.name + " shows no Message button for " + who + " (they may not take DMs from us).");
    await click(btn.first());
  }

  const MSG = ["Message", "Send message", "Mensaje", "Enviar mensaje", "Mensagem", "Enviar mensagem"];

  async function instagram(page, task, net) {
    const handle = must(task, net);
    await go(page, net, "https://www.instagram.com/" + enc(handle) + "/");
    await messageButton(page, net, MSG, null, "@" + handle);
    const notNow = page.getByRole("button", { name: /^(Not Now|Ahora no)$/i });
    if (await visible(notNow, 4000)) await click(notNow.first());
    const box = await need(page.locator('div[role="textbox"][contenteditable="true"]'), "The DM box");
    const card = await attach(page, page.locator('input[type="file"][accept*="image"]'), page.locator('div[role="dialog"] img[src^="blob:"], img[src^="blob:"]'), task);
    await type(page, box, task.draft);
    await page.keyboard.press("Enter");
    await sent(box, task.draft);
    return Object.assign({ url: page.url() }, card);
  }

  const DMS = {
    async x(page, task, net) {
      const handle = must(task, net);
      await go(page, net, "https://x.com/" + enc(handle));
      const btn = page.locator('[data-testid="sendDMFromProfile"]');
      if (!(await visible(btn, 10000))) throw new Error("X shows no Message button for @" + handle + " (their DMs are closed to us).");
      await click(btn.first());
      const box = await need(page.locator('[data-testid="dmComposerTextInput"]'), "The DM box");
      await type(page, box, task.draft);
      const card = await attach(page, page.locator('[data-testid="dmComposerAttachmentButton"] input[type="file"], input[data-testid="fileInput"], [data-testid="DmScrollerContainer"] ~ * input[type="file"]'), page.locator('[data-testid="attachments"], [data-testid="dmComposerAttachment"]'), task);
      await click(await need(page.locator('[data-testid="dmComposerSendButton"]'), "Send"));
      await sent(box, task.draft);
      return Object.assign({ url: page.url() }, card);
    },
    instagram,
    threads(page, task) { return instagram(page, task, NETS.instagram); },
    async facebook(page, task, net) {
      const handle = must(task, net);
      const who = handle || task.author.id;
      await go(page, net, /^\d+$/.test(who) ? "https://www.facebook.com/profile.php?id=" + who : "https://www.facebook.com/" + enc(who));
      await messageButton(page, net, MSG, null, who);
      const box = await need(page.locator('div[role="textbox"][contenteditable="true"][aria-label*="ess" i], div[role="textbox"][contenteditable="true"][aria-label*="ensaje" i]'), "The chat box");
      const chat = page.locator('[role="dialog"], [aria-label*="Chat" i]').filter({ has: box });
      const card = await attach(page, (await has(chat)) ? chat.first().locator('input[type="file"]') : page.locator('input[type="file"][accept*="image"]'), page.locator('img[src^="blob:"], [aria-label*="Remove attachment" i], [aria-label*="Quitar archivo adjunto" i]'), task);
      await type(page, box, task.draft);
      await page.keyboard.press("Enter");
      await sent(box, task.draft);
      return Object.assign({ url: page.url() }, card);
    },
    async linkedin(page, task, net) {
      const handle = must(task, net);
      await go(page, net, "https://www.linkedin.com/in/" + enc(handle) + "/");
      await messageButton(page, net, MSG, 'main button[aria-label^="Message" i], main button[aria-label^="Enviar mensaje" i], main a[href*="/messaging/compose"]', handle + " (only connections take a message)");
      const box = await need(page.locator('.msg-form__contenteditable[contenteditable="true"]'), "The message box");
      const card = await attach(page, page.locator('.msg-form input[type="file"][accept*="image"], .msg-form input[type="file"]'), page.locator('.msg-form img[src^="blob:"], .msg-form__attachment, .msg-form [class*="attachment"]'), task);
      await type(page, box, task.draft);
      await click(await need(page.locator("button.msg-form__send-button, .msg-form button[type=submit]"), "Send"));
      await sent(box, task.draft);
      return Object.assign({ url: page.url() }, card);
    },
    async tiktok(page, task, net) {
      const handle = must(task, net);
      await go(page, net, "https://www.tiktok.com/@" + enc(handle));
      await messageButton(page, net, MSG, '[data-e2e="message-button"]', "@" + handle + " (only mutual follows take a message)");
      const box = await need(page.locator('[data-e2e="message-input-area"] [contenteditable="true"], [data-e2e="message-input-area"] div[role="textbox"]'), "The message box");
      await type(page, box, task.draft);
      await page.keyboard.press("Enter");
      await sent(box, task.draft);
      return Object.assign({ url: page.url() }, task.cardFile ? { card: "text", cardError: "TikTok's web messages take no images." } : {});
    },
    async telegram(page, task, net) {
      const handle = must(task, net);
      await go(page, net, "https://web.telegram.org/k/#@" + enc(handle));
      const input = '.input-message-input[contenteditable="true"]';
      const box = await need(page.locator(input).filter({ visible: true }), "The message box");
      if (task.cardFile) {
        const pick = page.locator(".attach-file, .btn-icon.attach-file").filter({ visible: true });
        try {
          if (!(await visible(pick, 5000))) throw new Error("no attach button");
          await click(pick.first());
          const photo = page.locator(".btn-menu-item").filter({ hasText: /^(Photo or Video|Photo|Foto o vídeo|Foto)$/i });
          const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8000 }), click(photo.first())]);
          await chooser.setFiles(task.cardFile);
          const popup = page.locator(".popup-send-photo");
          if (!(await visible(popup, 10000))) throw new Error("the photo popup did not open");
          await type(page, popup.locator(input).first(), task.draft);
          await click(popup.locator(".btn-primary").first());
          await popup.first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The DM did not send."); });
          return { url: page.url(), card: "attached", cardError: "" };
        } catch (error) {
          if (/did not send/.test(error.message)) throw error;
          await page.keyboard.press("Escape").catch(() => null);
          task = Object.assign({}, task, { cardError: String(error.message || error).slice(0, 160) });
        }
      }
      await type(page, box, task.draft);
      await page.keyboard.press("Enter");
      await sent(box, task.draft);
      return Object.assign({ url: page.url() }, task.cardFile ? { card: "text", cardError: task.cardError || "" } : {});
    },
    // Reddit chat takes the card; when chat is closed to us, a private message through the API goes as text.
    async reddit(page, task, net) {
      const handle = must(task, net);
      await go(page, net, "https://www.reddit.com/chat/user/" + enc(handle) + "/");
      const box = page.locator('textarea[name="message"], textarea[aria-label*="message" i]');
      if (await visible(box, 12000)) {
        const card = await attach(page, page.locator('input[type="file"][accept*="image"]'), page.locator('img[src^="blob:"], [aria-label*="Remove image" i]'), task);
        await type(page, box.first(), task.draft);
        await page.keyboard.press("Enter");
        await sent(box.first(), task.draft);
        return Object.assign({ url: page.url() }, card);
      }
      if (!rdCall) throw new Refused("Reddit chat did not open.");
      await rdCall(page, "/api/compose", { to: handle, subject: SUBJECT[task.lang] || SUBJECT.en, text: task.draft });
      return Object.assign({ url: "https://www.reddit.com/message/sent/" }, task.cardFile ? { card: "text", cardError: "Reddit chat was closed, so a private message went without the card." } : {});
    }
  };

  // A student invite (#3138) carries task.to and keeps the network's own dm.
  Object.entries(DMS).forEach(([k, fn]) => {
    if (!NETS[k]) return;
    const own = NETS[k].dm;
    NETS[k].dm = function dm(page, task) { return own && task.to ? own.call(NETS[k], page, task) : fn(page, task, NETS[k]); };
  });
  return DMS;
}

module.exports = { install };
