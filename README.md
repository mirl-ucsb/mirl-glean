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

Several hosts (among them the Met, Cleveland, the Internet Archive, the Science
Museum Group, the David Rumsey Map Collection, and Japan Search) do not let a web
page fetch their image files, so from `file://` or GitHub Pages those images open
in a new tab to save by hand. To download them directly, run the local server, which adds a
small image relay:

```bash
python3 serve.py
```

Then open http://127.0.0.1:8796. The relay listens on your own machine only,
fetches https images from the collection hosts on its allowlist only, and
stores nothing.

## Sources

Twenty-two collections are searched live at once, grouped in the source list.
Each can be switched off before a search.

**Museums, no key needed:** the Met; Art Institute of Chicago; Cleveland Museum
of Art; V&A; Rijksmuseum (Linked Art; title and description searched); SMK;
Minneapolis Institute of Art; Princeton University Art Museum; Yale, through LUX
(Yale University Art Gallery, Yale Center for British Art, Beinecke, Peabody,
and Yale's libraries); Science Museum Group; and the Smithsonian (on the shared
`DEMO_KEY`, a few dozen searches an hour; a free api.data.gov key lifts that).

**Libraries and archives:** Library of Congress (Prints & Photographs);
Wellcome Collection; Internet Archive; David Rumsey Map Collection; Harvard
Library (HOLLIS Images and other image collections; thumbnails are public, many
full images are restricted to Harvard users and are saved as previews).

**Aggregators:** Europeana (on its public demo key); Japan Search, Japan's
national aggregator; K-samsök, Sweden's national heritage aggregator; and
Openverse, asked only for collections not searched directly above: Brooklyn
Museum, Museums Victoria, DigitaltMuseum, the Finnish Heritage Agency and
National Museum of Finland, NYPL, and the Gulbenkian art library.

**Open commons:** Wikimedia Commons, and Flickr's openly licensed photographs
(through Openverse).

**With a free key** pasted into Keys and settings: Harvard Art Museums, DPLA, and
Te Papa.

**Opened in a new tab with your query**, where you are already signed in, for
collections with no search API a web page can use:

- Subscription: JSTOR, through the UCSB library proxy (choose Images under
  content type to reach the Artstor collections). The proxy prefix is editable
  in settings.
- Middle East and North Africa: Arab Image Foundation, Akkasah (NYU Abu Dhabi),
  Palestinian Museum Digital Archive, Qatar Digital Library, AUB Libraries,
  Archnet (which cannot take a search from a link, so its search page opens),
  and the Endangered Archives Programme.
- Museums: British Museum, Louvre, Getty, National Gallery of Art, Tate, MoMA,
  Prado, Paris Musées, Staatliche Museen zu Berlin, MK&G Hamburg.
- Libraries and archives: Calisphere, Online Archive of California, NYPL Digital
  Collections, Gallica, Digital Bodleian, Deutsche Digitale Bibliothek, Finna,
  Trove, DigitalNZ, and Digital Commonwealth.

Collections whose sites block automated requests (several of the link-outs) could
not be checked from outside a browser; their search addresses follow each
site's own search page.

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
