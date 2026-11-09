'use strict';
async function restoreData() {
  try {
    const text = await desktop.chooseBackup();
    if (!text) return;
    const value = JSON.parse(text);
    if (value.format !== 'shortage-offline' || value.version !== 1 || !value.state?.shortage) throw new Error('Tohle není podporovaná záloha Shortage.');
    const next = cleanState(value.state);
    if (!await confirmBox('Obnovit zálohu?', 'Obsah této zálohy nahradí současné seznamy a nastavení. Předchozí uložený stav zůstane v automatických zálohách.', 'Obnovit')) return;
    clearTimeout(saveTimer);
    await saveQueue;
    await desktop.recover(JSON.stringify({ format:'shortage-offline', version:1, state:next }));
    S = next; persisted = structuredClone(next); dirty = false; initialized = true;
    $('#view-shortage').inert = false;
    Object.assign(ui.sh, { open: null, plan: null, last: null, merge: null, ops: [], depts: [], q: '', mode: 'list' });
    $('#shMsg').innerHTML = ''; $('#shPaste').value = '';
    renderShortage(); $('#saveState').textContent = 'Záloha obnovena'; $('#saveState').dataset.state = 'saved';
    toast('Záloha byla obnovena.');
  } catch (error) { toast(error.message, true); }
}
async function start() {
  $('#view-shortage').classList.add('on');
  $('#view-shortage').inert = true;
  if (!desktop) { $('#saveState').textContent = 'Spusť aplikaci Shortage.exe'; return; }
  $('#saveState').onclick = () => flushSave().catch(() => {});
  $('#backup').onclick = async () => {
    try { if (!initialized) return; await flushSave(); if (await desktop.backup(envelope())) toast('Záloha byla uložena.'); }
    catch (error) { toast(error.message, true); }
  };
  $('#restore').onclick = restoreData;
  $('#dataFolder').onclick = () => desktop.folder().catch(error => toast(error.message, true));
  $('#history').onclick = () => {
    const items = (S?.log || []).slice().reverse();
    dialog({ title: 'Historie změn', ok: 'Zavřít', cancel: '', wide: true, html: items.length ? `<ol class="local-history">${items.map(x => `<li><time>${esc(tsText(x.at))}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>` : '<p>Zatím žádné změny.</p>' });
  };
  document.addEventListener('click', event => {
    if (event.target.closest('a[href^="http:"] , a[href^="https:"]')) { event.preventDefault(); toast('Aplikace pracuje offline. Kód a odkaz zůstanou v seznamu i v exportu.'); }
  });
  window.addEventListener('unhandledrejection', event => { console.error(event.reason); toast(event.reason?.message || 'Operace se nepodařila.', true); });
  desktop.onClose(async () => { do { await flushSave(); } while (dirty); });
  bindShortage();
  try {
    const text = await desktop.load();
    S = cleanState(text ? JSON.parse(text).state : {});
    persisted = structuredClone(S); initialized = true;
    $('#view-shortage').inert = false;
    renderShortage(); $('#saveState').textContent = 'Uloženo v počítači'; $('#saveState').dataset.state = 'saved';
  } catch (error) {
    $('#saveState').textContent = 'Data nelze načíst'; $('#saveState').dataset.state = 'error';
    await dialog({ title: 'Data nelze načíst', html: `<p>${esc(error.message)}</p><p>Otevři Složku dat a zkontroluj automatické zálohy, pak použij Obnovit zálohu.</p>`, ok: 'Rozumím', cancel: '' });
  }
}
start();
