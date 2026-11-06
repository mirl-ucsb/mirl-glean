/* MIRL Image · the sources.
   Each adapter queries one open collection API and folds its answer into the
   common record:

     { uid, source, id, title, maker, makerInverted, date, medium, kind,
       thumb, full, link, institution, accession, credit,
       rights: { state, label, url } }

   search(q, page, n, cfg) resolves to { items, total, more }.
   Every API here was checked to answer a browser request from file:// (CORS).
   Sources with no usable API are in MI.LINKOUTS, searched in a new tab. */
(function () {
  "use strict";
  const MI = window.MI;
  const { getJSON, first, clean, stripHtml, rights, pool } = MI;
  const enc = encodeURIComponent;

  const rec = (o) => Object.assign({
    title: "", maker: "", makerInverted: false, date: "", medium: "", kind: "",
    thumb: "", full: "", link: "", institution: "", accession: "", credit: "",
    rights: rights(""),
  }, o, { uid: o.source + ":" + o.id });

  /* "Félix Bonfils (French, 1831–1885)" -> "Félix Bonfils"; "Name\nAmerican, born 1943" -> "Name" */
  const plainMaker = (s) => clean(String(s || "").split("\n")[0].replace(/\s*\([^)]*\)\s*/g, " "));
  /* "Frederic Edwin Church, American, 1826–1900" -> "Frederic Edwin Church" */
  const siMaker = (s) => {
    s = clean(s);
    const parts = s.split(", ");
    return parts.length > 1 && /\d{3,4}|american|british|french|german|italian|lebanese|born|active/i.test(parts.slice(1).join(" ")) ? parts[0] : s;
  };
  const titleCase = (s) => String(s || "").replace(/\b([a-z])/g, (m) => m.toUpperCase());

  const S = [];

  /* ---------------- museums ---------------- */

  S.push({
    id: "met", name: "The Met", institution: "Metropolitan Museum of Art, New York", kind: "museum", on: true,
    async search(q, page, n) {
      const base = "https://collectionapi.metmuseum.org/public/collection/v1.1";
      const s = await getJSON(`${base}/search?q=${enc(q)}&hasImages=true&limit=${n}&offset=${(page - 1) * n}`);
      const ids = s.objectIDs || [];
      const objs = await pool(ids, 6, (id) => getJSON(`${base.replace("v1.1", "v1")}/objects/${id}`));
      const items = objs.filter((o) => o && o.primaryImageSmall).map((o) => rec({
        source: "met", id: o.objectID, title: o.title, maker: o.artistDisplayName, date: o.objectDate,
        medium: o.medium, kind: o.classification || o.objectName, thumb: o.primaryImageSmall, full: o.primaryImage || o.primaryImageSmall,
        link: o.objectURL, institution: this.institution, accession: o.accessionNumber, credit: o.creditLine,
        rights: o.isPublicDomain ? rights("public domain", "public domain (Met Open Access)") : rights("copyrighted", "in copyright or restricted"),
      }));
      return { items, total: s.total || 0, more: page * n < (s.total || 0) };
    },
  });

  S.push({
    id: "aic", name: "Art Institute of Chicago", short: "AIC", institution: "Art Institute of Chicago", kind: "museum", on: true,
    async search(q, page, n) {
      const f = "id,title,image_id,artist_display,date_display,medium_display,is_public_domain,credit_line,main_reference_number,artwork_type_title,copyright_notice";
      const d = await getJSON(`https://api.artic.edu/api/v1/artworks/search?q=${enc(q)}&limit=${n}&page=${page}&fields=${f}`);
      const iiif = (d.config && d.config.iiif_url) || "https://www.artic.edu/iiif/2";
      const items = (d.data || []).filter((o) => o.image_id).map((o) => rec({
        source: "aic", id: o.id, title: o.title, maker: plainMaker(o.artist_display), date: o.date_display,
        medium: o.medium_display, kind: o.artwork_type_title,
        thumb: `${iiif}/${o.image_id}/full/400,/0/default.jpg`,
        full: `${iiif}/${o.image_id}/full/${o.is_public_domain ? 1686 : 843},/0/default.jpg`,
        link: `https://www.artic.edu/artworks/${o.id}`, institution: this.institution, accession: o.main_reference_number, credit: o.credit_line,
        rights: o.is_public_domain ? rights("cc0", "public domain (CC0)") : rights("copyrighted", o.copyright_notice ? "in copyright: " + clean(o.copyright_notice) : "in copyright"),
      }));
      const total = (d.pagination && d.pagination.total) || 0;
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "cma", name: "Cleveland Museum of Art", short: "Cleveland", institution: "Cleveland Museum of Art", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://openaccess-api.clevelandart.org/api/artworks/?q=${enc(q)}&has_image=1&limit=${n}&skip=${(page - 1) * n}`);
      const items = (d.data || []).filter((o) => o.images && o.images.web).map((o) => rec({
        source: "cma", id: o.id, title: o.title, maker: plainMaker(o.creators && o.creators[0] && o.creators[0].description),
        date: o.creation_date, medium: o.technique, kind: o.type,
        thumb: o.images.web.url, full: (o.images.print || o.images.web).url,
        link: o.url, institution: this.institution, accession: o.accession_number, credit: o.creditline,
        rights: o.share_license_status === "CC0" ? rights("cc0", "public domain (CC0)") : rights("copyrighted", "in copyright"),
      }));
      const total = (d.info && d.info.total) || 0;
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "vam", name: "V&A", institution: "Victoria and Albert Museum, London", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://api.vam.ac.uk/v2/objects/search?q=${enc(q)}&images_exist=1&page_size=${n}&page=${page}`);
      const items = (d.records || []).filter((o) => o._images && o._images._iiif_image_base_url).map((o) => {
        const b = o._images._iiif_image_base_url;
        return rec({
          source: "vam", id: o.systemNumber, title: o._primaryTitle || o.objectType, maker: o._primaryMaker && o._primaryMaker.name,
          makerInverted: true, date: o._primaryDate, kind: o.objectType,
          thumb: b + "full/!400,400/0/default.jpg", full: b + "full/!2000,2000/0/default.jpg",
          link: `https://collections.vam.ac.uk/item/${o.systemNumber}/`, institution: this.institution, accession: o.accessionNumber,
          rights: rights("v&a terms", "V&A terms: non-commercial use", "https://www.vam.ac.uk/info/va-websites-terms-conditions"),
        });
      });
      const total = (d.info && d.info.record_count) || 0;
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "rijks", name: "Rijksmuseum", institution: "Rijksmuseum, Amsterdam", kind: "museum", on: true,
    _cache: {},
    async search(q, page, n) {
      /* Linked Art search: no full-text field, so title and description are both asked and merged */
      let ids = this._cache[q];
      if (!ids) {
        const u = (f) => `https://data.rijksmuseum.nl/search/collection?${f}=${enc(q)}&imageAvailable=true`;
        const [a, b] = await Promise.all([getJSON(u("title")).catch(() => null), getJSON(u("description")).catch(() => null)]);
        if (!a && !b) throw new Error("no answer");
        const seen = new Set();
        ids = [];
        for (const d of [a, b]) for (const it of (d && d.orderedItems) || []) if (!seen.has(it.id)) { seen.add(it.id); ids.push(it.id); }
        this._cache[q] = ids;
      }
      const slice = ids.slice((page - 1) * n, page * n);
      const objs = await pool(slice, 6, (id) => getJSON(id, { headers: { Accept: "application/ld+json" } }));
      /* one malformed record is skipped, not allowed to sink the whole source */
      const items = objs.filter(Boolean).map((o) => { try { return this.parse(o); } catch (e) { return null; } }).filter((r) => r && r.thumb);
      return { items, total: ids.length, more: page * n < ids.length };
    },
    parse(o) {
      /* Linked Art may give any of these as a single object or as a list */
      const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
      const EN = "http://vocab.getty.edu/aat/300388277";
      const ids = arr(o.identified_by);
      const names = ids.filter((x) => x && x.type === "Name");
      const nm = names.find((x) => arr(x.language).some((l) => l && l.id === EN)) || names[0];
      const num = (ids.find((x) => x && x.type === "Identifier") || {}).content || "";
      const prod = o.produced_by || {};
      const parts = arr(prod.part);
      const agents = arr(prod.carried_out_by).concat(...parts.map((p) => arr(p && p.carried_out_by)));
      const label = (a) => {
        const ns = arr(a && a.notation);
        const en = ns.find((x) => x && x["@language"] === "en") || ns[0];
        return (en && en["@value"]) || (a && a._label) || "";
      };
      const ts = prod.timespan || (parts.find((p) => p && p.timespan) || {}).timespan || {};
      const date = (arr(ts.identified_by)[0] || {}).content || "";
      /* the image and its licence sit in subject_of -> digitally_carried_by */
      let img = "", lic = "", licUrl = "";
      const walk = (x) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(walk);
        if (x.access_point && !img) { const ap = arr(x.access_point).find((a) => a && /iiif|micr\.io/.test(a.id)); if (ap) img = ap.id; }
        if (typeof x.id === "string" && /creativecommons|rightsstatements/.test(x.id) && !licUrl) licUrl = x.id;
        if (typeof x._label === "string" && /public domain|cc|copyright|licen/i.test(x._label) && !lic) lic = x._label;
        Object.values(x).forEach(walk);
      };
      walk(o.subject_of);
      if (!img) return null;
      const m = /^(https:\/\/iiif\.micr\.io\/[^/]+)\//.exec(img);
      return rec({
        source: "rijks", id: o.id.split("/").pop(), title: (nm && nm.content) || num, maker: agents.map(label).filter(Boolean)[0] || "",
        date, thumb: m ? m[1] + "/full/400,/0/default.jpg" : img, full: m ? m[1] + "/full/2000,/0/default.jpg" : img,
        link: num ? `https://www.rijksmuseum.nl/en/collection/${enc(num)}` : o.id, institution: this.institution, accession: num,
        rights: rights(licUrl || lic, lic || undefined, licUrl),
      });
    },
  });

  S.push({
    id: "smk", name: "SMK", institution: "Statens Museum for Kunst, Copenhagen", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://api.smk.dk/api/v1/art/search/?keys=${enc(q)}&offset=${(page - 1) * n}&rows=${n}&filters=[has_image:true]&lang=en`);
      const items = (d.items || []).filter((o) => o.image_thumbnail).map((o) => {
        const t = (o.titles || []).find((x) => /engelsk|english/i.test(x.language || "")) || (o.titles || [])[0] || {};
        return rec({
          source: "smk", id: o.object_number, title: t.title, maker: o.production && o.production[0] && o.production[0].creator, makerInverted: true,
          date: o.production_date && o.production_date[0] && o.production_date[0].period, medium: (o.techniques || [])[0],
          kind: o.object_names && o.object_names[0] && o.object_names[0].name,
          thumb: o.image_thumbnail, full: o.image_native || o.image_thumbnail,
          link: o.frontend_url, institution: this.institution, accession: o.object_number, credit: o.credit_line && o.credit_line[0],
          rights: o.public_domain ? rights(o.rights || "public domain", "public domain") : rights(o.rights || "copyright"),
        });
      });
      return { items, total: d.found || 0, more: page * n < (d.found || 0) };
    },
  });

  /* ---------------- libraries, archives, aggregators ---------------- */

  S.push({
    id: "loc", name: "Library of Congress", short: "LoC", institution: "Library of Congress, Washington, DC", kind: "library", on: true,
    async search(q, page, n) {
      /* the Prints & Photographs endpoint: the general search with an image facet takes ~18s */
      const d = await getJSON(`https://www.loc.gov/photos/?q=${enc(q)}&fo=json&c=${n}&sp=${page}`);
      const img = (arr) => (arr || []).map((u) => u.split("#")[0]).filter((u) => !/\.gif$/.test(u));
      const items = (d.results || []).filter((o) => o.image_url && o.image_url.length).map((o) => {
        const ims = img(o.image_url);
        return rec({
          source: "loc", id: (o.id || "").replace(/\/$/, "").split("/").pop(), title: clean(first(o.title)), maker: titleCase(first(o.contributor)),
          date: o.date ? String(o.date).slice(0, 4) : "", medium: first(o.medium), kind: first(o.original_format),
          thumb: ims.find((u) => /_150px|t\.jpg|r\.jpg/.test(u)) || ims[0], full: ims[ims.length - 1],
          link: o.url || o.id, institution: this.institution, accession: (o.id || "").replace(/^https?:\/\/www\.loc\.gov/, "loc.gov"),
          rights: rights(first(o.rights) || "", first(o.rights) ? undefined : "see rights statement at source"),
        });
      });
      const total = (d.pagination && d.pagination.of) || 0;
      return { items, total, more: !!(d.pagination && d.pagination.next) };
    },
  });

  S.push({
    id: "wellcome", name: "Wellcome Collection", short: "Wellcome", institution: "Wellcome Collection, London", kind: "library", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://api.wellcomecollection.org/catalogue/v2/images?query=${enc(q)}&pageSize=${n}&page=${page}&include=source.contributors`);
      const items = (d.results || []).map((o) => {
        const loc = (o.locations || [])[0] || o.thumbnail || {};
        const base = String(loc.url || "").replace(/\/info\.json$/, "");
        const lic = loc.license || {};
        const src = o.source || {};
        const who = ((src.contributors || [])[0] || {}).agent || {};
        return rec({
          source: "wellcome", id: o.id, title: src.title, maker: who.label || "",
          thumb: base + "/full/!400,400/0/default.jpg", full: base + "/full/!2400,2400/0/default.jpg",
          link: `https://wellcomecollection.org/works/${src.id}`, institution: this.institution, accession: src.id, credit: loc.credit,
          rights: rights((lic.id || "") + " " + (lic.label || ""), lic.label, lic.url),
        });
      }).filter((r) => r.thumb.startsWith("http"));
      return { items, total: d.totalResults || 0, more: page < (d.totalPages || 0) };
    },
  });

  S.push({
    id: "smithsonian", name: "Smithsonian", institution: "Smithsonian Institution, Washington, DC", kind: "museum", on: true,
    key: { name: "api.data.gov key", fallback: "DEMO_KEY", help: "https://api.data.gov/signup/", note: "Works on the shared DEMO_KEY (a few dozen searches an hour). A free key lifts the limit." },
    async search(q, page, n, cfg) {
      const k = cfg.keys.smithsonian || this.key.fallback;
      /* many records are indexed as having images but carry none in the open record,
         so ask for three times the sheet and keep those with a picture */
      const rows = Math.min(n * 3, 100);
      const d = await getJSON(`https://api.si.edu/openaccess/api/v1.0/search?q=${enc(q + ' AND online_media_type:"Images"')}&start=${(page - 1) * rows}&rows=${rows}&api_key=${enc(k)}`);
      const r = d.response || {};
      const items = (r.rows || []).map((x) => {
        const c = x.content || {}, dn = c.descriptiveNonRepeating || {}, ft = c.freetext || {};
        const m = ((dn.online_media || {}).media || []).find((mm) => mm.type === "Images" && mm.content);
        if (!m) return null;
        const ids = /deliveryService/.test(m.content);
        const use = (m.usage && m.usage.access) || "";
        return rec({
          source: "smithsonian", id: x.id, title: x.title || (dn.title && dn.title.content), maker: siMaker(((ft.name || [])[0] || {}).content),
          date: ((ft.date || [])[0] || {}).content || "", medium: ((ft.physicalDescription || [])[0] || {}).content || "",
          thumb: ids ? m.content + "&max=400" : m.thumbnail || m.content, full: ids ? m.content + "&max=2400" : m.content,
          link: dn.record_link || dn.guid, institution: (dn.data_source ? dn.data_source + ", " : "") + "Smithsonian Institution",
          accession: ((ft.identifier || [])[0] || {}).content || dn.record_ID, credit: ((ft.creditLine || [])[0] || {}).content || "",
          rights: use === "CC0" ? rights("cc0", "public domain (CC0)") : rights(use, use ? "usage: " + use : undefined),
        });
      }).filter(Boolean).slice(0, n);
      return { items, total: r.rowCount || 0, more: page * rows < (r.rowCount || 0) };
    },
  });

  S.push({
    id: "europeana", name: "Europeana", institution: "", kind: "aggregator", on: true,
    key: { name: "Europeana API key", fallback: "api2demo", help: "https://pro.europeana.eu/page/get-api", note: "Works on the public demo key; a personal key is steadier." },
    async search(q, page, n, cfg) {
      const k = cfg.keys.europeana || this.key.fallback;
      const d = await getJSON(`https://api.europeana.eu/record/v2/search.json?query=${enc(q)}&qf=TYPE:IMAGE&media=true&rows=${n}&start=${(page - 1) * n + 1}&wskey=${enc(k)}`);
      const items = (d.items || []).filter((o) => o.edmPreview).map((o) => {
        const maker = (o.dcCreator || []).filter((c) => !/^#|^http/.test(c)).map((c) => c.replace(/\s*\([^)]*\)\s*$/, ""))[0] || "";
        const holder = first(o.dataProvider);
        return rec({
          source: "europeana", id: o.id, title: first(o.title), maker, date: first(o.year), kind: o.type,
          thumb: first(o.edmPreview), full: first(o.edmIsShownBy) || first(o.edmPreview),
          link: String(o.guid || "").split("?")[0], institution: holder ? holder + " (via Europeana)" : "Europeana",
          accession: o.id, credit: holder, rights: rights(first(o.rights), undefined, first(o.rights)),
        });
      });
      return { items, total: d.totalResults || 0, more: page * n < Math.min(d.totalResults || 0, 1000) };
    },
  });

  S.push({
    id: "ia", name: "Internet Archive", short: "Archive.org", institution: "Internet Archive", kind: "library", on: true,
    async search(q, page, n) {
      const fl = ["identifier", "title", "creator", "date", "licenseurl", "collection"].map((f) => "fl[]=" + f).join("&");
      const d = await getJSON(`https://archive.org/advancedsearch.php?q=${enc("(" + q + ") AND mediatype:image")}&${fl}&rows=${n}&page=${page}&output=json`);
      const res = d.response || {};
      const items = (res.docs || []).map((o) => rec({
        source: "ia", id: o.identifier, title: first(o.title), maker: first(o.creator), date: o.date ? String(o.date).slice(0, 4) : "",
        thumb: `https://archive.org/services/img/${o.identifier}`, full: "",
        link: `https://archive.org/details/${o.identifier}`, institution: "Internet Archive", accession: o.identifier,
        rights: rights(o.licenseurl || "", undefined, o.licenseurl),
      }));
      return { items, total: res.numFound || 0, more: page * n < (res.numFound || 0) };
    },
    /* the largest image file in the item, found when it is opened or downloaded */
    async resolveFull(r) {
      const d = await getJSON(`https://archive.org/metadata/${enc(r.id)}`);
      const files = (d.files || []).filter((f) => /jpe?g|png|tiff?/i.test(f.format || f.name) && f.source === "original");
      const pick = files.sort((a, b) => (+b.size || 0) - (+a.size || 0))[0];
      return pick ? `https://archive.org/download/${enc(r.id)}/${pick.name.split("/").map(enc).join("/")}` : r.thumb;
    },
  });

  S.push({
    id: "commons", name: "Wikimedia Commons", short: "Commons", institution: "Wikimedia Commons", kind: "commons", on: true,
    _offset: {},
    async search(q, page, n) {
      const off = (page - 1) * n;
      const d = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch=${enc(q + " filetype:bitmap")}&gsrlimit=${n}&gsroffset=${off}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=500&gsrinfo=totalhits`);
      const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      const items = pages.map((p) => {
        const ii = (p.imageinfo || [])[0];
        if (!ii) return null;
        const m = ii.extmetadata || {}, v = (k) => stripHtml(m[k] && m[k].value);
        const name = p.title.replace(/^File:/, "");
        return rec({
          source: "commons", id: p.pageid, title: v("ObjectName") || name.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
          maker: v("Artist"), date: v("DateTimeOriginal").slice(0, 10), kind: ii.mime,
          thumb: ii.thumburl, full: ii.url, link: ii.descriptionurl, institution: "Wikimedia Commons", accession: p.title,
          credit: v("Credit"), rights: rights((v("LicenseShortName") + " " + v("LicenseUrl")).trim(), v("LicenseShortName") || undefined, v("LicenseUrl")),
        });
      }).filter(Boolean);
      const total = (d.query && d.query.searchinfo && d.query.searchinfo.totalhits) || items.length;
      return { items, total, more: !!d.continue };
    },
  });

  /* ---------------- keyed sources: off until a key is pasted in ---------------- */

  S.push({
    id: "harvard", name: "Harvard Art Museums", short: "Harvard", institution: "Harvard Art Museums, Cambridge, MA", kind: "museum", on: true,
    key: { name: "Harvard Art Museums key", required: true, help: "https://harvardartmuseums.org/collections/api", note: "Free; request one from the museums." },
    async search(q, page, n, cfg) {
      const f = "id,title,people,dated,medium,primaryimageurl,url,objectnumber,creditline,classification,copyright";
      const d = await getJSON(`https://api.harvardartmuseums.org/object?apikey=${enc(cfg.keys.harvard)}&keyword=${enc(q)}&hasimage=1&size=${n}&page=${page}&fields=${f}`);
      const items = (d.records || []).filter((o) => o.primaryimageurl).map((o) => rec({
        source: "harvard", id: o.id, title: o.title, maker: ((o.people || [])[0] || {}).name || "", date: o.dated, medium: o.medium,
        kind: o.classification, thumb: o.primaryimageurl + "?width=400", full: o.primaryimageurl,
        link: o.url, institution: this.institution, accession: o.objectnumber, credit: o.creditline,
        rights: rights(o.copyright || "", o.copyright ? clean(o.copyright) : "see museum image terms"),
      }));
      const total = (d.info && d.info.totalrecords) || 0;
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "dpla", name: "DPLA", institution: "", kind: "aggregator", on: true,
    key: { name: "DPLA API key", required: true, help: "https://pro.dp.la/developers/policies#get-a-key", note: "Free; DPLA emails a key on request." },
    async search(q, page, n, cfg) {
      const d = await getJSON(`https://api.dp.la/v2/items?q=${enc(q)}&sourceResource.type=image&page_size=${n}&page=${page}&api_key=${enc(cfg.keys.dpla)}`);
      const items = (d.docs || []).filter((o) => o.object).map((o) => {
        const s = o.sourceResource || {};
        const dp = o.dataProvider && (o.dataProvider.name || first(o.dataProvider));
        return rec({
          source: "dpla", id: o.id, title: first(s.title), maker: first(s.creator), date: (first(s.date) || {}).displayDate || "",
          kind: first(s.format), thumb: first(o.object), full: first(o.object), link: o.isShownAt,
          institution: dp ? dp + " (via DPLA)" : "DPLA", accession: o.id, rights: rights(o.rights || first(s.rights), undefined, o.rights),
        });
      });
      return { items, total: d.count || 0, more: page * n < (d.count || 0) };
    },
  });

  MI.SOURCES = S;
  MI.source = (id) => S.find((s) => s.id === id);

  /* ---------------- the link-out shelf ----------------
     No public search API, or behind a sign-in. The query is carried across;
     the page opens in your browser, where you are already signed in. */
  MI.LINKOUTS = [
    {
      /* JSTOR's own search; narrow it to Images with the content-type filter there */
      id: "jstor", name: "JSTOR", note: "Opens through the UCSB library proxy; choose Images under content type to see Artstor collections",
      url: (q, cfg) => (cfg.proxy || "") + "https://www.jstor.org/action/doBasicSearch?Query=" + enc(q) + "&so=rel",
    },
    { id: "bm", name: "British Museum", url: (q) => "https://www.britishmuseum.org/collection/search?keyword=" + enc(q) + "&image=true" },
    { id: "getty", name: "Getty Museum", url: (q) => "https://www.getty.edu/art/collection/search?q=" + enc(q) },
    { id: "nga", name: "National Gallery of Art", url: (q) => "https://www.nga.gov/artworks/free-search?keyword=" + enc(q) },
    { id: "calisphere", name: "Calisphere", url: (q) => "https://calisphere.org/search/?q=" + enc(q) },
    { id: "harvard-web", name: "Harvard Art Museums", whenNoKey: "harvard", url: (q) => "https://harvardartmuseums.org/collections?q=" + enc(q) },
    { id: "dpla-web", name: "DPLA", whenNoKey: "dpla", url: (q) => "https://dp.la/search?q=" + enc(q) + "&type=%22image%22" },
    { id: "nypl", name: "NYPL Digital Collections", url: (q) => "https://digitalcollections.nypl.org/search/index?keywords=" + enc(q) },
  ];
})();
