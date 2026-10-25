/* The benchmark that opens a many-URL comparison (js/qa-review-multi.js): every site's health score ring
   in ranked order, a reading of where the first site (the asker's own) stands and what to do next, the six
   areas on one radar and a heat map, and each indicator as bars. Drawn from the comparison's summary rows
   (functions/url-review-multi.js summaryOf), so it needs nothing the comparison does not already carry. */
(function () {
  "use strict";

  const COPY = {
    en: {
      title: "Benchmark", rankTitle: "Health score ranking", you: "Your site", rank: "#{n}",
      above: "{n} above you", below: "{n} below you", levelYou: "Level with you",
      leads_one: "Leads {n} indicator", leads_other: "Leads {n} indicators", average: "Field average: {n}",
      first: "{site} ranks first of {total} on the health score, {gap} ahead of {next}.",
      firstTie: "{site} shares first place of {total} on the health score with {next}.",
      behind: "{site} ranks #{rank} of {total} on the health score, {gap} behind the leader, {leader}.",
      avgAbove: "That is {n} above the field average.", avgBelow: "That is {n} below the field average.", avgLevel: "That is the field average.",
      unscored: "{site} has no health score in this comparison.",
      readingTitle: "What this means for you",
      leadTitle: "Where you lead", leadNone: "No indicator where you lead alone yet.",
      trailTitle: "Where you trail", trailNone: "You are close to the best on every indicator.",
      trailLine: "you {own}, best {best} ({site}), average {avg}", leadLine: "you {own}, next {next} ({site})",
      movesTitle: "Next moves",
      moveOvertake: "Overtake {site}: it is {gap} ahead on the health score, most of it in {areas}.",
      moveOvertakeFlat: "Overtake {site}: it is {gap} ahead on the health score.",
      moveHold: "Hold first place: {site} is the closest, {gap} behind.",
      moveFix: "Fix {label} first: {site} sets the mark at {best}, and you are at {own}.",
      moveThen: "Then {label}: {site} is at {best}, you at {own}.",
      moveDefend: "Defend {label}: your lead over {site} is only {margin}.",
      moveWatch: "Watch {site}: it leads {n} of {total} indicators, the most here.",
      and: " and ", radarTitle: "The six areas", radarCaption: "One shape per site; further out is better.",
      heatTitle: "Area by area", averageCol: "Average", gapCol: "Your gap to the best", bestYou: "Best",
      kpiTitle: "Speed, weight and other indicators", bestMark: "best",
      note: "Read from automated reviews of the public pages on the dates shown: a starting point for decisions, not a verdict.",
      pts_one: "{n} point", pts_other: "{n} points"
    },
    es: {
      title: "Benchmark", rankTitle: "Clasificación por puntuación de salud", you: "Tu sitio", rank: "#{n}",
      above: "{n} por encima de ti", below: "{n} por debajo de ti", levelYou: "Empata contigo",
      leads_one: "Encabeza {n} indicador", leads_other: "Encabeza {n} indicadores", average: "Promedio del grupo: {n}",
      first: "{site} ocupa el primer lugar de {total} en puntuación de salud, {gap} por delante de {next}.",
      firstTie: "{site} comparte el primer lugar de {total} en puntuación de salud con {next}.",
      behind: "{site} ocupa el puesto {rank} de {total} en puntuación de salud, {gap} detrás del líder, {leader}.",
      avgAbove: "Son {n} por encima del promedio del grupo.", avgBelow: "Son {n} por debajo del promedio del grupo.", avgLevel: "Es el promedio del grupo.",
      unscored: "{site} no tiene puntuación de salud en esta comparación.",
      readingTitle: "Qué significa para ti",
      leadTitle: "Dónde vas delante", leadNone: "Todavía no encabezas solo ningún indicador.",
      trailTitle: "Dónde vas detrás", trailNone: "Estás cerca del mejor en todos los indicadores.",
      trailLine: "tú {own}, el mejor {best} ({site}), promedio {avg}", leadLine: "tú {own}, el siguiente {next} ({site})",
      movesTitle: "Próximos pasos",
      moveOvertake: "Supera a {site}: te saca {gap} en puntuación de salud, sobre todo en {areas}.",
      moveOvertakeFlat: "Supera a {site}: te saca {gap} en puntuación de salud.",
      moveHold: "Mantén el primer lugar: {site} es el más cercano, a {gap}.",
      moveFix: "Corrige primero {label}: {site} marca {best} y tú estás en {own}.",
      moveThen: "Después, {label}: {site} está en {best} y tú en {own}.",
      moveDefend: "Defiende {label}: tu ventaja sobre {site} es de solo {margin}.",
      moveWatch: "Vigila a {site}: encabeza {n} de {total} indicadores, más que nadie aquí.",
      and: " y ", radarTitle: "Las seis áreas", radarCaption: "Una forma por sitio; cuanto más afuera, mejor.",
      heatTitle: "Área por área", averageCol: "Promedio", gapCol: "Tu distancia al mejor", bestYou: "El mejor",
      kpiTitle: "Velocidad, peso y otros indicadores", bestMark: "mejor",
      note: "Sale de revisiones automáticas de las páginas públicas en las fechas indicadas: un punto de partida para decidir, no un veredicto.",
      pts_one: "{n} punto", pts_other: "{n} puntos"
    },
    pt: {
      title: "Benchmark", rankTitle: "Ranking da pontuação de saúde", you: "Seu site", rank: "#{n}",
      above: "{n} acima de você", below: "{n} abaixo de você", levelYou: "Empata com você",
      leads_one: "Lidera {n} indicador", leads_other: "Lidera {n} indicadores", average: "Média do grupo: {n}",
      first: "{site} fica em primeiro de {total} na pontuação de saúde, {gap} à frente de {next}.",
      firstTie: "{site} divide o primeiro lugar de {total} na pontuação de saúde com {next}.",
      behind: "{site} fica em {rank}º de {total} na pontuação de saúde, {gap} atrás do líder, {leader}.",
      avgAbove: "São {n} acima da média do grupo.", avgBelow: "São {n} abaixo da média do grupo.", avgLevel: "É a média do grupo.",
      unscored: "{site} não tem pontuação de saúde nesta comparação.",
      readingTitle: "O que isso significa para você",
      leadTitle: "Onde você está à frente", leadNone: "Ainda não há indicador que você lidere sozinho.",
      trailTitle: "Onde você está atrás", trailNone: "Você está perto do melhor em todos os indicadores.",
      trailLine: "você {own}, melhor {best} ({site}), média {avg}", leadLine: "você {own}, o seguinte {next} ({site})",
      movesTitle: "Próximos passos",
      moveOvertake: "Ultrapasse {site}: está {gap} à frente na pontuação de saúde, sobretudo em {areas}.",
      moveOvertakeFlat: "Ultrapasse {site}: está {gap} à frente na pontuação de saúde.",
      moveHold: "Mantenha o primeiro lugar: {site} é o mais próximo, {gap} atrás.",
      moveFix: "Corrija primeiro {label}: {site} marca {best}, e você está em {own}.",
      moveThen: "Depois, {label}: {site} está em {best}, e você em {own}.",
      moveDefend: "Defenda {label}: sua vantagem sobre {site} é de apenas {margin}.",
      moveWatch: "Fique de olho em {site}: lidera {n} de {total} indicadores, mais que qualquer outro aqui.",
      and: " e ", radarTitle: "As seis áreas", radarCaption: "Uma forma por site; quanto mais para fora, melhor.",
      heatTitle: "Área por área", averageCol: "Média", gapCol: "Sua distância do melhor", bestYou: "O melhor",
      kpiTitle: "Velocidade, peso e outros indicadores", bestMark: "melhor",
      note: "Vem de revisões automáticas das páginas públicas nas datas indicadas: um ponto de partida para decidir, não um veredito.",
      pts_one: "{n} ponto", pts_other: "{n} pontos"
    },
    de: {
      title: "Benchmark", rankTitle: "Rangfolge nach Gesundheitswert", you: "Ihre Website", rank: "#{n}",
      above: "{n} vor Ihnen", below: "{n} hinter Ihnen", levelYou: "Gleichauf mit Ihnen",
      leads_one: "Vorn bei {n} Kennzahl", leads_other: "Vorn bei {n} Kennzahlen", average: "Durchschnitt aller: {n}",
      first: "{site} liegt beim Gesundheitswert auf Platz 1 von {total}, {gap} vor {next}.",
      firstTie: "{site} teilt sich beim Gesundheitswert Platz 1 von {total} mit {next}.",
      behind: "{site} liegt beim Gesundheitswert auf Platz {rank} von {total}, {gap} hinter dem Spitzenreiter {leader}.",
      avgAbove: "Das sind {n} über dem Durchschnitt.", avgBelow: "Das sind {n} unter dem Durchschnitt.", avgLevel: "Das ist genau der Durchschnitt.",
      unscored: "{site} hat in diesem Vergleich keinen Gesundheitswert.",
      readingTitle: "Was das für Sie bedeutet",
      leadTitle: "Wo Sie vorn liegen", leadNone: "Noch keine Kennzahl, bei der Sie allein vorn liegen.",
      trailTitle: "Wo Sie zurückliegen", trailNone: "Sie liegen bei jeder Kennzahl nah am Besten.",
      trailLine: "Sie {own}, Bester {best} ({site}), Durchschnitt {avg}", leadLine: "Sie {own}, Nächster {next} ({site})",
      movesTitle: "Nächste Schritte",
      moveOvertake: "{site} überholen: {gap} Vorsprung beim Gesundheitswert, vor allem bei {areas}.",
      moveOvertakeFlat: "{site} überholen: {gap} Vorsprung beim Gesundheitswert.",
      moveHold: "Platz 1 halten: {site} ist am nächsten dran, {gap} dahinter.",
      moveFix: "Zuerst {label} verbessern: {site} setzt die Marke bei {best}, Sie liegen bei {own}.",
      moveThen: "Danach {label}: {site} liegt bei {best}, Sie bei {own}.",
      moveDefend: "{label} verteidigen: Ihr Vorsprung vor {site} beträgt nur {margin}.",
      moveWatch: "{site} im Blick behalten: vorn bei {n} von {total} Kennzahlen, mehr als alle anderen.",
      and: " und ", radarTitle: "Die sechs Bereiche", radarCaption: "Eine Fläche pro Website; je weiter außen, desto besser.",
      heatTitle: "Bereich für Bereich", averageCol: "Durchschnitt", gapCol: "Ihr Abstand zum Besten", bestYou: "Bester",
      kpiTitle: "Tempo, Gewicht und weitere Kennzahlen", bestMark: "bester",
      note: "Aus automatisierten Prüfungen der öffentlichen Seiten an den angegebenen Tagen: ein Ausgangspunkt für Entscheidungen, kein Urteil.",
      pts_one: "{n} Punkt", pts_other: "{n} Punkte"
    },
    fr: {
      title: "Benchmark", rankTitle: "Classement par score de santé", you: "Votre site", rank: "#{n}",
      above: "{n} devant vous", below: "{n} derrière vous", levelYou: "À égalité avec vous",
      leads_one: "En tête sur {n} indicateur", leads_other: "En tête sur {n} indicateurs", average: "Moyenne du groupe : {n}",
      first: "{site} est premier sur {total} au score de santé, {gap} devant {next}.",
      firstTie: "{site} partage la première place sur {total} au score de santé avec {next}.",
      behind: "{site} est {rank}e sur {total} au score de santé, {gap} derrière le premier, {leader}.",
      avgAbove: "C’est {n} au-dessus de la moyenne du groupe.", avgBelow: "C’est {n} en dessous de la moyenne du groupe.", avgLevel: "C’est la moyenne du groupe.",
      unscored: "{site} n’a pas de score de santé dans cette comparaison.",
      readingTitle: "Ce que cela signifie pour vous",
      leadTitle: "Où vous êtes en tête", leadNone: "Aucun indicateur où vous êtes seul en tête pour l’instant.",
      trailTitle: "Où vous êtes en retard", trailNone: "Vous êtes proche du meilleur sur chaque indicateur.",
      trailLine: "vous {own}, meilleur {best} ({site}), moyenne {avg}", leadLine: "vous {own}, suivant {next} ({site})",
      movesTitle: "Prochaines étapes",
      moveOvertake: "Dépasser {site} : {gap} d’avance au score de santé, surtout en {areas}.",
      moveOvertakeFlat: "Dépasser {site} : {gap} d’avance au score de santé.",
      moveHold: "Garder la première place : {site} est le plus proche, à {gap}.",
      moveFix: "Corriger d’abord {label} : {site} fixe la barre à {best}, vous êtes à {own}.",
      moveThen: "Ensuite {label} : {site} est à {best}, vous à {own}.",
      moveDefend: "Défendre {label} : votre avance sur {site} n’est que de {margin}.",
      moveWatch: "Surveiller {site} : en tête sur {n} indicateurs sur {total}, plus que tous les autres.",
      and: " et ", radarTitle: "Les six domaines", radarCaption: "Une forme par site ; plus c’est loin du centre, mieux c’est.",
      heatTitle: "Domaine par domaine", averageCol: "Moyenne", gapCol: "Votre écart avec le meilleur", bestYou: "Meilleur",
      kpiTitle: "Vitesse, poids et autres indicateurs", bestMark: "meilleur",
      note: "Issu de revues automatisées des pages publiques aux dates indiquées : un point de départ pour décider, pas un verdict.",
      pts_one: "{n} point", pts_other: "{n} points"
    },
    it: {
      title: "Benchmark", rankTitle: "Classifica per punteggio di salute", you: "Il tuo sito", rank: "#{n}",
      above: "{n} sopra di te", below: "{n} sotto di te", levelYou: "Alla pari con te",
      leads_one: "In testa su {n} indicatore", leads_other: "In testa su {n} indicatori", average: "Media del gruppo: {n}",
      first: "{site} è primo su {total} per punteggio di salute, {gap} davanti a {next}.",
      firstTie: "{site} condivide il primo posto su {total} per punteggio di salute con {next}.",
      behind: "{site} è {rank}º su {total} per punteggio di salute, {gap} dietro al primo, {leader}.",
      avgAbove: "Sono {n} sopra la media del gruppo.", avgBelow: "Sono {n} sotto la media del gruppo.", avgLevel: "È la media del gruppo.",
      unscored: "{site} non ha un punteggio di salute in questo confronto.",
      readingTitle: "Cosa significa per te",
      leadTitle: "Dove sei avanti", leadNone: "Ancora nessun indicatore in cui sei l’unico in testa.",
      trailTitle: "Dove sei indietro", trailNone: "Sei vicino al migliore su ogni indicatore.",
      trailLine: "tu {own}, migliore {best} ({site}), media {avg}", leadLine: "tu {own}, il successivo {next} ({site})",
      movesTitle: "Prossime mosse",
      moveOvertake: "Supera {site}: è avanti di {gap} nel punteggio di salute, soprattutto in {areas}.",
      moveOvertakeFlat: "Supera {site}: è avanti di {gap} nel punteggio di salute.",
      moveHold: "Mantieni il primo posto: {site} è il più vicino, a {gap}.",
      moveFix: "Correggi prima {label}: {site} fissa il riferimento a {best} e tu sei a {own}.",
      moveThen: "Poi {label}: {site} è a {best}, tu a {own}.",
      moveDefend: "Difendi {label}: il tuo vantaggio su {site} è solo di {margin}.",
      moveWatch: "Tieni d’occhio {site}: è in testa su {n} indicatori su {total}, più di chiunque altro qui.",
      and: " e ", radarTitle: "Le sei aree", radarCaption: "Una forma per sito; più è lontana dal centro, meglio è.",
      heatTitle: "Area per area", averageCol: "Media", gapCol: "La tua distanza dal migliore", bestYou: "Migliore",
      kpiTitle: "Velocità, peso e altri indicatori", bestMark: "migliore",
      note: "Deriva da revisioni automatiche delle pagine pubbliche alle date indicate: un punto di partenza per decidere, non un verdetto.",
      pts_one: "{n} punto", pts_other: "{n} punti"
    }
  };

  const code = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  const book = COPY[code] || COPY.en;
  // The asker's site keeps the report's own colour; competitors take the rest in column order.
  const COLORS = ["var(--own)", "var(--rival)", "#e11d48", "#ea580c", "#2563eb", "#a16207"];
  // Lines that describe a site's size rather than something to fix.
  const SIZE = new Set(["pagesFound", "languages"]);

  function template(key, vars) {
    const plural = vars && typeof vars.n === "number" && book[key + "_one"] ? key + (vars.n === 1 ? "_one" : "_other") : key;
    return String(book[plural] != null ? book[plural] : COPY.en[plural]);
  }

  function t(key, vars) {
    return template(key, vars).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }

  // vars hold markup already escaped, so a site or a label can be set in bold inside the sentence.
  function th(key, vars) {
    return esc(template(key, vars)).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }

  const cc = () => window.QAReviewCompareCopy;
  const S = () => window.QAReviewSections;
  const color = (index) => COLORS[index % COLORS.length];
  const short = (host) => String(host || "").replace(/^www\./, "");
  const strong = (text, index) => '<b class="bench-site" style="--site:' + color(index) + '" translate="no">' + esc(text) + "</b>";
  const mean = (list) => (list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null);

  function label(row) {
    const copy = cc();
    if (row.area) return copy ? copy.area(row.area) : row.area;
    if (row.key === "overall") return copy ? copy.t("overall") : row.label;
    return copy ? copy.kpi({ key: row.key, label: row.label }) : row.label;
  }

  function fmt(row, value) {
    if (value == null) return "–";
    if (row.unit === "bytes") return value >= 1e6 ? (value / 1e6).toFixed(1) + " MB" : Math.round(value / 1e3) + " KB";
    if (row.unit === "ms") return value >= 1000 ? (value / 1000).toFixed(1) + " s" : Math.round(value) + " ms";
    if (row.unit === "%") return Math.round(value) + "%";
    if (row.key === "cls") return value.toFixed(2);
    return Math.round(value).toLocaleString(code);
  }

  // A difference between two values of a line, in the line's own unit (points for scores).
  function gapText(row, diff) {
    const n = Math.abs(diff);
    if (row.kind === "score") return t("pts", { n: Math.round(n) });
    return fmt(row, n);
  }

  // How far value is from best, from 0 (level) to 1, so lines in different units can be ranked.
  function distance(row, best, value) {
    if (best == null || value == null) return 0;
    let d;
    if (row.kind === "score") d = Math.abs(best - value) / 100;
    else if (row.better === "low") d = value > 0 ? (value - best) / value : 0;
    else d = best > 0 ? (best - value) / best : 0;
    return Math.max(0, Math.min(1, d));
  }

  // Where the first column (the asker's site) stands against the rest, line by line.
  function analyse(data) {
    const cols = data.columns || [];
    const rows = (data.summary && data.summary.rows) || [];
    const overall = rows.find((row) => row.key === "overall");
    const scores = cols.map((col, index) => (overall ? overall.values[index] : null));
    const ranked = scores.map((score, index) => ({ index, score })).filter((item) => item.score != null).sort((a, b) => b.score - a.score);
    const rankOf = (index) => (scores[index] == null ? 0 : 1 + ranked.filter((item) => item.score > scores[index]).length);
    const lines = rows.filter((row) => row.key !== "overall").map((row) => {
      const own = row.values[0];
      const rivals = row.values.map((value, index) => ({ value, index })).filter((item) => item.index !== 0 && item.value != null);
      if (own == null || !rivals.length) return null;
      const ahead = (a, b) => (row.better === "low" ? a < b : a > b);
      const runner = rivals.reduce((top, item) => (!top || ahead(item.value, top.value) ? item : top), null);
      const best = ahead(own, runner.value) ? own : runner.value;
      const lead = row.leads.length === 1 && row.leads[0] === 0;
      return {
        row, own, best, runner, lead,
        average: mean(row.values.filter((value) => value != null)),
        gap: distance(row, best, own),
        margin: lead ? distance(row, own, runner.value) : 0
      };
    }).filter(Boolean);
    const total = rows.filter((row) => row.key !== "overall").length;
    const wins = (data.summary && data.summary.wins) || [];
    return {
      cols, rows, overall, scores, ranked, rankOf, lines, total, wins,
      average: mean(ranked.map((item) => item.score)),
      leads: lines.filter((line) => line.lead),
      trails: lines.filter((line) => !line.lead && line.gap >= 0.1 && !SIZE.has(line.row.key)).sort((a, b) => b.gap - a.gap)
    };
  }

  function ring(score, index, host) {
    const circumference = 2 * Math.PI * 44;
    const value = score == null ? 0 : score;
    const shown = score == null ? "–" : score;
    const copy = cc();
    const aria = copy ? copy.t("ring", { site: host, n: shown }) : host + " " + shown;
    return '<svg class="bench-ring" viewBox="0 0 100 100" role="img" aria-label="' + esc(aria) + '"><circle class="ring-track" cx="50" cy="50" r="44"></circle>' +
      '<circle class="ring-value" cx="50" cy="50" r="44" stroke="' + (score == null ? "var(--line)" : S().scoreColor(value)) + '" stroke-dasharray="' + circumference.toFixed(1) +
      '" stroke-dashoffset="' + (circumference * (1 - value / 100)).toFixed(1) + '"></circle></svg>' +
      '<b class="bench-score">' + shown + (score == null ? "" : "<small>" + esc(copy ? copy.t("grade", { g: S().gradeOf(value) }) : S().gradeOf(value)) + "</small>") + "</b>";
  }

  function rankHtml(a) {
    const own = a.scores[0];
    const order = a.ranked.concat(a.cols.map((col, index) => ({ index, score: null })).filter((item) => a.scores[item.index] == null));
    const cards = order.map(({ index, score }) => {
      const col = a.cols[index];
      const diff = score != null && own != null ? score - own : null;
      const tag = index === 0 ? t("you") : diff == null ? "" : diff > 0 ? t("above", { n: gapText(a.overall, diff) }) : diff < 0 ? t("below", { n: gapText(a.overall, diff) }) : t("levelYou");
      return '<li class="bench-card' + (index === 0 ? " is-you" : "") + '" style="--site:' + color(index) + '">' +
        (score == null ? "" : '<span class="bench-rank">' + esc(t("rank", { n: a.rankOf(index) })) + "</span>") +
        '<div class="bench-dial">' + ring(score, index, col.host) + "</div>" +
        '<p class="bench-host" translate="no">' + esc(short(col.host)).replace(/\./g, ".<wbr>") + "</p>" +
        '<p class="bench-tag' + (diff > 0 ? " is-above" : diff < 0 ? " is-below" : "") + '">' + esc(tag) + "</p>" +
        '<p class="bench-wins">' + (a.wins[index] ? esc(t("leads", { n: a.wins[index] })) : "&nbsp;") + "</p></li>";
    }).join("");
    return '<ol class="bench-podium" style="--n:' + order.length + '">' + cards + "</ol>" +
      '<p class="bench-headline">' + positionHtml(a) + "</p>";
  }

  function positionHtml(a) {
    const own = a.scores[0];
    const host = short(a.cols[0] && a.cols[0].host);
    if (own == null || a.ranked.length < 2) return th("unscored", { site: strong(host, 0) });
    const rank = a.rankOf(0);
    const others = a.ranked.filter((item) => item.index !== 0);
    let text;
    if (rank === 1) {
      const next = others[0];
      text = next.score === own
        ? th("firstTie", { site: strong(host, 0), total: a.ranked.length, next: strong(short(a.cols[next.index].host), next.index) })
        : th("first", { site: strong(host, 0), total: a.ranked.length, gap: esc(gapText(a.overall, own - next.score)), next: strong(short(a.cols[next.index].host), next.index) });
    } else {
      const leader = a.ranked[0];
      text = th("behind", { site: strong(host, 0), rank, total: a.ranked.length, gap: esc(gapText(a.overall, leader.score - own)), leader: strong(short(a.cols[leader.index].host), leader.index) });
    }
    const diff = Math.round(own - a.average);
    return text + " " + esc(diff > 0 ? t("avgAbove", { n: gapText(a.overall, diff) }) : diff < 0 ? t("avgBelow", { n: gapText(a.overall, diff) }) : t("avgLevel"));
  }

  function movesHtml(a) {
    const moves = [];
    const own = a.scores[0];
    const site = (index) => strong(short(a.cols[index].host), index);
    if (own != null && a.ranked.length > 1) {
      const above = a.ranked.filter((item) => item.index !== 0 && item.score > own);
      if (above.length) {
        const next = above[above.length - 1];
        const areas = a.rows.filter((row) => row.area && row.values[0] != null && row.values[next.index] != null && row.values[next.index] > row.values[0])
          .sort((x, y) => (y.values[next.index] - y.values[0]) - (x.values[next.index] - x.values[0])).slice(0, 2);
        const gap = esc(gapText(a.overall, next.score - own));
        moves.push(areas.length
          ? th("moveOvertake", { site: site(next.index), gap, areas: areas.map((row) => "<b>" + esc(label(row)) + "</b>").join(esc(t("and"))) })
          : th("moveOvertakeFlat", { site: site(next.index), gap }));
      } else {
        const runner = a.ranked.find((item) => item.index !== 0);
        if (runner && runner.score < own) moves.push(th("moveHold", { site: site(runner.index), gap: esc(gapText(a.overall, own - runner.score)) }));
      }
    }
    const fix = a.trails[0];
    if (fix) moves.push(th("moveFix", { label: "<b>" + esc(label(fix.row)) + "</b>", site: site(fix.runner.index), best: esc(fmt(fix.row, fix.best)), own: esc(fmt(fix.row, fix.own)) }));
    const narrow = a.leads.filter((line) => !SIZE.has(line.row.key) && (line.row.kind === "score" ? line.margin <= 0.05 : line.margin <= 0.1)).sort((x, y) => x.margin - y.margin)[0];
    if (narrow) moves.push(th("moveDefend", { label: "<b>" + esc(label(narrow.row)) + "</b>", site: site(narrow.runner.index), margin: esc(gapText(narrow.row, narrow.own - narrow.runner.value)) }));
    let watch = -1;
    a.wins.forEach((n, index) => { if (index && n > 0 && n > (a.wins[0] || 0) && (watch === -1 || n > a.wins[watch])) watch = index; });
    if (watch > 0) moves.push(th("moveWatch", { site: site(watch), n: a.wins[watch], total: a.total }));
    const then = a.trails[1];
    if (then && moves.length < 4) moves.push(th("moveThen", { label: "<b>" + esc(label(then.row)) + "</b>", site: site(then.runner.index), best: esc(fmt(then.row, then.best)), own: esc(fmt(then.row, then.own)) }));
    return moves;
  }

  function readingHtml(a) {
    const site = (index) => strong(short(a.cols[index].host), index);
    const leads = a.leads.length
      ? "<ul>" + a.leads.map((line) => '<li><b>' + esc(label(line.row)) + "</b><span>" + th("leadLine", { own: esc(fmt(line.row, line.own)), next: esc(fmt(line.row, line.runner.value)), site: site(line.runner.index) }) + "</span></li>").join("") + "</ul>"
      : '<p class="muted">' + esc(t("leadNone")) + "</p>";
    const trails = a.trails.length
      ? "<ul>" + a.trails.slice(0, 6).map((line) => '<li><b>' + esc(label(line.row)) + '</b><span>' + th("trailLine", { own: esc(fmt(line.row, line.own)), best: esc(fmt(line.row, line.best)), site: site(line.runner.index), avg: esc(fmt(line.row, line.average)) }) +
        '</span><i class="bench-gap" style="--gap:' + Math.round(line.gap * 100) + '%"></i></li>').join("") + "</ul>"
      : '<p class="muted">' + esc(t("trailNone")) + "</p>";
    const moves = movesHtml(a);
    return '<div class="bench-reading">' +
      '<article class="bench-box is-lead"><h4>' + esc(t("leadTitle")) + "</h4>" + leads + "</article>" +
      '<article class="bench-box is-trail"><h4>' + esc(t("trailTitle")) + "</h4>" + trails + "</article>" +
      '<article class="bench-box is-moves"><h4>' + esc(t("movesTitle")) + "</h4>" + (moves.length ? "<ol>" + moves.map((move) => "<li>" + move + "</li>").join("") + "</ol>" : '<p class="muted">' + esc(t("trailNone")) + "</p>") + "</article></div>";
  }

  function radarHtml(a) {
    const areas = a.rows.filter((row) => row.area);
    if (areas.length < 3) return "";
    const mid = 150, radius = 105;
    const point = (index, value) => {
      const angle = (-90 + index * 360 / areas.length) * Math.PI / 180;
      return [mid + Math.cos(angle) * radius * value / 100, mid + Math.sin(angle) * radius * value / 100];
    };
    const pts = (fn) => areas.map((row, index) => point(index, fn(row)).map((n) => n.toFixed(1)).join(",")).join(" ");
    const grid = [25, 50, 75, 100].map((level) => '<polygon class="bench-grid" points="' + pts(() => level) + '"></polygon>').join("") +
      areas.map((row, index) => { const [x, y] = point(index, 100); return '<line class="bench-grid" x1="' + mid + '" y1="' + mid + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"></line>'; }).join("");
    const labels = areas.map((row, index) => {
      const [x, y] = point(index, 122);
      return '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (Math.abs(x - mid) < 8 ? "middle" : x > mid ? "start" : "end") + '">' + esc(label(row)) + "</text>";
    }).join("");
    const order = a.cols.map((col, index) => index).filter((index) => areas.some((row) => row.values[index] != null)).reverse();
    const shapes = order.map((index) => '<g class="bench-shape' + (index === 0 ? " is-you" : "") + '" style="--site:' + color(index) + '"><polygon points="' + pts((row) => row.values[index] || 0) + '"></polygon>' +
      areas.map((row, i) => { const [x, y] = point(i, row.values[index] || 0); return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6"></circle>'; }).join("") + "</g>").join("");
    const aria = areas.map((row) => label(row) + ": " + a.cols.map((col, index) => short(col.host) + " " + (row.values[index] == null ? "–" : row.values[index])).join(", ")).join("; ");
    return '<figure class="bench-fig bench-radar-fig"><h4>' + esc(t("radarTitle")) + '</h4><svg class="bench-radar" viewBox="-70 -12 440 324" role="img" aria-label="' + esc(aria) + '">' + grid + shapes + labels + "</svg>" +
      '<figcaption><span class="bench-legend">' + a.cols.map((col, index) => '<span style="--site:' + color(index) + '"><i></i>' + esc(short(col.host)) + "</span>").join("") + "</span>" + esc(t("radarCaption")) + "</figcaption></figure>";
  }

  function heatHtml(a) {
    const rows = a.rows.filter((row) => row.kind === "score");
    const head = "<tr><th scope=\"col\"></th>" + a.cols.map((col, index) => '<th scope="col" style="--site:' + color(index) + '" translate="no"><i></i>' + esc(short(col.host)).replace(/\./g, ".<wbr>") + "</th>").join("") +
      '<th scope="col" class="bench-extra">' + esc(t("averageCol")) + '</th><th scope="col" class="bench-extra">' + esc(t("gapCol")) + "</th></tr>";
    const body = rows.map((row) => {
      const known = row.values.filter((value) => value != null);
      const best = known.length ? Math.max(...known) : null;
      const own = row.values[0];
      const gap = own == null || best == null ? "–" : best === own ? "✓ " + t("bestYou") : "−" + Math.round(best - own);
      return "<tr" + (row.key === "overall" ? ' class="is-overall"' : "") + '><th scope="row">' + esc(label(row)) + "</th>" + row.values.map((value, index) =>
        '<td class="' + (index === 0 ? "is-you " : "") + (row.leads.indexOf(index) !== -1 ? "lead" : "") + '"' + (value == null ? "" : ' style="--heat:' + S().scoreColor(value) + '"') + ">" + (value == null ? "–" : "<b>" + value + "</b>") + "</td>").join("") +
        '<td class="bench-extra">' + (known.length ? Math.round(mean(known)) : "–") + '</td><td class="bench-extra' + (best === own ? " is-best" : "") + '">' + esc(gap) + "</td></tr>";
    }).join("");
    return '<figure class="bench-fig bench-heat-fig"><h4>' + esc(t("heatTitle")) + '</h4><div class="multi-scroll"><table class="bench-heat">' + "<thead>" + head + "</thead><tbody>" + body + "</tbody></table></div></figure>";
  }

  function kpisHtml(a) {
    const copy = cc();
    const rows = a.rows.filter((row) => row.kind === "kpi" && row.values.filter((value) => value != null).length > 1);
    if (!rows.length) return "";
    const cards = rows.map((row) => {
      const known = row.values.filter((value) => value != null);
      const top = Math.max(...known) || 1;
      const avg = mean(known);
      const bars = row.values.map((value, index) => {
        const best = row.leads.indexOf(index) !== -1;
        return '<div class="bench-bar' + (index === 0 ? " is-you" : "") + (best ? " is-best" : "") + '" style="--site:' + color(index) + '"><span translate="no">' + esc(short(a.cols[index].host)) + "</span>" +
          '<span class="bench-track"><i style="width:' + (value == null ? 0 : Math.max(2, value / top * 100)).toFixed(1) + '%"></i></span><b>' + esc(fmt(row, value)) + (best ? ' <small>' + esc(t("bestMark")) + "</small>" : "") + "</b></div>";
      }).join("");
      return '<figure class="bench-kpi"><figcaption><b>' + esc(label(row)) + "</b>" + (copy ? "<small>" + esc(copy.t(row.better === "low" ? "lower" : "higher")) + "</small>" : "") + "</figcaption>" +
        '<div class="bench-bars" style="--avg:' + (avg / top * 100).toFixed(1) + '%">' + bars + "</div></figure>";
    }).join("");
    return '<section class="bench-sec bench-kpis"><h3>' + esc(t("kpiTitle")) + '</h3><div class="bench-kpi-grid">' + cards + "</div></section>";
  }

  // The whole block, or "" when the comparison has fewer than two sites with scores.
  function html(data) {
    if (!data || !data.columns || data.columns.length < 2 || !data.summary) return "";
    const a = analyse(data);
    return '<section class="bench" translate="no">' +
      '<section class="bench-sec bench-top"><h2>' + esc(t("title")) + "</h2><h3>" + esc(t("rankTitle")) + "</h3>" + rankHtml(a) +
      (a.average == null ? "" : '<p class="meta-line">' + esc(t("average", { n: Math.round(a.average) })) + "</p>") + "</section>" +
      '<section class="bench-sec bench-why"><h3>' + esc(t("readingTitle")) + "</h3>" + readingHtml(a) + "</section>" +
      '<section class="bench-sec bench-areas">' + radarHtml(a) + heatHtml(a) + "</section>" +
      kpisHtml(a) +
      '<p class="meta-line bench-note">' + esc(t("note")) + "</p></section>";
  }

  window.QAReviewBenchmark = { html, analyse, t };
})();
