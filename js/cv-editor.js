const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
const LANG_NAMES = { en: 'English', es: 'Spanish', pt: 'Portuguese', de: 'German', fr: 'French', it: 'Italian' };
const PARTS = {
    identity: 'Photo, name, and title',
    contact: 'Contact',
    summary: 'Professional summary',
    competencies: 'Core competencies',
    spoken: 'Spoken languages',
    toolbar: 'Toolbar',
    share: 'Share links',
    downloads: 'Downloads',
    languages: 'Translation languages',
    theme: 'Theme',
    glance: 'Career at a Glance',
    timeline: 'Career timeline',
    toolkit: 'Technical and management toolkit',
    experience: 'Professional experience',
    education: 'Education and certifications',
    testimonials: 'Testimonials',
    messages: 'Message form',
    ratings: 'Rating form'
};
const PAGES = [
    ['profile', 'Profile', ['identity', 'contact']],
    ['about', 'About', ['summary', 'competencies', 'spoken']],
    ['career', 'Career', ['glance', 'timeline', 'experience']],
    ['toolkit', 'Toolkit', ['toolkit']],
    ['education', 'Education', ['education']],
    ['actions', 'Share and downloads', ['toolbar', 'share', 'downloads']],
    ['display', 'Theme and languages', ['theme', 'languages']],
    ['feedback', 'Messages and ratings', ['testimonials', 'messages', 'ratings']],
    ['review', 'Review', []]
];
const AVATARS = [
    ['atlas', 'Atlas'],
    ['nova', 'Nova'],
    ['cedar', 'Cedar'],
    ['iris', 'Iris'],
    ['sol', 'Sol'],
    ['marlow', 'Marlow']
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RATING_MARKS = [
    ['star', '★', 'Stars'],
    ['check', '✓', 'Checks'],
    ['circle', '●', 'Circles'],
    ['thumb', '👍', 'Thumbs'],
    ['diamond', '◆', 'Diamonds'],
    ['shield', '⛨', 'Shields']
];
const COMPETENCY_LINKS = {
    pm: ['Agile', 'Kanban', 'Scrum', 'Strategic Planning', 'Risk Management', 'Stakeholder Mgmt', 'Jira', 'TestRail', 'MS Project'],
    qa: ['Selenium', 'Cypress', 'Playwright', 'WebdriverIO', 'Protractor', 'Appium', 'Expresso', 'Robot Framework', 'Cucumber', 'JMeter', 'Katalon'],
    lead: ['Stakeholder Mgmt', 'Strategic Planning'],
    devops: ['Jenkins', 'Docker', 'GitHub', 'AWS', 'Azure DevOps', 'GCP'],
    cloud: ['AWS', 'Azure DevOps', 'GCP', 'Docker'],
    strategy: ['Strategic Planning', 'Risk Management', 'CMMI', 'ISO Standards'],
    relations: ['Stakeholder Mgmt'],
    ai: ['Cursor', 'Claude', 'GitHub Copilot', 'ChatGPT', 'Custom personalizations']
};
const SHARE_URLS = {
    linkedin: 'https://www.linkedin.com/in/carlos-andres-m-2a60b8b/',
    x: 'https://x.com/',
    facebook: 'https://www.facebook.com/',
    whatsapp: 'https://wa.me/573209191010',
    telegram: 'https://t.me/+573209191010',
    reddit: 'https://www.reddit.com/',
    pinterest: 'https://www.pinterest.com/',
    copy: 'https://carlosandmunoz.com/',
    github: 'https://github.com/',
    instagram: 'https://instagram.com/',
    youtube: 'https://youtube.com/'
};
const SHARE_PRESETS = {
    linkedin: ['LinkedIn', false, ''],
    x: ['X (Twitter)', false, ''],
    facebook: ['Facebook', false, ''],
    whatsapp: ['WhatsApp', false, ''],
    telegram: ['Telegram', false, ''],
    reddit: ['Reddit', false, ''],
    pinterest: ['Pinterest', false, ''],
    copy: ['Copy link', false, ''],
    github: ['GitHub', true, 'https://github.com/'],
    instagram: ['Instagram', true, 'https://instagram.com/'],
    youtube: ['YouTube', true, 'https://youtube.com/'],
    custom: ['Custom link', true, 'https://']
};
const DOWNLOAD_PRESETS = {
    pdf: ['PDF', false, ''],
    jpg: ['JPG', false, ''],
    doc: ['Word', false, ''],
    json: ['JSON', false, ''],
    text: ['Text', false, ''],
    custom: ['Custom download', true, 'https://']
};

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function lines(text) {
    return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 8).map((line) => line.slice(0, 400));
}

function blankBullets() {
    return Object.fromEntries(LANGS.map((lang) => [lang, '']));
}

const PHOTO_HISTORY_KEY = 'cv-photo-history';
const TOPIC_IDS = ['default', 'opportunity', 'inquiry', 'feedback', 'other'];

export function createCvEditor(deps) {
    const { db, auth, doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs, query, orderBy, limit, addDoc, storage, ref, uploadString, getDownloadURL } = deps;
    const SECTION_KEYS = {
        identity: ['profile'],
        contact: ['contact'],
        summary: ['summary', 'summaryTitle', 'summaryDetails'],
        competencies: ['competencies'],
        spoken: ['spoken'],
        toolbar: ['toolbar'],
        share: ['share'],
        downloads: ['downloads'],
        languages: ['languages'],
        theme: ['theme'],
        glance: ['glance'],
        timeline: ['timeline'],
        toolkit: ['toolkit'],
        experience: ['experience', 'roles'],
        education: ['education'],
        testimonials: ['feedback'],
        messages: ['feedback'],
        ratings: ['feedback']
    };
    let draft = null;
    let baseline = null;
    let skipped = new Set();
    let section = 'profile';
    let lang = 'en';
    let roleIndex = 0;
    let groupIndex = 0;
    let skillIndex = 0;
    let reviewStamp = 0;
    let reviewFrom = 'education';
    let bound = false;
    let photoHistory = [];

    function seed() {
        const data = window.CVData;
        const t = (data && data.translations && data.translations.en) || {};
        const skills = (data && data.skills) || {};
        const roleCount = (data && data.experiences && data.experiences.length) || 0;
        const skillCount = Object.values(skills).reduce((sum, list) => sum + list.length, 0);
        const companies = new Set((data && data.experiences || []).map((exp) => exp.company)).size;
        draft = {
            profile: { name: 'CARLOS A. MUÑOZ', title: t.job_title || '', certs: 'CSPM | ISTQB | CISA | CISSP', photo: '', photoRemoved: false, photoKind: 'file', avatar: '' },
            contact: {
                shown: true, title: t.contact_title || 'Contact',
                phone: { shown: true, label: 'Phone Number', value: '+57 320 919 1010' },
                email: { shown: true, value: 'kaanmuar@gmail.com' },
                linkedin: { shown: true, label: 'LinkedIn Profile', url: 'https://www.linkedin.com/in/carlos-andres-m-2a60b8b/' },
                whatsapp: { shown: true, label: 'WhatsApp', url: 'https://wa.me/573209191010' },
                telegram: { shown: true, label: 'Telegram', url: 'https://t.me/+573209191010' },
                location: { shown: true, value: 'Medellin, Antioquia, Colombia' },
                extras: []
            },
            summary: {},
            summaryTitle: t.summary_title || 'Professional Summary',
            summaryDetails: {},
            competencies: {
                shown: true, title: t.competencies_title || 'Core Competencies',
                items: ['pm', 'qa', 'lead', 'devops', 'cloud', 'strategy', 'relations', 'ai'].map((id) => ({
                    id,
                    label: t['competency_' + id] || (id === 'ai' ? 'AI Expertise' : id),
                    shown: true,
                    skills: (COMPETENCY_LINKS[id] || []).slice(),
                    roles: id === 'ai' ? [0] : []
                }))
            },
            spoken: {
                shown: true, title: t.languages_title || 'Languages',
                items: [
                    { name: 'Spanish', level: 'Native', percent: 100, flag: 'es', shown: true },
                    { name: 'English', level: 'Fluent', percent: 90, flag: 'gb', shown: true },
                    { name: 'Portuguese', level: 'Fluent', percent: 85, flag: 'pt', shown: true },
                    { name: 'Others', level: 'Basic', percent: 30, flag: '', shown: true }
                ]
            },
            toolbar: {
                hideCaptions: false,
                items: [
                    ['theme', 'Theme'], ['share', 'Share'], ['tour', 'How this Online CV works'], ['lang', 'Language'],
                    ['studio', 'Studio'], ['lab', 'Lab'], ['print', 'Print'], ['export', 'Export']
                ].map(([id, label]) => ({ id, label: t['toolbar_' + id] || label, shown: true }))
            },
            share: {
                items: Object.entries(SHARE_PRESETS).filter(([id]) => id !== 'custom').map(([id, row]) => ({
                    id, label: row[0], shown: row[1] !== true, custom: row[1] === true, url: SHARE_URLS[id] || row[2] || ''
                }))
            },
            downloads: {
                items: [
                    ['pdf', t.export_cv_pdf || 'PDF'], ['jpg', t.export_cv_jpg || 'JPG'], ['doc', t.export_cv_doc || 'Word'],
                    ['json', t.export_cv_json || 'JSON'], ['text', t.export_cv_text || 'Text']
                ].map(([id, label]) => ({ id, label, shown: true, custom: false, url: '' }))
            },
            languages: {
                items: LANGS.map((code) => ({ code, label: LANG_NAMES[code], shown: true }))
            },
            theme: { shown: true, label: t.toolbar_theme || 'Theme', tooltip: t.tooltip_theme || 'Toggle dark mode', lightLabel: 'Light', darkLabel: 'Dark' },
            glance: {
                shown: true, charts: true, title: t.infographics_title || 'Career at a Glance', note: t.infographics_live || 'Live snapshot from this CV · charts rotate',
                kpis: [
                    { key: 'years', label: 'Years', value: '18+', shown: true },
                    { key: 'roles', label: 'Roles', value: String(roleCount), shown: true },
                    { key: 'skills', label: 'Skills', value: String(skillCount), shown: true },
                    { key: 'companies', label: 'Companies', value: String(companies), shown: true },
                    { key: 'certs', label: 'Certs', value: '9', shown: true }
                ]
            },
            timeline: { shown: true, title: t.infographics_timeline_title || 'Career Timeline' },
            toolkit: {
                shown: true, title: t.toolkit_title || 'Technical & Management Toolkit',
                groups: Object.keys(skills).map((key) => ({
                    key, label: t['toolkit_' + key] || key, shown: true,
                    skills: skills[key].map((skill) => ({ name: skill.name, years: skill.years || '', stars: skill.stars || 3, shown: true }))
                }))
            },
            experience: { shown: true, title: t.experience_title || 'Professional Experience' },
            roles: ((data && data.experiences) || []).map((exp, source) => ({
                source, title: typeof exp.title === 'string' ? exp.title : ((exp.title && exp.title.en) || ''),
                company: exp.company || '', dates: exp.dates || '', shown: true, onTimeline: true,
                bullets: Object.fromEntries(LANGS.map((code) => [code, ((exp.details && exp.details[code]) || []).join('\n')]))
            })),
            education: {
                shown: true, title: t.education_title || 'Education & Certifications',
                educationTitle: t.education_subheading || 'Education', certsTitle: t.certs_subheading || 'Key Certifications',
                degrees: [
                    { degree: 'Specialization in Management on IT Projects', school: 'Alexander Von-Humboldt University', shown: true },
                    { degree: 'Computer Systems Engineering', school: 'EAMQ', shown: true },
                    { degree: 'Computer Systems Technician', school: 'EAMQ', shown: true }
                ],
                certs: [
                    { label: 'English Proficiency:', value: 'EF SET C2 Proficient', shown: true },
                    { label: 'Project Management:', value: 'CSPM', shown: true },
                    { label: 'Quality Assurance:', value: 'CASQ, CAST, CSQA, ISTQB', shown: true },
                    { label: 'Information Security:', value: 'CISA, CISM, CISSP', shown: true }
                ]
            },
            feedback: {
                testimonials: { shown: true, title: t.testimonials_title || 'Testimonials & Feedback' },
                widget: { shown: true },
                fields: { name: t.form_label_name || 'Name', email: t.form_label_email || 'Email' },
                message: {
                    shown: true,
                    tab: t.widget_tab_message || 'Message',
                    lead: t.widget_message_lead || '',
                    topic: t.form_label_topic || 'Topic',
                    body: t.form_label_message || 'Message',
                    attachment: t.form_label_attachment || 'Attachment (Optional)',
                    attach: t.form_button_attach || 'Attach File',
                    send: t.form_button_send || 'Send Message'
                },
                rating: {
                    shown: true,
                    tab: t.widget_tab_rate || 'Rate CV',
                    lead: t.widget_rating_lead || '',
                    label: t.form_label_rating || 'Overall Rating',
                    comments: t.form_label_comments || 'Comments (Optional)',
                    submit: t.form_button_submit_rating || 'Submit Rating',
                    mark: 'star'
                },
                topics: [
                    { id: 'default', label: t.topic_option_default || 'Select a topic...' },
                    { id: 'opportunity', label: t.topic_option_opportunity || 'Job Opportunity / Collaboration' },
                    { id: 'inquiry', label: t.topic_option_inquiry || 'Project Inquiry' },
                    { id: 'feedback', label: t.topic_option_feedback || 'CV Feedback' },
                    { id: 'other', label: t.topic_option_other || 'Other' }
                ]
            }
        };
        LANGS.forEach((code) => {
            const dict = data && data.translations && data.translations[code];
            draft.summary[code] = (dict && dict.summary_text) || '';
            draft.summaryDetails[code] = { a: (dict && dict.summary_detail_1) || '', b: (dict && dict.summary_detail_2) || '' };
        });
        takeBaseline();
    }

    function ensureLinkedContent() {
        if (!draft.competencies || !Array.isArray(draft.competencies.items)) return;
        draft.competencies.items.forEach((item) => {
            if (!Array.isArray(item.skills)) item.skills = (COMPETENCY_LINKS[item.id] || []).slice();
            if (!Array.isArray(item.roles)) item.roles = item.id === 'ai' ? [0] : [];
        });
        if (!draft.competencies.items.some((item) => item.id === 'ai')) {
            draft.competencies.items.push({ id: 'ai', label: 'AI Expertise', shown: true, skills: COMPETENCY_LINKS.ai.slice(), roles: [0] });
        }
        if (draft.toolkit && Array.isArray(draft.toolkit.groups) && !draft.toolkit.groups.some((group) => group.key === 'ai')) {
            const fileSkills = (window.CVData && CVData.skills && CVData.skills.ai) || [];
            draft.toolkit.groups.push({
                key: 'ai', label: 'AI practice:', shown: true,
                skills: fileSkills.map((skill) => ({ name: skill.name, years: skill.years || '1 Yr', stars: skill.stars || 4, shown: true }))
            });
        }
        if (draft.feedback && draft.feedback.rating && !draft.feedback.rating.mark) draft.feedback.rating.mark = 'star';
    }

    function takeBaseline() {
        baseline = JSON.parse(JSON.stringify(draft));
        skipped = new Set();
    }

    function restoreSection(id) {
        if (!baseline) return;
        if (id === 'timeline') {
            draft.timeline = JSON.parse(JSON.stringify(baseline.timeline));
            draft.roles.forEach((role, index) => {
                const base = baseline.roles[index];
                if (!base) return;
                role.onTimeline = base.onTimeline;
                role.title = base.title;
                role.company = base.company;
            });
            return;
        }
        (SECTION_KEYS[id] || []).forEach((key) => {
            draft[key] = JSON.parse(JSON.stringify(baseline[key]));
        });
    }

    function contentSections() {
        return PAGES.filter((item) => item[0] !== 'review');
    }

    function pageParts(id) {
        const page = PAGES.find((item) => item[0] === id);
        return (page && page[2]) || [];
    }

    function sectionDirty() {
        if (section === 'review' || !baseline) return false;
        return pageParts(section).some((part) => sectionSnapshot(draft, part) !== sectionSnapshot(baseline, part));
    }

    function restorePage(id) {
        pageParts(id).forEach(restoreSection);
    }

    function addNamed(list, id, map) {
        const preset = map[id];
        if (!preset) return 'missing';
        const existing = id !== 'custom' ? list.find((item) => item.id === id) : null;
        if (existing) {
            existing.shown = true;
            if (!existing.url && preset[2]) existing.url = preset[2];
            return 'shown';
        }
        const stock = preset[0] === 'Custom link' || preset[0] === 'Custom download';
        list.push({ id: id === 'custom' ? 'link' + Date.now() : id, label: stock ? '' : preset[0], url: preset[2] || '', shown: true, custom: preset[1] === true });
        return 'added';
    }

    function addContact(kind) {
        const presets = {
            phone: { kind: 'phone', label: 'Phone', value: '' },
            email: { kind: 'email', label: 'Email', value: '' },
            address: { kind: 'address', label: 'Address', value: '' },
            link: { kind: 'link', label: 'Link', value: 'https://' },
            github: { kind: 'link', label: 'GitHub', value: 'https://github.com/' },
            instagram: { kind: 'link', label: 'Instagram', value: 'https://instagram.com/' },
            youtube: { kind: 'link', label: 'YouTube', value: 'https://youtube.com/' }
        };
        const row = presets[kind];
        if (!row) return;
        if (!draft.contact.extras) draft.contact.extras = [];
        draft.contact.extras.push({ ...row, shown: true });
    }

    function syncSkip() {
        const button = document.getElementById('cv-skip');
        if (!button) return;
        const dirty = sectionDirty();
        button.disabled = dirty;
        button.title = dirty ? 'This section has changes. Next keeps them.' : 'Leave this section unchanged';
    }

    function skipSection() {
        read();
        if (sectionDirty()) return;
        restorePage(section);
        skipped.add(section);
        const pages = contentSections();
        const index = pages.findIndex((item) => item[0] === section);
        if (index >= pages.length - 1) {
            paint();
            if (!openReview()) return;
            paint();
            message('Left unchanged. Review the CV, then press Confirmation to publish.', true);
            return;
        }
        section = pages[index + 1][0];
        paint();
        message(`Left unchanged. Next: ${pages[index + 1][1]}.`, true);
    }

    function goNext() {
        if (section === 'review') return;
        read();
        const pages = contentSections();
        const index = pages.findIndex((item) => item[0] === section);
        if (index >= pages.length - 1) {
            if (!openReview()) return;
            paint();
            message('Review the CV, then press Confirmation to publish.', true);
            return;
        }
        section = pages[index + 1][0];
        paint();
    }

    function previewCv() {
        const body = payload();
        if (body.error) {
            message(body.error, false);
            return;
        }
        try {
            localStorage.setItem('cv-live-preview', JSON.stringify(body));
        } catch (error) {
            message('The preview is too large to store in this browser. Remove the photo or shorten a section, then try again.', false);
            return;
        }
        const stamp = Date.now();
        if (section === 'review') {
            reviewStamp = stamp;
            paint();
        }
        const tab = window.open(`index.html?cvpreview=1&draft=${stamp}`, 'cv-content-preview');
        if (tab) tab.focus();
        message('Preview opened. Visitors do not see it until you confirm.', true);
    }

    function requestPublish() {
        if (section === 'review') return;
        if (!openReview()) return;
        paint();
        message('Review the snapshot, then press Confirmation to publish.', true);
    }

    function goBack() {
        if (section === 'review') {
            section = reviewFrom || 'education';
            try { localStorage.removeItem('cv-live-preview'); } catch (error) { /* the preview key is optional */ }
            paint();
            return;
        }
        const pages = contentSections();
        const index = pages.findIndex((item) => item[0] === section);
        if (index <= 0) return;
        read();
        section = pages[index - 1][0];
        paint();
    }

    function openReview() {
        const body = payload();
        if (body.error) {
            message(body.error, false);
            return false;
        }
        try {
            localStorage.setItem('cv-live-preview', JSON.stringify(body));
        } catch (error) {
            message('The preview is too large to store in this browser. Remove the photo or shorten a section, then try again.', false);
            return false;
        }
        if (section !== 'review') reviewFrom = section;
        section = 'review';
        reviewStamp = Date.now();
        return true;
    }

    function discardEdits() {
        if (!confirm('Discard these edits? Nothing new is published.')) return;
        draft = JSON.parse(JSON.stringify(baseline));
        skipped = new Set();
        section = 'profile';
        lang = 'en';
        roleIndex = 0;
        groupIndex = 0;
        skillIndex = 0;
        reviewStamp = 0;
        try { localStorage.removeItem('cv-live-preview'); } catch (error) { /* the preview key is optional */ }
        paint();
        message('Edits discarded. The published CV is unchanged.', true);
    }

    function goTo(next) {
        if (next === section) return;
        if (section !== 'review') read();
        if (next === 'review') {
            if (!openReview()) paint();
            else paint();
            return;
        }
        section = next;
        paint();
    }

    function overlay(live) {
        seed();
        if (!live) return;
        if (live.summary) {
            LANGS.forEach((code) => { if (live.summary[code]) draft.summary[code] = live.summary[code]; });
            if (live.summary.title) draft.summaryTitle = live.summary.title;
        }
        if (live.summaryDetails) draft.summaryDetails = live.summaryDetails;
        if (Array.isArray(live.roles) && live.roles.length) {
            const fileRoles = draft.roles.slice();
            draft.roles = live.roles.slice(0, 24).map((role) => {
                const source = Number.isInteger(role.source) ? role.source : null;
                const fileRole = source !== null ? fileRoles[source] : null;
                const bullets = blankBullets();
                LANGS.forEach((code) => {
                    if (role.bullets && Array.isArray(role.bullets[code]) && role.bullets[code].length) bullets[code] = role.bullets[code].join('\n');
                    else if (fileRole) bullets[code] = fileRole.bullets[code] || '';
                });
                return {
                    source, title: role.title || '', company: role.company || '', dates: role.dates || '',
                    shown: role.hidden !== true, onTimeline: role.onTimeline !== false, bullets
                };
            });
        }
        if (live.version !== 2) return;
        ['profile', 'contact', 'competencies', 'spoken', 'toolbar', 'share', 'downloads', 'languages', 'theme', 'glance', 'timeline', 'toolkit', 'experience', 'education', 'feedback'].forEach((key) => {
            if (live[key]) draft[key] = revive(live[key]);
        });
        if (draft.profile && !draft.profile.photoKind) {
            draft.profile.photoKind = draft.profile.photoRemoved ? 'placeholder' : (draft.profile.photo ? 'upload' : 'file');
            draft.profile.avatar = '';
        }
        if (!draft.contact.extras) draft.contact.extras = [];
        ensureLinkedContent();
        takeBaseline();
    }

    function revive(node) {
        if (Array.isArray(node)) return node.map(revive);
        if (!node || typeof node !== 'object') return node;
        const copy = {};
        Object.keys(node).forEach((key) => {
            if (key === 'hidden') copy.shown = node.hidden !== true;
            else if (key === 'chartsHidden') copy.charts = node.chartsHidden !== true;
            else copy[key] = revive(node[key]);
        });
        return copy;
    }

    function read() {
        const body = document.getElementById('cv-section-body');
        if (!body || !draft) return;
        body.querySelectorAll('[data-bind]').forEach((el) => assign(draft, el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value));
        body.querySelectorAll('[data-list]').forEach((el) => {
            const list = lookup(draft, el.dataset.list);
            const item = list && list[Number(el.dataset.index)];
            if (!item) return;
            item[el.dataset.field] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
        });
        const summaryField = body.querySelector('[data-summary]');
        if (summaryField) draft.summary.en = summaryField.value;
        const detailField = body.querySelector('[data-detail]');
        if (detailField) draft.summaryDetails.en = { a: detailField.value, b: '' };
        body.querySelectorAll('[data-bullets]').forEach((el) => {
            const role = draft.roles[Number(el.dataset.index)];
            if (role) role.bullets.en = el.value;
        });
        body.querySelectorAll('[data-dates]').forEach((el) => {
            const list = lookup(draft, el.dataset.dates);
            const item = list && list[Number(el.dataset.index)];
            if (!item) return;
            const start = el.querySelector('[data-date-start]').value;
            const present = el.querySelector('[data-date-present]').checked;
            const end = el.querySelector('[data-date-end]').value;
            const next = formatRange(start, end, present);
            if (next) item.dates = next;
        });
        if (skipped.has(section) && sectionDirty()) skipped.delete(section);
        syncSkip();
    }

    function sectionSnapshot(source, id) {
        if (id === 'timeline') {
            return JSON.stringify({
                timeline: source.timeline,
                roles: (source.roles || []).map((role) => ({ title: role.title, company: role.company, onTimeline: role.onTimeline }))
            });
        }
        const bag = {};
        (SECTION_KEYS[id] || []).forEach((key) => { bag[key] = source[key]; });
        return JSON.stringify(bag);
    }

    function lookup(root, path) {
        return path.split('.').reduce((node, key) => (node ? node[key] : undefined), root);
    }

    function assign(root, path, value) {
        const keys = path.split('.');
        let node = root;
        keys.slice(0, -1).forEach((key) => {
            if (!node[key] || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        });
        node[keys[keys.length - 1]] = value;
    }

    function monthValue(chunk) {
        const text = String(chunk || '').trim();
        const named = text.match(/([A-Za-z]{3,})\s+(\d{4})/);
        if (named) {
            const month = MONTHS.findIndex((name) => name.toLowerCase() === named[1].slice(0, 3).toLowerCase());
            if (month >= 0) return named[2] + '-' + String(month + 1).padStart(2, '0');
        }
        const iso = text.match(/(\d{4})-(\d{2})/);
        return iso ? iso[1] + '-' + iso[2] : '';
    }

    function formatMonth(iso) {
        const match = String(iso || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return '';
        const month = MONTHS[Number(match[2]) - 1];
        return month ? month + ' ' + match[1] : '';
    }

    function formatRange(start, end, present) {
        const left = formatMonth(start);
        if (!left) return '';
        if (present) return left + ' - Present';
        const right = formatMonth(end);
        return right ? left + ' - ' + right : left;
    }

    function dateRangeField(listName, index, value) {
        const text = String(value || '');
        const present = /present/i.test(text);
        const parts = text.split(/\s+[-–—]\s+/);
        const start = monthValue(parts[0]);
        const end = present ? '' : monthValue(parts[1] || '');
        return `<div class="cv-dates" data-dates="${esc(listName)}" data-index="${index}">
            <div class="cv-field is-md"><label class="filter-label">From</label><input type="month" data-date-start value="${esc(start)}"></div>
            <label class="cv-switch"><span class="cv-switch-name">Present</span><input type="checkbox" data-date-present ${present ? 'checked' : ''}> <span class="cv-switch-ui" aria-hidden="true"></span><span class="cv-switch-state"></span></label>
            <div class="cv-field is-md"><label class="filter-label">To</label><input type="month" data-date-end value="${esc(end)}" ${present ? 'disabled' : ''}></div>
        </div>`;
    }

    function yearField(listName, index, value) {
        const current = String(value || '').trim();
        const options = [];
        for (let year = 1; year <= 20; year += 1) options.push(year === 1 ? '1 Yr' : year + ' Yrs');
        ['5+ Yrs', '8+ Yrs', '10+ Yrs', '15+ Yrs', '20+ Yrs', '25+ Yrs', '30+ Yrs'].forEach((label) => {
            if (!options.includes(label)) options.push(label);
        });
        if (current && !options.includes(current)) options.unshift(current);
        const choices = options.map((label) => `<option value="${esc(label)}"${label === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
        return `<div class="cv-field is-sm"><label class="filter-label">Years</label><select data-list="${listName}" data-index="${index}" data-field="years">${choices}</select></div>`;
    }

    function starField(listName, index, value) {
        const count = Math.min(5, Math.max(1, Number(value) || 3));
        const buttons = [1, 2, 3, 4, 5].map((star) => `<button type="button" class="cv-star${star <= count ? ' is-on' : ''}" data-star="${star}" data-list="${listName}" data-index="${index}" aria-label="${star} of 5">★</button>`).join('');
        return `<div class="cv-starline"><span class="filter-label">Stars</span><span class="cv-stars" role="radiogroup">${buttons}</span><input type="hidden" data-list="${listName}" data-index="${index}" data-field="stars" value="${count}"></div>`;
    }

    function check(name, on, label) {
        const nameHtml = label ? `<span class="cv-switch-name">${esc(label)}</span>` : '';
        return `<label class="cv-switch">${nameHtml}<input type="checkbox" ${name} ${on ? 'checked' : ''}> <span class="cv-switch-ui" aria-hidden="true"></span><span class="cv-switch-state"></span></label>`;
    }

    function textField(label, name, value, max, opts) {
        const extra = opts || {};
        const disabled = extra.disabled ? ' disabled' : '';
        const cls = extra.className ? ` class="${extra.className}"` : '';
        return `<label class="filter-label">${label}</label><input${cls}${disabled} ${name} maxlength="${max || 120}" value="${esc(value || '')}">`;
    }

    function render() {
        const body = document.getElementById('cv-section-body');
        const langWrap = document.getElementById('cv-lang-wrap');
        if (!body || !draft) return;
        if (langWrap) langWrap.classList.add('hidden');
        if (section === 'review') {
            body.innerHTML = '';
            syncSkip();
            return;
        }
        const views = { identity: identityView, contact: contactView, summary: summaryView, competencies: competenciesView, spoken: spokenView, toolbar: toolbarView, share: shareView, downloads: downloadView, languages: languageView, theme: themeView, glance: glanceView, timeline: timelineView, toolkit: toolkitView, experience: experienceView, education: educationView, testimonials: testimonialsView, messages: messagesView, ratings: ratingsView };
        const parts = pageParts(section);
        const layout = { about: 'cv-stack', actions: 'cv-stack', career: 'cv-stack', toolkit: 'cv-stack', education: 'cv-stack', display: 'cv-columns cv-columns-2 cv-compact', feedback: 'cv-stack' }[section] || `cv-columns cv-columns-${Math.min(parts.length, 3)}`;
        body.innerHTML = `<div class="${layout}">${parts.map((part) => `<section class="cv-column"><h3 class="cv-column-title">${esc(PARTS[part] || part)}</h3>${views[part]()}</section>`).join('')}</div>`;
        if (window.mountAdminMenus) window.mountAdminMenus(document.getElementById('cv-pane'));
        syncSkip();
    }

    function portraitSrc() {
        const profile = draft.profile;
        if (profile.photoKind === 'placeholder' || profile.photoRemoved) return 'assets/avatars/placeholder.svg';
        if (profile.photoKind === 'avatar' && AVATARS.some(([id]) => id === profile.avatar)) return 'assets/avatars/' + profile.avatar + '.svg';
        if (profile.photo) return profile.photo;
        return 'assets/profile.jpg?v=20260925';
    }

    function identityView() {
        const profile = draft.profile;
        const avatars = AVATARS.map(([id, label]) => `<button type="button" class="cv-avatar${profile.photoKind === 'avatar' && profile.avatar === id ? ' is-on' : ''}" data-avatar="${id}" title="${esc(label)}"><img src="assets/avatars/${id}.svg" alt="${esc(label)}"></button>`).join('');
        const history = photoHistory.map((item, index) => `<button type="button" class="cv-avatar${profile.photo === item.src ? ' is-on' : ''}" data-history="${index}" title="Use this photo"><img src="${esc(item.src)}" alt=""></button>`).join('');
        return `
            <div class="cv-portrait">
                <img id="cv-photo-preview" src="${esc(portraitSrc())}" alt="">
                <div>
                    <p class="cv-note">Use your portrait, an avatar, or the placeholder. Uploads stay in the row below so you can pick them again.</p>
                    <label class="filter-label" for="cv-photo-file">Upload a photo</label>
                    <input id="cv-photo-file" type="file" accept="image/jpeg,image/png,image/webp">
                    <div class="cv-photo-actions">
                        <button type="button" id="cv-photo-current" class="cv-btn${!profile.photoKind || profile.photoKind === 'file' ? ' is-on' : ''}">Current portrait</button>
                        <button type="button" id="cv-photo-placeholder" class="cv-btn${profile.photoKind === 'placeholder' || profile.photoRemoved ? ' is-on' : ''}">Placeholder</button>
                    </div>
                </div>
            </div>
            <p class="cv-kicker">Avatars</p>
            <div class="cv-avatar-row">${avatars}</div>
            <p class="cv-kicker">Uploaded photos</p>
            <div class="cv-avatar-row">${history || '<p class="cv-note">No uploads yet.</p>'}</div>
            ${textField('Name', 'data-bind="profile.name"', profile.name, 80)}
            ${textField('Title', 'data-bind="profile.title"', profile.title, 160)}
            ${textField('Credential line', 'data-bind="profile.certs"', profile.certs, 120)}`;
    }

    function contactView() {
        const c = draft.contact;
        const extras = c.extras || [];
        const extraRows = extras.map((item, index) => `<div class="cv-line">${check(`data-list="contact.extras" data-index="${index}" data-field="shown"`, item.shown)}
            <div class="cv-field is-sm">${textField('Label', `data-list="contact.extras" data-index="${index}" data-field="label"`, item.label, 40)}</div>
            <div class="cv-field is-grow">${textField(item.kind === 'address' ? 'Address' : item.kind === 'phone' ? 'Phone' : item.kind === 'email' ? 'Email' : 'URL', `data-list="contact.extras" data-index="${index}" data-field="value"`, item.value, 180)}</div>
            <button type="button" class="cv-btn" data-remove="contact.extras" data-index="${index}">Remove</button></div>`).join('');
        const pair = (shown, bind, labelName, labelBind, labelValue, valueName, valueBind, value) => `<div class="cv-line">${check(bind, shown)} <div class="cv-field is-sm">${textField(labelName, labelBind, labelValue, 40)}</div> <div class="cv-field is-grow">${textField(valueName, valueBind, value, 180)}</div></div>`;
        return `${check('data-bind="contact.shown"', c.shown)}
            ${textField('Heading', 'data-bind="contact.title"', c.title, 80)}
            ${pair(c.phone.shown, 'data-bind="contact.phone.shown"', 'Phone label', 'data-bind="contact.phone.label"', c.phone.label, 'Phone', 'data-bind="contact.phone.value"', c.phone.value)}
            <div class="cv-line">${check('data-bind="contact.email.shown"', c.email.shown)} <div class="cv-field is-grow">${textField('Email', 'data-bind="contact.email.value"', c.email.value, 80)}</div></div>
            ${pair(c.linkedin.shown, 'data-bind="contact.linkedin.shown"', 'LinkedIn label', 'data-bind="contact.linkedin.label"', c.linkedin.label, 'LinkedIn URL', 'data-bind="contact.linkedin.url"', c.linkedin.url)}
            ${pair(c.whatsapp.shown, 'data-bind="contact.whatsapp.shown"', 'WhatsApp label', 'data-bind="contact.whatsapp.label"', c.whatsapp.label, 'WhatsApp URL', 'data-bind="contact.whatsapp.url"', c.whatsapp.url)}
            ${pair(c.telegram.shown, 'data-bind="contact.telegram.shown"', 'Telegram label', 'data-bind="contact.telegram.label"', c.telegram.label, 'Telegram URL', 'data-bind="contact.telegram.url"', c.telegram.url)}
            <div class="cv-line">${check('data-bind="contact.location.shown"', c.location.shown)} <div class="cv-field is-grow">${textField('Location', 'data-bind="contact.location.value"', c.location.value, 80)}</div></div>
            ${extraRows}
            <label class="filter-label" for="cv-add-contact">Add contact info</label>
            <select id="cv-add-contact"><option value="">Choose</option><option value="phone">Phone number</option><option value="email">Email</option><option value="address">Address</option><option value="link">Link</option><option value="github">GitHub</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option></select>`;
    }

    function summaryView() {
        const pack = draft.summaryDetails.en || { a: '', b: '' };
        const more = [pack.a, pack.b].filter(Boolean).join('\n\n');
        return `${textField('Heading', 'data-bind="summaryTitle"', draft.summaryTitle, 80)}
            <label class="filter-label">Summary</label><textarea data-summary maxlength="1200">${esc(draft.summary.en || '')}</textarea>
            <label class="filter-label">Read more</label><textarea data-detail maxlength="1200">${esc(more)}</textarea>
            <p class="cv-note">English is the source. The other languages follow the automatic translation.</p>`;
    }

    function listView(title, shownBind, listName, items, fields, addId) {
        const rows = items.map((item, index) => `
            <div class="cv-block">
                ${check(`data-list="${listName}" data-index="${index}" data-field="shown"`, item.shown !== false)}
                ${fields.map(([label, field, max]) => textField(label, `data-list="${listName}" data-index="${index}" data-field="${field}"`, item[field], max)).join('')}
                <button type="button" class="cv-btn" data-remove="${listName}" data-index="${index}">Remove</button>
            </div>`).join('');
        return `${check(shownBind, lookup(draft, shownBind.replace('data-bind="', '').replace('"', '')) !== false)}
            ${textField('Heading', title, lookup(draft, title.replace('data-bind="', '').replace('"', '')), 80)}
            ${rows}
            <button type="button" class="cv-btn" id="${addId}">Add</button>`;
    }

    function competenciesView() {
        return `${check('data-bind="competencies.shown"', draft.competencies.shown, 'Section')}
            ${textField('Heading', 'data-bind="competencies.title"', draft.competencies.title, 80)}
            <p class="cv-note">Each competency is a filter. Link the toolkit skills and the roles it should keep in focus. AI Expertise already points at Cursor, Claude, Copilot, ChatGPT, custom personalizations, and the current role.</p>
            ${draft.competencies.items.map((item, index) => {
                const skills = item.skills || [];
                const roles = item.roles || [];
                const skillChips = skills.map((name) => `<button type="button" class="cv-chip is-on" data-link-skill="${esc(name)}" data-index="${index}" title="Remove ${esc(name)}">${esc(name)}</button>`).join('');
                const skillOptions = draft.toolkit.groups.map((group) => {
                    const choices = (group.skills || []).filter((skill) => skill.name && !skills.includes(skill.name)).map((skill) => `<option value="${esc(skill.name)}">${esc(skill.name)}</option>`).join('');
                    return choices ? `<optgroup label="${esc(group.label)}">${choices}</optgroup>` : '';
                }).join('');
                const roleChips = roles.map((roleAt) => {
                    const role = draft.roles[roleAt];
                    const label = role ? (role.company || role.title) : 'Role';
                    return `<button type="button" class="cv-chip is-on" data-link-role="${roleAt}" data-index="${index}" title="Remove ${esc(label)}">${esc(label)}</button>`;
                }).join('');
                const roleOptions = draft.roles.map((role, roleAt) => roles.includes(roleAt) ? '' : `<option value="${roleAt}">${esc((role.company || 'Role') + (role.dates ? ' · ' + role.dates : ''))}</option>`).join('');
                return `<article class="cv-card">
                    <div class="cv-line">${check(`data-list="competencies.items" data-index="${index}" data-field="shown"`, item.shown, 'On the CV')}
                        <div class="cv-field is-grow">${textField('Competency', `data-list="competencies.items" data-index="${index}" data-field="label"`, item.label, 80)}</div>
                        <button type="button" class="cv-btn" data-remove="competencies.items" data-index="${index}">Remove</button>
                    </div>
                    <p class="cv-kicker">Skills</p>
                    <div class="cv-chips">${skillChips || '<span class="cv-note">No skills linked yet.</span>'}</div>
                    <label class="filter-label">Link a skill</label>
                    <select data-add-skill="${index}"><option value="">Choose a skill</option>${skillOptions}</select>
                    <p class="cv-kicker">Experience</p>
                    <div class="cv-chips">${roleChips || '<span class="cv-note">No roles linked yet. Skills still highlight a role when its technologies match.</span>'}</div>
                    <label class="filter-label">Link a role</label>
                    <select data-add-role="${index}"><option value="">Choose a role</option>${roleOptions}</select>
                </article>`;
            }).join('')}
            <button type="button" id="cv-add-competency" class="cv-btn">Add a competency</button>`;
    }

    function spokenView() {
        return `${check('data-bind="spoken.shown"', draft.spoken.shown)}
            ${textField('Heading', 'data-bind="spoken.title"', draft.spoken.title, 80)}
            ${draft.spoken.items.map((item, index) => `<div class="cv-line">${check(`data-list="spoken.items" data-index="${index}" data-field="shown"`, item.shown)}
                    <div class="cv-field is-sm">${textField('Language', `data-list="spoken.items" data-index="${index}" data-field="name"`, item.name, 40)}</div>
                    <div class="cv-field is-xs">${textField('Level', `data-list="spoken.items" data-index="${index}" data-field="level"`, item.level, 24)}</div>
                    <div class="cv-field is-xs">${textField('Flag', `data-list="spoken.items" data-index="${index}" data-field="flag"`, item.flag, 2)}</div>
                    <div class="cv-field is-xs"><label class="filter-label">Bar</label><input type="number" min="0" max="100" data-list="spoken.items" data-index="${index}" data-field="percent" value="${Number(item.percent) || 0}"></div>
                    <button type="button" class="cv-btn" data-remove="spoken.items" data-index="${index}">Remove</button></div>`).join('')}
            <button type="button" id="cv-add-spoken" class="cv-btn">Add a language</button>`;
    }

    function toolbarView() {
        return `${check('data-bind="toolbar.hideCaptions"', draft.toolbar.hideCaptions, 'Hide captions')}
            <div class="cv-grid">${draft.toolbar.items.map((item, index) => `<div class="cv-mini">${check(`data-list="toolbar.items" data-index="${index}" data-field="shown"`, item.shown)} ${textField('Label', `data-list="toolbar.items" data-index="${index}" data-field="label"`, item.label, 40)}</div>`).join('')}</div>`;
    }

    function presetOptions(map, skip) {
        return Object.entries(map).filter(([id]) => id !== skip).map(([id, row]) => `<option value="${id}">${esc(row[0])}</option>`).join('');
    }

    function shareView() {
        return `${draft.share.items.map((item, index) => `<div class="cv-line">${check(`data-list="share.items" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-sm">${textField('Label', `data-list="share.items" data-index="${index}" data-field="label"`, item.label, 40)}</div> <div class="cv-field is-grow">${textField('URL', `data-list="share.items" data-index="${index}" data-field="url"`, item.url, 180, { disabled: item.shown === false })}</div> <button type="button" class="cv-btn" data-remove="share.items" data-index="${index}">Remove</button></div>`).join('')}
            <label class="filter-label" for="cv-add-share-preset">Add a network</label>
            <select id="cv-add-share-preset"><option value="">Choose</option>${presetOptions(SHARE_PRESETS)}</select>`;
    }

    function downloadView() {
        return `${draft.downloads.items.map((item, index) => `<div class="cv-line">${check(`data-list="downloads.items" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-sm">${textField('Label', `data-list="downloads.items" data-index="${index}" data-field="label"`, item.label, 40)}</div> <button type="button" class="cv-btn" data-remove="downloads.items" data-index="${index}">Remove</button></div>`).join('')}
            <label class="filter-label" for="cv-add-download-preset">Add a download</label>
            <select id="cv-add-download-preset"><option value="">Choose</option>${presetOptions(DOWNLOAD_PRESETS, 'custom')}</select>`;
    }

    function languageView() {
        const catalog = (window.SiteI18n && SiteI18n.orderedLanguages()) || [];
        const options = catalog.filter((meta) => !draft.languages.items.some((item) => item.code === meta.code)).map((meta) => `<option value="${esc(meta.code)}">${esc(meta.native || meta.name)}</option>`).join('');
        return `${draft.languages.items.map((item, index) => `<div class="cv-line">${check(`data-list="languages.items" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-sm">${textField('Label', `data-list="languages.items" data-index="${index}" data-field="label"`, item.label, 40)}</div> <button type="button" class="cv-btn" data-remove="languages.items" data-index="${index}">Remove</button></div>`).join('')}
            <label class="filter-label" for="cv-add-lang">Add a translation language</label>
            <select id="cv-add-lang"><option value="">Choose</option>${options}</select>
            <p class="cv-note">Shown languages appear in the menu. Other languages follow the automatic translation of the English CV.</p>`;
    }

    function themeView() {
        return `<p class="cv-note">The button still switches light and dark. These names stay short.</p>
            ${check('data-bind="theme.shown"', draft.theme.shown)}
            <div class="cv-inline">
                <div class="cv-field is-sm">${textField('Toolbar label', 'data-bind="theme.label"', draft.theme.label, 40)}</div>
                <div class="cv-field is-sm">${textField('Light name', 'data-bind="theme.lightLabel"', draft.theme.lightLabel, 24)}</div>
                <div class="cv-field is-sm">${textField('Dark name', 'data-bind="theme.darkLabel"', draft.theme.darkLabel, 24)}</div>
            </div>
            ${textField('Tooltip', 'data-bind="theme.tooltip"', draft.theme.tooltip, 80)}`;
    }

    function glanceView() {
        return `${check('data-bind="glance.shown"', draft.glance.shown)}
            ${check('data-bind="glance.charts"', draft.glance.charts, 'Charts')}
            ${textField('Heading', 'data-bind="glance.title"', draft.glance.title, 80)}
            ${textField('Note', 'data-bind="glance.note"', draft.glance.note, 120)}
            ${draft.glance.kpis.map((item, index) => `<div class="cv-line">${check(`data-list="glance.kpis" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-sm">${textField('Label', `data-list="glance.kpis" data-index="${index}" data-field="label"`, item.label, 40)}</div> <div class="cv-field is-xs">${textField('Value', `data-list="glance.kpis" data-index="${index}" data-field="value"`, item.value, 24)}</div> <button type="button" class="cv-btn" data-remove="glance.kpis" data-index="${index}">Remove</button></div>`).join('')}
            <button type="button" id="cv-add-kpi" class="cv-btn">Add an indicator</button>`;
    }

    function timelineView() {
        return `${check('data-bind="timeline.shown"', draft.timeline.shown)}
            ${textField('Heading', 'data-bind="timeline.title"', draft.timeline.title, 80)}
            <p class="cv-note">Each role below is edited once. On timeline puts that role on the career timeline.</p>`;
    }

    function toolkitView() {
        return `${check('data-bind="toolkit.shown"', draft.toolkit.shown)}
            ${textField('Heading', 'data-bind="toolkit.title"', draft.toolkit.title, 80)}
            ${draft.toolkit.groups.map((group, groupAt) => `<section class="cv-card">
                <div class="cv-line">${check(`data-list="toolkit.groups" data-index="${groupAt}" data-field="shown"`, group.shown)} <div class="cv-field is-grow">${textField('Subsection', `data-list="toolkit.groups" data-index="${groupAt}" data-field="label"`, group.label, 80)}</div> <button type="button" class="cv-btn" data-remove="toolkit.groups" data-index="${groupAt}">Remove</button></div>
                ${group.skills.map((skill, skillAt) => `<div class="cv-line">${check(`data-list="toolkit.groups.${groupAt}.skills" data-index="${skillAt}" data-field="shown"`, skill.shown)}
                    <div class="cv-field is-grow">${textField('Skill', `data-list="toolkit.groups.${groupAt}.skills" data-index="${skillAt}" data-field="name"`, skill.name, 60)}</div>
                    ${yearField(`toolkit.groups.${groupAt}.skills`, skillAt, skill.years)}
                    ${starField(`toolkit.groups.${groupAt}.skills`, skillAt, skill.stars)}
                    <button type="button" class="cv-btn" data-remove="toolkit.groups.${groupAt}.skills" data-index="${skillAt}">Remove</button></div>`).join('')}
                <button type="button" class="cv-btn" data-add="skill" data-index="${groupAt}">Add a skill</button>
            </section>`).join('')}
            <button type="button" id="cv-add-group" class="cv-btn">Add a subsection</button>`;
    }

    function experienceView() {
        return `${check('data-bind="experience.shown"', draft.experience.shown)}
            ${textField('Heading', 'data-bind="experience.title"', draft.experience.title, 80)}
            ${draft.roles.map((role, index) => `<article class="cv-card">
                <div class="cv-line">${check(`data-list="roles" data-index="${index}" data-field="shown"`, role.shown)}
                    ${check(`data-list="roles" data-index="${index}" data-field="onTimeline"`, role.onTimeline, 'On timeline')}
                    <div class="cv-field is-grow">${textField('Title', `data-list="roles" data-index="${index}" data-field="title"`, role.title, 140)}</div>
                    <div class="cv-field is-md">${textField('Company', `data-list="roles" data-index="${index}" data-field="company"`, role.company, 140)}</div>
                    ${dateRangeField('roles', index, role.dates)}
                    <button type="button" class="cv-btn" data-remove="roles" data-index="${index}">Remove</button></div>
                <label class="filter-label">Bullets, one per line</label><textarea data-bullets data-index="${index}" maxlength="3600">${esc(role.bullets.en || '')}</textarea>
            </article>`).join('')}
            <button type="button" id="cv-add-role" class="cv-btn">Add a role</button>
            <p class="cv-note">Pick the start month, then either Present or an end month. The CV still shows the date as Jan 2021 - Present.</p>`;
    }

    function educationView() {
        return `${check('data-bind="education.shown"', draft.education.shown)}
            ${textField('Heading', 'data-bind="education.title"', draft.education.title, 80)}
            ${textField('Education label', 'data-bind="education.educationTitle"', draft.education.educationTitle, 80)}
            ${draft.education.degrees.map((item, index) => `<div class="cv-line">${check(`data-list="education.degrees" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-grow">${textField('Degree', `data-list="education.degrees" data-index="${index}" data-field="degree"`, item.degree, 120)}</div> <div class="cv-field is-md">${textField('School', `data-list="education.degrees" data-index="${index}" data-field="school"`, item.school, 80)}</div> <button type="button" class="cv-btn" data-remove="education.degrees" data-index="${index}">Remove</button></div>`).join('')}
            <button type="button" id="cv-add-degree" class="cv-btn">Add a degree</button>
            ${textField('Certifications label', 'data-bind="education.certsTitle"', draft.education.certsTitle, 80)}
            ${draft.education.certs.map((item, index) => `<div class="cv-line">${check(`data-list="education.certs" data-index="${index}" data-field="shown"`, item.shown)} <div class="cv-field is-sm">${textField('Label', `data-list="education.certs" data-index="${index}" data-field="label"`, item.label, 60)}</div> <div class="cv-field is-grow">${textField('Value', `data-list="education.certs" data-index="${index}" data-field="value"`, item.value, 120)}</div> <button type="button" class="cv-btn" data-remove="education.certs" data-index="${index}">Remove</button></div>`).join('')}
            <button type="button" id="cv-add-cert" class="cv-btn">Add a certification</button>`;
    }

    function testimonialsView() {
        const block = draft.feedback.testimonials;
        return `${check('data-bind="feedback.testimonials.shown"', block.shown)}
            ${textField('Heading', 'data-bind="feedback.testimonials.title"', block.title, 80)}
            ${check('data-bind="feedback.widget.shown"', draft.feedback.widget.shown, 'Show the message button')}
            <p class="cv-note">Approved ratings still appear here. The button opens the message and rating forms.</p>`;
    }

    function messagesView() {
        const form = draft.feedback.message;
        const fields = draft.feedback.fields;
        return `${check('data-bind="feedback.message.shown"', form.shown, 'Show the message form')}
            ${textField('Tab', 'data-bind="feedback.message.tab"', form.tab, 40)}
            ${textField('Lead', 'data-bind="feedback.message.lead"', form.lead, 180)}
            <div class="cv-inline">
                <div class="cv-field is-sm">${textField('Name label', 'data-bind="feedback.fields.name"', fields.name, 40)}</div>
                <div class="cv-field is-sm">${textField('Email label', 'data-bind="feedback.fields.email"', fields.email, 40)}</div>
            </div>
            ${textField('Topic label', 'data-bind="feedback.message.topic"', form.topic, 40)}
            ${(draft.feedback.topics || []).map((item, index) => `<div class="cv-line"><div class="cv-field is-grow">${textField(item.id === 'default' ? 'Empty choice' : item.id, `data-list="feedback.topics" data-index="${index}" data-field="label"`, item.label, 80)}</div></div>`).join('')}
            ${textField('Message label', 'data-bind="feedback.message.body"', form.body, 40)}
            ${textField('Attachment label', 'data-bind="feedback.message.attachment"', form.attachment, 60)}
            ${textField('Attach button', 'data-bind="feedback.message.attach"', form.attach, 40)}
            ${textField('Send button', 'data-bind="feedback.message.send"', form.send, 40)}`;
    }

    function ratingsView() {
        const form = draft.feedback.rating;
        return `${check('data-bind="feedback.rating.shown"', form.shown, 'Show the rating form')}
            ${textField('Tab', 'data-bind="feedback.rating.tab"', form.tab, 40)}
            ${textField('Lead', 'data-bind="feedback.rating.lead"', form.lead, 180)}
            ${textField('Rating label', 'data-bind="feedback.rating.label"', form.label, 40)}
            ${textField('Comments label', 'data-bind="feedback.rating.comments"', form.comments, 60)}
            ${textField('Submit button', 'data-bind="feedback.rating.submit"', form.submit, 40)}
            <div class="cv-marks" role="radiogroup" aria-label="Rating mark">
                ${RATING_MARKS.map(([id, glyph, label]) => `<button type="button" class="cv-mark${(form.mark || 'star') === id ? ' is-on' : ''}" data-mark="${id}" title="${esc(label)}" aria-label="${esc(label)}">${glyph}</button>`).join('')}
            </div>
            <p class="cv-note">Visitors still tap five marks. Name and email use the labels from the message form.</p>`;
    }

    function paint() {
        const select = document.getElementById('cv-section');
        if (!select.options.length) {
            PAGES.forEach(([id]) => {
                const option = document.createElement('option');
                option.value = id;
                select.appendChild(option);
            });
        }
        [...select.options].forEach((option) => {
            const found = PAGES.find((item) => item[0] === option.value);
            option.textContent = found[1] + (skipped.has(option.value) ? ' · skipped' : '');
        });
        select.value = section;
        render();
        const index = PAGES.findIndex((item) => item[0] === section);
        document.getElementById('cv-step-label').textContent = `Step ${index + 1} of ${PAGES.length} · ${PAGES[index][1]}`;
        paintSteps(index);
        const reviewing = section === 'review';
        document.getElementById('cv-review').classList.toggle('hidden', !reviewing);
        document.getElementById('cv-section-body').classList.toggle('hidden', reviewing);
        ['cv-skip', 'cv-next', 'cv-publish'].forEach((id) => document.getElementById(id).classList.toggle('hidden', reviewing));
        ['cv-confirm', 'cv-discard'].forEach((id) => document.getElementById(id).classList.toggle('hidden', !reviewing));
        document.getElementById('cv-back').disabled = section === 'profile';
        const frame = document.getElementById('cv-review-frame');
        if (reviewing && reviewStamp && frame.dataset.stamp !== String(reviewStamp)) {
            frame.dataset.stamp = String(reviewStamp);
            frame.src = `index.html?cvpreview=1&draft=${reviewStamp}`;
        }
        if (!reviewing && frame.getAttribute('src')) {
            frame.removeAttribute('src');
            frame.dataset.stamp = '';
        }
    }

    function paintSteps(index) {
        const list = document.getElementById('cv-steps');
        const count = PAGES.length;
        if (list.children.length !== count) {
            list.innerHTML = PAGES.map(([id, label], step) => `<li><button type="button" data-step="${id}"><span>${step + 1}</span><em>${esc(label)}</em></button></li>`).join('');
        }
        [...list.querySelectorAll('button')].forEach((button, step) => {
            const id = PAGES[step][0];
            button.className = 'cv-step' + (step === index ? ' is-current' : '') + (skipped.has(id) ? ' is-skipped' : '');
            if (step === index) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
    }

    function hideFlag(shown) {
        return shown === false;
    }

    function packList(items, fields) {
        return (items || []).map((item) => {
            const row = { hidden: hideFlag(item.shown) };
            fields.forEach((field) => { row[field] = item[field]; });
            if ('onTimeline' in item) row.onTimeline = item.onTimeline !== false;
            if (item.custom) row.custom = true;
            if (item.url) row.url = item.url;
            if (item.id) row.id = item.id;
            if (item.code) row.code = item.code;
            if (item.key) row.key = item.key;
            return row;
        });
    }

    function payload() {
        read();
        if (!String(draft.profile.name || '').trim() || !String(draft.profile.title || '').trim()) {
            return { error: 'Name and title are required.' };
        }
        const summary = { title: draft.summaryTitle };
        const english = String(draft.summary.en || '').trim();
        if (!english) return { error: 'The summary is required.' };
        LANGS.forEach((code) => { summary[code] = english.slice(0, 1200); });
        const detail = String((draft.summaryDetails.en && draft.summaryDetails.en.a) || '').trim().slice(0, 1200);
        const summaryDetails = {};
        LANGS.forEach((code) => { summaryDetails[code] = { a: detail, b: '' }; });
        const roles = [];
        for (const role of draft.roles) {
            const title = String(role.title || '').trim();
            const company = String(role.company || '').trim();
            const dates = String(role.dates || '').trim();
            if (!title || !company || !dates) return { error: `Each role needs a title, a company, and dates. Check “${title || 'New role'}”.` };
            const englishBullets = lines(role.bullets.en);
            if (!englishBullets.length) return { error: `Add at least one bullet for “${title}”.` };
            const bullets = {};
            LANGS.forEach((code) => { bullets[code] = englishBullets; });
            roles.push({ source: Number.isInteger(role.source) ? role.source : null, title: title.slice(0, 140), company: company.slice(0, 140), dates: dates.slice(0, 80), hidden: role.shown === false, onTimeline: role.onTimeline !== false, bullets });
        }
        const groups = draft.toolkit.groups.map((group) => ({
            key: group.key, label: group.label, hidden: group.shown === false,
            skills: (group.skills || []).map((skill) => ({ name: skill.name, years: skill.years, stars: Number(skill.stars) || 3, hidden: skill.shown === false }))
        }));
        return {
            version: 2,
            machineTranslate: true,
            profile: publishedProfile(),
            contact: flagNode(draft.contact),
            summary,
            summaryDetails,
            competencies: { title: draft.competencies.title, hidden: draft.competencies.shown === false, items: packList(draft.competencies.items, ['id', 'label', 'skills', 'roles']) },
            spoken: { title: draft.spoken.title, hidden: draft.spoken.shown === false, items: packList(draft.spoken.items, ['name', 'level', 'percent', 'flag']) },
            toolbar: { hideCaptions: draft.toolbar.hideCaptions === true, items: packList(draft.toolbar.items, ['id', 'label']) },
            share: { items: packList(draft.share.items, ['id', 'label']) },
            downloads: { items: packList(draft.downloads.items, ['id', 'label']) },
            languages: { items: packList(draft.languages.items, ['code', 'label']) },
            theme: { hidden: draft.theme.shown === false, label: draft.theme.label, tooltip: `${draft.theme.lightLabel} / ${draft.theme.darkLabel}. ${draft.theme.tooltip}`, lightLabel: draft.theme.lightLabel, darkLabel: draft.theme.darkLabel },
            glance: { hidden: draft.glance.shown === false, chartsHidden: draft.glance.charts === false, title: draft.glance.title, note: draft.glance.note, kpis: packList(draft.glance.kpis, ['key', 'label', 'value']) },
            timeline: { hidden: draft.timeline.shown === false, title: draft.timeline.title },
            toolkit: { hidden: draft.toolkit.shown === false, title: draft.toolkit.title, groups },
            experience: { hidden: draft.experience.shown === false, title: draft.experience.title },
            roles,
            education: {
                hidden: draft.education.shown === false, title: draft.education.title,
                educationTitle: draft.education.educationTitle, certsTitle: draft.education.certsTitle,
                degrees: packList(draft.education.degrees, ['degree', 'school']),
                certs: packList(draft.education.certs, ['label', 'value'])
            },
            feedback: publishedFeedback()
        };
    }

    function publishedProfile() {
        const profile = draft.profile;
        const kind = profile.photoKind || (profile.photoRemoved ? 'placeholder' : 'file');
        return {
            name: profile.name,
            title: profile.title,
            certs: profile.certs,
            photoKind: kind,
            avatar: kind === 'avatar' ? profile.avatar : '',
            photo: kind === 'upload' ? profile.photo : '',
            photoRemoved: kind === 'placeholder'
        };
    }

    function publishedFeedback() {
        const flagged = flagNode(draft.feedback);
        flagged.topics = TOPIC_IDS.map((id) => {
            const found = (draft.feedback.topics || []).find((item) => item.id === id);
            return { id, label: String((found && found.label) || '').slice(0, 80) };
        });
        return flagged;
    }

    function loadHistory() {
        try {
            const saved = JSON.parse(localStorage.getItem(PHOTO_HISTORY_KEY) || '[]');
            photoHistory = Array.isArray(saved) ? saved.filter((item) => item && item.src).slice(0, 12) : [];
        } catch (error) {
            photoHistory = [];
        }
    }

    function saveHistory() {
        try { localStorage.setItem(PHOTO_HISTORY_KEY, JSON.stringify(photoHistory.slice(0, 12))); } catch (error) { /* a full browser store still keeps the current photo */ }
    }

    function rememberPhoto(src) {
        if (!src) return;
        photoHistory = [{ src, at: Date.now() }, ...photoHistory.filter((item) => item.src !== src)].slice(0, 12);
        saveHistory();
    }

    function useAvatar(id) {
        if (!AVATARS.some(([key]) => key === id)) return;
        draft.profile.photoKind = 'avatar';
        draft.profile.avatar = id;
        draft.profile.photo = '';
        draft.profile.photoRemoved = false;
    }

    function useHistoryPhoto(index) {
        const item = photoHistory[index];
        if (!item) return;
        draft.profile.photoKind = 'upload';
        draft.profile.photo = item.src;
        draft.profile.avatar = '';
        draft.profile.photoRemoved = false;
    }

    async function storePhoto(dataUrl) {
        if (!storage || !ref || !uploadString || !getDownloadURL || !auth.currentUser) return '';
        try {
            const fileRef = ref(storage, 'profile-photos/' + Date.now() + '.jpg');
            await uploadString(fileRef, dataUrl, 'data_url');
            const url = await getDownloadURL(fileRef);
            if (addDoc && collection) await addDoc(collection(db, 'cvPhotos'), { url, createdAt: serverTimestamp() });
            return url;
        } catch (error) {
            console.warn(error);
            return '';
        }
    }

    async function pullCloudHistory() {
        if (!collection || !getDocs || !query || !orderBy || !limit || !auth.currentUser) return;
        try {
            const snap = await getDocs(query(collection(db, 'cvPhotos'), orderBy('createdAt', 'desc'), limit(12)));
            const urls = [];
            snap.forEach((item) => { if (item.data().url) urls.push(item.data().url); });
            urls.reverse().forEach(rememberPhoto);
            if (section === 'profile') render();
        } catch (error) {
            console.warn(error);
        }
    }

    function flagNode(node) {
        if (Array.isArray(node)) return node.map(flagNode);
        if (!node || typeof node !== 'object') return node;
        const copy = {};
        Object.keys(node).forEach((key) => {
            if (key === 'shown') copy.hidden = node.shown === false;
            else copy[key] = flagNode(node[key]);
        });
        return copy;
    }

    function message(text, ok) {
        const el = document.getElementById('cv-message');
        el.textContent = text;
        el.style.color = ok ? '#047857' : '#b91c1c';
    }

    function hint(error) {
        if (error && error.code === 'permission-denied') return 'Firestore blocked this. Sign in with the admin account. Only that account can write cvContent.';
        return (error && error.message) || 'The CV copy could not be saved.';
    }

    function compress(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const scale = Math.min(1, 480 / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            image.onerror = () => reject(new Error('That image could not be read.'));
            image.src = URL.createObjectURL(file);
        });
    }

    function bindBody() {
        const body = document.getElementById('cv-section-body');
        body.addEventListener('click', async (event) => {
            if (event.target.closest('.cv-menu') || event.target.closest('.cv-menu-panel')) return;
            const remove = event.target.closest('[data-remove]');
            const add = event.target.closest('[data-add]');
            const avatarBtn = event.target.closest('[data-avatar]');
            const historyBtn = event.target.closest('[data-history]');
            const star = event.target.closest('[data-star]');
            const mark = event.target.closest('[data-mark]');
            const skillChip = event.target.closest('[data-link-skill]');
            const roleChip = event.target.closest('[data-link-role]');
            const id = event.target.id;
            if (!remove && !id && !add && !avatarBtn && !historyBtn && !star && !mark && !skillChip && !roleChip) return;
            read();
            if (star) {
                const hidden = star.closest('.cv-starline') && star.closest('.cv-starline').querySelector('input[data-field="stars"]');
                if (hidden) hidden.value = star.dataset.star;
                read();
                render();
                return;
            }
            if (mark) { draft.feedback.rating.mark = mark.dataset.mark; render(); return; }
            if (skillChip) {
                const item = draft.competencies.items[Number(skillChip.dataset.index)];
                const name = skillChip.dataset.linkSkill;
                if (!item || !name) return;
                const skills = item.skills || [];
                item.skills = skills.includes(name) ? skills.filter((skill) => skill !== name) : skills.concat(name);
                render();
                return;
            }
            if (roleChip) {
                const item = draft.competencies.items[Number(roleChip.dataset.index)];
                const roleAt = Number(roleChip.dataset.linkRole);
                if (!item || Number.isNaN(roleAt)) return;
                const roles = item.roles || [];
                item.roles = roles.includes(roleAt) ? roles.filter((value) => value !== roleAt) : roles.concat(roleAt);
                render();
                return;
            }
            if (avatarBtn) { useAvatar(avatarBtn.dataset.avatar); render(); return; }
            if (historyBtn) { useHistoryPhoto(Number(historyBtn.dataset.history)); render(); return; }
            if (id === 'cv-photo-current') {
                draft.profile.photoKind = 'file';
                draft.profile.avatar = '';
                draft.profile.photo = '';
                draft.profile.photoRemoved = false;
                render();
                return;
            }
            if (id === 'cv-photo-placeholder') {
                draft.profile.photoKind = 'placeholder';
                draft.profile.avatar = '';
                draft.profile.photo = '';
                draft.profile.photoRemoved = true;
                render();
                return;
            }
            if (remove) {
                const list = lookup(draft, remove.dataset.remove);
                const keep = remove.dataset.remove === 'roles' || remove.dataset.remove === 'toolkit.groups' ? 1 : 0;
                if (list && list.length > keep) list.splice(Number(remove.dataset.index), 1);
                render();
                return;
            }
            if (add && add.dataset.add === 'skill') {
                const group = draft.toolkit.groups[Number(add.dataset.index)];
                if (group) group.skills.push({ name: '', years: '', stars: 3, shown: true });
                render();
                return;
            }
            if (id === 'cv-add-competency') draft.competencies.items.push({ id: 'c' + Date.now(), label: '', shown: true, skills: [], roles: [] });
            if (id === 'cv-add-spoken') draft.spoken.items.push({ name: '', level: '', percent: 50, flag: '', shown: true });
            if (id === 'cv-add-share') draft.share.items.push({ id: 'link' + Date.now(), label: '', url: 'https://', shown: true, custom: true });
            if (id === 'cv-add-download') draft.downloads.items.push({ id: 'file' + Date.now(), label: '', url: 'https://', shown: true, custom: true });
            if (id === 'cv-add-degree') draft.education.degrees.push({ degree: '', school: '', shown: true });
            if (id === 'cv-add-cert') draft.education.certs.push({ label: '', value: '', shown: true });
            if (id === 'cv-add-kpi') draft.glance.kpis.push({ key: 'k' + Date.now(), label: 'New', value: '1', shown: true });
            if (id === 'cv-add-group') {
                draft.toolkit.groups.push({ key: 'g' + Date.now(), label: 'New subsection', shown: true, skills: [] });
                groupIndex = draft.toolkit.groups.length - 1;
                skillIndex = 0;
            }
            if (id === 'cv-remove-group' && draft.toolkit.groups.length > 1) {
                draft.toolkit.groups.splice(groupIndex, 1);
                groupIndex = Math.min(groupIndex, draft.toolkit.groups.length - 1);
                skillIndex = 0;
            }
            if (id === 'cv-add-skill' && draft.toolkit.groups[groupIndex]) {
                draft.toolkit.groups[groupIndex].skills.push({ name: '', years: '', stars: 3, shown: true });
                skillIndex = draft.toolkit.groups[groupIndex].skills.length - 1;
            }
            if (id === 'cv-remove-skill' && draft.toolkit.groups[groupIndex] && draft.toolkit.groups[groupIndex].skills.length > 1) {
                draft.toolkit.groups[groupIndex].skills.splice(skillIndex, 1);
                skillIndex = Math.max(0, skillIndex - 1);
            }
            if (id === 'cv-add-role') {
                draft.roles.push({ source: null, title: '', company: '', dates: '', shown: true, onTimeline: true, bullets: blankBullets() });
                roleIndex = draft.roles.length - 1;
                lang = 'en';
            }
            if (id === 'cv-remove-role' && draft.roles.length > 1) {
                draft.roles.splice(roleIndex, 1);
                roleIndex = Math.min(roleIndex, draft.roles.length - 1);
            }
            render();
        });
        body.addEventListener('input', () => {
            read();
        });
        body.addEventListener('change', async (event) => {
            read();
            if (event.target.matches('[data-date-present], [data-date-start], [data-date-end]')) { render(); return; }
            if (event.target.matches('[data-add-skill]')) {
                const item = draft.competencies.items[Number(event.target.dataset.addSkill)];
                if (item && event.target.value) item.skills = (item.skills || []).concat(event.target.value);
                render();
                return;
            }
            if (event.target.matches('[data-add-role]')) {
                const item = draft.competencies.items[Number(event.target.dataset.addRole)];
                const roleAt = Number(event.target.value);
                if (item && event.target.value !== '' && !Number.isNaN(roleAt)) item.roles = (item.roles || []).concat(roleAt);
                render();
                return;
            }
            if (event.target.id === 'cv-photo-file' && event.target.files[0]) {
                try {
                    const dataUrl = await compress(event.target.files[0]);
                    rememberPhoto(dataUrl);
                    draft.profile.photo = dataUrl;
                    draft.profile.photoKind = 'upload';
                    draft.profile.avatar = '';
                    draft.profile.photoRemoved = false;
                    render();
                    const url = await storePhoto(dataUrl);
                    if (url) {
                        photoHistory = photoHistory.map((item) => item.src === dataUrl ? { src: url, at: item.at } : item);
                        saveHistory();
                        if (draft.profile.photo === dataUrl) draft.profile.photo = url;
                        if (section === 'profile') render();
                    }
                } catch (error) { message(error.message, false); }
                return;
            }
            if (event.target.id === 'cv-group') { read(); groupIndex = Number(event.target.value); skillIndex = 0; render(); }
            if (event.target.id === 'cv-skill') { read(); skillIndex = Number(event.target.value); render(); }
            if (event.target.id === 'cv-role') { read(); roleIndex = Number(event.target.value); render(); }
            if (event.target.id === 'cv-add-contact' && event.target.value) { read(); addContact(event.target.value); render(); return; }
            if (event.target.id === 'cv-add-share-preset' && event.target.value) {
                read();
                const result = addNamed(draft.share.items, event.target.value, SHARE_PRESETS);
                render();
                message(result === 'shown' ? 'That network is on.' : 'Network added.', true);
                return;
            }
            if (event.target.id === 'cv-add-download-preset' && event.target.value) {
                read();
                const result = addNamed(draft.downloads.items, event.target.value, DOWNLOAD_PRESETS);
                render();
                message(result === 'shown' ? 'That download is on.' : 'Download added.', true);
                return;
            }
            if (event.target.matches('[data-list="share.items"][data-field="shown"]')) { render(); return; }
            if (event.target.id === 'cv-add-lang' && event.target.value) {
                read();
                const code = event.target.value;
                const existing = draft.languages.items.find((item) => item.code === code);
                if (existing) existing.shown = true;
                else {
                    const meta = (window.SiteI18n && SiteI18n.orderedLanguages() || []).find((item) => item.code === code);
                    draft.languages.items.push({ code, label: (meta && (meta.native || meta.name)) || code, shown: true });
                }
                render();
                message(existing ? 'That language is on.' : 'Language added.', true);
            }
        });
    }

    function bind() {
        if (bound) return;
        bound = true;
        loadHistory();
        seed();
        paint();
        document.getElementById('cv-status').textContent = 'The public CV is still using the file. Edits are in English, and the other languages follow the automatic translation.';
        document.getElementById('cv-skip').addEventListener('click', () => skipSection());
        document.getElementById('cv-next').addEventListener('click', () => goNext());
        document.getElementById('cv-preview').addEventListener('click', () => previewCv());
        document.getElementById('cv-publish').addEventListener('click', () => requestPublish());
        document.getElementById('cv-back').addEventListener('click', () => goBack());
        document.getElementById('cv-discard').addEventListener('click', () => discardEdits());
        document.getElementById('cv-steps').addEventListener('click', (event) => {
            const button = event.target.closest('[data-step]');
            if (button) goTo(button.dataset.step);
        });
        document.getElementById('cv-section').addEventListener('change', (event) => goTo(event.target.value));
        document.getElementById('cv-lang').addEventListener('change', (event) => { read(); lang = event.target.value; render(); });
        bindBody();
        document.getElementById('cv-confirm').addEventListener('click', async () => {
            const body = payload();
            if (body.error) { message(body.error, false); return; }
            if (!auth.currentUser) { message('Sign in before confirming.', false); return; }
            try {
                await setDoc(doc(db, 'cvContent', 'live'), { ...body, updatedAt: serverTimestamp() });
                takeBaseline();
                paint();
                document.getElementById('cv-status').textContent = 'Confirmed just now. Reload the public CV to see it.';
                message('Confirmed. The public CV reads this copy on the next visit.', true);
            } catch (error) {
                console.error(error);
                message(hint(error), false);
            }
        });
        document.getElementById('cv-revert').addEventListener('click', async () => {
            if (!confirm('Remove the published copy? The public CV goes back to the file.')) return;
            if (!auth.currentUser) { message('Sign in before removing the published copy.', false); return; }
            try {
                await deleteDoc(doc(db, 'cvContent', 'live'));
                seed();
                section = 'profile';
                lang = 'en';
                roleIndex = 0;
                reviewStamp = 0;
                try { localStorage.removeItem('cv-live-preview'); } catch (error) { /* the preview key is optional */ }
                paint();
                document.getElementById('cv-status').textContent = 'The public CV is using the file again.';
                message('Removed. The public CV reads the file on the next visit.', true);
            } catch (error) {
                console.error(error);
                message(hint(error), false);
            }
        });
    }

    async function load() {
        await pullCloudHistory();
        try {
            const snap = await getDoc(doc(db, 'cvContent', 'live'));
            if (!snap.exists()) return;
            overlay(snap.data());
            paint();
            const when = snap.data().updatedAt && typeof snap.data().updatedAt.toDate === 'function' ? snap.data().updatedAt.toDate().toLocaleString() : 'an earlier session';
            document.getElementById('cv-status').textContent = `Published ${when}. The public CV reads this copy.`;
        } catch (error) {
            console.warn(error);
            document.getElementById('cv-status').textContent = 'The editor is showing the file. Firestore did not return a published copy.';
        }
    }

    return { bind, load };
}
