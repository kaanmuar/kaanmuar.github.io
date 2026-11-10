# Facebook Page: 12 posts in en, es and pt (held, not queued)

`facebook-captions.json` has one entry per post in the shape of `media/social-posts/<batch>/captions.json`, every one `hold: true`. It sits in a `drafts/` folder, which `scripts/facebook-queue.js`, `buffer-queue.js` and `social-calendar.js` never read: they read only a batch's top-level `captions.json` and `calendar.csv`. To publish, render a batch (feed images) from these entries, add its `calendar.csv` rows, and lift the hold.

## 01-phishing-lists-en · 2026-11-16 13:00 ET (held)

```text
Would you know if your site landed on a phishing list tonight?

Most owners find out from a customer: a red warning page in the browser, or a sale that never happens.

Every QA-lab URL Review now checks your address against Google Safe Browsing and the Cloudflare URL Scanner. A hit is a critical finding at the top of the report, not a footnote. And a listed site is never shown on our public Live Reports.

One review, one clear answer: listed or not.

Run a review: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li01-phishing-lists-en

#QAlab #WebSecurity #Phishing #SmallBusiness
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02b-url-scanner.png`
- Alt text: Report finding on phishing and malware lists: the Cloudflare URL Scanner has no current verdict against the site.

## 01-phishing-lists-es · 2026-11-16 12:30 ET (held)

```text
¿Te enterarías si tu sitio entrara hoy en una lista de phishing?

La mayoría de los dueños se entera por un cliente: una página roja de advertencia en el navegador o una venta que nunca llega.

Cada QA-lab URL Review ahora comprueba tu dirección en Google Safe Browsing y en el Cloudflare URL Scanner. Una coincidencia es un hallazgo crítico al principio del informe, no una nota al pie. Y un sitio listado nunca aparece en nuestros Live Reports públicos.

Una revisión, una respuesta clara: listado o no.

Revisa tu sitio: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li01-phishing-lists-es

#QAlab #Ciberseguridad #Phishing #Pymes
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02b-url-scanner.png`
- Alt text: Hallazgo sobre listas de phishing y malware: el Cloudflare URL Scanner no tiene un veredicto actual contra el sitio.

## 01-phishing-lists-pt · 2026-11-16 12:00 ET (held)

```text
Você saberia se o seu site entrasse hoje numa lista de phishing?

A maioria dos donos descobre por um cliente: uma página vermelha de alerta no navegador ou uma venda que nunca acontece.

Toda QA-lab URL Review agora verifica o seu endereço no Google Safe Browsing e no Cloudflare URL Scanner. Uma ocorrência é um achado crítico no topo do relatório, não uma nota de rodapé. E um site listado nunca aparece nos nossos Live Reports públicos.

Uma revisão, uma resposta clara: listado ou não.

Revise seu site: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li01-phishing-lists-pt

#QAlab #CiberSegurança #Phishing #PequenasEmpresas
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02b-url-scanner.png`
- Alt text: Achado sobre listas de phishing e malware: o Cloudflare URL Scanner não tem veredito atual contra o site.

## 02-fix-packages-en · 2026-11-17 13:00 ET (held)

```text
A report that only lists problems is half the job.

Every QA-lab URL Review now ends with "How do you want to fix it?" and four answers:
• do it yourself, with guidance from the report
• ask for a quote
• pick a fixed-price package
• book a call

Packages at launch prices: TLS and redirects US$69, Email and DNS US$89, Security headers US$99, SEO meta US$119, Accessibility US$169, Performance US$199. Pay with PayPal. When the work is done, a free re-review shows what's fixed.

See the options on your report: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li02-fix-packages-en

#QAlab #WebDev #SmallBusiness #WebSecurity
```

- Visual: `media/social-posts/release-2026-11/feed/07-get-it-fixed-en.jpg`
- Alt text: Fixed-price fix packages at the end of a report, each with its price in US dollars and working days.

## 02-fix-packages-es · 2026-11-17 12:30 ET (held)

```text
Un informe que solo enumera problemas es la mitad del trabajo.

Cada QA-lab URL Review ahora termina con «¿Cómo quieres arreglarlo?» y cuatro respuestas:
• hazlo tú, con la guía del informe
• pide una cotización
• elige un paquete de precio fijo
• agenda una llamada

Paquetes a precio de lanzamiento: TLS y redirecciones US$69, Correo y DNS US$89, Cabeceras de seguridad US$99, Metadatos SEO US$119, Accesibilidad US$169, Rendimiento US$199. Pago con PayPal. Al terminar, una nueva revisión gratis muestra qué quedó arreglado.

Mira las opciones en tu informe: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li02-fix-packages-es

#QAlab #DesarrolloWeb #Pymes #Ciberseguridad
```

- Visual: `media/social-posts/release-2026-11/feed/08-get-it-fixed-es.jpg`
- Alt text: Paquetes de arreglo de precio fijo al final de un informe, cada uno con su precio en dólares y días hábiles.

## 02-fix-packages-pt · 2026-11-17 12:00 ET (held)

```text
Um relatório que só lista problemas é metade do trabalho.

Toda QA-lab URL Review agora termina com "Como você quer corrigir?" e quatro respostas:
• faça você mesmo, com a orientação do relatório
• peça um orçamento
• escolha um pacote de preço fixo
• agende uma conversa

Pacotes a preço de lançamento: TLS e redirecionamentos US$69, E-mail e DNS US$89, Cabeçalhos de segurança US$99, Meta SEO US$119, Acessibilidade US$169, Desempenho US$199. Pagamento com PayPal. Ao terminar, uma nova revisão grátis mostra o que foi corrigido.

Veja as opções no seu relatório: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li02-fix-packages-pt

#QAlab #DesenvolvimentoWeb #PequenasEmpresas #CiberSegurança
```

- Visual: `media/social-posts/release-2026-11/feed/09-get-it-fixed-pt.jpg`
- Alt text: Pacotes de correção de preço fixo no fim de um relatório, cada um com o preço em dólares e os dias úteis.

## 03-promise-en · 2026-11-18 13:00 ET (held)

```text
Some sites don't want to be read. Bot walls, Cloudflare challenges, servers that time out.

When a review can't finish right away, you no longer get an error. You get a promise: we keep trying with the method that fits the block, and email you the full report as soon as it's ready. It usually arrives within 48 hours. If it takes longer, you get an apology by email, and we keep trying for up to 14 days.

Either way, you get a code for 20% off your next review, valid for 90 days.

Try the site you thought nobody could read: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li03-promise-en

#QAlab #WebDev #WebSecurity
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/01-splash.png`
- Alt text: Phone screen: "We could not conclude this review right now. We will email the report as soon as it is ready." Below, 20% off the next review with the code SORRY-ABCD2345.

## 03-promise-es · 2026-11-18 12:30 ET (held)

```text
Algunos sitios no quieren ser leídos. Muros antibots, desafíos de Cloudflare, servidores que no responden a tiempo.

Cuando una revisión no puede terminar enseguida, ya no recibes un error. Recibes una promesa: seguimos intentando con el método adecuado para ese bloqueo y te enviamos el informe completo por correo en cuanto esté listo. Normalmente llega en 48 horas. Si tarda más, te llega una disculpa por correo y seguimos intentándolo hasta 14 días.

En ambos casos recibes un código de 20% de descuento en tu próxima revisión, válido 90 días.

Prueba con el sitio que creías imposible de leer: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li03-promise-es

#QAlab #DesarrolloWeb #Ciberseguridad
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/01-splash-es.png`
- Alt text: Pantalla de celular: «No pudimos concluir esta revisión ahora. Te enviaremos el informe por correo en cuanto esté listo.» Debajo, 20% de descuento en la próxima revisión con el código SORRY-ABCD2345.

## 03-promise-pt · 2026-11-18 12:00 ET (held)

```text
Alguns sites não querem ser lidos. Bloqueios antibots, desafios da Cloudflare, servidores que estouram o tempo.

Quando uma revisão não pode terminar na hora, você não recebe mais um erro. Recebe uma promessa: seguimos tentando com o método certo para aquele bloqueio e enviamos o relatório completo por e-mail assim que estiver pronto. Normalmente chega em até 48 horas. Se demorar mais, você recebe um pedido de desculpas por e-mail e seguimos tentando por até 14 dias.

Nos dois casos, você ganha um código de 20% de desconto na próxima revisão, válido por 90 dias.

Teste o site que você achava impossível de ler: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li03-promise-pt

#QAlab #DesenvolvimentoWeb #CiberSegurança
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/01-splash.png`
- Alt text: Tela de celular: "Não conseguimos concluir esta revisão agora. Enviaremos o relatório por e-mail assim que estiver pronto." Abaixo, 20% de desconto na próxima revisão com o código SORRY-ABCD2345.

## 04-lookalikes-en · 2026-11-19 13:00 ET (held)

```text
We ran a review of wordpress.org on production.

One finding stood out: a registered lookalike domain that asks visitors for a password and receives mail.

That's the typosquatting playbook. A domain one slip away from the real one, a login form, and a mailbox to send "your account needs attention" from.

Every review now looks for registered domains imitating yours and flags the ones with a website or a mail server: the ones that can actually reach your customers.

Find out who is imitating your domain: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li04-lookalikes-en

#QAlab #Phishing #WebSecurity #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02e-lookalike.png`
- Alt text: Report finding on lookalike domains: a registered lookalike domain asks for a password and receives mail.

## 04-lookalikes-es · 2026-11-19 12:30 ET (held)

```text
Revisamos wordpress.org en producción.

Un hallazgo destacó: un dominio imitador registrado que pide una contraseña a los visitantes y recibe correo.

Es el manual del typosquatting. Un dominio a un error de tipeo del real, un formulario de acceso y un buzón desde el que enviar «tu cuenta requiere atención».

Cada revisión ahora busca dominios registrados que imitan el tuyo y marca los que tienen sitio web o servidor de correo: los que de verdad pueden llegar a tus clientes.

Descubre quién imita tu dominio: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li04-lookalikes-es

#QAlab #Phishing #Ciberseguridad #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02e-lookalike.png`
- Alt text: Hallazgo sobre dominios imitadores: un dominio imitador registrado pide una contraseña y recibe correo.

## 04-lookalikes-pt · 2026-11-19 12:00 ET (held)

```text
Revisamos wordpress.org em produção.

Um achado se destacou: um domínio imitador registrado que pede senha aos visitantes e recebe e-mails.

É o roteiro do typosquatting. Um domínio a um erro de digitação do verdadeiro, um formulário de login e uma caixa de e-mail para mandar "sua conta precisa de atenção".

Toda revisão agora procura domínios registrados que imitam o seu e marca os que têm site ou servidor de e-mail: os que podem mesmo chegar aos seus clientes.

Descubra quem está imitando o seu domínio: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li04-lookalikes-pt

#QAlab #Phishing #CiberSegurança #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02e-lookalike.png`
- Alt text: Achado sobre domínios imitadores: um domínio imitador registrado pede uma senha e recebe e-mails.

## 05-hacked-signs-en · 2026-11-23 13:00 ET (held)

```text
Myth: "My homepage looks normal, so my site isn't hacked."
Fact: the hacks that pay are the ones owners never see.

• Spam pages injected into your search results
• A different page served only to Googlebot (cloaking)
• Hidden links to casinos and pharmacies

Every review now checks all three. We only call it high severity on strong evidence: the spam term in a title or address, an orphan page, a script that differs. A mere mention is info. And if the search can't run, the report says "not checked", never "clean".

Check your site's signs: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li05-hacked-signs-en

#QAlab #WebSecurity #SEO #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02d-hacked-signs.png`
- Alt text: Report finding on hacked-site signs: search results are checked for spam on the domain, and here the report asks a person to look.

## 05-hacked-signs-es · 2026-11-23 12:30 ET (held)

```text
Mito: «Mi página de inicio se ve normal, así que mi sitio no está hackeado».
Realidad: los hackeos que dan dinero son los que el dueño nunca ve.

• Páginas de spam inyectadas en tus resultados de búsqueda
• Una página distinta servida solo a Googlebot (cloaking)
• Enlaces ocultos a casinos y farmacias

Cada revisión ahora comprueba los tres. Solo marcamos gravedad alta con evidencia fuerte: el término de spam en un título o una dirección, una página huérfana, un script distinto. Una simple mención es informativa. Y si la búsqueda no puede ejecutarse, el informe dice «no comprobado», nunca «limpio».

Revisa las señales de tu sitio: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li05-hacked-signs-es

#QAlab #Ciberseguridad #SEO #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02d-hacked-signs.png`
- Alt text: Hallazgo sobre señales de hackeo: se revisan los resultados de búsqueda en busca de spam en el dominio y aquí el informe pide que lo mire una persona.

## 05-hacked-signs-pt · 2026-11-23 12:00 ET (held)

```text
Mito: "Minha página inicial parece normal, então meu site não foi invadido."
Fato: as invasões que dão dinheiro são as que o dono nunca vê.

• Páginas de spam injetadas nos seus resultados de busca
• Uma página diferente servida só para o Googlebot (cloaking)
• Links ocultos para cassinos e farmácias

Toda revisão agora verifica os três. Só marcamos gravidade alta com evidência forte: o termo de spam num título ou endereço, uma página órfã, um script diferente. Uma simples menção é informativa. E se a busca não puder rodar, o relatório diz "não verificado", nunca "limpo".

Verifique os sinais do seu site: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li05-hacked-signs-pt

#QAlab #CiberSegurança #SEO #WordPress
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02d-hacked-signs.png`
- Alt text: Achado sobre sinais de invasão: os resultados de busca são verificados quanto a spam no domínio e aqui o relatório pede que uma pessoa confira.

## 06-free-rereview-en · 2026-11-24 13:00 ET (held)

```text
How do you know a fix actually worked?

Not from an invoice that says "done".

When we finish a fix package, a free re-review runs on your site and you get a before/after mail: each finding marked fixed, still open, or needs a person.

No arguing about whether the work was done. The report says so.

Fix packages from US$69, re-review included: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li06-free-rereview-en

#QAlab #WebDev #SmallBusiness
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/05b-mail-before-after.png`
- Alt text: Before/after mail sent after a fix: each finding marked fixed, still open, or needs a person.

## 06-free-rereview-es · 2026-11-24 12:30 ET (held)

```text
¿Cómo sabes que un arreglo de verdad funcionó?

No por una factura que dice «hecho».

Cuando terminamos un paquete de arreglo, se ejecuta una nueva revisión gratis de tu sitio y recibes un correo de antes y después: cada hallazgo marcado como arreglado, sigue abierto o necesita a una persona.

Sin discutir si el trabajo se hizo. Lo dice el informe.

Paquetes desde US$69, nueva revisión incluida: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li06-free-rereview-es

#QAlab #DesarrolloWeb #Pymes
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/05b-mail-before-after.png`
- Alt text: Correo de antes y después tras un arreglo: cada hallazgo marcado como arreglado, sigue abierto o necesita a una persona.

## 06-free-rereview-pt · 2026-11-24 12:00 ET (held)

```text
Como saber se uma correção funcionou de verdade?

Não por uma fatura que diz "feito".

Quando terminamos um pacote de correção, uma nova revisão grátis roda no seu site e você recebe um e-mail de antes e depois: cada achado marcado como corrigido, ainda aberto ou precisa de uma pessoa.

Sem discussão sobre se o trabalho foi feito. O relatório diz.

Pacotes a partir de US$69, nova revisão incluída: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li06-free-rereview-pt

#QAlab #DesenvolvimentoWeb #PequenasEmpresas
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/05b-mail-before-after.png`
- Alt text: E-mail de antes e depois enviado após uma correção: cada achado marcado como corrigido, ainda aberto ou precisa de uma pessoa.

## 07-past-reviewers-en · 2026-11-25 13:00 ET (held)

```text
Ran a QA-lab URL Review before? The report you got then didn't have half of today's checks.

Phishing lists beyond Google. Every linked host. Hacked-site signs. Lookalike domains. Mail authentication in depth. Spam blocklists.

Past reviewers get a special code by email to run it again with everything that's new. Keep an eye on your inbox.

Never ran one? Start here: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li07-past-reviewers-en

#QAlab #WebSecurity #WebDev
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02-report-checks.png`
- Alt text: Security section of the wordpress.org report: Safe Browsing, mail, domain and blocklist checks, 2 fail, 12 at risk, 16 pass.

## 07-past-reviewers-es · 2026-11-25 12:30 ET (held)

```text
¿Ya hiciste una QA-lab URL Review? Al informe que recibiste le faltaba la mitad de las comprobaciones de hoy.

Listas de phishing más allá de Google. Cada host enlazado. Señales de hackeo. Dominios imitadores. Autenticación de correo a fondo. Listas negras de spam.

Quienes ya hicieron una revisión reciben un código especial por correo para repetirla con todo lo nuevo. Atento a tu bandeja.

¿Nunca hiciste una? Empieza aquí: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li07-past-reviewers-es

#QAlab #Ciberseguridad #DesarrolloWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02-report-checks.png`
- Alt text: Sección de seguridad del informe de wordpress.org: Safe Browsing, correo, dominio y listas negras, 2 fallan, 12 en riesgo, 16 pasan.

## 07-past-reviewers-pt · 2026-11-25 12:00 ET (held)

```text
Já fez uma QA-lab URL Review? O relatório que você recebeu não tinha metade das verificações de hoje.

Listas de phishing além do Google. Cada host vinculado. Sinais de invasão. Domínios imitadores. Autenticação de e-mail a fundo. Listas de bloqueio de spam.

Quem já fez uma revisão recebe um código especial por e-mail para repetir com tudo o que é novo. Fique de olho na caixa de entrada.

Nunca fez? Comece aqui: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li07-past-reviewers-pt

#QAlab #CiberSegurança #DesenvolvimentoWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02-report-checks.png`
- Alt text: Seção de segurança do relatório de wordpress.org: Safe Browsing, e-mail, domínio e listas de bloqueio, 2 falham, 12 em risco, 16 passam.

## 08-linked-hosts-en · 2026-11-30 13:00 ET (held)

```text
Your site is only as safe as the hosts it loads.

On wordpress.org, our review counted 37 third-party hosts the pages link to. Each one was checked against Google Safe Browsing.

Every script, iframe, form and link host on your pages now gets the same check. A listed script host is a critical finding, because that code runs in your visitors' browsers with your name on the page.

See which hosts your site trusts: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li08-linked-hosts-en

#QAlab #WebSecurity #WebDev
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02c-linked-hosts.png`
- Alt text: Report finding on linked hosts: Google Safe Browsing checked the 37 third-party hosts the pages link to.

## 08-linked-hosts-es · 2026-11-30 12:30 ET (held)

```text
Tu sitio es tan seguro como los hosts que carga.

En wordpress.org, nuestra revisión contó 37 hosts de terceros a los que enlazan las páginas. Cada uno se comprobó en Google Safe Browsing.

Cada host de scripts, iframes, formularios y enlaces de tus páginas recibe ahora la misma comprobación. Un host de scripts listado es un hallazgo crítico, porque ese código se ejecuta en el navegador de tus visitantes con tu nombre en la página.

Mira en qué hosts confía tu sitio: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li08-linked-hosts-es

#QAlab #Ciberseguridad #DesarrolloWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02c-linked-hosts.png`
- Alt text: Hallazgo sobre hosts enlazados: Google Safe Browsing revisó los 37 hosts de terceros a los que enlazan las páginas.

## 08-linked-hosts-pt · 2026-11-30 12:00 ET (held)

```text
Seu site é tão seguro quanto os hosts que ele carrega.

Em wordpress.org, nossa revisão contou 37 hosts de terceiros para os quais as páginas apontam. Cada um foi verificado no Google Safe Browsing.

Cada host de scripts, iframes, formulários e links das suas páginas agora passa pela mesma verificação. Um host de scripts listado é um achado crítico, porque esse código roda no navegador dos seus visitantes com o seu nome na página.

Veja em quais hosts o seu site confia: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li08-linked-hosts-pt

#QAlab #CiberSegurança #DesenvolvimentoWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02c-linked-hosts.png`
- Alt text: Achado sobre hosts vinculados: o Google Safe Browsing verificou os 37 hosts de terceiros para os quais as páginas apontam.

## 09-mail-blocklists-en · 2026-12-01 13:00 ET (held)

```text
Your invoices land in spam. Your newsletter vanishes. Someone sends mail "from" your domain.

Every review now reads the usual causes:
• SPF, DKIM and DMARC: not just whether they exist, but what they actually allow
• Your domain and your mail server's address against free spam blocklists: SpamCop, Mailspike, PSBL, 0spam and NordSpam
• What to fix first, in plain words

Our Email and DNS package sets it up and moves DMARC to enforcement: US$89 at launch price.

Check your mail setup: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li09-mail-blocklists-en

#QAlab #EmailSecurity #WebSecurity #SmallBusiness
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02f-mail-auth.png`
- Alt text: Report finding on mail authentication: DMARC rejects spoofed mail, and SPF is published.

## 09-mail-blocklists-es · 2026-12-01 12:30 ET (held)

```text
Tus facturas caen en spam. Tu newsletter desaparece. Alguien envía correos «desde» tu dominio.

Cada revisión ahora lee las causas habituales:
• SPF, DKIM y DMARC: no solo si existen, sino qué permiten de verdad
• Tu dominio y la dirección de tu servidor de correo en listas negras de spam gratuitas: SpamCop, Mailspike, PSBL, 0spam y NordSpam
• Qué arreglar primero, en palabras claras

Nuestro paquete Correo y DNS lo configura todo y lleva DMARC a modo de rechazo: US$89 a precio de lanzamiento.

Revisa tu correo: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li09-mail-blocklists-es

#QAlab #CorreoSeguro #Ciberseguridad #Pymes
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02f-mail-auth.png`
- Alt text: Hallazgo sobre autenticación de correo: DMARC rechaza el correo falsificado y SPF está publicado.

## 09-mail-blocklists-pt · 2026-12-01 12:00 ET (held)

```text
Suas faturas caem no spam. Sua newsletter some. Alguém envia e-mails "do" seu domínio.

Toda revisão agora lê as causas de sempre:
• SPF, DKIM e DMARC: não só se existem, mas o que de fato permitem
• Seu domínio e o endereço do seu servidor de e-mail em listas de bloqueio de spam gratuitas: SpamCop, Mailspike, PSBL, 0spam e NordSpam
• O que corrigir primeiro, em palavras simples

Nosso pacote E-mail e DNS configura tudo e leva o DMARC ao modo de bloqueio: US$89 a preço de lançamento.

Verifique seu e-mail: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li09-mail-blocklists-pt

#QAlab #SegurançaDeEmail #CiberSegurança #PequenasEmpresas
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/02f-mail-auth.png`
- Alt text: Achado sobre autenticação de e-mail: o DMARC rejeita e-mails falsificados e o SPF está publicado.

## 10-vs-rivals-en · 2026-12-02 13:00 ET (held)

```text
We put QA-lab URL Review next to other site checkers, with a source for every cell.

The honest version: many of them go deeper than we do in their own field. Sucuri and Wordfence on malware cleanup, MxToolbox on mail, Lighthouse on speed, Semrush and Ahrefs on SEO.

What we do differently: one review covers safety, mail, accessibility, performance and SEO, then ends with fixed-price fixes from US$69 and a free re-review. And if your site blocks us, the report still reaches you by email.

The full table, sources included: https://carlosandmunoz.com/qa-review-vs.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li10-vs-rivals-en

#QAlab #WebSecurity #WebDev
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/competitors/vs-en-table.png`
- Alt text: Comparison table: QA-lab URL Review next to other site checkers, check by check, with sources.

## 10-vs-rivals-es · 2026-12-02 12:30 ET (held)

```text
Pusimos QA-lab URL Review junto a otros revisores de sitios, con una fuente para cada celda.

La versión honesta: muchos van más a fondo que nosotros en su campo. Sucuri y Wordfence en limpieza de malware, MxToolbox en correo, Lighthouse en velocidad, Semrush y Ahrefs en SEO.

Lo que hacemos distinto: una revisión cubre seguridad, correo, accesibilidad, rendimiento y SEO, y termina con arreglos de precio fijo desde US$69 y una nueva revisión gratis. Y si tu sitio nos bloquea, el informe igual te llega por correo.

La tabla completa, con fuentes: https://carlosandmunoz.com/qa-review-vs.html?lang=es&utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li10-vs-rivals-es

#QAlab #Ciberseguridad #DesarrolloWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/competitors/vs-es-table.png`
- Alt text: Tabla comparativa: QA-lab URL Review junto a otros revisores de sitios, comprobación por comprobación, con fuentes.

## 10-vs-rivals-pt · 2026-12-02 12:00 ET (held)

```text
Colocamos a QA-lab URL Review ao lado de outros verificadores de sites, com uma fonte para cada célula.

A versão honesta: muitos vão mais fundo do que nós na sua área. Sucuri e Wordfence em limpeza de malware, MxToolbox em e-mail, Lighthouse em velocidade, Semrush e Ahrefs em SEO.

O que fazemos de diferente: uma revisão cobre segurança, e-mail, acessibilidade, desempenho e SEO, e termina com correções de preço fixo a partir de US$69 e uma nova revisão grátis. E se o seu site nos bloquear, o relatório chega mesmo assim por e-mail.

A tabela completa, com fontes: https://carlosandmunoz.com/qa-review-vs.html?lang=pt&utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li10-vs-rivals-pt

#QAlab #CiberSegurança #DesenvolvimentoWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/competitors/vs-en-table.png`
- Alt text: Tabela comparativa: QA-lab URL Review ao lado de outros verificadores de sites, item por item, com fontes.

## 11-launch-prices-en · 2026-12-03 13:00 ET (held)

```text
One week left at launch prices.

Until December 10, fix packages are about 30% below list:
TLS and redirects US$69 · Email and DNS US$89 · Security headers US$99 · SEO meta US$119 · Accessibility US$169 · Performance US$199

Fixed price, paid with PayPal, free re-review when we're done. Discount codes don't apply to packages: the launch price already does the work.

Run a review and see which package your site needs: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li11-launch-prices-en

#QAlab #SmallBusiness #WebDev
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/03b-fix-packages.png`
- Alt text: Fixed-price fix packages at the end of a report, each with its price in US dollars and working days.

## 11-launch-prices-es · 2026-12-03 12:30 ET (held)

```text
Queda una semana a precio de lanzamiento.

Hasta el 10 de diciembre, los paquetes cuestan cerca de un 30% menos que el precio de lista:
TLS y redirecciones US$69 · Correo y DNS US$89 · Cabeceras de seguridad US$99 · Metadatos SEO US$119 · Accesibilidad US$169 · Rendimiento US$199

Precio fijo, pago con PayPal, nueva revisión gratis al terminar. Los códigos de descuento no aplican a los paquetes: el precio de lanzamiento ya hace ese trabajo.

Haz una revisión y mira qué paquete necesita tu sitio: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li11-launch-prices-es

#QAlab #Pymes #DesarrolloWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/review-page/fix-offer-packages-es.png`
- Alt text: Paquetes de arreglo de precio fijo al final de un informe, cada uno con su precio en dólares y días hábiles.

## 11-launch-prices-pt · 2026-12-03 12:00 ET (held)

```text
Falta uma semana de preço de lançamento.

Até 10 de dezembro, os pacotes custam cerca de 30% abaixo da tabela:
TLS e redirecionamentos US$69 · E-mail e DNS US$89 · Cabeçalhos de segurança US$99 · Meta SEO US$119 · Acessibilidade US$169 · Desempenho US$199

Preço fixo, pagamento com PayPal, nova revisão grátis ao terminar. Códigos de desconto não valem para pacotes: o preço de lançamento já faz esse papel.

Faça uma revisão e veja qual pacote o seu site precisa: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li11-launch-prices-pt

#QAlab #PequenasEmpresas #DesenvolvimentoWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/03b-fix-packages.png`
- Alt text: Pacotes de correção de preço fixo no fim de um relatório, cada um com o preço em dólares e os dias úteis.

## 12-behind-the-scenes-en · 2026-12-04 13:00 ET (held)

```text
Behind the scenes: what happens when a site blocks our review.

First we find out why: rules for the obvious cases, Gemini for the rest. Then we retry with the method that fits. The last rung is a real Chrome window on a Mac in my office, reading the site from a home connection, for sites that refuse cloud data centers.

Jarvis, our ops assistant, keeps watch over every rescue and every promised report. Promised reports go first. It runs every hour, so you don't have to.

Run a review: https://carlosandmunoz.com/qa-review.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li12-behind-the-scenes-en

#QAlab #AI #WebDev
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/06-desk.png`
- Alt text: Behind the scenes: a blocked review's rescue log. Gemini diagnoses a Cloudflare bot wall, two retries fail, and the review waits for a real browser on Carlos's Mac.

## 12-behind-the-scenes-es · 2026-12-04 12:30 ET (held)

```text
Detrás de escena: qué pasa cuando un sitio bloquea nuestra revisión.

Primero averiguamos por qué: reglas para los casos obvios, Gemini para el resto. Luego reintentamos con el método adecuado. El último recurso es una ventana real de Chrome en un Mac de mi oficina, que lee el sitio desde una conexión doméstica, para los sitios que rechazan centros de datos en la nube.

Jarvis, nuestro asistente de operaciones, vigila cada rescate y cada informe prometido. Los prometidos van primero. Corre cada hora, para que tú no tengas que hacerlo.

Haz una revisión: https://carlosandmunoz.com/qa-review-es.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li12-behind-the-scenes-es

#QAlab #IA #DesarrolloWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/06-desk.png`
- Alt text: Detrás de escena: el registro de rescate de una revisión bloqueada. Gemini diagnostica un muro antibots de Cloudflare, dos reintentos fallan y la revisión espera un navegador real en el Mac de Carlos.

## 12-behind-the-scenes-pt · 2026-12-04 12:00 ET (held)

```text
Bastidores: o que acontece quando um site bloqueia a nossa revisão.

Primeiro descobrimos o motivo: regras para os casos óbvios, Gemini para o resto. Depois tentamos de novo com o método certo. O último recurso é uma janela real do Chrome num Mac do meu escritório, lendo o site de uma conexão doméstica, para sites que recusam data centers na nuvem.

O Jarvis, nosso assistente de operações, acompanha cada resgate e cada relatório prometido. Os prometidos vão primeiro. Ele roda de hora em hora, para você não precisar.

Faça uma revisão: https://carlosandmunoz.com/qa-review-pt.html?utm_source=facebook&utm_medium=social&utm_campaign=series-url-review-2026-11&utm_content=li12-behind-the-scenes-pt

#QAlab #IA #DesenvolvimentoWeb
```

- Visual: `/Users/Apple/Documents/qa-lab-demos/2026-11-10/06-desk.png`
- Alt text: Bastidores: o registro de resgate de uma revisão bloqueada. O Gemini diagnostica um bloqueio antibots da Cloudflare, duas tentativas falham e a revisão espera um navegador real no Mac do Carlos.
