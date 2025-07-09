# 🚀 Interactive CV of Carlos A. Muñoz

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white) ![Google Analytics](https://img.shields.io/badge/google%20analytics-%23E37400.svg?style=for-the-badge&logo=google%20analytics&logoColor=white)

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

| Category     | Technologies                                                                                             |
| :----------- | :------------------------------------------------------------------------------------------------------- |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript (ES6+)`, `Tailwind CSS`                                               |
| **Backend** | `Firebase (Firestore, Authentication, Storage)`, `Cloud Functions for Firebase`                            |
| **APIs** | `SendGrid API` (for emails), `Google Analytics API` (for tracking)                                         |

---

## ⚙️ Setup and Configuration Guide

<details>
<summary><strong>Click to expand the setup instructions</strong></summary>

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
└── functions/
    ├── index.js          # Backend logic for email notifications.
    ├── package.json      # Node.js dependencies for the functions.
    └── .eslintrc.js      # Style guide for the functions code.
```

---

## 👤 Author

* **Carlos A. Muñoz**
* **LinkedIn:** [https://www.linkedin.com/in/carlos-andres-m-2a60b8b/](https://www.linkedin.com/in/carlos-andres-m-2a60b8b/)

