const { clearSummary, run, finish, missing } = require('./native-tool');

const SUITES = {
  Selenide: { pom: 'selenide/pom.xml', npm: 'test:selenide' },
  TestNG: { pom: 'testng/pom.xml', npm: 'test:testng' }
};

async function main() {
  const framework = process.argv[2];
  const suite = SUITES[framework];
  if (!suite) {
    console.error('Usage: node scripts/run-java-suite.js Selenide|TestNG');
    process.exit(2);
  }
  clearSummary(framework);
  const result = await run('mvn', ['-B', '-f', suite.pom, 'test']);
  if (result.missing) missing(framework, 'Maven is not installed. Install Java 17 or later and Maven, then rerun npm run ' + suite.npm + '.');
  finish(framework, result.code);
}

main();
