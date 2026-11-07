/* MIRL Glean · the desk: search, the contact sheet, the print, picks, downloads. */
(function () {
  "use strict";
  const MI = window.MI;
  const $ = (s) => document.querySelector(s);
  const esc = MI.esc;
  const VERSION = "1.0.0";

  /* ---------- settings and picks, kept in this browser only ---------- */
  const LS_CFG = "mirl-glean.cfg", LS_PICKS = "mirl-glean.picks";
  /* carry settings and picks across from the tool's earlier name, MIRL Image */
  try {
    [["mirl-image.cfg", LS_CFG], ["mirl-image.picks", LS_PICKS]].forEach(([o, n]) => {
      const v = localStorage.getItem(o);
      if (v != null && localStorage.getItem(n) == null) localStorage.setItem(n, v);
      if (v != null) localStorage.removeItem(o);
    });
  } catch (e) {}
  const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || "{}")); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* embedded in another page (an iframe on the MIRL site), or asked for with ?embed=1:
     a compact layout without the title block, with the source list folded away */
  const EMBED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })() || /[?&]embed=1\b/.test(location.search);
  if (EMBED) document.documentElement.classList.add("embedded");

  const cfg = load(LS_CFG, {
    keys: {}, off: {}, perSource: 12, cite: "ad", rights: "all", rollHidden: false, embedRollShown: false,
    proxy: "https://proxy.library.ucsb.edu/login?url=",
  });
  cfg.keys = cfg.keys || {}; cfg.off = cfg.off || {};
  const saveCfg = () => save(LS_CFG, cfg);

  let picks = new Map();
  try { (JSON.parse(localStorage.getItem(LS_PICKS) || "[]") || []).forEach((r) => picks.set(r.uid, r)); } catch (e) {}
  const savePicks = () => save(LS_PICKS, Array.from(picks.values()));

  /* ---------- search state ---------- */
  const state = { q: "", page: 0, view: "results", runs: 0, results: {}, order: [], shown: [] };
  const usable = (s) => !(s.key && s.key.required && !cfg.keys[s.id]);
  const active = () => MI.SOURCES.filter((s) => usable(s) && !cfg.off[s.id]);

  /* local relay (serve.py) for image hosts that refuse cross-origin downloads */
  MI.relay = false;
  if (location.protocol.startsWith("http")) {
    fetch("__mirl/ping").then((r) => r.ok && r.json()).then((d) => { if (d && d.relay) MI.relay = true; }).catch(() => {});
  }

  /* ---------- notice slip ---------- */
  let noticeT;
  function notice(msg, lead) {
    const n = $("#notice");
    n.textContent = msg;
    n.classList.add("show");
    clearTimeout(noticeT);
    noticeT = setTimeout(() => n.classList.remove("show"), 5600);
  }

  /* ---------- the register ---------- */
  function renderRoll() {
    const roll = $("#roll");
    const KINDS = [["museum", "Museums"], ["library", "Libraries and archives"], ["aggregator", "Aggregators"], ["commons", "Open commons"]];
    const ordered = KINDS.flatMap(([k]) => MI.SOURCES.filter((s) => s.kind === k));
    let lastKind = "";
    roll.innerHTML = ordered.map((s) => {
      const head = s.kind !== lastKind ? `<div class="kind">${esc((KINDS.find((k) => k[0] === s.kind) || [, ""])[1])}</div>` : "";
      lastKind = s.kind;
      const r = state.results[s.id];
      const can = usable(s), on = can && !cfg.off[s.id];
      let st = "", why = "";
      if (!can) st = "needs a key";
      else if (!on) st = "off";
      else if (r && r.status === "busy") st = `<span class="st busy">asking</span>`;
      else if (r && r.status === "err") {
        /* a shared demo key running dry is the common case: say what fixes it */
        const demo = s.key && !cfg.keys[s.id] && /rate limited|key refused/.test(r.err);
        const short = demo ? "demo key used up" : /^(timed out|blocked or offline|rate limited|key refused|error \d+|no answer)/.test(r.err) ? r.err : "could not read the answer";
        why = demo ? `The shared demo key for ${s.name} has hit its hourly limit. Add your own free key in Keys and settings.` : `${s.name}: ${r.err}`;
        st = `<span class="st err">${esc(short)}</span>`;
      } else if (r && r.status === "ok") {
        if (!r.total) st = "no matches";
        else if (!r.items.length) { st = "none with images"; why = `${s.name} matched ${r.total.toLocaleString()} records, but none in this batch has an image it shares openly (often because the works are in copyright).`; }
        else st = r.estimate ? `${r.items.length}${r.more ? "+" : ""}` : `${r.items.length} of ${r.total.toLocaleString()}`;
      }
      if (!/class="st/.test(st)) st = `<span class="st">${st}</span>`;
      const tip = why || (s.key && !can ? "Add a key in Keys and settings to search " + s.name : on ? "Click to leave " + s.name + " out" : "Click to include " + s.name);
      return head + `<button type="button" class="src ${on ? "" : "off"}" data-src="${s.id}" title="${esc(tip)}" ${can ? "" : "data-needkey"}>
        <span class="tick" aria-hidden="true"></span><span class="nm">${esc(s.name)}</span>${st}</button>`;
    }).join("");
    /* embedded, the list and the link-outs start folded and fold together */
    const hidden = EMBED ? !cfg.embedRollShown : !!cfg.rollHidden;
    roll.classList.toggle("hidden", hidden);
    $("#shelf").classList.toggle("hidden", EMBED && hidden);
    $("#toggle-roll").textContent = hidden ? (EMBED ? "Show sources and more collections" : "Show the list") : (EMBED ? "Hide sources" : "Hide the list");
    renderShelf();
    renderSum();
  }

  function renderShelf() {
    const q = state.q || $("#q").value.trim();
    const links = MI.LINKOUTS.filter((l) => !l.whenNoKey || !cfg.keys[l.whenNoKey]);
    const groups = [...new Set(links.map((l) => l.group))];
    $("#shelf").innerHTML = `<h3>Also search, signed in, in a new tab</h3>` + (q
      ? groups.map((g) => `<div class="shelfrow"><span class="label">${esc(g)}</span><span class="links">` +
          links.filter((l) => l.group === g).map((l) => `<a href="${esc(l.url(q, cfg))}" target="_blank" rel="noopener noreferrer" title="${esc(l.note || "Opens " + l.name + " in a new tab")}">${esc(l.name)}</a>`).join("") + `</span></div>`).join("")
      : `<p class="note">${links.length} more collections with no open search API, among them JSTOR (through the UCSB proxy), the Arab Image Foundation, Akkasah, the Palestinian Museum Digital Archive, the British Museum, the Louvre, the Getty, Tate, and Gallica, appear here once you search.</p>`);
  }

  function renderSum() {
    const rs = Object.values(state.results);
    if (!state.q) { $("#sum").textContent = "No search yet."; return; }
    const busy = rs.filter((r) => r.status === "busy").length;
    const ok = rs.filter((r) => r.status === "ok");
    const n = state.shown.length;
    $("#sum").textContent = `“${state.q}”: ${n} image${n === 1 ? "" : "s"} from ${ok.filter((r) => r.items.length).length} source${ok.length === 1 ? "" : "s"}` + (busy ? `, ${busy} still answering` : "") + ".";
  }

  /* ---------- running a search ---------- */
  async function search(q, more) {
    q = MI.clean(q);
    if (!q) return;
    if (!more) {
      state.q = q; state.page = 0; state.results = {}; state.runs++;
      history.replaceState(null, "", "#q=" + encodeURIComponent(q));
      setView("results");
    }
    const run = state.runs;
    state.page++;
    const page = state.page, n = cfg.perSource;
    const srcs = active().filter((s) => !more || (state.results[s.id] && state.results[s.id].more));
    srcs.forEach((s) => {
      const prev = state.results[s.id];
      state.results[s.id] = { status: "busy", items: prev ? prev.items : [], total: prev ? prev.total : 0, more: false };
    });
    renderRoll(); renderSheet();
    await Promise.all(srcs.map(async (s) => {
      const t0 = performance.now();
      try {
        const res = await s.search(q, page, n, cfg);
        if (run !== state.runs) return;
        const r = state.results[s.id];
        r.items = r.items.concat(res.items); r.total = res.total; r.more = res.more; r.estimate = !!res.estimate; r.status = "ok";
        r.ms = Math.round(performance.now() - t0);
      } catch (e) {
        if (run !== state.runs) return;
        Object.assign(state.results[s.id], { status: "err", err: e.message || "failed" });
      }
      renderRoll(); renderSheet();
    }));
    if (run !== state.runs) return;
    $("#more").classList.toggle("hidden", !Object.values(state.results).some((r) => r.more));
  }

  /* merge: round-robin across sources, so no one collection floods the sheet;
     near-duplicates (same title, maker, date) fold into the first sighting */
  function merged() {
    const lists = MI.SOURCES.map((s) => (state.results[s.id] && state.results[s.id].items) || []);
    const out = [], seen = new Map();
    const max = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) {
      for (const l of lists) {
        const r = l[i];
        if (!r) continue;
        const k = MI.slug(r.title, 60) + "|" + MI.slug(r.maker, 24) + "|" + MI.slug(r.date, 12);
        const hit = seen.get(k);
        if (hit && hit.source !== r.source && r.title) { (hit.also = hit.also || []).includes(r.source) || hit.also.push(r.source); continue; }
        seen.set(k, r);
        out.push(r);
      }
    }
    return out;
  }

  /* ---------- the contact sheet ---------- */
  const sname = (id) => { const s = MI.source(id); return s ? s.short || s.name : id; };

  function renderSheet() {
    const sheet = $("#sheet");
    const pool = state.view === "picked" ? Array.from(picks.values()) : merged();
    state.shown = pool.filter((r) => MI.rightsPass(r, cfg.rights));
    renderSum();
    if (!state.shown.length) {
      const busy = Object.values(state.results).some((r) => r.status === "busy");
      if (state.view === "picked") {
        sheet.innerHTML = `<div class="blank"><div class="big">Nothing picked yet.</div><p>Pick images on the sheet; they stay here between visits, ready to cite or download together.</p></div>`;
      } else if (!state.q) {
        const tries = ["Beirut", "Bonfils", "albumen print", "Chumash basket", "Gaza", "Palmyra", "حروفية"];
        sheet.innerHTML = `<div class="blank"><div class="big">Start with a search.</div>
          <p>One query goes to ${active().length} open collections at once (museums from the Met to Te Papa, national libraries and archives, the aggregators of Europe, Sweden, and Japan, and the open commons) and comes back as one set of results with every licence shown.</p>
          <div class="try">${tries.map((t) => `<button type="button" class="btn quiet" data-try="${esc(t)}" dir="auto">${esc(t)}</button>`).join("")}</div></div>`;
      } else {
        sheet.innerHTML = `<div class="blank"><div class="big">${busy ? "The sources are answering…" : "Nothing came back" + (cfg.rights !== "all" ? " under this rights filter." : ".")}</div>${!busy && cfg.rights !== "all" ? `<p>Set Rights to All to see images under other terms.</p>` : ""}</div>`;
      }
      return;
    }
    /* reuse frames already on the sheet so images do not reload on every arrival */
    const old = new Map(Array.from(sheet.querySelectorAll(".frame")).map((el) => [el.dataset.uid, el]));
    const frag = document.createDocumentFragment();
    state.shown.forEach((r, i) => {
      let el = old.get(r.uid);
      if (!el) el = buildFrame(r);
      el.classList.toggle("picked", picks.has(r.uid));
      el.querySelector(".pick").textContent = picks.has(r.uid) ? "Picked" : "Pick";
      el.dataset.i = i;
      frag.appendChild(el);
    });
    sheet.innerHTML = "";
    sheet.appendChild(frag);
  }

  function buildFrame(r) {
    const el = document.createElement("div");
    el.className = "frame";
    el.dataset.uid = r.uid;
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="print"><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>
      <button type="button" class="pick" aria-label="Pick this image">Pick</button>
      <div class="cap">
        <div class="t" dir="auto">${esc(r.title || "Untitled")}</div>
        <div class="m" dir="auto">${esc([r.maker, r.date].filter(Boolean).join(", ") || " ")}</div>
        <div class="s"><span class="mark rt-${r.rights.state}" title="${esc(r.rights.label)}">${esc(MI.RIGHTS[r.rights.state].tag)}</span><span class="from">${esc(sname(r.source))}${r.also ? ", also " + esc(r.also.map(sname).join(", ")) : ""}</span></div>
      </div>`;
    const img = el.querySelector("img");
    img.onload = () => img.classList.add("in");
    img.onerror = () => { el.querySelector(".print").innerHTML = `<span class="miss">image did not load</span>`; };
    img.src = r.thumb;
    return el;
  }

  /* ---------- picks ---------- */
  function togglePick(r) {
    if (picks.has(r.uid)) picks.delete(r.uid);
    else picks.set(r.uid, Object.assign({}, r, { pickedAt: new Date().toISOString(), query: state.q }));
    savePicks(); renderPicks();
    if (state.view === "picked") renderSheet();
    else {
      const el = document.querySelector(`.frame[data-uid="${CSS.escape(r.uid)}"]`);
      if (el) { el.classList.toggle("picked", picks.has(r.uid)); el.querySelector(".pick").textContent = picks.has(r.uid) ? "Picked" : "Pick"; }
    }
    if (!$("#printview").classList.contains("hidden")) renderPrint();
  }
  function renderPicks() {
    const n = picks.size;
    $("#pick-count").textContent = n ? String(n) : "";
    ["#copy-cites", "#zip", "#clear-picks", "#save-picks"].forEach((s) => ($(s).disabled = !n));
  }

  /* ---------- the print ---------- */
  let cur = -1;
  function openPrint(i) {
    cur = i;
    $("#veil").classList.remove("hidden");
    $("#printview").classList.remove("hidden");
    renderPrint();
  }
  function closeOverlays() {
    ["#veil", "#printview", "#settings", "#report"].forEach((s) => $(s).classList.add("hidden"));
    cur = -1;
  }
  async function renderPrint() {
    const r = state.shown[cur];
    if (!r) return closeOverlays();
    const s = MI.source(r.source);
    const rs = r.rights;
    const cite = MI.cite(r, cfg.cite);
    const row = (k, v, raw) => (v ? `<div><dt>${k}</dt><dd ${raw ? "" : 'dir="auto"'}>${raw ? v : esc(v)}</dd></div>` : "");
    $("#pv-plate").innerHTML = `<img alt="${esc(r.title)}" src="${esc(r.thumb)}" referrerpolicy="no-referrer">
      <div class="nav"><button class="btn" data-nav="-1" ${cur > 0 ? "" : "disabled"}>← Previous</button><button class="btn" data-nav="1" ${cur < state.shown.length - 1 ? "" : "disabled"}>Next →</button></div>`;
    $("#pv-entry").innerHTML = `
      <button class="btn quiet close" data-close>Close</button>
      <div class="no">${esc(s ? s.name : r.source)} <span>${cur + 1} of ${state.shown.length}</span></div>
      <h2 dir="auto">${esc(r.title || "Untitled")}</h2>
      <div class="by" dir="auto">${esc([r.maker, r.date].filter(Boolean).join(", "))}</div>
      <dl class="cat">
        ${row("Medium", r.medium)}${row("Type", r.kind)}
        ${row("Held by", r.institution)}${row("Number", r.accession)}${row("Credit", r.credit)}
        ${row("Rights", `<span class="rights-line"><span class="mark rt-${rs.state}">${esc(MI.RIGHTS[rs.state].tag)}</span>${rs.url ? `<a href="${esc(rs.url)}" target="_blank" rel="noopener noreferrer">${esc(rs.label)}</a>` : esc(rs.label)}</span>`, true)}
        ${row("Record", `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(String(r.link).replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</a>`, true)}
        ${r.also ? row("Also at", r.also.map(sname).join(", ")) : ""}
      </dl>
      <div class="citebox">
        <div class="lead">Chicago citation
          <button class="choice ${cfg.cite === "ad" ? "on" : ""}" data-cite="ad">author-date</button>
          <button class="choice ${cfg.cite === "nb" ? "on" : ""}" data-cite="nb">bibliography</button></div>
        <p dir="auto">${cite.html}</p>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="download">Download image</button>
        <button class="btn" data-act="cite">Copy citation</button>
        <button class="btn ${picks.has(r.uid) ? "key" : ""}" data-act="pick">${picks.has(r.uid) ? "Picked" : "Pick"}</button>
      </div>
      <p class="fine">Check the rights statement at the source before reuse; the label here is read from what ${esc(s ? s.short || s.name : "the source")} publishes, and the source has the final word.</p>`;
    /* upgrade the plate to the larger image once it is known */
    const full = await fullUrl(r).catch(() => "");
    const im = $("#pv-plate img");
    if (full && im && state.shown[cur] === r && !/\.tiff?($|\?)/i.test(full)) {
      const big = new Image();
      big.referrerPolicy = "no-referrer";
      big.onload = () => { if (state.shown[cur] === r) im.src = full; };
      big.src = full;
    }
  }

  /* ---------- downloads ---------- */
  async function fullUrl(r) {
    if (r.full) return r.full;
    const s = MI.source(r.source);
    if (s && s.resolveFull) { r.full = await s.resolveFull(r); return r.full; }
    return r.thumb;
  }

  /* bytes of an image: straight from the host if it allows it, else via the local relay */
  async function fetchBytes(url) {
    const tryFetch = async (u) => {
      const res = await fetch(u, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { data: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
    };
    try { return Object.assign(await tryFetch(url), { via: "direct" }); }
    catch (e) {
      if (MI.relay) return Object.assign(await tryFetch("__mirl/fetch?url=" + encodeURIComponent(url)), { via: "local relay" });
      throw e;
    }
  }

  function fileName(r, i, type, url) {
    return (i != null ? String(i + 1).padStart(3, "0") + "-" : "") + r.source + "-" + MI.slug(r.title, 50) + "." + MI.extFor(type, url);
  }

  async function downloadOne(r) {
    const url = await fullUrl(r);
    notice("Fetching the image…");
    try {
      const b = await fetchBytes(url);
      MI.saveBlob(new Blob([b.data], { type: b.type }), fileName(r, null, b.type, url));
      notice("Saved. The record and citation are in the entry; use Download picks for a set with a manifest.", "SAVED");
    } catch (e) {
      window.open(url, "_blank", "noopener");
      notice(`${sname(r.source)} does not let a page fetch its images, so the image opened in a new tab to save from there. Start serve.py to download these directly.`, "OPENED");
    }
  }

  async function downloadPicks() {
    const list = Array.from(picks.values());
    if (!list.length) return;
    const btn = $("#zip");
    btn.disabled = true;
    const files = [], items = [];
    const enc = new TextEncoder();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      btn.textContent = `Fetching ${i + 1} of ${list.length}`;
      const url = await fullUrl(r).catch(() => r.thumb);
      const cite = MI.cite(r, cfg.cite).text;
      const base = {
        title: r.title, maker: r.maker, date: r.date, medium: r.medium, institution: r.institution, accession: r.accession,
        credit: r.credit, source: MI.source(r.source) ? MI.source(r.source).name : r.source, record: r.link,
        rights: r.rights, citation_chicago: cite, query: r.query || "", picked: r.pickedAt || "",
      };
      try {
        const b = await fetchBytes(url);
        const name = fileName(r, i, b.type, url);
        files.push({ name: "images/" + name, data: b.data });
        items.push(Object.assign({ file: "images/" + name, sha256: await MI.sha256(b.data), bytes: b.data.length, content_type: b.type, image_url: url, retrieved: new Date().toISOString(), fetched: b.via }, base));
      } catch (e) {
        items.push(Object.assign({ file: null, image_url: url, retrieved: null, fetched: "not fetched: the host refuses page downloads; open image_url to save it" }, base));
      }
    }
    const got = items.filter((x) => x.file).length;
    const manifest = {
      tool: "MIRL Glean", version: VERSION, created: new Date().toISOString(),
      note: "sha256 is of the bytes as received from image_url at the time retrieved. Rights labels are read from each source's metadata; confirm at the record before reuse.",
      citation_style: cfg.cite === "nb" ? "Chicago notes-bibliography" : "Chicago author-date",
      count: items.length, fetched: got, items,
    };
    files.push({ name: "manifest.json", data: enc.encode(JSON.stringify(manifest, null, 2)) });
    files.push({ name: "citations.txt", data: enc.encode(items.map((x) => x.citation_chicago).join("\n\n") + "\n") });
    const stamp = new Date().toISOString().slice(0, 10);
    MI.saveBlob(MI.zip(files), `mirl-glean-picks-${stamp}.zip`);
    btn.textContent = "Download picks";
    btn.disabled = false;
    notice(got === items.length
      ? `${got} image${got === 1 ? "" : "s"} saved with manifest.json (sha-256, source, rights) and citations.txt.`
      : `${got} of ${items.length} fetched. ${items.length - got} host${items.length - got === 1 ? "" : "s"} refused page downloads; their links are in the manifest. Start serve.py to fetch them too.`, "ZIP");
  }

  async function copyCites(list) {
    const cs = list.map((r) => MI.cite(r, cfg.cite));
    const ok = await MI.copyRich(cs.map((c) => `<p>${c.html}</p>`).join(""), cs.map((c) => c.text).join("\n\n"));
    notice(ok ? `${cs.length} citation${cs.length === 1 ? "" : "s"} copied (Chicago ${cfg.cite === "nb" ? "bibliography" : "author-date"}).` : "Could not reach the clipboard.", ok ? "COPIED" : "");
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    const keyed = MI.SOURCES.filter((s) => s.key);
    $("#settings").innerHTML = `
      <button class="btn quiet close" data-close>Close</button>
      <h2>Keys and settings</h2>
      <p>All of this stays in this browser's storage. Nothing is sent anywhere except a search, to the sources you switch on.</p>
      <h3>API keys</h3>
      ${keyed.map((s) => `<div class="field"><label for="k-${s.id}">${esc(s.name)}</label>
        <input id="k-${s.id}" data-key="${s.id}" type="text" spellcheck="false" placeholder="${s.key.required ? "paste a key to switch on" : "optional, using " + esc(s.key.fallback)}" value="${esc(cfg.keys[s.id] || "")}">
        <div class="sub">${esc(s.key.note)} <a href="${esc(s.key.help)}" target="_blank" rel="noopener noreferrer">Get a key</a></div></div>`).join("")}
      <h3>JSTOR and the library proxy</h3>
      <div class="field"><label for="proxy">Proxy prefix</label>
        <input id="proxy" type="text" spellcheck="false" value="${esc(cfg.proxy)}">
        <div class="sub">Put in front of the JSTOR link so it opens through UCSB's sign-in. Clear it to open JSTOR directly.</div></div>
      <h3>Results</h3>
      <div class="field"><label for="per">Results per source</label>
        <select id="per">${[6, 12, 24, 40].map((v) => `<option ${v === cfg.perSource ? "selected" : ""}>${v}</option>`).join("")}</select>
        <div class="sub">Per source, each time you load more. Larger sheets take longer and spend shared demo keys faster.</div></div>
      <div class="field"><label for="cite">Citation style</label>
        <select id="cite"><option value="ad" ${cfg.cite === "ad" ? "selected" : ""}>Chicago author-date</option><option value="nb" ${cfg.cite === "nb" ? "selected" : ""}>Chicago notes-bibliography</option></select></div>
      <h3>Downloads</h3>
      <p>${MI.relay ? "The local relay is running: images from hosts that refuse page downloads (the Met, Cleveland, the Internet Archive, the Science Museum Group, Rumsey, Japan Search, and others) are fetched through it." : "Opened as a file, most images download directly, but several hosts (the Met, Cleveland, the Internet Archive, the Science Museum Group, Rumsey, Japan Search) refuse page downloads. Start <code>python3 serve.py</code> in this folder and open <code>http://127.0.0.1:8796</code> to fetch those too, through a relay on your own machine."}</p>
      <h3>Sensitive searches</h3>
      <p>A search is sent, as typed, to every source switched on in the register. Switch sources off there before searching a name or place that should not leave this machine.</p>`;
  }

  /* ---------- views and wiring ---------- */
  function setView(v) {
    state.view = v;
    document.querySelectorAll("#view-mode [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $("#more").classList.toggle("hidden", v === "picked" || !Object.values(state.results).some((r) => r.more));
    renderSheet();
  }

  $("#search").addEventListener("submit", (e) => { e.preventDefault(); search($("#q").value); });
  $("#q").addEventListener("input", () => { if (!state.q) renderShelf(); });
  $("#more-btn").addEventListener("click", () => search(state.q, true));

  $("#rights-mode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    cfg.rights = b.dataset.mode; saveCfg();
    document.querySelectorAll("#rights-mode .choice").forEach((x) => x.classList.toggle("on", x === b));
    renderSheet();
  });
  $("#view-mode").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });

  $("#roll").addEventListener("click", (e) => {
    const b = e.target.closest("[data-src]"); if (!b) return;
    if (b.hasAttribute("data-needkey")) { openSettings(); setTimeout(() => { const i = $("#k-" + b.dataset.src); if (i) i.focus(); }, 30); return; }
    const id = b.dataset.src;
    cfg.off[id] = !cfg.off[id]; saveCfg();
    if (cfg.off[id]) delete state.results[id];
    renderRoll(); renderSheet();
  });
  $("#toggle-roll").addEventListener("click", () => {
    if (EMBED) cfg.embedRollShown = !cfg.embedRollShown; else cfg.rollHidden = !cfg.rollHidden;
    saveCfg(); renderRoll();
  });
  /* embedded: open the full tool in its own window, carrying the current search */
  $("#open-full").addEventListener("click", () => {
    const base = location.href.split("#")[0].replace(/[?&]embed=1\b/, "").replace(/\?$/, "");
    window.open(base + (state.q ? "#q=" + encodeURIComponent(state.q) : ""), "_blank", "noopener");
  });

  $("#sheet").addEventListener("click", (e) => {
    const t = e.target.closest("[data-try]");
    if (t) { $("#q").value = t.dataset.try; search(t.dataset.try); return; }
    const f = e.target.closest(".frame"); if (!f) return;
    const r = state.shown[+f.dataset.i];
    if (e.target.closest(".pick")) togglePick(r); else openPrint(+f.dataset.i);
  });
  $("#sheet").addEventListener("keydown", (e) => {
    const f = e.target.closest(".frame"); if (!f) return;
    if (e.key === "Enter") openPrint(+f.dataset.i);
    if (e.key === " ") { e.preventDefault(); togglePick(state.shown[+f.dataset.i]); }
  });

  $("#printview").addEventListener("click", (e) => {
    const r = state.shown[cur];
    if (e.target.closest("[data-close]")) return closeOverlays();
    const nav = e.target.closest("[data-nav]"); if (nav) { cur = Math.max(0, Math.min(state.shown.length - 1, cur + +nav.dataset.nav)); return renderPrint(); }
    const c = e.target.closest("[data-cite]"); if (c) { cfg.cite = c.dataset.cite; saveCfg(); return renderPrint(); }
    const a = e.target.closest("[data-act]"); if (!a || !r) return;
    if (a.dataset.act === "download") downloadOne(r);
    if (a.dataset.act === "cite") copyCites([r]);
    if (a.dataset.act === "pick") togglePick(r);
  });

  /* ---------- report a problem ----------
     Technical details are added for the person reporting; the search terms are
     not, since a search may be sensitive. They can add them by hand if they wish. */
  const recentErrors = [];
  const scrub = (msg) => {
    let m = String(msg || "");
    if (state.q) m = m.split(state.q).join("[search]").split(encodeURIComponent(state.q)).join("[search]");
    return m.slice(0, 200);
  };
  window.addEventListener("error", (e) => { recentErrors.push(scrub(e.message)); if (recentErrors.length > 5) recentErrors.shift(); });
  window.addEventListener("unhandledrejection", (e) => { recentErrors.push(scrub(e.reason && e.reason.message || e.reason)); if (recentErrors.length > 5) recentErrors.shift(); });

  function diagnostics() {
    const lines = [
      `MIRL Glean ${VERSION}`,
      `Page: ${location.origin}${location.pathname}${MI.relay ? " (local relay on)" : ""}`,
      `Browser: ${navigator.userAgent}`,
      `Window: ${innerWidth}x${innerHeight}`,
      `Rights filter: ${cfg.rights}; results per source: ${cfg.perSource}`,
      `Keys set: ${MI.SOURCES.filter((s) => s.key).map((s) => `${s.short || s.name} ${cfg.keys[s.id] ? "yes" : "no"}`).join(", ")}`,
    ];
    const rs = Object.entries(state.results);
    if (rs.length) {
      lines.push(`Last search (terms not included), page ${state.page}:`);
      rs.forEach(([id, r]) => {
        const s = MI.source(id);
        lines.push(`  ${s ? s.name : id}: ${r.status === "err" ? "error: " + scrub(r.err) : r.status === "ok" ? `${r.items.length} of ${r.total}` : r.status}`);
      });
      const off = MI.SOURCES.filter((s) => cfg.off[s.id]).map((s) => s.short || s.name);
      if (off.length) lines.push(`  switched off: ${off.join(", ")}`);
    } else lines.push("No search yet in this visit.");
    if (recentErrors.length) lines.push("Recent page errors:", ...recentErrors.map((m) => "  " + m));
    return lines.join("\n");
  }

  function openReport() {
    $("#report").innerHTML = `
      <button class="btn quiet close" data-close>Close</button>
      <h2>Report a problem</h2>
      <p>Tell us what happened and what you expected instead. A source that will not answer, a wrong rights label, a citation that reads badly, a download that fails: all of it helps.</p>
      <h3>What went wrong</h3>
      <textarea id="report-text" placeholder="For example: searching for a maker, the V&amp;A shows an error, and the citation for the third result has no date."></textarea>
      <h3>Added for you</h3>
      <p>Technical details that help us find the problem. Your search terms are not included; add them above only if you want to.</p>
      <pre class="diag" id="report-diag"></pre>
      <div class="send">
        <button class="btn primary" data-send="github">Open a GitHub issue</button>
        <button class="btn" data-send="email">Send by email</button>
      </div>
      <p class="send-note">A GitHub issue is public and needs a GitHub account; you can review it before posting. Email goes privately to MIRL at mirl@arthistory.ucsb.edu, from your own mail app.</p>`;
    $("#report-diag").textContent = diagnostics();
    $("#veil").classList.remove("hidden");
    $("#report").classList.remove("hidden");
    setTimeout(() => $("#report-text").focus(), 30);
  }

  function sendReport(how) {
    const text = MI.clean($("#report-text").value) ? $("#report-text").value.trim() : "(no description given)";
    const first = text.split("\n")[0].slice(0, 70);
    const title = "Problem: " + (text === "(no description given)" ? "report from MIRL Glean" : first);
    const body = `${text}\n\n---\n${diagnostics()}`;
    if (how === "github") {
      window.open(`https://github.com/mirl-ucsb/mirl-glean/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
    } else {
      location.href = `mailto:mirl@arthistory.ucsb.edu?subject=${encodeURIComponent("MIRL Glean: " + title)}&body=${encodeURIComponent(body)}`;
    }
    notice(how === "github" ? "A prefilled GitHub issue opened in a new tab; review it there and submit." : "Your mail app should open with the report ready to send.");
  }

  $("#open-report").addEventListener("click", openReport);
  $("#open-report-foot").addEventListener("click", openReport);
  $("#report").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeOverlays();
    const b = e.target.closest("[data-send]");
    if (b) sendReport(b.dataset.send);
  });

  function openSettings() { renderSettings(); $("#veil").classList.remove("hidden"); $("#settings").classList.remove("hidden"); }
  $("#open-settings").addEventListener("click", openSettings);
  $("#veil").addEventListener("click", closeOverlays);
  $("#settings").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlays(); });
  $("#settings").addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.key) { const v = t.value.trim(); if (v) cfg.keys[t.dataset.key] = v; else delete cfg.keys[t.dataset.key]; }
    if (t.id === "proxy") cfg.proxy = t.value.trim();
    if (t.id === "per") cfg.perSource = +t.value;
    if (t.id === "cite") cfg.cite = t.value;
    saveCfg(); renderRoll();
  });

  $("#copy-cites").addEventListener("click", () => copyCites(Array.from(picks.values())));
  $("#zip").addEventListener("click", downloadPicks);
  /* the picks file: one JSON file you keep, like every MIRL tool's working file.
     It holds the picked records and their sources, never your API keys. */
  $("#save-picks").addEventListener("click", () => {
    const file = {
      tool: "MIRL Glean", format: "mirl-glean-picks", version: 1, saved: new Date().toISOString(),
      note: "Images picked in MIRL Glean, with the record each came from. Open it in MIRL Glean to pick up where you left off.",
      items: Array.from(picks.values()),
    };
    MI.saveBlob(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), `mirl-glean-picks-${new Date().toISOString().slice(0, 10)}.json`);
    notice(`${file.items.length} pick${file.items.length === 1 ? "" : "s"} saved to a file. Open it here any time to carry on.`);
  });
  $("#open-picks").addEventListener("click", () => $("#picks-file").click());
  $("#picks-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const items = Array.isArray(d) ? d : d && d.items;
      if (!Array.isArray(items)) throw new Error("no picks in this file");
      let added = 0;
      items.forEach((r) => {
        if (!r || !r.uid || !r.source || picks.has(r.uid)) return;
        r.rights = r.rights && MI.RIGHTS[r.rights.state] ? r.rights : MI.rights("");
        picks.set(r.uid, r); added++;
      });
      savePicks(); renderPicks(); setView("picked");
      notice(added ? `${added} pick${added === 1 ? "" : "s"} added from ${f.name}.` : `Everything in ${f.name} is already in your picks.`);
    } catch (err) {
      notice(`That file could not be read as a MIRL Glean picks file (${err.message}).`);
    }
  });

  $("#clear-picks").addEventListener("click", () => {
    if (!confirm(`Clear all ${picks.size} picks? This cannot be undone. Save them to a file first if you may want them again.`)) return;
    picks.clear(); savePicks(); renderPicks(); renderSheet();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /input|textarea|select/i.test((e.target.tagName || ""));
    if (e.key === "Escape") return closeOverlays();
    if (cur >= 0 && !typing) {
      if (e.key === "ArrowRight" && cur < state.shown.length - 1) { cur++; renderPrint(); }
      if (e.key === "ArrowLeft" && cur > 0) { cur--; renderPrint(); }
      if (e.key.toLowerCase() === "p") togglePick(state.shown[cur]);
      return;
    }
    if (e.key === "/" && !typing) { e.preventDefault(); $("#q").focus(); $("#q").select(); }
  });

  /* ---------- start ---------- */
  document.querySelectorAll("#rights-mode .choice").forEach((b) => b.classList.toggle("on", b.dataset.mode === cfg.rights));
  renderRoll(); renderPicks(); renderSheet();
  const fromHash = () => {
    const h = /^#q=(.+)$/.exec(location.hash);
    if (!h) return;
    const q = decodeURIComponent(h[1]);
    if (q === state.q) return;
    $("#q").value = q; search(q);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
  MI.app = { state, cfg, search, merged, picks };
})();
