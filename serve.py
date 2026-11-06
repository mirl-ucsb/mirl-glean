#!/usr/bin/env python3
"""MIRL Image: a local server with an image relay.

Serves this folder at http://127.0.0.1:8796 and adds one route,
/__mirl/fetch?url=..., which fetches an image from an allowlisted collection
host and hands it back to the page. Some museums (the Met, Cleveland, the
Internet Archive) do not let a web page fetch their image files, so without
this the page can only open those images in a new tab.

It listens on 127.0.0.1 only, fetches https URLs on the hosts below only, and
passes back image responses only. Nothing is logged to disk or stored.

    python3 serve.py            # then open http://127.0.0.1:8796
    python3 serve.py 8800       # another port
"""
import http.server
import json
import os
import socketserver
import sys
import urllib.parse
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8796
ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_BYTES = 80 * 1024 * 1024

# hosts the relay may fetch from (a host matches itself and its subdomains)
ALLOW = (
    # museums
    "metmuseum.org", "clevelandart.org", "artic.edu", "vam.ac.uk", "smk.dk", "micr.io",
    "harvardartmuseums.org", "artsmia.org", "princeton.edu", "yale.edu",
    "sciencemuseumgroup.org.uk", "tepapa.govt.nz", "brooklynmuseum.org", "museumsvictoria.com.au",
    # libraries, archives, aggregators
    "archive.org", "wellcomecollection.org", "loc.gov", "si.edu", "europeana.eu", "dp.la",
    "harvard.edu", "davidrumsey.com", "ndl.go.jp", "jpsearch.go.jp", "dimu.org", "finna.fi",
    "nypl.org", "gulbenkian.pt", "kulturarvsdata.se",
    # open commons
    "wikimedia.org", "openverse.org", "staticflickr.com", "flickr.com",
)


def allowed(url):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or not p.hostname:
        return False
    h = p.hostname.lower()
    return any(h == a or h.endswith("." + a) for a in ALLOW)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path)
        if path.path == "/__mirl/ping":
            return self._json(200, {"relay": True})
        if path.path == "/__mirl/fetch":
            return self._relay(urllib.parse.parse_qs(path.query).get("url", [""])[0])
        return super().do_GET()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _relay(self, url):
        if not allowed(url):
            return self._json(403, {"error": "host not on the relay allowlist"})
        req = urllib.request.Request(url, headers={"User-Agent": "MIRL-Image/0.1 (local relay)"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                final = r.geturl()
                if not allowed(final):
                    return self._json(403, {"error": "redirected off the allowlist"})
                ctype = r.headers.get("Content-Type", "")
                if not ctype.startswith("image/") and "octet-stream" not in ctype:
                    return self._json(415, {"error": "not an image: " + ctype})
                data = r.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    return self._json(413, {"error": "image larger than the relay limit"})
        except Exception as e:  # network errors, HTTP errors
            return self._json(502, {"error": str(e)})
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    try:
        srv = Server(("127.0.0.1", PORT), Handler)
    except OSError as e:
        if e.errno in (48, 98):  # address already in use (macOS, Linux)
            sys.exit(f"Port {PORT} is already in use. MIRL Image may already be running: "
                     f"open http://127.0.0.1:{PORT}, or start on another port with "
                     f"python3 serve.py {PORT + 1}")
        raise
    with srv as s:
        print(f"MIRL Image at http://127.0.0.1:{PORT}  (Ctrl-C to stop)")
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            pass
