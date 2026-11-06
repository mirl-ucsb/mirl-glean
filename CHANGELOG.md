# Changelog

MIRL Glean keeps its history the way a record keeps its sources: each change
dated, nothing erased. Versions follow [semantic versioning](https://semver.org);
picks files from any earlier version open in any later one.

Archived on Zenodo: [10.5281/zenodo.24023294](https://doi.org/10.5281/zenodo.24023294)
(every version); version 1.0.0 is
[10.5281/zenodo.24023295](https://doi.org/10.5281/zenodo.24023295).

## 1.0.0 (2026-11-06)

The first public release.

- **One search, twenty-two collections.** Museums (the Met, the Art Institute
  of Chicago, Cleveland, the V&A, the Rijksmuseum, SMK, Minneapolis, Princeton,
  Yale through LUX, the Science Museum Group, and the Smithsonian), libraries
  and archives (the Library of Congress, Wellcome, the Internet Archive, the
  David Rumsey Map Collection, and Harvard Library), aggregators (Europeana,
  Japan Search, K-samsök, and Openverse for Brooklyn, NYPL, Museums Victoria,
  and Nordic collections), and the open commons (Wikimedia Commons and Flickr).
  Harvard Art Museums, DPLA, and Te Papa join with a free key.
- **Thirty more, one click away.** Collections with no search API a web page can
  use open in a new tab with the same query: JSTOR through the UCSB library
  proxy; the Arab Image Foundation, Akkasah, the Palestinian Museum Digital
  Archive, the Qatar Digital Library, AUB Libraries, Archnet, and the
  Endangered Archives Programme; and major museums and national libraries.
- **Rights you can read.** Each collection's rights statement is read into
  one of five states (public domain, open licence, reuse with conditions, in
  copyright, rights unclear), shown on every result, with a filter for what is
  open to reuse.
- **Picks you keep.** Picked images keep their full records in the browser and
  in a picks file you save and open yourself. API keys never go into the file.
- **Citations.** Chicago author-date or notes-bibliography, for one image or
  every pick.
- **Downloads with provenance.** A zip of the picks with `manifest.json` (each
  file's sha-256, image and record URLs, retrieval time, and rights) and
  `citations.txt`. A file a host refused stays in the manifest with its link.
- **A local relay.** `serve.py` serves the tool on your own machine and fetches
  images from hosts that refuse page downloads, from an allowlist of
  collection hosts only.
- **The MIRL identity.** Familjen Grotesk and Epilogue on the lab's paper
  white, with the coral of the MIRL Risograph mark as Glean's key. Arabic and
  right-to-left text set in Noto Naskh Arabic.
