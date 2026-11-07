/* MIRL Glean · the sources.
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
      /* the Internet Archive's IIIF server lets a page download the image; archive.org/download does not */
      try {
        const info = await getJSON(`https://iiif.archive.org/iiif/3/${enc(r.id)}/info.json`);
        const base = info.id || info["@id"];
        if (base) return base.replace(/\/$/, "") + "/full/max/0/default.jpg";
      } catch (e) { /* fall back to the original file */ }
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

  /* ---------------- more museums ---------------- */

  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  S.push({
    id: "mia", name: "Minneapolis Institute of Art", short: "Mia", institution: "Minneapolis Institute of Art", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://search.artsmia.org/${enc(q)}?size=${n}&from=${(page - 1) * n}`);
      const h = d.hits || {};
      const total = typeof h.total === "object" ? h.total.value : h.total || 0;
      const items = (h.hits || []).map((x) => x._source || {}).filter((o) => o.image === "valid" && o.public_access !== 0).map((o) => {
        const host = `https://${o.id % 7}.api.artsmia.org`;
        return rec({
          source: "mia", id: o.id, title: o.title, maker: plainMaker(o.artist), date: o.dated, medium: o.medium, kind: o.classification,
          thumb: `${host}/400/${o.id}.jpg`, full: `${host}/800/${o.id}.jpg`,
          link: `https://collections.artsmia.org/art/${o.id}`, institution: this.institution, accession: o.accession_number, credit: o.creditline,
          rights: rights(o.rights_type || o.image_copyright || "", o.rights_type || undefined),
        });
      });
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "princeton", name: "Princeton University Art Museum", short: "Princeton", institution: "Princeton University Art Museum", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://data.artmuseum.princeton.edu/search?q=${enc(q)}&type=artobjects&size=${n}&from=${(page - 1) * n}`);
      const h = d.hits || {};
      const total = typeof h.total === "object" ? h.total.value : h.total || 0;
      const items = (h.hits || []).map((x) => x._source || {}).filter((o) => arr(o.primaryimage).length).map((o) => {
        const b = arr(o.primaryimage)[0];
        return rec({
          source: "princeton", id: o.objectid, title: o.displaytitle, maker: siMaker(o.displaymaker), date: o.displaydate, medium: o.medium,
          thumb: b + "/full/400,/0/default.jpg", full: b + "/full/2000,/0/default.jpg",
          link: `https://artmuseum.princeton.edu/collections/objects/${o.objectid}`, institution: this.institution,
          accession: o.objectnumber, credit: o.creditline, rights: rights("", "see museum image terms"),
        });
      });
      return { items, total, more: page * n < total };
    },
  });

  S.push({
    id: "lux", name: "Yale (LUX)", short: "Yale", institution: "Yale University", kind: "museum", on: true,
    async search(q, page, n) {
      const query = JSON.stringify({ AND: [{ text: q }, { hasDigitalImage: 1 }] });
      const d = await getJSON(`https://lux.collections.yale.edu/api/search/item?q=${enc(query)}&page=${page}&pageLength=${n}`);
      const ids = (d.orderedItems || []).map((x) => x.id);
      const objs = await pool(ids, 6, (id) => getJSON(id));
      const items = objs.filter(Boolean).map((o) => { try { return this.parse(o); } catch (e) { return null; } }).filter((r) => r && r.thumb);
      /* LUX reports its total on a separate estimate call; a full page means there is more */
      return { items, total: ids.length < n ? (page - 1) * n + ids.length : page * n + 1, more: ids.length === n, estimate: true };
    },
    parse(o) {
      const names = arr(o.identified_by).filter((x) => x && x.type === "Name");
      const prod = o.produced_by || o.created_by || {};
      const agents = arr(prod.carried_out_by).concat(...arr(prod.part).map((p) => arr(p && p.carried_out_by)));
      const ts = prod.timespan || (arr(prod.part).find((p) => p && p.timespan) || {}).timespan || {};
      let img = "";
      for (const rep of arr(o.representation)) for (const dob of arr(rep.digitally_shown_by)) for (const ap of arr(dob.access_point)) if (!img && ap.id) img = ap.id;
      if (!img) return null;
      const unit = arr(o.member_of).map((m) => m._label).filter(Boolean)[0] || "";
      return rec({
        source: "lux", id: o.id.split("/").pop(), title: (names[0] && names[0].content) || o._label, maker: (agents[0] && agents[0]._label) || "",
        date: (arr(ts.identified_by)[0] || {}).content || "",
        thumb: img, full: img.replace(/\/full\/![0-9]+,[0-9]+\//, "/full/!2000,2000/"),
        link: o.id.replace("/data/", "/view/"), institution: unit ? `${unit}, Yale University` : "Yale University",
        accession: (arr(o.identified_by).find((x) => x && x.type === "Identifier") || {}).content || "",
        rights: rights("", "see Yale image terms"),
      });
    },
  });

  S.push({
    id: "smg", name: "Science Museum Group", short: "Science Museum", institution: "Science Museum Group, London", kind: "museum", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://collection.sciencemuseumgroup.org.uk/search/images?q=${enc(q)}&page%5Bnumber%5D=${page - 1}&page%5Bsize%5D=${n}`, { headers: { Accept: "application/json" } });
      const base = "https://coimages.sciencemuseumgroup.org.uk/";
      const items = (d.data || []).map((x) => {
        const a = x.attributes || {};
        const mm = arr(a.multimedia).find((m) => m && m["@processed"]);
        if (!mm) return null;
        const p = mm["@processed"];
        const pick = (...ks) => { for (const k of ks) if (p[k] && p[k].location) return base + p[k].location; return ""; };
        const cr = a.creation || {};
        const maker = arr(cr.maker).map((m) => (m.summary && m.summary.title) || (arr(m.name)[0] || {}).value).filter(Boolean)[0] || "";
        return rec({
          source: "smg", id: x.id, title: (arr(a.title)[0] || {}).value || (a.summary && a.summary.title), maker,
          date: (arr(cr.date)[0] || {}).value || "", kind: (arr(a.name)[0] || {}).value || "",
          thumb: pick("medium_thumbnail", "small_thumbnail", "medium", "large"), full: pick("large", "medium"),
          link: (x.links && x.links.self) || "", institution: this.institution, accession: (arr(a.identifier)[0] || {}).value || x.id,
          rights: rights("by-nc-sa", "CC BY-NC-SA 4.0 (Science Museum Group)", "https://creativecommons.org/licenses/by-nc-sa/4.0/"),
        });
      }).filter(Boolean);
      const m = d.meta || {};
      const total = (m.count && m.count.type && m.count.type.all) || 0;
      return { items, total, more: page < (m.total_pages || 0) };
    },
  });

  /* ---------------- maps ---------------- */

  S.push({
    id: "rumsey", name: "David Rumsey Map Collection", short: "Rumsey", institution: "David Rumsey Map Collection, Stanford University", kind: "library", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://www.davidrumsey.com/luna/servlet/as/search?q=${enc(q)}&os=${(page - 1) * n}&bs=${n}`);
      const total = +d.totalResults || 0;
      const items = (d.results || []).filter((o) => o.urlSize2).map((o) => {
        const f = {};
        arr(o.fieldValues).forEach((fv) => Object.entries(fv).forEach(([k, v]) => { if (!f[k]) f[k] = arr(v)[0]; }));
        return rec({
          source: "rumsey", id: o.id, title: f["Short Title"] || o.displayName, maker: f["Author"] || f["Publisher"] || "",
          date: f["Date"] || f["Pub Date"] || "", kind: f["Type"] || "Map",
          /* Rumsey's IIIF server allows page downloads; its MediaManager images do not */
          thumb: o.urlSize2, full: `https://www.davidrumsey.com/luna/servlet/iiif/${o.id}/full/2000,/0/default.jpg`,
          link: `https://www.davidrumsey.com/luna/servlet/detail/${o.id}`, institution: this.institution, accession: f["List No"] || o.id,
          rights: rights("by-nc-sa", "CC BY-NC-SA 3.0 (David Rumsey Map Collection)", "https://creativecommons.org/licenses/by-nc-sa/3.0/"),
        });
      });
      return { items, total, more: page * n < total };
    },
  });

  /* ---------------- national aggregators ---------------- */

  S.push({
    id: "jps", name: "Japan Search", institution: "", kind: "aggregator", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://jpsearch.go.jp/api/item/search/jps-cross?keyword=${enc(q)}&size=${n}&from=${(page - 1) * n}&f-contents=thumb`);
      const R = { pdm: "pd", cc0: "pd", ccby: "open", ccbysa: "open", incr: "reserved" };
      const items = (d.list || []).map((x) => {
        const c = x.common || {};
        const thumb = arr(c.thumbnailUrl)[0];
        if (!thumb) return null;
        const code = String(c.contentsRightsType || "").toLowerCase();
        const st = R[code] || (/nc|nd|noncom|edu/.test(code) ? "cond" : "unknown");
        return rec({
          source: "jps", id: x.id, title: c.title, maker: arr(c.contributor)[0] || "", date: arr(c.temporal).filter((t) => /\d{3,4}/.test(t)).pop() || arr(c.temporal)[0] || "",
          /* full is found from the IIIF manifest when there is one (resolveFull), else the thumbnail */
          kind: arr(c.category)[0] || "", thumb, full: c.iiifUrl ? "" : thumb, iiif: c.iiifUrl || "",
          link: c.linkUrl || `https://jpsearch.go.jp/item/${x.id}`, institution: (c.ownerOrg ? c.ownerOrg.toUpperCase() + " " : "") + "(via Japan Search)",
          accession: x.id, rights: { state: st, label: code ? "Japan Search rights code: " + code : MI.RIGHTS.unknown.label, url: "" },
        });
      }).filter(Boolean);
      return { items, total: d.hit || 0, more: page * n < (d.hit || 0) };
    },
    async resolveFull(r) { return (r.iiif && (await MI.iiifFirstImage(r.iiif, 2400))) || r.thumb; },
  });

  S.push({
    id: "ksamsok", name: "K-samsök (Sweden)", short: "K-samsök", institution: "", kind: "aggregator", on: true,
    async search(q, page, n) {
      const query = `text="${q.replace(/"/g, "")}" and thumbnailExists=j`;
      const d = await getJSON(`https://kulturarvsdata.se/ksamsok/api?method=search&hitsPerPage=${n}&startRecord=${(page - 1) * n + 1}&query=${enc(query)}&x-api=test`, { headers: { Accept: "application/json" } });
      const res = d.result || {};
      const dp = new DOMParser();
      const tx = (doc, tag) => { const el = doc.getElementsByTagNameNS("*", tag)[0]; return el ? clean(el.textContent) : ""; };
      /* the namespace prefix varies from record to record (ns1:, ksam:), so match the local name */
      const pk = (o, local) => { const k = Object.keys(o || {}).find((k) => k.endsWith(":" + local)); return k ? o[k] : undefined; };
      const val = (v) => (v && typeof v === "object" ? v["@value"] || v["@id"] || "" : v || "");
      const items = arr(res.records).map((r) => {
        const g = arr(r.record && r.record["@graph"]);
        const ent = g.find((x) => pk(x, "presentation")) || {};
        const xml = val(pk(ent, "presentation"));
        if (!xml) return null;
        const doc = dp.parseFromString(xml, "application/xml");
        const srcs = Array.from(doc.getElementsByTagNameNS("*", "src"));
        const src = (t) => (srcs.find((s) => s.getAttribute("type") === t) || {}).textContent || "";
        const thumb = src("lowres") || src("thumbnail");
        if (!thumb) return null;
        const reps = Array.from(doc.getElementsByTagNameNS("*", "representation"));
        const html = reps.find((e) => /html/i.test(e.getAttribute("format") || ""));
        const lic = tx(doc, "mediaLicenseUrl") || val(pk(ent, "itemLicenseUrl")) || "";
        const org = val(pk(ent, "serviceOrganizationFull"));
        return rec({
          source: "ksamsok", id: tx(doc, "entityUri") || tx(doc, "id"), title: tx(doc, "itemLabel"), maker: tx(doc, "nameLabel").replace(/^[^:]{1,40}:\s*/, "") || tx(doc, "byline"),
          date: tx(doc, "timeLabel") || tx(doc, "fromTime"), kind: tx(doc, "type"),
          thumb, full: src("highres") || thumb, link: (html && clean(html.textContent)) || tx(doc, "entityUri"),
          institution: org ? org + " (via K-samsök)" : "K-samsök, Swedish National Heritage Board",
          accession: tx(doc, "idLabel"), rights: rights(lic, undefined, lic),
        });
      }).filter(Boolean);
      return { items, total: res.totalHits || 0, more: page * n < (res.totalHits || 0) };
    },
  });

  S.push({
    id: "harvardlib", name: "Harvard Library", institution: "Harvard Library", kind: "library", on: true,
    async search(q, page, n) {
      const d = await getJSON(`https://api.lib.harvard.edu/v2/items.json?q=${enc(q)}&limit=${n}&start=${(page - 1) * n}&resourceType=still%20image&isOnline=true`);
      const mods = arr(d.items && d.items.mods);
      const txt = (v) => { v = arr(v)[0]; return v == null ? "" : typeof v === "object" ? v["#text"] || "" : String(v); };
      const items = mods.map((m) => {
        /* every url in the record, wherever MODS nests it */
        const urls = [];
        const walk = (x) => {
          if (!x || typeof x !== "object") return;
          if (Array.isArray(x)) return x.forEach(walk);
          if (x.url) arr(x.url).forEach((u) => urls.push(typeof u === "object" ? u : { "#text": u }));
          Object.entries(x).forEach(([k, v]) => { if (k !== "url") walk(v); });
        };
        walk(m.location); walk(m.relatedItem);
        const pv = urls.find((u) => u["@access"] === "preview");
        if (!pv) return null;
        const raw = urls.find((u) => u["@access"] === "raw object");
        const ctx = urls.find((u) => u["@access"] === "object in context");
        const ti = arr(m.titleInfo)[0] || {};
        const nm = arr(m.name)[0] || {};
        const oi = arr(m.originInfo)[0] || {};
        const restricted = raw && /restricted/i.test(raw["@note"] || "");
        const id = txt((arr(m.recordInfo)[0] || {}).recordIdentifier);
        return rec({
          source: "harvardlib", id: id || pv["#text"], title: txt(ti.title), maker: txt(nm.namePart), date: txt(oi.dateCreated) || txt(oi.dateOther) || txt(oi.dateIssued),
          thumb: pv["#text"].replace(/width=\d+&height=\d+/, "width=400&height=400"),
          /* a restricted full image needs a Harvard sign-in; the public preview is what can be saved */
          full: raw && !restricted ? raw["#text"] : pv["#text"].replace(/width=\d+&height=\d+/, "width=1200&height=1200"),
          link: (ctx && ctx["#text"]) || (raw && raw["#text"]) || pv["#text"], institution: this.institution, accession: id,
          rights: restricted ? rights("rights reserved", "full image restricted to Harvard users") : rights(txt(m.accessCondition), txt(m.accessCondition) || undefined),
        });
      }).filter(Boolean);
      const total = +((d.pagination || {}).numFound) || 0;
      return { items, total, more: page * n < Math.min(total, 10000) };
    },
  });

  /* Openverse indexes openly licensed images from many institutions; asked here only
     for collections not already searched directly above, so results do not double */
  const OV_NAMES = {
    brooklynmuseum: "Brooklyn Museum", museumsvictoria: "Museums Victoria", digitaltmuseum: "DigitaltMuseum (Norway and Sweden)",
    finnish_heritage_agency: "Finnish Heritage Agency", finnish_satakunnan_museum: "Satakunta Museum", national_museum_of_finland: "National Museum of Finland",
    nypl: "New York Public Library", bib_gulbenkian: "Biblioteca de Arte, Calouste Gulbenkian Foundation", flickr: "Flickr",
  };
  const openverse = (id, name, sources, kind) => ({
    id, name, institution: "", kind, on: true,
    async search(q, page, n) {
      const size = Math.min(n, 20);
      const d = await getJSON(`https://api.openverse.org/v1/images/?q=${enc(q)}&source=${sources}&page_size=${size}&page=${page}`);
      const items = (d.results || []).map((o) => rec({
        source: id, id: o.id, title: o.title, maker: o.creator || "", kind: o.category || "",
        thumb: o.thumbnail || o.url, full: o.url, link: o.foreign_landing_url || o.url,
        institution: (OV_NAMES[o.source] || o.source) + (o.source === "flickr" ? "" : " (via Openverse)"), accession: o.id,
        rights: rights((o.license || "") + " " + (o.license_url || ""), o.license ? ("CC " + o.license.toUpperCase() + " " + (o.license_version || "")).replace("CC PDM", "Public Domain Mark").replace("CC CC0", "CC0").trim() : undefined, o.license_url),
      }));
      return { items, total: d.result_count || 0, more: page < (d.page_count || 0) };
    },
  });
  S.push(openverse("openverse", "Openverse (Brooklyn, NYPL, Nordic, more)", "brooklynmuseum,museumsvictoria,digitaltmuseum,finnish_heritage_agency,finnish_satakunnan_museum,national_museum_of_finland,nypl,bib_gulbenkian", "aggregator"));
  S.push(openverse("flickr", "Flickr (open licences)", "flickr", "commons"));

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


  S.push({
    id: "tepapa", name: "Te Papa", institution: "Museum of New Zealand Te Papa Tongarewa", kind: "museum", on: true,
    key: { name: "Te Papa API key", required: true, help: "https://data.tepapa.govt.nz/docs/", note: "Free; register on Te Papa's developer site." },
    async search(q, page, n, cfg) {
      const d = await getJSON(`https://data.tepapa.govt.nz/collection/search?q=${enc(q)}&size=${n}&from=${(page - 1) * n}`, { headers: { "x-api-key": cfg.keys.tepapa, Accept: "application/json" } });
      const items = (d.results || []).map((o) => {
        const rep = arr(o.hasRepresentation).find((r) => r && (r.previewUrl || r.thumbnailUrl));
        if (!rep) return null;
        const pr = arr(o.production)[0] || {};
        const rt = rep.rights || {};
        return rec({
          source: "tepapa", id: o.id, title: o.title, maker: (pr.contributor && pr.contributor.title) || "", date: pr.verbatimCreatedDate || pr.createdDate || "",
          kind: o.type, thumb: rep.previewUrl || rep.thumbnailUrl, full: rt.allowsDownload ? rep.contentUrl || rep.previewUrl : rep.previewUrl,
          link: `https://collections.tepapa.govt.nz/object/${o.id}`, institution: this.institution, accession: o.identifier, credit: o.creditLine || "",
          rights: rights((rt.title || "") + " " + (rt.iri || ""), rt.title || undefined, rt.iri),
        });
      }).filter(Boolean);
      const total = ((d._metadata || {}).resultset || {}).count || 0;
      return { items, total, more: page * n < total };
    },
  });

  /* MIRL's hosted image relay (relay/ in this repo), used only when a collection
     refuses a page download. Empty switches it off. */
  MI.REMOTE_RELAY = "https://mirl-glean-relay.mirl-ucsb.workers.dev";

  MI.SOURCES = S;
  MI.source = (id) => S.find((s) => s.id === id);

  /* ---------------- the link-out shelf ----------------
     No public search API, or behind a sign-in. The query is carried across;
     the page opens in your browser, where you are already signed in. */
  MI.LINKOUTS = [
    /* subscription */
    {
      group: "Subscription", id: "jstor", name: "JSTOR", note: "Opens through the UCSB library proxy; choose Images under content type to see Artstor collections",
      url: (q, cfg) => (cfg.proxy || "") + "https://www.jstor.org/action/doBasicSearch?Query=" + enc(q) + "&so=rel",
    },
    /* the Arab world and the wider region */
    { group: "Middle East and North Africa", id: "aif", name: "Arab Image Foundation", url: (q) => "https://arabimagefoundation.org/search?q=" + enc(q) },
    { group: "Middle East and North Africa", id: "akkasah", name: "Akkasah (NYU Abu Dhabi)", url: (q) => "https://akkasah.org/?s=" + enc(q) },
    { group: "Middle East and North Africa", id: "pma", name: "Palestinian Museum Digital Archive", url: (q) => "https://palarchive.org/index.php/Search/objects?search=" + enc(q) },
    { group: "Middle East and North Africa", id: "qdl", name: "Qatar Digital Library", url: (q) => "https://www.qdl.qa/en/search/site/" + enc(q) },
    { group: "Middle East and North Africa", id: "aub", name: "AUB Libraries", url: (q) => "https://libraries.aub.edu.lb/blacklight/?q=" + enc(q) },
    { group: "Middle East and North Africa", id: "archnet", name: "Archnet (search there)", note: "Archnet does not accept a search from a link; this opens its search page", url: () => "https://www.archnet.org/search" },
    { group: "Middle East and North Africa", id: "eap", name: "Endangered Archives Programme", url: (q) => "https://eap.bl.uk/search?query=" + enc(q) },
    /* museums without an open search API */
    { group: "Museums", id: "bm", name: "British Museum", url: (q) => "https://www.britishmuseum.org/collection/search?keyword=" + enc(q) + "&image=true" },
    { group: "Museums", id: "louvre", name: "Louvre", url: (q) => "https://collections.louvre.fr/en/recherche?q=" + enc(q) },
    { group: "Museums", id: "getty", name: "Getty Museum", url: (q) => "https://www.getty.edu/art/collection/search?q=" + enc(q) },
    { group: "Museums", id: "nga", name: "National Gallery of Art", url: (q) => "https://www.nga.gov/artworks/free-search?keyword=" + enc(q) },
    { group: "Museums", id: "tate", name: "Tate", url: (q) => "https://www.tate.org.uk/search?q=" + enc(q) },
    { group: "Museums", id: "moma", name: "MoMA", url: (q) => "https://www.moma.org/collection/?q=" + enc(q) },
    { group: "Museums", id: "prado", name: "Prado", url: (q) => "https://www.museodelprado.es/en/the-collection/art-works?search=" + enc(q) },
    { group: "Museums", id: "parismusees", name: "Paris Musées", url: (q) => "https://www.parismuseescollections.paris.fr/en/recherche/type/oeuvre?keys=" + enc(q) },
    { group: "Museums", id: "smb", name: "Staatliche Museen zu Berlin", url: (q) => "https://recherche.smb.museum/?language=en&question=" + enc(q) },
    { group: "Museums", id: "mkg", name: "MK&G Hamburg", url: (q) => "https://sammlungonline.mkg-hamburg.de/en/search?s=" + enc(q) },
    { group: "Museums", id: "harvard-web", name: "Harvard Art Museums", whenNoKey: "harvard", url: (q) => "https://harvardartmuseums.org/collections?q=" + enc(q) },
    { group: "Museums", id: "tepapa-web", name: "Te Papa", whenNoKey: "tepapa", url: (q) => "https://collections.tepapa.govt.nz/search/" + enc(q) },
    /* libraries, archives, and national aggregators */
    { group: "Libraries and archives", id: "calisphere", name: "Calisphere", url: (q) => "https://calisphere.org/search/?q=" + enc(q) },
    { group: "Libraries and archives", id: "oac", name: "Online Archive of California", url: (q) => "https://oac.cdlib.org/search?query=" + enc(q) },
    { group: "Libraries and archives", id: "dpla-web", name: "DPLA", whenNoKey: "dpla", url: (q) => "https://dp.la/search?q=" + enc(q) + "&type=%22image%22" },
    { group: "Libraries and archives", id: "nypl", name: "NYPL Digital Collections", url: (q) => "https://digitalcollections.nypl.org/search/index?keywords=" + enc(q) },
    { group: "Libraries and archives", id: "gallica", name: "Gallica (BnF)", url: (q) => "https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=" + enc('(gallica all "' + q + '")') },
    { group: "Libraries and archives", id: "bodleian", name: "Digital Bodleian", url: (q) => "https://digital.bodleian.ox.ac.uk/search/?q=" + enc(q) },
    { group: "Libraries and archives", id: "ddb", name: "Deutsche Digitale Bibliothek", url: (q) => "https://www.deutsche-digitale-bibliothek.de/searchresults?query=" + enc(q) + "&isThumbnailFiltered=true" },
    { group: "Libraries and archives", id: "finna", name: "Finna (Finland)", url: (q) => "https://www.finna.fi/Search/Results?lookfor=" + enc(q) },
    { group: "Libraries and archives", id: "trove", name: "Trove (Australia)", url: (q) => "https://trove.nla.gov.au/search/category/images?keyword=" + enc(q) },
    { group: "Libraries and archives", id: "digitalnz", name: "DigitalNZ", url: (q) => "https://digitalnz.org/records?text=" + enc(q) },
    { group: "Libraries and archives", id: "dcomm", name: "Digital Commonwealth", url: (q) => "https://www.digitalcommonwealth.org/search?q=" + enc(q) },
  ];
})();
