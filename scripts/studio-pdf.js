/* Shared LinkedIn document PDF builder for tips / post / linkedin studios (#4243).
   Slide images often live in a sibling folder (carousel/) from the PDF (document/),
   so img src must be an absolute file:// URL — basename-relative loads blank pages. */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function slideSrc(img) {
	return pathToFileURL(path.resolve(img)).href;
}

function attrEscape(s) {
	return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function pdfHtml(images) {
	return (
		'<!doctype html><html><head><style>@page{size:1080px 1350px;margin:0}html,body{margin:0}img{display:block;width:1080px;height:1350px;page-break-after:always}</style></head><body>' +
		images.map((img) => '<img src="' + attrEscape(slideSrc(img)) + '">').join('') +
		'</body></html>'
	);
}

async function pdfFrom(browser, images, file) {
	if (!images.length) throw new Error('pdfFrom: no slide images');
	for (const img of images) {
		if (!fs.existsSync(img)) throw new Error('pdfFrom: missing slide ' + img);
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = path.join(path.dirname(file), '.pdf-' + path.basename(file, '.pdf') + '.html');
	const outTmp = file + '.tmp.pdf';
	fs.writeFileSync(tmp, pdfHtml(images));
	const page = await browser.newPage();
	try {
		await page.goto(pathToFileURL(tmp).href);
		await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), {
			timeout: 30_000,
		});
		const broken = await page.evaluate(() =>
			Array.from(document.images)
				.filter((i) => !i.naturalWidth)
				.map((i) => i.currentSrc || i.src)
		);
		if (broken.length) throw new Error('pdfFrom: images failed to load: ' + broken.join(', '));
		await page.pdf({ path: outTmp, width: '1080px', height: '1350px', printBackground: true });
		const size = fs.statSync(outTmp).size;
		// Empty 4-page shells from broken img src were ~3.8 KB; one real slide is far larger.
		const min = Math.max(20_000, images.length * 8_000);
		if (size < min) {
			fs.unlinkSync(outTmp);
			throw new Error('pdfFrom: PDF looks empty (' + size + ' bytes, need ≥' + min + ') for ' + file);
		}
		fs.renameSync(outTmp, file);
	} catch (err) {
		if (fs.existsSync(outTmp)) fs.unlinkSync(outTmp);
		throw err;
	} finally {
		await page.close();
		if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
	}
	return file;
}

module.exports = { pdfFrom, pdfHtml, slideSrc, attrEscape };
