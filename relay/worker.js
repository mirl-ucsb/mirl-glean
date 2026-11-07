/* MIRL Glean relay: a Cloudflare Worker.

   Some collections (the Met, Cleveland, the Science Museum Group) do not let a
   web page download their image files. This relay fetches one image on the
   page's behalf and hands it back with the header that lets the browser keep
   it, the same job serve.py does on a researcher's own machine.

   It is deliberately narrow:
   - only answers MIRL Glean's own pages (checked by the Origin header);
   - only fetches https images from the collection hosts listed below;
   - only passes back image responses, up to a size cap;
   - keeps no logs and stores nothing; it never sees searches, keys, or picks,
     only the address of the image being downloaded. */

const ALLOW_HOSTS = [
  // museums
  "metmuseum.org", "clevelandart.org", "artic.edu", "vam.ac.uk", "smk.dk", "micr.io",
  "harvardartmuseums.org", "artsmia.org", "princeton.edu", "yale.edu",
  "sciencemuseumgroup.org.uk", "tepapa.govt.nz", "brooklynmuseum.org", "museumsvictoria.com.au",
  // libraries, archives, aggregators
  "archive.org", "wellcomecollection.org", "loc.gov", "si.edu", "europeana.eu", "dp.la",
  "harvard.edu", "davidrumsey.com", "ndl.go.jp", "jpsearch.go.jp", "dimu.org", "finna.fi",
  "nypl.org", "gulbenkian.pt", "kulturarvsdata.se",
  // open commons
  "wikimedia.org", "openverse.org", "staticflickr.com", "flickr.com",
];

/* pages allowed to use the relay */
const ALLOW_ORIGINS = ["https://mirl-ucsb.github.io", "https://mirl.arthistory.ucsb.edu"];
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

const MAX_BYTES = 80 * 1024 * 1024;

const hostAllowed = (u) => {
  let p;
  try { p = new URL(u); } catch { return false; }
  if (p.protocol !== "https:") return false;
  const h = p.hostname.toLowerCase();
  return ALLOW_HOSTS.some((a) => h === a || h.endsWith("." + a));
};

const originAllowed = (o) => !!o && (ALLOW_ORIGINS.includes(o) || LOCAL_ORIGIN.test(o));

function reply(status, message, origin) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (origin) { headers["Access-Control-Allow-Origin"] = origin; headers["Vary"] = "Origin"; }
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

/* pass the image through as a stream, stopping if it runs past the cap */
function capped(body) {
  let seen = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > MAX_BYTES) controller.error(new Error("image larger than the relay limit"));
      else controller.enqueue(chunk);
    },
  }));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("MIRL Glean relay. See https://github.com/mirl-ucsb/mirl-glean/tree/main/relay\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (url.pathname !== "/fetch") return reply(404, "not found");
    if (request.method !== "GET") return reply(405, "GET only");
    if (!originAllowed(origin)) return reply(403, "this relay serves MIRL Glean only");

    const target = url.searchParams.get("url") || "";
    if (!hostAllowed(target)) return reply(403, "host not on the relay allowlist", origin);

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { "User-Agent": "MIRL-Glean-relay/1.0 (+https://github.com/mirl-ucsb/mirl-glean)" },
        redirect: "follow",
        cf: { cacheEverything: true, cacheTtl: 86400 },
      });
    } catch (err) {
      return reply(502, "could not reach the image host", origin);
    }
    if (!hostAllowed(upstream.url)) return reply(403, "redirected off the allowlist", origin);
    if (!upstream.ok || !upstream.body) return reply(upstream.status === 404 ? 404 : 502, "the image host answered " + upstream.status, origin);

    const type = upstream.headers.get("Content-Type") || "";
    if (!type.startsWith("image/") && !type.includes("octet-stream")) return reply(415, "not an image", origin);
    const length = +(upstream.headers.get("Content-Length") || 0);
    if (length > MAX_BYTES) return reply(413, "image larger than the relay limit", origin);

    const headers = {
      "Content-Type": type || "application/octet-stream",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    };
    if (length) headers["Content-Length"] = String(length);
    return new Response(capped(upstream.body), { status: 200, headers });
  },
};
