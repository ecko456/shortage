'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const EXPORT_NAME = 'Shortage';
const I = { x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>' };
let S = null;
let initialized = false;
let persisted = null;
let saveTimer = null;
let saveQueue = Promise.resolve();
let dirty = false;
const ui = { view: 'shortage', me: { label: 'Tento počítač' }, sh: { open: null, q: '', plan: null, ops: [], depts: [], deptOpen: false, merge: null, mode: 'list', last: null } };
const desktop = window.shortageDesktop;

function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('#toast').className = 'toast'; }, error ? 7000 : 3500);
}
function statTile(label, value, note, tone = '') { return `<div class="stat ${tone}"><div class="k">${label}</div><div class="v">${value}</div><div class="n">${note}</div></div>`; }
function emptyState(title, text, action = '') { return `<div class="empty"><strong>${title}</strong><p>${text}</p>${action}</div>`; }
function tsText(ts) { return new Date(ts).toLocaleString('cs-CZ'); }
function renderTaskAlert() { /* Stav Shortage nemá vazbu na další moduly. */ }
async function xlsx() { return window.XLSX; }
async function pdfLib() { if (!window.jspdf) throw new Error('Chybí přibalená knihovna pro PDF.'); }
const PDF_ASSETS = new Map();
async function pdfAsset(name) {
  const files = { 'pdf-regular.ttf': 'plex-sans-regular.ttf', 'pdf-semibold.ttf': 'plex-sans-semibold.ttf' };
  if (!files[name]) throw new Error('Neznámé písmo.');
  if (!PDF_ASSETS.has(name)) PDF_ASSETS.set(name, (async () => {
    const response = await fetch(`vendor/${files[name]}`);
    if (!response.ok) throw new Error('Přibalené písmo nejde načíst.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let bin = ''; for (let i=0; i<bytes.length; i+=8192) bin += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(bin);
  })().catch(error => { PDF_ASSETS.delete(name); throw error; }));
  return PDF_ASSETS.get(name);
}
function downloadFile(name, data, type = 'application/octet-stream') {
  const link = document.createElement('a');
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function cleanState(input) {
  return { shortage: cleanShortage(input?.shortage || {}), log: Array.isArray(input?.log) ? input.log.slice(-2000).filter(x => x && typeof x.text === 'string').map(x => ({ at: Number(x.at)||0, text: x.text.slice(0,2000) })) : [] };
}
function envelope() { return JSON.stringify({ format: 'shortage-offline', version: 1, state: S }); }
function save() {
  if (!initialized) return;
  dirty = true; $('#saveState').textContent = 'Neuložené změny'; $('#saveState').dataset.state = 'dirty';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave().catch(() => {}), 250);
}
function flushSave() {
  clearTimeout(saveTimer);
  const job = saveQueue.then(async () => {
    if (!initialized || !dirty) return;
    // Zachytit i historii před zápisem. Při chybě se znovu zapisuje stejný snímek.
    const state = cleanState(S);
    const before = persisted?.shortage || blankShortage();
    shChanges(before, state.shortage, (_kind, text, extra = {}) => {
      state.log.push({ at: Date.now(), text: text || `${extra.p || ''}${extra.v0 || ''} → ${extra.v1 || ''}` });
    });
    state.log = state.log.slice(-2000);
    const captured = JSON.stringify(S);
    $('#saveState').textContent = 'Ukládám…'; $('#saveState').dataset.state = 'saving';
    try {
      await desktop.save(JSON.stringify({ format: 'shortage-offline', version: 1, state }));
      persisted = state;
      S.log = state.log;
      dirty = captured !== JSON.stringify({ ...S, log: JSON.parse(captured).log });
      if (dirty) save();
      else { $('#saveState').textContent = 'Uloženo v počítači'; $('#saveState').dataset.state = 'saved'; }
    } catch (error) {
      dirty = true; $('#saveState').textContent = 'Uložení selhalo – kliknutím zkusit znovu'; $('#saveState').dataset.state = 'error';
      toast(`Data se nepodařilo uložit: ${error.message}`, true);
      throw error;
    }
  });
  saveQueue = job.catch(() => {});
  return job;
}
