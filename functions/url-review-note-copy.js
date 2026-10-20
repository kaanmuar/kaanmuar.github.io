/**
 * Return notes as scenes: a reason to come back, never the price rules.
 * Each row is [title, body, subject]. A person gets the next scene in line, so no note repeats.
 *   return: ran a review, saw the frosted report, has not come back for a week.
 *   paid:   paid once and holds the full report.
 *   offer:  ran a review this week.
 */
module.exports = {
  en: {
    return: [
      ["The page is still talking.", "Your review of {host} found things worth fixing, and they are still sitting under the frost. Open the full report and read what the blur was hiding.", "What the blur was hiding on {host}"],
      ["Right now, someone is opening {host} on a phone.", "They will not write to you if a button is too small or a page scrolls sideways. They just leave. The full report shows where that happens.", "Someone just opened {host} on a phone"],
      ["Google read {host} again today.", "So did the AI crawlers. They do not wait for a good moment, and they score what they find. See what they see before they decide.", "Google read {host} again today"],
      ["Websites drift.", "A plugin updated, a deploy went out, someone added a script. Since your review, {host} has had time to change. Run it again and see what moved.", "{host} has had time to change"],
      ["Half a sentence is the hardest kind to let go.", "You saw how each finding on {host} starts. The end of each one says what to change and how long it takes. It is one click away.", "The other half of each finding"],
      ["Picture the next meeting.", "Instead of \"the site feels slow\", you bring a list: what fails, why, the fix, and the test case that proves it. The one for {host} is already waiting.", "Bring the {host} list to your next meeting"]
    ],
    paid: [
      ["You fixed things. Now prove it.", "Run {host} again and the new report sets itself beside the last one: what is fixed, what is new, and what is still there.", "Did the fixes on {host} hold?"],
      ["The second look catches what the first fix broke.", "Changes ripple. A new header, a moved menu, a lighter image can each break something nearby. A fresh run of {host} finds it before a visitor does.", "A second look at {host}"],
      ["There is a site next door.", "A client, a competitor, the landing page you launched last week. Point the review at it and compare it with {host}, side by side.", "Which site is next?"],
      ["Hand it to the team.", "The test cases from {host} export to Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel, or PDF, so nobody retypes a thing.", "Your {host} test cases, in your team's tool"],
      ["Go a level deeper.", "The first read looked at a slice of {host}. More pages and deeper links reach the forms, the checkout, and the corners nobody clicks during a demo.", "The corners of {host} nobody clicks"]
    ],
    offer: [
      ["While it is still fresh.", "You reviewed {host} this week. The details are still in your head, which makes this the best moment to read the full findings and fix the first one.", "While {host} is still fresh"],
      ["One fix this week.", "The report ranks what to fix first on {host}. Take the top line, give it an afternoon, then run the review again and watch the score move.", "One fix for {host} this week"],
      ["How does your competitor score?", "Run the same review on the site you compare yourself to. Then you will know whether {host} is ahead, behind, or just different.", "How does your competitor score?"],
      ["The test cases are already written.", "The review drafted test cases for {host} in the frameworks you picked. Open the report to read them in full and run them yourself.", "Test cases for {host} are waiting"],
      ["Ask the report a question.", "Can AI search read {host}? Does tracking start before the cookie choice? Is the site quick on a phone? The answers are in the full report.", "Three questions about {host}"]
    ]
  },
  es: {
    return: [
      ["La página sigue hablando.", "Tu revisión de {host} encontró cosas que vale la pena arreglar, y siguen ahí, bajo el vidrio empañado. Abre el informe completo y lee lo que el desenfoque escondía.", "Lo que el desenfoque escondía en {host}"],
      ["Ahora mismo, alguien está abriendo {host} en un celular.", "No te va a escribir si un botón es muy pequeño o si la página se corre hacia los lados. Simplemente se va. El informe completo muestra dónde pasa eso.", "Alguien acaba de abrir {host} en un celular"],
      ["Google volvió a leer {host} hoy.", "Y también los rastreadores de IA. No esperan un buen momento, y califican lo que encuentran. Mira lo que ellos ven antes de que decidan.", "Google volvió a leer {host} hoy"],
      ["Los sitios se mueven solos.", "Se actualizó un plugin, salió un despliegue, alguien agregó un script. Desde tu revisión, {host} ha tenido tiempo de cambiar. Córrela otra vez y mira qué se movió.", "{host} ha tenido tiempo de cambiar"],
      ["Media frase es la más difícil de soltar.", "Viste cómo empieza cada hallazgo de {host}. El final de cada uno dice qué cambiar y cuánto toma. Está a un clic.", "La otra mitad de cada hallazgo"],
      ["Imagina la próxima reunión.", "En lugar de \"el sitio se siente lento\", llegas con una lista: qué falla, por qué, cómo se arregla y el caso de prueba que lo demuestra. La de {host} ya te está esperando.", "Lleva la lista de {host} a tu próxima reunión"]
    ],
    paid: [
      ["Arreglaste cosas. Ahora demuéstralo.", "Corre {host} otra vez y el nuevo informe se pone al lado del anterior: qué quedó arreglado, qué es nuevo y qué sigue ahí.", "¿Aguantaron los arreglos en {host}?"],
      ["La segunda mirada encuentra lo que el primer arreglo rompió.", "Los cambios se propagan. Un encabezado nuevo, un menú que se movió o una imagen más liviana pueden romper algo al lado. Una revisión nueva de {host} lo encuentra antes que un visitante.", "Una segunda mirada a {host}"],
      ["Hay un sitio al lado.", "Un cliente, un competidor, la landing que lanzaste la semana pasada. Apunta la revisión hacia allá y compárala con {host}, lado a lado.", "¿Qué sitio sigue?"],
      ["Pásaselo al equipo.", "Los casos de prueba de {host} se exportan a Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel o PDF, para que nadie tenga que volver a escribir nada.", "Tus casos de prueba de {host}, en la herramienta de tu equipo"],
      ["Baja un nivel más.", "La primera lectura miró una parte de {host}. Más páginas y enlaces más profundos llegan a los formularios, al pago y a los rincones que nadie toca en una demo.", "Los rincones de {host} que nadie toca"]
    ],
    offer: [
      ["Mientras está fresco.", "Revisaste {host} esta semana. Todavía tienes los detalles en la cabeza, y es el mejor momento para leer los hallazgos completos y arreglar el primero.", "Mientras {host} sigue fresco"],
      ["Un arreglo esta semana.", "El informe ordena qué arreglar primero en {host}. Toma la primera línea, dale una tarde y vuelve a correr la revisión para ver cómo se mueve el puntaje.", "Un arreglo para {host} esta semana"],
      ["¿Cuánto saca tu competencia?", "Corre la misma revisión en el sitio con el que te comparas. Así sabrás si {host} va adelante, atrás o simplemente distinto.", "¿Cuánto saca tu competencia?"],
      ["Los casos de prueba ya están escritos.", "La revisión redactó casos de prueba para {host} en los frameworks que elegiste. Abre el informe para leerlos completos y correrlos tú mismo.", "Los casos de prueba de {host} te esperan"],
      ["Hazle una pregunta al informe.", "¿La búsqueda con IA puede leer {host}? ¿El rastreo empieza antes de elegir las cookies? ¿El sitio es rápido en un celular? Las respuestas están en el informe completo.", "Tres preguntas sobre {host}"]
    ]
  },
  pt: {
    return: [
      ["A página ainda está falando.", "Sua revisão de {host} encontrou coisas que valem a pena corrigir, e elas continuam ali, debaixo do vidro embaçado. Abra o relatório completo e leia o que o desfoque escondia.", "O que o desfoque escondia em {host}"],
      ["Agora mesmo, alguém está abrindo {host} no celular.", "Essa pessoa não vai te escrever se um botão for pequeno demais ou se a página rolar para o lado. Ela só vai embora. O relatório completo mostra onde isso acontece.", "Alguém acabou de abrir {host} no celular"],
      ["O Google leu {host} de novo hoje.", "Os robôs de IA também. Eles não esperam um bom momento e dão nota ao que encontram. Veja o que eles veem antes que decidam.", "O Google leu {host} de novo hoje"],
      ["Sites mudam sozinhos.", "Um plugin atualizou, um deploy saiu, alguém adicionou um script. Desde a sua revisão, {host} teve tempo de mudar. Rode de novo e veja o que mexeu.", "{host} teve tempo de mudar"],
      ["Meia frase é a mais difícil de largar.", "Você viu como começa cada achado de {host}. O final de cada um diz o que mudar e quanto tempo leva. Está a um clique.", "A outra metade de cada achado"],
      ["Imagine a próxima reunião.", "Em vez de \"o site parece lento\", você chega com uma lista: o que falha, por quê, a correção e o caso de teste que prova. A de {host} já está esperando por você.", "Leve a lista de {host} para a próxima reunião"]
    ],
    paid: [
      ["Você corrigiu coisas. Agora prove.", "Rode {host} de novo e o novo relatório fica ao lado do anterior: o que foi corrigido, o que é novo e o que continua lá.", "As correções em {host} seguraram?"],
      ["O segundo olhar acha o que a primeira correção quebrou.", "Mudanças se espalham. Um cabeçalho novo, um menu que mudou de lugar, uma imagem mais leve podem quebrar algo ao lado. Uma revisão nova de {host} acha antes de um visitante.", "Um segundo olhar em {host}"],
      ["Tem um site ao lado.", "Um cliente, um concorrente, a landing page que você lançou semana passada. Aponte a revisão para ele e compare com {host}, lado a lado.", "Qual site vem agora?"],
      ["Passe para o time.", "Os casos de teste de {host} exportam para Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel ou PDF, e ninguém precisa digitar nada de novo.", "Seus casos de teste de {host}, na ferramenta do seu time"],
      ["Desça mais um nível.", "A primeira leitura olhou uma parte de {host}. Mais páginas e links mais fundos chegam aos formulários, ao checkout e aos cantos que ninguém clica numa demo.", "Os cantos de {host} que ninguém clica"]
    ],
    offer: [
      ["Enquanto está fresco.", "Você revisou {host} esta semana. Os detalhes ainda estão na cabeça, e é o melhor momento para ler os achados completos e corrigir o primeiro.", "Enquanto {host} está fresco"],
      ["Uma correção esta semana.", "O relatório ordena o que corrigir primeiro em {host}. Pegue a primeira linha, dedique uma tarde e rode a revisão de novo para ver a nota mexer.", "Uma correção para {host} esta semana"],
      ["Quanto tira o seu concorrente?", "Rode a mesma revisão no site com que você se compara. Assim você sabe se {host} está na frente, atrás ou só diferente.", "Quanto tira o seu concorrente?"],
      ["Os casos de teste já estão escritos.", "A revisão escreveu casos de teste para {host} nos frameworks que você escolheu. Abra o relatório para ler tudo e rodar você mesmo.", "Os casos de teste de {host} esperam por você"],
      ["Faça uma pergunta ao relatório.", "A busca com IA consegue ler {host}? O rastreamento começa antes da escolha de cookies? O site é rápido no celular? As respostas estão no relatório completo.", "Três perguntas sobre {host}"]
    ]
  },
  de: {
    return: [
      ["Die Seite redet noch.", "Deine Prüfung von {host} hat Dinge gefunden, die sich zu beheben lohnen, und sie liegen noch unter dem Milchglas. Öffne den vollständigen Bericht und lies, was die Unschärfe verdeckt hat.", "Was die Unschärfe auf {host} verdeckt hat"],
      ["Gerade öffnet jemand {host} auf dem Handy.", "Diese Person schreibt dir nicht, wenn ein Button zu klein ist oder die Seite seitlich wegrutscht. Sie geht einfach. Der vollständige Bericht zeigt, wo das passiert.", "Gerade hat jemand {host} auf dem Handy geöffnet"],
      ["Google hat {host} heute wieder gelesen.", "Die KI-Crawler auch. Sie warten nicht auf einen guten Moment, und sie bewerten, was sie finden. Sieh dir an, was sie sehen, bevor sie entscheiden.", "Google hat {host} heute wieder gelesen"],
      ["Websites verändern sich von allein.", "Ein Plugin wurde aktualisiert, ein Deploy ging raus, jemand hat ein Skript eingebaut. Seit deiner Prüfung hatte {host} Zeit, sich zu verändern. Prüf noch einmal und sieh, was sich bewegt hat.", "{host} hatte Zeit, sich zu verändern"],
      ["Ein halber Satz lässt einen nicht los.", "Du hast gesehen, wie jeder Befund zu {host} anfängt. Das Ende sagt, was zu ändern ist und wie lange es dauert. Es ist einen Klick entfernt.", "Die andere Hälfte jedes Befunds"],
      ["Stell dir das nächste Meeting vor.", "Statt \"die Seite fühlt sich langsam an\" bringst du eine Liste mit: was fehlschlägt, warum, die Lösung und den Testfall, der es beweist. Die Liste für {host} wartet schon.", "Nimm die Liste für {host} ins nächste Meeting mit"]
    ],
    paid: [
      ["Du hast Dinge behoben. Jetzt beweis es.", "Prüf {host} noch einmal, und der neue Bericht stellt sich neben den letzten: was behoben ist, was neu ist und was noch da ist.", "Haben die Korrekturen auf {host} gehalten?"],
      ["Der zweite Blick findet, was die erste Korrektur kaputt gemacht hat.", "Änderungen ziehen Kreise. Ein neuer Header, ein verschobenes Menü, ein leichteres Bild können nebenan etwas brechen. Eine neue Prüfung von {host} findet es vor einem Besucher.", "Ein zweiter Blick auf {host}"],
      ["Nebenan gibt es noch eine Website.", "Ein Kunde, ein Wettbewerber, die Landingpage von letzter Woche. Richte die Prüfung darauf und vergleiche sie mit {host}, Seite an Seite.", "Welche Website ist als Nächstes dran?"],
      ["Gib es ans Team weiter.", "Die Testfälle für {host} lassen sich nach Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel oder PDF exportieren, damit niemand etwas abtippen muss.", "Deine Testfälle für {host}, im Tool deines Teams"],
      ["Geh eine Ebene tiefer.", "Die erste Prüfung hat einen Ausschnitt von {host} gelesen. Mehr Seiten und tiefere Links erreichen die Formulare, den Checkout und die Ecken, die in keiner Demo jemand anklickt.", "Die Ecken von {host}, die niemand anklickt"]
    ],
    offer: [
      ["Solange es frisch ist.", "Du hast {host} diese Woche geprüft. Die Details sind noch im Kopf: der beste Moment, die vollständigen Befunde zu lesen und den ersten zu beheben.", "Solange {host} noch frisch ist"],
      ["Eine Korrektur diese Woche.", "Der Bericht sortiert, was auf {host} zuerst zu beheben ist. Nimm die oberste Zeile, gib ihr einen Nachmittag und prüf dann noch einmal, um den Wert steigen zu sehen.", "Eine Korrektur für {host} diese Woche"],
      ["Wie schneidet dein Wettbewerber ab?", "Lass dieselbe Prüfung auf der Website laufen, mit der du dich vergleichst. Dann weißt du, ob {host} vorne liegt, hinten oder einfach anders ist.", "Wie schneidet dein Wettbewerber ab?"],
      ["Die Testfälle sind schon geschrieben.", "Die Prüfung hat Testfälle für {host} in den Frameworks entworfen, die du gewählt hast. Öffne den Bericht, um sie vollständig zu lesen und selbst auszuführen.", "Die Testfälle für {host} warten"],
      ["Stell dem Bericht eine Frage.", "Kann die KI-Suche {host} lesen? Startet das Tracking vor der Cookie-Wahl? Ist die Seite auf dem Handy schnell? Die Antworten stehen im vollständigen Bericht.", "Drei Fragen zu {host}"]
    ]
  },
  fr: {
    return: [
      ["La page parle encore.", "Votre revue de {host} a trouvé des choses qui méritent d'être corrigées, et elles sont toujours là, sous le verre dépoli. Ouvrez le rapport complet et lisez ce que le flou cachait.", "Ce que le flou cachait sur {host}"],
      ["En ce moment, quelqu'un ouvre {host} sur son téléphone.", "Cette personne ne vous écrira pas si un bouton est trop petit ou si la page défile sur le côté. Elle partira, c'est tout. Le rapport complet montre où cela arrive.", "Quelqu'un vient d'ouvrir {host} sur son téléphone"],
      ["Google a relu {host} aujourd'hui.", "Les robots d'IA aussi. Ils n'attendent pas le bon moment, et ils notent ce qu'ils trouvent. Voyez ce qu'ils voient avant qu'ils ne décident.", "Google a relu {host} aujourd'hui"],
      ["Les sites bougent tout seuls.", "Un plugin s'est mis à jour, un déploiement est parti, quelqu'un a ajouté un script. Depuis votre revue, {host} a eu le temps de changer. Relancez-la et voyez ce qui a bougé.", "{host} a eu le temps de changer"],
      ["Une demi-phrase ne se laisse pas oublier.", "Vous avez vu comment commence chaque constat sur {host}. La fin de chacun dit quoi changer et combien de temps cela prend. C'est à un clic.", "L'autre moitié de chaque constat"],
      ["Imaginez la prochaine réunion.", "Au lieu de « le site semble lent », vous arrivez avec une liste : ce qui échoue, pourquoi, la correction et le cas de test qui le prouve. Celle de {host} vous attend déjà.", "Apportez la liste de {host} à votre prochaine réunion"]
    ],
    paid: [
      ["Vous avez corrigé. Prouvez-le.", "Relancez {host} et le nouveau rapport se place à côté du précédent : ce qui est corrigé, ce qui est nouveau, ce qui reste.", "Les corrections sur {host} ont-elles tenu ?"],
      ["Le second regard trouve ce que la première correction a cassé.", "Les changements font des vagues. Un nouvel en-tête, un menu déplacé, une image plus légère peuvent casser quelque chose à côté. Une nouvelle revue de {host} le trouve avant un visiteur.", "Un second regard sur {host}"],
      ["Il y a un site d'à côté.", "Un client, un concurrent, la page d'atterrissage lancée la semaine dernière. Pointez la revue dessus et comparez-la à {host}, côte à côte.", "Quel site après celui-ci ?"],
      ["Passez-le à l'équipe.", "Les cas de test de {host} s'exportent vers Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel ou PDF, pour que personne n'ait à tout ressaisir.", "Vos cas de test de {host}, dans l'outil de votre équipe"],
      ["Descendez d'un niveau.", "La première lecture a parcouru une partie de {host}. Plus de pages et des liens plus profonds atteignent les formulaires, le paiement et les recoins que personne ne clique pendant une démo.", "Les recoins de {host} que personne ne clique"]
    ],
    offer: [
      ["Pendant que c'est frais.", "Vous avez analysé {host} cette semaine. Les détails sont encore en tête : c'est le meilleur moment pour lire les constats complets et corriger le premier.", "Pendant que {host} est encore frais"],
      ["Une correction cette semaine.", "Le rapport classe ce qu'il faut corriger en premier sur {host}. Prenez la première ligne, donnez-lui un après-midi, puis relancez la revue pour voir la note bouger.", "Une correction pour {host} cette semaine"],
      ["Quelle note pour votre concurrent ?", "Lancez la même revue sur le site auquel vous vous comparez. Vous saurez si {host} est devant, derrière ou simplement différent.", "Quelle note pour votre concurrent ?"],
      ["Les cas de test sont déjà écrits.", "La revue a rédigé des cas de test pour {host} dans les frameworks choisis. Ouvrez le rapport pour les lire en entier et les lancer vous-même.", "Les cas de test de {host} vous attendent"],
      ["Posez une question au rapport.", "La recherche par IA peut-elle lire {host} ? Le suivi démarre-t-il avant le choix des cookies ? Le site est-il rapide sur téléphone ? Les réponses sont dans le rapport complet.", "Trois questions sur {host}"]
    ]
  },
  it: {
    return: [
      ["La pagina sta ancora parlando.", "La tua revisione di {host} ha trovato cose che vale la pena sistemare, e sono ancora lì, sotto il vetro smerigliato. Apri il report completo e leggi cosa nascondeva la sfocatura.", "Cosa nascondeva la sfocatura su {host}"],
      ["Proprio ora, qualcuno sta aprendo {host} dal telefono.", "Non ti scriverà se un pulsante è troppo piccolo o se la pagina scorre di lato. Se ne andrà e basta. Il report completo mostra dove succede.", "Qualcuno ha appena aperto {host} dal telefono"],
      ["Google ha riletto {host} oggi.", "Anche i crawler dell'IA. Non aspettano il momento giusto, e danno un voto a quello che trovano. Guarda quello che vedono prima che decidano.", "Google ha riletto {host} oggi"],
      ["I siti cambiano da soli.", "Un plugin si è aggiornato, è uscito un deploy, qualcuno ha aggiunto uno script. Dalla tua revisione, {host} ha avuto tempo di cambiare. Rilanciala e guarda cosa si è mosso.", "{host} ha avuto tempo di cambiare"],
      ["Una mezza frase non si dimentica.", "Hai visto come inizia ogni rilievo su {host}. La fine di ognuno dice cosa cambiare e quanto tempo ci vuole. È a un clic.", "L'altra metà di ogni rilievo"],
      ["Immagina la prossima riunione.", "Invece di \"il sito sembra lento\", arrivi con una lista: cosa non va, perché, la correzione e il caso di test che lo dimostra. Quella di {host} ti sta già aspettando.", "Porta la lista di {host} alla prossima riunione"]
    ],
    paid: [
      ["Hai sistemato delle cose. Ora dimostralo.", "Rilancia {host} e il nuovo report si mette accanto al precedente: cosa è sistemato, cosa è nuovo, cosa è ancora lì.", "Le correzioni su {host} hanno retto?"],
      ["Il secondo sguardo trova quello che la prima correzione ha rotto.", "I cambiamenti si propagano. Un header nuovo, un menu spostato, un'immagine più leggera possono rompere qualcosa accanto. Una nuova revisione di {host} lo trova prima di un visitatore.", "Un secondo sguardo a {host}"],
      ["C'è un sito accanto.", "Un cliente, un concorrente, la landing page lanciata la settimana scorsa. Punta la revisione lì e confrontala con {host}, fianco a fianco.", "Quale sito tocca adesso?"],
      ["Passalo al team.", "I casi di test di {host} si esportano in Jira, TestRail, Xray, Zephyr, Azure DevOps, Excel o PDF, così nessuno deve ricopiare niente.", "I tuoi casi di test di {host}, nello strumento del tuo team"],
      ["Scendi di un livello.", "La prima lettura ha guardato una parte di {host}. Più pagine e link più profondi arrivano ai moduli, al checkout e agli angoli che nessuno clicca durante una demo.", "Gli angoli di {host} che nessuno clicca"]
    ],
    offer: [
      ["Finché è fresco.", "Hai rivisto {host} questa settimana. I dettagli sono ancora in testa: è il momento migliore per leggere i rilievi completi e sistemare il primo.", "Finché {host} è ancora fresco"],
      ["Una correzione questa settimana.", "Il report mette in ordine cosa sistemare prima su {host}. Prendi la prima riga, dedicale un pomeriggio, poi rilancia la revisione e guarda il punteggio muoversi.", "Una correzione per {host} questa settimana"],
      ["Quanto prende il tuo concorrente?", "Lancia la stessa revisione sul sito con cui ti confronti. Saprai se {host} è avanti, indietro o semplicemente diverso.", "Quanto prende il tuo concorrente?"],
      ["I casi di test sono già scritti.", "La revisione ha preparato casi di test per {host} nei framework che hai scelto. Apri il report per leggerli per intero ed eseguirli tu stesso.", "I casi di test di {host} ti aspettano"],
      ["Fai una domanda al report.", "La ricerca con IA riesce a leggere {host}? Il tracciamento parte prima della scelta sui cookie? Il sito è veloce sul telefono? Le risposte sono nel report completo.", "Tre domande su {host}"]
    ]
  }
};
