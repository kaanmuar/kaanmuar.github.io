const fs = require('fs');
const path = require('path');

function chromeBinary() {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  return process.env.CHROME_BIN || '';
}

function chromeArgs(width, height) {
  return ['--headless=new', '--disable-gpu', '--lang=en-US', '--window-size=' + width + ',' + height];
}

function findChromedriver() {
  if (process.env.CHROMEDRIVER_PATH && fs.existsSync(process.env.CHROMEDRIVER_PATH)) return process.env.CHROMEDRIVER_PATH;
  const root = path.join(process.env.HOME || '', '.cache', 'selenium', 'chromedriver');
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'chromedriver') found.push(full);
    });
  };
  walk(root);
  found.sort();
  return found[found.length - 1] || '';
}

module.exports = { chromeBinary, chromeArgs, findChromedriver };
