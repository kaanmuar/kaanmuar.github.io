    // Import Firebase modules
    // ** MODIFIED **: Added query and where for the new function
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
    import { getFirestore, collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
    import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

    // IMPORTANT: Actual Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w",
        authDomain: "carlosm-interactive-cv.firebaseapp.com",
        projectId: "carlosm-interactive-cv",
        storageBucket: "carlosm-interactive-cv.firebasestorage.app",
        messagingSenderId: "976558418058",
        appId: "1:976558418058:web:1dc19bcd40915ea233e573"
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const storage = getStorage(app);

    const PRINT_COPY = {
        en: {
            print_confidential: 'Confidential',
            edu_degree_1: 'Specialization in Management on IT Projects',
            edu_degree_2: 'Computer Systems Engineering',
            edu_degree_3: 'Computer Systems Technician',
            cert_label_english: 'English Proficiency:',
            cert_label_pm: 'Project Management:',
            cert_label_qa: 'Quality Assurance:',
            cert_label_security: 'Information Security:',
            footer_lab: 'QA regression lab — run the Playwright, Cypress, and Robot suite in the browser',
            footer_studio: 'SDLC studio — try the Jira, Xray, and test-automation sprint',
            roles: [
                'Senior QA & Program Consultant',
                'Senior Technical Project Manager & Consultant',
                'Sr. Project Manager & QA Engineer',
                'Sr. QA Engineer',
                'Sr. Technical Architect',
                'Sr. Strategic Development Manager',
                'Sr. Project Manager',
                'CISO - Chief Information Security Officer',
                'Sr. Hybrid QA Engineer / QA Lead',
                'ISE Engineer LATAM',
                'Business Tender Specialist - LATAM',
                'Solutions Engineer - Special Projects LATAM',
                'Partner Product Manager - NOLA',
                'Advanced Technologies Advisor'
            ]
        },
        es: {
            print_confidential: 'Confidencial',
            edu_degree_1: 'Especialización en Gestión de Proyectos de TI',
            edu_degree_2: 'Ingeniería de Sistemas',
            edu_degree_3: 'Técnico en Sistemas',
            cert_label_english: 'Competencia en inglés:',
            cert_label_pm: 'Gestión de proyectos:',
            cert_label_qa: 'Aseguramiento de calidad:',
            cert_label_security: 'Seguridad de la información:',
            footer_lab: 'Laboratorio de regresión QA — ejecuta Playwright, Cypress y Robot en el navegador',
            footer_studio: 'Estudio SDLC — prueba el sprint de Jira, Xray y automatización',
            roles: [
                'Consultor Senior de QA y Programas',
                'Gerente Senior de Proyectos Técnicos y Consultor',
                'Gerente Senior de Proyectos e Ingeniero de QA',
                'Ingeniero Senior de QA',
                'Arquitecto Técnico Senior',
                'Gerente Senior de Desarrollo Estratégico',
                'Gerente Senior de Proyectos',
                'CISO - Director de Seguridad de la Información',
                'Ingeniero Senior de QA Híbrido / Líder de QA',
                'Ingeniero ISE LATAM',
                'Especialista en Licitaciones - LATAM',
                'Ingeniero de Soluciones - Proyectos Especiales LATAM',
                'Gerente de Producto Partner - NOLA',
                'Asesor de Tecnologías Avanzadas'
            ]
        },
        pt: {
            print_confidential: 'Confidencial',
            edu_degree_1: 'Especialização em Gestão de Projetos de TI',
            edu_degree_2: 'Engenharia de Sistemas de Computação',
            edu_degree_3: 'Técnico em Sistemas de Computação',
            cert_label_english: 'Proficiência em inglês:',
            cert_label_pm: 'Gestão de projetos:',
            cert_label_qa: 'Garantia de qualidade:',
            cert_label_security: 'Segurança da informação:',
            footer_lab: 'Laboratório de regressão de QA — execute Playwright, Cypress e Robot no navegador',
            footer_studio: 'Estúdio SDLC — experimente o sprint de Jira, Xray e automação de testes',
            roles: [
                'Consultor Sênior de QA e Programas',
                'Gerente Sênior de Projetos Técnicos e Consultor',
                'Gerente Sênior de Projetos e Engenheiro de QA',
                'Engenheiro Sênior de QA',
                'Arquiteto Técnico Sênior',
                'Gerente Sênior de Desenvolvimento Estratégico',
                'Gerente Sênior de Projetos',
                'CISO - Diretor de Segurança da Informação',
                'Engenheiro Sênior de QA Híbrido / Líder de QA',
                'Engenheiro ISE LATAM',
                'Especialista em Licitações - LATAM',
                'Engenheiro de Soluções - Projetos Especiais LATAM',
                'Gerente de Produto Parceiro - NOLA',
                'Consultor de Tecnologias Avançadas'
            ]
        },
        de: {
            print_confidential: 'Vertraulich',
            edu_degree_1: 'Spezialisierung in IT-Projektmanagement',
            edu_degree_2: 'Ingenieurwesen für Computersysteme',
            edu_degree_3: 'Techniker für Computersysteme',
            cert_label_english: 'Englischkenntnisse:',
            cert_label_pm: 'Projektmanagement:',
            cert_label_qa: 'Qualitätssicherung:',
            cert_label_security: 'Informationssicherheit:',
            footer_lab: 'QA-Regressionslabor — Playwright, Cypress und Robot im Browser ausführen',
            footer_studio: 'SDLC-Studio — Jira-, Xray- und Testautomatisierungs-Sprint ausprobieren',
            roles: [
                'Senior QA- und Programmberater',
                'Senior Technical Project Manager und Berater',
                'Senior Projektmanager und QA-Ingenieur',
                'Senior QA-Ingenieur',
                'Senior Technical Architect',
                'Senior Manager für strategische Entwicklung',
                'Senior Projektmanager',
                'CISO - Leiter der Informationssicherheit',
                'Senior Hybrid-QA-Ingenieur / QA-Lead',
                'ISE-Ingenieur LATAM',
                'Spezialist für Ausschreibungen - LATAM',
                'Solutions Engineer - Sonderprojekte LATAM',
                'Partner Product Manager - NOLA',
                'Berater für fortschrittliche Technologien'
            ]
        },
        fr: {
            print_confidential: 'Confidentiel',
            edu_degree_1: 'Spécialisation en gestion de projets informatiques',
            edu_degree_2: 'Ingénierie des systèmes informatiques',
            edu_degree_3: 'Technicien en systèmes informatiques',
            cert_label_english: 'Compétence en anglais :',
            cert_label_pm: 'Gestion de projet :',
            cert_label_qa: 'Assurance qualité :',
            cert_label_security: 'Sécurité de l\'information :',
            footer_lab: 'Laboratoire de régression QA — lancez Playwright, Cypress et Robot dans le navigateur',
            footer_studio: 'Studio SDLC — essayez le sprint Jira, Xray et automatisation de tests',
            roles: [
                'Consultant senior QA et programmes',
                'Chef de projet technique senior et consultant',
                'Chef de projet senior et ingénieur QA',
                'Ingénieur QA senior',
                'Architecte technique senior',
                'Responsable senior du développement stratégique',
                'Chef de projet senior',
                'CISO - Directeur de la sécurité de l\'information',
                'Ingénieur QA hybride senior / Lead QA',
                'Ingénieur ISE LATAM',
                'Spécialiste des appels d\'offres - LATAM',
                'Ingénieur solutions - Projets spéciaux LATAM',
                'Partner Product Manager - NOLA',
                'Conseiller en technologies avancées'
            ]
        },
        it: {
            print_confidential: 'Riservato',
            edu_degree_1: 'Specializzazione in gestione di progetti IT',
            edu_degree_2: 'Ingegneria dei sistemi informatici',
            edu_degree_3: 'Tecnico dei sistemi informatici',
            cert_label_english: 'Competenza in inglese:',
            cert_label_pm: 'Gestione dei progetti:',
            cert_label_qa: 'Assicurazione qualità:',
            cert_label_security: 'Sicurezza delle informazioni:',
            footer_lab: 'Laboratorio di regressione QA — esegui Playwright, Cypress e Robot nel browser',
            footer_studio: 'Studio SDLC — prova lo sprint Jira, Xray e automazione dei test',
            roles: [
                'Consulente senior QA e programmi',
                'Senior Technical Project Manager e consulente',
                'Senior Project Manager e ingegnere QA',
                'Ingegnere QA senior',
                'Architetto tecnico senior',
                'Senior Manager dello sviluppo strategico',
                'Senior Project Manager',
                'CISO - Responsabile della sicurezza delle informazioni',
                'Ingegnere QA ibrido senior / QA Lead',
                'Ingegnere ISE LATAM',
                'Specialista gare d\'appalto - LATAM',
                'Solutions Engineer - Progetti speciali LATAM',
                'Partner Product Manager - NOLA',
                'Consulente di tecnologie avanzate'
            ]
        }
    };

    function boot() {
        if (!window.CVData) {
            console.error('CVData failed to load (js/cv-data.js)');
            return;
        }
        const CarlosMunozCV = {
            state: {
                dictLang: 'en',
                selectedSkills: new Set(),
                pulseTimeout: null,
                statusTimeout: null,
                rating: 0,
                hasAutoOpenedRating: false,
                // **NEW**: A set to hold the emails of blocked senders
                blockList: new Set(),
                // --- NEW STATE ---
                chartIndex: 0,
                chartPaused: false,
                chartTimer: null,
                chartBound: false,
                activeTopic: null,
            },
            data: window.CVData,

            // ==========================================================
            // |         NEW JAVASCRIPT: TOUR STEPS DEFINITION          |
            // ==========================================================
            tourSteps: [
                {
                    element: '#profile-photo',
                    titleKey: 'tour_title_photo',
                    descriptionKey: 'tour_desc_photo',
                    analyticsTag: 'Viewed_Tour_Step_Photo',
                    demoMs: 3100,
                    action: function() { this._openModal(); setTimeout(() => this._closeModal(), 2500); }
                },
                {
                    element: '#page-header-controls .no-print',
                    titleKey: 'tour_title_controls',
                    descriptionKey: 'tour_desc_controls',
                    analyticsTag: 'Viewed_Tour_Step_Controls',
                    demoMs: 9800,
                    action: function() {
                        if (window.innerWidth < 768) {
                            // On mobile, scroll down to show the sticky header clearly
                            window.scrollTo({ top: 100, behavior: 'smooth' });
                        }
                        setTimeout(() => {
                            const controls = [
                                { selector: '#theme-toggle', action: () => this._toggleTheme() },
                                { selector: '#social-share-selector', dropdown: '#social-share-options' },
                                { selector: '#export-selector', dropdown: '#export-options' },
                                { selector: '#print-btn' }
                            ];
                            let delay = 0;
                            controls.forEach(control => {
                                setTimeout(() => {
                                    const el = document.querySelector(control.selector);
                                    if (!el) return;
                                    this._applyClickEffect(el);
                                    if (control.action) {
                                        control.action.call(this);
                                        setTimeout(() => control.action.call(this), 1000); // Toggle back
                                    }
                                    if (control.dropdown) {
                                        el.classList.remove('collapsed');
                                        const dropdownEl = document.querySelector(control.dropdown);
                                        if(dropdownEl) this._glowElement(dropdownEl, 1500);
                                        setTimeout(() => el.classList.add('collapsed'), 1800);
                                    }
                                }, delay);
                                delay += 2200;
                            });
                        }, window.innerWidth < 768 ? 600 : 0);
                    }
                },
                {
                    element: function() { return window.innerWidth < 768 ? '#language-selector-mobile' : '#language-selector'; },
                    titleKey: 'tour_title_language',
                    descriptionKey: 'tour_desc_language',
                    analyticsTag: 'Viewed_Tour_Step_Language',
                    demoMs: 5000,
                    action: function() { this._demoLanguageTour(); }
                },
                {
                    element: function() { return window.innerWidth < 768 ? '#sim-launch-btn-mobile' : '#sim-launch-btn'; },
                    titleKey: 'tour_title_simulator',
                    descriptionKey: 'tour_desc_simulator',
                    analyticsTag: 'Viewed_Tour_Step_Simulator',
                    demoMs: 2600,
                    action: function() { this._demoSimulatorTour(); }
                },
                {
                    element: function() { return window.innerWidth < 768 ? '#qa-lab-btn-mobile' : '#qa-lab-btn'; },
                    titleKey: 'tour_title_qa_lab',
                    descriptionKey: 'tour_desc_qa_lab',
                    analyticsTag: 'Viewed_Tour_Step_QaLab',
                    demoMs: 3200,
                    action: function() { this._demoQaLabTour(); }
                },
                {
                    element: 'section[aria-labelledby="summary-heading"]',
                    titleKey: 'tour_title_summary',
                    descriptionKey: 'tour_desc_summary',
                    analyticsTag: 'Viewed_Tour_Step_Summary',
                    demoMs: 4200,
                    action: function() {
                        if (window.innerWidth < 768) {
                            // On mobile, ensure the element is visible above the tooltip
                            document.querySelector('section[aria-labelledby="summary-heading"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        setTimeout(() => {
                            this._applyClickEffect(this.DOMElements.readMoreBtn);
                            this.DOMElements.readMoreBtn.click();
                            setTimeout(() => this.DOMElements.readMoreBtn.click(), 3000);
                        }, window.innerWidth < 768 ? 600 : 0);
                    }
                },
                {
                    element: '.infographics-section',
                    titleKey: 'tour_title_glance',
                    descriptionKey: 'tour_desc_glance',
                    analyticsTag: 'Viewed_Tour_Step_Glance',
                    demoMs: 10800,
                    action: function() { this._demoGlanceTour(); }
                },
                {
                    element: '#competencies-list',
                    titleKey: 'tour_title_competencies',
                    descriptionKey: 'tour_desc_competencies',
                    analyticsTag: 'Viewed_Tour_Step_Competencies',
                    demoMs: 7200,
                    action: function() {
                        const btn = document.querySelector('.competency-item[data-competency="pm"]');
                        if (!btn) return;
                        this._applyClickEffect(btn);
                        this._applyCompetencyFocus('pm');
                        const match = document.querySelector('.experience-item.filter-match, .experience-item.topic-match');
                        setTimeout(() => {
                            if (match) {
                                match.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                this._glowElement(match, 1800);
                            }
                        }, 700);
                        setTimeout(() => this._resetFilters({ silent: true }), 5400);
                    }
                },
                {
                    element: '#toolkit-container',
                    titleKey: 'tour_title_toolkit',
                    descriptionKey: 'tour_desc_toolkit',
                    analyticsTag: 'Viewed_Tour_Step_Toolkit',
                    demoMs: 10500,
                    action: function() {
                        const allSkills = Array.from(this.DOMElements.toolkitContainer.querySelectorAll('.tech-tag'));
                        const skillCount = Math.random() < 0.5 ? 1 : 2;
                        const skillsToClick = allSkills.sort(() => 0.5 - Math.random()).slice(0, skillCount);

                        skillsToClick.forEach((skillEl, index) => {
                            setTimeout(() => {
                                const header = skillEl.closest('.toolkit-section').querySelector('.toolkit-header');
                                if (header.getAttribute('aria-expanded') === 'false') header.click();
                                setTimeout(() => {
                                    this._applyClickEffect(skillEl);
                                    skillEl.click();
                                }, 500);
                            }, index * 1000);
                        });

                        let delay = (skillCount * 1000) + 500;
                        // Scroll to timeline, wait, then glow
                        setTimeout(() => {
                            this.DOMElements.timelineContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => this._glowElement(this.DOMElements.timelineContainer, 2000), 800);
                        }, delay);
                        delay += 3000;
                        // Scroll to experience, wait, then glow
                        setTimeout(() => {
                            this.DOMElements.experienceContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => this._glowElement(this.DOMElements.experienceContainer, 2000), 800);
                        }, delay);
                        delay += 3000;
                        // Reset filters
                        setTimeout(() => {
                            this._applyClickEffect(this.DOMElements.resetFilterBtn);
                            this.DOMElements.resetFilterBtn.click();
                        }, delay);
                    }
                },
                {
                    element: '#experience-container',
                    titleKey: 'tour_title_experience',
                    descriptionKey: 'tour_desc_experience',
                    analyticsTag: 'Viewed_Tour_Step_Experience',
                    demoMs: 4800,
                    action: function() {
                        const headers = this.DOMElements.experienceContainer.querySelectorAll('.accordion-header');
                        if (headers.length > 0) {
                            const randomIndex = Math.floor(Math.random() * headers.length);
                            const randomHeader = headers[randomIndex];
                            randomHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                                this._glowElement(randomHeader.closest('.experience-item'), 1500);
                                this._applyClickEffect(randomHeader, 800);
                                randomHeader.click();
                            }, 800);
                            setTimeout(() => randomHeader.click(), 4000);
                        }
                    }
                },
                {
                    element: 'section[aria-labelledby="education-heading"]',
                    titleKey: 'tour_title_education',
                    descriptionKey: 'tour_desc_education',
                    analyticsTag: 'Viewed_Tour_Step_Education',
                    demoMs: 2500,
                    action: function() {
                        const el = document.querySelector('section[aria-labelledby="education-heading"]');
                        if(el) this._glowElement(el, 2000);
                    }
                },
                {
                    element: 'section[aria-labelledby="contact-heading"]',
                    titleKey: 'tour_title_sidebar',
                    descriptionKey: 'tour_desc_sidebar',
                    analyticsTag: 'Viewed_Tour_Step_Sidebar',
                    demoMs: 4000,
                    action: function() {
                        const contactLinks = ['#contact-phone', '#contact-email', '#contact-linkedin', '#contact-whatsapp', '#contact-telegram'];
                        contactLinks.forEach((selector, index) => {
                            setTimeout(() => {
                                const el = document.querySelector(selector);
                                if (el) this._glowElement(el, 800);
                            }, index * 600);
                        });
                    }
                },
                {
                    element: '#contact-widget-fab',
                    titleKey: 'tour_title_widget',
                    descriptionKey: 'tour_desc_widget',
                    analyticsTag: 'Viewed_Tour_Step_Widget',
                    demoMs: 18000,
                    action: function() {
                        if (window.innerWidth < 768) this._setTourTooltipTransparency(true);
                        this._openContactWidget();

                        setTimeout(() => { // Demo Message Tab
                            this._switchTab('message');
                            this._typewriterEffect(this.DOMElements.senderName, "John Doe", () => {
                                this._typewriterEffect(this.DOMElements.senderEmail, "john.doe@example.com", () => {
                                    this.DOMElements.messageTopic.value = this._getRandomTopic();
                                    this._typewriterEffect(this.DOMElements.senderMessage, "This is a great interactive CV!", () => {
                                        this._applyClickEffect(document.getElementById('file-upload-label'));
                                        setTimeout(() => this._glowElement(this.DOMElements.sendMessageBtn, 1500), 500);
                                        setTimeout(() => this._switchTab('rating'), 2500);
                                    });
                                });
                            });
                        }, 1000);
                        setTimeout(() => { // Demo Rating Tab
                            this._typewriterEffect(this.DOMElements.raterName, "Jane Smith", () => {
                                this._typewriterEffect(this.DOMElements.raterEmail, "jane.smith@example.com", () => {
                                    const randomRating = this._getRandomRating();
                                    const starToClick = this.DOMElements.starRatingContainer.querySelector(`.star[data-value="${randomRating}"]`);
                                    if(starToClick) this._handleStarClick(starToClick);
                                    this._typewriterEffect(this.DOMElements.raterComment, this._getRandomComment(), () => {
                                        this._glowElement(this.DOMElements.sendRatingBtn, 1500);
                                        setTimeout(() => {
                                            if (window.innerWidth < 768) this._setTourTooltipTransparency(false);
                                            this._closeContactWidget();
                                        }, 2000);
                                    });
                                });
                            });
                        }, 8000);
                    }
                },
                {
                    element: '#testimonials-section',
                    titleKey: 'tour_title_testimonials',
                    descriptionKey: 'tour_desc_testimonials',
                    analyticsTag: 'Viewed_Tour_Step_Testimonials',
                    demoMs: 3000,
                    action: function() {
                        if (window.innerWidth < 768) this._setTourTooltipTransparency(true);
                        const firstCard = this.DOMElements.testimonialsContainer.querySelector('.testimonial-card');
                        if (firstCard) this._glowElement(firstCard, 2500);
                        setTimeout(() => {
                            if (window.innerWidth < 768) this._setTourTooltipTransparency(false);
                        }, 2800);
                    }
                },
                {
                    element: '.cv-footer',
                    titleKey: 'tour_title_finish',
                    descriptionKey: 'tour_desc_finish',
                    analyticsTag: 'Viewed_Tour_Step_Finish',
                    demoMs: 2000,
                    action: function() { this._glowElement(document.querySelector('.cv-footer'), 1500); }
                }
            ],

          /*  const experienceList = document.getElementById('experience-list');
            experienceData.forEach((job, index) => {
                const jobDiv = document.createElement('div');
                // This line adds the unique ID to each job experience container
                jobDiv.id = `experience-item-${index}`;
                jobDiv.className = 'experience-item';

                const timelineDot = document.createElement('div');
                // This line adds the unique ID to each timeline dot
                timelineDot.id = `experience-timeline-dot-${index}`;
                timelineDot.className = 'absolute -left-3.5 mt-1.5 w-6 h-6 bg-blue-500 rounded-full border-4 border-white dark:border-gray-800';

                jobDiv.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${job.title}</h3>
                <p class="text-md font-normal text-gray-600 dark:text-gray-400">${job.company}</p>
                <p class="text-sm font-normal text-gray-500 dark:text-gray-300">${job.dates}</p>
                <p class="mt-2 text-base text-gray-700 dark:text-gray-300">${job.description}</p>
            };

                jobDiv.prepend(timelineDot);
                experienceList.appendChild(jobDiv);
            });*/

            /*init() {
                this._cacheDOMElements();
                this._handleStickyHeader();
                this._loadBlocklist(); // **NEW**: Load the blocklist on init
                this._applyUrlLanguage();
                this._applyInitialTheme();
                this._createWatermark();
                this._populateAllTranslations();
                this._renderAll();
                this._setupEventListeners();
                this.translatePage(this.state.lang);
                this._initScrollAnimations();
                this._initUrlHighlighting();
                this._initContactWidget();
                //this._handleStickyHeader();
                this._initScrollTrigger();
                try {
                    this._loadAndRenderReviews(); // Load testimonials
                } catch (error) {
                    console.error("Failed to load testimonials:", error);
                }
                if (!sessionStorage.getItem('hasSeenTour')) {
                    // Use a short delay to ensure the page has rendered.
                    setTimeout(() => {
                        this.startTour(true); // true indicates it's an auto-start
                    }, 1000); // 1-second delay
                }

            },*/

            _cacheDOMElements() {
                this.DOMElements = {
                    body: document.body, experienceContainer: document.getElementById('experience-container'), toolkitContainer: document.getElementById('toolkit-container'),
                    languageSelector: document.getElementById('language-selector'), summaryDetails: document.getElementById('summary-details'), readMoreBtn: document.getElementById('read-more-btn'),
                    printBtn: document.getElementById('print-btn'), resetFilterBtn: document.getElementById('reset-filter'), expandAllExpBtn: document.getElementById('expand-all-exp'),
                    expandAllToolkitBtn: document.getElementById('expand-all-toolkit'), competenciesRadarChart: document.getElementById('competencies-radar-chart'),
                    methodologiesRadarChart: document.getElementById('methodologies-radar-chart'), timelineContainer: document.getElementById('timeline-container'),
                    glanceKpis: document.getElementById('glance-kpis'), chartPauseBtn: document.getElementById('chart-pause-btn'), chartDots: document.getElementById('chart-a-dots'),
                    chartAHeading: document.getElementById('chart-a-heading'), chartBHeading: document.getElementById('chart-b-heading'),
                    profilePhoto: document.getElementById('profile-photo'), imageModal: document.getElementById('image-modal'), modalImage: document.getElementById('modal-image'),
                    modalClose: document.querySelector('.modal-close'), filterStatus: document.getElementById('filter-status'), themeToggle: document.getElementById('theme-toggle'),
                    mainContent: document.querySelector('.main-content'),
                    socialShareSelector: document.getElementById('social-share-selector'),
                    socialShareOptions: document.getElementById('social-share-options'),
                    exportSelector: document.getElementById('export-selector'),
                    exportOptions: document.getElementById('export-options'),

                    // Widget and Form Elements
                    contactWidgetFab: document.getElementById('contact-widget-fab'),
                    contactWidget: document.getElementById('contact-widget'),
                    widgetCloseBtn: document.getElementById('widget-close-btn'),
                    messageTab: document.getElementById('message-tab'),
                    ratingTab: document.getElementById('rating-tab'),
                    messagePane: document.getElementById('message-pane'),
                    ratingPane: document.getElementById('rating-pane'),

                    messageForm: document.getElementById('message-form'),
                    senderName: document.getElementById('sender-name'),
                    senderEmail: document.getElementById('sender-email'),
                    messageTopic: document.getElementById('message-topic'),
                    senderMessage: document.getElementById('sender-message'),
                    fileUpload: document.getElementById('file-upload'),
                    fileUploadStatus: document.getElementById('file-upload-status'),
                    sendMessageBtn: document.getElementById('send-message-btn'),

                    ratingForm: document.getElementById('rating-form'),
                    starRatingContainer: document.getElementById('star-rating'),
                    ratingValue: document.getElementById('rating-value'),
                    raterName: document.getElementById('rater-name'),
                    raterEmail: document.getElementById('rater-email'),
                    raterComment: document.getElementById('rater-comment'),
                    sendRatingBtn: document.getElementById('send-rating-btn'),

                    widgetStatusContainer: document.getElementById('widget-status-container'),
                    widgetStatusContent: document.getElementById('widget-status-content'),
                    widgetStatusCloseBtn: document.getElementById('widget-status-close-btn'),

                    // **NEW**: Testimonials container
                    testimonialsContainer: document.getElementById('testimonials-container'),
                    // **NEW**: Cache the average rating element
                    averageRating: document.getElementById('average-rating'),

                    // --- NEW DOM ELEMENTS ---
                    tourStartBtn: document.getElementById('tour-start-btn'),
                    tourOverlay: document.getElementById('tour-overlay'),
                    tourTooltip: document.getElementById('tour-tooltip'),
                    tourTitle: document.getElementById('tour-title'),
                    tourDescription: document.getElementById('tour-description'),
                    tourStepCounter: document.getElementById('tour-step-counter'),
                    tourNextBtn: document.getElementById('tour-next-btn'),
                    tourBackBtn: document.getElementById('tour-back-btn'),
                    tourCloseBtn: document.getElementById('tour-close-btn'),
                    tourProgress: document.getElementById('tour-progress'),
                    tourProgressFill: document.getElementById('tour-progress-fill'),

                };
            },

            _updateMetaTags(lang) {
                const translation = this.data.translations[lang];
                const locales = { en: 'en_US', es: 'es_CO', pt: 'pt_BR', de: 'de_DE', fr: 'fr_FR', it: 'it_IT' };
                const title = (translation && translation.page_title) || document.title;
                const description = (translation && translation.meta_description) || '';
                const canonicalUrl = `https://kaanmuar.github.io/${lang && lang !== 'en' ? '?lang=' + encodeURIComponent(lang) : ''}`;

                document.documentElement.lang = lang || 'en';
                if (translation && translation.page_title) document.title = translation.page_title;

                const metaDescription = document.querySelector('meta[name="description"]');
                if (metaDescription && description) metaDescription.setAttribute('content', description);

                const canonical = document.querySelector('link[rel="canonical"]');
                if (canonical) canonical.setAttribute('href', canonicalUrl);

                const setMeta = (selector, attr, value) => {
                    const el = document.querySelector(selector);
                    if (el && value) el.setAttribute(attr, value);
                };
                setMeta('meta[property="og:title"]', 'content', title);
                setMeta('meta[property="og:description"]', 'content', description);
                setMeta('meta[property="og:url"]', 'content', canonicalUrl);
                setMeta('meta[property="og:locale"]', 'content', locales[lang] || 'en_US');
                setMeta('meta[name="twitter:title"]', 'content', title);
                setMeta('meta[name="twitter:description"]', 'content', description);
            },

            _updateStructuredData(lang) {
                const translation = this.data.translations[lang];
                if (!translation) return;

                const structuredDataElement = document.getElementById('person-structured-data');
                if (!structuredDataElement) return;

                try {
                    // Parse the existing data from the script tag
                    const data = JSON.parse(structuredDataElement.textContent);

                    // Update the fields with translated content if it exists
                    if (translation.json_job_title) {
                        data.jobTitle = translation.json_job_title;
                    }
                    if (translation.json_description) {
                        data.description = translation.json_description;
                    }

                    // Re-serialize the JSON and put it back into the script tag
                    // The '2' argument formats it nicely with indentation
                    structuredDataElement.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    console.error("Error updating JSON-LD structured data:", error);
                }
            },

            _forceShowAllContent() {
                // This function bypasses the scroll animation to ensure content is always visible.
                document.querySelectorAll('.animate-on-scroll').forEach(el => {
                    el.classList.add('is-visible');
                });
            },

            _noteCvAccess() {
                try {
                    if (window.top !== window.self || navigator.webdriver) return;
                    if (sessionStorage.getItem('cv-access-noted') === '1') return;
                    sessionStorage.setItem('cv-access-noted', '1');
                } catch (e) {
                    return;
                }
                let referrerHost = '';
                try {
                    referrerHost = document.referrer ? new URL(document.referrer).host : '';
                } catch (e) { /* ignore */ }
                addDoc(collection(db, 'visits'), {
                    source: 'cv',
                    lang: String(document.documentElement.lang || 'en').slice(0, 12),
                    referrerHost: referrerHost.slice(0, 80),
                    createdAt: serverTimestamp()
                }).catch((error) => {
                    console.warn('CV access note was not saved:', error && error.code ? error.code : error);
                });
            },

            /**
             * Fetches the blocklist from Firestore and stores it in the state.
             */
            async _loadBlocklist() {
                try {
                    const querySnapshot = await getDocs(collection(db, "blocked_senders"));
                    const blockedEmails = new Set();
                    querySnapshot.forEach(doc => {
                        blockedEmails.add(doc.id.toLowerCase());
                    });
                    this.state.blockList = blockedEmails;
                    console.log("Blocklist loaded successfully.");
                } catch (error) {
                    console.error("Error loading blocklist: ", error);
                }
            },


            _createWatermark() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 300; canvas.height = 150;
                ctx.translate(150, 75); ctx.rotate(-0.4);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.font = '16px Inter';
                ctx.textAlign = 'center'; ctx.fillText('Carlos A. Muñoz - ' + this._s('print_confidential', 'Confidential'), 0, 0);
                this.DOMElements.body.style.setProperty('--watermark-url', `url(${canvas.toDataURL()})`);
            },

            _renderAll() {
                this._renderToolkit();
                this._renderExperiences();
                this._renderInfographics();
            },

            _renderToolkit() {
                const toolkitOrder = ['pm', 'qa', 'lang', 'cloud', 'db', 'analytics', 'platform', 'system'];
                const container = this.DOMElements.toolkitContainer;
                container.innerHTML = '';
                toolkitOrder.forEach(key => {
                    if (!this.data.skills[key]) return;
                    const section = document.createElement('div');
                    section.className = 'toolkit-section animate-on-scroll';
                    const bodyId = `${key}-skills-body`;
                    section.innerHTML = `
                        <div class="flex justify-between items-center p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                            <button class="w-full text-left toolkit-header" aria-expanded="false" aria-controls="${bodyId}">
                                <h3 class="text-base font-semibold" data-translate-key="toolkit_${key}"></h3>
                            </button>
                             <svg class="accordion-icon w-5 h-5 transform transition-transform text-gray-500" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                        <div class="toolkit-preview">${this.data.skills[key].slice(0, 4).map(s => s.name).join(' &middot; ')}</div>
                        <div class="mt-2 flex flex-wrap toolkit-body" id="${bodyId}">
                            ${this.data.skills[key].map(this._createSkillTag).join('')}
                        </div>
                    `;
                    container.appendChild(section);
                });
            },

            _renderExperiences() {
                this.DOMElements.experienceContainer.innerHTML = this.data.experiences.map((exp, i) => this._createExperienceEntry(exp, i)).join('');
            },

            _renderInfographics() {
                this._renderGlanceKpis();
                this._bindGlanceRotator();
                this._showGlancePair(this.state.chartIndex, false);
                this._createTimeline();
            },

            _createSkillTag(skill) {
                const starIcon = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
                return `
                    <div role="button" tabindex="0" class="tech-tag" data-skill-name="${skill.name}" aria-pressed="false">
                        <img src="${skill.icon}" class="tech-icon" alt="" onerror="this.style.display='none';">
                        <span>${skill.name}</span>
                        <div class="stars" aria-label="${skill.stars} out of 5 stars. ${skill.years} experience.">
                            <span class="mr-2 text-xs text-gray-500">${skill.years}</span>
                            ${starIcon.repeat(skill.stars)}
                            <span class="font-semibold" style="width: ${(5 - skill.stars) * 0.8}rem;"></span>
                        </div>
                    </div>
                `;
            },

            _createExperienceEntry(exp, index) {
                const bodyId = `experience-body-${index}`;
                const headerId = `experience-header-${index}`;
                const detailsHtml = exp.details.en.map((detail, i) => `<li data-translate-key="exp_${index}_detail_${i}">${detail}</li>`).join('');
                const techTagsHtml = exp.techUsed.map(techName => {
                    const skill = Object.values(this.data.skills).flat().find(s => s.name === techName);
                    if (!skill) return '';
                    return `<div class="exp-tech-tag"><img src="${skill.icon}" alt="" onerror="this.style.display='none';"><span>${skill.name}</span></div>`;
                }).join('');
                return `
                    <div class="experience-item text-sm py-2 animate-on-scroll" data-tech='${JSON.stringify(exp.techUsed)}' id="experience-${index}">
                        <div class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                            <button class="accordion-header w-full flex justify-between items-center" id="${headerId}" aria-expanded="false" aria-controls="${bodyId}">
                                <div class="flex-grow text-left">
                                    <h4 class="text-base font-bold" data-translate-key="exp_${index}_title">${typeof exp.title === 'string' ? exp.title : (exp.title.en || '')}</h4>
                                    <p class="text-sm italic flex items-center"><img src="${exp.logo}" class="company-logo" alt="${exp.company} Logo" onerror="this.style.display='none'">${exp.company}</p>
                                </div>
                                <p class="text-xs mr-4" data-raw-date="${exp.dates}">${exp.dates}</p>
                                <svg class="accordion-icon w-5 h-5 transform transition-transform" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                        </div>
                        <p class="experience-summary" data-translate-key="exp_${index}_summary">${exp.details.en[0].substring(0, 100)}...</p>
                        <div class="experience-body mt-2" id="${bodyId}" role="region" aria-labelledby="${headerId}">
                            <ul class="list-disc list-inside space-y-1 pl-4">${detailsHtml}</ul>
                            <div class="experience-tech-tags">${techTagsHtml}</div>
                        </div>
                    </div>
                `;
            },

            _parseSkillYears(value) {
                const n = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
                return Number.isFinite(n) ? n : 0;
            },

            _chartPalette() {
                const dark = document.documentElement.classList.contains('dark-mode');
                return {
                    fillA: dark ? 'rgba(77, 179, 187, 0.32)' : 'rgba(13, 110, 118, 0.32)',
                    strokeA: dark ? 'rgb(77, 179, 187)' : 'rgb(13, 110, 118)',
                    fillB: dark ? 'rgba(197, 205, 212, 0.14)' : 'rgba(26, 36, 48, 0.16)',
                    strokeB: dark ? 'rgb(165, 184, 190)' : 'rgb(58, 90, 98)',
                    ink: dark ? '#e8eef2' : '#12181f',
                    muted: dark ? '#9aa5b1' : '#4a5560',
                    track: dark ? '#2a3440' : '#d5dce3',
                    slices: dark
                        ? ['#4db3bb', '#8fd0d5', '#7aa8ad', '#c4a574', '#5fb89a', '#9aa5b1', '#e07a73']
                        : ['#0d6e76', '#3d7a82', '#08545b', '#b45309', '#0f766e', '#4a5560', '#b42318']
                };
            },

            _flatSkills() {
                return Object.values(this.data.skills).flat();
            },

            _glanceCatalog() {
                const t = (key, fallback) => this._s(key, fallback);
                return [
                    { id: 'competencies', titleKey: 'infographics_competencies_title', kind: 'radar-comp' },
                    { id: 'methodologies', titleKey: 'infographics_methodologies_title', kind: 'radar-meth' },
                    { id: 'mix', titleKey: 'infographics_mix_title', kind: 'donut-mix' },
                    { id: 'depth', titleKey: 'infographics_depth_title', kind: 'bars-depth' },
                    { id: 'stack', titleKey: 'infographics_stack_title', kind: 'bars-stack' },
                    { id: 'langs', titleKey: 'infographics_langs_title', kind: 'bars-langs' }
                ].map((slide) => ({ ...slide, title: t(slide.titleKey, slide.id) }));
            },

            _renderGlanceKpis() {
                const el = this.DOMElements.glanceKpis;
                if (!el) return;
                const skills = this._flatSkills();
                const companies = new Set(this.data.experiences.map((exp) => exp.company)).size;
                const items = [
                    { value: '18+', key: 'infographics_kpi_years', label: 'Years' },
                    { value: String(this.data.experiences.length), key: 'infographics_kpi_roles', label: 'Roles' },
                    { value: String(skills.length), key: 'infographics_kpi_skills', label: 'Skills' },
                    { value: String(companies), key: 'infographics_kpi_companies', label: 'Companies' },
                    { value: '9', key: 'infographics_kpi_certs', label: 'Certs' }
                ];
                el.innerHTML = items.map((item) => `
                    <div class="glance-kpi">
                        <strong>${item.value}</strong>
                        <span data-translate-key="${item.key}">${this._s(item.key, item.label)}</span>
                    </div>
                `).join('');
            },

            _renderBarChart(container, rows) {
                if (!container) return;
                const palette = this._chartPalette();
                const max = Math.max(...rows.map((row) => row.value), 1);
                const barH = 22;
                const gap = 10;
                const left = 108;
                const width = 288;
                const height = rows.length * (barH + gap) + 8;
                const bars = rows.map((row, i) => {
                    const y = 8 + i * (barH + gap);
                    const w = Math.max(6, (row.value / max) * (width - left - 36));
                    const label = row.label.length > 15 ? `${row.label.slice(0, 14)}…` : row.label;
                    return `
                        <text x="0" y="${y + 15}" font-size="10" fill="${palette.muted}">${label}</text>
                        <rect x="${left}" y="${y}" width="${width - left - 8}" height="${barH}" rx="4" fill="${palette.track}"></rect>
                        <rect x="${left}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${palette.strokeA}">
                            <animate attributeName="width" from="0" to="${w}" dur="0.55s" fill="freeze" />
                        </rect>
                        <text x="${left + w + 6}" y="${y + 15}" font-size="10" fill="${palette.ink}">${row.display || row.value}</text>
                    `;
                }).join('');
                container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="presentation">${bars}</svg>`;
            },

            _renderDonutChart(container, slices) {
                if (!container) return;
                const palette = this._chartPalette();
                const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
                const cx = 144, cy = 110, r = 62, stroke = 22;
                const c = 2 * Math.PI * r;
                let offset = 0;
                const arcs = slices.map((slice, i) => {
                    const len = (slice.value / total) * c;
                    const color = palette.slices[i % palette.slices.length];
                    const dash = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
                    offset += len;
                    return dash;
                }).join('');
                const legend = slices.map((slice, i) => {
                    const color = palette.slices[i % palette.slices.length];
                    return `<span><i style="background:${color}"></i>${slice.label} ${slice.value}</span>`;
                }).join('');
                container.innerHTML = `
                    <svg viewBox="0 0 288 216" role="presentation">
                        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette.track}" stroke-width="${stroke}"></circle>
                        ${arcs}
                        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="600" fill="${palette.ink}">${total}</text>
                        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="${palette.muted}">${this._s('infographics_kpi_skills', 'Skills')}</text>
                    </svg>
                    <div class="chart-legend">${legend}</div>
                `;
            },

            _paintGlanceSlide(container, slide) {
                if (!container || !slide) return;
                const palette = this._chartPalette();
                const skills = this.data.skills;
                if (slide.kind === 'radar-comp') {
                    this._generateSingleDatasetRadar(container, [
                        { label: 'Project Mgmt', score: 0.95 }, { label: 'QA & Automation', score: 0.95 },
                        { label: 'Leadership', score: 0.90 }, { label: 'DevOps Strategy', score: 0.85 },
                        { label: 'Cloud Platforms', score: 0.88 }, { label: 'Stakeholder Mgmt', score: 0.92 }
                    ], palette.fillA, palette.strokeA);
                    return;
                }
                if (slide.kind === 'radar-meth') {
                    this._generateSingleDatasetRadar(container, [
                        { label: 'Agile', score: 0.95 }, { label: 'Scrum', score: 0.95 }, { label: 'Kanban', score: 0.90 },
                        { label: 'CMMI', score: 0.75 }, { label: 'ISO Standards', score: 0.85 }, { label: 'Risk Mgmt', score: 0.90 }
                    ], palette.fillB, palette.strokeB);
                    return;
                }
                if (slide.kind === 'donut-mix') {
                    const order = [
                        ['pm', 'infographics_cat_pm', 'Project Mgmt'],
                        ['qa', 'infographics_cat_qa', 'QA & Automation'],
                        ['lang', 'infographics_cat_lang', 'Languages'],
                        ['cloud', 'infographics_cat_cloud', 'Cloud & DevOps'],
                        ['analytics', 'infographics_cat_analytics', 'Analytics'],
                        ['platform', 'infographics_cat_platform', 'Platforms'],
                        ['system', 'infographics_cat_system', 'Systems']
                    ];
                    this._renderDonutChart(container, order.map(([id, key, fallback]) => ({
                        label: this._s(key, fallback),
                        value: (skills[id] || []).length
                    })).filter((slice) => slice.value > 0));
                    return;
                }
                if (slide.kind === 'bars-depth') {
                    const rows = [
                        ['pm', 'infographics_cat_pm', 'Project Mgmt'],
                        ['qa', 'infographics_cat_qa', 'QA & Automation'],
                        ['lang', 'infographics_cat_lang', 'Languages'],
                        ['cloud', 'infographics_cat_cloud', 'Cloud & DevOps'],
                        ['analytics', 'infographics_cat_analytics', 'Analytics'],
                        ['platform', 'infographics_cat_platform', 'Platforms']
                    ].map(([id, key, fallback]) => {
                        const years = Math.max(...(skills[id] || []).map((skill) => this._parseSkillYears(skill.years)), 0);
                        return { label: this._s(key, fallback), value: years, display: `${years}+` };
                    });
                    this._renderBarChart(container, rows);
                    return;
                }
                if (slide.kind === 'bars-stack') {
                    const rows = (skills.qa || [])
                        .map((skill) => ({ label: skill.name, value: this._parseSkillYears(skill.years), display: skill.years.replace(' Yrs', '') }))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 7);
                    this._renderBarChart(container, rows);
                    return;
                }
                const langRows = [
                    { key: 'lang_name_es', fallback: 'Spanish', value: 100 },
                    { key: 'lang_name_en', fallback: 'English', value: 90 },
                    { key: 'lang_name_pt', fallback: 'Portuguese', value: 85 },
                    { key: 'lang_others', fallback: 'Others', value: 30 }
                ].map((row) => ({ label: this._s(row.key, row.fallback), value: row.value, display: `${row.value}%` }));
                this._renderBarChart(container, langRows);
            },

            _showGlancePair(index, animate) {
                const catalog = this._glanceCatalog();
                if (!catalog.length) return;
                const primary = ((index % catalog.length) + catalog.length) % catalog.length;
                const secondary = (primary + Math.floor(catalog.length / 2)) % catalog.length;
                this.state.chartIndex = primary;
                const paint = () => {
                    this._paintGlanceSlide(this.DOMElements.competenciesRadarChart, catalog[primary]);
                    this._paintGlanceSlide(this.DOMElements.methodologiesRadarChart, catalog[secondary]);
                    if (this.DOMElements.chartAHeading) {
                        this.DOMElements.chartAHeading.setAttribute('data-translate-key', catalog[primary].titleKey);
                        this.DOMElements.chartAHeading.textContent = catalog[primary].title;
                    }
                    if (this.DOMElements.chartBHeading) {
                        this.DOMElements.chartBHeading.setAttribute('data-translate-key', catalog[secondary].titleKey);
                        this.DOMElements.chartBHeading.textContent = catalog[secondary].title;
                    }
                    if (this.DOMElements.chartDots) {
                        this.DOMElements.chartDots.querySelectorAll('.chart-dot').forEach((dot, i) => {
                            dot.classList.toggle('is-active', i === primary);
                            dot.setAttribute('aria-current', i === primary ? 'true' : 'false');
                        });
                    }
                    const a = this.DOMElements.competenciesRadarChart;
                    const b = this.DOMElements.methodologiesRadarChart;
                    if (a) a.setAttribute('aria-label', catalog[primary].title);
                    if (b) b.setAttribute('aria-label', catalog[secondary].title);
                    this._attachRadarLabelListeners();
                };
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (!animate || reduced) {
                    paint();
                    return;
                }
                const stages = [this.DOMElements.competenciesRadarChart, this.DOMElements.methodologiesRadarChart];
                stages.forEach((stage) => stage && stage.classList.add('is-exiting'));
                window.setTimeout(() => {
                    paint();
                    stages.forEach((stage) => stage && stage.classList.remove('is-exiting'));
                }, 420);
            },

            _advanceGlanceCharts() {
                if (this.state.chartPaused || this.state.chartHover || this.state.chartOffscreen || this.state.isTourActive) return;
                this._showGlancePair(this.state.chartIndex + 1, true);
            },

            _bindGlanceRotator() {
                const catalog = this._glanceCatalog();
                if (this.DOMElements.chartDots && !this.DOMElements.chartDots.childElementCount) {
                    this.DOMElements.chartDots.innerHTML = catalog.map((slide, i) => (
                        `<button type="button" class="chart-dot${i === this.state.chartIndex ? ' is-active' : ''}" data-index="${i}" aria-label="${slide.title}"></button>`
                    )).join('');
                    this.DOMElements.chartDots.addEventListener('click', (event) => {
                        const btn = event.target.closest('.chart-dot');
                        if (!btn) return;
                        this._showGlancePair(Number(btn.dataset.index), true);
                        this._trackEvent('glance_chart_select', 'Infographics', catalog[Number(btn.dataset.index)].id);
                    });
                }
                if (this.state.chartBound) return;
                this.state.chartBound = true;
                const pauseBtn = this.DOMElements.chartPauseBtn;
                const section = document.querySelector('.infographics-section');
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const setPaused = (paused) => {
                    this.state.chartPaused = paused;
                    if (pauseBtn) {
                        pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
                        pauseBtn.textContent = paused ? '▶' : '❚❚';
                        pauseBtn.setAttribute('aria-label', this._s(paused ? 'infographics_play' : 'infographics_pause', paused ? 'Play charts' : 'Pause charts'));
                    }
                };
                if (pauseBtn) {
                    pauseBtn.addEventListener('click', () => {
                        setPaused(!this.state.chartPaused);
                        this._trackEvent('glance_chart_pause', 'Infographics', this.state.chartPaused ? 'Paused' : 'Playing');
                    });
                }
                if (section) {
                    section.addEventListener('mouseenter', () => { this.state.chartHover = true; });
                    section.addEventListener('mouseleave', () => { this.state.chartHover = false; });
                }
                if (!reduce) {
                    this.state.chartTimer = window.setInterval(() => this._advanceGlanceCharts(), 7000);
                    if ('IntersectionObserver' in window && section) {
                        const io = new IntersectionObserver((entries) => {
                            this.state.chartOffscreen = !entries.some((entry) => entry.isIntersecting);
                        }, { threshold: 0.25 });
                        io.observe(section);
                    }
                }
            },

            _createRadarCharts() {
                this._showGlancePair(this.state.chartIndex, false);
            },

            _generateSingleDatasetRadar(container, data, fillColor, strokeColor) {
                if (!container) return;
                const size = 288, center = size / 2, radius = size * 0.3;
                const labels = data.map(d => d.label), angleSlice = (Math.PI * 2) / labels.length;
                const isDarkMode = document.documentElement.classList.contains('dark-mode');
                const gridColor = isDarkMode ? '#4b5563' : '#e5e7eb', labelColor = isDarkMode ? '#d1d5db' : '#4b5563';
                let grid = '', labelElements = '', polygon = '', points = '';

                for (let i = 1; i <= 4; i++) {
                    const gridRadius = radius * (i/4);
                    let gridPoints = '';
                    labels.forEach((_, j) => gridPoints += `${center + gridRadius * Math.cos(angleSlice * j - Math.PI / 2)},${center + gridRadius * Math.sin(angleSlice * j - Math.PI / 2)} `);
                    grid += `<polygon points="${gridPoints}" fill="none" stroke="${gridColor}" />`;
                }
                labels.forEach((_, i) => grid += `<line x1="${center}" y1="${center}" x2="${center + radius * Math.cos(angleSlice * i - Math.PI / 2)}" y2="${center + radius * Math.sin(angleSlice * i - Math.PI / 2)}" stroke="${gridColor}" />`);

                labels.forEach((label, i) => {
                    const angle = angleSlice * i - Math.PI / 2, labelX = center + (radius + 35) * Math.cos(angle), labelY = center + (radius + 35) * Math.sin(angle);
                    const words = label.split(' ');
                    // THIS IS THE CORRECTED LINE:
                    const tspans = (words.length > 1 && label !== 'QA & Automation') ? `<tspan x="${labelX}" dy="-0.5em">${words[0]}</tspan><tspan x="${labelX}" dy="1.1em">${words.slice(1).join(' ')}</tspan>` : `<tspan>${label}</tspan>`;
                    const tooltipText = (this.data.radarTooltips[this.state.dictLang] && this.data.radarTooltips[this.state.dictLang][label]) || this.data.radarTooltips.en[label] || label;
                    labelElements += `<g class="radar-label"><title>${tooltipText}</title><text x="${labelX}" y="${labelY}" font-size="10" text-anchor="middle" alignment-baseline="middle" fill="${labelColor}">${tspans}</text></g>`;
                });

                data.forEach((item, i) => points += `${center + radius * item.score * Math.cos(angleSlice * i - Math.PI / 2)},${center + radius * item.score * Math.sin(angleSlice * i - Math.PI / 2)} `);
                polygon = `<polygon points="${points}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" />`;

                container.innerHTML = `<svg viewBox="0 0 ${size} ${size}">${grid}${polygon}${labelElements}</svg>`;

                this._attachRadarLabelListeners();
            },

            _createTimeline() {
                const container = this.DOMElements.timelineContainer;
                if (!container) return;
                let content = '';
                this.data.experiences.forEach((exp, index) => {
                    const techIcons = exp.techUsed.slice(0, 7).map(techName => {
                        const skill = Object.values(this.data.skills).flat().find(s => s.name === techName);
                        return skill ? `<img src="${skill.icon}" alt="${skill.name}" title="${skill.name}" onerror="this.style.display='none'">` : '';
                    }).join('');
                    content += `
                        <div class="timeline-item block p-2 rounded-md" data-tech='${JSON.stringify(exp.techUsed)}' id="timeline-exp-${index}">
                            <div class="tooltip w-full" data-company-name="${exp.company}">
                                <a href="#experience-${index}" class="hover:bg-gray-100 dark:hover:bg-gray-700 block p-1 rounded-md">
                                    <p class="font-bold text-sm" data-translate-key="exp_${index}_title">${typeof exp.title === 'string' ? exp.title : exp.title.en}</p>
                                    <div class="flex items-center gap-2 text-xs"><img src="${exp.logo}" class="company-logo" alt="${exp.company} Logo" onerror="this.style.display='none'"><span>${exp.company}</span><span class="text-gray-400" data-raw-date="${exp.dates}" data-date-prefix="| ">| ${exp.dates}</span></div>
                                    <div class="timeline-tech-icons">${techIcons}</div>
                                </a>
                                <span class="tooltiptext" data-translate-key="tooltip_timeline"></span>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = content;
            },

            _topicIdFromRadar(label) {
                const map = {
                    'Project Mgmt': 'pm',
                    'QA & Automation': 'qa',
                    'Leadership': 'lead',
                    'DevOps Strategy': 'devops',
                    'Cloud Platforms': 'cloud',
                    'Stakeholder Mgmt': 'relations',
                    'Risk Mgmt': 'strategy'
                };
                return map[label] || null;
            },

            _getSkillsForCompetency(competencyLabel) {
                const competencyMap = {
                    'Project Mgmt': ['Agile', 'Kanban', 'Scrum', 'Strategic Planning', 'Risk Management', 'Stakeholder Mgmt', 'Jira', 'TestRail', 'MS Project'],
                    'QA & Automation': ['Selenium', 'Cypress', 'Playwright', 'WebdriverIO', 'Protractor', 'Appium', 'Expresso', 'Robot Framework', 'Cucumber', 'JMeter', 'Katalon'],
                    'Leadership': ['Stakeholder Mgmt', 'Strategic Planning'],
                    'DevOps Strategy': ['Jenkins', 'Docker', 'GitHub', 'AWS', 'Azure DevOps', 'GCP'],
                    'Cloud Platforms': ['AWS', 'Azure DevOps', 'GCP', 'Docker'],
                    'Stakeholder Mgmt': ['Stakeholder Mgmt'],
                    'Agile': ['Agile', 'Scrum', 'Kanban'],
                    'Scrum': ['Scrum', 'Jira'],
                    'Kanban': ['Kanban', 'Trello'],
                    'CMMI': ['CMMI', 'ISO Standards'],
                    'ISO Standards': ['ISO Standards', 'CISA', 'CISM', 'CISSP'],
                    'Risk Mgmt': ['Risk Management', 'Owasp', 'Strategic Planning', 'CMMI', 'ISO Standards']
                };
                return competencyMap[competencyLabel] || [];
            },

            _topicSignatures(topicId) {
                const map = {
                    pm: ['MS Project', 'Strategic Planning', 'Risk Management', 'TestRail', 'Stakeholder Mgmt'],
                    qa: ['Selenium', 'Cypress', 'Playwright', 'WebdriverIO', 'Protractor', 'Appium', 'Expresso', 'Robot Framework', 'Cucumber', 'JMeter', 'Katalon'],
                    lead: ['Stakeholder Mgmt', 'Strategic Planning'],
                    devops: ['Jenkins', 'Docker', 'GitHub', 'AWS', 'Azure DevOps', 'GCP'],
                    cloud: ['AWS', 'Azure DevOps', 'GCP', 'Docker'],
                    strategy: ['Strategic Planning', 'Risk Management', 'CMMI', 'ISO Standards'],
                    relations: ['Stakeholder Mgmt']
                };
                return map[topicId] || this._skillsForTopic(topicId);
            },

            _topicMatchesTech(topicId, tech) {
                return this._topicSignatures(topicId).some((s) => tech.includes(s));
            },

            _skillsForTopic(topicId) {
                const radar = {
                    pm: 'Project Mgmt',
                    qa: 'QA & Automation',
                    lead: 'Leadership',
                    devops: 'DevOps Strategy',
                    cloud: 'Cloud Platforms',
                    strategy: 'Risk Mgmt',
                    relations: 'Stakeholder Mgmt'
                }[topicId];
                return radar ? this._getSkillsForCompetency(radar) : [];
            },

            _applyCompetencyFocus(topicId) {
                const skills = this._skillsForTopic(topicId);
                if (!skills.length) return;
                this._resetFilters({ silent: true });
                this.state.activeTopic = topicId;
                document.documentElement.classList.add('topic-focus');
                const headersToExpand = new Set();
                document.querySelectorAll('.tech-tag').forEach((tag) => {
                    if (skills.includes(tag.dataset.skillName)) {
                        tag.classList.add('selected');
                        tag.setAttribute('aria-pressed', 'true');
                        this.state.selectedSkills.add(tag.dataset.skillName);
                        const header = tag.closest('.toolkit-section')?.querySelector('.toolkit-header');
                        if (header && header.getAttribute('aria-expanded') === 'false') headersToExpand.add(header);
                    }
                });
                headersToExpand.forEach((header) => this._handleAccordionToggle(header));
                document.querySelectorAll('.competency-item').forEach((btn) => {
                    btn.setAttribute('aria-pressed', btn.dataset.competency === topicId ? 'true' : 'false');
                });
                this._filterExperiencesAndTimeline();
                this._paintTopicClasses();
                const label = document.querySelector(`.competency-item[data-competency="${topicId}"]`);
                const name = label ? label.textContent.trim() : topicId;
                const status = (this._s('competency_focus_status', 'Focusing %TOPIC%. Click anywhere else to restore.')).replace('%TOPIC%', name);
                if (this.DOMElements.filterStatus) this.DOMElements.filterStatus.textContent = status;
                this._trackEvent('competency_filter', 'Competencies', topicId);
            },

            _clearTopicClasses() {
                document.querySelectorAll('.topic-match, .topic-dim').forEach((el) => el.classList.remove('topic-match', 'topic-dim'));
                document.querySelectorAll('.competency-item').forEach((btn) => btn.setAttribute('aria-pressed', 'false'));
                document.documentElement.classList.remove('topic-focus');
            },

            _paintTopicClasses() {
                const topicId = this.state.activeTopic;
                this._clearTopicClasses();
                if (!topicId) return;
                document.documentElement.classList.add('topic-focus');
                const skills = new Set(this._skillsForTopic(topicId));
                const radarName = {
                    pm: 'Project Mgmt', qa: 'QA & Automation', lead: 'Leadership',
                    devops: 'DevOps Strategy', cloud: 'Cloud Platforms',
                    strategy: 'Risk Mgmt', relations: 'Stakeholder Mgmt'
                }[topicId];
                const mark = (el, match) => { if (el) el.classList.add(match ? 'topic-match' : 'topic-dim'); };

                document.querySelectorAll('.competency-item').forEach((btn) => {
                    const on = btn.dataset.competency === topicId;
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    mark(btn, on);
                });
                document.querySelectorAll('g.radar-label').forEach((label) => {
                    const text = (label.querySelector('text')?.textContent || '').replace(/\s+/g, ' ').trim();
                    mark(label, text === radarName);
                });
                document.querySelectorAll('.tech-tag').forEach((tag) => mark(tag, skills.has(tag.dataset.skillName)));
                document.querySelectorAll('.toolkit-section').forEach((section) => {
                    mark(section, !!section.querySelector('.tech-tag.selected, .tech-tag.topic-match'));
                });
                document.querySelectorAll('#experience-container .experience-item').forEach((item) => {
                    mark(item, item.classList.contains('filter-match'));
                });
                document.querySelectorAll('#timeline-container .timeline-item').forEach((item) => {
                    mark(item, !item.classList.contains('filtered-out'));
                });
                document.querySelectorAll('[data-topics]').forEach((el) => {
                    const topics = (el.getAttribute('data-topics') || '').split(/\s+/);
                    mark(el, topics.includes(topicId));
                });
                document.querySelectorAll('[data-topic]').forEach((el) => mark(el, el.getAttribute('data-topic') === topicId));
                ['#languages-section', '#testimonials-section', '#glance-kpis'].forEach((sel) => {
                    const el = document.querySelector(sel);
                    if (el) el.classList.add('topic-dim');
                });
                const methodsChart = document.querySelector('[aria-labelledby="chart-b-heading"]');
                if (methodsChart) methodsChart.classList.add('topic-dim');
            },

            _attachRadarLabelListeners() {
                const charts = [this.DOMElements.competenciesRadarChart, this.DOMElements.methodologiesRadarChart].filter(Boolean);
                charts.forEach((chart) => {
                    chart.querySelectorAll('.radar-label').forEach((label) => {
                        label.addEventListener('click', () => {
                            const labelText = (label.querySelector('text')?.textContent || label.textContent || '').replace(/\s+/g, ' ').trim();
                            const topicId = this._topicIdFromRadar(labelText);
                            if (topicId) {
                                this._applyCompetencyFocus(topicId);
                                document.getElementById('toolkit-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                return;
                            }
                            this._resetFilters({ silent: true });
                            const skillsToSelect = this._getSkillsForCompetency(labelText);
                            const headersToExpand = new Set();
                            document.querySelectorAll('.tech-tag').forEach((tag) => {
                                if (skillsToSelect.includes(tag.dataset.skillName)) {
                                    this._toggleSkillFilter(tag);
                                    const header = tag.closest('.toolkit-section')?.querySelector('.toolkit-header');
                                    if (header && header.getAttribute('aria-expanded') === 'false') headersToExpand.add(header);
                                }
                            });
                            headersToExpand.forEach((header) => header.click());
                            document.getElementById('toolkit-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                    });
                });
                if (this.state.activeTopic) this._paintTopicClasses();
            },

            _filterExperiencesAndTimeline() {
                const skills = this.state.selectedSkills;
                const hasFilters = skills.size > 0;

                document.querySelectorAll('.filter-match, .filter-no-match').forEach(el => el.classList.remove('filter-match', 'filter-no-match'));

                let visibleCount = 0;
                document.querySelectorAll('#experience-container .experience-item').forEach(item => {
                    const tech = JSON.parse(item.dataset.tech);
                    const isMatch = this.state.activeTopic
                        ? this._topicMatchesTech(this.state.activeTopic, tech)
                        : (!hasFilters || [...skills].every(s => tech.includes(s)));

                    item.style.display = 'block';

                    if (hasFilters || this.state.activeTopic) {
                        if (isMatch) {
                            item.classList.add('filter-match');
                            item.classList.remove('filter-no-match');
                            visibleCount++;
                        } else {
                            item.classList.add('filter-no-match');
                            item.classList.remove('filter-match');
                        }
                    }
                });

                document.querySelectorAll('#timeline-container .timeline-item').forEach(item => {
                    const tech = JSON.parse(item.dataset.tech);
                    const isMatch = this.state.activeTopic
                        ? this._topicMatchesTech(this.state.activeTopic, tech)
                        : (!hasFilters || [...skills].every(s => tech.includes(s)));
                    item.classList.toggle('filtered-out', (hasFilters || this.state.activeTopic) && !isMatch);
                });

                if (!this.state.activeTopic) {
                    this.DOMElements.filterStatus.textContent = hasFilters ? `Showing ${visibleCount} relevant experiences.` : '';
                }
            },

            _populateAllTranslations() {
                Object.keys(PRINT_COPY).forEach((lang) => {
                    const dict = this.data.translations[lang];
                    const pack = PRINT_COPY[lang];
                    if (!dict || !pack) return;
                    Object.keys(pack).forEach((key) => {
                        if (key === 'roles') return;
                        dict[key] = pack[key];
                    });
                    (pack.roles || []).forEach((title, i) => {
                        dict['role_' + i] = title;
                    });
                });
                this.data.experiences.forEach((exp, expIdx) => {
                    Object.keys(this.data.translations).forEach(lang => {
                        if (!this.data.translations[lang] || !exp.details[lang]) return;
                        const englishTitle = typeof exp.title === 'string' ? exp.title : ((exp.title && exp.title.en) || '');
                        this.data.translations[lang][`exp_${expIdx}_title`] = this.data.translations[lang][`role_${expIdx}`] || englishTitle;
                        this.data.translations[lang][`exp_${expIdx}_summary`] = exp.details[lang][0].substring(0, 100) + '...';
                        exp.details[lang].forEach((detail, i) => {
                            this.data.translations[lang][`exp_${expIdx}_detail_${i}`] = detail;
                        });
                    });
                });
                this._populateTopicDropdown();
            },

            _isNativeLang(lang) {
                const code = lang || this.state.lang || 'en';
                return !!(window.SiteI18n ? SiteI18n.isNative(code) : this.data.translations[code]);
            },

            _localDateRange(raw) {
                const lang = String(this.state.dictLang || this.state.lang || 'en').slice(0, 2);
                const months = {
                    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
                    pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
                    de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
                    fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
                    it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
                };
                const present = { en: 'Present', es: 'Actualidad', pt: 'Atual', de: 'heute', fr: 'aujourd\'hui', it: 'oggi' };
                const source = months.en;
                const target = months[lang] || source;
                let text = String(raw || '');
                source.forEach((month, i) => {
                    text = text.replace(new RegExp('\\b' + month + '\\b', 'g'), target[i]);
                });
                return text.replace(/\bPresent\b/g, present[lang] || present.en);
            },

            _refreshLocalizedDates() {
                const native = this._isNativeLang(this.state.lang);
                document.querySelectorAll('[data-raw-date]').forEach((el) => {
                    const raw = el.getAttribute('data-raw-date') || '';
                    const prefix = el.getAttribute('data-date-prefix') || '';
                    el.textContent = prefix + (native ? this._localDateRange(raw) : raw);
                });
            },

            _exportDate(index, raw) {
                if (!this._isNativeLang(this.state.lang)) {
                    const el = document.querySelector('#experience-' + index + ' [data-raw-date]');
                    const text = el ? (el.innerText || el.textContent || '').trim() : '';
                    if (text) return text;
                }
                return this._localDateRange(raw);
            },

            _educationEntries() {
                return [
                    { degree: this._s('edu_degree_1', 'Specialization in Management on IT Projects'), school: 'Alexander Von-Humboldt University' },
                    { degree: this._s('edu_degree_2', 'Computer Systems Engineering'), school: 'EAMQ' },
                    { degree: this._s('edu_degree_3', 'Computer Systems Technician'), school: 'EAMQ' }
                ];
            },

            _certEntries() {
                return [
                    { label: this._s('cert_label_english', 'English Proficiency:'), value: 'EF SET C2 Proficient' },
                    { label: this._s('cert_label_pm', 'Project Management:'), value: 'CSPM' },
                    { label: this._s('cert_label_qa', 'Quality Assurance:'), value: 'CASQ, CAST, CSQA, ISTQB' },
                    { label: this._s('cert_label_security', 'Information Security:'), value: 'CISA, CISM, CISSP' }
                ];
            },

            _populateTopicDropdown() {
                const topicDropdown = this.DOMElements.messageTopic;
                if (!topicDropdown) return;
                const translation = this._t();
                const topics = {
                    '': translation.topic_option_default,
                    'opportunity': translation.topic_option_opportunity,
                    'inquiry': translation.topic_option_inquiry,
                    'feedback': translation.topic_option_feedback,
                    'other': translation.topic_option_other
                };
                topicDropdown.innerHTML = '';
                for (const [value, text] of Object.entries(topics)) {
                    topicDropdown.add(new Option(text, value));
                }
            },

            _t() {
                const key = this.state.dictLang || this.state.lang;
                return this.data.translations[key] || this.data.translations.en;
            },

            _s(key, fallback = '') {
                const el = document.querySelector(`[data-translate-key="${key}"]`);
                if (el) {
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (text) return text;
                }
                const dict = this._t() || {};
                return dict[key] || fallback;
            },

            _exportLangCode() {
                return this.state.dictLang || this.state.lang || 'en';
            },

            _experienceExport(exp, index) {
                const lang = this._exportLangCode();
                const englishTitle = typeof exp.title === 'string' ? exp.title : ((exp.title && exp.title.en) || '');
                const titleNodes = Array.from(document.querySelectorAll(`[data-translate-key="exp_${index}_title"]`));
                const titleTexts = titleNodes
                    .map((el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                let title = titleTexts[0] || '';
                if (!this._isNativeLang(this.state.lang)) {
                    title = titleTexts.find((text) => text !== englishTitle) || title;
                }
                if (!title) title = (this._t() || {})[`role_${index}`] || englishTitle;
                const detailsSource = (exp.details && (exp.details[lang] || exp.details.en)) || [];
                const details = detailsSource.map((detail, i) => this._s(`exp_${index}_detail_${i}`, detail));
                return { title, company: exp.company, dates: this._exportDate(index, exp.dates), details, techUsed: exp.techUsed || [] };
            },

            translatePage(lang) {
                const requested = (window.SiteI18n && SiteI18n.normalize(lang)) || lang || 'en';
                const isNative = !!(window.SiteI18n ? SiteI18n.isNative(requested) : this.data.translations[requested]);
                this.state.lang = requested;
                this.state.dictLang = isNative ? requested : 'en';
                const translation = this._t();
                if (!translation) return;

                document.documentElement.lang = requested.split('-')[0];
                if (window.SiteI18n) SiteI18n.persist(requested);
                try {
                    const url = new URL(window.location.href);
                    if (url.searchParams.get('lang') !== requested) {
                        url.searchParams.set('lang', requested);
                        window.history.replaceState({}, '', url);
                    }
                } catch (e) { /* ignore */ }

                this._updateMetaTags(this.state.dictLang);
                this._updateStructuredData(this.state.dictLang);

                if (isNative) {
                    document.querySelectorAll('[data-translate-key]').forEach(el => {
                        const key = el.getAttribute('data-translate-key');
                        if (translation[key]) {
                            let text = translation[key];
                            if (key === 'tooltip_timeline') {
                                const tooltipDiv = el.closest('.tooltip');
                                if (tooltipDiv && tooltipDiv.dataset.companyName) {
                                    text = text.replace('%COMPANY%', tooltipDiv.dataset.companyName);
                                }
                            }
                            el.innerHTML = text;
                        }
                    });
                }

                this._setupShareButtons();
                this._setupExportButtons();
                this.state.shareMenuInitialized = true;
                this.state.exportMenuInitialized = true;
                if (this.state.langMenuInitialized) {
                    this._populateLanguageOptions(false);
                    this._populateLanguageOptions(true);
                }

                if (this.state.isTourActive) {
                    this.showTourStep(this.state.currentTourStep, false);
                }
                this._populateTopicDropdown();
                this._createRadarCharts();
                this._syncLanguageToggles(requested);
                ['expand-all-toolkit', 'expand-all-exp'].forEach((id) => {
                    const btn = document.getElementById(id);
                    if (!btn || !translation.expand_all) return;
                    btn.textContent = btn.getAttribute('data-expanded-all') === 'true'
                        ? translation.collapse_all
                        : translation.expand_all;
                });
                const resetBtn = document.getElementById('reset-filter');
                if (resetBtn && translation.reset_filters) resetBtn.textContent = translation.reset_filters;
                if (translation.tooltip_theme) {
                    document.querySelectorAll('[data-translate-key="tooltip_theme"]').forEach((el) => {
                        el.textContent = translation.tooltip_theme;
                    });
                    ['theme-toggle', 'theme-toggle-mobile'].forEach((id) => {
                        const btn = document.getElementById(id);
                        if (btn) btn.setAttribute('aria-label', translation.tooltip_theme);
                    });
                }
                this._refreshLocalizedDates();
                this._createWatermark();
                if (window.SiteI18n) {
                    if (isNative) SiteI18n.applyMachineTranslate('en');
                    else {
                        SiteI18n.loadWidget();
                        SiteI18n.applyMachineTranslate(requested);
                    }
                    SiteI18n.refreshTranslation();
                }
            },

                _setupEventListeners() {
                    // --- Event listeners for standalone buttons ---
                    this.DOMElements.tourStartBtn.addEventListener('click', () => this.startTour());
                    document.getElementById('tour-start-btn-mobile').addEventListener('click', () => this.startTour());
                    document.getElementById('theme-toggle-mobile').addEventListener('click', () => this._toggleTheme());
                    document.getElementById('print-btn-mobile').addEventListener('click', () => {
                        this._trackEvent('print_cv', 'Interaction', 'Print Button Mobile');
                        this._exportAsPDF();
                    });
                    const openSimulator = () => {
                        const lang = this.state.lang || 'en';
                        this._trackEvent('open_simulator', 'Navigation', `lang=${lang}`);
                        window.open(`simulador.html?lang=${encodeURIComponent(lang)}`, 'sdlcStudio', 'popup=yes,width=1280,height=820,noopener,noreferrer');
                    };
                    const simDesktop = document.getElementById('sim-launch-btn');
                    const simMobile = document.getElementById('sim-launch-btn-mobile');
                    if (simDesktop) simDesktop.addEventListener('click', openSimulator);
                    if (simMobile) simMobile.addEventListener('click', openSimulator);
                    const openQaLab = () => {
                        const lang = this.state.lang || 'en';
                        this._trackEvent('open_qa_lab', 'Navigation', `lang=${lang}`);
                        window.open(`qa-lab.html?lang=${encodeURIComponent(lang)}`, 'cvQaLab', 'popup=yes,width=1320,height=900,noopener,noreferrer');
                    };
                    const qaDesktop = document.getElementById('qa-lab-btn');
                    const qaMobile = document.getElementById('qa-lab-btn-mobile');
                    if (qaDesktop) qaDesktop.addEventListener('click', openQaLab);
                    if (qaMobile) qaMobile.addEventListener('click', openQaLab);

                    // --- Main click handler for the entire page ---
                    document.body.addEventListener('click', (e) => {
                        const target = e.target;
                        const competencyBtn = target.closest('.competency-item');
                        if (competencyBtn) {
                            const id = competencyBtn.dataset.competency;
                            if (this.state.activeTopic === id) this._resetFilters({ silent: true });
                            else this._applyCompetencyFocus(id);
                        } else if (this.state.activeTopic && !this.state.isTourActive) {
                            const keep = target.closest('.topic-match, #tour-tooltip, #tour-overlay, #contact-widget, #contact-widget-fab, .mobile-toolbar-wrapper, #image-modal, .info-icon-container, #reset-filter, #theme-toggle, #tour-start-btn, #language-selector, #sim-launch-btn, #qa-lab-btn, #print-btn, #export-selector, #social-share-selector');
                            if (!keep) {
                                this._resetFilters({ silent: true });
                                return;
                            }
                        }
                        const analyticsHit = target.closest('[data-analytics-event]');
                        if (analyticsHit) {
                            this._trackEvent(
                                analyticsHit.dataset.analyticsEvent,
                                'Contact',
                                analyticsHit.dataset.analyticsLabel || analyticsHit.textContent.trim()
                            );
                        }
                        const dropdownSelectors = [
                            '#social-share-selector', '#export-selector', '#language-selector',
                            '#social-share-selector-mobile', '#export-selector-mobile', '#language-selector-mobile'
                        ];
                        const clickedDropdownSelector = dropdownSelectors.find(selector => target.closest(selector));

                        // --- NEW "INITIALIZE ON FIRST USE" LOGIC ---
                        if (clickedDropdownSelector) {
                            const element = document.querySelector(clickedDropdownSelector);
                            const clickedInsideMenu = target.closest('.dropdown');
                            if (element && !clickedInsideMenu) {
                                if (clickedDropdownSelector.includes('social-share') && !this.state.shareMenuInitialized) {
                                    this._setupShareButtons();
                                    this.state.shareMenuInitialized = true;
                                } else if (clickedDropdownSelector.includes('export') && !this.state.exportMenuInitialized) {
                                    this._setupExportButtons();
                                    this.state.exportMenuInitialized = true;
                                } else if (clickedDropdownSelector.includes('language') && !this.state.langMenuInitialized) {
                                    this._populateLanguageOptions(false);
                                    this._populateLanguageOptions(true);
                                    this.state.langMenuInitialized = true;
                                }
                                element.classList.toggle('collapsed');
                                if (!element.classList.contains('collapsed') && window.SiteI18n) {
                                    SiteI18n.refreshTranslation();
                                }
                            }
                        }

                        // Close all other dropdowns
                        dropdownSelectors.forEach(selector => {
                            if (selector !== clickedDropdownSelector) {
                                const element = document.querySelector(selector);
                                if (element) element.classList.add('collapsed');
                            }
                        });

                        // --- OTHER CLICK HANDLERS ---
                        const langOption = target.closest('.lang-option');
                        if (langOption) {
                            this._handleLanguageChange(langOption.dataset.lang, !!target.closest('#language-options-mobile'));
                        }

                        const timelineItem = target.closest('.timeline-item');
                        if (timelineItem) {
                            this._trackEvent('timeline_click', 'Engagement', timelineItem.id || timelineItem.textContent.trim().slice(0, 80));
                            const link = timelineItem.querySelector('a[href^="#experience-"]');
                            const targetId = link && link.getAttribute('href').slice(1);
                            const header = targetId && document.querySelector(`#${targetId} .accordion-header`);
                            if (header && header.getAttribute('aria-expanded') !== 'true') {
                                this._handleAccordionToggle(header);
                            }
                        }

                        const skillTag = target.closest('.tech-tag');
                        if (skillTag && !this.state.activeTopic) this._toggleSkillFilter(skillTag);

                        const accordionHeader = target.closest('.accordion-header, .toolkit-header');
                        if (accordionHeader) this._handleAccordionToggle(accordionHeader);

                        const button = target.closest('button');
                        if (button) this._handleButtonClick(button);
                    });

                    // --- Other event listeners ---
                    this.DOMElements.toolkitContainer.addEventListener('keydown', (e) => { if (e.target.closest('.tech-tag') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this._toggleSkillFilter(e.target.closest('.tech-tag')); } });
                    this.DOMElements.profilePhoto.addEventListener('click', () => this._openModal());
                    this.DOMElements.imageModal.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeModal(); });
                    this.DOMElements.contactWidgetFab.addEventListener('click', () => {
                        this._trackEvent('open_contact_widget', 'Engagement', 'FAB');
                        this._openContactWidget();
                    });
                    this.DOMElements.widgetCloseBtn.addEventListener('click', () => this._closeContactWidget());
                    this.DOMElements.widgetStatusCloseBtn.addEventListener('click', () => this._hideStatusMessage());
                    this.DOMElements.messageTab.addEventListener('click', () => {
                        this._trackEvent('contact_tab', 'Engagement', 'message');
                        this._switchTab('message');
                    });
                    this.DOMElements.ratingTab.addEventListener('click', () => {
                        this._trackEvent('contact_tab', 'Engagement', 'rating');
                        this._switchTab('rating');
                    });
                },

            _toggleDropdown(elementId, shouldToggle) {
                const element = document.getElementById(elementId);
                if (!element) return;

                if (shouldToggle) {
                    element.classList.toggle('collapsed');
                } else {
                    element.classList.add('collapsed');
                }
            },

            _handleShareSelector(e, isMobile = false) {
                const selector = isMobile ? document.getElementById('social-share-selector-mobile') : this.DOMElements.socialShareSelector;
                const isCurrentlyCollapsed = selector.classList.contains('collapsed');

                // Only toggle if the main icon is clicked, not an option inside
                if (e.target.closest('#social-share-toggle-icon')) {
                    selector.classList.toggle('collapsed');
                    // Track the event
                    if (isCurrentlyCollapsed) { // It was collapsed, now it's open
                        this._trackEvent('expand_share_widget', 'Engagement', 'Opened Share Menu');
                    }
                }
            },

            // NEW FUNCTION: To handle expand/collapse of the export menu
            _handleExportSelector(e, isMobile = false) {
                const selector = isMobile ? document.getElementById('export-selector-mobile') : this.DOMElements.exportSelector;
                const isCurrentlyCollapsed = selector.classList.contains('collapsed');
                if (e.target.closest('#export-toggle-icon')) {
                    selector.classList.toggle('collapsed');
                    if (isCurrentlyCollapsed) {
                        this._trackEvent('expand_export_widget', 'Engagement', 'Opened Export Menu');
                    }
                }
            },

            _handleButtonClick(button) {
                switch (button.id) {
                    case 'reset-filter': this._resetFilters(); break;
                    case 'expand-all-exp':
                        this._trackEvent('expand_all', 'Engagement', 'Experience');
                        this._toggleAllAccordions(this.DOMElements.experienceContainer, button);
                        break;
                    case 'expand-all-toolkit':
                        this._trackEvent('expand_all', 'Engagement', 'Toolkit');
                        this._toggleAllAccordions(this.DOMElements.toolkitContainer, button);
                        break;
                    case 'read-more-btn': this._toggleReadMore(button); break;
                    case 'print-btn': this._trackEvent('print_cv', 'Interaction', 'Print Button'); this._exportAsPDF(); break;
                    case 'theme-toggle': this._toggleTheme(); break;
                }
                if(button.classList.contains('modal-close')) {
                    this._closeModal();
                }
            },

            _toggleSkillFilter(tag) {
                const skillName = tag.dataset.skillName;
                const isPressed = tag.getAttribute('aria-pressed') === 'true';
                tag.classList.toggle('selected');
                tag.setAttribute('aria-pressed', !isPressed);
                isPressed ? this.state.selectedSkills.delete(skillName) : this.state.selectedSkills.add(skillName);
                this._trackEvent('skill_filter', 'Toolkit', `${!isPressed ? 'Added' : 'Removed'}: ${skillName}`);
                this._filterExperiencesAndTimeline();
            },

            _resetFilters(options = {}) {
                this.state.activeTopic = null;
                this.state.selectedSkills.clear();
                document.querySelectorAll('.tech-tag.selected').forEach(tag => {
                    tag.classList.remove('selected');
                    tag.setAttribute('aria-pressed', 'false');
                });
                document.querySelectorAll('.experience-item').forEach(item => {
                    item.classList.remove('filter-match', 'filter-no-match');
                });
                document.querySelectorAll('.timeline-item').forEach(item => {
                    item.classList.remove('filtered-out');
                });
                this._clearTopicClasses();
                if (!options.silent) this._trackEvent('reset_filters', 'Toolkit', 'Clicked Reset');
                this.DOMElements.filterStatus.textContent = '';
            },

            /**
             * MODIFIED: Added analytics tracking for expanding a job experience.
             */
            _handleAccordionToggle(button) {
                const body = document.getElementById(button.getAttribute('aria-controls'));
                const isExpanded = button.getAttribute('aria-expanded') === 'true';
                button.setAttribute('aria-expanded', !isExpanded);
                body.style.maxHeight = isExpanded ? null : body.scrollHeight + "px";

                const experienceItem = button.closest('.experience-item');
                const toolkitItem = button.closest('.toolkit-section');

                if (experienceItem) {
                    experienceItem.classList.toggle('is-open', !isExpanded);
                    button.querySelector('.accordion-icon').style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';

                    // NEW: Track event only when expanding
                    if (!isExpanded) {
                        const jobTitle = button.querySelector('h4')?.textContent || 'Unknown Title';
                        const company = button.querySelector('p.italic')?.textContent || 'Unknown Company';
                        this._trackEvent('expand_experience', 'Engagement', `${jobTitle} at ${company}`);
                    }
                } else if (toolkitItem) {
                    button.parentElement.nextElementSibling.style.display = isExpanded ? 'block' : 'none';
                    button.nextElementSibling.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
                    if (!isExpanded) {
                        this._trackEvent('expand_toolkit', 'Toolkit', button.textContent.trim().slice(0, 80));
                    }
                }
            },

            _toggleAllAccordions(container, button) {
                const translations = this._t();
                const isExpanding = button.getAttribute('data-expanded-all') !== 'true';
                container.querySelectorAll('.accordion-header, .toolkit-header').forEach(headerBtn => {
                    const isCurrentlyExpanded = headerBtn.getAttribute('aria-expanded') === 'true';
                    if ((isExpanding && !isCurrentlyExpanded) || (!isExpanding && isCurrentlyExpanded)) {
                        headerBtn.click();
                    }
                });
                button.setAttribute('data-expanded-all', isExpanding ? 'true' : 'false');
                button.textContent = isExpanding ? translations.collapse_all : translations.expand_all;
            },

            _handleLanguageSelector(e, isMobile = false) {
                const langSelector = isMobile ? document.getElementById('language-selector-mobile') : this.DOMElements.languageSelector;
                const isOpening = langSelector.classList.contains('collapsed');

                if (isOpening) {
                    langSelector.classList.remove('collapsed');
                    // Use a timeout to allow the element to become visible before adding the class
                    setTimeout(() => langSelector.classList.add('visible'), 10);
                    this._trackEvent('expand_language_widget', 'Engagement', 'Opened Language Menu');
                } else {
                    langSelector.classList.remove('visible');
                    // Wait for the animation to finish before adding 'collapsed'
                    setTimeout(() => langSelector.classList.add('collapsed'), 200);
                }

                // Move the arrow icon
                const arrow = langSelector.querySelector('.lang-accordion-indicator');
                const selectedFlagWrapper = langSelector.querySelector('.lang-wrapper.selected');
                if (arrow && selectedFlagWrapper) {
                    // Append the arrow after the selected flag's wrapper
                    selectedFlagWrapper.parentNode.insertBefore(arrow, selectedFlagWrapper.nextSibling);
                }
            },

            _handleLanguageChange(lang, isMobile = false) {
                const selectorId = isMobile ? 'language-selector-mobile' : 'language-selector';
                const selector = document.getElementById(selectorId);
                if (selector) {
                    selector.classList.add('collapsed');
                    selector.classList.remove('visible');
                }
                this._trackEvent('language_change', 'UI Interaction', `Switched to ${String(lang).toUpperCase()}`);
                if (window.SiteI18n && SiteI18n.selectLanguage(lang)) return;
                this.translatePage(lang);
            },

            _syncLanguageToggles(lang) {
                const label = (window.SiteI18n && SiteI18n.displayName(lang)) || String(lang).toUpperCase();
                const flag = window.SiteI18n ? SiteI18n.flagUrl(lang) : `https://hatscripts.github.io/circle-flags/flags/${lang === 'en' ? 'gb' : lang}.svg`;
                ['language-selector', 'language-selector-mobile'].forEach((id) => {
                    const selector = document.getElementById(id);
                    if (!selector) return;
                    const mainToggleImg = selector.querySelector('.lang-flag.selected');
                    if (!mainToggleImg) return;
                    mainToggleImg.src = flag;
                    mainToggleImg.alt = label;
                    mainToggleImg.dataset.lang = lang;
                    const tooltip = selector.querySelector('#language-toggle-desktop .tooltiptext, #language-toggle-mobile .tooltiptext');
                    if (tooltip) tooltip.textContent = label;
                });
            },

            _populateLanguageOptions(isMobile = false) {
                const containerId = isMobile ? 'language-options-mobile' : 'language-options';
                const container = document.getElementById(containerId);
                if (!container) return;

                const languages = (window.SiteI18n && SiteI18n.orderedLanguages()) || Object.keys(this.data.translations).map((code) => ({
                    code, name: code.toUpperCase(), native: code.toUpperCase(), flag: code === 'en' ? 'gb' : code
                }));
                const placeholder = this._t().lang_search_placeholder || 'Search language';

                container.innerHTML = '';
                const search = document.createElement('input');
                search.type = 'search';
                search.className = 'lang-search';
                search.setAttribute('placeholder', placeholder);
                search.setAttribute('aria-label', placeholder);
                search.addEventListener('click', (e) => e.stopPropagation());
                search.addEventListener('keydown', (e) => e.stopPropagation());

                const list = document.createElement('div');
                list.className = 'lang-options-list';

                const render = (query) => {
                    list.innerHTML = '';
                    languages.forEach((meta) => {
                        if (window.SiteI18n && !SiteI18n.matchesQuery(meta, query)) return;
                        const option = document.createElement('div');
                        option.className = 'lang-option';
                        option.dataset.lang = meta.code;
                        option.setAttribute('role', 'button');
                        option.setAttribute('tabindex', '0');
                        const langName = meta.native || meta.name;
                        option.innerHTML = `
                            <img src="${window.SiteI18n ? SiteI18n.flagUrl(meta.code) : `https://hatscripts.github.io/circle-flags/flags/${meta.flag}.svg`}" class="h-5 w-5 lang-flag" alt="${langName}">
                            <span>${langName}</span>
                        `;
                        option.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                this._handleLanguageChange(meta.code, isMobile);
                            }
                        });
                        list.appendChild(option);
                    });
                };

                search.addEventListener('input', () => render(search.value));
                render('');
                container.appendChild(search);
                container.appendChild(list);
            },

            _toggleReadMore(button) {
                const details = this.DOMElements.summaryDetails;
                const isExpanded = button.getAttribute('aria-expanded') === 'true';
                const translations = this._t();

                button.setAttribute('aria-expanded', !isExpanded);
                details.style.maxHeight = isExpanded ? null : details.scrollHeight + 'px';
                button.textContent = isExpanded ? translations.read_more : translations.read_less;
                this._trackEvent('read_more_toggle', 'Summary', isExpanded ? 'Collapsed' : 'Expanded');
            },

            _toggleTheme() {
                const isDarkMode = window.SiteTheme ? SiteTheme.toggle() : document.documentElement.classList.toggle('dark-mode');
                if (!window.SiteTheme) localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
                this._trackEvent('theme_change', 'UI Interaction', isDarkMode ? 'Dark Mode' : 'Light Mode');
                this._renderInfographics();
            },

            _openModal() {
                this.DOMElements.modalImage.src = this.DOMElements.profilePhoto.src;
                this.DOMElements.imageModal.classList.add('visible');
                this.DOMElements.modalClose.focus();
                this._trackEvent('view_photo', 'Interaction', 'Profile Photo Modal');
            },

            _closeModal() {
                this.DOMElements.imageModal.classList.remove('visible');
            },

            _applyUrlLanguage() {
                const params = new URLSearchParams(window.location.search);
                const urlLang = params.get('lang');
                const normalized = window.SiteI18n ? SiteI18n.normalize(urlLang) : (this.data.translations[urlLang] ? urlLang : null);
                if (normalized) {
                    this.state.lang = normalized;
                    this.state.dictLang = (window.SiteI18n && SiteI18n.isNative(normalized)) ? normalized : 'en';
                    this._trackEvent('language_from_url', 'SEO', `Loaded ${normalized.toUpperCase()}`);
                }
            },

            async _bootLanguage() {
                const lang = window.SiteI18n ? await SiteI18n.resolve() : (this.state.lang || 'en');
                this.state.lang = lang;
                this.state.dictLang = (window.SiteI18n && SiteI18n.isNative(lang)) ? lang : 'en';
                this.translatePage(lang);
                window.addEventListener('storage', (event) => {
                    if (event.key !== 'cv-preferred-lang' || !event.newValue) return;
                    const next = window.SiteI18n ? SiteI18n.normalize(event.newValue) : event.newValue;
                    if (!next || next === this.state.lang) return;
                    this.translatePage(next);
                });
            },

            _applyInitialTheme() {
                if (window.SiteTheme) {
                    SiteTheme.boot();
                    document.addEventListener('cv-theme-change', () => this._renderInfographics());
                    return;
                }
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark-mode');
                }
            },

            _initScrollAnimations() {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('is-visible');
                            const label = entry.target.getAttribute('aria-labelledby');
                            const heading = label ? document.getElementById(label) : null;
                            this._trackEvent('section_view', 'Scroll', (heading && heading.textContent.trim()) || entry.target.id || 'section');
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.1 });

                document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
            },

            _initScrollTrigger() {
                const depths = [25, 50, 75, 100];
                const fired = new Set();
                window.addEventListener('scroll', () => {
                    const doc = document.documentElement;
                    const max = doc.scrollHeight - window.innerHeight;
                    const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
                    depths.forEach((mark) => {
                        if (pct >= mark && !fired.has(mark)) {
                            fired.add(mark);
                            this._trackEvent('scroll_depth', 'Engagement', `${mark}%`);
                        }
                    });
                    const hasScrolledToBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 50);

                    if (hasScrolledToBottom && !this.state.hasAutoOpenedRating) {
                        this.state.hasAutoOpenedRating = true;
                        this._openContactWidget();
                        this._switchTab('rating');
                        this._trackEvent('auto_open_rating', 'Smart Feature', 'Scrolled to bottom');
                    }
                }, { passive: true });
            },

            _initUrlHighlighting() {
                const params = new URLSearchParams(window.location.search);
                const topic = (params.get('topic') || params.get('competency') || '').toLowerCase();
                if (topic && this._skillsForTopic(topic).length) {
                    this._applyCompetencyFocus(topic);
                }
                const skillsToHighlight = params.get('skills');
                if (!skillsToHighlight) return;

                const keywords = skillsToHighlight.split(',').map(s => s.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).filter(Boolean);
                if (keywords.length === 0) return;

                this._trackEvent('highlight_from_url', 'Smart Feature', keywords.join(', '));
                const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');

                const walk = document.createTreeWalker(this.DOMElements.mainContent, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while(node = walk.nextNode()) {
                    if (node.parentElement.tagName !== 'SCRIPT' && node.parentElement.tagName !== 'STYLE') {
                        const text = node.nodeValue;
                        if (regex.test(text)) {
                            const fragment = document.createDocumentFragment();
                            let lastIndex = 0;
                            text.replace(regex, (match, offset) => {
                                fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));
                                const mark = document.createElement('mark');
                                mark.textContent = match;
                                fragment.appendChild(mark);
                                lastIndex = offset + match.length;
                                return match;
                            });
                            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                            node.parentNode.replaceChild(fragment, node);
                        }
                    }
                }
            },

            _trackEvent(eventName, eventCategory, eventLabel) {
                if (window.SiteAnalytics) {
                    SiteAnalytics.event(eventName, eventCategory, eventLabel);
                } else if (typeof gtag === 'function') {
                    gtag('event', eventName, { 'event_category': eventCategory, 'event_label': eventLabel });
                } else {
                    console.log(`Analytics (not sent): ${eventName}, ${eventCategory}, ${eventLabel}`);
                }
            },

            // --- NEW METHOD: Fetches and renders approved reviews ---
            // ADD THIS NEW FUNCTION
            _loadAndRenderReviews() {
                const container = this.DOMElements.testimonialsContainer;
                const avgRatingEl = document.getElementById('average-rating-display');
                if (!container || !avgRatingEl) return;

                // Query the new 'testimonials' collection, ordered by creation date
                const q = query(collection(db, "testimonials"), orderBy("createdAt", "desc"));

                onSnapshot(q, (snapshot) => {
                    if (snapshot.empty) {
                        container.parentElement.style.display = 'none'; // Hide section if no testimonials
                        return;
                    }

                    container.parentElement.style.display = 'block';
                    let totalRating = 0;
                    let ratingCount = 0;

                    const testimonialCardsHTML = snapshot.docs.map(doc => {
                        const testimonial = doc.data();
                        if (testimonial.rating) {
                            totalRating += testimonial.rating;
                            ratingCount++;
                        }
                        return this._createReviewCard(testimonial);
                    }).join('');

                    if (ratingCount > 0) {
                        const average = totalRating / ratingCount;
                        avgRatingEl.innerHTML = `Avg: ${average.toFixed(1)} <span class="star">★</span>`;
                        avgRatingEl.style.display = 'inline-block';
                    } else {
                        avgRatingEl.style.display = 'none';
                    }

                    container.innerHTML = testimonialCardsHTML;
                });
            },

// ADD THIS SECOND NEW FUNCTION
            _createReviewCard(testimonial) {
                const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[ch]));
                const score = Math.min(5, Math.max(0, Number(testimonial.rating) || 0));
                const starsHTML = score ? '★'.repeat(score) + '☆'.repeat(5 - score) : '';
                const adminResponseHTML = testimonial.adminResponse ? `
        <div class="admin-response">
            <p>Response from Carlos:</p>
            <p>"${escape(testimonial.adminResponse)}"</p>
        </div>
    ` : '';

                return `
        <div class="testimonial-card">
            ${starsHTML ? `<div class="testimonial-stars" aria-label="Rating: ${score} out of 5 stars">${starsHTML}</div>` : ''}
            ${testimonial.originalText ? `<p class="testimonial-quote">"${escape(testimonial.originalText)}"</p>` : ''}
            <p class="testimonial-author">- ${escape(testimonial.authorName || 'Visitor')}</p>
            ${adminResponseHTML}
        </div>
    `;
            },


            _initContactWidget() {
                const {
                    messageForm, senderName, senderEmail, messageTopic, senderMessage, fileUpload,
                    ratingForm, starRatingContainer, raterName, raterEmail
                } = this.DOMElements;

                const fieldsToValidate = [
                    { el: senderName,      rules: { required: true, minLength: 2 } },
                    { el: senderEmail,     rules: { required: true, type: 'email' } },
                    { el: messageTopic,    rules: { required: true } },
                    { el: senderMessage,   rules: { required: true, minLength: 10 } },
                    { el: raterName,       rules: { required: true, minLength: 2 } },
                    { el: raterEmail,      rules: { required: true, type: 'email' } },
                ];
                fieldsToValidate.forEach(({ el, rules }) => {
                    el.addEventListener('focusout', () => this._validateField(el, rules));
                });

                messageForm.addEventListener('submit', (e) => this._handleMessageSubmit(e));
                ratingForm.addEventListener('submit', (e) => this._handleRatingSubmit(e));

                messageForm.addEventListener('input', () => this._updateMessageButtonState());
                ratingForm.addEventListener('input', () => this._updateRatingButtonState());

                fileUpload.addEventListener('change', () => this._handleFileAttachment());

                starRatingContainer.addEventListener('click', e => this._handleStarClick(e));
                starRatingContainer.addEventListener('mouseover', e => this._handleStarHover(e));
                starRatingContainer.addEventListener('mouseout', () => this._updateStarDisplay());

                starRatingContainer.addEventListener('focusout', () => this._validateField(this.DOMElements.ratingValue, { required: true, type: 'rating' }));
            },

            _openContactWidget() {
                this.DOMElements.contactWidget.classList.add('visible');
                this.DOMElements.contactWidget.setAttribute('aria-hidden', 'false');
            },

            _closeContactWidget() {
                this.DOMElements.contactWidget.classList.remove('visible');
                this.DOMElements.contactWidget.setAttribute('aria-hidden', 'true');
                this._trackEvent('close_contact_widget', 'Engagement', 'Closed');

                setTimeout(() => {
                    this._resetMessageForm();
                    this._resetRatingForm();
                    this._hideStatusMessage();
                }, 300);
            },

            _switchTab(tabName) {
                const { messageTab, ratingTab, messagePane, ratingPane } = this.DOMElements;
                const isMessageTab = tabName === 'message';

                messageTab.classList.toggle('active', isMessageTab);
                ratingTab.classList.toggle('active', !isMessageTab);
                messageTab.setAttribute('aria-selected', isMessageTab);
                ratingTab.setAttribute('aria-selected', !isMessageTab);

                messagePane.classList.toggle('active', isMessageTab);
                ratingPane.classList.toggle('active', !isMessageTab);
            },

            _validateField(field, rules) {
                const errorEl = document.getElementById(`${field.id}-error`);
                let errorMessage = '';
                const translations = this._t();
                const value = field.value.trim();

                if (rules.required && !value) {
                    errorMessage = (rules.type === 'rating' && parseInt(field.value, 10) === 0) ? translations.error_rating : translations.error_required;
                } else if (rules.type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) {
                    errorMessage = translations.error_email;
                } else if (rules.minLength && value.length < rules.minLength) {
                    errorMessage = translations.error_min_length.replace('{min}', rules.minLength);
                }

                if (errorMessage) {
                    if (errorEl) {
                        errorEl.textContent = errorMessage;
                        errorEl.style.display = 'block';
                    }
                    field.classList.add('invalid');
                    field.setAttribute('aria-invalid', 'true');
                    return false;
                } else {
                    if (errorEl) {
                        errorEl.textContent = '';
                        errorEl.style.display = 'none';
                    }
                    field.classList.remove('invalid');
                    field.setAttribute('aria-invalid', 'false');
                    return true;
                }
            },

            _updateMessageButtonState() {
                const { senderName, senderEmail, messageTopic, senderMessage, sendMessageBtn } = this.DOMElements;
                const isNameValid = senderName.value.trim().length >= 2;
                const isEmailValid = /^\S+@\S+\.\S+$/.test(senderEmail.value.trim());
                const isTopicValid = messageTopic.value.trim() !== '';
                const isMessageValid = senderMessage.value.trim().length >= 10;

                sendMessageBtn.disabled = !(isNameValid && isEmailValid && isTopicValid && isMessageValid);
            },

            _updateRatingButtonState() {
                const { raterName, raterEmail, ratingValue, sendRatingBtn } = this.DOMElements;
                const isNameValid = raterName.value.trim().length >= 2;
                const isEmailValid = /^\S+@\S+\.\S+$/.test(raterEmail.value.trim());
                const isRatingValid = parseInt(ratingValue.value, 10) > 0;

                sendRatingBtn.disabled = !(isNameValid && isEmailValid && isRatingValid);
            },

            _handleFileAttachment() {
                const { fileUpload, fileUploadStatus } = this.DOMElements;
                const file = fileUpload.files[0];
                const translations = this._t();

                if (!file) {
                    fileUploadStatus.innerHTML = '';
                    return;
                }

                fileUploadStatus.innerHTML = `<div class="spinner" aria-label="${translations.status_uploading}"></div> ${translations.status_uploading}`;

                const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg'];
                const maxSize = 5 * 1024 * 1024; // 5MB

                setTimeout(() => {
                    if (file.size > maxSize) {
                        fileUploadStatus.innerHTML = `<span style="color: var(--error-red);">${translations.error_file_size}</span>`;
                        fileUpload.value = '';
                    } else if (!allowedTypes.includes(file.type)) {
                        fileUploadStatus.innerHTML = `<span style="color: var(--error-red);">${translations.error_file_type}</span>`;
                        fileUpload.value = '';
                    } else {
                        fileUploadStatus.innerHTML = `<span style="color: var(--cyan-brand);">${translations.status_file_attached.replace('{fileName}', file.name)}</span>`;
                    }
                }, 500);
            },

            async _handleMessageSubmit(e) {
                e.preventDefault();
                const { sendMessageBtn, senderName, senderEmail, messageTopic, senderMessage, fileUpload } = this.DOMElements;

                const email = senderEmail.value.toLowerCase().trim();
                const isNameValid = this._validateField(senderName, { required: true, minLength: 2 });
                const isEmailValid = this._validateField(senderEmail, { required: true, type: 'email' });
                const isTopicValid = this._validateField(messageTopic, { required: true });
                const isMessageValid = this._validateField(senderMessage, { required: true, minLength: 10 });
                // **NEW**: Check if sender is blocked
                if (this.state.blockList.has(email)) {
                    console.warn(`Blocked email attempted to send message: ${email}`);
                    this._showStatusMessage('error'); // Show a generic error
                    return;
                }
                if (!isNameValid || !isEmailValid || !isTopicValid || !isMessageValid) return;

                this._setButtonSendingState(sendMessageBtn, true);

                const file = fileUpload.files[0];

                try {
                    let fileURL = '';
                    if (file) {
                        const storageRef = ref(storage, `attachments/${Date.now()}_${file.name}`);
                        const snapshot = await uploadBytes(storageRef, file);
                        fileURL = await getDownloadURL(snapshot.ref);
                    }

                    await addDoc(collection(db, 'messages'), {
                        name: senderName.value.trim(),
                        email,
                        topic: messageTopic.value,
                        message: senderMessage.value.trim(),
                        fileURL,
                        status: 'inbox',
                        createdAt: serverTimestamp()
                    });

                    // This corrected line uses the available 'messageTopic' variable.
                    this._trackEvent('submit_message', 'Form Submission', `Topic: ${messageTopic.value}`);

                    this._showStatusMessage('success', 'message');
                    this._resetMessageForm();

                } catch (error) {
                    console.error("Error sending message:", error);
                    this._showStatusMessage('error');
                } finally {
                    this._setButtonSendingState(sendMessageBtn, false);
                }
            },

            async _handleRatingSubmit(e) {
                e.preventDefault();
                const { sendRatingBtn, raterName, raterEmail, ratingValue, raterComment } = this.DOMElements;

                const email = raterEmail.value.toLowerCase().trim();
                const isNameValid = this._validateField(raterName, { required: true, minLength: 2 });
                const isEmailValid = this._validateField(raterEmail, { required: true, type: 'email' });
                const isRatingValid = this._validateField(ratingValue, { required: true, type: 'rating' });
                // **NEW**: Check if sender is blocked
                if (this.state.blockList.has(email)) {
                    console.warn(`Blocked email attempted to send rating: ${email}`);
                    this._showStatusMessage('error'); // Show a generic error
                    return;
                }
                if (!isNameValid || !isEmailValid || !isRatingValid) return;

                this._setButtonSendingState(sendRatingBtn, true);

                try {
                    await addDoc(collection(db, 'ratings'), {
                        name: raterName.value.trim(),
                        email,
                        rating: parseInt(ratingValue.value, 10),
                        comment: raterComment.value.trim(),
                        status: 'pending',
                        isAnonymous: false,
                        createdAt: serverTimestamp()
                    });

                    this._trackEvent('submit_rating', 'Form Submission', `Rating: ${ratingValue.value} Stars`);

                    this._showStatusMessage('success', 'rating');
                    this._resetRatingForm();

                } catch (error) {
                    console.error("Error submitting rating:", error);
                    this._showStatusMessage('error');
                } finally {
                    this._setButtonSendingState(sendRatingBtn, false);
                }
            },

            _resetMessageForm() {
                this.DOMElements.messageForm.reset();
                this.DOMElements.fileUploadStatus.innerHTML = '';
                this.DOMElements.sendMessageBtn.disabled = true;
                ['sender-name', 'sender-email', 'message-topic', 'sender-message'].forEach(id => {
                    const field = document.getElementById(id);
                    const errorEl = document.getElementById(`${id}-error`);
                    field.classList.remove('invalid');
                    field.setAttribute('aria-invalid', 'false');
                    if (errorEl) errorEl.style.display = 'none';
                });
            },

            _resetRatingForm() {
                this.DOMElements.ratingForm.reset();
                this.state.rating = 0;
                this.DOMElements.ratingValue.value = 0;
                this._updateStarDisplay();
                this.DOMElements.sendRatingBtn.disabled = true;
                ['rater-name', 'rater-email', 'rating-value'].forEach(id => {
                    const field = document.getElementById(id);
                    if (!field) return;
                    field.classList.remove('invalid');
                    field.setAttribute('aria-invalid', 'false');
                    const errorEl = document.getElementById(`${id}-error`);
                    if (errorEl) errorEl.style.display = 'none';
                });
            },

            _showStatusMessage(type, context = 'message') {
                const { widgetStatusContainer, widgetStatusContent } = this.DOMElements;
                const translations = this._t();
                let title, body;

                if (type === 'success') {
                    title = context === 'rating' ? translations.status_success_rating_title : translations.status_success_message_title;
                    body = context === 'rating' ? translations.status_success_rating_body : translations.status_success_message_body;
                    widgetStatusContent.innerHTML = `<h3 class="text-2xl font-bold text-green-600">${title}</h3><p class="mt-2">${body}</p>`;
                } else {
                    title = translations.status_error_title;
                    body = translations.status_error_body;
                    widgetStatusContent.innerHTML = `<h3 class="text-2xl font-bold text-red-600">${title}</h3><p class="mt-2">${body}</p>`;
                }

                widgetStatusContainer.classList.add('visible');

                if (this.state.statusTimeout) clearTimeout(this.state.statusTimeout);
                this.state.statusTimeout = setTimeout(() => this._hideStatusMessage(), 5000);
            },

            _hideStatusMessage() {
                if (this.state.statusTimeout) clearTimeout(this.state.statusTimeout);
                this.DOMElements.widgetStatusContainer.classList.remove('visible');
            },

            _setButtonSendingState(button, isSending) {
                const translations = this._t();
                button.classList.toggle('sending', isSending);
                button.disabled = isSending;
                const btnText = button.querySelector('.btn-text');
                if (isSending) {
                    btnText.setAttribute('data-original-text', btnText.textContent);
                    btnText.textContent = translations.status_sending;
                } else if (btnText.hasAttribute('data-original-text')) {
                    btnText.textContent = btnText.getAttribute('data-original-text');
                }
            },

            _handleStarClick(eventOrElement) {
                // This now accepts either a click event or the star element directly
                const star = eventOrElement.target ? eventOrElement.target.closest('.star') : eventOrElement;
                if (!star) return;

                this.state.rating = parseInt(star.dataset.value, 10);
                this.DOMElements.ratingValue.value = this.state.rating;
                this._validateField(this.DOMElements.ratingValue, { required: true, type: 'rating' });
                this._updateStarDisplay();
                this._updateRatingButtonState();
            },

            _handleStarHover(e) {
                const star = e.target.closest('.star');
                if (!star) return;
                const hoverValue = parseInt(star.dataset.value, 10);
                this.DOMElements.starRatingContainer.querySelectorAll('.star').forEach(s => {
                    s.classList.toggle('hover', parseInt(s.dataset.value, 10) <= hoverValue);
                });
            },

            _updateStarDisplay() {
                this.DOMElements.starRatingContainer.querySelectorAll('.star').forEach(star => {
                    const starValue = parseInt(star.dataset.value, 10);
                    star.classList.remove('hover');
                    const isSelected = starValue <= this.state.rating;
                    star.classList.toggle('selected', isSelected);
                    star.setAttribute('aria-checked', isSelected);
                });
            },

            _applyClickEffect(element, duration = 500) {
                if (!element) return;
                element.classList.add('tour-highlight-click');
                setTimeout(() => element.classList.remove('tour-highlight-click'), duration);
            },

            _setupShareButtons() {
                const translations = this._t();
                const pageUrl = encodeURIComponent(window.location.href.split('?')[0]);
                const shareText = encodeURIComponent(translations.share_text);
                const shareTitle = encodeURIComponent(translations.share_title);

                const socialNetworks = [
                    { name: 'LinkedIn', icon: '<svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>', url: `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}` },
                    { name: 'X (Twitter)', icon: '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>', url: `https://twitter.com/intent/tweet?url=${pageUrl}&text=${shareText}` },
                    { name: 'Facebook', icon: '<svg viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>', url: `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}` },
                    { name: 'WhatsApp', icon: '<svg viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.447-4.435-9.884-9.888-9.884-5.448 0-9.886 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.523.074-.797.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871-.118.571-.355 1.04-1.428 1.187-1.776.149-.347.149-.644.104-.77z"/></svg>', url: `https://api.whatsapp.com/send?text=${shareText}%20${pageUrl}` },
                    { name: 'Telegram', icon: '<svg viewBox="0 0 24 24"><path d="M11.944 0C5.356 0 0 5.356 0 11.944s5.356 11.944 11.944 11.944S18.532 0 11.944 0zM18.067 7.713l-2.427 11.23c-.156.72-.553.896-1.116.554l-3.6-2.656-1.745 1.683c-.19.19-.356.356-.713.356l.254-3.665 6.757-6.12c.297-.254-.057-.394-.454-.14l-8.31 5.215-3.53-1.096c-.713-.223-.72-.713-.14-1.096l10.87-4.23c.6-.254 1.13.14 1.33.944z"/></svg>', url: `https://t.me/share/url?url=${pageUrl}&text=${shareText}` },
                    { name: 'Reddit', icon: '<svg viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.5 13.5c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5 1.5.672 1.5 1.5zm-10 0c0 .828-.672 1.5-1.5 1.5S5.5 14.328 5.5 13.5 6.172 12 7 12s1.5.672 1.5 1.5zm3.8-2.64c-.28-.27-2.31.11-4.04.62-.32.09-.45-.1-.36-.42.84-2.83 3.5-4.58 6.58-4.58s5.74 1.75 6.58 4.58c.09.32-.04.51-.36.42-1.73-.51-3.76-.89-4.04-.62-.28.27-.12.62.2.81.93.55 2.7.9 4.31 1.1.33.04.46.21.34.52-.73 1.9-2.73 3.22-5.49 3.22s-4.76-1.32-5.49-3.22c-.12-.31.01-.48.34-.52 1.61-.2 3.38-.55 4.31-1.1.32-.19.48-.54.2-.81z"/></svg>', url: `https://www.reddit.com/submit?url=${pageUrl}&title=${shareTitle}` },
                    { name: 'Pinterest', icon: '<svg viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.938 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 .992.371 1.931.82 2.447.09.09.101.185.073.293-.024.09-.077.318-.101.423-.038.158-.182.222-.335.134-1.249-.582-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.965-.525-2.291-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.938.356 1.96.551 3.029.551 6.627 0 12-5.373 12-12C24 5.373 18.627 0 12 0z"/></svg>', url: `https://pinterest.com/pin/create/button/?url=${pageUrl}&media=&description=${shareText}` },
                    { name: 'Copy Link', isButton: true, icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' }
                ];

                const desktopContainer = this.DOMElements.socialShareOptions;
                const mobileContainer = document.getElementById('social-share-options-mobile-container');

                const populateContainer = (container, isMobile) => {
                    if (!container) return;
                    container.innerHTML = '';
                    socialNetworks.forEach(net => {
                        let element;
                        let text = net.isButton ? translations.tooltip_copy_link : net.name;

                        if (isMobile) {
                            element = document.createElement(net.isButton ? 'button' : 'a');
                            element.className = 'w-full flex items-center gap-2 p-1 rounded text-left';
                            element.innerHTML = `<div class="w-5 h-5 share-icon-${net.name.toLowerCase().split(' ')[0]}">${net.icon}</div><span class="text-sm">${text}</span>`;
                        } else {
                            element = document.createElement('a');
                            element.className = 'tooltip share-link-wrapper';
                            element.innerHTML = `${net.icon}<span class="tooltiptext">${translations.tooltip_share_on.replace('%s', net.name)}</span>`;
                        }

                        if (!net.isButton) {
                            element.href = net.url;
                            element.target = '_blank';
                            element.rel = 'noopener noreferrer';
                            element.addEventListener('click', () => this._trackEvent('share_cv', 'Share', net.name));
                        } else {
                            element.id = isMobile ? 'copy-link-btn-mobile' : 'copy-link-btn-desktop';
                            if (!isMobile) {
                                element.href = "#";
                                element.querySelector('.tooltiptext').textContent = translations.tooltip_copy_link;
                            }
                        }
                        container.appendChild(element);
                    });
                };

                populateContainer(desktopContainer, false);
                populateContainer(mobileContainer, true);

                const setupCopyListener = (btnId) => {
                    const copyBtn = document.getElementById(btnId);
                    if (!copyBtn) return;
                    const isMobile = btnId.includes('mobile');
                    const textElement = isMobile ? copyBtn.querySelector('span') : copyBtn.querySelector('.tooltiptext');
                    if (!textElement) return;
                    copyBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this._trackEvent('share_cv', 'Share', 'Copy Link');
                        navigator.clipboard.writeText(window.location.href.split('?')[0]).then(() => {
                            const originalText = textElement.textContent;
                            textElement.textContent = translations.copied || 'Copied!';
                            setTimeout(() => { textElement.textContent = originalText; }, 2000);
                        });
                    });
                };
                setupCopyListener('copy-link-btn-desktop');
                setupCopyListener('copy-link-btn-mobile');
            },


            _setupExportButtons() {
                const translations = this._t();
                const exportOptions = [
                    { nameKey: 'export_cv_pdf', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>', handler: () => this._exportAsPDF_jsPDF() },
                    { nameKey: 'export_cv_jpg', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>', handler: () => this._exportAsJPG() },
                    { nameKey: 'export_cv_doc', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>', handler: () => this._exportAsATS() },
                    { nameKey: 'export_cv_json', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>', handler: () => this._exportAsJSON() },
                    { nameKey: 'export_cv_text', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>', handler: () => this._exportAsText() }
                ];

                const desktopContainer = this.DOMElements.exportOptions;
                const mobileContainer = document.getElementById('export-options-mobile-container');

                const populateContainer = (container) => {
                    if (!container) return;
                    container.innerHTML = '';
                    exportOptions.forEach(opt => {
                        const button = document.createElement('button');
                        button.className = 'w-full flex items-center gap-2 p-1 rounded text-left';
                        const buttonText = translations[opt.nameKey] || opt.nameKey;
                        button.innerHTML = `<div class="w-5 h-5 export-icon-${opt.nameKey}">${opt.icon}</div><span class="text-sm">${buttonText}</span>`;
                        button.addEventListener('click', () => {
                            opt.handler();
                            this._trackEvent('export_cv', 'Export', opt.nameKey || opt.name);
                        });
                        container.appendChild(button);
                    });
                };
                populateContainer(desktopContainer);
                populateContainer(mobileContainer);
            },


            /**
             * Generates a complete, clean HTML string of the CV content for reliable printing.
             */
            _generatePrintableHTML() {
                const experiences = this.data.experiences;
                const skills = this.data.skills;
                const profilePhotoSrc = this.DOMElements.profilePhoto.src;
                const summaryFullText = [this._s('summary_text'), this._s('summary_detail_1'), this._s('summary_detail_2')].filter(Boolean).join(' ');
                const techLabel = this._s('print_technologies', 'Technologies Used');

                return `
                    <style>
                        .print-only-container { position: relative; font-family: Inter, Arial, sans-serif; color: #12181f; padding: 40px; background-color: #fff; width: 800px; }
                        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; color: rgba(0, 0, 0, 0.05); font-weight: bold; pointer-events: none; z-index: 0; }
                        h1, h2, h3, h4 { font-family: "Source Serif 4", Georgia, serif; font-weight: 600; }
                        h1 { font-size: 26pt; font-weight: 700; text-align: center; margin: 0; } h2 { font-size: 14pt; text-align: center; color: #4a5560; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #0d6e76; } h3 { font-size: 16pt; font-weight: 600; margin-top: 30px; margin-bottom: 10px; border-bottom: 1px solid #d5dce3; padding-bottom: 5px; } h4 { font-size: 12pt; font-weight: 600; margin-top: 15px; margin-bottom: 2px; } p, li { font-size: 10pt; line-height: 1.5; color: #333; } ul { list-style-type: disc; padding-left: 20px; margin-top: 5px; } .contact-info { text-align: center; margin-bottom: 20px; font-size: 10pt; } .contact-info a { color: #0d6e76; text-decoration: none; margin: 0 5px; } .profile-photo { display: block; margin: 0 auto 20px auto; width: 120px; height: 120px; border-radius: 50%; object-fit: cover; object-position: center 18%; } .toolkit-category { margin-bottom: 10px; } .toolkit-skills { font-size: 9pt; color: #555; } .exp-item { margin-bottom: 20px; } .exp-dates { color: #555; font-style: italic; } .technologies { font-size: 9pt; color: #0d6e76; font-style: italic; } .languages-section p { margin-bottom: 5px; }
                    </style>

                    <div class="print-only-container">
                        <div class="watermark">Carlos A. Muñoz - ${this._s('print_confidential', 'Confidential')}</div>
                        <img src="${profilePhotoSrc}" class="profile-photo" alt="Profile Photo">
                        <h1>CARLOS A. MUÑOZ</h1>
                        <h2>${this._s('job_title')}</h2>
                        <div class="contact-info">
                             <a href="mailto:kaanmuar@gmail.com">kaanmuar@gmail.com</a> | <a href="https://www.linkedin.com/in/carlos-andres-m-2a60b8b/">${this._s('print_linkedin', 'LinkedIn')}</a> | <span>+57 320 919 1010</span> | <a href="https://wa.me/573209191010">WhatsApp</a> | <a href="https://t.me/+573209191010">Telegram</a><br><a href="https://kaanmuar.github.io/">${this._s('print_online_cv')}</a>
                        </div>
                        <h3>${this._s('summary_title')}</h3><p>${summaryFullText}</p>
                        <h3>${this._s('toolkit_title')}</h3>
                        ${Object.keys(skills).map(categoryKey => `<div class="toolkit-category"><h4>${this._s(`toolkit_${categoryKey}`, categoryKey)}</h4><p class="toolkit-skills">${skills[categoryKey].map(s => s.name).join(', ')}</p></div>`).join('')}
                        <h3>${this._s('languages_title')}</h3><div class="languages-section"><p><strong>${this._s('lang_name_es')}:</strong> ${this._s('lang_native')}</p><p><strong>${this._s('lang_name_en')}:</strong> ${this._s('lang_fluent')} (C2)</p><p><strong>${this._s('lang_name_pt')}:</strong> ${this._s('lang_fluent')}</p><p><strong>${this._s('lang_others')}:</strong> ${this._s('lang_basic')}</p></div>
                        <h3>${this._s('experience_title')}</h3>
                        ${experiences.map((exp, i) => {
                            const item = this._experienceExport(exp, i);
                            return `<div class="exp-item"><h4>${item.title} — ${item.company}</h4><p class="exp-dates">${item.dates}</p><ul>${item.details.map(detail => `<li>${detail}</li>`).join('')}</ul><p class="technologies"><strong>${techLabel}:</strong> ${item.techUsed.join(', ')}</p></div>`;
                        }).join('')}
                        <h3>${this._s('education_title')}</h3><h4>${this._s('education_subheading')}</h4>${this._educationEntries().map((item) => `<p><strong>${item.degree}</strong> - ${item.school}</p>`).join('')}<h4>${this._s('certs_subheading')}</h4><p>${this._certEntries().map((item) => `<strong>${item.label}</strong> ${item.value}`).join(' | ')}</p>
                    </div>
                `;
            },

            async _prepareAndCleanupForPrint(action) {
                // Use a direct reference for the loading indicator
                let loadingIndicator = document.getElementById('export-loading-overlay');
                if (!loadingIndicator) {
                    loadingIndicator = document.createElement('div');
                    loadingIndicator.id = 'export-loading-overlay';
                    loadingIndicator.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); color: white; display: flex; align-items: center; justify-content: center; z-index: 9999; font-size: 1.5rem;';
                    document.body.appendChild(loadingIndicator);
                }
                loadingIndicator.textContent = this._s('print_preparing', 'Preparing Print View...');
                loadingIndicator.style.display = 'flex';

                const printContainer = document.getElementById('print-content');
                if (printContainer) {
                    printContainer.innerHTML = this._generatePrintableHTML();
                }

                const isDark = document.documentElement.classList.contains('dark-mode');
                if (isDark) {
                    document.documentElement.classList.remove('dark-mode');
                }

                await new Promise(resolve => setTimeout(resolve, 200));

                action();

                // Correctly reference and hide the overlay in the cleanup
                setTimeout(() => {
                    const overlay = document.getElementById('export-loading-overlay');
                    if(overlay) overlay.style.display = 'none';
                    if (printContainer) printContainer.innerHTML = '';
                    if (isDark) {
                        document.documentElement.classList.add('dark-mode');
                    }
                }, 3000);
            },

            _exportAsATS() {
                const experiences = this.data.experiences;
                const skills = this.data.skills;
                const summaryFullText = [this._s('summary_text'), this._s('summary_detail_1'), this._s('summary_detail_2')].filter(Boolean).join(' ');
                const techLabel = this._s('print_technologies', 'Technologies Used');

                let content = `
                    <h1>CARLOS A. MUÑOZ</h1>
                    <p style="text-align:center;">${this._s('job_title')}</p>
                    <p style="text-align:center;">
                        kaanmuar@gmail.com |
                        https://www.linkedin.com/in/carlos-andres-m-2a60b8b/ |
                        +57 320 919 1010
                    </p>
                    <hr>
                    <h2>${this._s('summary_title')}</h2>
                    <p>${summaryFullText}</p>

                    <h2>${this._s('print_skills', this._s('toolkit_title'))}</h2>
                    ${Object.keys(skills).map(key => `
                        <p><strong>${this._s(`toolkit_${key}`, key)}:</strong> ${skills[key].map(s => s.name).join(', ')}</p>
                    `).join('')}

                    <h2>${this._s('experience_title')}</h2>
                    ${experiences.map((exp, i) => {
                        const item = this._experienceExport(exp, i);
                        return `
                        <hr>
                        <h3>${item.title}</h3>
                        <p><strong>${item.company}</strong> | ${item.dates}</p>
                        <ul>${item.details.map(detail => `<li>${detail}</li>`).join('')}</ul>
                        <p><strong>${techLabel}:</strong> ${item.techUsed.join(', ')}</p>
                    `;
                    }).join('')}

                    <h2>${this._s('education_subheading')}</h2>
                    ${this._educationEntries().map((item) => `<p><strong>${item.degree}</strong> - ${item.school}</p>`).join('')}

                    <h2>${this._s('certs_subheading')}</h2>
                    ${this._certEntries().map((item) => `<p><strong>${item.label}</strong> ${item.value}</p>`).join('')}
                `;

                const fullHtml = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8"></head><body>${content}</body></html>`;
                const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'CarlosMunozCV_ATS.doc';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            _exportAsPDF() {
                this._prepareAndCleanupForPrint(() => {
                    window.print();
                });
            },

            _exportAsPDF_jsPDF() {
                const jsPDF = window.jsPDF;
                const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

                const experiences = this.data.experiences;
                const skills = this.data.skills;
                const liveURL = "https://kaanmuar.github.io/";

                // --- DOCUMENT STYLES ---
                const MARGIN = 40;
                const PAGE_HEIGHT = doc.internal.pageSize.getHeight();
                const PAGE_WIDTH = doc.internal.pageSize.getWidth();
                const FONT_SIZES = { h1: 22, h2: 16, h3: 12, body: 10, small: 8 };
                const COLORS = { primary: '#12181f', secondary: '#4a5560', link: '#0d6e76' };
                let cursor = MARGIN;

                const addText = (text, size, x, y, options = {}) => {
                    if (!text) return 0;
                    doc.setFontSize(size);
                    doc.setTextColor(options.color || COLORS.primary);
                    doc.setFont('helvetica', options.style || 'normal');
                    const textLines = doc.splitTextToSize(text, options.maxWidth || PAGE_WIDTH - x - MARGIN);
                    doc.text(textLines, x, y, { align: options.align });
                    return doc.getTextDimensions(textLines).h;
                };

                const checkPageBreak = (sectionHeight) => {
                    if (cursor + sectionHeight > PAGE_HEIGHT - MARGIN) {
                        doc.addPage();
                        cursor = MARGIN;
                    }
                };

                // --- HEADER & CONTACT ---
                cursor += addText('CARLOS A. MUÑOZ', FONT_SIZES.h1, PAGE_WIDTH / 2, cursor, { align: 'center', style: 'bold' });
                cursor += 5;
                cursor += addText(this._s('job_title'), FONT_SIZES.h2, PAGE_WIDTH / 2, cursor, { align: 'center', color: COLORS.secondary });
                cursor += 15;
                doc.setFontSize(FONT_SIZES.body);
                doc.setTextColor(COLORS.link);
                doc.textWithLink('kaanmuar@gmail.com', MARGIN, cursor, { url: 'mailto:kaanmuar@gmail.com' });
                doc.textWithLink(this._s('print_linkedin', 'LinkedIn Profile'), MARGIN + 150, cursor, { url: 'https://www.linkedin.com/in/carlos-andres-m-2a60b8b/' });
                doc.textWithLink('+57 320 919 1010', MARGIN + 300, cursor, { url: 'tel:+573209191010' });
                cursor += 15;
                doc.textWithLink('WhatsApp', MARGIN, cursor, { url: 'https://wa.me/573209191010' });
                doc.textWithLink('Telegram', MARGIN + 150, cursor, { url: 'https://t.me/+573209191010' });
                doc.textWithLink(this._s('print_online_cv'), MARGIN + 300, cursor, { url: liveURL });
                cursor += 20;
                doc.line(MARGIN, cursor, PAGE_WIDTH - MARGIN, cursor);
                cursor += 20;

                // --- SUMMARY & TOOLKIT ---
                checkPageBreak(80);
                cursor += addText(this._s('summary_title'), FONT_SIZES.h2, MARGIN, cursor, { style: 'bold' });
                cursor += 10;
                const summaryText = [this._s('summary_text'), this._s('summary_detail_1'), this._s('summary_detail_2')].filter(Boolean).join(' ');
                cursor += addText(summaryText, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2), color: COLORS.secondary });
                cursor += 25;
                checkPageBreak(200);
                cursor += addText(this._s('toolkit_title'), FONT_SIZES.h2, MARGIN, cursor, { style: 'bold' });
                cursor += 10;
                Object.keys(skills).forEach(categoryKey => {
                    const categoryName = this._s(`toolkit_${categoryKey}`, categoryKey);
                    const skillsText = skills[categoryKey].map(s => s.name).join(', ');
                    cursor += addText(categoryName, FONT_SIZES.body, MARGIN, cursor, { style: 'bold', maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                    cursor += 2;
                    cursor += addText(skillsText, FONT_SIZES.body, MARGIN + 5, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) - 5, color: COLORS.secondary });
                    cursor += 10;
                });

                // --- EXPERIENCE ---
                checkPageBreak(60);
                doc.addPage();
                cursor = MARGIN;
                cursor += addText(this._s('experience_title'), FONT_SIZES.h2, MARGIN, cursor, { style: 'bold' });
                experiences.forEach((exp, i) => {
                    const item = this._experienceExport(exp, i);
                    checkPageBreak(80);
                    cursor += 15;
                    cursor += addText(`${item.title} — ${item.company}`, FONT_SIZES.h3, MARGIN, cursor, { style: 'bold', maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                    cursor += 2;
                    cursor += addText(item.dates, FONT_SIZES.body, MARGIN, cursor, { color: COLORS.secondary, style: 'italic' });
                    cursor += 10;
                    item.details.forEach(detail => {
                        checkPageBreak(15);
                        cursor += 5;
                        cursor += addText(`• ${detail}`, FONT_SIZES.body, MARGIN + 10, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) - 10, color: COLORS.secondary });
                    });
                    cursor += 10;
                    checkPageBreak(15);
                    cursor += addText(`${this._s('print_technologies')}: ${item.techUsed.join(', ')}`, FONT_SIZES.small, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2), color: COLORS.link });
                });

                // **NEW**: Add Spoken Languages section
                checkPageBreak(100);
                cursor += 20;
                cursor += addText(this._s('languages_title'), FONT_SIZES.h2, MARGIN, cursor, { style: 'bold' });
                cursor += 10;
                cursor += addText(`${this._s('lang_name_es')}: ${this._s('lang_native')}`, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                cursor += 5;
                cursor += addText(`${this._s('lang_name_en')}: ${this._s('lang_fluent')} (C2)`, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                cursor += 5;
                cursor += addText(`${this._s('lang_name_pt')}: ${this._s('lang_fluent')}`, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                cursor += 5;
                cursor += addText(`${this._s('lang_others')}: ${this._s('lang_basic')}`, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });

                // **NEW**: Add Education & Certifications section
                checkPageBreak(120);
                cursor += 20;
                cursor += addText(this._s('education_title'), FONT_SIZES.h2, MARGIN, cursor, { style: 'bold' });
                cursor += 10;
                cursor += addText(this._s('education_subheading'), FONT_SIZES.h3 - 1, MARGIN, cursor, {});
                cursor += 5;
                this._educationEntries().forEach((item) => {
                    cursor += addText(item.degree + ' - ' + item.school, FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });
                    cursor += 5;
                });
                cursor += 10;
                cursor += addText(this._s('certs_subheading'), FONT_SIZES.h3 - 1, MARGIN, cursor, {});
                cursor += 5;
                cursor += addText(this._certEntries().map((item) => item.label + ' ' + item.value).join(' | '), FONT_SIZES.body, MARGIN, cursor, { maxWidth: PAGE_WIDTH - (MARGIN * 2) });

                // --- FOOTER ---
                const pageCount = doc.internal.getNumberOfPages();
                for(let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(FONT_SIZES.small);
                    doc.setTextColor(COLORS.secondary);
                    doc.text(`Carlos A. Muñoz | Interactive CV: ${liveURL}`, MARGIN, PAGE_HEIGHT - 20);
                    doc.text(this._s('print_page', 'Page {current} of {total}').replace('{current}', String(i)).replace('{total}', String(pageCount)), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 20, { align: 'right' });
                }

                doc.save('CarlosMunozCV_Export.pdf');
            },

            async _exportAsJPG() {
                // **FIX**: Create the loading indicator if it doesn't exist.
                let loadingIndicator = document.getElementById('export-loading-overlay');
                if (!loadingIndicator) {
                    loadingIndicator = document.createElement('div');
                    loadingIndicator.id = 'export-loading-overlay';
                    loadingIndicator.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); color: white; display: flex; align-items: center; justify-content: center; z-index: 9999; font-size: 1.5rem;';
                    document.body.appendChild(loadingIndicator);
                }
                loadingIndicator.textContent = this._s('print_generating_jpg', 'Generating JPG, please wait...');
                loadingIndicator.style.display = 'flex';

                const printContainer = document.createElement('div');
                printContainer.id = 'temp-print-content';
                printContainer.style.position = 'absolute';
                printContainer.style.left = '-9999px';
                printContainer.style.width = '800px';
                printContainer.innerHTML = this._generatePrintableHTML();
                document.body.appendChild(printContainer);

                // Preload all images inside the temporary container
                const images = printContainer.querySelectorAll('img');
                const promises = [...images].map(img => new Promise((resolve) => {
                    if (img.complete) return resolve();
                    img.onload = resolve;
                    img.onerror = resolve; // Resolve even if an image fails to load
                }));

                await Promise.all(promises);
                await new Promise(resolve => setTimeout(resolve, 500)); // Extra delay for fonts

                try {
                    const canvas = await html2canvas(printContainer.querySelector('.print-only-container'), {
                        scale: 2, // High resolution
                        useCORS: true,
                        backgroundColor: '#ffffff'
                    });

                    // Trigger the download
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    const link = document.createElement('a');
                    link.href = imgData;
                    link.download = 'CarlosMunozCV_2025.jpg';
                    link.click();

                } catch (err) {
                    console.error("Error generating JPG:", err);
                    alert("Sorry, an error occurred while generating the JPG image.");
                } finally {
                    // Clean up
                    document.body.removeChild(printContainer);
                    loadingIndicator.style.display = 'none';
                }
            },

            _exportAsDOC() {
                const experiences = this.data.experiences;
                const skills = this.data.skills;
                const liveURL = "https://kaanmuar.github.io/";
                const techLabel = this._s('print_technologies', 'Technologies Used');
                const summaryFullText = [this._s('summary_text'), this._s('summary_detail_1'), this._s('summary_detail_2')].filter(Boolean).join(' ');

                let content = `
                    <div style="font-family: Arial, sans-serif; font-size: 10pt;">
                        <h1 style="text-align: center; font-size: 22pt; margin-bottom: 5px;">CARLOS A. MUÑOZ</h1>
                        <p style="text-align: center; font-size: 14pt; margin-top: 0;">${this._s('job_title')}</p>
                        <p style="text-align: center;">
                            <a href="mailto:kaanmuar@gmail.com">kaanmuar@gmail.com</a> |
                            <a href="https://www.linkedin.com/in/carlos-andres-m-2a60b8b/">${this._s('print_linkedin')}</a> |
                            +57 320 919 1010 |
                            <a href="${liveURL}">${this._s('print_online_cv')}</a>
                        </p>
                        <hr>
                        <h2>${this._s('summary_title')}</h2>
                        <p>${summaryFullText}</p>

                        <h2>${this._s('toolkit_title')}</h2>
                        ${Object.keys(skills).map(key => `
                            <p><strong>${this._s(`toolkit_${key}`, key)}:</strong> ${skills[key].map(s => s.name).join(', ')}</p>
                        `).join('')}

                        <h2>${this._s('languages_title')}</h2>
                        <p><strong>${this._s('lang_name_es')}:</strong> ${this._s('lang_native')}</p>
                        <p><strong>${this._s('lang_name_en')}:</strong> ${this._s('lang_fluent')} (C2)</p>
                        <p><strong>${this._s('lang_name_pt')}:</strong> ${this._s('lang_fluent')}</p>
                        <p><strong>${this._s('lang_others')}:</strong> ${this._s('lang_basic')}</p>

                        <h2>${this._s('experience_title')}</h2>
                        ${experiences.map((exp, i) => {
                            const item = this._experienceExport(exp, i);
                            return `
                            <hr>
                            <h3 style="margin-bottom: 2px;">${item.title} — ${item.company}</h3>
                            <p style="margin-top: 0; font-style: italic;">${item.dates}</p>
                            <ul style="margin-top: 5px;">${item.details.map(detail => `<li>${detail}</li>`).join('')}</ul>
                            <p><strong>${techLabel}:</strong> ${item.techUsed.join(', ')}</p>
                        `;
                        }).join('')}

                        <h2>${this._s('education_title')}</h2>
                        <h4>${this._s('education_subheading')}</h4>
                        ${this._educationEntries().map((item) => `<p><strong>${item.degree}</strong> - ${item.school}</p>`).join('')}
                        <h4>${this._s('certs_subheading')}</h4>
                        <p>${this._certEntries().map((item) => `<strong>${item.label}</strong> ${item.value}`).join(' | ')}</p>
                    </div>
                `;

                const fullHtml = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8"></head><body>${content}</body></html>`;
                const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'CarlosMunozCV_Export.doc';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            _exportAsText() {
                const experiences = this.data.experiences;
                const skills = this.data.skills;
                const liveURL = "https://kaanmuar.github.io/";
                const techLabel = this._s('print_technologies', 'Technologies Used');
                const summaryFullText = [this._s('summary_text'), this._s('summary_detail_1'), this._s('summary_detail_2')].filter(Boolean).join(' ');

                let textContent = `CV: Carlos A. Muñoz\n====================\n\n`;
                textContent += `${this._s('job_title')}\n\n`;
                textContent += `## ${this._s('contact_title')} ##\nEmail: kaanmuar@gmail.com\nLinkedIn: https://www.linkedin.com/in/carlos-andres-m-2a60b8b/\nPhone: +57 320 919 1010\n${this._s('print_online_cv')}: ${liveURL}\n\n`;
                textContent += `## ${this._s('summary_title')} ##\n${summaryFullText}\n\n`;

                textContent += `## ${this._s('toolkit_title')} ##\n`;
                Object.keys(skills).forEach(key => {
                    textContent += `\n${this._s(`toolkit_${key}`, key)}:\n- ${skills[key].map(s => s.name).join(', ')}\n`;
                });

                textContent += `\n## ${this._s('languages_title')} ##\n- ${this._s('lang_name_es')}: ${this._s('lang_native')}\n- ${this._s('lang_name_en')}: ${this._s('lang_fluent')} (C2)\n- ${this._s('lang_name_pt')}: ${this._s('lang_fluent')}\n- ${this._s('lang_others')}: ${this._s('lang_basic')}\n\n`;

                textContent += `## ${this._s('experience_title')} ##\n\n`;
                experiences.forEach((exp, i) => {
                    const item = this._experienceExport(exp, i);
                    textContent += `--------------------\n`;
                    textContent += `${item.title} — ${item.company} (${item.dates})\n`;
                    item.details.forEach(detail => {
                        textContent += `- ${detail}\n`;
                    });
                    textContent += `${techLabel}: ${item.techUsed.join(', ')}\n\n`;
                });

                textContent += `## ${this._s('education_title')} ##\n\n${this._s('education_subheading')}:\n${this._educationEntries().map((item) => '- ' + item.degree + ' - ' + item.school).join('\n')}\n\n${this._s('certs_subheading')}:\n${this._certEntries().map((item) => '- ' + item.label + ' ' + item.value).join('\n')}\n`;

                const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(textContent);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "CarlosMunozCV_Export.txt");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            },

            _exportAsJSON() {
                const payload = this._getCleanExportData();
                const lang = this.state.lang || 'en';
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", `carlos_munoz_cv_${lang}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            },

            _getCleanExportData() {
                const lang = this._exportLangCode();
                const dataCopy = JSON.parse(JSON.stringify(this.data));
                return {
                    language: this.state.lang || lang,
                    skills: dataCopy.skills,
                    experiences: dataCopy.experiences.map((exp, i) => {
                        const item = this._experienceExport(exp, i);
                        return { ...exp, title: item.title, details: item.details };
                    }),
                    radarTooltips: { [lang]: (dataCopy.radarTooltips && dataCopy.radarTooltips[lang]) || dataCopy.radarTooltips.en },
                    translations: { [lang]: dataCopy.translations[lang] || dataCopy.translations.en }
                };
            },

            /*_handleStickyHeader() {
                // This function now ONLY handles the mobile sticky bar.
                const mobileHeader = document.querySelector('.sidebar .md\\:hidden .flex.items-center.space-x-2.no-print');

                if (!mobileHeader) return; // Exit if the mobile header isn't on the page

                // Create a placeholder to prevent content jump on mobile
                const mobilePlaceholder = document.createElement('div');
                mobilePlaceholder.className = 'sticky-placeholder';
                mobileHeader.parentNode.insertBefore(mobilePlaceholder, mobileHeader);

                // Function to set the placeholder's height
                const updateMobilePlaceholderHeight = () => {
                    requestAnimationFrame(() => {
                        mobilePlaceholder.style.height = `${mobileHeader.offsetHeight}px`;
                    });
                };

                // This function runs on scroll to make the mobile bar sticky
                const handleMobileScroll = () => {
                    // Only run this logic on mobile screen sizes
                    if (window.innerWidth > 767) {
                        mobileHeader.classList.remove('is-sticky');
                        mobilePlaceholder.classList.remove('is-sticky');
                        return;
                    }

                    const shouldBeSticky = mobilePlaceholder.getBoundingClientRect().top < 0;
                    mobileHeader.classList.toggle('is-sticky', shouldBeSticky);
                    mobilePlaceholder.classList.toggle('is-sticky', shouldBeSticky);
                };

                // --- Attach Event Listeners ---
                window.addEventListener('scroll', handleMobileScroll, { passive: true });
                window.addEventListener('resize', () => {
                    updateMobilePlaceholderHeight();
                    handleMobileScroll();
                }, { passive: true });

                // --- Initial Setup ---
                updateMobilePlaceholderHeight();
            },*/
            _initMobileStickyBar() {
                const mobileToolbarWrapper = document.querySelector('.mobile-toolbar-wrapper');
                if (!mobileToolbarWrapper) return;

                // The placeholder prevents content from jumping when the toolbar becomes 'fixed'.
                const placeholder = document.createElement('div');
                // It's inserted right before the toolbar's wrapper.
                mobileToolbarWrapper.parentNode.insertBefore(placeholder, mobileToolbarWrapper);

                // This function ensures the placeholder has the same height as the toolbar.
                const updateHeight = () => {
                    requestAnimationFrame(() => {
                        placeholder.style.height = `${mobileToolbarWrapper.offsetHeight}px`;
                    });
                };

                // This is the main logic that runs when the user scrolls.
                const handleScroll = () => {
                    const toolbar = mobileToolbarWrapper.querySelector('.mobile-toolbar');
                    if (!toolbar) return;

                    // If we are on a desktop-sized screen, disable the sticky feature.
                    if (window.innerWidth > 767) {
                        toolbar.classList.remove('is-sticky');
                        placeholder.style.display = 'none'; // Hide the placeholder
                        return;
                    }

                    // On mobile, ensure the placeholder is visible.
                    placeholder.style.display = 'block';

                    // Check if the placeholder has scrolled off the top of the screen.
                    const shouldBeSticky = placeholder.getBoundingClientRect().top < 0;

                    // Add or remove the 'is-sticky' class from the toolbar based on the scroll position.
                    toolbar.classList.toggle('is-sticky', shouldBeSticky);
                };

                // Attach the event listeners.
                window.addEventListener('scroll', handleScroll, { passive: true });
                window.addEventListener('resize', () => { updateHeight(); handleScroll(); }, { passive: true });

                // Set the initial height.
                updateHeight();
            },

            _initStickyObserver() {
                const header = document.getElementById('page-header-controls');
                if (!header) return;

                const sentinel = document.createElement('div');
                sentinel.style.height = '1px';
                // This correctly places the sentinel *inside* main, right before the header.
                header.parentNode.insertBefore(sentinel, header);

                const observer = new IntersectionObserver(([entry]) => {
                    document.body.classList.toggle('header-is-stuck', !entry.isIntersecting);
                }, { threshold: [0] });

                observer.observe(sentinel);
            },

            init() {
                // Add new state flags for our fix
                this.state.shareMenuInitialized = false;
                this.state.exportMenuInitialized = false;
                this.state.langMenuInitialized = false;

                this._cacheDOMElements();
                this._renderAll();
                this._forceShowAllContent();
                this._initStickyObserver();
                this._loadBlocklist();
                this._applyUrlLanguage();
                this._applyInitialTheme();
                this._createWatermark();
                this._populateAllTranslations();
                this._initMobileStickyBar();
                this._setupEventListeners();
                this._initScrollAnimations();
                this._initUrlHighlighting();
                this._initContactWidget();
                this._initScrollTrigger();
                this._noteCvAccess();

                this._bootLanguage();

                // Load asynchronous content after the main UI is ready.
                try { this._loadAndRenderReviews(); }
                catch (error) { console.error("Failed to load testimonials:", error); }

                // Start the tour if it hasn't been seen.
                if (!sessionStorage.getItem('hasSeenTour')) {
                    setTimeout(() => this.startTour(true), 1000);
                }
            },


            // ==========================================================
            // |            NEW JAVASCRIPT: TOUR FUNCTIONS              |
            // ==========================================================
            startTour(isAutoStart = false) {
                if (this.state.isTourActive) return;

                const tourOverlay = this.DOMElements.tourOverlay;
                if (!tourOverlay) {
                    console.error("Tour cannot start: #tour-overlay element not found.");
                    return;
                }

                this.state.isTourActive = true;
                this.state.currentTourStep = 0;
                this.state.tourDemoReady = false;
                tourOverlay.style.display = 'block';

                // Add overlay click to advance tour
                this.boundOverlayClick = () => this.nextTourStep();
                tourOverlay.addEventListener('click', this.boundOverlayClick);

                // Other event listeners
                this.boundHandleTourKey = this.handleTourKey.bind(this);
                this.boundNextTourStep = this.nextTourStep.bind(this);
                this.boundPrevTourStep = this.prevTourStep.bind(this);
                this.boundEndTour = this.endTour.bind(this);

                document.body.addEventListener('keydown', this.boundHandleTourKey);
                this.DOMElements.tourNextBtn.addEventListener('click', this.boundNextTourStep);
                this.DOMElements.tourBackBtn.addEventListener('click', this.boundPrevTourStep);
                this.DOMElements.tourCloseBtn.addEventListener('click', this.boundEndTour);

                this.showTourStep(this.state.currentTourStep);

                sessionStorage.setItem('hasSeenTour', 'true');
                this._trackEvent('tour_started', 'Interactive Tour', isAutoStart ? 'Auto' : 'Manual');
            },

            endTour() {
                if (!this.state.isTourActive) return;
                this.state.isTourActive = false;
                this.DOMElements.tourOverlay.style.display = 'none';
                this.DOMElements.tourTooltip.classList.remove('visible');

                document.querySelectorAll('.tour-highlight, .tour-highlight-seen').forEach(el => {
                    el.classList.remove('tour-highlight', 'tour-highlight-seen');
                });
                ['language-selector', 'language-selector-mobile'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add('collapsed');
                });

                this.DOMElements.tourOverlay.removeEventListener('click', this.boundOverlayClick);
                document.body.removeEventListener('keydown', this.boundHandleTourKey);
                this.DOMElements.tourNextBtn.removeEventListener('click', this.boundNextTourStep);
                this.DOMElements.tourBackBtn.removeEventListener('click', this.boundPrevTourStep);
                this.DOMElements.tourCloseBtn.removeEventListener('click', this.boundEndTour);

                this._clearTourProgress();
                this._resetFilters({ silent: true });
                this._trackEvent('tour_ended', 'Interactive Tour', `Step ${this.state.currentTourStep + 1}`);
            },

            nextTourStep() {
                if (!this.state.tourDemoReady) return;
                if (this.state.currentTourStep < this.tourSteps.length - 1) {
                    this.state.currentTourStep++;
                    this.showTourStep(this.state.currentTourStep);
                } else {
                    this.endTour(); // Finish tour on last step
                }
            },

            prevTourStep() {
                if (this.state.currentTourStep > 0) {
                    this.state.currentTourStep--;
                    this.showTourStep(this.state.currentTourStep);
                }
            },

            showTourStep(stepIndex, runActionAndAnimation = true) {
                const oldHighlight = document.querySelector('.tour-highlight');
                if (oldHighlight) {
                    oldHighlight.classList.remove('tour-highlight');
                    oldHighlight.classList.add('tour-highlight-seen');
                }

                    this.DOMElements.tourTooltip.classList.remove('visible');
                    const step = this.tourSteps[stepIndex];
                    const selector = typeof step.element === 'function' ? step.element.call(this) : step.element;
                    const targetElement = document.querySelector(selector);

                if (!targetElement) {
                    this.state.tourDemoReady = true;
                    this.nextTourStep();
                    return;
                }

                if (runActionAndAnimation) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }

                setTimeout(() => {
                    targetElement.classList.add('tour-highlight');

                    const translations = this._t();
                    this.DOMElements.tourTitle.textContent = translations[step.titleKey] || step.titleKey;
                    this.DOMElements.tourDescription.textContent = translations[step.descriptionKey] || step.descriptionKey;
                    if (window.SiteI18n) SiteI18n.refreshTranslation();
                    this.DOMElements.tourStepCounter.textContent = `${stepIndex + 1} / ${this.tourSteps.length}`;

                    this.DOMElements.tourBackBtn.style.display = stepIndex === 0 ? 'none' : 'inline-block';
                    this.DOMElements.tourNextBtn.textContent = stepIndex === this.tourSteps.length - 1 ? translations.tour_finish : translations.tour_next;
                    if (runActionAndAnimation) {
                        this.DOMElements.tourNextBtn.disabled = true;
                        this.DOMElements.tourNextBtn.classList.remove('tour-next-ready');
                    }

                    const tooltip = this.DOMElements.tourTooltip;

                    tooltip.classList.add('visible');

                    if (runActionAndAnimation && step.analyticsTag) {
                        this._trackEvent('tour_step_viewed', 'Interactive Tour', step.analyticsTag);
                    }
                    if (runActionAndAnimation && typeof step.action === 'function') {
                        step.action.call(this);
                    }
                    if (runActionAndAnimation) {
                        this._startTourProgress(step.demoMs || 2500);
                    } else {
                        this._markTourDemoReady();
                    }
                }, runActionAndAnimation ? 600 : 50);
            },

            handleTourKey(e) {
                if (!this.state.isTourActive) return;
                if (e.key === 'Escape') {
                    this.endTour();
                } else if (e.key === 'ArrowRight') {
                    if (this.state.tourDemoReady) this.nextTourStep();
                } else if (e.key === 'ArrowLeft') {
                    this.prevTourStep();
                }
            },

            _clearTourProgress() {
                if (this._tourProgressTimer) {
                    clearTimeout(this._tourProgressTimer);
                    this._tourProgressTimer = null;
                }
                const fill = this.DOMElements.tourProgressFill;
                if (!fill) return;
                fill.style.transition = 'none';
                fill.style.width = '0%';
            },

            _startTourProgress(ms) {
                this.state.tourDemoReady = false;
                const fill = this.DOMElements.tourProgressFill;
                const bar = this.DOMElements.tourProgress;
                const next = this.DOMElements.tourNextBtn;
                if (next) {
                    next.disabled = true;
                    next.classList.remove('tour-next-ready');
                }
                if (!fill) {
                    this._tourProgressTimer = setTimeout(() => this._markTourDemoReady(), ms);
                    return;
                }
                this._clearTourProgress();
                if (bar) bar.setAttribute('aria-valuenow', '0');
                void fill.offsetWidth;
                fill.style.transition = `width ${ms}ms linear`;
                fill.style.width = '100%';
                this._tourProgressTimer = setTimeout(() => this._markTourDemoReady(), ms);
            },

            _markTourDemoReady() {
                this.state.tourDemoReady = true;
                this._tourProgressTimer = null;
                const next = this.DOMElements.tourNextBtn;
                const bar = this.DOMElements.tourProgress;
                if (bar) bar.setAttribute('aria-valuenow', '100');
                if (next) {
                    next.disabled = false;
                    next.classList.add('tour-next-ready');
                }
            },

            _typewriterEffect(element, text, onComplete) {
                let i = 0;
                element.value = '';
                element.focus();
                element.classList.add('is-typing');
                const typingInterval = setInterval(() => {
                    if (i < text.length) {
                        element.value += text.charAt(i);
                        i++;
                    } else {
                        clearInterval(typingInterval);
                        element.classList.remove('is-typing');
                        if (onComplete) onComplete();
                    }
                }, 50); // Typing speed
            },

            _glowElement(element, duration = 1500) {
                if(!element) return;
                element.classList.add('pulse-highlight');
                setTimeout(() => element.classList.remove('pulse-highlight'), duration);
            },

            _demoLanguageTour() {
                const isMobile = window.innerWidth < 768;
                if (!this.state.langMenuInitialized) {
                    this._populateLanguageOptions(false);
                    this._populateLanguageOptions(true);
                    this.state.langMenuInitialized = true;
                }
                const selector = document.getElementById(isMobile ? 'language-selector-mobile' : 'language-selector');
                const options = document.getElementById(isMobile ? 'language-options-mobile' : 'language-options');
                if (!selector || !options) return;
                this._applyClickEffect(selector);
                selector.classList.remove('collapsed');
                const search = options.querySelector('.lang-search');
                const list = options.querySelector('.lang-options-list');
                if (list) this._glowElement(list, 2200);
                const closeMenu = () => {
                    if (search) {
                        search.value = '';
                        search.dispatchEvent(new Event('input'));
                    }
                    selector.classList.add('collapsed');
                };
                if (search) {
                    setTimeout(() => {
                        this._typewriterEffect(search, 'port', () => {
                            search.dispatchEvent(new Event('input'));
                            setTimeout(closeMenu, 1600);
                        });
                    }, 400);
                } else {
                    setTimeout(closeMenu, 2400);
                }
            },

            _demoGlanceTour() {
                const section = document.querySelector('.infographics-section');
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const kpis = this.DOMElements.glanceKpis;
                const pauseBtn = this.DOMElements.chartPauseBtn;
                const dots = this.DOMElements.chartDots ? [...this.DOMElements.chartDots.querySelectorAll('.chart-dot')] : [];
                const start = window.innerWidth < 768 ? 700 : 250;
                const run = (ms, fn) => window.setTimeout(() => {
                    if (!this.state.isTourActive) return;
                    fn();
                }, start + ms);
                run(0, () => this._glowElement(kpis, 1800));
                run(900, () => {
                    this._showGlancePair(2, true);
                    if (dots[2]) this._applyClickEffect(dots[2]);
                });
                run(1700, () => this._glowElement(this.DOMElements.competenciesRadarChart, 1600));
                run(2800, () => {
                    this._showGlancePair(4, true);
                    if (dots[4]) this._applyClickEffect(dots[4]);
                    this._glowElement(this.DOMElements.methodologiesRadarChart, 1500);
                });
                run(4300, () => {
                    if (pauseBtn) {
                        this._applyClickEffect(pauseBtn);
                        this._glowElement(pauseBtn, 1400);
                    }
                });
                run(5400, () => {
                    this._showGlancePair(5, true);
                    if (dots[5]) this._applyClickEffect(dots[5]);
                });
                run(6800, () => this._glowElement(this.DOMElements.timelineContainer, 2000));
                run(9000, () => this._showGlancePair(0, true));
            },

            _demoSimulatorTour() {
                const btn = document.getElementById(window.innerWidth < 768 ? 'sim-launch-btn-mobile' : 'sim-launch-btn');
                if (!btn) return;
                this._applyClickEffect(btn, 800);
                this._glowElement(btn, 2200);
                const tip = btn.querySelector('.tooltiptext');
                if (tip) {
                    tip.style.visibility = 'visible';
                    tip.style.opacity = '1';
                    setTimeout(() => {
                        tip.style.visibility = '';
                        tip.style.opacity = '';
                    }, 2200);
                }
            },

            _demoQaLabTour() {
                const target = document.getElementById(window.innerWidth < 768 ? 'qa-lab-btn-mobile' : 'qa-lab-btn');
                if (!target) return;
                this._applyClickEffect(target, 800);
                this._glowElement(target, 2600);
                const tip = target.querySelector('.tooltiptext');
                if (tip) {
                    tip.style.visibility = 'visible';
                    tip.style.opacity = '1';
                    setTimeout(() => {
                        tip.style.visibility = '';
                        tip.style.opacity = '';
                    }, 2600);
                }
            },

            _setTourTooltipTransparency(isTransparent) {
                if (this.DOMElements.tourTooltip) {
                    this.DOMElements.tourTooltip.classList.toggle('transparent-mode', isTransparent);
                }
            },

            _getRandomTopic() {
                const options = this.DOMElements.messageTopic.querySelectorAll('option');
                // Get a random option, excluding the first one which is the placeholder
                const randomIndex = Math.floor(Math.random() * (options.length - 1)) + 1;
                return options[randomIndex].value;
            },

            _getRandomRating() {
                // Return a random rating between 4 and 5
                return Math.floor(Math.random() * 2) + 4;
            },

            _getRandomComment() {
                const comments = ["Excellent work!", "Very impressive CV.", "Great interactive features.", "A very professional presentation."];
                return comments[Math.floor(Math.random() * comments.length)];
            },
        };

        window.CarlosMunozCV = CarlosMunozCV;

        CarlosMunozCV.init();
    }

    try {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    } catch (err) {
        console.error('CV app failed to start', err);
    }


