const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { assertStaticServer } = require("../../scripts/static-server-check.js");

function serve(headers) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { res.writeHead(200, headers); res.end(); });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("a server without the static-server marker on the test port is refused", async () => {
  const server = await serve({});
  const { port } = server.address();
  await assert.rejects(assertStaticServer(port), new RegExp("Port " + port + " is held by a server other than scripts/static-server.py"));
  server.close();
});

test("scripts/static-server.py on the test port is reused", async () => {
  const server = await serve({ "X-Static-Server": "lab" });
  await assertStaticServer(server.address().port);
  server.close();
});

test("a free test port passes, so the runner can start its own server", async () => {
  const server = await serve({});
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  await assertStaticServer(port);
});
