# 🚀 Interactive CV & Admin Panel

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white) ![Cypress](https://img.shields.io/badge/cypress-%2317202C.svg?style=for-the-badge&logo=cypress&logoColor=white) ![Playwright](https://img.shields.io/badge/playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white) ![Robot Framework](https://img.shields.io/badge/robot%20framework-000000?style=for-the-badge&logo=robot-framework&logoColor=white)

This repository contains the source code for a fully interactive, data-driven, and multilingual online curriculum vitae, complete with a secure backend administration panel. It is designed as a dynamic showcase of professional experience, skills, and projects, moving beyond the limitations of a traditional static resume.

**Live Demo:** [**https://kaanmuar.github.io/**](https://kaanmuar.github.io/)

---

## ✨ Key Features

This project is a full-stack application built with Vanilla JavaScript and a Firebase backend, incorporating a wide range of modern web development and quality assurance features.

### Interactive CV (`index.html`)
* **Dynamic Content Rendering:** All professional experience, skills, and testimonials are rendered dynamically from JavaScript objects, making the content easy to update and manage.
* **Multi-language Support:** The entire UI can be translated on-the-fly between **English, Spanish, Portuguese, German, French, and Italian**. Language preference can be set via a UI toggle or directly through a URL parameter (`?lang=es`).
* **Interactive Skill Filtering:** The "Technical Toolkit" is fully interactive. Clicking on a skill tag dynamically filters the "Professional Experience" and "Career Timeline" sections to highlight roles where that skill was used.
* **Dynamic Radar Charts:** Competency and methodology radar charts are interactive. Clicking on a label (e.g., "QA & Automation") filters the toolkit to show the related skills.
* **Automated Interactive Tour:** A multi-step guided tour runs on first visit (or on-demand) to demonstrate all key interactive features of the CV, with enhanced animations and mobile-specific adjustments.
* **Responsive Design & Dark Mode:** The layout is fully optimized for desktop, tablet, and mobile devices, and includes a theme toggle for switching between light and dark modes.
* **Multiple Export Options:** Users can export the CV content in various formats, including **PDF, JPG, DOC, JSON, and TXT**.
* **Contact & Rating Widget:** A floating widget allows visitors to send a direct message (with optional file attachments up to 5MB) or rate the CV. Submissions are sent directly to a Firestore database.
* **Live Testimonials:** An approval-based system fetches and displays public testimonials and the average rating in real-time from the Firestore database, including threaded responses from the admin.
* **SEO & Analytics:** The project includes structured data (JSON-LD) for rich snippets, `hreflang` tags for internationalization, and custom event tracking with Google Analytics for key user interactions.

### Admin Panel (`admin.html`)
* **Secure Authentication:** The admin panel is protected by Firebase Authentication (Email/Password).
* **Real-time Data Management:** View and manage all incoming messages and ratings from Firestore in real-time.
* **Advanced Filtering & Search:** Each data view (Inbox, Ratings, etc.) has a multi-field filtering and search capability to easily find specific records.
* **Response System:** Respond directly to messages or ratings from the admin panel. Responses can be kept private or made public.
* **Public Testimonial Curation:** Approving a rating and making a response public will automatically create a new entry in the public "Testimonials" collection, which is then displayed on the main CV page.
* **Content Moderation:** Reject messages, approve/retract ratings, and block senders by email to prevent spam.
* **Statistics Dashboard:** A visual dashboard with Chart.js provides statistics on incoming messages and ratings over selectable date ranges.

---

## 🛠️ Tech Stack

| Category      | Technologies                                            |
| :------------ | :------------------------------------------------------ |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6+)`, `Tailwind CSS`, `Chart.js` |
| **Backend** | `Firebase (Authentication, Firestore, Storage)`         |
| **Testing** | `Cypress`, `Playwright`, `Robot Framework`              |
| **APIs** | `Google Analytics API` (for tracking)                   |

---

## 🧪 Automated Testing

This project includes a comprehensive End-to-End (E2E) testing suite with coverage from three different modern frameworks. These tests ensure that all key features of both the CV and the Admin Panel are working correctly.

<details>
<summary><strong>Click to view the Cypress Test Suite Guide</strong></summary>

### 1. Setup
Install Cypress and dependencies:
```bash
npm install cypress cypress-axe cypress-mochawesome-reporter --save-dev
```

### 2. Configuration
Ensure you have a `cypress.config.js` file in your root directory with reporting configured. The tests are located in `cypress/e2e/`.

### 3. Run Tests
* **Interactive Mode:** `npx cypress open`
* **Headless Mode (for CI/CD):** `npm run test:cypress`

### 4. Coverage
The Cypress suite (`cv_spec.cy.js` and `admin_spec.cy.js`) covers:
* **Desktop & Mobile** viewports.
* Core UI features like dark mode, language switching, and modal popups.
* Interactive filtering via the toolkit and radar charts.
* Contact widget form validation and mock submission.
* A full run-through of the interactive tour.
* Admin panel login, filtering, and the full testimonial approval/response lifecycle.
* Baseline accessibility checks using `cypress-axe`.

</details>

<details>
<summary><strong>Click to view the Playwright Test Suite Guide</strong></summary>

### 1. Setup
Install Playwright:
```bash
npm init playwright@latest
```

### 2. Configuration
Tests are located in the `tests/` directory and use a Page Object Model (`CVPage.js`, `AdminPage.js`).

### 3. Run Tests
```bash
npm run test:playwright
```

### 4. View Report
After the run, view the detailed HTML report:
```bash
npx playwright show-report
```

### 5. Coverage
The Playwright suite (`cv-and-admin.spec.js`) covers:
* **Desktop & Mobile** scenarios using device emulation.
* Dark mode persistence and interactive filtering.
* A full End-to-End test of the **Admin Panel**, including creating a new rating on the CV page, logging into the admin panel, approving the rating, responding to it, and finally verifying that it appears as a public testimonial on the main CV page.

</details>

<details>
<summary><strong>Click to view the Robot Framework Test Suite Guide</strong></summary>

### 1. Setup
You need Python, Robot Framework, and the SeleniumLibrary installed:
```bash
pip install robotframework robotframework-seleniumlibrary
```
You will also need the appropriate web driver (e.g., `chromedriver`) in your system's PATH.

### 2. Test Structure
The suite uses a two-file structure for maintainability:
* `cv_resources.robot`: Defines all variables (locators) and low-level keywords (actions).
* `cv_suite.robot`: Contains the high-level, human-readable test cases.

### 3. Run Tests
From your project's root directory, run:
```bash
npm run test:robot
```

### 4. Coverage
The Robot Framework suite (`cv_suite.robot`) covers:
* **Desktop & Mobile** scenarios by setting the browser window size.
* Core UI tests for dark mode and language switching.
* Interactive tests for the dynamic radar chart filter.
* Verification of the mobile sticky toolbar's behavior on scroll.

</details>

---

## ⚙️ Setup and Configuration Guide

<details>
<summary><strong>Click to expand the project setup instructions</strong></summary>

To run this project locally or deploy your own version, follow these steps.

### 1. Prerequisites
* [Node.js](https://nodejs.org/en/) and npm installed.
* [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`).

### 2. Clone the Repository
```bash
git clone [https://github.com/kaanmuar/kaanmuar.github.io.git](https://github.com/kaanmuar/kaanmuar.github.io.git)
cd kaanmuar.github.io
```

### 3. Firebase Project Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  In your new project, create a **Web App**.
3.  Copy the `firebaseConfig` object provided during setup.
4.  Paste this `firebaseConfig` object into both `index.html` and `admin.html`, replacing the existing placeholder.
5.  **Enable Services:**
    * Go to **Firestore Database** and create a database in **Production mode**.
    * Go to **Authentication** > **Sign-in method** and enable **Email/Password**.
    * Go to **Storage** and create a storage bucket.
6.  **Create Admin User:** In the **Authentication** > **Users** tab, add a new user with the email and password you will use to log into `admin.html`.
7.  **Apply Security Rules:** Go to **Firestore Database** > **Rules** and paste the rules found in the `firestore.rules` file of this repository.
8.  **Create Database Index:** The query for testimonials requires a composite index. The easiest way to create it is to run the application, check the browser's developer console for an error message containing a link to create the index, and click that link.

### 4. Install Dependencies
Install all the necessary `npm` packages for testing:
```bash
npm install
```

</details>

---

## 📁 File Structure

```
/
├── index.html              # The main public-facing interactive CV page.
├── admin.html              # The secure admin panel for managing messages and ratings.
├── package.json            # Project dependencies and scripts.
├── .github/
│   └── workflows/
│       └── main.yml        # GitHub Actions configuration for CI/CD.
├── tests/                  # Contains all Playwright tests.
│   ├── CVPage.js           # Playwright Page Object for index.html.
│   ├── AdminPage.js        # Playwright Page Object for admin.html.
│   └── cv-and-admin.spec.js # Playwright test suite.
└── cypress/
    └── e2e/
        ├── cv_spec.cy.js      # Cypress test suite for the CV.
        ├── admin_spec.cy.js     # Cypress test suite for the admin panel.
        ├── cv_suite.robot     # Robot Framework main test suite.
        └── cv_resources.robot # Robot Framework resource file.
```

---

## 👤 Author

* **Carlos A. Muñoz**
* **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)
