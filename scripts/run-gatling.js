const { spawn } = require('child_process');
const { root, startLoadServer } = require('./load-server');

async function main() {
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const child = spawn('mvn', [
    '-B',
    '-f', 'gatling/pom.xml',
    'gatling:test',
    '-Dgatling.simulationClass=CvLoad',
    '-DbaseUrl=' + started.base
  ], { cwd: root, stdio: 'inherit' });
  const code = await new Promise((resolve) => {
    child.on('error', (err) => {
      if (err.code === 'ENOENT') console.error('Maven is not installed. Install Java and Maven, then rerun npm run test:gatling.');
      else console.error(err.message);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  started.server.close();
  process.exit(code);
}

main();
