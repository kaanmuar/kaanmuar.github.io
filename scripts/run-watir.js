const path = require('path');
const { root, clearSummary, run, capture, finish, missing } = require('./native-tool');

async function main() {
  clearSummary('Watir');
  const version = await capture('ruby', ['-e', 'print RUBY_VERSION']);
  if (!version) missing('Watir', 'Ruby is not installed. Install Ruby 3 or later, then rerun npm run test:watir.');
  if (Number(version.split('.')[0]) < 3) missing('Watir', 'Watir 7 needs Ruby 3 or later. This host has Ruby ' + version + '. Install a newer Ruby, then rerun npm run test:watir.');
  const env = Object.assign({}, process.env, {
    BUNDLE_GEMFILE: path.join(root, 'watir', 'Gemfile'),
    BUNDLE_PATH: path.join(root, 'watir', 'vendor', 'bundle')
  });
  const install = await run('bundle', ['install', '--quiet'], { env });
  if (install.missing) missing('Watir', 'Bundler is not installed. Run gem install bundler, then rerun npm run test:watir.');
  if (install.code) missing('Watir', 'bundle install could not install the Watir gems.');
  const result = await run('bundle', ['exec', 'rspec', 'watir/spec/catalog_spec.rb', '--format', 'documentation'], { env });
  finish('Watir', result.code);
}

main();
