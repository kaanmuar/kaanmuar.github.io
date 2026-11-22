/* Shared LinkedIn document PDF builder for tips / post / linkedin studios (#4243).
   Slide images often live in a sibling folder (carousel/) from the PDF (document/),
   so img src must be an absolute file:// URL — basename-relative loads blank pages. */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function slideSrc(img) {
	return pathToFileURL(path.resolve(img)).href;
}

function pdfHtml(images) {
	return (
		'<!doctype html><html><head><style>@page{size:1080px 1350px;margin:0}html,body{margin:0}img{display:block;width:1080px;height:1350px;page-break-after:always}</style></head><body>' +
		images.map((img) => '<img src="' + slideSrc(img) + '">').join('') +
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
	fs.writeFileSync(tmp, pdfHtml(images));
	const page = await browser.newPage();
	try {
		await page.goto(pathToFileURL(tmp).href);
		await page.waitForFunction(() =>
			Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0)
		);
		const broken = await page.evaluate(() =>
			Array.from(document.images)
				.filter((i) => !i.naturalWidth)
				.map((i) => i.currentSrc || i.src)
		);
		if (broken.length) throw new Error('pdfFrom: images failed to load: ' + broken.join(', '));
		await page.pdf({ path: file, width: '1080px', height: '1350px', printBackground: true });
	} finally {
		await page.close();
		if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
	}
	const size = fs.statSync(file).size;
	// Empty 4-page shells from broken img src were ~3.8 KB; one real slide is far larger.
	if (size < 20_000) throw new Error('pdfFrom: PDF looks empty (' + size + ' bytes) for ' + file);
	return file;
}

module.exports = { pdfFrom, pdfHtml, slideSrc };
