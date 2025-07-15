# 🚀 Interactive CV of Carlos A. Muñoz

     

This repository contains the source code for a fully interactive, data-driven, and multilingual online curriculum vitae. It's designed to be a dynamic showcase of professional experience, skills, and projects, moving beyond the limitations of a traditional static resume.

**Live Demo:** [**https://kaanmuar.github.io/**](https://kaanmuar.github.io/)

-----

## ✨ Key Features

This project is more than just a static webpage. It's a full-stack application built with Vanilla JavaScript and a Firebase backend, incorporating a wide range of modern web development features.

  * **Frontend & User Experience**

      * **Dynamic Content Rendering:** All professional experience, skills, and testimonials are rendered dynamically from JavaScript objects, making the content easy to update and manage.
      * **Interactive Skill Filtering:** The "Technical Toolkit" section is interactive. Clicking a skill tag dynamically filters the "Professional Experience" timeline to show only roles where that skill was used.
      * **Automated Interactive Tour:** A guided tour automatically runs on the first visit (or on-demand) to demonstrate all key interactive features of the CV, using `sessionStorage` to track if the tour has been seen.
      * **Multi-language Support:** The entire user interface can be translated on-the-fly between English, Spanish, Portuguese, German, French, and Italian.
      * **Expandable Sections:** Accordion-style sections for job details and skill categories keep the UI clean and allow users to explore content at their own pace.
      * **Visualizations:** Includes custom-rendered SVG radar charts for a visual representation of core competencies and methodologies.
      * **Dark Mode:** A theme toggle allows users to switch between light and dark modes, with the user's preference saved in `localStorage`.

  * **Backend & Admin Features**

      * **Firebase Integration:** Utilizes a full suite of Firebase services for backend functionality, including Firestore, Authentication, and Storage.
      * **Contact & Rating Widget:** A floating widget allows visitors to send a direct message (with optional file attachments) or rate the CV with real-time validation. Submissions are stored in Firestore.
      * **Live Testimonials:** An approved-ratings system fetches and displays testimonials and the average rating in real-time from the Firestore database.
      * **Admin Panel (`admin.html`):** A secure, private dashboard for managing incoming data. It requires Firebase Authentication to log in.
      * **Data Moderation:** The admin panel allows for moderating reviews (Approve, Reject, Approve Anonymously) and viewing contact messages.
      * **Sender Blocking:** Includes functionality to block specific email addresses from submitting messages or ratings, managed via a `blocked_senders` collection in Firestore.
      * **Email Notifications (Cloud Functions):** A serverless backend script can be configured to automatically send an email notification to the administrator whenever a new message or CV rating is submitted.

  * **Analytics & SEO**

      * **Google Analytics:** Custom event tracking is implemented for key user interactions, including form submissions, skill filter usage, language changes, and tour progress.
      * **SEO Best Practices:** Includes structured data (JSON-LD) for rich snippets in search results and `hreflang` tags for multi-language content.

-----

## 🛠️ Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6+)`, `Tailwind CSS` |
| **Backend** | `Firebase (Firestore, Authentication, Storage)`, `Cloud Functions for Firebase` |
| **Testing** | `Cypress` (for End-to-End testing) |
| **APIs** | `SendGrid API` (for emails), `Google Analytics API` (for tracking) |

-----

## 🧪 Automated Testing Suite

This project includes a comprehensive End-to-End (E2E) test suite built with **Cypress**. These tests simulate real user interactions to ensure that all key features of the application are working correctly after every change.

\<details\>
\<summary\>\<strong\>Click to expand the Testing Suite setup and execution guide\</strong\>\</summary\>

### 1\. Test Suite Setup & Execution

1.  **Install Cypress:** In your project's root directory, run `npm install cypress --save-dev`.
2.  **Open Cypress:** The first time you run Cypress (`npx cypress open`), it will create a standard folder structure (`cypress/`).
3.  **Create Test Files:** Inside the `cypress/e2e/` folder, create two new files: `cv_spec.cy.js` and `admin_spec.cy.js`.
4.  **Add Test Code:** Paste the code blocks below into their corresponding files.

#### Main CV Tests (`cv_spec.cy.js`)

This test suite covers all interactive features of the main `index.html` page. It cleverly disables the automatic tour on load to ensure predictable test runs.

```javascript
// cypress/e2e/cv_spec.cy.js

describe('Interactive CV Test Suite', () => {

    // This hook runs before each test ('it' block)
    beforeEach(() => {
        // We visit the page with an 'onBeforeLoad' callback.
        // This is the CRITICAL fix to prevent the auto-tour from running.
        cy.visit('index.html', {
            onBeforeLoad(win) {
                // This command runs before any of your page's scripts.
                // It sets a sessionStorage item that tricks the page into
                // thinking the tour has already been seen.
                win.sessionStorage.setItem('hasSeenTour', 'true');
            },
        });
        // This assertion ensures the page is fully loaded before tests continue.
        cy.get('.main-container').should('be.visible');
    });

    context('Core Functionality & Accessibility', { tags: '@core' }, () => { // TAGS ADDED

        // Test 1: Dark Mode
        it('should toggle dark mode successfully and persist the setting', { tags: '@visual' }, () => { // TAGS ADDED
            // a. Assert initial state is light mode
            cy.get('html').should('not.have.class', 'dark-mode');

            // Toggle to dark mode and verify
            cy.get('#theme-toggle').click();
            cy.get('html').should('have.class', 'dark-mode');

            // Reload the page and verify the setting persisted
            cy.reload();
            cy.get('html').should('have.class', 'dark-mode');

            // Toggle back to light mode
            cy.get('#theme-toggle').click();
            cy.get('html').should('not.have.class', 'dark-mode');
        });

        // Test 2: Language Switching
        it('should switch languages correctly and verify multiple translated elements', () => {
            // a. We will test two specific languages for predictable results.
            const languages = {
                es: { summary_title: 'Resumen Profesional', summary_text: 'Gerente Senior de Proyectos de TI' },
                de: { summary_title: 'Berufliches Profil', summary_text: 'Senior IT-Projektmanager' }
            };

            // b. Verify EVERYTHING that can be translated
            for (const [langCode, translations] of Object.entries(languages)) {
                cy.log(`Testing language: ${langCode}`);
                cy.get('#language-selector').click();
                cy.get(`[data-lang="${langCode}"]`).click();

                // Check a heading, a paragraph, and a tooltip for translation
                cy.get('[data-translate-key="summary_title"]').should('contain.text', translations.summary_title);
                cy.get('[data-translate-key="summary_text"]').should('contain.text', translations.summary_text);
            }
        });

        // Test 5: Photo Zoom Functionality
        it('should open and close the profile photo modal', { tags: '@visual' }, () => { // TAGS ADDED
            cy.get('#profile-photo').click();
            cy.get('#image-modal').should('have.class', 'visible');
            cy.get('#modal-image').should('have.attr', 'src').and('not.be.empty');
            cy.get('.modal-close').click();
            cy.get('#image-modal').should('not.have.class', 'visible');
        });

        // Test 6: Print Functionality
        it('should trigger the print dialog when the print button is clicked', () => {
            cy.window().then((win) => {
                // We stub window.print because Cypress cannot interact with the OS print dialog.
                // This allows us to confirm the button's click event works correctly.
                cy.stub(win, 'print').as('printStub');
            });
            cy.get('#print-btn').click();
            cy.get('@printStub').should('be.calledOnce');
        });

        // Test 7: Icon Loading
        it('should load all img icons successfully', { tags: ['@visual', '@health'] }, () => { // TAGS ADDED
            cy.get('img').each(($img) => {
                // This assertion checks that the image file was loaded by the browser
                // by verifying its natural (intrinsic) width is greater than 0.
                expect($img[0].naturalWidth).to.be.greaterThan(0);
            });
        });
    });

    context('Interactive Filtering & Accordions', { tags: '@interactive' }, () => { // TAGS ADDED

        // Test 3: Skill Filtering
        it('should filter experiences by clicking a random high-rated skill', { tags: '@filtering' }, () => { // TAGS ADDED
            // d. Expand all toolkit sections to ensure all skills are visible
            cy.get('#expand-all-toolkit').click();

            // a. Pick a 4-5 stars skill randomly
            cy.get('.tech-tag').filter(':contains("5+ Yrs"), :contains("8+ Yrs"), :contains("10+ Yrs")').then($tags => {
                const randomTag = $tags.get(Math.floor(Math.random() * $tags.length));
                cy.wrap(randomTag).click();
            });

            // b. Verify both timeline and experiences sections are filtered
            cy.get('.experience-item.filter-match').should('exist');
            cy.get('.experience-item.filter-no-match').should('exist');
            cy.get('#timeline-container .timeline-item.filtered-out').should('exist');

            // c. Test multiple skill selections
            cy.get('.tech-tag:not(.selected)').first().click();
            cy.get('.experience-item.filter-match').should('exist');
        });

        // Test 4: Experience Accordions
        it('should expand a random experience and verify its skills toolkit', () => {
            // b. Test random individual expansion and collapse
            cy.get('.experience-item').then($items => {
                const randomIndex = Math.floor(Math.random() * $items.length);
                const randomItem = $items.get(randomIndex);

                cy.wrap(randomItem).find('.accordion-header').click();
                // a. Verify skill toolkit per experience is right and shown
                cy.wrap(randomItem).find('.experience-tech-tags').should('be.visible');
                cy.wrap(randomItem).find('.accordion-header').click();
                cy.wrap(randomItem).find('.experience-tech-tags').should('not.be.visible');
            });
        });
    });

    context('Content Loading and Verification', { tags: '@content' }, () => { // TAGS ADDED

        // Test 8: Timeline
        it('should load all timeline items and navigate correctly on click', () => {
            // a. Test All experiences are loaded (assuming 13 experiences in data)
            cy.get('#timeline-container .timeline-item').should('have.length', 13);

            // b. Test each experience loads its skills icons
            cy.get('#timeline-container .timeline-item').first().find('.timeline-tech-icons img').should('exist');

            // c. Test clicking on a random experience
            const randomIndex = Math.floor(Math.random() * 13);
            cy.get(`#timeline-exp-${randomIndex} a`).click();
            cy.url().should('include', `#experience-${randomIndex}`);
            cy.get(`#experience-${randomIndex}`).should('be.visible');
        });

        // Test 9: Radar Graphs
        it('should load radar graphs with tooltips', { tags: '@visual' }, () => { // TAGS ADDED
            cy.get('#competencies-radar-chart').should('be.visible');
            cy.get('#methodologies-radar-chart').should('be.visible');

            // a. Test Radar tooltips by checking for the <title> element which browsers use for tooltips
            cy.get('#competencies-radar-chart .radar-label').first().find('title').should('not.be.empty');
        });

        // Test 10: Education & Certifications
        it('should load the Education & Certifications section', () => {
            cy.get('section[aria-labelledby="education-heading"]').should('be.visible');
            cy.contains('h3', 'Key Certifications').should('be.visible');
        });

        // Test 11: Testimonials
        it('should load and display testimonials from Firestore', { tags: '@data' }, () => { // TAGS ADDED
            // NOTE: Cleaning up test data (un-publishing) is not a frontend E2E test's responsibility.
            // This test correctly verifies that the UI can render data from the database.
            cy.get('#testimonials-container .testimonial-card').should('exist');
            cy.get('#average-rating-display').should('be.visible').and('contain.text', 'Avg:');
        });
    });
});
```

#### Admin Panel Tests (`admin_spec.cy.js`)

This suite validates the authentication and core features of the `admin.html` dashboard. **Remember to replace `YOUR_ADMIN_PASSWORD`** with a valid password for your test environment.

```javascript
// cypress/e2e/admin_spec.cy.js

describe('Admin Panel Test Suite', { tags: '@admin' }, () => {

    const ADMIN_EMAIL = 'kaanmuar@gmail.com'; // Your admin email
    const ADMIN_PASSWORD = 'YOUR_ADMIN_PASSWORD'; // IMPORTANT: Replace this

    beforeEach(() => {
        cy.visit('admin.html');
    });

    context('Admin Authentication', { tags: '@auth' }, () => {

        it('should fail to login with incorrect credentials', () => {
            cy.get('#email').type('wrong@user.com');
            cy.get('#password').type('wrongpassword');
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#login-error').should('be.visible').and('contain.text', 'Login failed');
        });

        it('should successfully log in and log out', { tags: '@critical' }, () => {
            cy.get('#email').type(ADMIN_EMAIL);
            cy.get('#password').type(ADMIN_PASSWORD, { log: false });
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#dashboard').should('be.visible');
            cy.get('#logout-btn').click();
            cy.get('#login-overlay').should('be.visible');
        });
    });

    context('Admin Dashboard Functionality', () => {

        beforeEach(() => {
            cy.get('#email').type(ADMIN_EMAIL);
            cy.get('#password').type(ADMIN_PASSWORD, { log: false });
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#dashboard').should('be.visible');
        });

        it('should switch between Messages and CV Ratings tabs', () => {
            cy.get('#ratings-tab-btn').click();
            cy.get('#ratings-pane').should('be.visible');
            cy.get('#messages-pane').should('not.be.visible');
        });

        it('should display ratings and allow status changes', { tags: '@regression' }, () => {
            cy.get('#ratings-tab-btn').click();
            cy.get('#ratings-list .item-card').first().as('firstRating');
            cy.get('@firstRating').find('button').contains('Approve').should('be.visible');
            cy.get('@firstRating').find('button').contains('Reject').should('be.visible');
        });
    });
});
```

### 2\. Running the Tests

  * **Interactive Mode:** `npx cypress open`
  * **Headless Mode:** `npx cypress run`

\</details\>

-----

## ⚙️ Setup and Configuration Guide

\<details\>
\<summary\>\<strong\>Click to expand the project setup instructions\</strong\>\</summary\>

To run this project locally or deploy your own version, follow these steps.

### 1\. Prerequisites

  * [Node.js](https://nodejs.org/en/) and npm installed.
  * [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`).

### 2\. Clone the Repository

```bash
git clone https://github.com/kaanmuar/kaanmuar.github.io.git
cd kaanmuar.github.io
```

### 3\. Firebase Project Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  In your new project, create a **Web App**.
3.  Copy the `firebaseConfig` object provided during setup.
4.  Paste this `firebaseConfig` object into both `index.html` and `admin.html`, replacing the existing placeholder.
5.  **Enable Services:**
      * Go to **Firestore Database** and create a database in **Production mode**.
      * Go to **Authentication** \> **Sign-in method** and enable **Email/Password**.
      * Go to **Storage** and create a storage bucket.
6.  **Create Admin User:** In the **Authentication** \> **Users** tab, add a new user with the email and password you will use to log into `admin.html`.
7.  **Apply Security Rules:** Go to **Firestore Database** \> **Rules** and paste the following rules:
    ```javascript
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
          allow read, write, delete: if request.auth != null;
        }
      }
    }
    ```
8.  **Create Database Index:** The query for testimonials requires a composite index. The easiest way to create it is to run the application, check the browser's developer console for an error message containing a link to create the index, and click that link.

### 4\. Google Analytics Setup

1.  Go to [Google Analytics](https://analytics.google.com/) and create a new property.
2.  Find your **Measurement ID** (e.g., `G-XXXXXXXXXX`).
3.  In `index.html`, replace `G-YOUR_MEASUREMENT_ID` with your actual ID in the Google Analytics script tag.

\</details\>

-----

## 📁 File Structure

```
/
├── index.html          # The main public-facing interactive CV page.
├── admin.html          # The secure admin panel for managing messages and ratings.
├── cypress.config.js   # Configuration for Cypress tests and reporting.
├── cypress/            # Contains all End-to-End tests.
│   └── e2e/
│       ├── cv_spec.cy.js    # The main test suite for the CV.
│       └── admin_spec.cy.js # The test suite for the admin panel.
│   └── support/
│       └── e2e.js      # Cypress support file, imports the reporter.
└── functions/
    ├── index.js        # Backend logic for email notifications.
    ├── package.json    # Node.js dependencies for the functions.
    └── .eslintrc.js    # Style guide for the functions code.
```

-----

## 👤 Author

  * **Carlos A. Muñoz**
  * **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)
