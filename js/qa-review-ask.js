/**
 * Ask the report: answers built from one paid report's own evidence, and nothing else.
 * It explains a finding or case, writes its fix for the stack the review saw, writes the
 * Playwright case for a case id, and drafts the GitHub or Jira issue for it.
 */
(function (root) {
  "use strict";

  const Scripts = typeof module === "object" && module.exports ? require("./qa-review-scripts.js") : root.QAReviewScripts;
  // The issue Markdown and the Jira CSV are file contents: they stay in English, like the CSV column names Jira maps.
  const T = {
    en: {
      open: "Ask the report", title: "Answers from this report only", close: "Close", send: "Ask",
      note: "It explains a finding from its evidence, writes the fix for the stack this review saw, writes the Playwright case for a case id, and drafts a GitHub or Jira issue. It answers nothing the report does not hold.",
      inputLabel: "Question about this report", placeholder: "Why is F-01 rated this way?", repo: "GitHub repository for issues",
      copy: "Copy", copied: "Copied", copyFailed: "Copy failed",
      github: "Open a GitHub issue", jiraMd: "Copy for Jira (Markdown)", jiraCsv: "Copy Jira CSV row",
      signIn: "Sign in with the account that ran this report to ask it.", signInButton: "Sign in",
      expired: "Your sign-in has expired. Sign in again with the account that ran this report.",
      notOwner: "Only the account that ran this report can ask it.",
      notPaid: "Ask the report opens once this report is paid.",
      notFound: "That report was not found.",
      failed: "Ask the report did not open. Try again in a moment.",
      intro: "Ask about any finding or case by its id, or tap a question below. {scope}",
      repoFirst: "Type the GitHub repository as owner/name first, then press the button again.",
      scope: "I answer only from this report: why a finding or case is rated the way it is, its fix for the stack this review saw, the Playwright case for a case id, and a GitHub or Jira issue for a finding or case.",
      outsideTitle: "Outside this report", outside: "{scope} This question is outside that, so it stays unanswered here.",
      closedTitle: "Not open", closed: "Ask the report works on a paid report only.",
      missingTitle: "Not in this report", missing: "This report has no {id}.", missingRange: "Its findings run from {first} to {last}.", missingCases: "Its cases include {list}.",
      whichTitle: "Which one?", which: "Name the finding or case by its id, such as F-01 or SEC-02.", whichFirst: "The first ones on this report:",
      askRated: "Why is {id} rated {severity}?", askWhy: "Why is {id} rated this way?", askFixOn: "Show me the fix for {id} on {host}", askFix: "Show me the fix for {id}",
      askCard: "Ask about this", askPlaywright: "Write the Playwright case for {id}", askExport: "Export {id} as a GitHub or Jira issue",
      verdict: { fail: "Fails now", risk: "At risk", person: "Needs a person", pass: "Passes", proposed: "Proposed, not checked yet" },
      severity: { critical: "critical", high: "high", medium: "medium", low: "low", info: "info" },
      effort: { minutes: "minutes", hours: "hours", days: "days", none: "not estimated" },
      rated: "{verdict}, rated {severity} in {area}.",
      notHigh: "Its severity is {severity}, not high. Its place near the top comes from the priority below.",
      saw: "What the review saw: {evidence}",
      ranks: "It ranks {rank} of {total} fails and risks, with priority {priority}.",
      priorityWhy: "Priority grows with the severity ({severity}), counts a failure in full and a risk at 60 percent (this one {state}), grows with reach ({reach}), and shrinks with the effort to fix ({effort}).",
      stateFail: "fails", stateRisk: "is a risk", pageOne: "{n} page", pageMany: "{n} pages",
      passNotRanked: "It passes, so it is not ranked.",
      personNotRanked: "A machine read cannot settle it, so it is not ranked. A person checks it in a browser.",
      pages: "Pages: {list}.", pagesMore: "Pages: {list} and {n} more.", testCases: "Test cases: {list}.", fix: "Fix: {fix}",
      caseIs: "{id} is a {layer} case. {state}.", caseRated: "{verdict}, rated {severity}",
      casePriority: "Priority {priority}, risk {risk} of 100. Risk grows with the severity of what failed (or the weight of the {layer} layer when nothing failed), with the verdict, with how many pages the case covers, and with whether a finding or selector backs it. P1 starts at 45, P2 at 22, P3 at 9.",
      caseWhy: "Why it is proposed: {why}", backedBy: "It is backed by {id}, {title}: {evidence}",
      servedFrom: "This review saw the site served from {host}.",
      hostUnknown: "This review could not tell the host, so the common server files are shown.",
      tech: "Technologies seen: {list}.", techMore: "Technologies seen: {list} and {n} more.",
      ghPagesProxied: "GitHub Pages cannot send custom headers, but this review also saw Cloudflare in front of the site. Add the header there with a Response Header Transform Rule, using the name and value below. A _headers file only works on Cloudflare Pages or Netlify.",
      ghPages: "GitHub Pages cannot send custom headers. Put a CDN such as Cloudflare in front and set the header there, or move to a host that sends headers. The _headers file below works on Cloudflare Pages and Netlify.",
      noFinding: "{id} has no scored finding behind it, so this report holds no fix for it. What the case would check: {why}",
      caseBacked: "{id} is backed by {fid}, {title}.", passes: "{id} passes. There is nothing to fix.",
      noFile: "The report has no copy-ready file for this one. The fix above is what it holds.",
      noFix: "The report holds no fix for this one, only the evidence: {evidence}",
      libEnded: "{name} {version}: this release line gets no more fixes, move to a supported major version.",
      libUpgrade: "{name} {version}: upgrade to {fixed} or later.", dns: "DNS records",
      pwNoCase: "{id} has no test case with a Playwright script in this report.",
      pwFinding: "{id} is a finding. Its test case is {case}.",
      pwOther: "{id} is written for {list}, not Playwright.", noFramework: "no framework",
      pwSave: "Save it as tests/{name} and run npx playwright test.",
      pwFixme: "The report leaves this case to a person, so the test is marked fixme and keeps the case's own wording as comments.",
      fixTitle: "Fix for {ref}", pwTitle: "Playwright case for {id}", issueTitle: "Issue for {ref}",
      exportLink: "The GitHub button opens a new issue in {repo}, filled in. Nothing is sent until you submit it there.",
      exportNoRepo: "Add the GitHub repository as owner/name below the box to open a filled-in issue there. The Markdown below pastes into GitHub or Jira, and the CSV imports into Jira."
    },
    es: {
      open: "Preguntar al informe", title: "Respuestas solo de este informe", close: "Cerrar", send: "Preguntar",
      note: "Explica un hallazgo a partir de su evidencia, escribe la corrección para la tecnología que vio esta revisión, escribe el caso de Playwright de un id de caso y redacta un issue de GitHub o Jira. No responde nada que el informe no contenga.",
      inputLabel: "Pregunta sobre este informe", placeholder: "¿Por qué F-01 tiene esta calificación?", repo: "Repositorio de GitHub para los issues",
      copy: "Copiar", copied: "Copiado", copyFailed: "No se pudo copiar",
      github: "Abrir un issue en GitHub", jiraMd: "Copiar para Jira (Markdown)", jiraCsv: "Copiar fila CSV de Jira",
      signIn: "Inicia sesión con la cuenta que ejecutó este informe para preguntarle.", signInButton: "Iniciar sesión",
      expired: "Tu sesión expiró. Vuelve a iniciar sesión con la cuenta que ejecutó este informe.",
      notOwner: "Solo la cuenta que ejecutó este informe puede preguntarle.",
      notPaid: "Preguntar al informe se abre cuando este informe está pagado.",
      notFound: "No se encontró ese informe.",
      failed: "Preguntar al informe no se abrió. Inténtalo de nuevo en un momento.",
      intro: "Pregunta por cualquier hallazgo o caso con su id, o toca una pregunta de abajo. {scope}",
      repoFirst: "Escribe primero el repositorio de GitHub como dueño/nombre y vuelve a pulsar el botón.",
      scope: "Solo respondo a partir de este informe: por qué un hallazgo o un caso tiene su calificación, su corrección para la tecnología que vio esta revisión, el caso de Playwright de un id de caso y un issue de GitHub o Jira para un hallazgo o un caso.",
      outsideTitle: "Fuera de este informe", outside: "{scope} Esta pregunta queda fuera de eso, así que aquí no tiene respuesta.",
      closedTitle: "No disponible", closed: "Preguntar al informe solo funciona con un informe pagado.",
      missingTitle: "No está en este informe", missing: "Este informe no tiene {id}.", missingRange: "Sus hallazgos van de {first} a {last}.", missingCases: "Entre sus casos están {list}.",
      whichTitle: "¿Cuál?", which: "Indica el hallazgo o el caso por su id, por ejemplo F-01 o SEC-02.", whichFirst: "Los primeros de este informe:",
      askRated: "¿Por qué {id} tiene severidad {severity}?", askWhy: "¿Por qué {id} tiene esta calificación?", askFixOn: "Muéstrame la corrección de {id} en {host}", askFix: "Muéstrame la corrección de {id}",
      askCard: "Preguntar sobre esto", askPlaywright: "Escribe el caso de Playwright para {id}", askExport: "Exporta {id} como issue de GitHub o Jira",
      verdict: { fail: "Falla ahora", risk: "En riesgo", person: "Requiere una persona", pass: "Pasa", proposed: "Propuesto, aún sin comprobar" },
      severity: { critical: "crítica", high: "alta", medium: "media", low: "baja", info: "informativa" },
      effort: { minutes: "minutos", hours: "horas", days: "días", none: "sin estimar" },
      rated: "{verdict}, con severidad {severity} en {area}.",
      notHigh: "Su severidad es {severity}, no alta. Su lugar cerca del principio viene de la prioridad de abajo.",
      saw: "Lo que vio la revisión: {evidence}",
      ranks: "Ocupa el puesto {rank} de {total} fallos y riesgos, con prioridad {priority}.",
      priorityWhy: "La prioridad crece con la severidad ({severity}), cuenta un fallo completo y un riesgo al 60 por ciento (este {state}), crece con el alcance ({reach}) y baja con el esfuerzo de corregirlo ({effort}).",
      stateFail: "falla", stateRisk: "es un riesgo", pageOne: "{n} página", pageMany: "{n} páginas",
      passNotRanked: "Pasa, así que no tiene puesto.",
      personNotRanked: "Una lectura automática no puede resolverlo, así que no tiene puesto. Una persona lo comprueba en un navegador.",
      pages: "Páginas: {list}.", pagesMore: "Páginas: {list} y {n} más.", testCases: "Casos de prueba: {list}.", fix: "Corrección: {fix}",
      caseIs: "{id} es un caso de {layer}. {state}.", caseRated: "{verdict}, con severidad {severity}",
      casePriority: "Prioridad {priority}, riesgo {risk} de 100. El riesgo crece con la severidad de lo que falló (o con el peso de la capa {layer} cuando nada falló), con el veredicto, con cuántas páginas cubre el caso y con si lo respalda un hallazgo o un selector. P1 empieza en 45, P2 en 22 y P3 en 9.",
      caseWhy: "Por qué se propone: {why}", backedBy: "Lo respalda {id}, {title}: {evidence}",
      servedFrom: "Esta revisión vio el sitio servido desde {host}.",
      hostUnknown: "Esta revisión no pudo identificar el hosting, así que se muestran los archivos de servidor más comunes.",
      tech: "Tecnologías vistas: {list}.", techMore: "Tecnologías vistas: {list} y {n} más.",
      ghPagesProxied: "GitHub Pages no puede enviar encabezados propios, pero esta revisión también vio Cloudflare delante del sitio. Agrega allí el encabezado con una Response Header Transform Rule, con el nombre y el valor de abajo. Un archivo _headers solo funciona en Cloudflare Pages o Netlify.",
      ghPages: "GitHub Pages no puede enviar encabezados propios. Pon delante una CDN como Cloudflare y configura allí el encabezado, o cambia a un hosting que envíe encabezados. El archivo _headers de abajo funciona en Cloudflare Pages y Netlify.",
      noFinding: "{id} no tiene un hallazgo puntuado detrás, así que este informe no contiene una corrección. Lo que comprobaría el caso: {why}",
      caseBacked: "A {id} lo respalda {fid}, {title}.", passes: "{id} pasa. No hay nada que corregir.",
      noFile: "El informe no tiene un archivo listo para copiar para este. La corrección de arriba es lo que contiene.",
      noFix: "El informe no contiene una corrección para este, solo la evidencia: {evidence}",
      libEnded: "{name} {version}: esta línea de versiones ya no recibe correcciones; pasa a una versión mayor con soporte.",
      libUpgrade: "{name} {version}: actualiza a {fixed} o posterior.", dns: "Registros DNS",
      pwNoCase: "{id} no tiene en este informe un caso de prueba con script de Playwright.",
      pwFinding: "{id} es un hallazgo. Su caso de prueba es {case}.",
      pwOther: "{id} está escrito para {list}, no para Playwright.", noFramework: "ningún framework",
      pwSave: "Guárdalo como tests/{name} y ejecuta npx playwright test.",
      pwFixme: "El informe deja este caso a una persona, así que la prueba está marcada como fixme y conserva como comentarios el texto del propio caso.",
      fixTitle: "Corrección de {ref}", pwTitle: "Caso de Playwright para {id}", issueTitle: "Issue para {ref}",
      exportLink: "El botón de GitHub abre un issue nuevo en {repo}, ya completado. No se envía nada hasta que lo envíes allí.",
      exportNoRepo: "Agrega el repositorio de GitHub como dueño/nombre debajo del cuadro para abrir allí un issue completado. El Markdown de abajo se pega en GitHub o Jira, y el CSV se importa en Jira."
    },
    pt: {
      open: "Perguntar ao relatório", title: "Respostas só deste relatório", close: "Fechar", send: "Perguntar",
      note: "Explica um achado a partir da evidência, escreve a correção para a tecnologia que esta revisão viu, escreve o caso de Playwright de um id de caso e redige uma issue do GitHub ou do Jira. Não responde nada que o relatório não contenha.",
      inputLabel: "Pergunta sobre este relatório", placeholder: "Por que F-01 tem esta classificação?", repo: "Repositório do GitHub para as issues",
      copy: "Copiar", copied: "Copiado", copyFailed: "Não foi possível copiar",
      github: "Abrir uma issue no GitHub", jiraMd: "Copiar para o Jira (Markdown)", jiraCsv: "Copiar linha CSV do Jira",
      signIn: "Entre com a conta que executou este relatório para perguntar a ele.", signInButton: "Entrar",
      expired: "Sua sessão expirou. Entre de novo com a conta que executou este relatório.",
      notOwner: "Só a conta que executou este relatório pode perguntar a ele.",
      notPaid: "Perguntar ao relatório abre quando este relatório estiver pago.",
      notFound: "Esse relatório não foi encontrado.",
      failed: "Perguntar ao relatório não abriu. Tente de novo em um instante.",
      intro: "Pergunte sobre qualquer achado ou caso pelo id, ou toque em uma pergunta abaixo. {scope}",
      repoFirst: "Digite primeiro o repositório do GitHub como dono/nome e pressione o botão de novo.",
      scope: "Respondo só a partir deste relatório: por que um achado ou caso tem a sua classificação, a correção para a tecnologia que esta revisão viu, o caso de Playwright de um id de caso e uma issue do GitHub ou do Jira para um achado ou caso.",
      outsideTitle: "Fora deste relatório", outside: "{scope} Esta pergunta fica fora disso, então não tem resposta aqui.",
      closedTitle: "Indisponível", closed: "Perguntar ao relatório só funciona com um relatório pago.",
      missingTitle: "Não está neste relatório", missing: "Este relatório não tem {id}.", missingRange: "Os achados vão de {first} a {last}.", missingCases: "Entre os casos estão {list}.",
      whichTitle: "Qual?", which: "Indique o achado ou caso pelo id, como F-01 ou SEC-02.", whichFirst: "Os primeiros deste relatório:",
      askRated: "Por que {id} tem severidade {severity}?", askWhy: "Por que {id} tem esta classificação?", askFixOn: "Mostre a correção de {id} em {host}", askFix: "Mostre a correção de {id}",
      askCard: "Perguntar sobre isto", askPlaywright: "Escreva o caso de Playwright para {id}", askExport: "Exporte {id} como issue do GitHub ou do Jira",
      verdict: { fail: "Falha agora", risk: "Em risco", person: "Precisa de uma pessoa", pass: "Passa", proposed: "Proposto, ainda não verificado" },
      severity: { critical: "crítica", high: "alta", medium: "média", low: "baixa", info: "informativa" },
      effort: { minutes: "minutos", hours: "horas", days: "dias", none: "sem estimativa" },
      rated: "{verdict}, com severidade {severity} em {area}.",
      notHigh: "A severidade é {severity}, não alta. A posição perto do topo vem da prioridade abaixo.",
      saw: "O que a revisão viu: {evidence}",
      ranks: "Está na posição {rank} de {total} falhas e riscos, com prioridade {priority}.",
      priorityWhy: "A prioridade cresce com a severidade ({severity}), conta uma falha por inteiro e um risco a 60 por cento (este {state}), cresce com o alcance ({reach}) e diminui com o esforço para corrigir ({effort}).",
      stateFail: "falha", stateRisk: "é um risco", pageOne: "{n} página", pageMany: "{n} páginas",
      passNotRanked: "Passa, então não tem posição.",
      personNotRanked: "Uma leitura automática não consegue decidir, então não tem posição. Uma pessoa verifica em um navegador.",
      pages: "Páginas: {list}.", pagesMore: "Páginas: {list} e mais {n}.", testCases: "Casos de teste: {list}.", fix: "Correção: {fix}",
      caseIs: "{id} é um caso de {layer}. {state}.", caseRated: "{verdict}, com severidade {severity}",
      casePriority: "Prioridade {priority}, risco {risk} de 100. O risco cresce com a severidade do que falhou (ou com o peso da camada {layer} quando nada falhou), com o veredito, com quantas páginas o caso cobre e com o apoio de um achado ou seletor. P1 começa em 45, P2 em 22 e P3 em 9.",
      caseWhy: "Por que é proposto: {why}", backedBy: "É apoiado por {id}, {title}: {evidence}",
      servedFrom: "Esta revisão viu o site servido por {host}.",
      hostUnknown: "Esta revisão não conseguiu identificar a hospedagem, então são mostrados os arquivos de servidor mais comuns.",
      tech: "Tecnologias vistas: {list}.", techMore: "Tecnologias vistas: {list} e mais {n}.",
      ghPagesProxied: "O GitHub Pages não envia cabeçalhos personalizados, mas esta revisão também viu o Cloudflare na frente do site. Adicione o cabeçalho lá com uma Response Header Transform Rule, usando o nome e o valor abaixo. Um arquivo _headers só funciona no Cloudflare Pages ou no Netlify.",
      ghPages: "O GitHub Pages não envia cabeçalhos personalizados. Coloque uma CDN como o Cloudflare na frente e defina o cabeçalho lá, ou mude para uma hospedagem que envie cabeçalhos. O arquivo _headers abaixo funciona no Cloudflare Pages e no Netlify.",
      noFinding: "{id} não tem um achado pontuado por trás, então este relatório não traz correção para ele. O que o caso verificaria: {why}",
      caseBacked: "{id} é apoiado por {fid}, {title}.", passes: "{id} passa. Não há nada para corrigir.",
      noFile: "O relatório não tem um arquivo pronto para copiar para este. A correção acima é o que ele traz.",
      noFix: "O relatório não traz correção para este, só a evidência: {evidence}",
      libEnded: "{name} {version}: esta linha de versões não recebe mais correções; passe para uma versão principal com suporte.",
      libUpgrade: "{name} {version}: atualize para {fixed} ou posterior.", dns: "Registros DNS",
      pwNoCase: "{id} não tem neste relatório um caso de teste com script de Playwright.",
      pwFinding: "{id} é um achado. O caso de teste dele é {case}.",
      pwOther: "{id} foi escrito para {list}, não para Playwright.", noFramework: "nenhum framework",
      pwSave: "Salve como tests/{name} e execute npx playwright test.",
      pwFixme: "O relatório deixa este caso para uma pessoa, então o teste está marcado como fixme e mantém o texto do próprio caso como comentários.",
      fixTitle: "Correção de {ref}", pwTitle: "Caso de Playwright para {id}", issueTitle: "Issue para {ref}",
      exportLink: "O botão do GitHub abre uma issue nova em {repo}, já preenchida. Nada é enviado até você enviá-la lá.",
      exportNoRepo: "Adicione o repositório do GitHub como dono/nome abaixo da caixa para abrir lá uma issue preenchida. O Markdown abaixo pode ser colado no GitHub ou no Jira, e o CSV pode ser importado no Jira."
    },
    de: {
      open: "Den Bericht fragen", title: "Antworten nur aus diesem Bericht", close: "Schließen", send: "Fragen",
      note: "Erklärt einen Befund aus seinen Belegen, schreibt die Korrektur für die Technik, die diese Prüfung gesehen hat, schreibt den Playwright-Fall zu einer Fall-ID und entwirft ein GitHub- oder Jira-Issue. Was nicht im Bericht steht, beantwortet es nicht.",
      inputLabel: "Frage zu diesem Bericht", placeholder: "Warum ist F-01 so eingestuft?", repo: "GitHub-Repository für Issues",
      copy: "Kopieren", copied: "Kopiert", copyFailed: "Kopieren fehlgeschlagen",
      github: "GitHub-Issue öffnen", jiraMd: "Für Jira kopieren (Markdown)", jiraCsv: "Jira-CSV-Zeile kopieren",
      signIn: "Melden Sie sich mit dem Konto an, das diesen Bericht ausgeführt hat, um ihn zu fragen.", signInButton: "Anmelden",
      expired: "Ihre Anmeldung ist abgelaufen. Melden Sie sich erneut mit dem Konto an, das diesen Bericht ausgeführt hat.",
      notOwner: "Nur das Konto, das diesen Bericht ausgeführt hat, kann ihn fragen.",
      notPaid: "„Den Bericht fragen“ öffnet sich, sobald dieser Bericht bezahlt ist.",
      notFound: "Dieser Bericht wurde nicht gefunden.",
      failed: "„Den Bericht fragen“ hat sich nicht geöffnet. Versuchen Sie es gleich noch einmal.",
      intro: "Fragen Sie nach einem Befund oder Fall über seine ID, oder tippen Sie unten auf eine Frage. {scope}",
      repoFirst: "Geben Sie zuerst das GitHub-Repository als Besitzer/Name ein und drücken Sie dann erneut auf die Schaltfläche.",
      scope: "Ich antworte nur aus diesem Bericht: warum ein Befund oder Fall so eingestuft ist, seine Korrektur für die Technik, die diese Prüfung gesehen hat, den Playwright-Fall zu einer Fall-ID und ein GitHub- oder Jira-Issue zu einem Befund oder Fall.",
      outsideTitle: "Außerhalb dieses Berichts", outside: "{scope} Diese Frage liegt außerhalb davon und bleibt hier unbeantwortet.",
      closedTitle: "Nicht verfügbar", closed: "„Den Bericht fragen“ funktioniert nur bei einem bezahlten Bericht.",
      missingTitle: "Nicht in diesem Bericht", missing: "Dieser Bericht hat kein {id}.", missingRange: "Seine Befunde reichen von {first} bis {last}.", missingCases: "Zu seinen Fällen gehören {list}.",
      whichTitle: "Welcher?", which: "Nennen Sie den Befund oder Fall mit seiner ID, etwa F-01 oder SEC-02.", whichFirst: "Die ersten in diesem Bericht:",
      askRated: "Warum ist {id} als {severity} eingestuft?", askWhy: "Warum ist {id} so eingestuft?", askFixOn: "Zeigen Sie mir die Korrektur für {id} auf {host}", askFix: "Zeigen Sie mir die Korrektur für {id}",
      askCard: "Dazu fragen", askPlaywright: "Schreiben Sie den Playwright-Fall für {id}", askExport: "Exportieren Sie {id} als GitHub- oder Jira-Issue",
      verdict: { fail: "Schlägt jetzt fehl", risk: "Gefährdet", person: "Braucht eine Person", pass: "Besteht", proposed: "Vorgeschlagen, noch nicht geprüft" },
      severity: { critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig", info: "informativ" },
      effort: { minutes: "Minuten", hours: "Stunden", days: "Tage", none: "nicht geschätzt" },
      rated: "{verdict}, Schweregrad {severity} im Bereich {area}.",
      notHigh: "Der Schweregrad ist {severity}, nicht hoch. Der Platz weit oben kommt von der Priorität unten.",
      saw: "Was die Prüfung gesehen hat: {evidence}",
      ranks: "Er steht auf Platz {rank} von {total} Fehlern und Risiken, mit Priorität {priority}.",
      priorityWhy: "Die Priorität steigt mit dem Schweregrad ({severity}), zählt einen Fehler voll und ein Risiko zu 60 Prozent (dieser {state}), steigt mit der Reichweite ({reach}) und sinkt mit dem Aufwand für die Korrektur ({effort}).",
      stateFail: "schlägt fehl", stateRisk: "ist ein Risiko", pageOne: "{n} Seite", pageMany: "{n} Seiten",
      passNotRanked: "Er besteht und hat deshalb keinen Platz.",
      personNotRanked: "Eine automatische Prüfung kann das nicht klären, deshalb hat er keinen Platz. Eine Person prüft ihn im Browser.",
      pages: "Seiten: {list}.", pagesMore: "Seiten: {list} und {n} weitere.", testCases: "Testfälle: {list}.", fix: "Korrektur: {fix}",
      caseIs: "{id} ist ein Fall der Ebene {layer}. {state}.", caseRated: "{verdict}, Schweregrad {severity}",
      casePriority: "Priorität {priority}, Risiko {risk} von 100. Das Risiko steigt mit dem Schweregrad dessen, was fehlschlug (oder mit dem Gewicht der Ebene {layer}, wenn nichts fehlschlug), mit dem Urteil, mit der Zahl der Seiten, die der Fall abdeckt, und damit, ob ein Befund oder Selektor ihn stützt. P1 beginnt bei 45, P2 bei 22, P3 bei 9.",
      caseWhy: "Warum er vorgeschlagen wird: {why}", backedBy: "Er wird von {id} gestützt, {title}: {evidence}",
      servedFrom: "Diese Prüfung hat gesehen, dass die Website über {host} ausgeliefert wird.",
      hostUnknown: "Diese Prüfung konnte den Hoster nicht erkennen, daher werden die gängigen Serverdateien gezeigt.",
      tech: "Gesehene Technologien: {list}.", techMore: "Gesehene Technologien: {list} und {n} weitere.",
      ghPagesProxied: "GitHub Pages kann keine eigenen Header senden, aber diese Prüfung hat auch Cloudflare vor der Website gesehen. Setzen Sie den Header dort mit einer Response Header Transform Rule, mit Namen und Wert unten. Eine _headers-Datei funktioniert nur auf Cloudflare Pages oder Netlify.",
      ghPages: "GitHub Pages kann keine eigenen Header senden. Schalten Sie ein CDN wie Cloudflare davor und setzen Sie den Header dort, oder wechseln Sie zu einem Hoster, der Header sendet. Die _headers-Datei unten funktioniert auf Cloudflare Pages und Netlify.",
      noFinding: "Hinter {id} steht kein bewerteter Befund, daher enthält dieser Bericht keine Korrektur dafür. Was der Fall prüfen würde: {why}",
      caseBacked: "{id} wird von {fid} gestützt, {title}.", passes: "{id} besteht. Es gibt nichts zu korrigieren.",
      noFile: "Der Bericht hat dafür keine kopierfertige Datei. Die Korrektur oben ist das, was er enthält.",
      noFix: "Der Bericht enthält dafür keine Korrektur, nur den Beleg: {evidence}",
      libEnded: "{name} {version}: Diese Versionslinie bekommt keine Korrekturen mehr; wechseln Sie zu einer unterstützten Hauptversion.",
      libUpgrade: "{name} {version}: Aktualisieren Sie auf {fixed} oder neuer.", dns: "DNS-Einträge",
      pwNoCase: "{id} hat in diesem Bericht keinen Testfall mit Playwright-Skript.",
      pwFinding: "{id} ist ein Befund. Sein Testfall ist {case}.",
      pwOther: "{id} ist für {list} geschrieben, nicht für Playwright.", noFramework: "kein Framework",
      pwSave: "Speichern Sie ihn als tests/{name} und führen Sie npx playwright test aus.",
      pwFixme: "Der Bericht überlässt diesen Fall einer Person, daher ist der Test als fixme markiert und behält den Wortlaut des Falls als Kommentare.",
      fixTitle: "Korrektur für {ref}", pwTitle: "Playwright-Fall für {id}", issueTitle: "Issue für {ref}",
      exportLink: "Die GitHub-Schaltfläche öffnet ein ausgefülltes neues Issue in {repo}. Gesendet wird erst, wenn Sie es dort absenden.",
      exportNoRepo: "Tragen Sie unter dem Feld das GitHub-Repository als Besitzer/Name ein, um dort ein ausgefülltes Issue zu öffnen. Das Markdown unten lässt sich in GitHub oder Jira einfügen, die CSV in Jira importieren."
    },
    fr: {
      open: "Interroger le rapport", title: "Réponses tirées de ce rapport uniquement", close: "Fermer", send: "Demander",
      note: "Il explique un constat à partir de ses preuves, écrit la correction pour la technologie que cette analyse a vue, écrit le cas Playwright d’un identifiant de cas et rédige un ticket GitHub ou Jira. Il ne répond à rien que le rapport ne contienne pas.",
      inputLabel: "Question sur ce rapport", placeholder: "Pourquoi F-01 est-il classé ainsi ?", repo: "Dépôt GitHub pour les tickets",
      copy: "Copier", copied: "Copié", copyFailed: "Échec de la copie",
      github: "Ouvrir un ticket GitHub", jiraMd: "Copier pour Jira (Markdown)", jiraCsv: "Copier la ligne CSV Jira",
      signIn: "Connectez-vous avec le compte qui a lancé ce rapport pour l’interroger.", signInButton: "Se connecter",
      expired: "Votre connexion a expiré. Reconnectez-vous avec le compte qui a lancé ce rapport.",
      notOwner: "Seul le compte qui a lancé ce rapport peut l’interroger.",
      notPaid: "« Interroger le rapport » s’ouvre une fois ce rapport payé.",
      notFound: "Ce rapport est introuvable.",
      failed: "« Interroger le rapport » ne s’est pas ouvert. Réessayez dans un instant.",
      intro: "Posez une question sur un constat ou un cas avec son identifiant, ou touchez une question ci-dessous. {scope}",
      repoFirst: "Saisissez d’abord le dépôt GitHub sous la forme propriétaire/nom, puis appuyez de nouveau sur le bouton.",
      scope: "Je réponds uniquement à partir de ce rapport : pourquoi un constat ou un cas est classé ainsi, sa correction pour la technologie que cette analyse a vue, le cas Playwright d’un identifiant de cas, et un ticket GitHub ou Jira pour un constat ou un cas.",
      outsideTitle: "Hors de ce rapport", outside: "{scope} Cette question en sort, elle reste donc sans réponse ici.",
      closedTitle: "Indisponible", closed: "« Interroger le rapport » ne fonctionne que sur un rapport payé.",
      missingTitle: "Absent de ce rapport", missing: "Ce rapport n’a pas de {id}.", missingRange: "Ses constats vont de {first} à {last}.", missingCases: "Parmi ses cas : {list}.",
      whichTitle: "Lequel ?", which: "Nommez le constat ou le cas par son identifiant, par exemple F-01 ou SEC-02.", whichFirst: "Les premiers de ce rapport :",
      askRated: "Pourquoi {id} a-t-il une gravité {severity} ?", askWhy: "Pourquoi {id} est-il classé ainsi ?", askFixOn: "Montrez-moi la correction de {id} sur {host}", askFix: "Montrez-moi la correction de {id}",
      askCard: "Poser une question", askPlaywright: "Écrivez le cas Playwright pour {id}", askExport: "Exportez {id} en ticket GitHub ou Jira",
      verdict: { fail: "Échoue maintenant", risk: "À risque", person: "Demande une personne", pass: "Réussit", proposed: "Proposé, pas encore vérifié" },
      severity: { critical: "critique", high: "élevée", medium: "moyenne", low: "faible", info: "informative" },
      effort: { minutes: "minutes", hours: "heures", days: "jours", none: "non estimé" },
      rated: "{verdict}, gravité {severity} dans {area}.",
      notHigh: "Sa gravité est {severity}, pas élevée. Sa place en haut de la liste vient de la priorité ci-dessous.",
      saw: "Ce que l’analyse a vu : {evidence}",
      ranks: "Il est classé {rank} sur {total} échecs et risques, avec une priorité de {priority}.",
      priorityWhy: "La priorité augmente avec la gravité ({severity}), compte un échec en entier et un risque à 60 pour cent (celui-ci {state}), augmente avec la portée ({reach}) et diminue avec l’effort de correction ({effort}).",
      stateFail: "échoue", stateRisk: "est un risque", pageOne: "{n} page", pageMany: "{n} pages",
      passNotRanked: "Il réussit, il n’est donc pas classé.",
      personNotRanked: "Une lecture automatique ne peut pas trancher, il n’est donc pas classé. Une personne le vérifie dans un navigateur.",
      pages: "Pages : {list}.", pagesMore: "Pages : {list} et {n} de plus.", testCases: "Cas de test : {list}.", fix: "Correction : {fix}",
      caseIs: "{id} est un cas de la couche {layer}. {state}.", caseRated: "{verdict}, gravité {severity}",
      casePriority: "Priorité {priority}, risque {risk} sur 100. Le risque augmente avec la gravité de ce qui a échoué (ou avec le poids de la couche {layer} quand rien n’a échoué), avec le verdict, avec le nombre de pages couvertes et selon qu’un constat ou un sélecteur l’appuie. P1 commence à 45, P2 à 22, P3 à 9.",
      caseWhy: "Pourquoi il est proposé : {why}", backedBy: "Il est appuyé par {id}, {title} : {evidence}",
      servedFrom: "Cette analyse a vu le site servi par {host}.",
      hostUnknown: "Cette analyse n’a pas pu identifier l’hébergeur, les fichiers serveur courants sont donc affichés.",
      tech: "Technologies vues : {list}.", techMore: "Technologies vues : {list} et {n} de plus.",
      ghPagesProxied: "GitHub Pages ne peut pas envoyer d’en-têtes personnalisés, mais cette analyse a aussi vu Cloudflare devant le site. Ajoutez-y l’en-tête avec une Response Header Transform Rule, avec le nom et la valeur ci-dessous. Un fichier _headers ne fonctionne que sur Cloudflare Pages ou Netlify.",
      ghPages: "GitHub Pages ne peut pas envoyer d’en-têtes personnalisés. Placez un CDN comme Cloudflare devant et définissez-y l’en-tête, ou passez à un hébergeur qui envoie des en-têtes. Le fichier _headers ci-dessous fonctionne sur Cloudflare Pages et Netlify.",
      noFinding: "Aucun constat noté ne se trouve derrière {id}, ce rapport ne contient donc pas de correction. Ce que le cas vérifierait : {why}",
      caseBacked: "{id} est appuyé par {fid}, {title}.", passes: "{id} réussit. Il n’y a rien à corriger.",
      noFile: "Le rapport n’a pas de fichier prêt à copier pour celui-ci. La correction ci-dessus est ce qu’il contient.",
      noFix: "Le rapport ne contient pas de correction pour celui-ci, seulement la preuve : {evidence}",
      libEnded: "{name} {version} : cette branche ne reçoit plus de correctifs ; passez à une version majeure prise en charge.",
      libUpgrade: "{name} {version} : mettez à jour vers {fixed} ou plus récent.", dns: "Enregistrements DNS",
      pwNoCase: "{id} n’a pas, dans ce rapport, de cas de test avec un script Playwright.",
      pwFinding: "{id} est un constat. Son cas de test est {case}.",
      pwOther: "{id} est écrit pour {list}, pas pour Playwright.", noFramework: "aucun framework",
      pwSave: "Enregistrez-le sous tests/{name} et lancez npx playwright test.",
      pwFixme: "Le rapport laisse ce cas à une personne, le test est donc marqué fixme et garde le texte du cas en commentaires.",
      fixTitle: "Correction de {ref}", pwTitle: "Cas Playwright pour {id}", issueTitle: "Ticket pour {ref}",
      exportLink: "Le bouton GitHub ouvre un nouveau ticket prérempli dans {repo}. Rien n’est envoyé tant que vous ne le soumettez pas là-bas.",
      exportNoRepo: "Indiquez le dépôt GitHub sous la forme propriétaire/nom sous la zone de saisie pour y ouvrir un ticket prérempli. Le Markdown ci-dessous se colle dans GitHub ou Jira, et le CSV s’importe dans Jira."
    },
    it: {
      open: "Chiedi al report", title: "Risposte solo da questo report", close: "Chiudi", send: "Chiedi",
      note: "Spiega un risultato a partire dalle sue prove, scrive la correzione per la tecnologia vista da questa revisione, scrive il caso Playwright per un id di caso e prepara una issue GitHub o Jira. Non risponde a nulla che il report non contenga.",
      inputLabel: "Domanda su questo report", placeholder: "Perché F-01 ha questa valutazione?", repo: "Repository GitHub per le issue",
      copy: "Copia", copied: "Copiato", copyFailed: "Copia non riuscita",
      github: "Apri una issue su GitHub", jiraMd: "Copia per Jira (Markdown)", jiraCsv: "Copia la riga CSV per Jira",
      signIn: "Accedi con l’account che ha eseguito questo report per fargli domande.", signInButton: "Accedi",
      expired: "Il tuo accesso è scaduto. Accedi di nuovo con l’account che ha eseguito questo report.",
      notOwner: "Solo l’account che ha eseguito questo report può fargli domande.",
      notPaid: "«Chiedi al report» si apre quando questo report è pagato.",
      notFound: "Report non trovato.",
      failed: "«Chiedi al report» non si è aperto. Riprova tra un momento.",
      intro: "Chiedi di un risultato o di un caso con il suo id, oppure tocca una domanda qui sotto. {scope}",
      repoFirst: "Scrivi prima il repository GitHub come proprietario/nome, poi premi di nuovo il pulsante.",
      scope: "Rispondo solo a partire da questo report: perché un risultato o un caso ha la sua valutazione, la sua correzione per la tecnologia vista da questa revisione, il caso Playwright per un id di caso e una issue GitHub o Jira per un risultato o un caso.",
      outsideTitle: "Fuori da questo report", outside: "{scope} Questa domanda ne resta fuori, quindi qui non ha risposta.",
      closedTitle: "Non disponibile", closed: "«Chiedi al report» funziona solo su un report pagato.",
      missingTitle: "Non è in questo report", missing: "Questo report non ha {id}.", missingRange: "I suoi risultati vanno da {first} a {last}.", missingCases: "Tra i suoi casi ci sono {list}.",
      whichTitle: "Quale?", which: "Indica il risultato o il caso con il suo id, per esempio F-01 o SEC-02.", whichFirst: "I primi di questo report:",
      askRated: "Perché {id} ha gravità {severity}?", askWhy: "Perché {id} ha questa valutazione?", askFixOn: "Mostrami la correzione di {id} su {host}", askFix: "Mostrami la correzione di {id}",
      askCard: "Chiedi su questo", askPlaywright: "Scrivi il caso Playwright per {id}", askExport: "Esporta {id} come issue GitHub o Jira",
      verdict: { fail: "Fallisce ora", risk: "A rischio", person: "Serve una persona", pass: "Supera", proposed: "Proposto, non ancora verificato" },
      severity: { critical: "critica", high: "alta", medium: "media", low: "bassa", info: "informativa" },
      effort: { minutes: "minuti", hours: "ore", days: "giorni", none: "non stimato" },
      rated: "{verdict}, gravità {severity} in {area}.",
      notHigh: "La sua gravità è {severity}, non alta. La sua posizione in cima viene dalla priorità qui sotto.",
      saw: "Cosa ha visto la revisione: {evidence}",
      ranks: "È al posto {rank} su {total} errori e rischi, con priorità {priority}.",
      priorityWhy: "La priorità cresce con la gravità ({severity}), conta un errore per intero e un rischio al 60 per cento (questo {state}), cresce con la portata ({reach}) e cala con lo sforzo per correggerlo ({effort}).",
      stateFail: "fallisce", stateRisk: "è un rischio", pageOne: "{n} pagina", pageMany: "{n} pagine",
      passNotRanked: "Supera il controllo, quindi non ha un posto.",
      personNotRanked: "Una lettura automatica non può deciderlo, quindi non ha un posto. Lo verifica una persona in un browser.",
      pages: "Pagine: {list}.", pagesMore: "Pagine: {list} e altre {n}.", testCases: "Casi di test: {list}.", fix: "Correzione: {fix}",
      caseIs: "{id} è un caso di {layer}. {state}.", caseRated: "{verdict}, gravità {severity}",
      casePriority: "Priorità {priority}, rischio {risk} su 100. Il rischio cresce con la gravità di ciò che è fallito (o con il peso del livello {layer} quando nulla è fallito), con il verdetto, con quante pagine copre il caso e con il sostegno di un risultato o di un selettore. P1 parte da 45, P2 da 22, P3 da 9.",
      caseWhy: "Perché è proposto: {why}", backedBy: "È sostenuto da {id}, {title}: {evidence}",
      servedFrom: "Questa revisione ha visto il sito servito da {host}.",
      hostUnknown: "Questa revisione non ha potuto riconoscere l’hosting, quindi vengono mostrati i file server più comuni.",
      tech: "Tecnologie viste: {list}.", techMore: "Tecnologie viste: {list} e altre {n}.",
      ghPagesProxied: "GitHub Pages non può inviare intestazioni personalizzate, ma questa revisione ha visto anche Cloudflare davanti al sito. Aggiungi lì l’intestazione con una Response Header Transform Rule, usando il nome e il valore qui sotto. Un file _headers funziona solo su Cloudflare Pages o Netlify.",
      ghPages: "GitHub Pages non può inviare intestazioni personalizzate. Metti davanti una CDN come Cloudflare e imposta lì l’intestazione, oppure passa a un hosting che invii intestazioni. Il file _headers qui sotto funziona su Cloudflare Pages e Netlify.",
      noFinding: "Dietro {id} non c’è un risultato con punteggio, quindi questo report non contiene una correzione. Cosa verificherebbe il caso: {why}",
      caseBacked: "{id} è sostenuto da {fid}, {title}.", passes: "{id} supera il controllo. Non c’è nulla da correggere.",
      noFile: "Il report non ha un file pronto da copiare per questo. La correzione qui sopra è ciò che contiene.",
      noFix: "Il report non contiene una correzione per questo, solo la prova: {evidence}",
      libEnded: "{name} {version}: questa linea di versioni non riceve più correzioni; passa a una versione principale supportata.",
      libUpgrade: "{name} {version}: aggiorna a {fixed} o successiva.", dns: "Record DNS",
      pwNoCase: "{id} non ha in questo report un caso di test con uno script Playwright.",
      pwFinding: "{id} è un risultato. Il suo caso di test è {case}.",
      pwOther: "{id} è scritto per {list}, non per Playwright.", noFramework: "nessun framework",
      pwSave: "Salvalo come tests/{name} ed esegui npx playwright test.",
      pwFixme: "Il report lascia questo caso a una persona, quindi il test è segnato come fixme e mantiene il testo del caso come commenti.",
      fixTitle: "Correzione per {ref}", pwTitle: "Caso Playwright per {id}", issueTitle: "Issue per {ref}",
      exportLink: "Il pulsante GitHub apre una nuova issue già compilata in {repo}. Non viene inviato nulla finché non la invii lì.",
      exportNoRepo: "Aggiungi il repository GitHub come proprietario/nome sotto la casella per aprire lì una issue compilata. Il Markdown qui sotto si incolla in GitHub o Jira, e il CSV si importa in Jira."
    }
  };
  const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  const JIRA_PRIORITY = { critical: "Highest", high: "High", medium: "Medium", low: "Low", info: "Lowest" };
  const HEADER_OF = { "sec-hsts": "Strict-Transport-Security", "sec-csp": "Content-Security-Policy-Report-Only", "sec-nosniff": "X-Content-Type-Options", "sec-referrer": "Referrer-Policy", "sec-permissions": "Permissions-Policy" };
  const HOST_FILE = { Netlify: "netlify", Cloudflare: "netlify", "GitHub Pages": "netlify", Vercel: "vercel", "Firebase Hosting": "firebase", nginx: "nginx", Apache: "apache" };
  const DNS_OF = {
    "sec-spf": (row) => /^v=spf1/.test(row.value),
    "sec-dmarc": (row) => /^_dmarc\./.test(row.name),
    "sec-caa": (row) => row.type === "CAA",
    "sec-tlsrpt": (row) => /^_smtp\._tls\./.test(row.name),
    "sec-mta-sts": (row) => /^_mta-sts\./.test(row.name)
  };
  const KIT_FILE = {
    "geo-llms": ["llmsTxt", "llms.txt"],
    "sec-securitytxt": ["securityTxt", ".well-known/security.txt"],
    "an-privacy": ["privacyNotice", "privacy-notice.md"],
    "an-imprint": ["imprint", "impressum.md"],
    "a11y-statement": ["accessibilityStatement", "accessibility-statement.md"],
    "an-chat-consent": ["chatSnippet", "chat-click-to-load.html"],
    "an-chat-reject": ["chatSnippet", "chat-click-to-load.html"],
    "sec-mta-sts": ["mtaSts", "mta-sts.txt"]
  };
  const INTENTS = [
    ["export", /\b(github|jira|issues?|tickets?|export\w*|esporta\w*)\b/],
    ["playwright", /\b(playwright|scripts?|specs?|tests?|testfall|prueba|teste)\b/],
    ["fix", /\b(fix\w*|repair|solve|stack|hosting|config\w*|arregl\w*|corrig\w*|soluc\w*|correc\w*|correz\w*|korrektur\w*|beheb\w*|repar\w*|risolv\w*)\b/],
    ["why", /\b(why|explain\w*|reason|high|severity|priority|rank\w*|por ?que|explica\w*|warum|erklar\w*|pourquoi|expliqu\w*|perche|spiega\w*|severidad|gravedad)\b/]
  ];
  const HIGH = /\b(high|alta|alto|hoch|elevee?|haut)\b/;
  const STOP = ["what", "this", "that", "with", "from", "does", "have", "high", "show", "write", "case", "test", "tests", "issue", "github", "jira", "export", "playwright", "stack", "about", "report", "finding", "explain", "there", "which", "would", "could", "should", "please", "rated", "rank", "ranked", "turn", "into", "make", "give", "the", "for", "why", "fix",
    "por", "que", "porque", "para", "como", "una", "los", "las", "del", "esta", "alto", "alta", "und", "der", "die", "das", "ist", "warum", "hoch", "pour", "les", "des", "une", "est", "elevee", "eleve", "perche", "che", "della", "per", "sono"];
  const MAX_BODY = 6000;
  const TRACKER_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|facebook\.net|hotjar\.com|clarity\.ms|segment\.(io|com)|mixpanel\.com|hs-analytics\.net|hs-scripts\.com|plausible\.io|matomo\.cloud)$/;
  const ANALYTICS_COOKIES = "^(_ga|_gid|_gcl|_fbp|_hj|_clck|_clsk|ajs_|mp_)";

  function book(lang) {
    return T[String(lang || "en").slice(0, 2).toLowerCase()] || T.en;
  }

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (values && values[key] != null ? String(values[key]) : match));
  }

  function plain(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function text(value) { return { kind: "text", text: value }; }
  function list(items) { return { kind: "list", items }; }
  function code(value, label) { return { kind: "code", text: value, label }; }

  function findings(report) {
    return (report.insights && report.insights.findings) || [];
  }

  function intentOf(question) {
    const words = plain(question).replace(/github pages|github\.com/g, " ");
    const found = INTENTS.find(([, pattern]) => pattern.test(words));
    return found ? found[0] : "";
  }

  function idsIn(question) {
    return (String(question || "").toUpperCase().match(/\b[A-Z][A-Z0-9]{0,5}-\d{1,3}\b/g) || []).map((id) => id.replace(/-(\d)$/, "-0$1"));
  }

  function lookup(report, id) {
    const finding = findings(report).find((item) => item.id === id);
    if (finding) return { kind: "finding", item: finding };
    const found = (report.cases || []).find((item) => item.id === id);
    return found ? { kind: "case", item: found } : null;
  }

  function byWords(report, question, prefer) {
    const words = plain(question).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && STOP.indexOf(word) === -1);
    if (!words.length) return null;
    const pool = findings(report).map((item) => ({ kind: "finding", item })).concat((report.cases || []).map((item) => ({ kind: "case", item })));
    pool.sort((a, b) => (a.kind === prefer ? 0 : 1) - (b.kind === prefer ? 0 : 1));
    let best = null;
    let most = 0;
    pool.forEach((entry) => {
      const title = plain(entry.item.title);
      const hits = words.filter((word) => title.indexOf(word) !== -1).length;
      if (hits > most) {
        best = entry;
        most = hits;
      }
    });
    return most >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
  }

  function target(report, question, prefer) {
    const ids = idsIn(question);
    for (const id of ids) {
      const hit = lookup(report, id);
      if (hit) return hit;
    }
    if (ids.length) return { missing: ids[0] };
    return byWords(report, question, prefer);
  }

  function findingOf(report, item) {
    if (item.finding) {
      const hit = findings(report).find((row) => row.id === item.finding);
      if (hit) return hit;
    }
    return findings(report).find((row) => (row.cases || []).indexOf(item.id) !== -1) || null;
  }

  function openFindings(report) {
    return findings(report).filter((item) => item.verdict === "fail" || item.verdict === "risk");
  }

  function playwrightCases(report) {
    return (report.cases || []).filter((item) => (item.fw || []).indexOf("Playwright") !== -1);
  }

  function severityWord(L, severity) {
    return L.severity[severity] || severity || "";
  }

  function suggestions(report, lang) {
    const L = book(lang);
    const top = openFindings(report).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
    const hosting = (report.insights && report.insights.fixkit && report.insights.fixkit.hosting) || "";
    const runnable = playwrightCases(report);
    const firstCase = (top && runnable.find((item) => (top.cases || []).indexOf(item.id) !== -1)) || runnable.find((item) => item.priority === "P1") || runnable[0];
    const asks = [];
    if (top) asks.push(fill(L.askRated, { id: top.id, severity: severityWord(L, top.severity) }), fill(hosting ? L.askFixOn : L.askFix, { id: top.id, host: hosting }));
    if (firstCase) asks.push(fill(L.askPlaywright, { id: firstCase.id }));
    if (top) asks.push(fill(L.askExport, { id: top.id }));
    return asks;
  }

  function followUps(L, report, hit) {
    const hosting = (report.insights && report.insights.fixkit && report.insights.fixkit.hosting) || "";
    const item = hit.item;
    const backing = hit.kind === "finding" ? item : findingOf(report, item);
    const runnable = hit.kind === "case"
      ? ((item.fw || []).indexOf("Playwright") !== -1 ? item : null)
      : playwrightCases(report).find((row) => (item.cases || []).indexOf(row.id) !== -1);
    const asks = [];
    if (backing && backing.verdict !== "pass") asks.push(fill(hosting ? L.askFixOn : L.askFix, { id: item.id, host: hosting }));
    if (runnable) asks.push(fill(L.askPlaywright, { id: runnable.id }));
    asks.push(fill(L.askExport, { id: item.id }));
    return asks;
  }

  function pagesPart(L, item) {
    const pages = item.pages || [];
    if (!pages.length) return null;
    const shown = pages.slice(0, 8).join(", ");
    return text(pages.length > 8 ? fill(L.pagesMore, { list: shown, n: pages.length - 8 }) : fill(L.pages, { list: shown }));
  }

  function explainFinding(L, report, item, question) {
    const parts = [text(fill(L.rated, { verdict: L.verdict[item.verdict], severity: severityWord(L, item.severity), area: item.area }))];
    if (HIGH.test(plain(question)) && (SEVERITY_RANK[item.severity] || 0) < 4 && item.rank) parts.push(text(fill(L.notHigh, { severity: severityWord(L, item.severity) })));
    parts.push(text(fill(L.saw, { evidence: item.evidence })));
    if (item.rank) {
      const reach = item.count || (item.pages || []).length || 1;
      const why = fill(L.priorityWhy, {
        severity: severityWord(L, item.severity),
        state: item.verdict === "fail" ? L.stateFail : L.stateRisk,
        reach: fill(reach === 1 ? L.pageOne : L.pageMany, { n: reach }),
        effort: L.effort[item.effort] || item.effort || L.effort.none
      });
      parts.push(text(fill(L.ranks, { rank: item.rank, total: openFindings(report).length, priority: item.priority }) + " " + why));
    } else if (item.verdict === "pass") parts.push(text(L.passNotRanked));
    else if (item.verdict === "person") parts.push(text(L.personNotRanked));
    const pages = pagesPart(L, item);
    if (pages) parts.push(pages);
    if ((item.cases || []).length) parts.push(text(fill(L.testCases, { list: item.cases.join(", ") })));
    if (item.fix && item.verdict !== "pass") parts.push(text(fill(L.fix, { fix: item.fix })));
    return parts;
  }

  function explainCase(L, report, item) {
    const state = item.verdict
      ? (item.severity && item.severity !== "info" ? fill(L.caseRated, { verdict: L.verdict[item.verdict], severity: severityWord(L, item.severity) }) : L.verdict[item.verdict])
      : L.verdict.proposed;
    const parts = [text(fill(L.caseIs, { id: item.id, layer: item.layer, state }))];
    if (item.priority) parts.push(text(fill(L.casePriority, { priority: item.priority, risk: item.risk, layer: item.layer })));
    parts.push(text(fill(L.caseWhy, { why: item.why })));
    const pages = pagesPart(L, item);
    if (pages) parts.push(pages);
    const backing = findingOf(report, item);
    if (backing) parts.push(text(fill(L.backedBy, { id: backing.id, title: backing.title, evidence: backing.evidence })));
    return parts;
  }

  function stackParts(L, report) {
    const hosting = (report.insights && report.insights.fixkit && report.insights.fixkit.hosting) || "";
    const tech = (report.technologies || []).map((row) => row.name).filter(Boolean);
    const parts = [text(hosting ? fill(L.servedFrom, { host: hosting }) : L.hostUnknown)];
    if (tech.length) parts.push(text(tech.length > 10 ? fill(L.techMore, { list: tech.slice(0, 10).join(", "), n: tech.length - 10 }) : fill(L.tech, { list: tech.join(", ") })));
    return parts;
  }

  // Browsers ignore frame-ancestors in a Report-Only policy, so the frame fix sends it in an enforced one of its own.
  function headersFor(kit, key) {
    const rows = kit.headers || [];
    if (key === "sec-frame") {
      const legacy = rows.find((row) => row.name === "X-Frame-Options");
      const ancestors = (String(kit.csp || "").match(/frame-ancestors[^;]+/) || [])[0] || (legacy && /deny/i.test(legacy.value) ? "frame-ancestors 'none'" : "frame-ancestors 'self'");
      return [{ name: "Content-Security-Policy", value: ancestors.trim() }].concat(legacy ? [legacy] : []);
    }
    const row = HEADER_OF[key] && rows.find((item) => item.name === HEADER_OF[key]);
    return row ? [row] : [];
  }

  function transformRule(headers) {
    return [
      "# Cloudflare dashboard: Rules > Overview > Create rule > Response Header Transform Rule",
      "# If incoming requests match: All incoming requests",
      "# Then, for each header below: Set static",
      ""
    ].concat(...headers.map((row) => ["Header name: " + row.name, "Value: " + row.value, ""])).join("\n");
  }

  function recipes(L, report, item) {
    const kit = (report.insights && report.insights.fixkit) || {};
    const hosting = kit.hosting || "";
    const parts = [];
    const headers = headersFor(kit, item.key);
    if (headers.length && Scripts && Scripts.headerFiles) {
      const proxied = (report.technologies || []).some((row) => /cloudflare/i.test(row.name || ""));
      if (hosting === "GitHub Pages") parts.push(text(proxied ? L.ghPagesProxied : L.ghPages));
      if (hosting === "GitHub Pages" && proxied) parts.push(code(transformRule(headers), "Cloudflare Transform Rule"));
      else {
        const files = Scripts.headerFiles(headers, hosting);
        const want = HOST_FILE[hosting];
        const picked = want ? files.filter((file) => file.path.indexOf(want) !== -1).slice(0, 1) : files.slice(0, 3);
        picked.forEach((file) => parts.push(code(file.content, file.path.replace(/^fix-kit\/headers\//, ""))));
      }
    }
    const dns = DNS_OF[item.key] ? (kit.dns || []).filter(DNS_OF[item.key]) : [];
    if (dns.length) parts.push(code(dns.map((row) => row.name + "\t" + row.type + "\t" + row.value).join("\n"), L.dns));
    const file = KIT_FILE[item.key];
    if (file && kit[file[0]]) parts.push(code(kit[file[0]], file[1]));
    if ((item.key === "seo-schema" || item.key === "geo-entity") && kit.jsonLd) {
      parts.push(code("<script type=\"application/ld+json\">\n" + JSON.stringify(kit.jsonLd, null, 2) + "\n</script>", "structured-data.html"));
    }
    if (item.key === "sec-libraries" && (kit.libraries || []).length) {
      parts.push(list(kit.libraries.map((row) => fill(row.ended ? L.libEnded : L.libUpgrade, row))));
    }
    return parts;
  }

  function fixFor(L, report, hit) {
    const item = hit.kind === "finding" ? hit.item : findingOf(report, hit.item);
    const parts = stackParts(L, report);
    if (!item) {
      parts.push(text(fill(L.noFinding, { id: hit.item.id, why: hit.item.why })));
      return parts;
    }
    if (hit.kind === "case") parts.push(text(fill(L.caseBacked, { id: hit.item.id, fid: item.id, title: item.title })));
    if (item.verdict === "pass") {
      parts.push(text(fill(L.passes, { id: item.id })));
      return parts;
    }
    if (item.fix) parts.push(text(fill(L.fix, { fix: item.fix })));
    const files = recipes(L, report, item);
    if (files.length) return parts.concat(files);
    parts.push(text(item.fix ? L.noFile : fill(L.noFix, { evidence: item.evidence })));
    return parts;
  }

  function trackers(report) {
    const csp = String((report.insights && report.insights.fixkit && report.insights.fixkit.csp) || "");
    const seen = (csp.match(/https?:\/\/[^\s;'"]+/g) || []).map((url) => url.replace(/^https?:\/\/(\*\.|www\.)?/, "").replace(/\/.*$/, ""));
    const hosts = seen.filter((host, index) => TRACKER_HOSTS.test(host) && seen.indexOf(host) === index);
    return hosts.length ? hosts : ["googletagmanager.com", "google-analytics.com"];
  }

  // A case the generator leaves to a person becomes a fixme with real steps, so the person fills in only what the report cannot know.
  function skeleton(report, item, ctx, generated) {
    const path = JSON.stringify(item.path || ctx.startPath || "/");
    const notes = generated.split("\n").filter((line) => /^\s*\/\/ /.test(line) && !/A person runs this case/.test(line)).map((line) => line.trim());
    let args = "{ page }";
    let body;
    if (/^AN-|^PR-0[23]$/.test(item.id)) {
      body = [
        "const TRACKERS = " + JSON.stringify(trackers(report)) + ";",
        "const ACCEPT = \"TODO: the consent banner's accept button, such as #accept-all\";",
        "const tracked = (url: string) => TRACKERS.some((host) => { const name = new URL(url).hostname; return name === host || name.endsWith(\".\" + host); });",
        "const stored = async () => (await page.context().cookies()).filter((cookie) => /" + ANALYTICS_COOKIES + "/.test(cookie.name)).map((cookie) => cookie.name);",
        "const calls: string[] = [];",
        "page.on(\"request\", (req) => { if (tracked(req.url())) calls.push(req.url()); });",
        "await page.goto(BASE + " + path + ");",
        "await page.waitForLoadState(\"networkidle\");",
        "expect(await stored(), \"analytics cookies before a choice\").toEqual([]);",
        "expect.soft(calls, \"analytics requests before a choice; Consent Mode pings without cookies may be allowed\").toEqual([]);",
        "await page.locator(ACCEPT).click();",
        "await page.waitForLoadState(\"networkidle\");",
        "expect((await stored()).length, \"analytics cookies after consent\").toBeGreaterThan(0);"
      ];
    } else if (item.id === "CMP-01") {
      args = "{ browser }";
      body = [
        "const context = await browser.newContext({ javaScriptEnabled: false });",
        "const page = await context.newPage();",
        "await page.goto(BASE + " + path + ");",
        "await expect(page).toHaveTitle(/\\S/);",
        "await expect(page.locator(\"h1\").first()).toBeVisible();",
        "await context.close();"
      ];
    } else if (item.id === "A11Y-03") {
      body = [
        "await page.goto(BASE + " + path + ");",
        "const levels = await page.$$eval(\"h1, h2, h3, h4, h5, h6\", (nodes) => nodes.map((node) => Number(node.tagName[1])));",
        "expect(levels[0], \"the first heading\").toBe(1);",
        "levels.slice(1).forEach((level, index) => expect.soft(level - levels[index], \"heading \" + (index + 2) + \" skips a level\").toBeLessThanOrEqual(1));"
      ];
    } else if (item.id === "A11Y-04") {
      body = [
        "await page.goto(BASE + " + path + ");",
        "const stops: string[] = [];",
        "for (let step = 0; step < 15; step++) {",
        "  await page.keyboard.press(\"Tab\");",
        "  const stop = await page.evaluate(() => {",
        "    const el = document.activeElement as HTMLElement | null;",
        "    if (!el || el === document.body) return null;",
        "    const style = getComputedStyle(el);",
        "    return { name: el.tagName.toLowerCase() + \" \" + (el.getAttribute(\"aria-label\") || el.textContent || \"\").trim().slice(0, 40), ring: style.outlineStyle !== \"none\" || style.boxShadow !== \"none\" };",
        "  });",
        "  if (!stop) break;",
        "  stops.push(stop.name);",
        "  expect.soft(stop.ring, \"focus ring on \" + stop.name).toBe(true);",
        "}",
        "expect(stops.length, \"keyboard stops\").toBeGreaterThan(0);",
        "// TODO: compare the stops with the visual reading order.",
        "console.log(stops.join(\"\\n\"));"
      ];
    } else {
      body = [
        "await page.goto(BASE + " + path + ");",
        "await expect(page).toHaveTitle(/\\S/);",
        "// TODO: write the step and the expected result above as actions and expect() lines.",
        "await page.screenshot({ path: \"test-results/" + item.id.toLowerCase() + ".png\", fullPage: true });"
      ];
    }
    const lines = notes.concat("// Fill in any TODO, then change test.fixme to test.", body);
    return "test.fixme(" + JSON.stringify(item.id + " · " + String(item.title).replace(/\s+/g, " ").trim()) + ", async (" + args + ") => {\n" + lines.map((line) => "  " + line).join("\n") + "\n});";
  }

  function playwrightFor(L, report, hit) {
    let item = hit.kind === "case" ? hit.item : null;
    const parts = [];
    if (!item) {
      item = playwrightCases(report).find((row) => (hit.item.cases || []).indexOf(row.id) !== -1) || null;
      if (!item) return [text(fill(L.pwNoCase, { id: hit.item.id }))];
      parts.push(text(fill(L.pwFinding, { id: hit.item.id, case: item.id })));
    }
    const out = Scripts ? Scripts.snippets(report, item, ["Playwright"]) : [];
    if (!out.length) return parts.concat(text(fill(L.pwOther, { id: item.id, list: (item.fw || []).join(", ") || L.noFramework })));
    const ctx = Scripts.context(report);
    const name = item.id.toLowerCase() + ".spec.ts";
    const manual = /test\.fixme\(/.test(out[0].code);
    const file = [
      "// " + item.id + " · " + ctx.label,
      "// Proposed from this report's evidence. Review selectors and budgets before a run.",
      "import { test, expect } from \"@playwright/test\";",
      "",
      "const BASE = " + JSON.stringify(ctx.base) + ";",
      "const HOST = " + JSON.stringify(ctx.host) + ";",
      "",
      manual ? skeleton(report, item, ctx, out[0].code) : out[0].code,
      ""
    ].join("\n");
    parts.push(text(fill(L.pwSave, { name })));
    if (manual) parts.push(text(L.pwFixme));
    parts.push(code(file, name));
    return parts;
  }

  function csvCell(value) {
    return "\"" + String(value == null ? "" : value).replace(/"/g, "\"\"") + "\"";
  }

  function issueFor(report, hit, options) {
    const E = T.en.verdict;
    const item = hit.item;
    const backing = hit.kind === "finding" ? item : findingOf(report, item);
    const title = "[" + (report.host || "site") + "] " + item.id + ": " + item.title;
    const lines = hit.kind === "finding"
      ? ["**Finding:** " + item.id + " · " + item.area + " · " + E[item.verdict] + " · severity " + item.severity + (item.rank ? " · priority " + item.priority + ", rank " + item.rank : "")]
      : ["**Case:** " + item.id + " · " + item.layer + " · " + (item.verdict ? E[item.verdict] : E.proposed) + (item.priority ? " · " + item.priority + ", risk " + item.risk : "")];
    lines.push("**Site:** " + (report.finalUrl || "https://" + report.host + "/"));
    if (options.reportUrl) lines.push("**Report:** " + options.reportUrl);
    if (hit.kind === "case") lines.push("", "## Case", "", item.why);
    if (backing) lines.push("", "## What the review saw", "", backing.evidence);
    if (backing && backing.fix && backing.verdict !== "pass") lines.push("", "## Fix", "", backing.fix);
    const pages = item.pages || [];
    if (pages.length) {
      lines.push("", "## Pages", "");
      pages.slice(0, 10).forEach((path) => lines.push("- " + path));
      if (pages.length > 10) lines.push("- and " + (pages.length - 10) + " more");
    }
    if (hit.kind === "finding" && (item.cases || []).length) lines.push("", "## Test cases", "", item.cases.join(", "));
    lines.push("", "_From QA-lab URL Review report " + report.id + (report.fetchedAt ? " of " + String(report.fetchedAt).slice(0, 10) : "") + ". Check the evidence before acting on it._");
    let body = lines.join("\n");
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1) + "…";
    const severity = (backing && backing.severity) || item.severity || "info";
    const kind = backing && (backing.verdict === "fail" || backing.verdict === "risk") ? "Bug" : "Task";
    const csv = ["Summary", "Description", "Issue Type", "Priority", "Labels"].map(csvCell).join(",") + "\n" +
      [title, body, kind, JIRA_PRIORITY[severity] || "Medium", "qa-review"].map(csvCell).join(",") + "\n";
    return { title, body, csv };
  }

  function githubIssueUrl(repo, issue) {
    const clean = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/+$/g, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) return "";
    return "https://github.com/" + clean + "/issues/new?title=" + encodeURIComponent(issue.title) + "&body=" + encodeURIComponent(issue.body);
  }

  function heading(hit) {
    return hit.item.id + " · " + hit.item.title;
  }

  function choose(L, report, intent) {
    const top = openFindings(report).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 3);
    const cases = playwrightCases(report).filter((item) => item.verdict && item.verdict !== "pass").slice(0, 3);
    const pool = intent === "playwright" ? cases : top;
    const asks = { why: L.askWhy, fix: L.askFix, playwright: L.askPlaywright, export: L.askExport };
    return {
      intent,
      title: L.whichTitle,
      parts: [text(L.which + (pool.length ? " " + L.whichFirst : ""))].concat(pool.length ? [list(pool.map((item) => item.id + " · " + item.title))] : []),
      suggest: pool.map((item) => fill(asks[intent], { id: item.id }))
    };
  }

  function answer(report, question, options) {
    const opts = options || {};
    const L = book(opts.lang);
    const asked = String(question || "").trim().slice(0, 300);
    if (!report || !report.id || report.preview) return { intent: "closed", title: L.closedTitle, parts: [text(L.closed)] };
    const intent = intentOf(asked);
    const hit = asked ? target(report, asked, intent === "playwright" ? "case" : "finding") : null;
    if (hit && hit.missing) {
      const ids = findings(report).map((item) => item.id);
      const lines = [fill(L.missing, { id: hit.missing })];
      if (ids.length) lines.push(fill(L.missingRange, { first: ids[0], last: ids[ids.length - 1] }));
      if ((report.cases || []).length) lines.push(fill(L.missingCases, { list: report.cases.slice(0, 6).map((item) => item.id).join(", ") }));
      return { intent: intent || "why", title: L.missingTitle, parts: [text(lines.join(" "))], suggest: suggestions(report, opts.lang) };
    }
    if (!intent && !hit) return { intent: "outside", title: L.outsideTitle, parts: [text(fill(L.outside, { scope: L.scope }))], suggest: suggestions(report, opts.lang) };
    const kind = intent || "why";
    if (!hit) return choose(L, report, kind);
    if (kind === "fix") return { intent: kind, title: fill(L.fixTitle, { ref: heading(hit) }), parts: fixFor(L, report, hit), ref: hit.item.id };
    if (kind === "playwright") return { intent: kind, title: fill(L.pwTitle, { id: hit.item.id }), parts: playwrightFor(L, report, hit), ref: hit.item.id };
    if (kind === "export") {
      const issue = issueFor(report, hit, opts);
      const link = githubIssueUrl(opts.repo, issue);
      return {
        intent: kind,
        title: fill(L.issueTitle, { ref: heading(hit) }),
        parts: [text(link ? fill(L.exportLink, { repo: String(opts.repo).trim() }) : L.exportNoRepo), code(issue.body, "issue.md")],
        issue,
        ref: hit.item.id
      };
    }
    return { intent: kind, title: heading(hit), parts: hit.kind === "finding" ? explainFinding(L, report, hit.item, asked) : explainCase(L, report, hit.item), suggest: followUps(L, report, hit), ref: hit.item.id };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
  }

  function mount() {
    const panel = document.getElementById("ask-panel");
    const opener = document.getElementById("ask-open");
    if (!panel || !opener) return null;
    const el = (id) => document.getElementById(id);
    const log = el("ask-log");
    const chips = el("ask-chips");
    const form = el("ask-form");
    const input = el("ask-input");
    const repo = el("ask-repo");
    const REPO_KEY = "qa-review-ask-repo";
    const allowed = new Map();
    let payload = null;
    try { repo.value = localStorage.getItem(REPO_KEY) || ""; } catch (error) { repo.value = ""; }

    const lang = () => String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    const L = () => book(lang());

    // Localized copy is marked like the review form, so the page translator does not translate it a second time.
    function paintCopy() {
      const words = L();
      [panel, opener].forEach((node) => {
        if (words === T.en) {
          node.removeAttribute("lang");
          node.removeAttribute("translate");
        } else {
          node.setAttribute("lang", lang());
          node.setAttribute("translate", "no");
        }
      });
      panel.querySelectorAll("[data-ask-text]").forEach((node) => { node.textContent = words[node.getAttribute("data-ask-text")]; });
      opener.textContent = words.open;
      input.placeholder = words.placeholder;
    }

    function endpoint() {
      const host = location.hostname;
      if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
      return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
    }

    function reportUrl() {
      return location.origin + location.pathname + "?report=" + encodeURIComponent(payload.report.id);
    }

    function note(message, action) {
      const box = document.createElement("div");
      box.className = "ask-msg ask-system";
      box.innerHTML = "<p>" + esc(message) + "</p>" + (action ? '<div class="ask-actions"><button type="button" data-action="' + esc(action[0]) + '">' + esc(action[1]) + "</button></div>" : "");
      log.appendChild(box);
      log.scrollTop = log.scrollHeight;
    }

    function mine(question) {
      const box = document.createElement("div");
      box.className = "ask-msg ask-me";
      box.textContent = question;
      log.appendChild(box);
      return box;
    }

    function reply(result) {
      const words = L();
      const box = document.createElement("div");
      box.className = "ask-msg ask-bot";
      const copies = [];
      let html = "<strong>" + esc(result.title) + "</strong>";
      result.parts.forEach((part) => {
        if (part.kind === "code") {
          copies.push(part.text);
          html += '<div class="ask-code"><div class="ask-code-head"><span class="notranslate" translate="no">' + esc(part.label) + '</span><button type="button" data-copy="' + (copies.length - 1) + '">' + esc(words.copy) + '</button></div><pre class="notranslate" translate="no"><code>' + esc(part.text) + "</code></pre></div>";
        } else if (part.kind === "list") {
          html += "<ul>" + part.items.map((item) => "<li>" + esc(item) + "</li>").join("") + "</ul>";
        } else {
          html += "<p>" + esc(part.text) + "</p>";
        }
      });
      const actions = [];
      if (result.issue) {
        copies.push(result.issue.body, result.issue.csv);
        actions.push('<button type="button" data-github>' + esc(words.github) + "</button>", '<button type="button" data-copy="' + (copies.length - 2) + '">' + esc(words.jiraMd) + "</button>", '<button type="button" data-copy="' + (copies.length - 1) + '">' + esc(words.jiraCsv) + "</button>");
      }
      (result.suggest || []).forEach((ask) => actions.push('<button type="button" data-ask="' + esc(ask) + '">' + esc(ask) + "</button>"));
      if (actions.length) html += '<div class="ask-actions">' + actions.join("") + "</div>";
      box.innerHTML = html;
      box.copies = copies;
      box.issue = result.issue || null;
      log.appendChild(box);
    }

    function ask(question) {
      if (!payload || allowed.get(payload.report.id) !== true) return;
      const asked = mine(question);
      const result = answer(payload.report, question, { repo: repo.value, reportUrl: reportUrl(), lang: lang() });
      reply(result);
      log.scrollTop = asked.offsetTop - log.offsetTop - 4;
      if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_ask", "URL Review", result.intent);
    }

    function paintChips() {
      chips.innerHTML = suggestions(payload.report, lang()).map((item) => '<button type="button" data-ask="' + esc(item) + '">' + esc(item) + "</button>").join("");
    }

    function ready(on) {
      form.hidden = !on;
      chips.hidden = !on;
      el("ask-repo-row").hidden = !on;
    }

    async function unlock() {
      const words = L();
      const id = payload.report.id;
      if (allowed.get(id) === true) return true;
      if (!root.ReviewAuth || !root.ReviewAuth.signedIn()) {
        note(words.signIn, ["sign-in", words.signInButton]);
        return false;
      }
      try {
        const res = await fetch(endpoint() + "/review/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(root.ReviewAuth.proof(), { id }))
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          allowed.set(id, true);
          return true;
        }
        const signIn = body.code === "sign-in" || body.signIn === true;
        if (signIn && root.ReviewAuth.expire) root.ReviewAuth.expire(words.expired);
        const said = signIn ? words.expired : { 402: words.notPaid, 403: words.notOwner, 404: words.notFound }[res.status] || words.failed;
        note(said, signIn ? ["sign-in", words.signInButton] : null);
      } catch (error) {
        note(words.failed);
      }
      return false;
    }

    function close() {
      panel.hidden = true;
      opener.setAttribute("aria-expanded", "false");
    }

    async function open() {
      if (!payload) return false;
      paintCopy();
      panel.hidden = false;
      opener.setAttribute("aria-expanded", "true");
      if (allowed.get(payload.report.id) === true) {
        input.focus();
        return true;
      }
      ready(false);
      log.innerHTML = "";
      panel.setAttribute("aria-busy", "true");
      const ok = await unlock();
      panel.removeAttribute("aria-busy");
      if (!ok || !payload) return false;
      ready(true);
      paintChips();
      note(fill(L().intro, { scope: L().scope }));
      input.focus();
      return true;
    }

    async function about(id) {
      if (!payload || !(await open())) return;
      ask(fill(L().askWhy, { id }));
    }

    function cardLink(id) {
      if (!payload) return "";
      const words = L();
      const mark = words === T.en ? "" : ' lang="' + lang() + '" translate="no"';
      return '<button type="button" class="ask-about" data-ask-about="' + esc(id) + '" aria-label="' + esc(words.askCard + ": " + id) + '"' + mark + ">" + esc(words.askCard) + "</button>";
    }

    function show(next) {
      const ok = !!(next && next.paid === true && !next.sample && next.report && next.report.id && !next.report.preview);
      const same = ok && payload && payload.report.id === next.report.id;
      payload = ok ? next : null;
      opener.hidden = !ok;
      if (ok) paintCopy();
      if (!ok || !same) {
        close();
        log.innerHTML = "";
        ready(false);
      }
    }

    opener.addEventListener("click", () => (panel.hidden ? open() : close()));
    el("ask-close").addEventListener("click", close);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return;
      input.value = "";
      ask(question);
    });
    repo.addEventListener("change", () => {
      try { localStorage.setItem(REPO_KEY, repo.value.trim()); } catch (error) { /* kept for this page only */ }
    });
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !panel.contains(button)) return;
      const box = button.closest(".ask-msg");
      const words = L();
      if (button.hasAttribute("data-ask")) ask(button.getAttribute("data-ask"));
      else if (button.hasAttribute("data-copy") && box) {
        const value = box.copies[Number(button.getAttribute("data-copy"))] || "";
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => { button.textContent = words.copied; }, () => { button.textContent = words.copyFailed; });
      } else if (button.hasAttribute("data-github") && box && box.issue) {
        const link = githubIssueUrl(repo.value, box.issue);
        if (!link) {
          note(words.repoFirst);
          repo.focus();
          return;
        }
        root.open(link, "_blank", "noopener");
      } else if (button.getAttribute("data-action") === "sign-in") {
        close();
        const closer = document.getElementById("dash-close");
        if (closer) closer.click();
        if (root.ReviewAuth) root.ReviewAuth.focus();
      }
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-ask-about]");
      if (button) about(button.getAttribute("data-ask-about"));
    });
    if (root.ReviewAuth && root.ReviewAuth.onChange) root.ReviewAuth.onChange((on) => { if (!on) allowed.clear(); });
    return { show, close, cardLink };
  }

  const api = { T, answer, suggestions, intentOf, idsIn, githubIssueUrl, issueFor: (report, id, options) => { const hit = lookup(report, id); return hit ? issueFor(report, hit, options || {}) : null; } };
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.QAReviewAsk = api;
    const panel = typeof document !== "undefined" ? mount() : null;
    api.show = panel ? panel.show : () => {};
    api.close = panel ? panel.close : () => {};
    api.cardLink = panel ? panel.cardLink : () => "";
  }
})(typeof window !== "undefined" ? window : globalThis);
