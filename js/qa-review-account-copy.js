/* Hand-written copy for the account page, so it is not left to machine translation, which only loads after analytics consent.
   Elements marked data-account-copy="<key>" get the text, data-account-html="<key>" trusted markup, and data-account-placeholder or
   data-account-aria the attribute. Templates hold {name} slots. The page calls use(code) when the reader picks another language. */
(function () {
  "use strict";

  const COPY = {
    en: {
      pageTitle: "Your reviews · QA-lab URL Review", skip: "Skip to main content", navLive: "Live Reports", navSocial: "Social", navGuide: "Guide", newReview: "New review", language: "Language", searchLanguage: "Search language", theme: "Toggle dark mode",
      eyebrow: "Your account", title: "Your <em>reviews</em>",
      lede: "Sign in to see the reviews saved under your email. A paid report or a free account opens in full; otherwise the opening of each one shows, and the rest opens when that report is paid.",
      returns: "A return takes <b>10%</b> off the first time in 30 days, <b>15%</b> the second, and <b>20%</b> after that. A return price never takes a price below half its list price.",
      signInTitle: "Sign in", signInIntro: "Use the same sign-in as the review page. A code or link opened on another device or browser signs in nowhere.",
      googleNote: "Google shares your name, photo, email addresses, birthday, phone numbers, addresses, gender, and work details, and your account keeps them. To share only your address, use email.",
      orEmail: "or with your email", emailLabel: "Email", sendCode: "Email me a code", legal: "Signing in stores your email and what the provider you pick shares with it. See <a href=\"qa-review-legal.html\">Disclaimers</a>.",
      codeLabel: "Code", checkCode: "Sign in", codeNote: "Type it here, or open the link in the email in this browser. ", restart: "Start over", signedIn: "Signed in on this device", signOut: "Sign out",
      savedTitle: "Saved reviews", savedCmps: "Saved comparisons", selectAll: "Select all", expandAll: "Expand all", collapseAll: "Collapse all",
      searchHint: "Search by site, URL, status or case", searchAria: "Search saved reviews", bulkAria: "Actions on the selected reviews",
      compare: "Compare", openTabs: "Open in new tabs", downloadJson: "Download JSON", unlock: "Unlock", delete: "Delete", clear: "Clear", stopNotes: "Stop follow-up notes",
      compareIntro: "Set one of your reviews next to up to four others: the health score, the six areas, the open problems and the indicators each site wins. Saved reviews are compared from their reports, with no new run and no charge.",
      yourSite: "Your site", compareWith: "Compare with", pickOne: "Pick at least one other review.", newSite: "Or a site without a review yet", reviewCompare: "Review and compare",
      newSiteNote: "Opens the report of your site with this competitor ready to compare. It is reviewed first, for 9 USD, with the public, passive checks only.",
      dataTitle: "Your data", download: "Download", downloadBody: "Download everything kept under this address as a JSON file: the account, its sign-ins, saved reviews, notes and alerts.", downloadBtn: "Download my data",
      deleteBody: "Deleting removes the account, its sign-ins on every device, saved reviews, notes, alerts, and the sign-in with Google or any other provider. A payment record stays for five years, as Colombian tax law requires, without the report. A stop on follow-up notes stays, so they do not start again. This cannot be undone.",
      deleteConfirm: "Type your email to confirm", deleteBtn: "Delete my account and runs", footReview: "Review a URL", footLegal: "Disclaimers", footA11y: "Accessibility",
      expired: "Your sign-in has ended. Sign in again to see your reviews.", stopped: "Follow-up notes for this address are stopped.", stopFailed: "Follow-up notes did not stop. Try again in a moment.",
      gathering: "Gathering your data…", exportFailed: "Your data did not download. Try again in a moment.", exported: "Your data is downloaded.",
      typeEmail: "Type the address you are signed in with to confirm.", deleting: "Deleting…", deleteFailed: "The account was not fully deleted. Try again in a moment.", deleted: "Your account and runs are deleted, and this device is signed out.",
      fileFree: "Your account opens every report.", filePass: "A 30-day pass is open on this account until {until}. Reports run on this pass are open. An older report opens when that report is paid.",
      filePaid: "Paid reports are open. For the others, the opening of each shows, and the rest opens when that report is paid.", fileOpening: "The opening of each review shows. The rest opens when that report is paid.",
      renew: "Renew the {name} pass", upgrade: "Upgrade to {name}", passTitle: "Your {name} pass", passLeft: "{left} of {runs} runs left, until {date}. It does not renew by itself.",
      passNote: "A renewal or an upgrade adds 30 days from the end date and keeps the runs left.", buy: "Buy {name}", passesTitle: "30-day passes",
      passesBody: "One payment for a set of runs over 30 days, with no auto-renew. Each run includes the full report, the fix list, the case export and alerts. A run that asks for more than the plan pays only for the extras.",
      planLine: "{name} · {runs} runs · {usd} USD · up to {pages} pages, {depth} links deep, {scope}", planAll: "every framework and tool, and the signed-in run", planSome: "{n} frameworks or tools a run",
      noRuns: "No finished review is saved for this address.", noMatch: "No saved review matches “{q}”.", countOf: "{n} of {total}", count_one: "{n} review", count_other: "{n} reviews", picked: "{n} selected",
      unlockOne: "Unlock one report at a time for now.", comparedYours: "Compared with your review of ", comparedWith: "Compared with ", pick: "Select {host}", review: "Review", open: "Open", openingShown: "Opening shown",
      cases_one: "{n} case", cases_other: "{n} cases", summaryCases: "Summary and cases", casesOnly: "Cases", foldCount: "{shown} of {total}", openFull: "Open the full report", openHere: "Open this report on the review page",
      blocked: "The browser blocked {n} of the tabs. Allow pop-ups for this site and try again.", gatheringPicked: "Gathering the selected reviews…", pickedFailed: "The reviews did not download. Try again in a moment.",
      downloaded_one: "{n} review downloaded.", downloaded_other: "{n} reviews downloaded.", confirmDelete: "Delete {n}? Click again", runsDeleteFailed: "The reviews were not all deleted. Try again in a moment.",
      deletedRuns_one: "{n} review deleted.", deletedRuns_other: "{n} reviews deleted.", paymentsKept: "A payment record stays for five years, as Colombian tax law requires, without the report.",
      tagOpeningShown: "opening shown", tagShut: "shut", sameSite: "same site", othersHere: "Your other reviews show here. Add a site below to compare with one that has no review yet.", pickCount: "({n} of {max})",
      indicator: "Indicator", health: "Health score", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "Accessibility", Performance: "Performance" },
      passing: "Checks passing (%)", openProblems: "Open problems", urgent: "Critical and high", whySame: "Same site. Its report shows the history between the two reviews.", whyStopped: "This review stopped early.",
      whyLocked: "Opens in full once this report is paid.", whyNone: "No scores saved.", won: "Indicators won (yours–theirs)", level: "{n} level", fullCompare: "Full comparison", openReport: "Open report",
      openAll: "Open the full comparison report", cmpFoot: "Shaded cells lead their line. Full comparison opens the head-to-head on the review page: radar, speed and weight, the problems only one site has, and market presence. The full comparison report sets every section of each report side by side, is kept under Saved comparisons, and prints or downloads as a PDF once every report in it is paid.",
      saving: "Saving the comparison…", saveFailed: "The comparison was not saved. Try again in a moment.", cmpDeleteFailed: "The comparison was not deleted. Try again in a moment.", cmpDeleted: "The comparison of {hosts} is deleted. The reviews in it stay saved.",
      sideBySide: "Setting the reviews side by side…", cmpFailed: "The comparison did not load. Try again in a moment.", cmpPartial: "{shown} of {total} reviews are compared. The others say why below.",
      enterRival: "Enter the competitor's address.", sameRival: "That is the same site. Enter a competitor's address.", pickDifferent: "Pick reviews of different sites to compare."
    },
    es: {
      pageTitle: "Tus revisiones · QA-lab URL Review", skip: "Saltar al contenido principal", navLive: "Informes en vivo", navSocial: "Redes", navGuide: "Guía", newReview: "Nueva revisión", language: "Idioma", searchLanguage: "Buscar idioma", theme: "Cambiar el modo oscuro",
      eyebrow: "Tu cuenta", title: "Tus <em>revisiones</em>",
      lede: "Inicia sesión para ver las revisiones guardadas con tu correo. Un informe pagado o una cuenta gratuita se abre completo; si no, se muestra el comienzo de cada uno, y el resto se abre cuando se paga ese informe.",
      returns: "Volver te descuenta un <b>10 %</b> la primera vez en 30 días, un <b>15 %</b> la segunda y un <b>20 %</b> después. Un precio con descuento por volver nunca baja de la mitad del precio de lista.",
      signInTitle: "Iniciar sesión", signInIntro: "Usa el mismo inicio de sesión que en la página de revisión. Un código o enlace abierto en otro dispositivo o navegador no inicia sesión en ninguna parte.",
      googleNote: "Google comparte tu nombre, foto, direcciones de correo, fecha de nacimiento, teléfonos, direcciones, género y datos de trabajo, y tu cuenta los guarda. Para compartir solo tu dirección, usa el correo.",
      orEmail: "o con tu correo", emailLabel: "Correo", sendCode: "Envíame un código", legal: "Al iniciar sesión se guardan tu correo y lo que comparte el proveedor que elijas. Consulta los <a href=\"qa-review-legal.html\">Avisos legales</a>.",
      codeLabel: "Código", checkCode: "Iniciar sesión", codeNote: "Escríbelo aquí o abre el enlace del correo en este navegador. ", restart: "Empezar de nuevo", signedIn: "Sesión iniciada en este dispositivo", signOut: "Cerrar sesión",
      savedTitle: "Revisiones guardadas", savedCmps: "Comparaciones guardadas", selectAll: "Seleccionar todo", expandAll: "Expandir todo", collapseAll: "Contraer todo",
      searchHint: "Busca por sitio, URL, estado o caso", searchAria: "Buscar en las revisiones guardadas", bulkAria: "Acciones sobre las revisiones seleccionadas",
      compare: "Comparar", openTabs: "Abrir en pestañas nuevas", downloadJson: "Descargar JSON", unlock: "Desbloquear", delete: "Eliminar", clear: "Limpiar", stopNotes: "Dejar de recibir notas de seguimiento",
      compareIntro: "Pon una de tus revisiones junto a hasta cuatro más: la puntuación de salud, las seis áreas, los problemas abiertos y los indicadores que gana cada sitio. Las revisiones guardadas se comparan a partir de sus informes, sin una nueva revisión y sin cobro.",
      yourSite: "Tu sitio", compareWith: "Comparar con", pickOne: "Elige al menos otra revisión.", newSite: "O un sitio que todavía no tiene revisión", reviewCompare: "Revisar y comparar",
      newSiteNote: "Abre el informe de tu sitio con este competidor listo para comparar. Primero se revisa, por 9 USD, solo con los controles públicos y pasivos.",
      dataTitle: "Tus datos", download: "Descargar", downloadBody: "Descarga en un archivo JSON todo lo que se guarda con esta dirección: la cuenta, sus inicios de sesión, las revisiones guardadas, las notas y las alertas.", downloadBtn: "Descargar mis datos",
      deleteBody: "Eliminar borra la cuenta, sus inicios de sesión en todos los dispositivos, las revisiones guardadas, las notas, las alertas y el inicio de sesión con Google o cualquier otro proveedor. Un registro de pago se conserva cinco años, como exige la ley tributaria colombiana, sin el informe. Una baja de las notas de seguimiento se conserva, para que no vuelvan a empezar. No se puede deshacer.",
      deleteConfirm: "Escribe tu correo para confirmar", deleteBtn: "Eliminar mi cuenta y mis revisiones", footReview: "Revisar una URL", footLegal: "Avisos legales", footA11y: "Accesibilidad",
      expired: "Tu sesión terminó. Inicia sesión de nuevo para ver tus revisiones.", stopped: "Las notas de seguimiento para esta dirección se detuvieron.", stopFailed: "Las notas de seguimiento no se detuvieron. Inténtalo de nuevo en un momento.",
      gathering: "Reuniendo tus datos…", exportFailed: "Tus datos no se descargaron. Inténtalo de nuevo en un momento.", exported: "Tus datos se descargaron.",
      typeEmail: "Escribe la dirección con la que iniciaste sesión para confirmar.", deleting: "Eliminando…", deleteFailed: "La cuenta no se eliminó por completo. Inténtalo de nuevo en un momento.", deleted: "Tu cuenta y tus revisiones se eliminaron, y este dispositivo cerró la sesión.",
      fileFree: "Tu cuenta abre todos los informes.", filePass: "Esta cuenta tiene un pase de 30 días abierto hasta el {until}. Los informes hechos con este pase están abiertos. Un informe anterior se abre cuando se paga.",
      filePaid: "Los informes pagados están abiertos. En los demás se muestra el comienzo, y el resto se abre cuando se paga ese informe.", fileOpening: "Se muestra el comienzo de cada revisión. El resto se abre cuando se paga ese informe.",
      renew: "Renovar el pase {name}", upgrade: "Pasar a {name}", passTitle: "Tu pase {name}", passLeft: "Quedan {left} de {runs} revisiones, hasta el {date}. No se renueva solo.",
      passNote: "Una renovación o un cambio de plan suma 30 días desde la fecha de fin y conserva las revisiones que quedan.", buy: "Comprar {name}", passesTitle: "Pases de 30 días",
      passesBody: "Un solo pago por un paquete de revisiones durante 30 días, sin renovación automática. Cada revisión incluye el informe completo, la lista de arreglos, la exportación de casos y las alertas. Una revisión que pide más que el plan paga solo los extras.",
      planLine: "{name} · {runs} revisiones · {usd} USD · hasta {pages} páginas, {depth} enlaces de profundidad, {scope}", planAll: "todos los frameworks y herramientas, y la revisión con sesión iniciada", planSome: "{n} frameworks o herramientas por revisión",
      noRuns: "No hay ninguna revisión terminada guardada con esta dirección.", noMatch: "Ninguna revisión guardada coincide con «{q}».", countOf: "{n} de {total}", count_one: "{n} revisión", count_other: "{n} revisiones", picked: "{n} seleccionadas",
      unlockOne: "Por ahora, desbloquea un informe a la vez.", comparedYours: "Comparada con tu revisión de ", comparedWith: "Comparada con ", pick: "Seleccionar {host}", review: "Revisión", open: "Abierto", openingShown: "Comienzo visible",
      cases_one: "{n} caso", cases_other: "{n} casos", summaryCases: "Resumen y casos", casesOnly: "Casos", foldCount: "{shown} de {total}", openFull: "Abrir el informe completo", openHere: "Abrir este informe en la página de revisión",
      blocked: "El navegador bloqueó {n} de las pestañas. Permite las ventanas emergentes para este sitio y vuelve a intentarlo.", gatheringPicked: "Reuniendo las revisiones seleccionadas…", pickedFailed: "Las revisiones no se descargaron. Inténtalo de nuevo en un momento.",
      downloaded_one: "{n} revisión descargada.", downloaded_other: "{n} revisiones descargadas.", confirmDelete: "¿Eliminar {n}? Haz clic de nuevo", runsDeleteFailed: "No se eliminaron todas las revisiones. Inténtalo de nuevo en un momento.",
      deletedRuns_one: "{n} revisión eliminada.", deletedRuns_other: "{n} revisiones eliminadas.", paymentsKept: "Un registro de pago se conserva cinco años, como exige la ley tributaria colombiana, sin el informe.",
      tagOpeningShown: "comienzo visible", tagShut: "cerrado", sameSite: "mismo sitio", othersHere: "Aquí aparecen tus otras revisiones. Agrega un sitio abajo para compararlo con uno que todavía no tiene revisión.", pickCount: "({n} de {max})",
      indicator: "Indicador", health: "Puntuación de salud", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" },
      passing: "Controles aprobados (%)", openProblems: "Problemas abiertos", urgent: "Críticos y altos", whySame: "Mismo sitio. Su informe muestra la evolución entre las dos revisiones.", whyStopped: "Esta revisión se detuvo antes de tiempo.",
      whyLocked: "Se abre completo cuando se paga este informe.", whyNone: "No hay puntuaciones guardadas.", won: "Indicadores ganados (tuyos–suyos)", level: "{n} empatados", fullCompare: "Comparación completa", openReport: "Abrir el informe",
      openAll: "Abrir el informe comparativo completo", cmpFoot: "Las celdas sombreadas encabezan su línea. Comparación completa abre el cara a cara en la página de revisión: radar, velocidad y peso, los problemas que solo tiene un sitio y la presencia en el mercado. El informe comparativo completo pone lado a lado cada sección de cada informe, se guarda en Comparaciones guardadas y se imprime o descarga como PDF cuando todos sus informes están pagados.",
      saving: "Guardando la comparación…", saveFailed: "La comparación no se guardó. Inténtalo de nuevo en un momento.", cmpDeleteFailed: "La comparación no se eliminó. Inténtalo de nuevo en un momento.", cmpDeleted: "La comparación de {hosts} se eliminó. Sus revisiones siguen guardadas.",
      sideBySide: "Poniendo las revisiones lado a lado…", cmpFailed: "La comparación no se cargó. Inténtalo de nuevo en un momento.", cmpPartial: "Se comparan {shown} de {total} revisiones. Las demás explican abajo por qué.",
      enterRival: "Escribe la dirección del competidor.", sameRival: "Es el mismo sitio. Escribe la dirección de un competidor.", pickDifferent: "Elige revisiones de sitios distintos para comparar."
    },
    pt: {
      pageTitle: "Suas revisões · QA-lab URL Review", skip: "Pular para o conteúdo principal", navLive: "Relatórios ao vivo", navSocial: "Redes", navGuide: "Guia", newReview: "Nova revisão", language: "Idioma", searchLanguage: "Buscar idioma", theme: "Alternar o modo escuro",
      eyebrow: "Sua conta", title: "Suas <em>revisões</em>",
      lede: "Entre para ver as revisões salvas com o seu e-mail. Um relatório pago ou uma conta gratuita abre completo; senão, aparece o começo de cada um, e o resto abre quando esse relatório é pago.",
      returns: "Voltar dá <b>10%</b> de desconto na primeira vez em 30 dias, <b>15%</b> na segunda e <b>20%</b> depois disso. Um preço de retorno nunca fica abaixo da metade do preço de tabela.",
      signInTitle: "Entrar", signInIntro: "Use a mesma entrada da página de revisão. Um código ou link aberto em outro dispositivo ou navegador não faz entrar em lugar nenhum.",
      googleNote: "O Google compartilha o seu nome, foto, endereços de e-mail, data de nascimento, telefones, endereços, gênero e dados de trabalho, e a sua conta os mantém. Para compartilhar só o seu endereço, use o e-mail.",
      orEmail: "ou com o seu e-mail", emailLabel: "E-mail", sendCode: "Envie-me um código", legal: "Entrar armazena o seu e-mail e o que o provedor escolhido compartilha. Veja os <a href=\"qa-review-legal.html\">Avisos legais</a>.",
      codeLabel: "Código", checkCode: "Entrar", codeNote: "Digite-o aqui ou abra o link do e-mail neste navegador. ", restart: "Começar de novo", signedIn: "Sessão iniciada neste dispositivo", signOut: "Sair",
      savedTitle: "Revisões salvas", savedCmps: "Comparações salvas", selectAll: "Selecionar tudo", expandAll: "Expandir tudo", collapseAll: "Recolher tudo",
      searchHint: "Busque por site, URL, status ou caso", searchAria: "Buscar nas revisões salvas", bulkAria: "Ações nas revisões selecionadas",
      compare: "Comparar", openTabs: "Abrir em novas abas", downloadJson: "Baixar JSON", unlock: "Desbloquear", delete: "Excluir", clear: "Limpar", stopNotes: "Parar as notas de acompanhamento",
      compareIntro: "Coloque uma das suas revisões ao lado de até quatro outras: a nota de saúde, as seis áreas, os problemas abertos e os indicadores que cada site ganha. As revisões salvas são comparadas pelos relatórios, sem nova revisão e sem cobrança.",
      yourSite: "Seu site", compareWith: "Comparar com", pickOne: "Escolha pelo menos outra revisão.", newSite: "Ou um site que ainda não tem revisão", reviewCompare: "Revisar e comparar",
      newSiteNote: "Abre o relatório do seu site com este concorrente pronto para comparar. Ele é revisado antes, por 9 USD, só com as verificações públicas e passivas.",
      dataTitle: "Seus dados", download: "Baixar", downloadBody: "Baixe num arquivo JSON tudo o que fica salvo com este endereço: a conta, as entradas, as revisões salvas, as notas e os alertas.", downloadBtn: "Baixar meus dados",
      deleteBody: "Excluir apaga a conta, as entradas em todos os dispositivos, as revisões salvas, as notas, os alertas e a entrada com o Google ou qualquer outro provedor. Um comprovante de pagamento fica por cinco anos, como exige a lei tributária colombiana, sem o relatório. Uma parada das notas de acompanhamento fica, para que elas não recomecem. Não dá para desfazer.",
      deleteConfirm: "Digite o seu e-mail para confirmar", deleteBtn: "Excluir minha conta e minhas revisões", footReview: "Revisar uma URL", footLegal: "Avisos legais", footA11y: "Acessibilidade",
      expired: "A sua sessão terminou. Entre de novo para ver as suas revisões.", stopped: "As notas de acompanhamento para este endereço pararam.", stopFailed: "As notas de acompanhamento não pararam. Tente de novo em instantes.",
      gathering: "Reunindo os seus dados…", exportFailed: "Os seus dados não foram baixados. Tente de novo em instantes.", exported: "Os seus dados foram baixados.",
      typeEmail: "Digite o endereço com que você entrou para confirmar.", deleting: "Excluindo…", deleteFailed: "A conta não foi excluída por completo. Tente de novo em instantes.", deleted: "A sua conta e as suas revisões foram excluídas, e este dispositivo saiu da sessão.",
      fileFree: "A sua conta abre todos os relatórios.", filePass: "Esta conta tem um passe de 30 dias aberto até {until}. Os relatórios feitos com este passe estão abertos. Um relatório anterior abre quando é pago.",
      filePaid: "Os relatórios pagos estão abertos. Nos outros aparece o começo, e o resto abre quando esse relatório é pago.", fileOpening: "Aparece o começo de cada revisão. O resto abre quando esse relatório é pago.",
      renew: "Renovar o passe {name}", upgrade: "Mudar para {name}", passTitle: "Seu passe {name}", passLeft: "Restam {left} de {runs} revisões, até {date}. Ele não se renova sozinho.",
      passNote: "Uma renovação ou uma mudança de plano soma 30 dias a partir da data de fim e mantém as revisões restantes.", buy: "Comprar {name}", passesTitle: "Passes de 30 dias",
      passesBody: "Um só pagamento por um pacote de revisões durante 30 dias, sem renovação automática. Cada revisão inclui o relatório completo, a lista de correções, a exportação de casos e os alertas. Uma revisão que pede mais que o plano paga só os extras.",
      planLine: "{name} · {runs} revisões · {usd} USD · até {pages} páginas, {depth} links de profundidade, {scope}", planAll: "todos os frameworks e ferramentas, e a revisão com sessão iniciada", planSome: "{n} frameworks ou ferramentas por revisão",
      noRuns: "Nenhuma revisão concluída está salva com este endereço.", noMatch: "Nenhuma revisão salva corresponde a “{q}”.", countOf: "{n} de {total}", count_one: "{n} revisão", count_other: "{n} revisões", picked: "{n} selecionadas",
      unlockOne: "Por enquanto, desbloqueie um relatório por vez.", comparedYours: "Comparada com a sua revisão de ", comparedWith: "Comparada com ", pick: "Selecionar {host}", review: "Revisão", open: "Aberto", openingShown: "Começo visível",
      cases_one: "{n} caso", cases_other: "{n} casos", summaryCases: "Resumo e casos", casesOnly: "Casos", foldCount: "{shown} de {total}", openFull: "Abrir o relatório completo", openHere: "Abrir este relatório na página de revisão",
      blocked: "O navegador bloqueou {n} das abas. Permita pop-ups para este site e tente de novo.", gatheringPicked: "Reunindo as revisões selecionadas…", pickedFailed: "As revisões não foram baixadas. Tente de novo em instantes.",
      downloaded_one: "{n} revisão baixada.", downloaded_other: "{n} revisões baixadas.", confirmDelete: "Excluir {n}? Clique de novo", runsDeleteFailed: "Nem todas as revisões foram excluídas. Tente de novo em instantes.",
      deletedRuns_one: "{n} revisão excluída.", deletedRuns_other: "{n} revisões excluídas.", paymentsKept: "Um comprovante de pagamento fica por cinco anos, como exige a lei tributária colombiana, sem o relatório.",
      tagOpeningShown: "começo visível", tagShut: "fechado", sameSite: "mesmo site", othersHere: "As suas outras revisões aparecem aqui. Adicione um site abaixo para comparar com um que ainda não tem revisão.", pickCount: "({n} de {max})",
      indicator: "Indicador", health: "Nota de saúde", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" },
      passing: "Verificações aprovadas (%)", openProblems: "Problemas abertos", urgent: "Críticos e altos", whySame: "Mesmo site. O relatório dele mostra a evolução entre as duas revisões.", whyStopped: "Esta revisão parou antes do fim.",
      whyLocked: "Abre completo quando este relatório é pago.", whyNone: "Nenhuma nota salva.", won: "Indicadores ganhos (seus–deles)", level: "{n} empatados", fullCompare: "Comparação completa", openReport: "Abrir o relatório",
      openAll: "Abrir o relatório comparativo completo", cmpFoot: "As células sombreadas lideram a sua linha. Comparação completa abre o frente a frente na página de revisão: radar, velocidade e peso, os problemas que só um site tem e a presença no mercado. O relatório comparativo completo põe lado a lado cada seção de cada relatório, fica em Comparações salvas e pode ser impresso ou baixado em PDF quando todos os relatórios dele estão pagos.",
      saving: "Salvando a comparação…", saveFailed: "A comparação não foi salva. Tente de novo em instantes.", cmpDeleteFailed: "A comparação não foi excluída. Tente de novo em instantes.", cmpDeleted: "A comparação de {hosts} foi excluída. As revisões dela continuam salvas.",
      sideBySide: "Colocando as revisões lado a lado…", cmpFailed: "A comparação não carregou. Tente de novo em instantes.", cmpPartial: "{shown} de {total} revisões foram comparadas. As outras explicam abaixo o motivo.",
      enterRival: "Digite o endereço do concorrente.", sameRival: "É o mesmo site. Digite o endereço de um concorrente.", pickDifferent: "Escolha revisões de sites diferentes para comparar."
    },
    de: {
      pageTitle: "Ihre Prüfungen · QA-lab URL Review", skip: "Zum Hauptinhalt springen", navLive: "Live-Berichte", navSocial: "Social", navGuide: "Leitfaden", newReview: "Neue Prüfung", language: "Sprache", searchLanguage: "Sprache suchen", theme: "Dunkelmodus umschalten",
      eyebrow: "Ihr Konto", title: "Ihre <em>Prüfungen</em>",
      lede: "Melden Sie sich an, um die unter Ihrer E-Mail-Adresse gespeicherten Prüfungen zu sehen. Ein bezahlter Bericht oder ein kostenloses Konto öffnet sich vollständig; sonst ist der Anfang jedes Berichts zu sehen, und der Rest öffnet sich, wenn dieser Bericht bezahlt ist.",
      returns: "Wer wiederkommt, erhält beim ersten Mal in 30 Tagen <b>10 %</b>, beim zweiten <b>15 %</b> und danach <b>20 %</b> Rabatt. Ein Wiederkehrerpreis liegt nie unter der Hälfte des Listenpreises.",
      signInTitle: "Anmelden", signInIntro: "Nutzen Sie dieselbe Anmeldung wie auf der Prüfungsseite. Ein Code oder Link, der auf einem anderen Gerät oder in einem anderen Browser geöffnet wird, meldet nirgends an.",
      googleNote: "Google teilt Ihren Namen, Ihr Foto, Ihre E-Mail-Adressen, Ihr Geburtsdatum, Ihre Telefonnummern, Adressen, Ihr Geschlecht und Ihre beruflichen Angaben, und Ihr Konto speichert sie. Um nur Ihre Adresse zu teilen, nutzen Sie die E-Mail.",
      orEmail: "oder mit Ihrer E-Mail-Adresse", emailLabel: "E-Mail", sendCode: "Code per E-Mail senden", legal: "Bei der Anmeldung werden Ihre E-Mail-Adresse und die Angaben gespeichert, die der gewählte Anbieter teilt. Siehe <a href=\"qa-review-legal.html\">Hinweise</a>.",
      codeLabel: "Code", checkCode: "Anmelden", codeNote: "Geben Sie ihn hier ein oder öffnen Sie den Link aus der E-Mail in diesem Browser. ", restart: "Neu beginnen", signedIn: "Auf diesem Gerät angemeldet", signOut: "Abmelden",
      savedTitle: "Gespeicherte Prüfungen", savedCmps: "Gespeicherte Vergleiche", selectAll: "Alle auswählen", expandAll: "Alle aufklappen", collapseAll: "Alle zuklappen",
      searchHint: "Nach Website, URL, Status oder Fall suchen", searchAria: "Gespeicherte Prüfungen durchsuchen", bulkAria: "Aktionen für die ausgewählten Prüfungen",
      compare: "Vergleichen", openTabs: "In neuen Tabs öffnen", downloadJson: "JSON herunterladen", unlock: "Freischalten", delete: "Löschen", clear: "Leeren", stopNotes: "Folgehinweise stoppen",
      compareIntro: "Stellen Sie eine Ihrer Prüfungen neben bis zu vier andere: die Gesundheitsbewertung, die sechs Bereiche, die offenen Probleme und die Kennzahlen, die jede Website gewinnt. Gespeicherte Prüfungen werden anhand ihrer Berichte verglichen, ohne neue Prüfung und ohne Kosten.",
      yourSite: "Ihre Website", compareWith: "Vergleichen mit", pickOne: "Wählen Sie mindestens eine weitere Prüfung.", newSite: "Oder eine Website ohne bisherige Prüfung", reviewCompare: "Prüfen und vergleichen",
      newSiteNote: "Öffnet den Bericht Ihrer Website mit diesem Mitbewerber, bereit zum Vergleich. Er wird zuerst geprüft, für 9 USD, nur mit den öffentlichen, passiven Prüfungen.",
      dataTitle: "Ihre Daten", download: "Herunterladen", downloadBody: "Laden Sie alles, was unter dieser Adresse gespeichert ist, als JSON-Datei herunter: das Konto, seine Anmeldungen, gespeicherte Prüfungen, Hinweise und Warnungen.", downloadBtn: "Meine Daten herunterladen",
      deleteBody: "Das Löschen entfernt das Konto, seine Anmeldungen auf allen Geräten, gespeicherte Prüfungen, Hinweise, Warnungen und die Anmeldung mit Google oder einem anderen Anbieter. Ein Zahlungsbeleg bleibt fünf Jahre erhalten, wie es das kolumbianische Steuerrecht verlangt, ohne den Bericht. Ein Stopp der Folgehinweise bleibt bestehen, damit sie nicht wieder beginnen. Das kann nicht rückgängig gemacht werden.",
      deleteConfirm: "Geben Sie zur Bestätigung Ihre E-Mail-Adresse ein", deleteBtn: "Mein Konto und meine Prüfungen löschen", footReview: "Eine URL prüfen", footLegal: "Hinweise", footA11y: "Barrierefreiheit",
      expired: "Ihre Anmeldung ist abgelaufen. Melden Sie sich erneut an, um Ihre Prüfungen zu sehen.", stopped: "Die Folgehinweise für diese Adresse sind gestoppt.", stopFailed: "Die Folgehinweise wurden nicht gestoppt. Versuchen Sie es gleich noch einmal.",
      gathering: "Ihre Daten werden gesammelt …", exportFailed: "Ihre Daten wurden nicht heruntergeladen. Versuchen Sie es gleich noch einmal.", exported: "Ihre Daten sind heruntergeladen.",
      typeEmail: "Geben Sie zur Bestätigung die Adresse ein, mit der Sie angemeldet sind.", deleting: "Wird gelöscht …", deleteFailed: "Das Konto wurde nicht vollständig gelöscht. Versuchen Sie es gleich noch einmal.", deleted: "Ihr Konto und Ihre Prüfungen sind gelöscht, und dieses Gerät ist abgemeldet.",
      fileFree: "Ihr Konto öffnet jeden Bericht.", filePass: "Auf diesem Konto ist bis {until} ein 30-Tage-Pass aktiv. Mit diesem Pass erstellte Berichte sind geöffnet. Ein älterer Bericht öffnet sich, wenn er bezahlt ist.",
      filePaid: "Bezahlte Berichte sind geöffnet. Bei den anderen ist der Anfang zu sehen, und der Rest öffnet sich, wenn dieser Bericht bezahlt ist.", fileOpening: "Der Anfang jeder Prüfung ist zu sehen. Der Rest öffnet sich, wenn dieser Bericht bezahlt ist.",
      renew: "Pass {name} verlängern", upgrade: "Auf {name} wechseln", passTitle: "Ihr Pass {name}", passLeft: "Noch {left} von {runs} Prüfungen, bis {date}. Er verlängert sich nicht von selbst.",
      passNote: "Eine Verlängerung oder ein Wechsel fügt 30 Tage ab dem Enddatum hinzu und behält die übrigen Prüfungen.", buy: "{name} kaufen", passesTitle: "30-Tage-Pässe",
      passesBody: "Eine Zahlung für ein Paket von Prüfungen über 30 Tage, ohne automatische Verlängerung. Jede Prüfung enthält den vollständigen Bericht, die Fix-Liste, den Export der Fälle und Warnungen. Eine Prüfung, die mehr als der Plan verlangt, zahlt nur die Extras.",
      planLine: "{name} · {runs} Prüfungen · {usd} USD · bis zu {pages} Seiten, {depth} Links tief, {scope}", planAll: "alle Frameworks und Tools sowie die angemeldete Prüfung", planSome: "{n} Frameworks oder Tools je Prüfung",
      noRuns: "Für diese Adresse ist keine abgeschlossene Prüfung gespeichert.", noMatch: "Keine gespeicherte Prüfung passt zu „{q}“.", countOf: "{n} von {total}", count_one: "{n} Prüfung", count_other: "{n} Prüfungen", picked: "{n} ausgewählt",
      unlockOne: "Schalten Sie vorerst einen Bericht nach dem anderen frei.", comparedYours: "Verglichen mit Ihrer Prüfung von ", comparedWith: "Verglichen mit ", pick: "{host} auswählen", review: "Prüfung", open: "Geöffnet", openingShown: "Anfang sichtbar",
      cases_one: "{n} Fall", cases_other: "{n} Fälle", summaryCases: "Zusammenfassung und Fälle", casesOnly: "Fälle", foldCount: "{shown} von {total}", openFull: "Den vollständigen Bericht öffnen", openHere: "Diesen Bericht auf der Prüfungsseite öffnen",
      blocked: "Der Browser hat {n} der Tabs blockiert. Erlauben Sie Pop-ups für diese Website und versuchen Sie es erneut.", gatheringPicked: "Die ausgewählten Prüfungen werden gesammelt …", pickedFailed: "Die Prüfungen wurden nicht heruntergeladen. Versuchen Sie es gleich noch einmal.",
      downloaded_one: "{n} Prüfung heruntergeladen.", downloaded_other: "{n} Prüfungen heruntergeladen.", confirmDelete: "{n} löschen? Noch einmal klicken", runsDeleteFailed: "Nicht alle Prüfungen wurden gelöscht. Versuchen Sie es gleich noch einmal.",
      deletedRuns_one: "{n} Prüfung gelöscht.", deletedRuns_other: "{n} Prüfungen gelöscht.", paymentsKept: "Ein Zahlungsbeleg bleibt fünf Jahre erhalten, wie es das kolumbianische Steuerrecht verlangt, ohne den Bericht.",
      tagOpeningShown: "Anfang sichtbar", tagShut: "geschlossen", sameSite: "dieselbe Website", othersHere: "Ihre anderen Prüfungen erscheinen hier. Fügen Sie unten eine Website hinzu, um mit einer zu vergleichen, die noch keine Prüfung hat.", pickCount: "({n} von {max})",
      indicator: "Kennzahl", health: "Gesundheitsbewertung", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Leistung" },
      passing: "Bestandene Prüfungen (%)", openProblems: "Offene Probleme", urgent: "Kritisch und hoch", whySame: "Dieselbe Website. Ihr Bericht zeigt den Verlauf zwischen den beiden Prüfungen.", whyStopped: "Diese Prüfung wurde vorzeitig gestoppt.",
      whyLocked: "Öffnet sich vollständig, sobald dieser Bericht bezahlt ist.", whyNone: "Keine Bewertungen gespeichert.", won: "Gewonnene Kennzahlen (Ihre–deren)", level: "{n} gleichauf", fullCompare: "Vollständiger Vergleich", openReport: "Bericht öffnen",
      openAll: "Den vollständigen Vergleichsbericht öffnen", cmpFoot: "Schattierte Zellen führen ihre Zeile an. „Vollständiger Vergleich“ öffnet das direkte Duell auf der Prüfungsseite: Radar, Tempo und Gewicht, die Probleme, die nur eine Website hat, und die Marktpräsenz. Der vollständige Vergleichsbericht stellt jeden Abschnitt jedes Berichts nebeneinander, liegt unter „Gespeicherte Vergleiche“ und lässt sich als PDF drucken oder herunterladen, sobald jeder Bericht darin bezahlt ist.",
      saving: "Der Vergleich wird gespeichert …", saveFailed: "Der Vergleich wurde nicht gespeichert. Versuchen Sie es gleich noch einmal.", cmpDeleteFailed: "Der Vergleich wurde nicht gelöscht. Versuchen Sie es gleich noch einmal.", cmpDeleted: "Der Vergleich von {hosts} ist gelöscht. Die Prüfungen darin bleiben gespeichert.",
      sideBySide: "Die Prüfungen werden nebeneinandergestellt …", cmpFailed: "Der Vergleich wurde nicht geladen. Versuchen Sie es gleich noch einmal.", cmpPartial: "{shown} von {total} Prüfungen werden verglichen. Bei den anderen steht unten, warum nicht.",
      enterRival: "Geben Sie die Adresse des Mitbewerbers ein.", sameRival: "Das ist dieselbe Website. Geben Sie die Adresse eines Mitbewerbers ein.", pickDifferent: "Wählen Sie Prüfungen verschiedener Websites zum Vergleich."
    },
    fr: {
      pageTitle: "Vos revues · QA-lab URL Review", skip: "Aller au contenu principal", navLive: "Rapports en direct", navSocial: "Réseaux", navGuide: "Guide", newReview: "Nouvelle revue", language: "Langue", searchLanguage: "Rechercher une langue", theme: "Basculer le mode sombre",
      eyebrow: "Votre compte", title: "Vos <em>revues</em>",
      lede: "Connectez-vous pour voir les revues enregistrées sous votre adresse e-mail. Un rapport payé ou un compte gratuit s’ouvre en entier ; sinon, le début de chacun s’affiche, et le reste s’ouvre quand ce rapport est payé.",
      returns: "Revenir retire <b>10 %</b> la première fois en 30 jours, <b>15 %</b> la deuxième et <b>20 %</b> ensuite. Un prix de retour ne descend jamais sous la moitié du prix catalogue.",
      signInTitle: "Connexion", signInIntro: "Utilisez la même connexion que sur la page de revue. Un code ou un lien ouvert sur un autre appareil ou navigateur ne connecte nulle part.",
      googleNote: "Google partage votre nom, votre photo, vos adresses e-mail, votre date de naissance, vos numéros de téléphone, vos adresses, votre genre et vos informations professionnelles, et votre compte les garde. Pour ne partager que votre adresse, utilisez l’e-mail.",
      orEmail: "ou avec votre adresse e-mail", emailLabel: "E-mail", sendCode: "M’envoyer un code", legal: "La connexion enregistre votre adresse e-mail et ce que partage le fournisseur choisi. Voir les <a href=\"qa-review-legal.html\">Avertissements</a>.",
      codeLabel: "Code", checkCode: "Se connecter", codeNote: "Saisissez-le ici, ou ouvrez le lien de l’e-mail dans ce navigateur. ", restart: "Recommencer", signedIn: "Connecté sur cet appareil", signOut: "Se déconnecter",
      savedTitle: "Revues enregistrées", savedCmps: "Comparaisons enregistrées", selectAll: "Tout sélectionner", expandAll: "Tout déplier", collapseAll: "Tout replier",
      searchHint: "Rechercher par site, URL, statut ou cas", searchAria: "Rechercher dans les revues enregistrées", bulkAria: "Actions sur les revues sélectionnées",
      compare: "Comparer", openTabs: "Ouvrir dans de nouveaux onglets", downloadJson: "Télécharger le JSON", unlock: "Débloquer", delete: "Supprimer", clear: "Effacer", stopNotes: "Arrêter les notes de suivi",
      compareIntro: "Placez l’une de vos revues à côté de quatre autres au plus : le score de santé, les six domaines, les problèmes ouverts et les indicateurs que chaque site remporte. Les revues enregistrées sont comparées à partir de leurs rapports, sans nouvelle revue ni frais.",
      yourSite: "Votre site", compareWith: "Comparer avec", pickOne: "Choisissez au moins une autre revue.", newSite: "Ou un site sans revue pour l’instant", reviewCompare: "Analyser et comparer",
      newSiteNote: "Ouvre le rapport de votre site avec ce concurrent prêt à comparer. Il est d’abord analysé, pour 9 USD, avec les seuls contrôles publics et passifs.",
      dataTitle: "Vos données", download: "Télécharger", downloadBody: "Téléchargez dans un fichier JSON tout ce qui est conservé sous cette adresse : le compte, ses connexions, les revues enregistrées, les notes et les alertes.", downloadBtn: "Télécharger mes données",
      deleteBody: "La suppression efface le compte, ses connexions sur tous les appareils, les revues enregistrées, les notes, les alertes et la connexion avec Google ou tout autre fournisseur. Une trace de paiement reste cinq ans, comme l’exige le droit fiscal colombien, sans le rapport. Un arrêt des notes de suivi reste, pour qu’elles ne reprennent pas. Cette action est définitive.",
      deleteConfirm: "Saisissez votre adresse e-mail pour confirmer", deleteBtn: "Supprimer mon compte et mes revues", footReview: "Analyser une URL", footLegal: "Avertissements", footA11y: "Accessibilité",
      expired: "Votre connexion a expiré. Reconnectez-vous pour voir vos revues.", stopped: "Les notes de suivi pour cette adresse sont arrêtées.", stopFailed: "Les notes de suivi ne se sont pas arrêtées. Réessayez dans un instant.",
      gathering: "Collecte de vos données…", exportFailed: "Vos données ne se sont pas téléchargées. Réessayez dans un instant.", exported: "Vos données sont téléchargées.",
      typeEmail: "Saisissez l’adresse avec laquelle vous êtes connecté pour confirmer.", deleting: "Suppression…", deleteFailed: "Le compte n’a pas été entièrement supprimé. Réessayez dans un instant.", deleted: "Votre compte et vos revues sont supprimés, et cet appareil est déconnecté.",
      fileFree: "Votre compte ouvre tous les rapports.", filePass: "Un pass de 30 jours est ouvert sur ce compte jusqu’au {until}. Les rapports lancés avec ce pass sont ouverts. Un rapport plus ancien s’ouvre quand il est payé.",
      filePaid: "Les rapports payés sont ouverts. Pour les autres, le début s’affiche, et le reste s’ouvre quand ce rapport est payé.", fileOpening: "Le début de chaque revue s’affiche. Le reste s’ouvre quand ce rapport est payé.",
      renew: "Renouveler le pass {name}", upgrade: "Passer à {name}", passTitle: "Votre pass {name}", passLeft: "Il reste {left} revues sur {runs}, jusqu’au {date}. Il ne se renouvelle pas tout seul.",
      passNote: "Un renouvellement ou un changement de formule ajoute 30 jours à la date de fin et garde les revues restantes.", buy: "Acheter {name}", passesTitle: "Pass de 30 jours",
      passesBody: "Un seul paiement pour un lot de revues sur 30 jours, sans renouvellement automatique. Chaque revue comprend le rapport complet, la liste de corrections, l’export des cas et les alertes. Une revue qui demande plus que la formule ne paie que les extras.",
      planLine: "{name} · {runs} revues · {usd} USD · jusqu’à {pages} pages, {depth} liens de profondeur, {scope}", planAll: "tous les frameworks et outils, et la revue connectée", planSome: "{n} frameworks ou outils par revue",
      noRuns: "Aucune revue terminée n’est enregistrée pour cette adresse.", noMatch: "Aucune revue enregistrée ne correspond à « {q} ».", countOf: "{n} sur {total}", count_one: "{n} revue", count_other: "{n} revues", picked: "{n} sélectionnées",
      unlockOne: "Pour l’instant, débloquez un rapport à la fois.", comparedYours: "Comparée à votre revue de ", comparedWith: "Comparée à ", pick: "Sélectionner {host}", review: "Revue", open: "Ouvert", openingShown: "Début visible",
      cases_one: "{n} cas", cases_other: "{n} cas", summaryCases: "Résumé et cas", casesOnly: "Cas", foldCount: "{shown} sur {total}", openFull: "Ouvrir le rapport complet", openHere: "Ouvrir ce rapport sur la page de revue",
      blocked: "Le navigateur a bloqué {n} des onglets. Autorisez les fenêtres pop-up pour ce site et réessayez.", gatheringPicked: "Collecte des revues sélectionnées…", pickedFailed: "Les revues ne se sont pas téléchargées. Réessayez dans un instant.",
      downloaded_one: "{n} revue téléchargée.", downloaded_other: "{n} revues téléchargées.", confirmDelete: "Supprimer {n} ? Cliquez de nouveau", runsDeleteFailed: "Les revues n’ont pas toutes été supprimées. Réessayez dans un instant.",
      deletedRuns_one: "{n} revue supprimée.", deletedRuns_other: "{n} revues supprimées.", paymentsKept: "Une trace de paiement reste cinq ans, comme l’exige le droit fiscal colombien, sans le rapport.",
      tagOpeningShown: "début visible", tagShut: "fermé", sameSite: "même site", othersHere: "Vos autres revues s’affichent ici. Ajoutez un site ci-dessous pour comparer avec un site qui n’a pas encore de revue.", pickCount: "({n} sur {max})",
      indicator: "Indicateur", health: "Score de santé", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" },
      passing: "Contrôles réussis (%)", openProblems: "Problèmes ouverts", urgent: "Critiques et élevés", whySame: "Même site. Son rapport montre l’évolution entre les deux revues.", whyStopped: "Cette revue s’est arrêtée avant la fin.",
      whyLocked: "S’ouvre en entier une fois ce rapport payé.", whyNone: "Aucun score enregistré.", won: "Indicateurs remportés (les vôtres–les leurs)", level: "{n} à égalité", fullCompare: "Comparaison complète", openReport: "Ouvrir le rapport",
      openAll: "Ouvrir le rapport comparatif complet", cmpFoot: "Les cellules ombrées mènent leur ligne. « Comparaison complète » ouvre le face-à-face sur la page de revue : radar, vitesse et poids, les problèmes propres à un seul site et la présence sur le marché. Le rapport comparatif complet place chaque section de chaque rapport côte à côte, est gardé dans « Comparaisons enregistrées » et s’imprime ou se télécharge en PDF une fois tous ses rapports payés.",
      saving: "Enregistrement de la comparaison…", saveFailed: "La comparaison n’a pas été enregistrée. Réessayez dans un instant.", cmpDeleteFailed: "La comparaison n’a pas été supprimée. Réessayez dans un instant.", cmpDeleted: "La comparaison de {hosts} est supprimée. Ses revues restent enregistrées.",
      sideBySide: "Mise côte à côte des revues…", cmpFailed: "La comparaison ne s’est pas chargée. Réessayez dans un instant.", cmpPartial: "{shown} revues sur {total} sont comparées. Les autres indiquent pourquoi ci-dessous.",
      enterRival: "Saisissez l’adresse du concurrent.", sameRival: "C’est le même site. Saisissez l’adresse d’un concurrent.", pickDifferent: "Choisissez des revues de sites différents à comparer."
    },
    it: {
      pageTitle: "Le tue revisioni · QA-lab URL Review", skip: "Vai al contenuto principale", navLive: "Report dal vivo", navSocial: "Social", navGuide: "Guida", newReview: "Nuova revisione", language: "Lingua", searchLanguage: "Cerca lingua", theme: "Attiva o disattiva la modalità scura",
      eyebrow: "Il tuo account", title: "Le tue <em>revisioni</em>",
      lede: "Accedi per vedere le revisioni salvate con la tua email. Un report pagato o un account gratuito si apre per intero; altrimenti si vede l’inizio di ciascuno, e il resto si apre quando quel report è pagato.",
      returns: "Tornare toglie il <b>10%</b> la prima volta in 30 giorni, il <b>15%</b> la seconda e il <b>20%</b> dopo. Un prezzo di ritorno non scende mai sotto la metà del prezzo di listino.",
      signInTitle: "Accedi", signInIntro: "Usa lo stesso accesso della pagina di revisione. Un codice o un link aperto su un altro dispositivo o browser non fa accedere da nessuna parte.",
      googleNote: "Google condivide nome, foto, indirizzi email, data di nascita, numeri di telefono, indirizzi, genere e dati di lavoro, e il tuo account li conserva. Per condividere solo il tuo indirizzo, usa l’email.",
      orEmail: "o con la tua email", emailLabel: "Email", sendCode: "Inviami un codice", legal: "L’accesso salva la tua email e ciò che condivide il provider che scegli. Vedi le <a href=\"qa-review-legal.html\">Avvertenze</a>.",
      codeLabel: "Codice", checkCode: "Accedi", codeNote: "Scrivilo qui o apri il link dell’email in questo browser. ", restart: "Ricomincia", signedIn: "Accesso effettuato su questo dispositivo", signOut: "Esci",
      savedTitle: "Revisioni salvate", savedCmps: "Confronti salvati", selectAll: "Seleziona tutto", expandAll: "Espandi tutto", collapseAll: "Comprimi tutto",
      searchHint: "Cerca per sito, URL, stato o caso", searchAria: "Cerca nelle revisioni salvate", bulkAria: "Azioni sulle revisioni selezionate",
      compare: "Confronta", openTabs: "Apri in nuove schede", downloadJson: "Scarica JSON", unlock: "Sblocca", delete: "Elimina", clear: "Pulisci", stopNotes: "Ferma le note di follow-up",
      compareIntro: "Metti una delle tue revisioni accanto a un massimo di altre quattro: il punteggio di salute, le sei aree, i problemi aperti e gli indicatori che vince ogni sito. Le revisioni salvate si confrontano dai loro report, senza una nuova revisione e senza costi.",
      yourSite: "Il tuo sito", compareWith: "Confronta con", pickOne: "Scegli almeno un’altra revisione.", newSite: "Oppure un sito che non ha ancora una revisione", reviewCompare: "Analizza e confronta",
      newSiteNote: "Apre il report del tuo sito con questo concorrente pronto da confrontare. Prima viene analizzato, per 9 USD, solo con i controlli pubblici e passivi.",
      dataTitle: "I tuoi dati", download: "Scarica", downloadBody: "Scarica in un file JSON tutto ciò che è conservato con questo indirizzo: l’account, i suoi accessi, le revisioni salvate, le note e gli avvisi.", downloadBtn: "Scarica i miei dati",
      deleteBody: "L’eliminazione cancella l’account, i suoi accessi su ogni dispositivo, le revisioni salvate, le note, gli avvisi e l’accesso con Google o qualsiasi altro provider. Una registrazione di pagamento resta per cinque anni, come richiede la legge fiscale colombiana, senza il report. Uno stop alle note di follow-up resta, così non ricominciano. Non si può annullare.",
      deleteConfirm: "Scrivi la tua email per confermare", deleteBtn: "Elimina il mio account e le mie revisioni", footReview: "Analizza un URL", footLegal: "Avvertenze", footA11y: "Accessibilità",
      expired: "Il tuo accesso è scaduto. Accedi di nuovo per vedere le tue revisioni.", stopped: "Le note di follow-up per questo indirizzo sono ferme.", stopFailed: "Le note di follow-up non si sono fermate. Riprova tra un momento.",
      gathering: "Raccolta dei tuoi dati…", exportFailed: "I tuoi dati non sono stati scaricati. Riprova tra un momento.", exported: "I tuoi dati sono stati scaricati.",
      typeEmail: "Scrivi l’indirizzo con cui hai effettuato l’accesso per confermare.", deleting: "Eliminazione…", deleteFailed: "L’account non è stato eliminato del tutto. Riprova tra un momento.", deleted: "Il tuo account e le tue revisioni sono stati eliminati, e questo dispositivo è uscito.",
      fileFree: "Il tuo account apre ogni report.", filePass: "Su questo account è attivo un pass di 30 giorni fino al {until}. I report eseguiti con questo pass sono aperti. Un report precedente si apre quando viene pagato.",
      filePaid: "I report pagati sono aperti. Per gli altri si vede l’inizio, e il resto si apre quando quel report è pagato.", fileOpening: "Si vede l’inizio di ogni revisione. Il resto si apre quando quel report è pagato.",
      renew: "Rinnova il pass {name}", upgrade: "Passa a {name}", passTitle: "Il tuo pass {name}", passLeft: "Restano {left} revisioni su {runs}, fino al {date}. Non si rinnova da solo.",
      passNote: "Un rinnovo o un passaggio di piano aggiunge 30 giorni dalla data di fine e mantiene le revisioni rimaste.", buy: "Acquista {name}", passesTitle: "Pass di 30 giorni",
      passesBody: "Un unico pagamento per un pacchetto di revisioni in 30 giorni, senza rinnovo automatico. Ogni revisione include il report completo, la lista di correzioni, l’export dei casi e gli avvisi. Una revisione che chiede più del piano paga solo gli extra.",
      planLine: "{name} · {runs} revisioni · {usd} USD · fino a {pages} pagine, {depth} link di profondità, {scope}", planAll: "tutti i framework e gli strumenti, e la revisione con accesso", planSome: "{n} framework o strumenti per revisione",
      noRuns: "Nessuna revisione completata è salvata per questo indirizzo.", noMatch: "Nessuna revisione salvata corrisponde a «{q}».", countOf: "{n} di {total}", count_one: "{n} revisione", count_other: "{n} revisioni", picked: "{n} selezionate",
      unlockOne: "Per ora sblocca un report alla volta.", comparedYours: "Confrontata con la tua revisione di ", comparedWith: "Confrontata con ", pick: "Seleziona {host}", review: "Revisione", open: "Aperto", openingShown: "Inizio visibile",
      cases_one: "{n} caso", cases_other: "{n} casi", summaryCases: "Riepilogo e casi", casesOnly: "Casi", foldCount: "{shown} di {total}", openFull: "Apri il report completo", openHere: "Apri questo report nella pagina di revisione",
      blocked: "Il browser ha bloccato {n} delle schede. Consenti i pop-up per questo sito e riprova.", gatheringPicked: "Raccolta delle revisioni selezionate…", pickedFailed: "Le revisioni non sono state scaricate. Riprova tra un momento.",
      downloaded_one: "{n} revisione scaricata.", downloaded_other: "{n} revisioni scaricate.", confirmDelete: "Eliminare {n}? Clicca di nuovo", runsDeleteFailed: "Non tutte le revisioni sono state eliminate. Riprova tra un momento.",
      deletedRuns_one: "{n} revisione eliminata.", deletedRuns_other: "{n} revisioni eliminate.", paymentsKept: "Una registrazione di pagamento resta per cinque anni, come richiede la legge fiscale colombiana, senza il report.",
      tagOpeningShown: "inizio visibile", tagShut: "chiuso", sameSite: "stesso sito", othersHere: "Qui compaiono le tue altre revisioni. Aggiungi un sito qui sotto per confrontarlo con uno che non ha ancora una revisione.", pickCount: "({n} di {max})",
      indicator: "Indicatore", health: "Punteggio di salute", areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" },
      passing: "Controlli superati (%)", openProblems: "Problemi aperti", urgent: "Critici e alti", whySame: "Stesso sito. Il suo report mostra l’andamento tra le due revisioni.", whyStopped: "Questa revisione si è fermata prima della fine.",
      whyLocked: "Si apre per intero quando questo report è pagato.", whyNone: "Nessun punteggio salvato.", won: "Indicatori vinti (tuoi–loro)", level: "{n} in parità", fullCompare: "Confronto completo", openReport: "Apri il report",
      openAll: "Apri il report comparativo completo", cmpFoot: "Le celle ombreggiate guidano la loro riga. Confronto completo apre il testa a testa nella pagina di revisione: radar, velocità e peso, i problemi che ha un solo sito e la presenza sul mercato. Il report comparativo completo mette fianco a fianco ogni sezione di ogni report, resta in Confronti salvati e si stampa o si scarica in PDF quando ogni report che contiene è pagato.",
      saving: "Salvataggio del confronto…", saveFailed: "Il confronto non è stato salvato. Riprova tra un momento.", cmpDeleteFailed: "Il confronto non è stato eliminato. Riprova tra un momento.", cmpDeleted: "Il confronto di {hosts} è stato eliminato. Le sue revisioni restano salvate.",
      sideBySide: "Revisioni messe fianco a fianco…", cmpFailed: "Il confronto non si è caricato. Riprova tra un momento.", cmpPartial: "Sono confrontate {shown} revisioni su {total}. Le altre spiegano sotto il perché.",
      enterRival: "Scrivi l’indirizzo del concorrente.", sameRival: "È lo stesso sito. Scrivi l’indirizzo di un concorrente.", pickDifferent: "Scegli revisioni di siti diversi da confrontare."
    }
  };

  let code = "en";
  const book = (lang) => COPY[lang] || COPY.en;

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }

  // t("count", { n }) picks count_one or count_other when the key has plural forms.
  function t(key, vars) {
    const plural = vars && typeof vars.n === "number" && COPY.en[key + "_one"] ? key + (vars.n === 1 ? "_one" : "_other") : key;
    const own = book(code)[plural];
    return fill(own != null ? own : COPY.en[plural], vars);
  }

  function area(name) {
    return book(code).areas[name] || name;
  }

  // Hand-written languages keep machine translation off the page; any other language is left English for it.
  function paint() {
    const own = code !== "en" && !!COPY[code];
    document.title = t("pageTitle");
    document.querySelectorAll("[data-account-copy]").forEach((node) => { node.textContent = t(node.getAttribute("data-account-copy")); });
    document.querySelectorAll("[data-account-html]").forEach((node) => { node.innerHTML = t(node.getAttribute("data-account-html")); });
    document.querySelectorAll("[data-account-placeholder]").forEach((node) => { node.placeholder = t(node.getAttribute("data-account-placeholder")); });
    document.querySelectorAll("[data-account-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.getAttribute("data-account-aria"))); });
    document.querySelectorAll("main, .topbar, .foot").forEach((node) => {
      if (own) {
        node.setAttribute("lang", code);
        node.setAttribute("translate", "no");
      } else {
        node.removeAttribute("lang");
        node.removeAttribute("translate");
      }
    });
  }

  function use(lang) {
    code = String(lang || "en").slice(0, 2).toLowerCase();
    paint();
  }

  window.QAAccountCopy = { t, area, use, lang: () => (COPY[code] ? code : "en") };
})();
