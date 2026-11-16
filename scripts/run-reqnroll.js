const { clearSummary, wantedIds, run, finish, missing } = require('./native-tool');

async function main() {
  clearSummary('Reqnroll');
  const args = ['test', 'reqnroll/CatalogLab.csproj', '--nologo', '--logger', 'console;verbosity=normal'];
  const ids = wantedIds();
  if (ids.length) args.push('--filter', ids.map((id) => 'Category=' + id).join('|'));
  const result = await run('dotnet', args, { env: Object.assign({}, process.env, { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }) });
  if (result.missing) missing('Reqnroll', 'The .NET SDK is not installed. Install .NET 8 or later, then rerun npm run test:reqnroll.');
  finish('Reqnroll', result.code);
}

main();
