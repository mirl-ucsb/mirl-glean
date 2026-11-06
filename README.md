# MIRL Image

A picture library across open collections. One search goes to the museums,
libraries, and archives that publish open collection APIs, and comes back as one
set of results with every licence shown. Pick what you need, copy Chicago
citations, and download the set as a zip whose manifest records each file's
sha-256, source, retrieval time, and rights.

A no-build, local-first tool from the Material / Image Research Lab (MIRL),
History of Art & Architecture, UC Santa Barbara. Nothing is uploaded. Searches go
only to the sources you switch on; picks and keys stay in this browser.

## Running it

Open `index.html` in a browser. That is enough to search, cite, and download from
most sources.

The Met, the Cleveland Museum of Art, and the Internet Archive do not let a web
page fetch their image files, so from `file://` those images open in a new tab to
save by hand. To download them directly, run the local server, which adds a
small image relay:

```bash
python3 serve.py
```

Then open http://127.0.0.1:8796. The relay listens on your own machine only,
fetches https images from the collection hosts on its allowlist only, and
stores nothing.

## Sources

Searched live, no key needed:

| Source | Holdings | Notes |
|---|---|---|
| The Met | Metropolitan Museum of Art | Open Access images marked public domain |
| Art Institute of Chicago | AIC | CC0 for public-domain works |
| Cleveland Museum of Art | CMA | CC0 for public-domain works |
| V&A | Victoria and Albert Museum | Images under the V&A's non-commercial terms |
| Rijksmuseum | Rijksmuseum | Linked Art API; title and description searched |
| SMK | Statens Museum for Kunst | Public-domain works marked |
| Library of Congress | Prints & Photographs | Rights vary; check each record |
| Wellcome Collection | Wellcome | Licence per image |
| Smithsonian | Smithsonian Open Access | Runs on the shared `DEMO_KEY`; a free key lifts the rate limit |
| Europeana | European aggregator | Runs on the public demo key; a personal key is steadier |
| Internet Archive | archive.org images | Licences often unstated |
| Wikimedia Commons | Commons | Licence per file |

With a free key, pasted into Keys and settings: **Harvard Art Museums** and
**DPLA**.

Opened in a new tab with your query, where you are already signed in:
**JSTOR** (through the UCSB library proxy; choose Images under content type to
reach the Artstor collections), the British Museum, the Getty, the National
Gallery of Art, Calisphere, and NYPL Digital Collections. These have no public
search API, or their API cannot be reached from a web page. The proxy prefix is
editable in settings.

## Rights

Every source's rights statement is read into one of five states: public domain,
open licence, reuse with conditions, in copyright, and rights unclear. The
filter can narrow results to what is open to reuse or to the public domain only.
The label is only as good as the source's metadata: confirm at the record before
publishing.

## Downloads and provenance

Download picks writes `mirl-image-picks-<date>.zip` containing:

- `images/`: each file as received, numbered and named by source and title.
- `manifest.json`: for each image, the sha-256 of the bytes received, size,
  content type, image URL, record URL, retrieval time, whether it came directly
  or through the relay, the rights statement, and the Chicago citation.
- `citations.txt`: the citations in the chosen style.

A file a host refused stays in the manifest with its URL and no hash, so the set
records what is missing as well as what arrived.

## Citations

Chicago author-date by default, notes-bibliography as an option. Citations are
built from the source's own fields (maker, date, title, medium, holding
institution, accession number, record URL); makers are inverted except where a
source already gives them inverted or the name is corporate. Read each one
before use: source metadata varies.

## Sensitive searches

A search is sent, as typed, to every source switched on in the source list.
Switch sources off before searching a name or place that should not leave your
machine.

## Files

```
index.html        the page
css/style.css     the MIRL identity, coral key
js/util.js        rights, Chicago citations, sha-256, zip writer
js/sources.js     one adapter per collection, and the link-out list
js/app.js         search, results, picks, downloads, settings
serve.py          optional local server and image relay
fonts/            Familjen Grotesk, Epilogue, IBM Plex Mono, Noto Naskh Arabic (SIL OFL)
```

## Licence

MIT. Fonts under the SIL Open Font License.
