/**
 * Agency white-label branding and CI post-deploy webhook (#3482).
 * Branding: company name + logo on PDF and shared soft-preview header; small “Report by QA-lab” line stays.
 * CI auth: per-account HMAC secret (Advice / Q32), not the shared publish key.
 */
const crypto = require('crypto');

const LOGO_MAX = 180000;
const LOGO_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/i;
const HOOK_ID_RE = /^[a-f0-9]{16}$/;

function cleanCompany(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

function cleanLogo(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (!LOGO_RE.test(raw) || raw.length > LOGO_MAX) return '';
	return raw;
}

function brandingOf(row) {
	const src = (row && row.branding) || {};
	const companyName = cleanCompany(src.companyName);
	const logoDataUrl = cleanLogo(src.logoDataUrl);
	if (!companyName && !logoDataUrl) return null;
	return {
		companyName,
		logoDataUrl,
		updatedAt: src.updatedAt || null,
	};
}

function publicBranding(row) {
	const brand = brandingOf(row);
	if (!brand) return null;
	return { companyName: brand.companyName, logoDataUrl: brand.logoDataUrl || '' };
}

function sanitizeBranding(body) {
	const companyName = cleanCompany(body && body.companyName);
	const logoDataUrl = cleanLogo(body && body.logoDataUrl);
	if (
		(body && body.companyName && !companyName) ||
		(body && body.logoDataUrl && !logoDataUrl && String(body.logoDataUrl).trim())
	) {
		const error = new Error('Use a short company name and a PNG, JPEG, WebP or SVG logo under 180 KB.');
		error.status = 400;
		throw error;
	}
	if (!companyName && !logoDataUrl) {
		return { companyName: '', logoDataUrl: '', cleared: true };
	}
	return { companyName, logoDataUrl, cleared: false };
}

function agencyEligible(pass) {
	const plan = String((pass && pass.plan) || '').toLowerCase();
	return plan === 'team' || plan === 'pro';
}

function newWebhookSecret() {
	return {
		id: crypto.randomBytes(8).toString('hex'),
		secret: crypto.randomBytes(24).toString('hex'),
		createdAt: new Date().toISOString(),
	};
}

function publicWebhook(row, baseUrl) {
	const hook = row && row.agencyCi;
	if (!hook || !HOOK_ID_RE.test(hook.id)) return null;
	const root = String(baseUrl || 'https://us-central1-kaanmuar.cloudfunctions.net/reviewUrl').replace(/\/$/, '');
	return {
		id: hook.id,
		url: root + '/agency/ci/' + hook.id,
		createdAt: hook.createdAt || null,
		hasSecret: true,
	};
}

function signed(secret, raw, header) {
	if (!secret || raw == null || !header) return false;
	const want = Buffer.from('sha256=' + crypto.createHmac('sha256', String(secret)).update(raw).digest('hex'));
	const got = Buffer.from(String(header));
	return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function verifyCiRequest(row, rawBody, headers) {
	const hook = row && row.agencyCi;
	if (!hook || !hook.secret) return false;
	const h = headers || {};
	const sig = h['x-qa-lab-signature'] || h['x-hub-signature-256'] || '';
	return signed(hook.secret, rawBody, sig);
}

function pdfBrand(brand) {
	const row = brand || {};
	const company = cleanCompany(row.companyName);
	const logo = cleanLogo(row.logoDataUrl);
	if (!company && !logo) return null;
	return {
		companyName: company,
		logoDataUrl: logo,
		eyebrow: company || 'Agency report',
		byline: 'Report by QA-lab URL Review',
	};
}

module.exports = {
	brandingOf,
	publicBranding,
	sanitizeBranding,
	agencyEligible,
	newWebhookSecret,
	publicWebhook,
	signed,
	verifyCiRequest,
	pdfBrand,
	HOOK_ID_RE,
};
