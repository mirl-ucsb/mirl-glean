/* MIRL Image · shared apparatus: rights, citations, hashing, zip.
   Classic script, no build. Everything hangs off window.MI. */
(function () {
  "use strict";
  const MI = (window.MI = window.MI || {});

  /* ---------- small helpers ---------- */
  MI.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  MI.stripHtml = (s) => {
    if (!s) return "";
    const d = document.createElement("div");
    d.innerHTML = String(s);
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  };
  MI.first = (v) => (Array.isArray(v) ? v.find((x) => x != null && x !== "") : v) ?? "";
  MI.clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  MI.slug = (s, n = 48) =>
    String(s || "untitled").normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n) || "untitled";
  MI.isRTL = (s) => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(s || "");

  /* fetch JSON with a timeout; throws an Error whose message is shown in the source roll */
  MI.getJSON = async function (url, opts = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeout || 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: opts.headers || {}, credentials: "omit" });
      if (!r.ok) {
        const e = new Error(r.status === 401 || r.status === 403 ? "key refused (" + r.status + ")" : r.status === 429 ? "rate limited" : "error " + r.status);
        e.status = r.status;
        throw e;
      }
      return await r.json();
    } catch (e) {
      if (e.name === "AbortError") throw new Error("timed out");
      if (e instanceof TypeError) throw new Error("blocked or offline");
      throw e;
    } finally {
      clearTimeout(t);
    }
  };

  /* run async tasks with a concurrency ceiling */
  MI.pool = async function (items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    const work = async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, work));
    return out;
  };

  /* ---------- rights: every source's statement folded into five states ---------- */
  MI.RIGHTS = {
    pd: { label: "public domain", short: "PD", tag: "Public domain" },
    open: { label: "open licence", short: "CC", tag: "Open licence" },
    cond: { label: "reuse with conditions", short: "NC", tag: "Conditions" },
    reserved: { label: "in copyright", short: "©", tag: "In copyright" },
    unknown: { label: "rights unclear", short: "?", tag: "Rights unclear" },
  };

  /* text: any licence URL, label or code a source offers */
  MI.rights = function (text, labelOverride, url) {
    const t = String(text || "").toLowerCase();
    let state = "unknown";
    if (!t) state = "unknown";
    else if (/noc-(nc|cr|oklr)/.test(t)) state = "cond";
    else if (/publicdomain|public domain|\bpdm\b|\bcc0\b|cc-0|nkc|noc-|no known copyright|no copyright|\bpd\b/.test(t)) state = "pd";
    else if (/(by-nc|by-nd|-nc-|-nd\b|\bnc\b|non-?commercial|v&a terms)/.test(t)) state = "cond";
    else if (/licenses\/by|cc[- ]by|\bcc-by|\bogl\b|open government/.test(t)) state = "open";
    else if (/\binc\b|incopyright|in copyright|copyrighted|rights reserved|all rights|\binc-/.test(t)) state = "reserved";
    return {
      state,
      label: labelOverride || MI.RIGHTS[state].label,
      url: url || (/^https?:\/\//.test(text || "") ? text : ""),
    };
  };
  MI.rightsPass = function (rec, mode) {
    if (mode === "pd") return rec.rights.state === "pd";
    if (mode === "open") return rec.rights.state === "pd" || rec.rights.state === "open";
    return true;
  };

  /* ---------- Chicago citations ---------- */
  const CORPORATE = /\b(unknown|anonymous|studio|company|co\.|inc\.|ltd|workshop|factory|manufactur|school of|society|department|bureau|press|museum|library|agency|corporation|foundation|&)\b/i;
  /* "First Middle Last" -> "Last, First Middle"; leaves inverted or corporate names alone */
  MI.invertName = function (name, alreadyInverted) {
    name = MI.clean(name);
    if (!name || alreadyInverted || name.includes(",") || CORPORATE.test(name) || MI.isRTL(name)) return name;
    const parts = name.split(" ");
    if (parts.length < 2) return name;
    const particles = /^(van|von|de|der|den|da|di|du|la|le|del|al|el|ibn|bin|ter|ten)$/i;
    let k = parts.length - 1;
    while (k > 1 && particles.test(parts[k - 1])) k--;
    return parts.slice(k).join(" ") + ", " + parts.slice(0, k).join(" ");
  };

  const dot = (s) => (s && !/[.?!]$/.test(s) ? s + "." : s);

  /* style: "ad" author-date (default) or "nb" notes-bibliography. Returns {text, html}. */
  MI.cite = function (r, style) {
    const maker = r.maker ? MI.invertName(r.maker, r.makerInverted) : "";
    const cap = (s) => String(s || "").replace(/^([a-z])/, (m) => m.toUpperCase());
    const date = cap(r.date) || "n.d.";
    const title = r.title || "Untitled";
    const where = [r.institution, r.accession].filter(Boolean).join(", ");
    const tail = [r.medium && dot(r.medium), where && dot(where), r.link].filter(Boolean);
    let head;
    if (style === "nb") {
      head = maker ? [dot(maker), "§" + dot(title) + "§", dot(cap(r.date))] : ["§" + dot(title) + "§", dot(cap(r.date))];
    } else {
      head = maker ? [dot(maker), dot(date), "§" + dot(title) + "§"] : ["§" + dot(title) + "§", dot(date)];
    }
    const parts = head.concat(tail).filter((x) => x && x !== ".");
    const raw = parts.join(" ");
    return {
      text: raw.replace(/§/g, ""),
      html: MI.esc(raw).replace(/§([^§]*)§/g, "<i>$1</i>"),
    };
  };

  MI.copyRich = async function (html, text) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
        return true;
      }
    } catch (e) { /* fall through */ }
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    return ok;
  };

  /* ---------- sha-256 (WebCrypto, with a plain-JS fallback) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256js(bytes) {
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
  }
  MI.sha256 = async function (bytes) {
    try {
      if (window.crypto && crypto.subtle) {
        const h = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* fall through */ }
    return sha256js(bytes);
  };
  MI._sha256js = sha256js;

  /* ---------- zip writer (stored, no compression: images are already compressed) ---------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  /* files: [{name, data: Uint8Array}] -> Blob */
  MI.zip = function (files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  };
  MI._crc32 = crc32;

  MI.saveBlob = function (blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  MI.extFor = (type, url) => {
    const t = (type || "").toLowerCase();
    if (t.includes("png")) return "png";
    if (t.includes("tif")) return "tif";
    if (t.includes("gif")) return "gif";
    if (t.includes("webp")) return "webp";
    if (t.includes("jp2")) return "jp2";
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    const m = /\.(jpe?g|png|tiff?|gif|webp)(\?|#|$)/i.exec(url || "");
    return m ? m[1].toLowerCase().replace("jpeg", "jpg").replace("tiff", "tif") : "jpg";
  };
})();
