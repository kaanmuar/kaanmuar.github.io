const DIR = '../../media/check-faces-2026-11/';
const STILLS = [
	['crystal-critical.png', 'Crystal relic', 'Critical threat as a cut-glass octagon, cover or share card.'],
	['line-cyber-map.png', 'Line light', 'The cyber attacks map (#3819) as a holographic globe with the threat levels.'],
	['badge-check-grid.png', 'Frosted badge', 'The check grid as frosted app tiles, for the paid report cover.'],
	['crystal-hack-signs.mp4', 'Generated clip', 'Hack signs: the scan passes and the crack lights. Image-to-video from the crystal still.'],
];

const grid = document.getElementById('stills-grid');
let left = grid ? STILLS.length : 0;
const gone = (f) => {
	f.remove();
	if (--left === 0) grid.innerHTML = '<p class="lede">Not generated yet: the image and video models were unavailable for round one. They follow on the chosen direction.</p>';
};
for (const [file, name, line] of grid ? STILLS : []) {
	const f = document.createElement('figure');
	const media = file.endsWith('.mp4') ? Object.assign(document.createElement('video'), { muted: true, loop: true, autoplay: true, playsInline: true }) : document.createElement('img');
	media.src = DIR + file;
	media.alt = line;
	media.addEventListener('error', () => gone(f));
	f.append(media);
	const cap = document.createElement('figcaption');
	cap.innerHTML = `<b>${name}.</b> ${line}`;
	f.append(cap);
	grid.append(f);
}
