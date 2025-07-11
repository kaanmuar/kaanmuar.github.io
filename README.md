# 🚀 Interactive CV of Carlos A. Muñoz

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white) ![Cypress](https://img.shields.io/badge/cypress-%2317202C.svg?style=for-the-badge&logo=cypress&logoColor=white)

This repository contains the source code for a fully interactive, data-driven, and multilingual online curriculum vitae. It's designed to be a dynamic showcase of professional experience, skills, and projects, moving beyond the limitations of a traditional static resume.

**Live Demo:** [**https://kaanmuar.github.io/**](https://kaanmuar.github.io/)

---

## ✨ Key Features

This project is more than just a static webpage. It's a full-stack application built with Vanilla JavaScript and a Firebase backend, incorporating a wide range of modern web development features.

* **Frontend & User Experience**
    * **Dynamic Content Rendering:** All professional experience, skills, and testimonials are rendered dynamically from JavaScript objects, making the content easy to update and manage.
    * **Interactive Skill Filtering:** The "Technical Toolkit" section is interactive. Clicking on a skill tag dynamically filters the "Professional Experience" timeline to show only the roles where that skill was used.
    * **Multi-language Support:** The entire user interface can be translated on-the-fly between English, Spanish, Portuguese, German, French, and Italian.
    * **Expandable Sections:** Accordion-style sections for job details and skill categories keep the UI clean and allow users to explore the content at their own pace.
    * **Visualizations:** Includes custom-rendered radar charts for a visual representation of core competencies and methodologies.
    * **Responsive Design:** The layout is fully responsive and optimized for viewing on desktop, tablet, and mobile devices.
    * **Dark Mode:** A theme toggle allows users to switch between light and dark modes, with the user's preference saved in local storage.

* **Backend & Admin Features**
    * **Firebase Integration:** Utilizes a full suite of Firebase services for backend functionality, including Firestore, Authentication, and Storage.
    * **Contact & Rating Widget:** A floating widget allows visitors to send a direct message (with optional file attachments) or rate the CV with real-time validation.
    * **Admin Panel (`admin.html`):** A secure, private dashboard for managing incoming data, moderating reviews (Approve, Reject, Anonymous), and blocking senders.
    * **Email Notifications (Cloud Functions):** A serverless backend script automatically sends an email notification to the administrator whenever a new message or CV rating is submitted.

* **Analytics & SEO**
    * **Google Analytics:** Custom event tracking is implemented for key user interactions, including form submissions, skill filter usage, language changes, and more.
    * **SEO Best Practices:** Includes structured data (JSON-LD) for rich snippets in search results and `hreflang` tags for multi-language content.

---

## 🛠️ Tech Stack

| Category      | Technologies                                                                                             |
| :------------ | :------------------------------------------------------------------------------------------------------- |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6+)`, `Tailwind CSS`                                               |
| **Backend** | `Firebase (Firestore, Authentication, Storage)`, `Cloud Functions for Firebase`                            |
| **Testing** | `Cypress` (for End-to-End testing)                                                                       |
| **APIs** | `SendGrid API` (for emails), `Google Analytics API` (for tracking)                                         |

---

## 🧪 Automated Testing Suite

This project includes a comprehensive End-to-End (E2E) test suite built with **Cypress**. These tests simulate real user interactions to ensure that all key features of the application are working correctly after every change.

<details>
<summary><strong>Click to expand the Testing Suite setup and execution guide</strong></summary>

### 1. Test Suite Setup

1.  **Install Cypress:** In your project's root directory, run the following command to install Cypress as a development dependency:
    ```bash
    npm install cypress --save-dev
    ```

2.  **Open Cypress:** The first time you run Cypress, it will automatically create a standard folder structure (`cypress/`) for your tests.
    ```bash
    npx cypress open
    ```
    You can close the Cypress window after it has created the folders.

3.  **Create the Test File:** Inside the newly created `cypress/e2e/` folder, create a new file named `cv_spec.cy.js`.

4.  **Add Test Code:** Paste the entire code block below into your new `cv_spec.cy.js` file. This suite covers the most critical user journeys.

    ```javascript
    // cypress/e2e/cv_spec.cy.js

describe('Interactive CV Test Suite', () => {
    beforeEach(() => {
        // Visit the CV page before each test
        cy.visit('index.html');
        // Ensure the main content has loaded before proceeding
        cy.get('.main-container').should('be.visible');
    });

    context('Core Functionality', () => {
        it('should load the page and display the main header', () => {
            cy.get('h1').should('contain.text', 'CARLOS A. MUÑOZ');
        });

        it('should toggle dark mode successfully', () => {
            cy.get('#theme-toggle').click();
            cy.get('body').should('have.class', 'dark-mode');
            cy.get('#theme-toggle').click();
            cy.get('body').should('not.have.class', 'dark-mode');
        });

        it('should switch languages correctly', () => {
            // Check initial language (English)
            cy.get('[data-translate-key="contact_title"]').should('contain.text', 'Contact');

            // Switch to Spanish
            cy.get('#language-selector').click();
            cy.get('[data-lang="es"]').click();
            cy.get('[data-translate-key="contact_title"]').should('contain.text', 'Contacto');
        });
    });

    context('Interactive Features', () => {
        it('should filter professional experience by clicking a skill tag', () => {
            const skillToTest = 'Cypress';
            // Initially, more than one experience should be visible
            cy.get('.experience-item').should('have.length.greaterThan', 1);

            // Click the skill tag
            cy.contains('.tech-tag', skillToTest).click();

            // **FIXED**: Assert that two experiences are visible, as both contain "Cypress"
            cy.get('.experience-item:visible').should('have.length', 2);
            cy.get('.experience-item:visible').first().should('contain.text', 'Team International');
            cy.get('.experience-item:visible').last().should('contain.text', 'Globant');

            // Reset filters and check again
            cy.get('#reset-filter').click();
            cy.get('.experience-item').should('have.length.greaterThan', 1);
        });

        it('should expand and collapse an experience item', () => {
            const experienceItem = cy.get('#experience-0');
            experienceItem.find('.accordion-header').click();
            experienceItem.find('.experience-body').should('be.visible');
            experienceItem.find('.accordion-header').click();
            experienceItem.find('.experience-body').should('not.be.visible');
        });
    });

    context('Contact & Rating Widget', () => {
        beforeEach(() => {
            // Open the widget before each test in this context
            cy.get('#contact-widget-fab').click();
            cy.get('#contact-widget').should('be.visible');
        });

        it('should show validation errors for the "Message Me" form', () => {
            cy.get('#send-message-btn').should('be.disabled');
            cy.get('#sender-name').type('a').blur();
            cy.get('#sender-name-error').should('be.visible').and('contain.text', 'at least 2 characters');
            cy.get('#sender-email').type('invalid-email').blur();
            cy.get('#sender-email-error').should('be.visible').and('contain.text', 'valid email');
            cy.get('#send-message-btn').should('be.disabled');
        });

        it('should enable the send button when the "Message Me" form is valid', () => {
            cy.get('#sender-name').type('Test User');
            cy.get('#sender-email').type('test@example.com');
            // **FIXED**: Trigger a change event to ensure validation runs
            cy.get('#message-topic').select('CV Feedback').trigger('change');
            cy.get('#sender-message').type('This is a test message with sufficient length.');
            cy.get('#send-message-btn').should('not.be.disabled');
        });

        it('should switch to the "Rate CV" tab and show validation errors', () => {
            cy.get('#rating-tab').click();
            cy.get('#send-rating-btn').should('be.disabled');
            cy.get('#rater-name').type('b').blur();
            cy.get('#rater-name-error').should('be.visible');
            cy.get('#send-rating-btn').should('be.disabled');
        });

        it('should enable the submit button when the "Rate CV" form is valid', () => {
            cy.get('#rating-tab').click();

            cy.get('#rater-name').type('Test Rater');
            cy.get('#rater-email').type('rater@example.com');
            // **FIXED**: Click the star last to ensure the final validation check passes
            cy.get('.star[data-value="4"]').click();

            cy.get('#send-rating-btn').should('not.be.disabled');
        });
    });
});
    ```

### 2. Running the Tests

You can run the tests in two ways:

* **Interactive Mode (Recommended for development):**
    This opens the Cypress Test Runner, which allows you to see your application and the tests running side-by-side. It's great for debugging.
    ```bash
    npx cypress open
    ```

* **Headless Mode (For CI/CD or quick reports):**
    This runs the tests in the background without opening a browser window. It's faster and ideal for automated scripts. A video recording of the test run will be saved in the `cypress/videos/` folder.
    ```bash
    npx cypress run
    ```

### 3. Generating HTML Reports with Mochawesome

To generate detailed, shareable HTML reports, follow these steps:

1.  **Install Reporter Dependencies:** In your project's root directory, run this command to install all the necessary packages for the reporter:
    ```bash
    npm install --save-dev cypress-mochawesome-reporter mocha mochawesome mochawesome-merge mochawesome-report-generator
    ```

2.  **Configure Cypress:** Create a file named `cypress.config.js` in your project's root directory (if it doesn't already exist) and add the following configuration:

    ```javascript
    // cypress.config.js
    const { defineConfig } = require('cypress');

    module.exports = defineConfig({
      reporter: 'cypress-mochawesome-reporter',
      reporterOptions: {
        charts: true,
        reportPageTitle: 'Interactive CV - Test Report',
        embeddedScreenshots: true,
        inlineAssets: true,
        saveAllAttempts: false,
      },
      e2e: {
        setupNodeEvents(on, config) {
          require('cypress-mochawesome-reporter/plugin')(on);
        },
      },
    });
    ```

3.  **Configure the Support File:** Open the file `cypress/support/e2e.js` and add this single line at the top to import the reporter's commands:
    ```javascript
    // cypress/support/e2e.js
    import 'cypress-mochawesome-reporter/register';
    ```

4.  **Run and View Report:** Now, when you run your tests in headless mode, the HTML report will be generated automatically.
    ```bash
    npx cypress run
    ```
    After the run is complete, a new folder named `cypress/reports/html` will be created. Open the `index.html` file inside that folder to view your detailed test report.

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
7.  **Apply Security Rules:** Go to **Firestore Database** > **Rules** and paste the following rules:
    ```json
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /messages/{messageId} {
          allow create: if true;
          allow read, write, delete: if request.auth != null;
        }
        match /ratings/{ratingId} {
          allow create: if true;
          allow read: if resource.data.status == 'approved' || request.auth != null;
          allow update, delete: if request.auth != null;
        }
        match /blocked_senders/{email} {
          allow read: if true;
          allow write, delete: if request.auth != null;
        }
      }
    }
    ```
8.  **Create Database Index:** The query for testimonials requires a composite index. The easiest way to create it is to run the application, check the browser's developer console for an error message containing a link to create the index, and click that link.

### 4. Google Analytics Setup
1.  Go to [Google Analytics](https://analytics.google.com/) and create a new property.
2.  Find your **Measurement ID** (e.g., `G-XXXXXXXXXX`).
3.  In `index.html`, replace `G-YOUR_MEASUREMENT_ID` with your actual ID in the Google Analytics script tag.

### 5. Email Notifications (Cloud Functions)
1.  **Upgrade Firebase Plan:** Your project must be on the **Blaze (Pay-as-you-go)** plan to use Cloud Functions with external network access. The free tier is very generous.
2.  **Set up SendGrid:** Create a free account at [SendGrid](https://sendgrid.com/), verify a sender email address, and create an API key.
3.  **Initialize Functions:** In your project's root directory, run `firebase init functions` and select JavaScript.
4.  **Install Dependencies:** Navigate into the new `functions` folder and run `npm install @sendgrid/mail`.
5.  **Add Function Code:** Copy the code from the `functions/index.js` file in this repository into your local `functions/index.js`.
6.  **Set Environment Variables:** In your terminal (from the project root), run the following commands, replacing the placeholders with your actual credentials:
    ```bash
    firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
    firebase functions:config:set notifications.email="your-email@example.com"
    ```
7.  **Deploy:** Run `firebase deploy --only functions` from the project root.

</details>

---

## 📁 File Structure
```
/
├── index.html            # The main public-facing interactive CV page.
├── admin.html            # The secure admin panel for managing messages and ratings.
├── cypress.config.js     # Configuration for Cypress tests and reporting.
├── cypress/              # Contains all End-to-End tests.
│   └── e2e/
│       └── cv_spec.cy.js # The main test suite for the application.
│   └── support/
│       └── e2e.js        # Cypress support file, imports the reporter.
└── functions/
    ├── index.js          # Backend logic for email notifications.
    ├── package.json      # Node.js dependencies for the functions.
    └── .eslintrc.js      # Style guide for the functions code.
```

---

## 👤 Author

* **Carlos A. Muñoz**
* **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)
