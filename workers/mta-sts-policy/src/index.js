// Serves the MTA-STS policy for carlosandmunoz.com at https://mta-sts.carlosandmunoz.com/.well-known/mta-sts.txt
export const POLICY = [
  "version: STSv1",
  "mode: enforce",
  "mx: mx1.improvmx.com",
  "mx: mx2.improvmx.com",
  "max_age: 1209600",
  ""
].join("\r\n");

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/.well-known/mta-sts.txt") return new Response("Not found", { status: 404 });
    return new Response(POLICY, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "max-age=3600" } });
  }
};
