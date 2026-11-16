/* ipBlocked(ip): whether an address is one a review must never reach: private, loopback, link-local, carrier NAT,
   benchmark, documentation, multicast and reserved ranges, and the IPv6 forms that carry an IPv4 address
   (::ffff:0:0/96 is matched against the IPv4 ranges; NAT64, 6to4 and Teredo are refused whole).
   Anything that is not an IP address is refused too. The plain requests (url-review-core.js) and the browser
   (url-review-browser.js) share it. */

const net = require("net");

const BLOCKED = new net.BlockList();
[["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]]
  .forEach(([ip, bits]) => BLOCKED.addSubnet(ip, bits, "ipv4"));
[["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]]
  .forEach(([ip, bits]) => BLOCKED.addSubnet(ip, bits, "ipv6"));

function ipBlocked(raw) {
  const ip = String(raw || "").toLowerCase().replace(/^\[|\]$/g, "");
  const family = net.isIP(ip);
  return !family || BLOCKED.check(ip, family === 6 ? "ipv6" : "ipv4");
}

module.exports = { ipBlocked };
