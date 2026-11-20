// Edge GeoIP/ASN lookups from ip-location-db .mmdb files kept in R2 (#4031, split from #3838).
// Dependency-free: a minimal MaxMind DB (MMDB v2) reader, so no mmdb-lib (MIT) bundle and no Buffer/nodejs_compat needed.
// Data: sapics/ip-location-db `iptoasn-country` and `iptoasn-asn` (PDDL-1.0, GeoLite2-compatible records). See
// scripts/geoip-fetch.js for the upload. Never commit the .mmdb files.
//   const geo = createGeoip({ bucket: env.GEOIP });   // R2 binding passed in by the caller
//   await geo.lookup("8.8.8.8")  // { country: "US", asn: 15169, asnOrg: "GOOGLE" }, or null
// A missing binding, object or unreadable database yields null, never a throw.

export const DEFAULT_COUNTRY_KEY = "geoip/iptoasn-country.mmdb";
export const DEFAULT_ASN_KEY = "geoip/iptoasn-asn.mmdb";

const METADATA_MARKER = [0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d]; // \xAB\xCD\xEFMaxMind.com
const DATA_SEPARATOR = 16;
const MAX_DEPTH = 32;
const utf8 = new TextDecoder();

// ---- IP parsing -------------------------------------------------------------------------------------------------
// Returns { bytes: number[4|16] } or null. IPv4-mapped IPv6 (::ffff:a.b.c.d) is returned as IPv4.
export function parseIp(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = (s) => {
    const parts = s.split(".");
    if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
    return parts.map(Number);
  };
  if (!text.includes(":")) return v4(text);
  let head = text;
  let tail4 = null;
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    tail4 = v4(text.slice(lastColon + 1));
    if (!tail4) return null;
    head = `${text.slice(0, lastColon)}:${((tail4[0] << 8) | tail4[1]).toString(16)}:${((tail4[2] << 8) | tail4[3]).toString(16)}`;
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const groups = (s) => (s === "" ? [] : s.split(":"));
  const left = groups(halves[0]);
  const right = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const bytes = all.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255]);
  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255;
  return mapped ? bytes.slice(12) : bytes;
}

// ---- MMDB decoder -----------------------------------------------------------------------------------------------
function uintBE(view, offset, size) {
  let n = 0;
  for (let i = 0; i < size; i++) n = n * 256 + view[offset + i];
  return n;
}

function decode(view, base, offset) {
  // base is the start of the section that pointers are relative to. Returns [value, nextOffset].
  if (offset >= view.length) throw new Error("mmdb: read past end");
  const ctrl = view[offset++];
  let type = ctrl >> 5;
  if (type === 1) {
    const ss = (ctrl >> 3) & 3;
    const vvv = ctrl & 7;
    let ptr;
    if (ss === 3) ptr = uintBE(view, offset, 4);
    else ptr = (ss === 0 ? 0 : ss === 1 ? 2048 : 526336) + vvv * 256 ** (ss + 1) + uintBE(view, offset, ss + 1);
    offset += ss + 1;
    return [decode(view, base, base + ptr)[0], offset];
  }
  if (type === 0) type = 7 + view[offset++];
  let size = ctrl & 31;
  if (size === 29) size = 29 + view[offset++];
  else if (size === 30) { size = 285 + uintBE(view, offset, 2); offset += 2; }
  else if (size === 31) { size = 65821 + uintBE(view, offset, 3); offset += 3; }
  switch (type) {
    case 2: return [utf8.decode(view.subarray(offset, offset + size)), offset + size];
    case 3: return [new DataView(view.buffer, view.byteOffset + offset, 8).getFloat64(0), offset + 8];
    case 4: return [view.slice(offset, offset + size), offset + size];
    case 5: case 6: case 9: return [uintBE(view, offset, size), offset + size];
    case 8: return [size === 0 ? 0 : new DataView(view.buffer, view.byteOffset + offset, 4).getInt32(0), offset + size];
    case 10: return [view.slice(offset, offset + size), offset + size];
    case 7: {
      const map = {};
      for (let i = 0; i < size; i++) {
        let key; let val;
        [key, offset] = decode(view, base, offset);
        [val, offset] = decode(view, base, offset);
        map[key] = val;
      }
      return [map, offset];
    }
    case 11: {
      const arr = [];
      for (let i = 0; i < size; i++) { let val; [val, offset] = decode(view, base, offset); arr.push(val); }
      return [arr, offset];
    }
    case 14: return [size !== 0, offset];
    case 15: return [new DataView(view.buffer, view.byteOffset + offset, 4).getFloat32(0), offset + 4];
    default: throw new Error(`mmdb: unsupported type ${type}`);
  }
}

function findMarker(view) {
  const start = Math.max(0, view.length - 128 * 1024);
  outer: for (let i = view.length - METADATA_MARKER.length; i >= start; i--) {
    for (let j = 0; j < METADATA_MARKER.length; j++) if (view[i + j] !== METADATA_MARKER[j]) continue outer;
    return i + METADATA_MARKER.length;
  }
  return -1;
}

// Parses an MMDB file (ArrayBuffer or Uint8Array). Returns { metadata, find(ip) }; throws on a malformed database.
export function parseMmdb(buffer) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const metaStart = findMarker(view);
  if (metaStart < 0) throw new Error("mmdb: metadata marker not found");
  const metadata = decode(view, metaStart, metaStart)[0];
  const { node_count: nodeCount, record_size: recordSize, ip_version: ipVersion } = metadata;
  if (![24, 28, 32].includes(recordSize) || !(nodeCount > 0) || ![4, 6].includes(ipVersion)) throw new Error("mmdb: bad metadata");
  const nodeBytes = (recordSize * 2) / 8;
  const treeSize = nodeCount * nodeBytes;
  if (treeSize + DATA_SEPARATOR > view.length) throw new Error("mmdb: truncated search tree");
  const dataStart = treeSize + DATA_SEPARATOR;

  const record = (node, right) => {
    const o = node * nodeBytes;
    if (recordSize === 24) return uintBE(view, o + (right ? 3 : 0), 3);
    if (recordSize === 32) return uintBE(view, o + (right ? 4 : 0), 4);
    const mid = view[o + 3];
    return right ? ((mid & 0x0f) * 2 ** 24) + uintBE(view, o + 4, 3) : ((mid >> 4) * 2 ** 24) + uintBE(view, o, 3);
  };
  const walk = (node, bytes, bits) => {
    for (let i = 0; i < bits && node < nodeCount; i++) node = record(node, (bytes[i >> 3] >> (7 - (i & 7))) & 1);
    return node;
  };
  // IPv4 addresses live under ::/96 in an IPv6 tree.
  let ipv4Start = 0;
  if (ipVersion === 6) ipv4Start = walk(0, new Array(12).fill(0), 96);

  return {
    metadata,
    // Record for the IP, or null when not found, the IP is invalid, or an IPv6 address hits an IPv4-only database.
    find(ip) {
      const bytes = typeof ip === "string" ? parseIp(ip) : ip;
      if (!bytes) return null;
      if (bytes.length === 16 && ipVersion === 4) return null;
      let node = bytes.length === 4 && ipVersion === 6 ? ipv4Start : 0;
      node = walk(node, bytes, bytes.length * 8);
      if (node === nodeCount) return null;
      if (node < nodeCount) throw new Error("mmdb: search tree did not terminate");
      const offset = node - nodeCount - DATA_SEPARATOR;
      if (offset < 0 || dataStart + offset >= view.length) throw new Error("mmdb: bad data pointer");
      return decode(view, dataStart, dataStart + offset)[0];
    },
  };
}

// ---- Worker-side lookups ----------------------------------------------------------------------------------------
const pickCountry = (rec) => {
  const code = rec?.country?.iso_code ?? rec?.country_code ?? rec?.iso_code ?? (typeof rec?.country === "string" ? rec.country : null);
  return typeof code === "string" && code ? code.toUpperCase() : null;
};
const pickAsn = (rec) => {
  const n = Number(rec?.autonomous_system_number ?? rec?.asn);
  return Number.isInteger(n) && n > 0 ? { asn: n, asnOrg: rec.autonomous_system_organization ?? rec.asn_org ?? null } : null;
};

// bucket: R2 binding (anything with `get(key) -> { arrayBuffer() } | null`), or undefined for "no database".
// openReader: swap in another reader (tests, mmdb-lib); it gets an ArrayBuffer and returns { find(ip) }.
// Loaded readers are kept per instance (one per isolate if created at module scope); a failed load is retried after retryMs.
export function createGeoip({
  bucket, countryKey = DEFAULT_COUNTRY_KEY, asnKey = DEFAULT_ASN_KEY, openReader = parseMmdb, retryMs = 60000, now = Date.now,
} = {}) {
  const slots = new Map();
  async function reader(key) {
    if (!bucket || typeof bucket.get !== "function" || !key) return null;
    const slot = slots.get(key);
    if (slot && (slot.promise || now() - slot.failedAt < retryMs)) return slot.promise;
    const entry = { promise: null, failedAt: 0 };
    entry.promise = (async () => {
      try {
        await null; // keep a synchronous throw from bucket.get() from running before entry.promise is set
        const object = await bucket.get(key);
        if (!object) throw new Error("missing");
        return await openReader(await object.arrayBuffer());
      } catch {
        entry.promise = null;
        entry.failedAt = now();
        return null;
      }
    })();
    slots.set(key, entry);
    return entry.promise;
  }
  const find = async (key, ip) => {
    try { return (await reader(key))?.find(ip) ?? null; } catch { return null; }
  };
  return {
    async country(ip) { return pickCountry(await find(countryKey, ip)); },
    async asn(ip) { return pickAsn(await find(asnKey, ip)); },
    // { country, asn, asnOrg } with null for what is unknown; null when nothing is known (or no database).
    async lookup(ip) {
      const [rec, asn] = await Promise.all([find(countryKey, ip), find(asnKey, ip)]);
      const country = pickCountry(rec);
      const a = pickAsn(asn);
      return country || a ? { country, asn: a?.asn ?? null, asnOrg: a?.asnOrg ?? null } : null;
    },
  };
}
