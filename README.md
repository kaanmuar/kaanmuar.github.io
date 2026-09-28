# 🚀 Interactive CV & Admin Panel

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white) ![Cypress](https://img.shields.io/badge/cypress-%2317202C.svg?style=for-the-badge&logo=cypress&logoColor=white) ![Playwright](https://img.shields.io/badge/playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white) ![Robot Framework](https://img.shields.io/badge/robot%20framework-000000?style=for-the-badge&logo=robot-framework&logoColor=white)

This repository is the source for a multilingual interactive CV, a four-agent SDLC studio, a visitor-facing regression lab, and a Firebase admin panel. GitHub Pages publishes `main` at the custom domain.

**Live site:** [**https://carlosandmunoz.com/**](https://carlosandmunoz.com/)

---

## ✨ Key Features

Vanilla JavaScript on the front end, Firebase for messages, ratings, and admin auth. Tailwind utilities live in compiled `style.css`. Page layout lives in `css/cv.css`. The shared look lives in `css/site-look.css` and `js/site-look.js`. Golden Gate is the default. Admin **Styles** can preview, undo, or keep one of ten looks for the CV, the studio, the lab, and admin together.

### Interactive CV (`index.html`)

The page is markup, SEO, and JSON-LD. Content is `js/cv-data.js` (toolkit, experience, and the six native dictionaries). Behavior is `js/cv-app.js` (filters, tour, export, contact widget, Firestore). Shared helpers are `js/site-theme.js`, `js/site-i18n.js`, `js/site-tour.js`, and `js/site-analytics.js`.

* **Dynamic content:** Experience, skills, and testimonials render from data, so copy changes stay out of the markup.
* **Languages:** Native UI for **English, Spanish, Portuguese, German, French, and Italian**, plus machine translation for other languages. Set the language from the menu or `?lang=es`.
* **Core competency filters:** Each sidebar competency is a button. Related toolkit skills, timeline roles, experience, and certifications stay sharp; everything else dims. Click the same competency again, **Reset Filters**, or anywhere outside a match to restore the full CV. Deep links: `?topic=qa` or `?competency=qa`.
* **Toolkit and radar:** A skill tag filters experience and timeline (every selected skill must match). Radar labels such as **QA & Automation** apply the same competency focus and select the related toolkit skills.
* **Guided tour:** First visit (or **How this Online CV works**) walks the photo, controls, language, studio, lab, glance, competencies, toolkit, experience, education, and the contact widget. The controls step names the direct PDF link and the shared look. The lab step names each runner’s own log, the drawer that follows the running process, and the observer. Each step pulses the control. The tour card is a dialog: focus moves into it, the step title and instructions are text, Escape closes it, and Left/Right move between steps once Next is available. The same card is on the studio and the lab. Cases `A11Y-04`, `A11Y-05`, and `A11Y-06` cover those three cards.
* **Look and theme:** Golden Gate is the default look: a warm wash, frosted cards, and the same sidebar treatment on every page. Light and dark still toggle separately and stay in sync across the CV, the studio, and the lab. Admin **Styles** previews a look, undoes it, or keeps it for all four sites. The other looks are Material, YouTube, Instagram, Facebook, X, WhatsApp, LinkedIn, TikTok, and Netflix.
* **Phone layout:** A sticky mobile toolbar holds theme, language, print, studio, and lab. Desktop header controls stay hidden under the `md` breakpoint.
* **Export:** PDF, JPG, DOC, JSON, and TXT from the export menu. A shared link starts one of those files as soon as the page opens: `?download=pdf`, and the same pattern for `jpg`, `doc`, `txt`, or `json`. Add `&lang=es` (or `pt`, `de`, `fr`, `it`) to export in that language. The footer **Download PDF** link is `/?download=pdf`.
* **Contact and ratings:** The floating widget sends a message (optional attachment up to 5MB) or a rating to Firestore.
* **Testimonials:** Approved public ratings and admin replies render from Firestore.
* **SEO and analytics:** Person JSON-LD, a ProfessionalService offer (`#qa-practice`) for contract, freelance, advisory, and mentoring, and competency JSON-LD (each competency has a `?topic=` URL). The visible offer line is `#engagement-offer`. Also `hreflang`, canonical on `carlosandmunoz.com`, and Google Analytics events for filters, tour, language, and export.

### SDLC studio (`simulador.html`)

A four-agent sprint launched from the CV: Ticket Steward, Test Designer, Automation Engineer, and Release Verifier. The first agent asks which board — **Jira**, **Azure DevOps**, **Monday.com**, **Trello**, **Linear**, or **Asana** — and six PayStream stories render in that layout (3-D Secure, captures, accessibility, settlement, EU refunds, webhook signatures). Later views are **Zephyr Scale**, **Xray**, or **TestRail**, then the runners you leave on (Playwright, Cypress, Robot, and optionally Selenium, WebdriverIO, and Appium), then release sign-off. **Runners** on the right edge slides in that framework’s sprint log. The regression lab is where those frameworks run as their own processes. **Pace** on the top bar is 0.5s to 2.0s. **Report** opens the sprint file: English by default, another language if you pick one, graphs included, then download or print with the QA lab mark. It wears the same look as the CV and has its own guided tour (`hasSeenStudioTour`): board, four agents, run, pace, tickets, the runner drawer, the report, the agent log, and the lab. The first step says the page uses that shared look. A pulse marks each step. The **Four agents** step plays the same 4-second agent clip as the CV tour.

### CV regression lab (`qa-lab.html`)

The same cases the public suites cover, runnable in the browser against an iframe of the CV, studio, or admin page. Each case links to its source on GitHub.

* **Watch** is the default so the visitor sees the actions. **Background** hides the iframe and keeps the log.
* Pace holds are **0.5s, 1.0s, 1.5s, and 2.0s**.
* The catalog scrolls the running case into view. **Dashboard** opens as a splash (close, Escape, or backdrop).
* Filters include Smoke, Functional, Security, A11y, Admin, Studio, and Mobile.
* **Report** opens the file options before anything is printed. English is the default language. Graphs, case lines, and the runner comparison are included. Saved runs can be selected, downloaded, printed, or compared.
* **Runners** on the right edge streams each framework’s own process log. Playwright, Cypress, Robot, Selenium, WebdriverIO, and Appium are separate suites. Before a run, the ask picks browsers and a screen size. When the process changes, the drawer and the **Run with** chip follow it and mark it **Running**. The lab does not copy one result into the other tabs. `npm run lab:runners` starts the local process bridge.
* **Observer** sits under the live page. It watches for a frozen page, explains a failed check, and checks that the report is on screen. It does not mark a case passed or failed. A connected model can write that note. Without one, the note stays structural.
* A lab tour (`hasSeenLabTour`) walks the catalog, filters, scripts, language, suite repo, sprint studio, indicators, pace, watch or background, which runners, run, the live page, the native runner logs, the observer, the report file, the dashboard, and how to open the tour again. A pulse marks each step. **Live system under test** plays a 4-second clip of checks turning green.

### Admin panel (`admin.html`)

* **Firebase Authentication** (email/password). Login sits on the CV, studio, and lab toolbars and opens this page. The page is `noindex` and omitted from `sitemap.xml`. `robots.txt` disallows `/admin.html`, `/cypress/`, and `/tests/`.
* Real-time inbox, ratings, search, private or public replies, testimonial approval, sender blocking, and a Chart.js stats view.
* **CV editor:** Signed-in edits for profile, about, career, toolkit, education, share, and display. Publish writes Firestore `cvContent/live`. The public CV shows that document only with `?cvpreview=1`.
* **Styles:** Ten looks, starting with macOS Golden Gate. Preview paints the admin page. Undo returns to the last kept look. Keep publishes the look to the CV, Admin, Studio, and QA lab. A color palette and a custom color sit with the looks.

---

## 🛠️ Tech Stack

| Category | Technologies |
| :------------ | :------------------------------------------------------ |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6 modules)`, `Tailwind CSS v4`, `Chart.js` |
| **Backend** | `Firebase (Authentication, Firestore, Storage)` |
| **Testing** | `Playwright`, `Cypress`, `Robot Framework`, `Selenium WebDriver`, `WebdriverIO`, and `Appium` (each has its own suite and log) |
| **Analytics** | `Google Analytics` (`js/site-analytics.js`) |

---

## 🧪 Automated Testing

`npm test` runs Playwright and Cypress. `npm run test:full` also runs Robot. `npm run test:selenium`, `npm run test:wdio`, and `npm run test:appium` run those suites on their own. `npm run lab:runners` lets the lab page stream each process log. Playwright starts a local static server on port `8765` when one is not already running.

The catalog on [qa-lab.html](https://carlosandmunoz.com/qa-lab.html) lists every case and links to the suite file on `main`.

* Playwright: [`tests/`](https://github.com/kaanmuar/kaanmuar.github.io/tree/main/tests)
* Cypress: [`cypress/e2e/`](https://github.com/kaanmuar/kaanmuar.github.io/tree/main/cypress/e2e)
* Robot: [`tests/robot/`](https://github.com/kaanmuar/kaanmuar.github.io/tree/main/tests/robot)
* Lab runner: [`js/qa-lab.js`](https://github.com/kaanmuar/kaanmuar.github.io/blob/main/js/qa-lab.js)

<details>
<summary><strong>Click to view the Playwright Test Suite Guide</strong></summary>

Specs live in `tests/` and use `CVPage.js`, `AdminPage.js`, and `helpers.js`.

```bash
npm run test:playwright
npx playwright show-report
```

Coverage includes smoke assets, CV behavior, competency filters (all seven topics, toggle, outside click, reset, theme, `?topic=` / `?competency=`, radar, SEO, tour order, phone), studio and lab tours, dashboard splash, security/SEO, accessibility (`axe-core`), and mobile at 390×844. Authenticated admin tests need `ADMIN_PASSWORD`. After a correct password they expect the authenticator step, and they do not open the dashboard.

</details>

<details>
<summary><strong>Click to view the Cypress Test Suite Guide</strong></summary>

```bash
npx cypress open
npm run test:cypress
```

Specs: `cv_spec.cy.js`, `competency_spec.cy.js`, `simulator_spec.cy.js`, `qa_lab_spec.cy.js`, `catalog_spec.cy.js`, `mobile_spec.cy.js`, `security_spec.cy.js`, `a11y_spec.cy.js`, `admin_spec.cy.js`.

Authenticated admin tests need `ADMIN_PASSWORD` (and optional `ADMIN_EMAIL`) in the Cypress env. After a correct password they expect the authenticator step, and they do not open the dashboard. Accessibility checks use `cypress-axe`.

</details>

<details>
<summary><strong>Click to view the Robot Framework Test Suite Guide</strong></summary>

`npm run test:robot` creates `.venv-robot`, installs `requirements-robot.txt`, and writes results to `robot-results/`. Chrome must be available for SeleniumLibrary.

| File | Role |
| :---- | :--- |
| `cv_resources.robot` | URLs, locators, and shared keywords |
| `cv_suite.robot` | Desktop and mobile CV, including competency focus |
| `qa_lab.robot` | Catalog size, dashboard, tour, Mobile filter |
| `catalog.robot` | The shared catalog, driven by `CatalogRunner.py` |
| `mobile_suite.robot` | Phone chrome for CV, studio, lab, and admin |
| `security_admin.robot` | `robots.txt`, sitemap, `noindex`, noopener, competency JSON-LD |

</details>

---

## ⚙️ Setup and Configuration Guide

<details>
<summary><strong>Click to expand the project setup instructions</strong></summary>

### 1. Prerequisites

* [Node.js](https://nodejs.org/en/) and npm.
* [Firebase CLI](https://firebase.google.com/docs/cli) if you deploy rules (`npm install -g firebase-tools`).

### 2. Clone the Repository

```bash
git clone https://github.com/kaanmuar/kaanmuar.github.io.git
cd kaanmuar.github.io
npm install
```

Serve the folder with any static server (Playwright uses `python3 -m http.server 8765`). Rebuild Tailwind after utility-class edits:

```bash
npm run build:css
```

`input.css` compiles to `style.css`. Do not edit `style.css` by hand.

### 3. Firebase Project Setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/) and add a **Web App**.
2. Put the `firebaseConfig` object in `js/cv-app.js` and `admin.html`.
3. Enable **Firestore** (production mode), **Authentication → Email/Password**, and **Storage**.
4. Create the admin user under **Authentication → Users**. The first sign-in on `admin.html` shows a QR code. Scan it with an authenticator app and enter the 6-digit code. Later sign-ins ask for that code after the password.
5. Rules live in `firestore.rules` and `storage.rules`. Deploy them with `firebase deploy --only firestore:rules,storage`. Visitors can send a message, a rating, and a visit note, and they can read testimonials and `cvContent/live`. Inbox data, the block list, and CV edits are limited to the admin account. `mail` and `notification_state` are closed to the browser; Cloud Functions use the Admin SDK. After 8 messages or ratings in 10 minutes, those two forms ask for the characters in the picture for 30 minutes. The check is verified in Cloud Functions, and a script cannot skip it and write the inbox directly.
6. If the testimonials query asks for a composite index, open the console link from the browser error and create it.

</details>

---

## 📁 File Structure

```
/
├── index.html              # CV markup, meta, and JSON-LD
├── css/cv.css              # CV layout
├── css/site-look.css       # Shared looks, Golden Gate by default
├── style.css               # Compiled Tailwind (from input.css)
├── js/
│   ├── cv-data.js          # Skills, experience, native dictionaries
│   ├── cv-app.js           # CV behavior, export, and Firestore
│   ├── cv-editor.js        # Admin CV editor (cvContent/live)
│   ├── site-theme.js       # Shared light/dark theme
│   ├── site-look.js        # Shared looks, preview, undo, and keep
│   ├── site-i18n.js        # Language menu and machine translation
│   ├── site-tour.js        # Shared tour pulse (lab and studio)
│   ├── site-analytics.js   # GA helper
│   ├── catalog-checks.js   # Shared pass/fail checks for every runner
│   ├── lab-observer.js     # Lab observer (stalls, failures, report)
│   └── qa-lab.js           # Lab catalog, source links, runner focus
├── scripts/                # Local runner bridge for the lab
├── selenium/               # Selenium catalog suite
├── wdio/                   # WebdriverIO catalog suite
├── appium/                 # Appium catalog suite
├── simulador.html          # 4-agent SDLC studio
├── qa-lab.html             # Visitor-facing regression lab
├── admin.html              # Admin panel and Styles (noindex)
├── firestore.rules         # Firestore rules for the public CV and admin
├── storage.rules           # Storage rules for contact attachments
├── tests/                  # Playwright specs and Robot suites
└── cypress/e2e/            # Cypress specs
```

---

## 👤 Author

* **Carlos A. Muñoz**
* **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)
