"use strict";

/* Incident-response playbooks for the paid "Was it targeted?" reports (#3958).

   Source: the Incident Response Methodology (IRM) cheat sheets by CERT Societe Generale
   (https://github.com/certsocietegenerale/IRM), licensed CC BY 3.0 Unported. The repository's README and LICENSE.md
   state that licence (checked Nov 2026). These are ADAPTATIONS, not copies: each one condenses the matching IRM
   sheet to the steps a small site owner can take, keeps the IRM phase order (identify, contain, remediate, recover
   and learn), and is written in English, Spanish and French. The licence asks us to say that changes were made, so
   every output carries ATTRIBUTION below. CERT Societe Generale does not endorse this text.
   German, Italian and Portuguese come after native review (#3952); those languages get the English playbook. */

const SOURCE_URL = "https://github.com/certsocietegenerale/IRM";
const LICENSE_URL = "https://creativecommons.org/licenses/by/3.0/";

const ATTRIBUTION = {
  en: "Playbooks adapted from the Incident Response Methodology (IRM) by CERT Société Générale (" + SOURCE_URL + "), licensed CC BY 3.0 (" + LICENSE_URL + "). The original was condensed and rewritten; changes were made. CERT Société Générale does not endorse this report.",
  es: "Guías adaptadas de la Incident Response Methodology (IRM) de CERT Société Générale (" + SOURCE_URL + "), con licencia CC BY 3.0 (" + LICENSE_URL + "). El original se condensó, se reescribió y se tradujo al español; se hicieron cambios. CERT Société Générale no respalda este informe.",
  fr: "Guides adaptés de l’Incident Response Methodology (IRM) du CERT Société Générale (" + SOURCE_URL + "), sous licence CC BY 3.0 (" + LICENSE_URL + "). L’original a été condensé et réécrit ; des modifications ont été apportées. Le CERT Société Générale n’endosse pas ce rapport."
};

const HEADING = {
  en: { section: "What to do if it was targeted", phases: { identify: "Identify", contain: "Contain", remediate: "Remediate", recover: "Recover and learn" }, irm: "Adapted from IRM", note: "German, Italian and Portuguese playbooks follow after native review; this section is in English for now." },
  es: { section: "Qué hacer si fue un ataque dirigido", phases: { identify: "Identificar", contain: "Contener", remediate: "Remediar", recover: "Recuperar y aprender" }, irm: "Adaptado de IRM" },
  fr: { section: "Que faire en cas d’attaque ciblée", phases: { identify: "Identifier", contain: "Contenir", remediate: "Corriger", recover: "Rétablir et capitaliser" }, irm: "Adapté de l’IRM" }
};

const PHASES = ["identify", "contain", "remediate", "recover"];

// Finding key -> playbook id. Every key the targeted reports raise is covered.
const FOR_KEY = {
  "sec-kev": "intrusion",
  "sec-osv": "intrusion",
  "sec-targeted": "intrusion",
  "sec-drop": "network",
  "sec-feodo": "network",
  "sec-breach-news": "leak",
  "sec-cert-anomaly": "defacement"
};

const PLAYBOOKS = {
  intrusion: {
    irm: "IRM-2 / IRM-3",
    title: { en: "Server or application intrusion", es: "Intrusión en el servidor o la aplicación", fr: "Intrusion sur le serveur ou l’application" },
    steps: {
      identify: {
        en: ["Write down the time you first saw the signal, the listed software and version, and who found it.", "Read the web, application and login logs back to the first sign of the flaw being used: unknown admin users, new files, odd outbound traffic."],
        es: ["Anota la hora en que viste la señal, el software y la versión señalados, y quién lo encontró.", "Lee los registros web, de aplicación y de acceso hasta la primera señal de uso de la falla: administradores desconocidos, archivos nuevos, tráfico saliente raro."],
        fr: ["Notez l’heure à laquelle vous avez vu le signal, le logiciel et la version signalés, et qui l’a trouvé.", "Relisez les journaux web, applicatifs et de connexion jusqu’au premier signe d’exploitation de la faille : administrateurs inconnus, nouveaux fichiers, trafic sortant inhabituel."]
      },
      contain: {
        en: ["Take a copy of the server disk and the logs before you change anything, so the evidence survives.", "Cut the exposure: block the vulnerable route at the firewall or maintenance page, and reset every admin, database and API secret from a clean machine."],
        es: ["Haz una copia del disco del servidor y de los registros antes de cambiar nada, para conservar las pruebas.", "Corta la exposición: bloquea la ruta vulnerable en el cortafuegos o con una página de mantenimiento, y renueva desde un equipo limpio todas las claves de administración, base de datos y API."],
        fr: ["Faites une copie du disque du serveur et des journaux avant de rien modifier, pour conserver les preuves.", "Coupez l’exposition : bloquez la route vulnérable au pare-feu ou avec une page de maintenance, et renouvelez depuis un poste sain tous les secrets d’administration, de base de données et d’API."]
      },
      remediate: {
        en: ["Apply the vendor patch or upgrade the listed component, then rebuild from a known-good image instead of cleaning by hand.", "Remove accounts, keys, scheduled jobs and files you did not create, and check that the flaw no longer answers."],
        es: ["Aplica el parche del fabricante o actualiza el componente señalado, y reconstruye desde una imagen limpia en lugar de limpiar a mano.", "Elimina cuentas, claves, tareas programadas y archivos que no creaste, y comprueba que la falla ya no responde."],
        fr: ["Appliquez le correctif de l’éditeur ou mettez à jour le composant signalé, puis reconstruisez depuis une image saine plutôt que de nettoyer à la main.", "Supprimez les comptes, clés, tâches planifiées et fichiers que vous n’avez pas créés, et vérifiez que la faille ne répond plus."]
      },
      recover: {
        en: ["Put the site back, watch the logs for a week, and tell customers and your data-protection contact if their data may have been read.", "Write what happened, how long it lasted and the one change that would have stopped it; schedule that change."],
        es: ["Vuelve a publicar el sitio, vigila los registros durante una semana y avisa a los clientes y a tu contacto de protección de datos si sus datos pudieron leerse.", "Escribe qué pasó, cuánto duró y el único cambio que lo habría evitado; programa ese cambio."],
        fr: ["Remettez le site en ligne, surveillez les journaux pendant une semaine et prévenez vos clients et votre contact protection des données si leurs données ont pu être lues.", "Écrivez ce qui s’est passé, combien de temps cela a duré et le seul changement qui l’aurait évité ; planifiez-le."]
      }
    }
  },
  network: {
    irm: "IRM-5",
    title: { en: "Malicious network behaviour", es: "Comportamiento malicioso en la red", fr: "Comportement réseau malveillant" },
    steps: {
      identify: {
        en: ["Find which machine owns the listed address, and which process on it talks to the outside.", "Compare the traffic with a normal day: destinations, volume, hours."],
        es: ["Averigua qué equipo usa la dirección señalada y qué proceso suyo habla con el exterior.", "Compara el tráfico con un día normal: destinos, volumen, horas."],
        fr: ["Trouvez quelle machine possède l’adresse signalée et quel processus communique avec l’extérieur.", "Comparez le trafic avec une journée normale : destinations, volume, horaires."]
      },
      contain: {
        en: ["Cut that machine off the network but leave it powered, so memory and logs stay.", "Block the listed address and any destination it contacted at the firewall."],
        es: ["Desconecta ese equipo de la red pero déjalo encendido, para conservar la memoria y los registros.", "Bloquea en el cortafuegos la dirección señalada y cualquier destino con el que contactó."],
        fr: ["Isolez cette machine du réseau mais laissez-la allumée pour conserver la mémoire et les journaux.", "Bloquez au pare-feu l’adresse signalée et toute destination qu’elle a contactée."]
      },
      remediate: {
        en: ["Scan the machine with an up-to-date malware scanner, or reinstall it from a clean image.", "Change the passwords and keys that were stored on or typed into it."],
        es: ["Analiza el equipo con un antimalware actualizado, o reinstálalo desde una imagen limpia.", "Cambia las contraseñas y claves que estaban guardadas o se escribieron en él."],
        fr: ["Analysez la machine avec un antivirus à jour, ou réinstallez-la depuis une image saine.", "Changez les mots de passe et les clés qui y étaient stockés ou saisis."]
      },
      recover: {
        en: ["Reconnect it, watch its traffic for two weeks and confirm the address leaves the blocklist.", "Note how it got in, and close that route for the other machines."],
        es: ["Vuelve a conectarlo, vigila su tráfico durante dos semanas y comprueba que la dirección sale de la lista de bloqueo.", "Anota cómo entró y cierra esa vía en los demás equipos."],
        fr: ["Reconnectez-la, surveillez son trafic pendant deux semaines et vérifiez que l’adresse sort de la liste de blocage.", "Notez comment elle est entrée et fermez cette voie sur les autres machines."]
      }
    }
  },
  leak: {
    irm: "IRM-11",
    title: { en: "Information leakage", es: "Fuga de información", fr: "Fuite d’informations" },
    steps: {
      identify: {
        en: ["Read the cited news or post and decide what data it claims, and whether it is yours.", "Check your own systems for exports, public buckets and shared links that could hold that data."],
        es: ["Lee la noticia o publicación citada y decide qué datos afirma tener y si son tuyos.", "Revisa tus sistemas en busca de exportaciones, depósitos públicos y enlaces compartidos que puedan contener esos datos."],
        fr: ["Lisez l’article ou la publication cités et déterminez quelles données ils prétendent détenir, et si ce sont les vôtres.", "Vérifiez vos systèmes : exports, stockages publics et liens partagés pouvant contenir ces données."]
      },
      contain: {
        en: ["Close the public access you found and rotate any password or key that appears in the claimed data.", "Limit who is told, in writing, until the facts are clear."],
        es: ["Cierra el acceso público que encontraste y renueva cualquier contraseña o clave que aparezca en los datos supuestamente filtrados.", "Limita por escrito quién recibe la información hasta que los hechos estén claros."],
        fr: ["Fermez l’accès public trouvé et renouvelez tout mot de passe ou clé figurant dans les données annoncées.", "Limitez par écrit les personnes informées tant que les faits ne sont pas clairs."]
      },
      remediate: {
        en: ["Ask the publisher to remove the data if it is yours, and keep a copy of the request.", "Tell the people concerned and the regulator within the legal deadline when personal data is confirmed."],
        es: ["Pide al editor que retire los datos si son tuyos y conserva copia de la solicitud.", "Informa a las personas afectadas y a la autoridad dentro del plazo legal cuando se confirmen datos personales."],
        fr: ["Demandez à l’éditeur de retirer les données si ce sont les vôtres et gardez une copie de la demande.", "Informez les personnes concernées et l’autorité dans le délai légal lorsque des données personnelles sont confirmées."]
      },
      recover: {
        en: ["Watch for the data resurfacing, and for phishing that uses it.", "Add the access rule or review that would have caught the leak."],
        es: ["Vigila si los datos reaparecen y si se usan en phishing.", "Añade la regla de acceso o la revisión que habría detectado la fuga."],
        fr: ["Surveillez la réapparition des données et l’hameçonnage qui les exploite.", "Ajoutez la règle d’accès ou la revue qui aurait détecté la fuite."]
      }
    }
  },
  defacement: {
    irm: "IRM-6",
    title: { en: "Website defacement or certificate abuse", es: "Defacement del sitio o abuso de certificados", fr: "Défiguration du site ou abus de certificats" },
    steps: {
      identify: {
        en: ["Compare the live pages and the certificates issued for your domain with what you published.", "Keep screenshots, page sources and the certificate log entries with their times."],
        es: ["Compara las páginas en vivo y los certificados emitidos para tu dominio con lo que publicaste.", "Guarda capturas, el código fuente de las páginas y las entradas del registro de certificados con sus horas."],
        fr: ["Comparez les pages en ligne et les certificats émis pour votre domaine avec ce que vous avez publié.", "Conservez captures d’écran, sources des pages et entrées du journal de certificats avec leurs horaires."]
      },
      contain: {
        en: ["Put up a maintenance page and revoke certificates you did not request.", "Lock the DNS and hosting accounts: new passwords, two-factor sign-in, a check of recent changes."],
        es: ["Publica una página de mantenimiento y revoca los certificados que no pediste.", "Bloquea las cuentas de DNS y de alojamiento: contraseñas nuevas, doble factor y revisión de los cambios recientes."],
        fr: ["Mettez en ligne une page de maintenance et révoquez les certificats que vous n’avez pas demandés.", "Verrouillez les comptes DNS et d’hébergement : nouveaux mots de passe, double authentification, revue des modifications récentes."]
      },
      remediate: {
        en: ["Restore the site from a clean backup, patch the way in, and remove unknown files and users.", "Set a CAA record so only your chosen authority can issue certificates."],
        es: ["Restaura el sitio desde una copia limpia, corrige la vía de entrada y elimina archivos y usuarios desconocidos.", "Define un registro CAA para que solo la autoridad que elijas pueda emitir certificados."],
        fr: ["Restaurez le site depuis une sauvegarde saine, corrigez la voie d’entrée et supprimez fichiers et utilisateurs inconnus.", "Définissez un enregistrement CAA pour que seule l’autorité choisie puisse émettre des certificats."]
      },
      recover: {
        en: ["Bring the site back, ask search engines to recrawl it, and watch the certificate log.", "Tell visitors briefly what happened, and write down the fix that closed the way in."],
        es: ["Vuelve a publicar el sitio, pide a los buscadores que lo rastreen de nuevo y vigila el registro de certificados.", "Cuenta brevemente a los visitantes qué pasó y anota la corrección que cerró la vía de entrada."],
        fr: ["Remettez le site en ligne, demandez aux moteurs de recherche de le réexplorer et surveillez le journal de certificats.", "Expliquez brièvement aux visiteurs ce qui s’est passé et notez la correction qui a fermé la voie d’entrée."]
      }
    }
  }
};

function langCode(lang) {
  const code = String(lang || "en").slice(0, 2).toLowerCase();
  return HEADING[code] ? code : "en";
}

/* keys: the finding keys of the report's attack-source rows. Returns the playbooks (in a fixed order) that match,
   each with its title and steps already in the language, or English when the language awaits native review. */
function forKeys(keys, lang) {
  const code = langCode(lang);
  const ids = [];
  (keys || []).forEach((key) => {
    const id = FOR_KEY[String(key)];
    if (id && ids.indexOf(id) === -1) ids.push(id);
  });
  const order = Object.keys(PLAYBOOKS);
  return ids.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((id) => {
    const book = PLAYBOOKS[id];
    const steps = {};
    PHASES.forEach((phase) => { steps[phase] = book.steps[phase][code]; });
    return { id, irm: book.irm, title: book.title[code], steps };
  });
}

const heading = (lang) => HEADING[langCode(lang)];
const attribution = (lang) => ATTRIBUTION[langCode(lang)];
// True when the language has its own playbook text; de, it and pt read the English one until native review.
const native = (lang) => ["en", "es", "fr"].indexOf(String(lang || "en").slice(0, 2).toLowerCase()) !== -1;

module.exports = { SOURCE_URL, LICENSE_URL, ATTRIBUTION, HEADING, PHASES, FOR_KEY, PLAYBOOKS, forKeys, heading, attribution, native, langCode };
