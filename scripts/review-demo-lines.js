/* Situational lines: why the control is there, and how it helps. */
const LINES = {
  "01-disclaimers": {
    en: "You are about to read a public page, and the review stays locked until you accept what it will and will not do. Those acknowledgements protect you and the site. Accept them, and the request opens.",
    es: "Vas a leer una página pública, y la revisión sigue cerrada hasta que aceptes lo que hará y lo que no hará. Esas declaraciones te protegen a ti y al sitio. Acéptalas, y el pedido se abre.",
    pt: "Você vai ler uma página pública, e a revisão fica fechada até você aceitar o que ela faz e o que não faz. Essas declarações protegem você e o site. Aceite, e o pedido se abre.",
    de: "Sie lesen gleich eine öffentliche Seite, und die Prüfung bleibt zu, bis Sie annehmen, was sie tut und was nicht. Diese Erklärungen schützen Sie und die Seite. Nehmen Sie sie an, und die Anfrage öffnet sich.",
    fr: "Vous allez lire une page publique, et la revue reste fermée tant que vous n’acceptez pas ce qu’elle fera et ce qu’elle ne fera pas. Ces déclarations vous protègent, ainsi que le site. Acceptez-les, et la demande s’ouvre.",
    it: "Stai per leggere una pagina pubblica, e la revisione resta chiusa finché non accetti cosa farà e cosa non farà. Quelle dichiarazioni proteggono te e il sito. Accettale, e la richiesta si apre."
  },
  "reason-own": {
    en: "The site is yours, and you want a case list before the next change. Use an email on that same domain, so the review can see the address belongs with the host. That is how an owner starts.",
    es: "El sitio es tuyo, y quieres una lista de casos antes del próximo cambio. Usa un correo en ese mismo dominio, para que la revisión vea que la dirección va con el sitio. Así empieza quien es dueño.",
    pt: "O site é seu, e você quer uma lista de casos antes da próxima mudança. Use um e-mail nesse mesmo domínio, para a revisão ver que o endereço pertence ao site. É assim que o dono começa.",
    de: "Die Seite gehört Ihnen, und Sie wollen eine Fallliste vor der nächsten Änderung. Nutzen Sie eine E-Mail auf derselben Domain, damit die Prüfung sieht, dass die Adresse zur Seite gehört. So beginnt eine Eigentümerin oder ein Eigentümer.",
    fr: "Le site est à vous, et vous voulez une liste de cas avant le prochain changement. Utilisez un e-mail sur ce même domaine, pour que la revue voie que l’adresse va avec le site. C’est ainsi que commence le propriétaire.",
    it: "Il sito è tuo, e vuoi un elenco di casi prima del prossimo cambiamento. Usa un’e-mail su quello stesso dominio, così la revisione vede che l’indirizzo appartiene al sito. Così comincia chi ne è proprietario."
  },
  "reason-client": {
    en: "A client asked you to look, and later you will need their name beside yours. Open the client fields, add their email and site, and the report remembers who asked. Your team can show that record.",
    es: "Un cliente te pidió mirar, y después vas a necesitar su nombre junto al tuyo. Abre los campos del cliente, agrega su correo y su sitio, y el informe recuerda quién pidió. Tu equipo puede mostrar ese registro.",
    pt: "Um cliente pediu para você olhar, e depois você vai precisar do nome dele ao lado do seu. Abra os campos do cliente, acrescente o e-mail e o site, e o relatório lembra quem pediu. Sua equipe pode mostrar esse registro.",
    de: "Ein Kunde hat Sie gebeten hinzusehen, und später brauchen Sie seinen Namen neben Ihrem. Öffnen Sie die Kundenfelder, tragen Sie E-Mail und Website ein, und der Bericht merkt sich, wer gefragt hat. Ihr Team kann diesen Eintrag zeigen.",
    fr: "Un client vous a demandé de regarder, et plus tard vous aurez besoin de son nom à côté du vôtre. Ouvrez les champs du client, ajoutez son e-mail et son site, et le rapport se souvient de qui a demandé. Votre équipe peut montrer ce dossier.",
    it: "Un cliente ti ha chiesto di guardare, e dopo ti servirà il suo nome accanto al tuo. Apri i campi del cliente, aggiungi e-mail e sito, e il rapporto ricorda chi ha chiesto. Il tuo team può mostrare quel registro."
  },
  "reason-redesign": {
    en: "You are comparing a redesign, and the reason should stay with the person who asked. Pick this, and the case list is tied to that change instead of a blank request.",
    es: "Estás comparando un rediseño, y el motivo debe quedar con quien lo pidió. Elige esto, y la lista de casos queda atada a ese cambio, no a un pedido vacío.",
    pt: "Você está comparando um redesign, e o motivo precisa ficar com quem pediu. Escolha isto, e a lista de casos fica ligada a essa mudança, não a um pedido vazio.",
    de: "Sie vergleichen ein Redesign, und der Grund soll bei der Person bleiben, die gefragt hat. Wählen Sie dies, und die Fallliste hängt an dieser Änderung, nicht an einer leeren Anfrage.",
    fr: "Vous comparez une refonte, et le motif doit rester avec la personne qui a demandé. Choisissez ceci, et la liste de cas reste liée à ce changement, pas à une demande vide.",
    it: "Stai confrontando un redesign, e il motivo deve restare con chi lo ha chiesto. Scegli questo, e l’elenco dei casi resta legato a quel cambiamento, non a una richiesta vuota."
  },
  "reason-release": {
    en: "A release is close, and the team still has no written cases. Choose this reason, and the review turns the public page into the list you would want on paper before you ship.",
    es: "La entrega está cerca, y el equipo todavía no tiene los casos escritos. Elige este motivo, y la revisión convierte la página pública en la lista que querrías en papel antes de publicar.",
    pt: "A entrega está perto, e a equipe ainda não tem os casos escritos. Escolha este motivo, e a revisão transforma a página pública na lista que você quereria no papel antes de publicar.",
    de: "Eine Auslieferung steht bevor, und das Team hat noch keine geschriebenen Fälle. Wählen Sie diesen Grund, und die Prüfung macht aus der öffentlichen Seite die Liste, die Sie vor dem Versand auf Papier hätten.",
    fr: "La livraison est proche, et l’équipe n’a pas encore de cas écrits. Choisissez ce motif, et la revue transforme la page publique en liste que vous voudriez sur papier avant de livrer.",
    it: "Il rilascio è vicino, e il team non ha ancora i casi scritti. Scegli questo motivo, e la revisione trasforma la pagina pubblica nell’elenco che vorresti su carta prima di pubblicare."
  },
  "reason-tech": {
    en: "You inherited a site, and nobody wrote down how it was built. This reason asks the report to name the technologies it can see in public, so the team starts from facts.",
    es: "Heredaste un sitio, y nadie anotó cómo se construyó. Este motivo pide que el informe nombre las tecnologías que se ven en público, para que el equipo empiece por los hechos.",
    pt: "Você herdou um site, e ninguém anotou como ele foi feito. Este motivo pede que o relatório nomeie as tecnologias visíveis em público, para a equipe começar pelos fatos.",
    de: "Sie haben eine Seite übernommen, und niemand hat aufgeschrieben, wie sie gebaut wurde. Dieser Grund bittet den Bericht, die öffentlich sichtbaren Technologien zu nennen, damit das Team bei den Fakten beginnt.",
    fr: "Vous avez hérité d’un site, et personne n’a noté comment il a été construit. Ce motif demande au rapport de nommer les technologies visibles en public, pour que l’équipe parte des faits.",
    it: "Hai ereditato un sito, e nessuno ha scritto come è stato costruito. Questo motivo chiede al rapporto di nominare le tecnologie visibili in pubblico, così il team parte dai fatti."
  },
  "reason-a11y": {
    en: "Someone needs the page to work with a keyboard and a screen reader, and you do not know where to start. This reason proposes those cases and names axe-core. The tool is not launched. You leave with the list.",
    es: "Alguien necesita que la página funcione con teclado y lector de pantalla, y no sabes por dónde empezar. Este motivo propone esos casos y nombra axe-core. La herramienta no se ejecuta. Te llevas la lista.",
    pt: "Alguém precisa que a página funcione com teclado e leitor de tela, e você não sabe por onde começar. Este motivo propõe esses casos e nomeia o axe-core. A ferramenta não é executada. Você sai com a lista.",
    de: "Jemand braucht die Seite mit Tastatur und Screenreader, und Sie wissen nicht, wo Sie anfangen. Dieser Grund schlägt diese Fälle vor und nennt axe-core. Das Werkzeug wird nicht gestartet. Sie nehmen die Liste mit.",
    fr: "Quelqu’un a besoin que la page marche au clavier et avec un lecteur d’écran, et vous ne savez pas par où commencer. Ce motif propose ces cas et nomme axe-core. L’outil n’est pas lancé. Vous repartez avec la liste.",
    it: "Qualcuno ha bisogno che la pagina funzioni con tastiera e lettore di schermo, e non sai da dove partire. Questo motivo propone quei casi e nomina axe-core. Lo strumento non parte. Te ne vai con l’elenco."
  },
  "reason-security": {
    en: "You want to know what a public response left in the open before anyone calls it a break-in. This reason points the report at those headers. It is a signal for a later check.",
    es: "Quieres saber qué dejó abierta una respuesta pública, antes de que alguien lo llame una intrusión. Este motivo lleva el informe a esas cabeceras. Es una señal para una revisión posterior.",
    pt: "Você quer saber o que uma resposta pública deixou à vista, antes de alguém chamar isso de invasão. Este motivo leva o relatório a esses cabeçalhos. É um sinal para uma checagem posterior.",
    de: "Sie wollen wissen, was eine öffentliche Antwort offen gelassen hat, bevor jemand es einen Einbruch nennt. Dieser Grund lenkt den Bericht auf diese Header. Es ist ein Signal für eine spätere Prüfung.",
    fr: "Vous voulez savoir ce qu’une réponse publique a laissé ouvert, avant que quelqu’un n’appelle cela une intrusion. Ce motif mène le rapport vers ces en-têtes. C’est un signal pour un contrôle plus tard.",
    it: "Vuoi sapere cosa una risposta pubblica ha lasciato in vista, prima che qualcuno lo chiami un’intrusione. Questo motivo porta il rapporto a quelle intestazioni. È un segnale per un controllo successivo."
  },
  "reason-performance": {
    en: "The page feels slow, and you need a budget instead of a guess. This reason proposes performance and load cases. Nothing is generated. The team gets the list to run when you are ready.",
    es: "La página se siente lenta, y necesitas un presupuesto en vez de una suposición. Este motivo propone casos de rendimiento y de carga. No se genera carga. El equipo se lleva la lista para cuando esté listo.",
    pt: "A página parece lenta, e você precisa de um orçamento em vez de um palpite. Este motivo propõe casos de desempenho e de carga. Nenhuma carga é gerada. A equipe leva a lista para quando estiver pronta.",
    de: "Die Seite fühlt sich langsam an, und Sie brauchen ein Budget statt einer Vermutung. Dieser Grund schlägt Leistungs- und Lastfälle vor. Es wird keine Last erzeugt. Das Team nimmt die Liste mit, für den Moment, in dem Sie bereit sind.",
    fr: "La page semble lente, et vous avez besoin d’un budget plutôt que d’une intuition. Ce motif propose des cas de performance et de charge. Aucune charge n’est générée. L’équipe emporte la liste pour le moment où vous serez prêts.",
    it: "La pagina sembra lenta, e ti serve un budget invece di un’ipotesi. Questo motivo propone casi di prestazioni e di carico. Nessun carico viene generato. Il team porta via l’elenco per quando sarete pronti."
  },
  "reason-teaching": {
    en: "You are teaching a page, and you need one real example instead of a slide. This reason keeps the same read as the lesson, so the class can see how a case list is born.",
    es: "Estás enseñando una página, y necesitas un ejemplo real en vez de una diapositiva. Este motivo deja la misma lectura como la clase, para que vean cómo nace una lista de casos.",
    pt: "Você está ensinando uma página, e precisa de um exemplo real em vez de um slide. Este motivo deixa a mesma leitura como a aula, para a turma ver como nasce uma lista de casos.",
    de: "Sie unterrichten eine Seite, und Sie brauchen ein echtes Beispiel statt einer Folie. Dieser Grund behält dieselbe Lesung als Unterricht, damit die Klasse sieht, wie eine Fallliste entsteht.",
    fr: "Vous enseignez une page, et vous avez besoin d’un vrai exemple plutôt que d’une diapositive. Ce motif garde la même lecture comme cours, pour que la classe voie comment naît une liste de cas.",
    it: "Stai insegnando una pagina, e ti serve un esempio vero invece di una slide. Questo motivo tiene la stessa lettura come lezione, così la classe vede come nasce un elenco di casi."
  },
  "reason-allowed": {
    en: "You are allowed to review this public page, and you want that permission on the record. Say so here. The review stores that you were allowed to look.",
    es: "Tienes permiso para revisar esta página pública, y quieres ese permiso en el registro. Dílo aquí. La revisión guarda que te dejaron mirar.",
    pt: "Você tem permissão para revisar esta página pública, e quer essa permissão no registro. Diga isso aqui. A revisão guarda que você podia olhar.",
    de: "Sie dürfen diese öffentliche Seite prüfen, und Sie wollen diese Erlaubnis im Protokoll. Sagen Sie es hier. Die Prüfung speichert, dass Sie hinsehen durften.",
    fr: "Vous avez le droit de revoir cette page publique, et vous voulez cette permission dans le dossier. Dites-le ici. La revue garde que vous aviez le droit de regarder.",
    it: "Hai il permesso di rivedere questa pagina pubblica, e vuoi quel permesso nel registro. Dillo qui. La revisione conserva che ti era permesso guardare."
  },
  "reason-verify": {
    en: "You want QA-lab to run the cases, not only to write them. That is a different service. This reason shows where to ask, so the list and the run stay separate.",
    es: "Quieres que QA-lab ejecute los casos, no solo que los escriba. Eso es otro servicio. Este motivo muestra adónde escribir, para que la lista y la ejecución sigan separadas.",
    pt: "Você quer que o QA-lab execute os casos, não apenas que os escreva. Isso é outro serviço. Este motivo mostra para onde escrever, para a lista e a execução ficarem separadas.",
    de: "Sie wollen, dass QA-lab die Fälle ausführt, nicht nur aufschreibt. Das ist ein anderer Dienst. Dieser Grund zeigt, wohin Sie schreiben, damit die Liste und der Lauf getrennt bleiben.",
    fr: "Vous voulez que QA-lab exécute les cas, pas seulement qu’il les écrive. C’est un autre service. Ce motif montre où écrire, pour que la liste et l’exécution restent séparées.",
    it: "Vuoi che QA-lab esegua i casi, non solo che li scriva. È un altro servizio. Questo motivo mostra dove scrivere, così l’elenco e l’esecuzione restano separati."
  },
  "reason-credentials": {
    en: "The path you care about sits behind a login you are allowed to use. Choose this when a signed-in read is the point. The password is never typed here. That run waits until it is paid.",
    es: "El camino que te importa está detrás de un acceso que puedes usar. Elige esto cuando la lectura con sesión es el objetivo. La contraseña no se escribe aquí. Esa lectura espera hasta el pago.",
    pt: "O caminho que importa está atrás de um acesso que você pode usar. Escolha isto quando a leitura autenticada é o objetivo. A senha não é digitada aqui. Essa leitura espera até o pagamento.",
    de: "Der Weg, der Ihnen wichtig ist, liegt hinter einem Zugang, den Sie benutzen dürfen. Wählen Sie dies, wenn eine angemeldete Lesung der Punkt ist. Das Passwort wird hier nicht eingegeben. Dieser Lauf wartet auf die Zahlung.",
    fr: "Le chemin qui vous importe est derrière un accès que vous avez le droit d’utiliser. Choisissez ceci quand une lecture connectée est le but. Le mot de passe n’est jamais saisi ici. Cette lecture attend le paiement.",
    it: "Il percorso che ti interessa sta dietro un accesso che puoi usare. Scegli questo quando la lettura con login è il punto. La password non si scrive qui. Quella lettura aspetta il pagamento."
  },
  "reason-other": {
    en: "None of the reasons fit, and you still need the report to say why you came. Other opens a sentence box. Write the situation in your own words, and it stays with the request.",
    es: "Ningún motivo encaja, y aun así el informe tiene que decir por qué viniste. Otro abre una caja. Escribe la situación con tus palabras, y queda en el pedido.",
    pt: "Nenhum motivo serve, e mesmo assim o relatório precisa dizer por que você veio. Outro abre uma caixa. Escreva a situação com suas palavras, e ela fica no pedido.",
    de: "Keiner der Gründe passt, und der Bericht soll trotzdem sagen, warum Sie gekommen sind. Andere öffnet ein Feld. Schreiben Sie die Lage in Ihren Worten, und sie bleibt bei der Anfrage.",
    fr: "Aucun motif ne convient, et le rapport doit quand même dire pourquoi vous êtes venu. Autre ouvre une case. Écrivez la situation avec vos mots, et elle reste dans la demande.",
    it: "Nessun motivo calza, e il rapporto deve comunque dire perché sei arrivato. Altro apre una casella. Scrivi la situazione con le tue parole, e resta nella richiesta."
  },
  "wider-read-price": {
    en: "The first review is included: twenty pages, two links deep. When you need more, the price appears before anything starts. One hundred pages and five links deep is twenty-five dollars. You see the amount here, on this page.",
    es: "La primera revisión está incluida: veinte páginas, dos enlaces de profundidad. Cuando necesitas más, el precio aparece antes de empezar. Cien páginas y cinco enlaces cuestan veinticinco dólares. El monto se ve aquí, en esta página.",
    pt: "A primeira revisão está incluída: vinte páginas, dois links de profundidade. Quando você precisa de mais, o preço aparece antes de começar. Cem páginas e cinco links custam vinte e cinco dólares. O valor aparece aqui, nesta página.",
    de: "Die erste Prüfung ist enthalten: zwanzig Seiten, zwei Links tief. Wenn Sie mehr brauchen, erscheint der Preis, bevor etwas beginnt. Hundert Seiten und fünf Links tief kosten fünfundzwanzig Dollar. Den Betrag sehen Sie hier, auf dieser Seite.",
    fr: "La première revue est incluse : vingt pages, deux liens de profondeur. Quand vous avez besoin de plus, le prix apparaît avant de commencer. Cent pages et cinq liens coûtent vingt-cinq dollars. Le montant se voit ici, sur cette page.",
    it: "La prima revisione è inclusa: venti pagine, due link di profondità. Quando ti serve di più, il prezzo appare prima di iniziare. Cento pagine e cinque link costano venticinque dollari. L’importo si vede qui, su questa pagina."
  },
  "paypal-sandbox": {
    en: "You chose a wider read, and you want to see the payment before any money moves. This page shows the amount, then PayPal’s test checkout opens. The sandbox uses test credentials. It is not a live charge.",
    es: "Elegiste una lectura más amplia, y quieres ver el pago antes de que se mueva dinero. Esta página muestra el monto, y después se abre la caja de prueba de PayPal. El sandbox usa credenciales de prueba. No es un cobro real.",
    pt: "Você escolheu uma leitura mais ampla, e quer ver o pagamento antes de qualquer dinheiro se mover. Esta página mostra o valor, e depois abre o checkout de teste do PayPal. O sandbox usa credenciais de teste. Não é uma cobrança real.",
    de: "Sie haben eine breitere Lesung gewählt und wollen die Zahlung sehen, bevor Geld fließt. Diese Seite zeigt den Betrag, danach öffnet sich die Testkasse von PayPal. Die Sandbox nutzt Testzugänge. Es ist keine echte Abbuchung.",
    fr: "Vous avez choisi une lecture plus large, et vous voulez voir le paiement avant que l’argent ne bouge. Cette page montre le montant, puis la caisse de test de PayPal s’ouvre. Le bac à sable utilise des identifiants de test. Ce n’est pas un débit réel.",
    it: "Hai scelto una lettura più ampia, e vuoi vedere il pagamento prima che si muova denaro. Questa pagina mostra l’importo, poi si apre la cassa di prova di PayPal. La sandbox usa credenziali di prova. Non è un addebito vero."
  },
  "stop": {
    en: "The read is going further than you need, and you do not want to lose what is already saved. Stop ends it there. The pages read before the stop stay in the report.",
    es: "La lectura va más lejos de lo que necesitas, y no quieres perder lo que ya se guardó. Detener la corta ahí. Las páginas leídas antes de parar permanecen en el informe.",
    pt: "A leitura vai além do que você precisa, e você não quer perder o que já foi salvo. Parar encerra ali. As páginas lidas antes da parada permanecem no relatório.",
    de: "Die Lesung geht weiter, als Sie brauchen, und Sie wollen nicht verlieren, was schon gespeichert ist. Stopp beendet sie dort. Die Seiten vor dem Stopp bleiben im Bericht.",
    fr: "La lecture va plus loin que vous n’en avez besoin, et vous ne voulez pas perdre ce qui est déjà enregistré. Arrêter la coupe là. Les pages lues avant l’arrêt restent dans le rapport.",
    it: "La lettura va oltre quello che ti serve, e non vuoi perdere ciò che è già salvato. Stop la chiude lì. Le pagine lette prima dello stop restano nel rapporto."
  },
  "follow-up": {
    en: "You may want a reminder to run this page again, without asking someone to remember. Turn the note on. At most three notes go out in a week, and a reply of stop ends them.",
    es: "Puede que quieras un aviso para volver a ejecutar esta página, sin pedirle a nadie que lo recuerde. Activa la nota. Salen como máximo tres avisos en una semana, y una respuesta de stop los termina.",
    pt: "Você pode querer um aviso para executar esta página de novo, sem pedir a ninguém que lembre. Ligue a nota. Saem no máximo três avisos em uma semana, e uma resposta de stop os encerra.",
    de: "Sie möchten vielleicht eine Erinnerung, diese Seite noch einmal laufen zu lassen, ohne dass jemand daran denken muss. Schalten Sie die Notiz ein. Höchstens drei Notizen gehen in einer Woche hinaus, und eine Antwort mit Stopp beendet sie.",
    fr: "Vous voulez peut-être un rappel pour relancer cette page, sans demander à quelqu’un de s’en souvenir. Activez la note. Trois avis au plus partent dans une semaine, et une réponse stop les termine.",
    it: "Puoi volere un avviso per eseguire di nuovo questa pagina, senza chiedere a qualcuno di ricordarsene. Attiva la nota. Escono al massimo tre avvisi in una settimana, e una risposta stop li chiude."
  },
  "tools": {
    en: "You want to know which tools fit this page, without launching them by accident. axe-core, Lighthouse, and k6 are named when the page matches. Uncheck one, and it drops off the list. None of them run here.",
    es: "Quieres saber qué herramientas encajan con esta página, sin lanzarlas por accidente. axe-core, Lighthouse y k6 se nombran cuando la página coincide. Quita una, y sale de la lista. Ninguna se ejecuta aquí.",
    pt: "Você quer saber quais ferramentas combinam com esta página, sem lançá-las por acidente. axe-core, Lighthouse e k6 são nomeados quando a página corresponde. Desmarque uma, e ela sai da lista. Nenhuma roda aqui.",
    de: "Sie wollen wissen, welche Werkzeuge zu dieser Seite passen, ohne sie aus Versehen zu starten. axe-core, Lighthouse und k6 werden genannt, wenn die Seite passt. Nehmen Sie eines weg, und es fällt von der Liste. Keines läuft hier.",
    fr: "Vous voulez savoir quels outils conviennent à cette page, sans les lancer par accident. axe-core, Lighthouse et k6 sont nommés quand la page correspond. Décochez-en un, et il sort de la liste. Aucun ne tourne ici.",
    it: "Vuoi sapere quali strumenti stanno bene su questa pagina, senza avviarli per sbaglio. axe-core, Lighthouse e k6 vengono nominati quando la pagina corrisponde. Togline uno, e esce dall’elenco. Nessuno parte qui."
  },
  "alarm": {
    en: "A public response left something worth a later look, and you should see the first words without treating it as a break-in. The rest stays soft until that section is paid. It is a signal, not proof.",
    es: "Una respuesta pública dejó algo que merece una mirada después, y conviene ver las primeras palabras sin tratarlo como una intrusión. El resto queda suave hasta pagar esa sección. Es una señal, no una prueba.",
    pt: "Uma resposta pública deixou algo que merece um olhar depois, e convém ver as primeiras palavras sem tratar isso como invasão. O resto fica suave até pagar essa seção. É um sinal, não uma prova.",
    de: "Eine öffentliche Antwort hat etwas gelassen, das später einen Blick verdient, und Sie sollten die ersten Worte sehen, ohne es als Einbruch zu nehmen. Der Rest bleibt weich, bis dieser Abschnitt bezahlt ist. Es ist ein Signal, kein Beweis.",
    fr: "Une réponse publique a laissé quelque chose qui mérite un regard plus tard, et vous devez voir les premiers mots sans y voir une intrusion. Le reste reste doux jusqu’au paiement de cette section. C’est un signal, pas une preuve.",
    it: "Una risposta pubblica ha lasciato qualcosa che merita uno sguardo dopo, e conviene vedere le prime parole senza trattarlo come un’intrusione. Il resto resta morbido finché quella sezione non è pagata. È un segnale, non una prova."
  },
  "case-kinds": {
    en: "You do not need every kind of case, only the ones your team will actually run. Open the list, clear a kind, and the amount follows what you keep. This clip stays on the list so you can see the choice.",
    es: "No necesitas todos los tipos de casos, solo los que tu equipo va a ejecutar. Abre la lista, quita un tipo, y el monto sigue lo que conservas. Este clip se queda en la lista para que veas la elección.",
    pt: "Você não precisa de todos os tipos de casos, só dos que sua equipe vai executar. Abra a lista, tire um tipo, e o valor segue o que você mantém. Este clipe fica na lista para você ver a escolha.",
    de: "Sie brauchen nicht jede Art von Fall, nur die, die Ihr Team wirklich ausführt. Öffnen Sie die Liste, nehmen Sie eine Art weg, und der Betrag folgt dem, was Sie behalten. Dieser Clip bleibt auf der Liste, damit Sie die Wahl sehen.",
    fr: "Vous n’avez pas besoin de toutes les sortes de cas, seulement de celles que votre équipe va vraiment exécuter. Ouvrez la liste, retirez une sorte, et le montant suit ce que vous gardez. Cet extrait reste sur la liste pour que vous voyiez le choix.",
    it: "Non ti servono tutti i tipi di casi, solo quelli che il team eseguirà davvero. Apri l’elenco, togli un tipo, e l’importo segue ciò che tieni. Questa clip resta sull’elenco così vedi la scelta."
  },
  "report-json": {
    en: "Another tool needs the report as data, not as a picture of the screen. JSON is that one object, with the signature inside. Download it once with this showing.",
    es: "Otra herramienta necesita el informe como datos, no como una foto de la pantalla. JSON es ese objeto, con la firma adentro. Descárgalo una vez con esta vista.",
    pt: "Outra ferramenta precisa do relatório como dados, não como uma foto da tela. JSON é esse objeto, com a assinatura dentro. Baixe uma vez com esta vista.",
    de: "Ein anderes Werkzeug braucht den Bericht als Daten, nicht als Bild des Bildschirms. JSON ist dieses eine Objekt, mit der Signatur darin. Laden Sie es einmal mit dieser Ansicht herunter.",
    fr: "Un autre outil a besoin du rapport comme données, pas comme une photo de l’écran. Le JSON est cet objet, avec la signature dedans. Téléchargez-le une fois avec cet affichage.",
    it: "Un altro strumento ha bisogno del rapporto come dati, non come una foto dello schermo. Il JSON è quell’oggetto, con la firma dentro. Scaricalo una volta con questa vista."
  },
  "report-text": {
    en: "Someone on the team wants to read the report without opening a tool. Text is that readable copy of the same report. Take it once from this page.",
    es: "Alguien del equipo quiere leer el informe sin abrir una herramienta. El texto es esa copia legible del mismo informe. Llévalo una vez desde esta página.",
    pt: "Alguém da equipe quer ler o relatório sem abrir uma ferramenta. O texto é essa cópia legível do mesmo relatório. Leve uma vez a partir desta página.",
    de: "Jemand im Team will den Bericht lesen, ohne ein Werkzeug zu öffnen. Text ist diese lesbare Kopie desselben Berichts. Nehmen Sie sie einmal von dieser Seite mit.",
    fr: "Quelqu’un dans l’équipe veut lire le rapport sans ouvrir un outil. Le texte est cette copie lisible du même rapport. Emportez-la une fois depuis cette page.",
    it: "Qualcuno nel team vuole leggere il rapporto senza aprire uno strumento. Il testo è quella copia leggibile dello stesso rapporto. Prendila una volta da questa pagina."
  },
  "report-print": {
    en: "You need the report on paper, or as a PDF in a folder. Print is that path. This clip leaves the print dialog closed, so you can see the choice without a popup covering the page.",
    es: "Necesitas el informe en papel, o como PDF en una carpeta. Imprimir es ese camino. Este clip deja cerrado el diálogo de impresión, para que veas la opción sin una ventana encima de la página.",
    pt: "Você precisa do relatório no papel, ou como PDF numa pasta. Imprimir é esse caminho. Este clipe deixa fechado o diálogo de impressão, para você ver a opção sem uma janela sobre a página.",
    de: "Sie brauchen den Bericht auf Papier oder als PDF in einem Ordner. Drucken ist dieser Weg. Dieser Clip lässt den Druckdialog geschlossen, damit Sie die Wahl sehen, ohne dass ein Fenster die Seite verdeckt.",
    fr: "Vous avez besoin du rapport sur papier, ou en PDF dans un dossier. Imprimer est ce chemin. Cet extrait laisse la boîte d’impression fermée, pour que vous voyiez le choix sans une fenêtre sur la page.",
    it: "Ti serve il rapporto su carta, o come PDF in una cartella. Stampare è quella via. Questa clip lascia chiusa la finestra di stampa, così vedi la scelta senza una finestra sopra la pagina."
  },
  "copy-link": {
    en: "You want the link to this report. Copy takes it. The link opens the full report only for the account that ran it, once signed in. Anyone else sees the blurred preview.",
    es: "Quieres el enlace a este informe. Copiar lo toma. El enlace abre el informe completo solo para la cuenta que lo ejecutó, con la sesión iniciada. Cualquier otra persona ve la vista previa difuminada.",
    pt: "Você quer o link deste relatório. Copiar pega o link. Ele abre o relatório completo só para a conta que o executou, com login. Qualquer outra pessoa vê a prévia desfocada.",
    de: "Sie wollen den Link zu diesem Bericht. Kopieren nimmt ihn. Der Link öffnet den vollständigen Bericht nur für das Konto, das ihn ausgeführt hat, nach der Anmeldung. Alle anderen sehen die unscharfe Vorschau.",
    fr: "Vous voulez le lien vers ce rapport. Copier le prend. Le lien n’ouvre le rapport complet que pour le compte qui l’a lancé, une fois connecté. Toute autre personne voit l’aperçu flouté.",
    it: "Vuoi il link a questo rapporto. Copia lo prende. Il link apre il rapporto completo solo per l’account che l’ha eseguito, dopo l’accesso. Chiunque altro vede l’anteprima sfocata."
  },
  "language": {
    en: "The person reading the page may not want English. Spanish and Portuguese have their own headline pages. German, French, and Italian translate this one. Switch the language, and the same review stays.",
    es: "Quien lee la página puede no querer inglés. El español y el portugués tienen su propia página de titular. El alemán, el francés y el italiano traducen esta. Cambia el idioma, y la misma revisión sigue.",
    pt: "Quem lê a página pode não querer inglês. O espanhol e o português têm a própria página de título. O alemão, o francês e o italiano traduzem esta. Troque o idioma, e a mesma revisão continua.",
    de: "Wer die Seite liest, will vielleicht kein Englisch. Spanisch und Portugiesisch haben eine eigene Titelseite. Deutsch, Französisch und Italienisch übersetzen diese. Wechseln Sie die Sprache, und dieselbe Prüfung bleibt.",
    fr: "La personne qui lit la page ne veut peut-être pas l’anglais. L’espagnol et le portugais ont leur propre page de titre. L’allemand, le français et l’italien traduisent celle-ci. Changez la langue, et la même revue reste.",
    it: "Chi legge la pagina può non volere l’inglese. Spagnolo e portoghese hanno la propria pagina del titolo. Tedesco, francese e italiano traducono questa. Cambia lingua, e la stessa revisione resta."
  },
  "tour": {
    en: "You are new here, and the page has more than one job. The tour walks the request, the log, and the stop, so you know where to look before you start. You can open it again whenever you want.",
    es: "Llegas por primera vez, y la página tiene más de un trabajo. El recorrido pasa por el pedido, el registro y la parada, para que sepas dónde mirar antes de empezar. Puedes abrirlo de nuevo cuando quieras.",
    pt: "Você chegou agora, e a página tem mais de um trabalho. O passeio percorre o pedido, o registro e a parada, para você saber onde olhar antes de começar. Pode abri-lo de novo quando quiser.",
    de: "Sie sind neu hier, und die Seite hat mehr als eine Aufgabe. Die Führung geht durch die Anfrage, das Protokoll und den Stopp, damit Sie wissen, wohin Sie schauen, bevor Sie beginnen. Sie können sie jederzeit wieder öffnen.",
    fr: "Vous arrivez, et la page a plus d’un rôle. La visite passe par la demande, le journal et l’arrêt, pour que vous sachiez où regarder avant de commencer. Vous pouvez la rouvrir quand vous voulez.",
    it: "Sei appena arrivato, e la pagina ha più di un compito. Il percorso passa dalla richiesta, dal registro e dallo stop, così sai dove guardare prima di iniziare. Puoi riaprirlo quando vuoi."
  },
  "path-first": {
    en: "You have a page and no written cases. The first read is included: twenty pages, two links deep. Accept the acknowledgements, ask for the review, and the report is written in front of you. Download it and open the file. The first sentences stay readable. The rest stays soft, and the preview mark stays on the file, until this report is paid.",
    es: "Tienes una página y ningún caso escrito. La primera lectura está incluida: veinte páginas, dos enlaces de profundidad. Acepta las declaraciones, pide la revisión, y el informe se escribe delante de ti. Descárgalo y abre el archivo. Las primeras frases se leen. El resto queda suave, y la marca de vista previa permanece en el archivo, hasta que este informe se pague.",
    pt: "Você tem uma página e nenhum caso escrito. A primeira leitura está incluída: vinte páginas, dois links de profundidade. Aceite as declarações, peça a revisão, e o relatório é escrito na sua frente. Baixe e abra o arquivo. As primeiras frases ficam legíveis. O resto fica suave, e a marca de prévia permanece no arquivo, até este relatório ser pago.",
    de: "Sie haben eine Seite und keine geschriebenen Fälle. Die erste Lesung ist enthalten: zwanzig Seiten, zwei Links tief. Nehmen Sie die Erklärungen an, bitten Sie um die Prüfung, und der Bericht wird vor Ihnen geschrieben. Laden Sie ihn herunter und öffnen Sie die Datei. Die ersten Sätze bleiben lesbar. Der Rest bleibt weich, und die Vorschau-Marke bleibt auf der Datei, bis dieser Bericht bezahlt ist.",
    fr: "Vous avez une page et aucun cas écrit. La première lecture est incluse : vingt pages, deux liens de profondeur. Acceptez les déclarations, demandez la revue, et le rapport s’écrit devant vous. Téléchargez-le et ouvrez le fichier. Les premières phrases restent lisibles. Le reste reste doux, et la marque d’aperçu reste sur le fichier, jusqu’à ce que ce rapport soit payé.",
    it: "Hai una pagina e nessun caso scritto. La prima lettura è inclusa: venti pagine, due link di profondità. Accetta le dichiarazioni, chiedi la revisione, e il rapporto si scrive davanti a te. Scaricalo e apri il file. Le prime frasi restano leggibili. Il resto resta morbido, e il marchio di anteprima resta sul file, finché questo rapporto non è pagato."
  },
  "path-frameworks": {
    en: "You come back, and you need the cases named for the tools your team already runs. Start with one framework, at full price. Add some, then add all of them. Each added name is discounted, from ten percent on the second and third, down the schedule. PayPal’s test checkout shows that amount. When it returns, the report is clear, the watermark is gone, and one line says it was generated with QA-lab URL Review by Carlos Muñoz. Share it, download it, and open the file.",
    es: "Vuelves, y necesitas los casos con el nombre de las herramientas que tu equipo ya usa. Empieza con un framework, a precio completo. Agrega algunos, y después todos. Cada nombre que agregas tiene descuento, desde el diez por ciento en el segundo y el tercero, siguiendo la tabla. La caja de prueba de PayPal muestra ese monto. Cuando regresa, el informe está claro, la marca de agua ya no está, y una línea dice que se generó con QA-lab URL Review por Carlos Muñoz. Compártelo, descárgalo y abre el archivo.",
    pt: "Você volta, e precisa dos casos com o nome das ferramentas que sua equipe já usa. Comece com um framework, no preço cheio. Acrescente alguns, e depois todos. Cada nome acrescentado tem desconto, a partir de dez por cento no segundo e no terceiro, seguindo a tabela. O checkout de teste do PayPal mostra esse valor. Quando volta, o relatório está claro, a marca d’água saiu, e uma linha diz que foi gerado com QA-lab URL Review por Carlos Muñoz. Compartilhe, baixe e abra o arquivo.",
    de: "Sie kommen zurück und brauchen die Fälle mit den Namen der Werkzeuge, die Ihr Team schon nutzt. Beginnen Sie mit einem Framework zum vollen Preis. Fügen Sie einige hinzu, dann alle. Jeder weitere Name ist rabattiert, ab zehn Prozent beim zweiten und dritten, der Tabelle nach. Die Testkasse von PayPal zeigt diesen Betrag. Wenn sie zurückkehrt, ist der Bericht klar, das Wasserzeichen ist weg, und eine Zeile sagt, dass er mit QA-lab URL Review von Carlos Muñoz erzeugt wurde. Teilen Sie ihn, laden Sie ihn herunter und öffnen Sie die Datei.",
    fr: "Vous revenez, et vous avez besoin des cas nommés pour les outils que votre équipe utilise déjà. Commencez par un framework, au prix plein. Ajoutez-en quelques-uns, puis tous. Chaque nom ajouté est remisé, dès dix pour cent sur le deuxième et le troisième, selon le barème. La caisse de test de PayPal montre ce montant. Au retour, le rapport est clair, le filigrane a disparu, et une ligne dit qu’il a été généré avec QA-lab URL Review par Carlos Muñoz. Partagez-le, téléchargez-le et ouvrez le fichier.",
    it: "Torni, e ti servono i casi con il nome degli strumenti che il team già usa. Inizia con un framework, a prezzo pieno. Aggiungine alcuni, poi tutti. Ogni nome aggiunto è scontato, dal dieci per cento sul secondo e sul terzo, secondo la tabella. La cassa di prova di PayPal mostra quell’importo. Al ritorno, il rapporto è chiaro, la filigrana non c’è, e una riga dice che è stato generato con QA-lab URL Review da Carlos Muñoz. Condividilo, scaricalo e apri il file."
  },
  "path-cases": {
    en: "The report is written, and the team needs the cases in the tool they already open. Choose the kinds you will actually run. The price follows that count, and later kinds are discounted. PayPal’s test checkout is where that export is confirmed. Then the file comes down, with the signature on it, and you can read it.",
    es: "El informe ya está escrito, y el equipo necesita los casos en la herramienta que ya abre. Elige los tipos que de verdad vas a ejecutar. El precio sigue esa cantidad, y los tipos siguientes tienen descuento. La caja de prueba de PayPal es donde se confirma esa exportación. Después baja el archivo, con la firma, y puedes leerlo.",
    pt: "O relatório já está escrito, e a equipe precisa dos casos na ferramenta que já abre. Escolha os tipos que você vai executar de verdade. O preço segue essa quantidade, e os tipos seguintes têm desconto. O checkout de teste do PayPal é onde essa exportação é confirmada. Depois o arquivo desce, com a assinatura, e você pode lê-lo.",
    de: "Der Bericht ist geschrieben, und das Team braucht die Fälle in dem Werkzeug, das es schon öffnet. Wählen Sie die Arten, die Sie wirklich ausführen. Der Preis folgt dieser Zahl, und spätere Arten sind rabattiert. Die Testkasse von PayPal ist der Ort, an dem dieser Export bestätigt wird. Danach kommt die Datei herunter, mit der Signatur, und Sie können sie lesen.",
    fr: "Le rapport est écrit, et l’équipe a besoin des cas dans l’outil qu’elle ouvre déjà. Choisissez les sortes que vous allez vraiment exécuter. Le prix suit ce nombre, et les sortes suivantes sont remisées. La caisse de test de PayPal est l’endroit où cet export est confirmé. Ensuite le fichier descend, avec la signature, et vous pouvez le lire.",
    it: "Il rapporto è scritto, e il team ha bisogno dei casi nello strumento che già apre. Scegli i tipi che eseguirai davvero. Il prezzo segue quel numero, e i tipi successivi sono scontati. La cassa di prova di PayPal è dove quell’export viene confermato. Poi il file scende, con la firma, e puoi leggerlo."
  }
};

const FRAMEWORKS = {
  Playwright: {
    en: "Your team already writes browser checks in Playwright. Choose it, and the cases come out in that shape. Playwright is not started. You leave with the list.",
    es: "Tu equipo ya escribe pruebas de navegador en Playwright. Elígelo, y los casos salen con esa forma. Playwright no se inicia. Te llevas la lista.",
    pt: "Sua equipe já escreve testes de navegador no Playwright. Escolha, e os casos saem nesse formato. O Playwright não é iniciado. Você leva a lista.",
    de: "Ihr Team schreibt Browserprüfungen schon in Playwright. Wählen Sie es, und die Fälle kommen in dieser Form. Playwright wird nicht gestartet. Sie nehmen die Liste mit.",
    fr: "Votre équipe écrit déjà des contrôles de navigateur dans Playwright. Choisissez-le, et les cas sortent dans cette forme. Playwright n’est pas lancé. Vous repartez avec la liste.",
    it: "Il team scrive già controlli del browser in Playwright. Sceglilo, e i casi escono in quella forma. Playwright non parte. Te ne vai con l’elenco."
  },
  Cypress: {
    en: "The front-end tests already live in Cypress, next to the app. Choose it, and the proposed cases follow that habit. Cypress is not started. The list is what you take.",
    es: "Las pruebas de interfaz ya viven en Cypress, junto a la aplicación. Elígelo, y los casos propuestos siguen esa costumbre. Cypress no se inicia. La lista es lo que te llevas.",
    pt: "Os testes de interface já vivem no Cypress, ao lado do aplicativo. Escolha, e os casos propostos seguem esse hábito. O Cypress não é iniciado. A lista é o que você leva.",
    de: "Die Oberflächentests leben schon in Cypress, neben der Anwendung. Wählen Sie es, und die vorgeschlagenen Fälle folgen dieser Gewohnheit. Cypress wird nicht gestartet. Die Liste nehmen Sie mit.",
    fr: "Les tests d’interface vivent déjà dans Cypress, à côté de l’application. Choisissez-le, et les cas proposés suivent cette habitude. Cypress n’est pas lancé. La liste est ce que vous emportez.",
    it: "I test di interfaccia vivono già in Cypress, accanto all’app. Sceglilo, e i casi proposti seguono quell’abitudine. Cypress non parte. L’elenco è ciò che porti via."
  },
  Robot: {
    en: "The team reads cases as keywords, not as code. Choose Robot, and the proposals stay in sentences a mixed group can share. Robot is not started.",
    es: "El equipo lee los casos como palabras clave, no como código. Elige Robot, y las propuestas quedan en frases que un grupo mixto puede compartir. Robot no se inicia.",
    pt: "A equipe lê os casos como palavras-chave, não como código. Escolha Robot, e as propostas ficam em frases que um grupo misto pode compartilhar. O Robot não é iniciado.",
    de: "Das Team liest Fälle als Schlüsselwörter, nicht als Code. Wählen Sie Robot, und die Vorschläge bleiben Sätze, die eine gemischte Gruppe teilen kann. Robot wird nicht gestartet.",
    fr: "L’équipe lit les cas comme des mots-clés, pas comme du code. Choisissez Robot, et les propositions restent des phrases qu’un groupe mixte peut partager. Robot n’est pas lancé.",
    it: "Il team legge i casi come parole chiave, non come codice. Scegli Robot, e le proposte restano frasi che un gruppo misto può condividere. Robot non parte."
  },
  Selenium: {
    en: "The lab already runs Selenium, in the languages and the grid you have. Choose it, and the cases are written for that runner. Selenium is not started.",
    es: "El laboratorio ya corre Selenium, en los lenguajes y la grilla que tienes. Elígelo, y los casos se escriben para ese ejecutor. Selenium no se inicia.",
    pt: "O laboratório já roda Selenium, nas linguagens e na grade que você tem. Escolha, e os casos são escritos para esse executor. O Selenium não é iniciado.",
    de: "Das Labor lässt Selenium schon laufen, in den Sprachen und im Grid, die Sie haben. Wählen Sie es, und die Fälle werden für diesen Runner geschrieben. Selenium wird nicht gestartet.",
    fr: "Le labo fait déjà tourner Selenium, dans les langages et la grille que vous avez. Choisissez-le, et les cas sont écrits pour ce moteur. Selenium n’est pas lancé.",
    it: "Il laboratorio esegue già Selenium, nei linguaggi e nella griglia che hai. Sceglilo, e i casi sono scritti per quel runner. Selenium non parte."
  },
  WebdriverIO: {
    en: "The browser cases already sit in a JavaScript runner. Choose WebdriverIO, and the proposals match that project. WebdriverIO is not started.",
    es: "Los casos de navegador ya están en un ejecutor de JavaScript. Elige WebdriverIO, y las propuestas coinciden con ese proyecto. WebdriverIO no se inicia.",
    pt: "Os casos de navegador já estão num executor de JavaScript. Escolha WebdriverIO, e as propostas combinam com esse projeto. O WebdriverIO não é iniciado.",
    de: "Die Browserfälle sitzen schon in einem JavaScript-Runner. Wählen Sie WebdriverIO, und die Vorschläge passen zu diesem Projekt. WebdriverIO wird nicht gestartet.",
    fr: "Les cas de navigateur sont déjà dans un moteur JavaScript. Choisissez WebdriverIO, et les propositions correspondent à ce projet. WebdriverIO n’est pas lancé.",
    it: "I casi del browser stanno già in un runner JavaScript. Scegli WebdriverIO, e le proposte coincidono con quel progetto. WebdriverIO non parte."
  },
  Appium: {
    en: "You need the same public page on a phone, and the team will open it later. Choose Appium, and the mobile cases are proposed now. Appium is not launched.",
    es: "Necesitas la misma página pública en un teléfono, y el equipo la abrirá después. Elige Appium, y los casos móviles se proponen ahora. Appium no se lanza.",
    pt: "Você precisa da mesma página pública num telefone, e a equipe vai abri-la depois. Escolha Appium, e os casos móveis são propostos agora. O Appium não é lançado.",
    de: "Sie brauchen dieselbe öffentliche Seite auf einem Telefon, und das Team öffnet sie später. Wählen Sie Appium, und die mobilen Fälle werden jetzt vorgeschlagen. Appium wird nicht gestartet.",
    fr: "Vous avez besoin de la même page publique sur un téléphone, et l’équipe l’ouvrira plus tard. Choisissez Appium, et les cas mobiles sont proposés maintenant. Appium n’est pas lancé.",
    it: "Ti serve la stessa pagina pubblica su un telefono, e il team la aprirà dopo. Scegli Appium, e i casi mobile sono proposti ora. Appium non viene avviato."
  },
  JMeter: {
    en: "You need a load list, and you do not want this page to generate load. Choose JMeter, and the cases are written for a later run. JMeter is not started.",
    es: "Necesitas una lista de carga, y no quieres que esta página genere carga. Elige JMeter, y los casos quedan escritos para una ejecución posterior. JMeter no se inicia.",
    pt: "Você precisa de uma lista de carga, e não quer que esta página gere carga. Escolha JMeter, e os casos ficam escritos para uma execução posterior. O JMeter não é iniciado.",
    de: "Sie brauchen eine Lastliste, und diese Seite soll keine Last erzeugen. Wählen Sie JMeter, und die Fälle werden für einen späteren Lauf geschrieben. JMeter wird nicht gestartet.",
    fr: "Vous avez besoin d’une liste de charge, et vous ne voulez pas que cette page génère de la charge. Choisissez JMeter, et les cas sont écrits pour une exécution plus tard. JMeter n’est pas lancé.",
    it: "Ti serve un elenco di carico, e non vuoi che questa pagina generi carico. Scegli JMeter, e i casi restano scritti per un’esecuzione successiva. JMeter non parte."
  },
  Gatling: {
    en: "The load work already lives in a Gatling project. Choose it, and the same kind of list is proposed here. Gatling is not started. Nothing is generated.",
    es: "El trabajo de carga ya vive en un proyecto de Gatling. Elígelo, y el mismo tipo de lista se propone aquí. Gatling no se inicia. No se genera nada.",
    pt: "O trabalho de carga já vive num projeto Gatling. Escolha, e o mesmo tipo de lista é proposto aqui. O Gatling não é iniciado. Nada é gerado.",
    de: "Die Lastarbeit lebt schon in einem Gatling-Projekt. Wählen Sie es, und dieselbe Art von Liste wird hier vorgeschlagen. Gatling wird nicht gestartet. Es wird nichts erzeugt.",
    fr: "Le travail de charge vit déjà dans un projet Gatling. Choisissez-le, et le même genre de liste est proposé ici. Gatling n’est pas lancé. Rien n’est généré.",
    it: "Il lavoro di carico vive già in un progetto Gatling. Sceglilo, e lo stesso tipo di elenco è proposto qui. Gatling non parte. Non viene generato nulla."
  }
};

const SCOPES = {
  "20x2": {
    en: "You need a first look, not a full crawl. Twenty pages and two links deep is the included read. Start here when you want a reliable report before you decide to go wider.",
    es: "Necesitas una primera mirada, no un recorrido completo. Veinte páginas y dos enlaces de profundidad es la lectura incluida. Empieza aquí cuando quieres un reporte confiable antes de decidir ir más lejos.",
    pt: "Você precisa de um primeiro olhar, não de uma varredura completa. Vinte páginas e dois links de profundidade é a leitura incluída. Comece aqui quando quer um relatório confiável antes de decidir ir mais longe.",
    de: "Sie brauchen einen ersten Blick, keine volle Durchsuchung. Zwanzig Seiten und zwei Links tief ist die enthaltene Lesung. Beginnen Sie hier, wenn Sie einen verlässlichen Bericht wollen, bevor Sie weiter gehen.",
    fr: "Vous avez besoin d’un premier regard, pas d’un parcours complet. Vingt pages et deux liens de profondeur, c’est la lecture incluse. Commencez ici quand vous voulez un rapport fiable avant de décider d’aller plus loin.",
    it: "Ti serve un primo sguardo, non una scansione completa. Venti pagine e due link di profondità è la lettura inclusa. Inizia qui quando vuoi un rapporto affidabile prima di decidere di andare oltre."
  },
  "40x3": {
    en: "The first look stopped too soon, and the real pages sit one step further in. Forty pages and three links deep goes there. A live wider read shows its price before it starts.",
    es: "La primera mirada se quedó corta, y las páginas reales están un paso más adentro. Cuarenta páginas y tres enlaces llegan ahí. Una lectura más amplia muestra su precio antes de empezar.",
    pt: "O primeiro olhar parou cedo demais, e as páginas reais estão um passo mais adentro. Quarenta páginas e três links chegam lá. Uma leitura mais ampla mostra o preço antes de começar.",
    de: "Der erste Blick hörte zu früh auf, und die eigentlichen Seiten liegen einen Schritt weiter innen. Vierzig Seiten und drei Links tief gehen dorthin. Eine breitere Lesung zeigt den Preis, bevor sie beginnt.",
    fr: "Le premier regard s’est arrêté trop tôt, et les vraies pages sont un pas plus loin. Quarante pages et trois liens y vont. Une lecture plus large montre son prix avant de commencer.",
    it: "Il primo sguardo si è fermato troppo presto, e le pagine vere stanno un passo più dentro. Quaranta pagine e tre link arrivano lì. Una lettura più ampia mostra il prezzo prima di iniziare."
  },
  "60x4": {
    en: "The site keeps linking onward, and a short read would miss the path. Sixty pages and four links deep follows that path. You see how far the review is willing to go before you pay for it.",
    es: "El sitio sigue enlazando hacia adelante, y una lectura corta perdería el camino. Sesenta páginas y cuatro enlaces siguen ese camino. Ves hasta dónde llega la revisión antes de pagarla.",
    pt: "O site continua ligando adiante, e uma leitura curta perderia o caminho. Sessenta páginas e quatro links seguem esse caminho. Você vê até onde a revisão vai antes de pagar por ela.",
    de: "Die Seite verlinkt weiter, und eine kurze Lesung würde den Weg verfehlen. Sechzig Seiten und vier Links tief folgen diesem Weg. Sie sehen, wie weit die Prüfung gehen will, bevor Sie dafür zahlen.",
    fr: "Le site continue de lier plus loin, et une lecture courte manquerait le chemin. Soixante pages et quatre liens suivent ce chemin. Vous voyez jusqu’où la revue veut aller avant de la payer.",
    it: "Il sito continua a collegare avanti, e una lettura corta perderebbe il percorso. Sessanta pagine e quattro link seguono quel percorso. Vedi fino a dove la revisione è disposta ad andare prima di pagarla."
  },
  "80x5": {
    en: "You already know the front of the site, and the questions are deeper. Eighty pages and five links deep is for that. The price is part of the choice, shown before a live read starts.",
    es: "Ya conoces el frente del sitio, y las preguntas están más adentro. Ochenta páginas y cinco enlaces son para eso. El precio es parte de la elección, y se muestra antes de que empiece una lectura en vivo.",
    pt: "Você já conhece a frente do site, e as perguntas estão mais fundo. Oitenta páginas e cinco links são para isso. O preço faz parte da escolha, e aparece antes de uma leitura ao vivo começar.",
    de: "Sie kennen die Vorderseite schon, und die Fragen liegen tiefer. Achtzig Seiten und fünf Links tief sind dafür. Der Preis gehört zur Wahl und wird gezeigt, bevor eine echte Lesung beginnt.",
    fr: "Vous connaissez déjà le devant du site, et les questions sont plus profondes. Quatre-vingts pages et cinq liens sont pour cela. Le prix fait partie du choix, et il s’affiche avant qu’une lecture réelle commence.",
    it: "Conosci già la facciata del sito, e le domande stanno più in fondo. Ottanta pagine e cinque link servono a quello. Il prezzo fa parte della scelta, e si mostra prima che una lettura dal vivo inizi."
  },
  "100x5": {
    en: "You need to know a site, a page, or a URL, and you are not sure how. C and M URL Review can read up to one hundred pages and five links deep. It names the real links, the technologies, the practices worth keeping, and the risks it can see, and it helps your QA team write cases across twenty fields. Do not wait. Generate the report.",
    es: "Necesitas conocer más a fondo un sitio, una página o una URL, y no tienes idea de cómo hacerlo. Ve a C y M URL Review. Puedes revisar hasta cien páginas y cinco enlaces de profundidad. Te dice los enlaces reales, las tecnologías, las prácticas que conviene mantener y los riesgos que detecta, y te ayuda a crear los casos de prueba en veinte campos. No esperes más. Genera tu reporte.",
    pt: "Você precisa conhecer melhor um site, uma página ou uma URL, e não faz ideia de como fazer. Vá ao C e M URL Review. Dá para revisar até cem páginas e cinco links de profundidade. Ele diz os links reais, as tecnologias, as práticas que convém manter e os riscos que detecta, e ajuda a criar os casos de teste em vinte campos. Não espere. Gere o relatório.",
    de: "Sie müssen eine Website, eine Seite oder eine URL genauer kennen, und Sie wissen nicht, wie. Gehen Sie zu C und M URL Review. Sie können bis zu hundert Seiten und fünf Links tief lesen. Sie nennt die echten Links, die Technologien, die Praktiken, die sich lohnen, und die Risiken, die sie sieht, und sie hilft dem QA-Team, Fälle in zwanzig Feldern zu schreiben. Warten Sie nicht. Erzeugen Sie den Bericht.",
    fr: "Vous devez connaître un site, une page ou une URL, et vous ne savez pas comment. Allez sur C et M URL Review. Vous pouvez revoir jusqu’à cent pages et cinq liens de profondeur. Il dit les liens réels, les technologies, les pratiques à garder et les risques qu’il voit, et il aide votre équipe QA à écrire les cas dans vingt champs. N’attendez pas. Générez le rapport.",
    it: "Hai bisogno di conoscere meglio un sito, una pagina o un URL, e non hai idea di come fare. Vai su C e M URL Review. Puoi rivedere fino a cento pagine e cinque link di profondità. Ti dice i link reali, le tecnologie, le pratiche da tenere e i rischi che vede, e aiuta il team QA a scrivere i casi in venti campi. Non aspettare. Genera il rapporto."
  }
};

const EXPORTS = {
  excel: {
    en: "The cases need to land where the team already sorts work in a spreadsheet. Excel opens this CSV, and the report signature stays on the file.",
    es: "Los casos tienen que caer donde el equipo ya ordena el trabajo en una hoja. Excel abre este CSV, y la firma del informe permanece en el archivo.",
    pt: "Os casos precisam cair onde a equipe já organiza o trabalho numa planilha. O Excel abre este CSV, e a assinatura do relatório permanece no arquivo.",
    de: "Die Fälle müssen dort ankommen, wo das Team die Arbeit schon in einer Tabelle sortiert. Excel öffnet dieses CSV, und die Signatur des Berichts bleibt auf der Datei.",
    fr: "Les cas doivent arriver là où l’équipe range déjà le travail dans un tableur. Excel ouvre ce CSV, et la signature du rapport reste sur le fichier.",
    it: "I casi devono arrivare dove il team già ordina il lavoro in un foglio. Excel apre questo CSV, e la firma del rapporto resta sul file."
  },
  testrail: {
    en: "The team keeps its cases in TestRail, and a paste into a blank page would lose the shape. This CSV is ready for a text import. The signature stays on the file.",
    es: "El equipo guarda sus casos en TestRail, y pegarlos en una página vacía perdería la forma. Este CSV está listo para una importación de texto. La firma permanece en el archivo.",
    pt: "A equipe guarda os casos no TestRail, e colar numa página vazia perderia a forma. Este CSV está pronto para uma importação de texto. A assinatura permanece no arquivo.",
    de: "Das Team hält seine Fälle in TestRail, und ein Einfügen in eine leere Seite würde die Form verlieren. Dieses CSV ist bereit für einen Textimport. Die Signatur bleibt auf der Datei.",
    fr: "L’équipe garde ses cas dans TestRail, et un collage dans une page vide perdrait la forme. Ce CSV est prêt pour un import de texte. La signature reste sur le fichier.",
    it: "Il team tiene i casi in TestRail, e incollarli in una pagina vuota perderebbe la forma. Questo CSV è pronto per un import di testo. La firma resta sul file."
  },
  xray: {
    en: "The cases have to become Test issues in Jira, through Xray. This CSV is that handoff. The signature stays on the file, so the team can see where the list was born.",
    es: "Los casos tienen que volverse incidencias de tipo Test en Jira, por Xray. Este CSV es ese paso. La firma permanece en el archivo, para que el equipo vea dónde nació la lista.",
    pt: "Os casos precisam virar issues de Test no Jira, pelo Xray. Este CSV é essa passagem. A assinatura permanece no arquivo, para a equipe ver onde a lista nasceu.",
    de: "Die Fälle müssen über Xray zu Test-Vorgängen in Jira werden. Dieses CSV ist diese Übergabe. Die Signatur bleibt auf der Datei, damit das Team sieht, wo die Liste entstanden ist.",
    fr: "Les cas doivent devenir des tickets Test dans Jira, par Xray. Ce CSV est ce passage. La signature reste sur le fichier, pour que l’équipe voie où la liste est née.",
    it: "I casi devono diventare issue Test in Jira, tramite Xray. Questo CSV è quel passaggio. La firma resta sul file, così il team vede dove è nato l’elenco."
  },
  zephyr: {
    en: "Zephyr Scale wants the folder, the step, and the expected result, not a paragraph. This CSV is built that way. The signature stays on the file.",
    es: "Zephyr Scale quiere la carpeta, el paso y el resultado esperado, no un párrafo. Este CSV está armado así. La firma permanece en el archivo.",
    pt: "O Zephyr Scale quer a pasta, o passo e o resultado esperado, não um parágrafo. Este CSV é montado assim. A assinatura permanece no arquivo.",
    de: "Zephyr Scale will den Ordner, den Schritt und das erwartete Ergebnis, keinen Absatz. Dieses CSV ist so gebaut. Die Signatur bleibt auf der Datei.",
    fr: "Zephyr Scale veut le dossier, l’étape et le résultat attendu, pas un paragraphe. Ce CSV est construit ainsi. La signature reste sur le fichier.",
    it: "Zephyr Scale vuole la cartella, il passo e il risultato atteso, non un paragrafo. Questo CSV è costruito così. La firma resta sul file."
  },
  jira: {
    en: "The work has to show up as tasks a Jira project can import. This CSV is that list. The signature stays on the file, so the ticket still points back to the report.",
    es: "El trabajo tiene que aparecer como tareas que un proyecto de Jira puede importar. Este CSV es esa lista. La firma permanece en el archivo, para que la tarea siga señalando al informe.",
    pt: "O trabalho precisa aparecer como tarefas que um projeto do Jira pode importar. Este CSV é essa lista. A assinatura permanece no arquivo, para a tarefa continuar apontando ao relatório.",
    de: "Die Arbeit muss als Aufgaben erscheinen, die ein Jira-Projekt importieren kann. Dieses CSV ist diese Liste. Die Signatur bleibt auf der Datei, damit die Aufgabe weiter auf den Bericht zeigt.",
    fr: "Le travail doit apparaître comme des tâches qu’un projet Jira peut importer. Ce CSV est cette liste. La signature reste sur le fichier, pour que le ticket pointe encore vers le rapport.",
    it: "Il lavoro deve comparire come attività che un progetto Jira può importare. Questo CSV è quell’elenco. La firma resta sul file, così il ticket continua a indicare il rapporto."
  },
  azure: {
    en: "The team plans tests in Azure Test Plans, and a local file will not reach that board. This CSV of test cases is the bridge. The signature stays on the file.",
    es: "El equipo planea las pruebas en Azure Test Plans, y un archivo local no llega a ese tablero. Este CSV de casos de prueba es el puente. La firma permanece en el archivo.",
    pt: "A equipe planeja os testes no Azure Test Plans, e um arquivo local não chega a esse quadro. Este CSV de casos de teste é a ponte. A assinatura permanece no arquivo.",
    de: "Das Team plant Tests in Azure Test Plans, und eine lokale Datei erreicht dieses Board nicht. Dieses CSV von Testfällen ist die Brücke. Die Signatur bleibt auf der Datei.",
    fr: "L’équipe planifie les tests dans Azure Test Plans, et un fichier local n’atteint pas ce tableau. Ce CSV de cas de test est le pont. La signature reste sur le fichier.",
    it: "Il team pianifica i test in Azure Test Plans, e un file locale non arriva a quella board. Questo CSV di casi di test è il ponte. La firma resta sul file."
  },
  mantis: {
    en: "The bugs and the follow-ups live in MantisBT. This CSV of issues is how the case list arrives there. The signature stays on the file.",
    es: "Los defectos y los seguimientos viven en MantisBT. Este CSV de incidencias es cómo la lista de casos llega ahí. La firma permanece en el archivo.",
    pt: "Os defeitos e os acompanhamentos vivem no MantisBT. Este CSV de issues é como a lista de casos chega lá. A assinatura permanece no arquivo.",
    de: "Die Fehler und die Nachverfolgung leben in MantisBT. Dieses CSV von Vorgängen ist der Weg, auf dem die Fallliste dort ankommt. Die Signatur bleibt auf der Datei.",
    fr: "Les défauts et les suivis vivent dans MantisBT. Ce CSV de tickets est la façon dont la liste de cas y arrive. La signature reste sur le fichier.",
    it: "I difetti e i seguiti vivono in MantisBT. Questo CSV di segnalazioni è il modo in cui l’elenco dei casi arriva lì. La firma resta sul file."
  },
  json: {
    en: "A script on your side needs one object, not a spreadsheet. JSON keeps the cases and the signature together. Hand that file to the tool that already reads JSON.",
    es: "Un script de tu lado necesita un objeto, no una hoja. JSON guarda los casos y la firma juntos. Entrega ese archivo a la herramienta que ya lee JSON.",
    pt: "Um script do seu lado precisa de um objeto, não de uma planilha. O JSON guarda os casos e a assinatura juntos. Entregue esse arquivo à ferramenta que já lê JSON.",
    de: "Ein Skript auf Ihrer Seite braucht ein Objekt, keine Tabelle. JSON hält die Fälle und die Signatur zusammen. Geben Sie diese Datei dem Werkzeug, das JSON schon liest.",
    fr: "Un script de votre côté a besoin d’un objet, pas d’un tableur. Le JSON garde les cas et la signature ensemble. Donnez ce fichier à l’outil qui lit déjà le JSON.",
    it: "Uno script dalla tua parte ha bisogno di un oggetto, non di un foglio. Il JSON tiene insieme i casi e la firma. Consegna quel file allo strumento che già legge JSON."
  },
  text: {
    en: "Someone needs to read the cases in a mail or a note, without a tool. Text is that readable list. The signature stays with it.",
    es: "Alguien necesita leer los casos en un correo o una nota, sin una herramienta. El texto es esa lista legible. La firma permanece con ella.",
    pt: "Alguém precisa ler os casos num e-mail ou numa nota, sem uma ferramenta. O texto é essa lista legível. A assinatura permanece com ela.",
    de: "Jemand muss die Fälle in einer Mail oder einer Notiz lesen, ohne Werkzeug. Text ist diese lesbare Liste. Die Signatur bleibt dabei.",
    fr: "Quelqu’un doit lire les cas dans un mail ou une note, sans outil. Le texte est cette liste lisible. La signature reste avec elle.",
    it: "Qualcuno deve leggere i casi in una mail o in una nota, senza uno strumento. Il testo è quell’elenco leggibile. La firma resta con esso."
  },
  pdf: {
    en: "You need the cases on paper, or as a PDF someone can file. Print is that path. This clip leaves the dialog closed, so the page stays visible while you see the choice.",
    es: "Necesitas los casos en papel, o como un PDF que alguien pueda archivar. Imprimir es ese camino. Este clip deja el diálogo cerrado, para que la página siga visible mientras ves la opción.",
    pt: "Você precisa dos casos no papel, ou como um PDF que alguém possa arquivar. Imprimir é esse caminho. Este clipe deixa o diálogo fechado, para a página continuar visível enquanto você vê a opção.",
    de: "Sie brauchen die Fälle auf Papier oder als PDF, das jemand ablegen kann. Drucken ist dieser Weg. Dieser Clip lässt den Dialog geschlossen, damit die Seite sichtbar bleibt, während Sie die Wahl sehen.",
    fr: "Vous avez besoin des cas sur papier, ou en PDF que quelqu’un peut classer. Imprimer est ce chemin. Cet extrait laisse la boîte fermée, pour que la page reste visible pendant que vous voyez le choix.",
    it: "Ti servono i casi su carta, o come PDF che qualcuno può archiviare. Stampare è quella via. Questa clip lascia la finestra chiusa, così la pagina resta visibile mentre vedi la scelta."
  }
};

const SHARE = {
  email: {
    en: "The report is ready, and the person who needs it reads mail. Email prepares the link. This clip stays on the page, so you see the choice without leaving the report.",
    es: "El informe está listo, y quien lo necesita lee el correo. El correo prepara el enlace. Este clip permanece en la página, para que veas la opción sin salir del informe.",
    pt: "O relatório está pronto, e quem precisa dele lê e-mail. O e-mail prepara o link. Este clipe permanece na página, para você ver a opção sem sair do relatório.",
    de: "Der Bericht ist fertig, und die Person, die ihn braucht, liest Mail. E-Mail bereitet den Link vor. Dieser Clip bleibt auf der Seite, damit Sie die Wahl sehen, ohne den Bericht zu verlassen.",
    fr: "Le rapport est prêt, et la personne qui en a besoin lit le courrier. L’e-mail prépare le lien. Cet extrait reste sur la page, pour que vous voyiez le choix sans quitter le rapport.",
    it: "Il rapporto è pronto, e chi ne ha bisogno legge la posta. L’e-mail prepara il link. Questa clip resta sulla pagina, così vedi la scelta senza lasciare il rapporto."
  },
  linkedin: {
    en: "You want a colleague on LinkedIn to open the same report. This share prepares that link. The clip stays here, so the choice is visible without leaving.",
    es: "Quieres que un colega en LinkedIn abra el mismo informe. Este compartir prepara ese enlace. El clip se queda aquí, para que la opción se vea sin salir.",
    pt: "Você quer que um colega no LinkedIn abra o mesmo relatório. Este compartilhar prepara esse link. O clipe fica aqui, para a opção aparecer sem sair.",
    de: "Sie wollen, dass eine Kollegin oder ein Kollege auf LinkedIn denselben Bericht öffnet. Dieses Teilen bereitet den Link vor. Der Clip bleibt hier, damit die Wahl sichtbar ist, ohne zu gehen.",
    fr: "Vous voulez qu’un collègue sur LinkedIn ouvre le même rapport. Ce partage prépare ce lien. L’extrait reste ici, pour que le choix se voie sans partir.",
    it: "Vuoi che un collega su LinkedIn apra lo stesso rapporto. Questa condivisione prepara quel link. La clip resta qui, così la scelta si vede senza uscire."
  },
  x: {
    en: "A short public note is how this report should travel. X prepares the link. This clip stays on the page, so you can see the choice before you post.",
    es: "Una nota pública breve es cómo debe viajar este informe. X prepara el enlace. Este clip permanece en la página, para que veas la opción antes de publicar.",
    pt: "Uma nota pública curta é como este relatório deve viajar. O X prepara o link. Este clipe permanece na página, para você ver a opção antes de publicar.",
    de: "Eine kurze öffentliche Notiz ist der Weg, auf dem dieser Bericht reisen soll. X bereitet den Link vor. Dieser Clip bleibt auf der Seite, damit Sie die Wahl sehen, bevor Sie senden.",
    fr: "Une courte note publique est la façon dont ce rapport doit voyager. X prépare le lien. Cet extrait reste sur la page, pour que vous voyiez le choix avant de publier.",
    it: "Una nota pubblica breve è il modo in cui questo rapporto deve viaggiare. X prepara il link. Questa clip resta sulla pagina, così vedi la scelta prima di pubblicare."
  },
  whatsapp: {
    en: "The person who needs the report is on WhatsApp, not in your test tool. This share prepares the link for that chat. The clip stays on the page.",
    es: "Quien necesita el informe está en WhatsApp, no en tu herramienta de pruebas. Este compartir prepara el enlace para ese chat. El clip permanece en la página.",
    pt: "Quem precisa do relatório está no WhatsApp, não na sua ferramenta de teste. Este compartilhar prepara o link para essa conversa. O clipe permanece na página.",
    de: "Die Person, die den Bericht braucht, ist auf WhatsApp, nicht in Ihrem Testwerkzeug. Dieses Teilen bereitet den Link für diesen Chat vor. Der Clip bleibt auf der Seite.",
    fr: "La personne qui a besoin du rapport est sur WhatsApp, pas dans votre outil de test. Ce partage prépare le lien pour cette conversation. L’extrait reste sur la page.",
    it: "Chi ha bisogno del rapporto è su WhatsApp, non nel tuo strumento di test. Questa condivisione prepara il link per quella chat. La clip resta sulla pagina."
  },
  telegram: {
    en: "The team already talks in Telegram. This share prepares the report link for that conversation. The clip stays here, so you see the choice without leaving.",
    es: "El equipo ya habla en Telegram. Este compartir prepara el enlace del informe para esa conversación. El clip se queda aquí, para que veas la opción sin salir.",
    pt: "A equipe já conversa no Telegram. Este compartilhar prepara o link do relatório para essa conversa. O clipe fica aqui, para você ver a opção sem sair.",
    de: "Das Team spricht schon in Telegram. Dieses Teilen bereitet den Berichtslink für dieses Gespräch vor. Der Clip bleibt hier, damit Sie die Wahl sehen, ohne zu gehen.",
    fr: "L’équipe parle déjà sur Telegram. Ce partage prépare le lien du rapport pour cette conversation. L’extrait reste ici, pour que vous voyiez le choix sans partir.",
    it: "Il team parla già su Telegram. Questa condivisione prepara il link del rapporto per quella conversazione. La clip resta qui, così vedi la scelta senza uscire."
  },
  facebook: {
    en: "The report should reach people who are on Facebook. This share prepares the link. The clip stays on the page, so the choice is clear before you leave.",
    es: "El informe debe llegar a quienes están en Facebook. Este compartir prepara el enlace. El clip permanece en la página, para que la opción quede clara antes de salir.",
    pt: "O relatório deve chegar a quem está no Facebook. Este compartilhar prepara o link. O clipe permanece na página, para a opção ficar clara antes de sair.",
    de: "Der Bericht soll Menschen erreichen, die auf Facebook sind. Dieses Teilen bereitet den Link vor. Der Clip bleibt auf der Seite, damit die Wahl klar ist, bevor Sie gehen.",
    fr: "Le rapport doit atteindre des personnes qui sont sur Facebook. Ce partage prépare le lien. L’extrait reste sur la page, pour que le choix soit clair avant de partir.",
    it: "Il rapporto deve raggiungere chi sta su Facebook. Questa condivisione prepara il link. La clip resta sulla pagina, così la scelta è chiara prima di uscire."
  },
  system: {
    en: "You do not want to pick an app yet. The share sheet lets the device offer the places you already use. This clip stays on the page, so you can see that choice.",
    es: "Todavía no quieres elegir una aplicación. La hoja de compartir deja que el dispositivo ofrezca los lugares que ya usas. Este clip permanece en la página, para que veas esa opción.",
    pt: "Você ainda não quer escolher um aplicativo. A folha de compartilhar deixa o aparelho oferecer os lugares que você já usa. Este clipe permanece na página, para você ver essa opção.",
    de: "Sie wollen noch keine App wählen. Das Teilen-Menü lässt das Gerät die Orte anbieten, die Sie schon nutzen. Dieser Clip bleibt auf der Seite, damit Sie diese Wahl sehen.",
    fr: "Vous ne voulez pas encore choisir une application. La feuille de partage laisse l’appareil proposer les endroits que vous utilisez déjà. Cet extrait reste sur la page, pour que vous voyiez ce choix.",
    it: "Non vuoi ancora scegliere un’app. Il foglio di condivisione lascia che il dispositivo offra i posti che già usi. Questa clip resta sulla pagina, così vedi quella scelta."
  }
};

function scopePath(pages, depth, lang) {
  const lines = {
    en: "You already used the included read, and you need to go further: " + pages + " pages and " + depth + " links deep. You come back as the same person. The first framework is nineteen dollars, and each one you add is discounted. PayPal’s test checkout shows the amount before anything is confirmed. When that confirmation returns, the report opens in full. There is no watermark and no progressive blur. One line remains: this report was generated with QA-lab URL Review by Carlos Muñoz. Share it, download it, and open the file.",
    es: "Ya usaste la lectura incluida, y necesitas ir más lejos: " + pages + " páginas y " + depth + " enlaces de profundidad. Vuelves como la misma persona. El primer framework cuesta diecinueve dólares, y cada uno que agregas tiene descuento. La caja de prueba de PayPal muestra el monto antes de confirmar. Cuando esa confirmación regresa, el informe se abre por completo. No hay marca de agua ni desenfoque progresivo. Queda una línea: este informe se generó con QA-lab URL Review por Carlos Muñoz. Compártelo, descárgalo y abre el archivo.",
    pt: "Você já usou a leitura incluída, e precisa ir mais longe: " + pages + " páginas e " + depth + " links de profundidade. Você volta como a mesma pessoa. O primeiro framework custa dezenove dólares, e cada um que você acrescenta tem desconto. O checkout de teste do PayPal mostra o valor antes de confirmar. Quando essa confirmação volta, o relatório abre por completo. Não há marca d’água nem desfoque progressivo. Fica uma linha: este relatório foi gerado com QA-lab URL Review por Carlos Muñoz. Compartilhe, baixe e abra o arquivo.",
    de: "Sie haben die enthaltene Lesung schon genutzt und müssen weiter gehen: " + pages + " Seiten und " + depth + " Links tief. Sie kommen als dieselbe Person zurück. Das erste Framework kostet neunzehn Dollar, und jedes weitere ist rabattiert. Die Testkasse von PayPal zeigt den Betrag, bevor etwas bestätigt wird. Wenn diese Bestätigung zurückkehrt, öffnet sich der Bericht vollständig. Es gibt kein Wasserzeichen und keine fortschreitende Unschärfe. Eine Zeile bleibt: Dieser Bericht wurde mit QA-lab URL Review von Carlos Muñoz erzeugt. Teilen Sie ihn, laden Sie ihn herunter und öffnen Sie die Datei.",
    fr: "Vous avez déjà utilisé la lecture incluse, et vous devez aller plus loin : " + pages + " pages et " + depth + " liens de profondeur. Vous revenez comme la même personne. Le premier framework coûte dix-neuf dollars, et chacun que vous ajoutez est remisé. La caisse de test de PayPal montre le montant avant toute confirmation. Quand cette confirmation revient, le rapport s’ouvre en entier. Il n’y a pas de filigrane ni de flou progressif. Une ligne reste : ce rapport a été généré avec QA-lab URL Review par Carlos Muñoz. Partagez-le, téléchargez-le et ouvrez le fichier.",
    it: "Hai già usato la lettura inclusa, e devi andare oltre: " + pages + " pagine e " + depth + " link di profondità. Torni come la stessa persona. Il primo framework costa diciannove dollari, e ognuno che aggiungi è scontato. La cassa di prova di PayPal mostra l’importo prima di confermare. Quando quella conferma torna, il rapporto si apre per intero. Non c’è filigrana né sfocatura progressiva. Resta una riga: questo rapporto è stato generato con QA-lab URL Review da Carlos Muñoz. Condividilo, scaricalo e apri il file."
  };
  return lines[lang];
}

function framework(name, lang) {
  return FRAMEWORKS[name][lang];
}

function scope(id, lang) {
  const key = id.replace("scope-", "");
  return SCOPES[key][lang];
}

function share(id, lang) {
  return SHARE[id.replace("share-", "")][lang];
}

module.exports = { LINES, EXPORTS, framework, scope, share, scopePath };
