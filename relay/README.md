# MIRL Glean relay

A small Cloudflare Worker that lets MIRL Glean download images from the
collections that refuse page downloads: the Met, the Cleveland Museum of Art,
and the Science Museum Group among them. It fetches one image on the page's
behalf and hands it back with the header that lets the browser keep it, the
same job `serve.py` does on a researcher's own computer.

Glean tries every image host directly first. Only when a host refuses does it
ask the relay, and if the relay is unavailable, Glean lists the missing images
with a button to open each one, as before.

## What it does and does not do

- It only fetches **https images** from the collection hosts listed in
  `worker.js` (the same list as `serve.py`), and only passes back responses that
  are images, up to 80 MB.
- It only answers **MIRL Glean's own pages**: mirl-ucsb.github.io,
  mirl.arthistory.ucsb.edu, and a copy running locally. Other websites cannot
  use it. (A script outside a browser can fake the page's origin, so the host
  allowlist and the image-only rule are the real limits on misuse.)
- It sees only the **address of the image** being downloaded. It never sees
  searches, API keys, or picks.
- It **keeps no logs and stores nothing**. Request logging is switched off in
  `wrangler.jsonc`. Cloudflare's edge may cache an image for a day, which only
  spares the collection a repeat request.

The relay is live at https://mirl-glean-relay.mirl-ucsb.workers.dev, on MIRL's
Cloudflare account.

## Deploying

You need a Cloudflare account and Node.js.

```bash
cd relay
npx wrangler login
npx wrangler deploy
```

`wrangler login` opens a browser to sign in to Cloudflare. `wrangler deploy`
prints the relay's address, something like
`https://mirl-glean-relay.<your-subdomain>.workers.dev`. Put that address in
`MI.REMOTE_RELAY` near the end of `js/sources.js`, and Glean uses it.

The free plan allows 100,000 requests a day, far more than Glean needs.

## Checking it

Open the address in a browser: it answers with one line naming itself. A
download from Glean of an image from the Met should then arrive in the zip, and
the manifest records it as fetched by "MIRL relay".
