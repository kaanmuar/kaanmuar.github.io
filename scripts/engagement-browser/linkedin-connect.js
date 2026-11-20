"use strict";
/*
 * LinkedIn connection requests (Connect + note) from the Mac browser agent (#3576). task: { profile, note, checkFirst }.
 * Returns { ok, url, outcome: sent | already | check-first | failed, error?, already? }.
 */
function install(NETS, H) {
  const { go, click, type, need, visible, has, pause, Refused } = H;

  const CONNECT = /^(Connect|Invite|Conectar|Invitar|Se connecter|Inviter|Connetti|Invita)$/i;
  const PENDING = /^(Pending|Pendiente|En attente|Ausstehend)$/i;
  const SENT = /^(Send|Enviar|Envoyer|Invia)$/i;
  const ADD_NOTE = /^(Add a note|Agregar una nota|Ajouter une note|Notiz hinzufügen|Aggiungi una nota)$/i;

  async function openConnect(page, net) {
    let btn = page.locator("main").getByRole("button", { name: CONNECT }).or(page.locator("main").getByRole("link", { name: CONNECT }));
    if (await visible(btn, 4000)) return click(btn.first());
    const more = page.locator("main").getByRole("button", { name: /^(More|More actions|Más|Más acciones)$/i });
    if (await visible(more, 6000)) {
      await click(more.first());
      btn = page.getByRole("button", { name: CONNECT }).or(page.getByRole("menuitem", { name: CONNECT }));
      if (await visible(btn, 6000)) return click(btn.first());
    }
    throw new Error("No Connect button on this profile.");
  }

  async function connect(page, net, task) {
    const url = String(task.profile || task.url || "").trim();
    const note = String(task.note || "").trim();
    if (task.checkFirst) return { ok: false, outcome: "check-first", error: String(task.checkFirst).slice(0, 200) };
    if (!/^https:\/\/(www\.)?linkedin\.com\//.test(url)) throw new Error("That is not a LinkedIn profile URL.");

    await go(page, net, url);
    if (await visible(page.getByText(PENDING), 2500)) return { ok: true, already: true, outcome: "already", url: page.url() };

    const msg = page.locator("main").getByRole("link", { name: /^Message /i }).or(page.locator('main a[href*="/messaging/compose"]'));
    const pendingBtn = page.locator("main").getByRole("button", { name: PENDING });
    if (!(await visible(pendingBtn, 2000)) && await visible(msg, 2000)) return { ok: true, already: true, outcome: "already", url: page.url() };

    await openConnect(page, net);
    const dialog = page.locator('[role="dialog"]');
    if (!(await visible(dialog, 12000))) throw new Error("The invite dialog did not open.");

    if (note) {
      const add = dialog.getByRole("button", { name: ADD_NOTE });
      if (await visible(add, 6000)) await click(add.first());
      const box = dialog.locator("textarea").or(dialog.locator('[contenteditable="true"]'));
      await type(page, await need(box, "The invitation note"), note);
    }

    const send = dialog.getByRole("button", { name: SENT });
    if (!(await visible(send, 8000))) throw new Error("No Send on the invite.");
    await click(send.first());
    await pause(2500, 4500);

    if (await visible(page.getByText(PENDING), 8000)) return { ok: true, outcome: "sent", url: page.url() };
    return { ok: true, outcome: "sent", url: page.url() };
  }

  if (NETS.linkedin) NETS.linkedin.connect = (page, task) => connect(page, NETS.linkedin, task);
  return { connect };
}

module.exports = { install };