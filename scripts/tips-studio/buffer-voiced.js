// Replaces each queued TikTok / YouTube clip post in Buffer with its voiced, translated version,
// keeping the post id and time. Serve media/social-posts on 127.0.0.1:8799 with CORS and Private Network
// Access headers (with this file and voiced-manifest.json in it), load it in a publish.buffer.com tab, then:
// await __voicedRun({ limit: 1 }).
(() => {
  const ORG = "6ad124338d8aa5512281485d";
  const TT = "6ad2b297778b240e2f31cc41";
  const YT = "6ad12697778b240e2f1d89b7";
  const BASE = "http://127.0.0.1:8799/";
  const g = (q, v) => fetch("https://graph.buffer.com/?_o=P", { method: "POST", credentials: "include",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: v || {} }) }).then((r) => r.json());
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const OLD = [["we read gov.uk", "runs-2026-10", "govuk"], ["release day: does the page still read right", "tips-2026-10", "release-day"]];

  async function posts() {
    const all = [];
    let after = null;
    for (let i = 0; i < 10; i += 1) {
      const r = await g("query($o:OrganizationId!,$a:String){posts(first:100,after:$a,input:{organizationId:$o,filter:{channelIds:[\"" + TT + "\",\"" + YT + "\"],status:[scheduled]}}){pageInfo{hasNextPage endCursor} edges{node{id dueAt text channelId schedulingType metadata{... on YoutubePostMetadata{title privacy license notifySubscribers embeddable madeForKids isAiGenerated category{categoryId}} ... on TiktokPostMetadata{title isAiGenerated}} assets{source}}}}}", { o: ORG, a: after });
      if (r.errors) throw new Error(JSON.stringify(r.errors));
      all.push(...r.data.posts.edges.map((e) => e.node));
      if (!r.data.posts.pageInfo.hasNextPage) break;
      after = r.data.posts.pageInfo.endCursor;
    }
    return all;
  }

  function matchAll(list, manifest) {
    return list.map((p) => {
      const text = norm(p.text);
      const title = norm(p.metadata && p.metadata.title);
      let c = p.channelId === TT
        ? manifest.filter((m) => text === norm(m.tiktok) || text.startsWith(norm(m.title)))
        : manifest.filter((m) => norm(m.ytTitle) === title || (p.text || "").includes(m.utm + "&"));
      if (c.length !== 1) {
        const old = OLD.find((o) => text.startsWith(o[0]) || title.startsWith(o[0]));
        c = old ? manifest.filter((m) => m.batch === old[1] && m.id === old[2]) : [];
      }
      return { p, c: c.length === 1 ? c[0] : null };
    });
  }

  async function upload(path, mime) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error("fetch " + res.status + " " + path);
    const blob = await res.blob();
    const s = await g("query($i:S3PreSignedURLInput!){s3PreSignedURL(input:$i){url assetUrl}}",
      { i: { fileName: path.split("/").pop(), mimeType: mime, organizationId: ORG, uploadType: "postAsset" } });
    if (s.errors) throw new Error(JSON.stringify(s.errors));
    const put = await fetch(s.data.s3PreSignedURL.url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
    if (!put.ok) throw new Error("put " + put.status + " " + path);
    return s.data.s3PreSignedURL.assetUrl;
  }

  async function edit(p, c, meta, asset) {
    const input = { id: p.id, dueAt: p.dueAt, schedulingType: p.schedulingType,
      text: p.channelId === TT ? meta.tiktok : meta.youtube,
      assets: { video: { url: asset.video, thumbnailUrl: asset.thumb } } };
    if (p.channelId === YT) {
      const m = p.metadata || {};
      input.metadata = { youtube: { title: meta.youtubeTitle, privacy: m.privacy || "public", license: m.license || "youtube",
        notifySubscribers: m.notifySubscribers !== false, embeddable: m.embeddable !== false, madeForKids: !!m.madeForKids,
        isAiGenerated: !!m.isAiGenerated, categoryId: (m.category && m.category.categoryId) || "28" } };
    } else {
      input.metadata = { tiktok: { isAiGenerated: !!(p.metadata && p.metadata.isAiGenerated) } };
    }
    const r = await g("mutation($i:EditPostInput!){editPost(input:$i){__typename ... on PostActionSuccess{post{id dueAt assets{source}}} ... on InvalidInputError{message} ... on UnexpectedError{message} ... on RestProxyError{message} ... on NotFoundError{message} ... on LimitReachedError{message} ... on UnauthorizedError{message}}}", { i: input });
    if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300));
    const out = r.data.editPost;
    if (out.__typename !== "PostActionSuccess") throw new Error(out.__typename + ": " + out.message);
    if (out.post.dueAt !== p.dueAt) throw new Error("time moved " + p.dueAt + " -> " + out.post.dueAt);
    return "ok";
  }

  window.__voicedRun = async function (opts) {
    opts = opts || {};
    const manifest = await fetch(BASE + "voiced-manifest.json").then((r) => r.json());
    const matched = matchAll(await posts(), manifest);
    const res = window.__vres = window.__vres || {};
    const assets = window.__vassets = window.__vassets || {};
    let done = 0;
    for (const { p, c } of matched) {
      if (!c || res[p.id] === "ok" || p.assets.some((a) => /\/uploads\//.test(a.source))) continue;
      if (opts.only && !opts.only.includes(p.id)) continue;
      if (opts.limit && done >= opts.limit) break;
      try {
        const metaRes = await fetch(BASE + c.batch + "/voiced/" + c.slug + ".json");
        if (!metaRes.ok) { res[p.id] = "not rendered " + c.slug; continue; }
        const meta = await metaRes.json();
        const key = c.batch + "/" + c.slug;
        if (!assets[key]) assets[key] = { video: await upload(key.replace("/", "/voiced/") + ".mp4", "video/mp4"),
          thumb: await upload(c.batch + "/voiced/cover/" + c.slug + ".jpg", "image/jpeg") };
        res[p.id] = await edit(p, c, meta, assets[key]);
        done += 1;
      } catch (e) {
        res[p.id] = "error " + c.slug + ": " + e.message;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    const vals = Object.values(res);
    return { matched: matched.filter((m) => m.c).length, unmatched: matched.filter((m) => !m.c).length,
      ok: vals.filter((v) => v === "ok").length, pending: vals.filter((v) => v.startsWith("not rendered")).length,
      errors: vals.filter((v) => v.startsWith("error")).slice(0, 5) };
  };
})();
