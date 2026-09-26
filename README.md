# 🚀 Interactive CV & Admin Panel

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white) ![Cypress](https://img.shields.io/badge/cypress-%2317202C.svg?style=for-the-badge&logo=cypress&logoColor=white) ![Playwright](https://img.shields.io/badge/playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white) ![Robot Framework](https://img.shields.io/badge/robot%20framework-000000?style=for-the-badge&logo=robot-framework&logoColor=white)

This repository is the source for a multilingual interactive CV, a four-agent SDLC studio, a visitor-facing regression lab, and a Firebase admin panel. GitHub Pages publishes `main` at the custom domain.

**Live site:** [**https://carlosandmunoz.com/**](https://carlosandmunoz.com/)

---

## ✨ Key Features

Vanilla JavaScript on the front end, Firebase for messages, ratings, and admin auth. Tailwind utilities live in compiled `style.css`. Page-specific Harbor styles live in `css/cv.css`.

### Interactive CV (`index.html`)

The page is markup, SEO, and JSON-LD. Content is `js/cv-data.js` (toolkit, experience, and the six native dictionaries). Behavior is `js/cv-app.js` (filters, tour, export, contact widget, Firestore). Shared helpers are `js/site-theme.js`, `js/site-i18n.js`, `js/site-tour.js`, and `js/site-analytics.js`.

* **Dynamic content:** Experience, skills, and testimonials render from data, so copy changes stay out of the markup.
* **Languages:** Native UI for **English, Spanish, Portuguese, German, French, and Italian**, plus machine translation for other languages. Set the language from the menu or `?lang=es`.
* **Core competency filters:** Each sidebar competency is a button. Related toolkit skills, timeline roles, experience, and certifications stay sharp; everything else dims. Click the same competency again, **Reset Filters**, or anywhere outside a match to restore the full CV. Deep links: `?topic=qa` or `?competency=qa`.
* **Toolkit and radar:** A skill tag filters experience and timeline (every selected skill must match). Radar labels such as **QA & Automation** apply the same competency focus and select the related toolkit skills.
* **Guided tour:** First visit (or **How this Online CV works**) walks the photo, controls, language, studio, lab, glance, competencies, toolkit, experience, education, and the contact widget. Each step pulses the control. The tour card is a dialog: focus moves into it, the step title and instructions are text, Escape closes it, and Left/Right move between steps once Next is available. The same card is on the studio and the lab. Cases `A11Y-04`, `A11Y-05`, and `A11Y-06` cover those three cards.
* **Harbor theme:** Light is the default. The theme toggle persists and stays in sync with the studio and QA lab.
* **Phone layout:** A sticky mobile toolbar holds theme, language, print, studio, and lab. Desktop header controls stay hidden under the `md` breakpoint.
* **Export:** PDF, JPG, DOC, JSON, and TXT.
* **Contact and ratings:** The floating widget sends a message (optional attachment up to 5MB) or a rating to Firestore.
* **Testimonials:** Approved public ratings and admin replies render from Firestore.
* **SEO and analytics:** Person JSON-LD, a ProfessionalService offer (`#qa-practice`) for contract, freelance, advisory, and mentoring, and competency JSON-LD (each competency has a `?topic=` URL). The visible offer line is `#engagement-offer`. Also `hreflang`, canonical on `carlosandmunoz.com`, and Google Analytics events for filters, tour, language, and export.

### SDLC studio (`simulador.html`)

A four-agent sprint launched from the CV: Ticket Steward, Test Designer, Automation Engineer, and Release Verifier. The first agent asks which board — **Jira**, **Azure DevOps**, **Monday.com**, **Trello**, **Linear**, or **Asana** — and six PayStream stories render in that layout (3-D Secure, captures, accessibility, settlement, EU refunds, webhook signatures). Later views are **Zephyr Scale**, **Xray**, or **TestRail**, then the runners you leave on (Playwright, Cypress, Robot, and optionally Selenium, WebdriverIO, and Appium), then release sign-off. **Runners** on the right edge slides in a case list and that runner’s console while the scripts run. **Pace** on the top bar is 0.5s to 2.0s. **Report** opens the sprint file: English by default, another language if you pick one, graphs included, then download or print with the QA lab mark. It shares the Harbor theme and has its own guided tour (`hasSeenStudioTour`): board, four agents, run, pace, tickets, the native runner logs, the report, the agent log, and the lab. A pulse marks each step. The **Four agents** step plays the same 4-second agent clip as the CV tour.

### CV regression lab (`qa-lab.html`)

The same cases the public suites cover, runnable in the browser against an iframe of the CV, studio, or admin page. Each case links to its source on GitHub.

* **Watch** is the default so the visitor sees the actions. **Background** hides the iframe and keeps the log.
* Pace holds are **0.5s, 1.0s, 1.5s, and 2.0s**.
* The catalog scrolls the running case into view. **Dashboard** opens as a splash (close, Escape, or backdrop).
* Filters include Smoke, Functional, Security, A11y, Admin, Studio, and Mobile.
* **Report** opens the file options before anything is printed. English is the default language. Graphs, case lines, and the runner comparison are included. Saved runs can be selected, downloaded, printed, or compared.
* **Runners** on the right edge splits the native view: case list on the left, that runner’s console on the right.
* A lab tour (`hasSeenLabTour`) walks the catalog, filters, scripts, language, suite repo, sprint studio, indicators, pace, watch or background, runners, run, the live page, the native runner logs, the report file, the dashboard, and how to open the tour again. A pulse marks each step. **Live system under test** plays a 4-second clip of checks turning green.

### Admin panel (`admin.html`)

* **Firebase Authentication** (email/password). The page is `noindex` and omitted from `sitemap.xml`. `robots.txt` disallows `/admin.html`, `/cypress/`, and `/tests/`.
* Real-time inbox, ratings, search, private or public replies, testimonial approval, sender blocking, and a Chart.js stats view.
* **CV editor:** Signed-in edits for profile, about, career, toolkit, education, share, and display. Publish writes Firestore `cvContent/live`. The public CV shows that document only with `?cvpreview=1`.

---

## 🛠️ Tech Stack

| Category | Technologies |
| :------------ | :------------------------------------------------------ |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6 modules)`, `Tailwind CSS v4`, `Chart.js` |
| **Backend** | `Firebase (Authentication, Firestore, Storage)` |
| **Testing** | `Playwright`, `Cypress`, `Robot Framework`, plus in-browser Selenium, WebdriverIO, and Appium views in `js/qa-lab.js` |
| **Analytics** | `Google Analytics` (`js/site-analytics.js`) |

---

## 🧪 Automated Testing

`npm test` runs Playwright and Cypress. `npm run test:full` also runs Robot. Playwright starts a local static server on port `8765` when one is not already running.

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

Coverage includes smoke assets, CV behavior, competency filters (all seven topics, toggle, outside click, reset, theme, `?topic=` / `?competency=`, radar, SEO, tour order, phone), studio and lab tours, dashboard splash, security/SEO, accessibility (`axe-core`), and mobile at 390×844.

</details>

<details>
<summary><strong>Click to view the Cypress Test Suite Guide</strong></summary>

```bash
npx cypress open
npm run test:cypress
```

Specs: `cv_spec.cy.js`, `competency_spec.cy.js`, `simulator_spec.cy.js`, `qa_lab_spec.cy.js`, `mobile_spec.cy.js`, `security_spec.cy.js`, `a11y_spec.cy.js`, `admin_spec.cy.js`.

Authenticated admin tests need `ADMIN_PASSWORD` (and optional `ADMIN_EMAIL`) in the Cypress env. Accessibility checks use `cypress-axe`.

</details>

<details>
<summary><strong>Click to view the Robot Framework Test Suite Guide</strong></summary>

`npm run test:robot` creates `.venv-robot`, installs `requirements-robot.txt`, and writes results to `robot-results/`. Chrome must be available for SeleniumLibrary.

| File | Role |
| :---- | :--- |
| `cv_resources.robot` | URLs, locators, and shared keywords |
| `cv_suite.robot` | Desktop and mobile CV, including competency focus |
| `qa_lab.robot` | Catalog size, dashboard, tour, Mobile filter |
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
4. Create the admin user under **Authentication → Users**.
5. In **Firestore → Rules**, allow the collections the pages use (`messages`, `ratings`, `testimonials`, `visits`, `blocked_senders`, and `cvContent`). `cvContent` is public read and signed-in write. This repo does not include a rules file.
6. If the testimonials query asks for a composite index, open the console link from the browser error and create it.

</details>

---

## 📁 File Structure

```
/
├── index.html              # CV markup, meta, and JSON-LD
├── css/cv.css              # Harbor theme and CV layout
├── style.css               # Compiled Tailwind (from input.css)
├── js/
│   ├── cv-data.js          # Skills, experience, native dictionaries
│   ├── cv-app.js           # CV behavior and Firestore
│   ├── cv-editor.js        # Admin CV editor (cvContent/live)
│   ├── site-theme.js       # Shared light/dark theme
│   ├── site-i18n.js        # Language menu and machine translation
│   ├── site-tour.js        # Shared tour pulse (lab and studio)
│   ├── site-analytics.js   # GA helper
│   └── qa-lab.js           # Lab catalog, source links, runner
├── simulador.html          # 4-agent SDLC studio
├── qa-lab.html             # Visitor-facing regression lab
├── admin.html              # Admin panel (noindex)
├── tests/                  # Playwright specs and Robot suites
└── cypress/e2e/            # Cypress specs
```

---

## 👤 Author

* **Carlos A. Muñoz**
* **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)
