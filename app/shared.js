/* Převzato z ecko456/odmeny_v2, commit ce1ae206ba3bea365e9b21e5fd8f21b18a1ae84d.
 * Samostatná offline edice Shortage. Původ a úpravy: viz THIRD_PARTY.md. */
async function newPdf(orientation = 'portrait', opts = {}) {
  await pdfLib();
  const [regular, semibold, mono, monoBold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf'),
    ...(opts.mono ? [pdfAsset('pdf-mono.ttf'), pdfAsset('pdf-mono-semibold.ttf')] : [])]);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  doc.addFileToVFS('Plex-Regular.ttf', regular);
  doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
  doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
  doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
  // Plex Mono jen pro PDF, která ho kreslí (report kapacit a zaškolení podle vzoru), ostatní zůstanou menší
  if (opts.mono) {
    doc.addFileToVFS('PlexMono-Medium.ttf', mono);
    doc.addFont('PlexMono-Medium.ttf', 'PlexMono', 'normal');
    doc.addFileToVFS('PlexMono-SemiBold.ttf', monoBold);
    doc.addFont('PlexMono-SemiBold.ttf', 'PlexMono', 'bold');
  }
  return doc;
}

function pdfKit(doc) {
  const land = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight();   // A4 na šířku (KPI)
  const k = { doc, W: land ? 297 : 210, H: land ? 210 : 297, M: 16, y: 16, dry: false, onPage: null };
  k.CW = k.W - 2 * k.M;
  k.BOTTOM = k.H - 20;
  k.PAGE = k.BOTTOM - k.M;
  const C = k.C = {
    ink: [27, 31, 29], ink2: [85, 92, 88], ink3: [133, 139, 134], line: [222, 221, 212], line2: [198, 196, 184],
    soft: [243, 242, 236], soft3: [232, 230, 221], acc: [14, 107, 93], accSoft: [220, 235, 230], white: [255, 255, 255],
    good: [46, 125, 70], goodSoft: [223, 238, 227], warn: [156, 106, 18], warnSoft: [244, 234, 212],
    crit: [176, 57, 43], critSoft: [246, 225, 221], wk: [106, 87, 166], wkSoft: [232, 227, 244],
  };
  k.TONE = { new: [C.warnSoft, C.warn], act: [C.accSoft, C.acc], v1: [C.wkSoft, C.wk], v2: [C.wkSoft, C.wk], ok: [C.goodSoft, C.good],
    fail: [C.critSoft, C.crit], late: [C.critSoft, C.crit], zrus: [C.soft3, C.ink3], none: [C.warnSoft, C.warn], plain: [C.soft3, C.ink2] };
  const mm = pt => pt * 0.3528;
  k.mm = mm;
  k.LH = (size, f = 1.32) => mm(size) * f;
  k.font = (size, bold = false, color = C.ink) => { doc.setFont('Plex', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  k.text = (s, x, top, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, top + mm(size) * 0.92, { align: o.align || 'left', charSpace: o.space || 0 }); };
  k.mid = (s, x, cy, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, cy + mm(size) * 0.35, { align: o.align || 'left' }); };
  k.split = (s, w, size, bold = false) => { k.font(size, bold); const t = String(s == null ? '' : s).replace(/\s+\n/g, '\n'); return t ? doc.splitTextToSize(t, w) : ['']; };
  k.width = (s, size, bold = false) => { k.font(size, bold); return doc.getTextWidth(String(s)); };
  k.box = (color, x, top, w, h, r = 0) => {
    if (k.dry || w <= 0 || h <= 0) return;
    doc.setFillColor(...color);
    if (r) doc.roundedRect(x, top, w, h, Math.min(r, w / 2, h / 2), Math.min(r, w / 2, h / 2), 'F');
    else doc.rect(x, top, w, h, 'F');
  };
  k.hline = (at, color = C.line, lw = 0.2, x1 = k.M, x2 = k.M + k.CW, dash = null) => {
    if (k.dry) return;
    doc.setDrawColor(...color); doc.setLineWidth(lw);
    if (dash) doc.setLineDashPattern(dash, 0);
    doc.line(x1, at, x2, at);
    if (dash) doc.setLineDashPattern([], 0);
  };
  /** Štítek stavu; vrací šířku. */
  k.pill = (label, x, cy, tone, size = 7.4, align = 'left') => {
    const [bg, fg] = k.TONE[tone] || k.TONE.plain;
    const w = k.width(label, size, true) + 4.4;
    const x0 = align === 'right' ? x - w : x;
    k.box(bg, x0, cy - 2.3, w, 4.6, 2.3);
    k.mid(label, x0 + 2.2, cy, size, { bold: true, color: fg });
    return w;
  };
  /** Zaškrtávací políčko: splněno = zelené se značkou, po termínu = červený rámeček. */
  k.check = (x, cy, done, late) => {
    if (k.dry) return;
    const s = 3.1;
    if (done) {
      doc.setFillColor(...C.good); doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'F');
      doc.setDrawColor(...C.white); doc.setLineWidth(0.45);
      doc.line(x + 0.7, cy + 0.05, x + 1.3, cy + 0.7); doc.line(x + 1.3, cy + 0.7, x + 2.45, cy - 0.75);
    } else {
      doc.setDrawColor(...(late ? C.crit : C.line2)); doc.setLineWidth(0.35);
      doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'S');
    }
  };
  k.dot = (x, cy, r, fill, stroke) => {
    if (k.dry) return;
    if (fill) doc.setFillColor(...fill);
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.45); }
    doc.circle(x, cy, r, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  };
  k.newPage = () => { doc.addPage(); k.y = k.M; if (k.onPage) k.onPage(); };
  k.need = h => { if (k.dry) return false; if (k.y + h > k.BOTTOM) { k.newPage(); return true; } return false; };
  k.measure = fn => { const y = k.y; const was = k.dry; k.dry = true; k.y = 0; fn(); const h = k.y; k.y = y; k.dry = was; return h; };
  /** Blok se nerozdělí, když se vejde na stránku; jinak začne na nové, pokud zbývá málo místa. */
  k.keep = (fn, min = 40) => {
    const h = k.measure(fn);
    if (k.y + h > k.BOTTOM && (h <= k.PAGE || k.BOTTOM - k.y < min)) k.newPage();
    fn();
  };
  /** Odstavec s řádkovým zalomením přes stránky. */
  k.para = (s, x, w, size, o = {}) => {
    const lines = k.split(s, w, size, o.bold);
    const lh = k.LH(size, o.lh || 1.38);
    lines.forEach(line => { k.need(lh); k.text(line, x, k.y, size, o); k.y += lh; });
  };
  k.header = ({ eyebrow, plain = false, right, title, sub, meta }) => {
    // plain: nadpis nad titulkem normálním písmem, bez prostrkání (Top 5)
    k.text(eyebrow, k.M, k.y, plain ? 9 : 7.5, { bold: true, color: C.acc, space: plain ? 0 : 0.35 });
    if (right) k.text(right, k.M + k.CW, k.y, 8.5, { color: C.ink2, align: 'right' });
    k.y += 7.5;
    k.split(title, k.CW, 20, true).forEach(line => { k.text(line, k.M, k.y, 20, { bold: true }); k.y += mm(20) * 1.2; });
    k.y += 1;
    if (sub) { k.text(sub, k.M, k.y, 11.5, { bold: true, color: C.ink2 }); k.y += mm(11.5) * 1.5; }
    if (meta) { k.para(meta, k.M, k.CW * 0.85, 9, { color: C.ink2 }); }
    k.y += 2.5;
    if (!k.dry) { doc.setDrawColor(...C.acc); doc.setLineWidth(0.7); doc.line(k.M, k.y, k.M + 28, k.y); }
    k.y += 7;
  };
  k.tiles = list => {
    const gap = 4, n = list.length, tw = (k.CW - gap * (n - 1)) / n, th = 20;
    list.forEach(([label, value, note, tone], i) => {
      const x = k.M + i * (tw + gap);
      k.box(C.soft, x, k.y, tw, th, 2.4);
      if (tone) k.box(tone === 'crit' ? C.crit : tone === 'good' ? C.good : C.acc, x, k.y + 3, 0.9, th - 6);
      k.text(label, x + 4, k.y + 3.2, 7.8, { color: C.ink2 });
      k.text(value, x + 4, k.y + 7.4, 15, { bold: true, color: tone === 'crit' ? C.crit : C.ink });
      if (note) k.text(k.split(note, tw - 7, 7)[0], x + 4, k.y + 14.4, 7, { color: C.ink3 });
    });
    k.y += th + 7;
  };
  k.heading = (t, size = 12.5) => { k.text(t, k.M, k.y, size, { bold: true }); k.y += mm(size) * 1.25 + 2.4; };
  k.signoff = () => {
    const sw = (k.CW - 12) / 3;
    ['Zpracovatel', 'Datum', 'Podpis'].forEach((label, i) => {
      const x = k.M + i * (sw + 6);
      k.hline(k.y + 10, C.line2, 0.3, x, x + sw);
      k.text(label, x, k.y + 11.6, 8, { color: C.ink3 });
    });
    k.y += 22;
  };
  // per(i, pages) → { left, right }: vlastní text a číslování stran (Shortage po odděleních)
  k.footer = (left, per = null) => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      const f = per ? per(i, pages) : { left, right: `Strana ${i} / ${pages}` };
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(k.M, k.H - 13.5, k.M + k.CW, k.H - 13.5);
      k.font(7.5, false, C.ink3);
      doc.text(f.left, k.M, k.H - 11.5 + mm(7.5) * 0.92);
      doc.text(f.right, k.M + k.CW, k.H - 11.5 + mm(7.5) * 0.92, { align: 'right' });
    }
  };
  return k;
}

async function withPdf(button, fn, orientation = 'portrait', opts = {}) {
  if (button) button.disabled = true;
  try {
    const doc = await newPdf(orientation, opts);
    return await fn(doc);
  } catch (error) {
    console.error(error);
    toast(`PDF se nepovedlo vytvořit: ${error && error.message ? error.message : error}`, true);
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

let dialogChain = Promise.resolve();

function dialog(options) {
  const run = dialogChain.then(() => openDialog(options));
  dialogChain = run.catch(() => {});
  return run;
}

function openDialog({ title, html = '', ok = 'OK', cancel = 'Zrušit', danger = false, wide = false, tall = false, onOpen = null, validate = null }) {
  return new Promise(resolve => {
    const dlg = $('#dlg');
    const form = $('#dlgForm');
    $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = html;
    $('#dlgOk').textContent = ok || '';
    $('#dlgOk').hidden = !ok;
    $('#dlgOk').className = `btn${danger ? ' btn-danger' : ''}`;
    $('#dlgCancel').textContent = cancel || '';
    $('#dlgCancel').hidden = !cancel;
    dlg.classList.toggle('wide', wide);
    dlg.classList.toggle('tall', tall);
    const onSubmit = event => {
      if (event.submitter?.value !== 'ok' || !validate) return;
      const problem = validate(form);
      if (problem) {
        event.preventDefault();
        const box = $('.dlg-error', form) || $('#dlgBody').appendChild(Object.assign(document.createElement('div'), { className: 'note e dlg-error' }));
        box.textContent = problem;
      }
    };
    // Enter v poli potvrdí dialog; jinak by se odeslal první (Zrušit) z tlačítek.
    const onKey = event => {
      if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT' || $('#dlgOk').hidden) return;
      event.preventDefault();
      form.requestSubmit($('#dlgOk'));
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('keydown', onKey);
    dlg.addEventListener('close', () => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('keydown', onKey);

      resolve({ value: dlg.returnValue, form });
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    if (onOpen) onOpen(dlg);
    const focus = $('[autofocus]', dlg);
    if (focus) focus.focus();
  });
}

async function confirmBox(title, text, ok = 'Potvrdit', danger = false) {
  return (await dialog({ title, html: `<p>${esc(text)}</p>`, ok, danger })).value === 'ok';
}

async function promptBox(title, label, value = '', ok = 'Uložit', placeholder = '') {
  const result = await dialog({
    title, ok,
    html: `<label class="field"><span>${esc(label)}</span><input name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100" required autofocus></label>`,
  });
  return result.value === 'ok' ? result.form.elements.value.value.trim() : null;
}

function dayText(iso,year=true){if(!iso)return "";const [y,m,d]=iso.split("-").map(Number);return d+". "+m+"."+(year?" "+y:"");}

function todayIso(now){const d=now?new Date(now):new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}

const uid=p=>p+Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>(b%36).toString(36)).join("");

function waIndex(letter){const t=waLetter(letter);if(!t)return -1;let n=0;for(const ch of t)n=n*26+(ch.charCodeAt(0)-64);return n-1;}

function colLetter(i){let s="";i++;while(i>0){const r=(i-1)%26;s=String.fromCharCode(65+r)+s;i=Math.floor((i-1)/26);}return s;}

const nf=(n,d=1)=>Number(n||0).toLocaleString("cs-CZ",{minimumFractionDigits:0,maximumFractionDigits:d});

const waDeflateRaw = (() => { try { new DecompressionStream('deflate-raw'); return typeof TextDecoderStream === 'function'; } catch (error) { return false; } })();

function waZip(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i -= 1) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip bez adresáře');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  if (p === 0xffffffff || n === 0xffff) throw new Error('zip64');
  const dec = new TextDecoder();
  const map = new Map();
  for (let i = 0; i < n; i += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('poškozený zip');
    const nl = dv.getUint16(p + 28, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl)).replace(/^\/+/, '').toLowerCase();
    map.set(name, { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) });
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return map;
}

async function waZipText(b, ent) {
  const r = waZipReader(b, ent);
  let t = '';
  for (;;) { const { done, value } = await r.read(); if (done) return t; t += value; }
}

const waAttr = (a, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(a); return m ? waXml(m[1]) : ''; };

const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function decodeText(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
  catch(e){return new TextDecoder("windows-1250").decode(bytes);}
}

async function waXlsxSst(b, ent) {
  const out = [];
  if (!ent) return out;
  const r = waZipReader(b, ent);
  let buf = '';
  const take = block => { let m; WA_SI.lastIndex = 0; while ((m = WA_SI.exec(block))) out.push(waRichText(m[1])); };
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    buf += value;
    const cut = waTagEnd(buf, 'si');
    if (cut > 0) { take(buf.slice(0, cut)); buf = buf.slice(cut); }
  }
  take(buf);
  return out;
}

const WA_ROW = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;

function waXlsxCells(inner, sst, want) {
  const out = [];
  if (!inner) return out;
  let col = -1;
  let m;
  WA_C.lastIndex = 0;
  while ((m = WA_C.exec(inner))) {
    const a = m[1];
    const ref = WA_REF.exec(a);
    col = ref ? waIndex(ref[1]) : col + 1;
    if (want && !want.has(col)) continue;
    const x = m[2] || '';
    const t = (WA_TYPE.exec(a) || [])[1] || 'n';
    if (t === 'inlineStr') { out[col] = waRichText(x); continue; }
    const v = WA_V.exec(x);
    if (!v) continue;
    if (t === 's') out[col] = sst[+v[1]] ?? null;
    else if (t === 'str' || t === 'd') out[col] = waXml(v[1]);
    else if (t === 'b') out[col] = v[1] === '1';
    else if (t !== 'e') { const n = Number(v[1]); out[col] = v[1] !== '' && Number.isFinite(n) ? n : waXml(v[1]); }
  }
  return out;
}

const waXml = t => (t.indexOf('&') < 0 ? t : t.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : WA_XML_ENT[e])));

function waZipReader(b, ent) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (!ent || dv.getUint32(ent.off, true) !== 0x04034b50) throw new Error('poškozený zip');
  const start = ent.off + 30 + dv.getUint16(ent.off + 26, true) + dv.getUint16(ent.off + 28, true);
  let s = new Blob([b.subarray(start, start + ent.csize)]).stream();
  if (ent.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (ent.method !== 0) throw new Error('nepodporovaná komprese');
  return s.pipeThrough(new TextDecoderStream()).getReader();
}

function waTagEnd(t, tag) {
  let k = t.length;
  while ((k = t.lastIndexOf(`${tag}>`, k - 1)) > 0) {
    const s = t.lastIndexOf('<', k);
    if (t[s + 1] === '/') return k + tag.length + 1;
  }
  return -1;
}

async function waPlanOpen(file, { quick = false, buffer = null } = {}) {
  buffer = buffer || await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [waMemSheet(file.name, parseCSV(decodeText(buffer)))];
  const b = new Uint8Array(buffer);
  if (b[0] === 0x50 && b[1] === 0x4b && waDeflateRaw) {
    try { return await waXlsxOpen(b); } catch (error) { console.warn('Plán: rychlé čtení nevyšlo, čte SheetJS', error); }
  }
  const X = await xlsx();
  const wb = X.read(b, { type: 'array', dense: true, cellHTML: false, cellText: false, cellNF: false, cellStyles: false, ...(quick ? { sheetRows: 80 } : {}) });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name] || [];
    const sheet = waMemSheet(name, Array.isArray(ws) ? ws : ws['!data'] || [], waCellV);
    let total = 0;
    try { total = X.utils.decode_range(ws['!fullref'] || ws['!ref'] || 'A1').e.r + 1; } catch (error) { /* necháme délku dat */ }
    const read = sheet.read;
    sheet.read = async o => { const r = await read(o); return { ...r, total: Math.max(total, r.total) }; };
    return sheet;
  });
}

function safeCell(v){
  if(typeof v!=="string")return v;
  return /^[=+\-@\t\r]/.test(v)?"'"+v:v;
}

const norm=s=>String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();

function waLetter(v){const t=String(v==null?"":v).trim().toUpperCase();return /^[A-Z]{1,3}$/.test(t)?t:"";}

const WA_SI = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;

const waRichText = x => { let out = ''; let m; const s = x.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, ''); WA_T.lastIndex = 0; while ((m = WA_T.exec(s))) out += m[1]; return waXml(out); };

const WA_C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;

const WA_REF = /(?:^|\s)r="([A-Z]{1,3})\d*"/;

const WA_TYPE = /(?:^|\s)t="(\w+)"/;

const WA_V = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/;

const WA_XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function waMemSheet(name, data, cell = v => v) {
  return {
    name,
    async read({ top = 60, pick = null, onRow = null } = {}) {
      const row = i => Array.from(data[i] || [], v => { const x = cell(v); return x === undefined ? null : x; });
      const head = [];
      for (let i = 0; i < Math.min(top, data.length); i += 1) head.push(row(i));
      if (pick) {
        const cols = pick(head);
        for (let i = 0; i < data.length; i += 1) {
          const r = data[i];
          if (!r) continue;
          onRow(i, cols.map(c => { if (c < 0) return null; const x = cell(r[c]); return x === undefined ? null : x; }));
          if (i % 20000 === 19999) await new Promise(res => setTimeout(res, 0));
        }
      }
      return { head, total: data.length };
    },
  };
}

function parseCSV(text){
  const sep=(text.split("\n")[0].match(/;/g)||[]).length>=(text.split("\n")[0].match(/,/g)||[]).length?";":",";
  const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"')q=true;
    else if(c===sep){row.push(cur);cur="";}
    else if(c==="\n"){row.push(cur);rows.push(row);row=[];cur="";}
    else if(c!=="\r")cur+=c;
  }
  row.push(cur);rows.push(row);
  return rows.map(r=>r.map(c=>{const t=c.trim();if(t==="")return null;
    const n=t.replace(",",".");return /^-?\d+(\.\d+)?$/.test(n)?parseFloat(n):t;}));
}

async function waXlsxOpen(b) {
  const zip = waZip(b);
  const rels = {};
  const relXml = await waZipText(b, zip.get('xl/_rels/workbook.xml.rels'));
  for (const m of relXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) rels[waAttr(m[1], 'Id')] = waAttr(m[1], 'Target');
  const wb = await waZipText(b, zip.get('xl/workbook.xml'));
  const sheets = [...wb.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)].map(m => {
    const id = (/\s\w+:id="([^"]+)"/.exec(m[1]) || [])[1];
    const target = String(rels[id] || '');
    const path = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).replace(/\/\.\//g, '/').toLowerCase();
    return { name: waAttr(m[1], 'name'), ent: zip.get(path) };
  });
  if (!sheets.length || sheets.some(s => !s.ent)) throw new Error('listy nenalezeny');
  const sst = await waXlsxSst(b, zip.get('xl/sharedstrings.xml'));
  return sheets.map(s => ({ name: s.name, read: o => waXlsxRead(b, s.ent, sst, o) }));
}

const waCellV = c => (c == null ? null : typeof c === 'object' && !(c instanceof Date) ? (c.v === undefined ? null : c.v) : c);

const WA_T = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;

async function waXlsxRead(b, ent, sst, { top = 60, pick = null, onRow = null, progress = null } = {}) {
  const r = waZipReader(b, ent);
  const head = [];
  let cols = null;
  let want = null;
  let total = 0;
  let last = -1;
  let stop = false;
  let n = 0;
  const emit = (i, cells) => onRow(i, cols.map(c => (c < 0 ? null : cells[c] ?? null)));
  const start = () => { cols = pick(head.map(waDense)); want = new Set(cols.filter(c => c >= 0)); head.forEach((cells, i) => { if (cells) emit(i, cells); }); };
  const take = block => {
    let m;
    WA_ROW.lastIndex = 0;
    while ((m = WA_ROW.exec(block))) {
      const rr = +waAttr(m[1], 'r');
      const i = rr > 0 ? rr - 1 : last + 1;
      last = i;
      if (!cols) {
        if (i < top) { head[i] = waXlsxCells(m[2], sst, null); continue; }
        if (!pick) { stop = true; return; }
        start();
      }
      emit(i, waXlsxCells(m[2], sst, want));
      n += 1;
    }
  };
  let buf = '';
  let ended = false;
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) { ended = true; break; }
      buf += value;
      if (!total) { const d = /<(?:\w+:)?dimension\b[^>]*?ref="[A-Z]+\d+(?::[A-Z]+(\d+))?"/.exec(buf); if (d) total = +(d[1] || 1); }
      const cut = waTagEnd(buf, 'row');
      if (cut > 0) { take(buf.slice(0, cut)); buf = buf.slice(cut); }
      if (stop) break;
      if (progress) await progress(n);   // může vyhodit chybu (zrušeno) a čtení skončí
    }
  } finally { if (!ended) r.cancel().catch(() => {}); }
  if (!stop) take(buf);
  if (pick && !cols) start();
  for (let i = 0; i < Math.min(top, last + 1); i += 1) if (!head[i]) head[i] = [];
  return { head: head.map(waDense), total: Math.max(total, last + 1) };
}

const waDense = r => Array.from(r || [], v => (v === undefined ? null : v));
