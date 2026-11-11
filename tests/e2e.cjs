'use strict';
// Skutečný Electron: izolovaný profil, syntetické sešity, žádná připojení k serveru Odměn.
const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const X=require('../app/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..');
const resultDir=path.join(root,'test-results');
const errors=[];const network=[];
let app,page;
let profile;
async function saved(){await page.evaluate(()=>flushSave());await page.waitForFunction(()=>!dirty && $('#saveState').dataset.state==='saved');}
async function open(){
  app=await _electron.launch({args:[...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless']:[]),root],env:{...process.env,SHORTAGE_TEST_DATA_DIR:profile},timeout:30000});
  page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.waitForFunction(()=>typeof initialized!=='undefined' && initialized);
  await app.evaluate(({dialog}, backupPath)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:backupPath});
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backupPath]});
  },path.join(resultDir,'backup.json'));
}
async function download(selector,name){
  const target=path.join(resultDir,name);
  await app.evaluate(({session}, target)=>{
    globalThis.__download={done:false};
    session.defaultSession.once('will-download',(_event,item)=>{
      item.setSavePath(target);
      item.once('done',(_event,state)=>{globalThis.__download={done:true,state};});
    });
  },target);
  await page.locator(selector).click();
  for(let i=0;i<100;i++){
    const status=await app.evaluate(()=>globalThis.__download);
    if(status.done){assert.equal(status.state,'completed');return target;}
    await page.waitForTimeout(100);
  }
  throw new Error(`Export nedokončen: ${name}; ${await page.locator('#toast').innerText()}`);
}
function workbook(file,sheets){const wb=X.utils.book_new();for(const [name,ws] of sheets)X.utils.book_append_sheet(wb,ws,name);require('node:fs').writeFileSync(file,X.write(wb,{type:'buffer',bookType:'xlsx'}));}
async function listColumns(note){
  await page.waitForFunction(()=>$('#dlg').open&&$('#dlgTitle').textContent.includes('urgentních dílů'));
  if(note!==undefined)await page.locator('#dlg [name="c-note"]').selectOption(note);
  await page.locator('#dlgOk').click();
}
async function paste(html,text){await page.evaluate(({html,text})=>{
  const d=new DataTransfer();d.setData('text/html',html);d.setData('text/plain',text);
  document.querySelector('#shClipboard').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));
},{html,text});await listColumns();}
(async()=>{
  await fs.mkdir(resultDir,{recursive:true});profile=await fs.mkdtemp(path.join(os.tmpdir(),'shortage-e2e-'));
  const urgent=path.join(resultDir,'urgent.xlsx');
  const ws=X.utils.aoa_to_sheet([
    ['Číslo objednávky','Název dílu','EAN','Index','Urgentní množství','','TOP','Probíhající operace'],
    ['OBJ1','Držák',123,'A',5,'','TOP','Brush Hala 2'],
    ['OBJ2','Sestava',456,'A',10,'','','Frézování Hala 2'],
    ['OBJ3','Kryt',789,'B',3,'','TOP2','Kontrola'],
  ]);
  for(let r=2;r<=4;r++){ws['C'+r].z='0000000';ws['C'+r].l={Target:'https://erp.example/item?activeBarcode=A.'+(r-1)};}
  const control=X.utils.aoa_to_sheet([['Objednávka','Název','EAN','Index','Množství'],...Array.from({length:8},(_,i)=>['CH'+i,'Kontrolní řádek – neimportovat','999'+i,'X',1])]);
  // Formát z Kooperace: skutečný seznam Shortage a delší diagnostika Kontrola URGENTY.
  workbook(urgent,[['Shortage',ws],['Kontrola URGENTY',control]]);
  const planFile=path.join(resultDir,'plan.xlsx');
  const head=Array(39).fill('');head[0]='EAN sestavy';head[4]='EAN poddílu';head[7]='Index';head[12]='Číslo objednávky';head[38]='Probíhající operace';
  const rows=[head];
  for(const [ean,op]of [['0000901','Brush Hala 2'],['0000902','Lakovna'],['0000903','Lakovna']]){const r=Array(39).fill('');r[0]='0000456';r[4]=ean;r[7]='A';r[12]='OBJ2';r[38]=op;rows.push(r);}
  const pws=X.utils.aoa_to_sheet(rows);for(let r=2;r<=4;r++)pws['E'+r].l={Target:'https://erp.example/?activeBarcode=B.'+(r-1)};
  const dws=X.utils.aoa_to_sheet([['Popis','EAN dílu','Probíhající operace'],['Samostatný díl','0000123','Vrtání Hala 2'],['Sestava v plánu','0000456','Montáž Hala 2']]);
  dws.B2.l={Target:'https://erp.example/?activeBarcode=A.1'};dws.B3.l={Target:'https://erp.example/?activeBarcode=A.2'};
  workbook(planFile,[['Díly',dws],['Poddíly',pws]]);
  const moves=path.join(resultDir,'pohyb.xlsx');
  workbook(moves,[['Pohyb',X.utils.aoa_to_sheet([['QR kód','Datum a čas','Počet ks','Stav'],['A.1','22.10.2026 9:00',5,'Hotová kontrola'],['B.1','22.10.2026 9:30',10,'Broušení'],['B.2','22.10.2026 9:35',10,'Lakovna'],['B.3','22.10.2026 9:40',10,'Odesláno na WPA']])]]);
  await open();
  assert.match(await page.locator('#shView').innerText(),/Zatím žádný seznam/);
  assert.equal(await page.locator('.sh-paste').count(),0);
  await app.evaluate(({clipboard})=>clipboard.clear());await page.locator('#shClipboard').click();
  await page.waitForFunction(()=>$('#toast').textContent.includes('Schránka je prázdná'));
  assert.equal(await page.evaluate(()=>S.shortage.lists.length),0);
  assert.equal(await page.locator('#shSkipMove').isDisabled(),true);
  await page.locator('#shFile').setInputFiles(urgent);await listColumns();
  await page.waitForFunction(()=>S.shortage.lists[0]?.items.length===3);
  assert.deepEqual(await page.evaluate(()=>shList().items.map(x=>x.ean)),['0000123','0000789','0000456']);
  assert.equal(await page.evaluate(()=>shList().sheet),'Shortage');
  assert.equal(await page.evaluate(()=>shList().items[1].top2),true);
  await saved();
  console.log('ok import Excelu, EAN s nulami a priority');
  await page.locator('#shPlanFile').setInputFiles(planFile);
  await page.waitForFunction(()=>$('#dlg').open && $('#dlgTitle').textContent.includes('1. list'));
  assert.equal(await page.locator('#dlg [data-shcol]').count(),2);assert.equal(await page.locator('#dlg [name="c-ean"]').inputValue(),'B');
  await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>$('#dlg').open && $('#dlgTitle').textContent.includes('2. list'));
  assert.equal(await page.locator('#dlg [name="c-asm"]').inputValue(),'A');assert.equal(await page.locator('#dlg [name="c-sub"]').inputValue(),'E');
  await page.locator('#dlgCancel').click();
  assert.equal(await page.evaluate(()=>S.shortage.cols.planItem),undefined);assert.equal(await page.evaluate(()=>shList().plan),null);
  await page.locator('#shPlanFile').setInputFiles(planFile);
  await page.waitForFunction(()=>$('#dlg').open && $('#dlgTitle').textContent.includes('1. list'));await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>$('#dlg').open && $('#dlgTitle').textContent.includes('2. list'));await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>shList().items.find(x=>x.ean==='0000456')?.subs.length===3);
  assert.equal(await page.evaluate(()=>S.shortage.cols.planItem.ean),'B');assert.equal(await page.evaluate(()=>S.shortage.cols.plan.sheet),'Poddíly');
  const parity=await page.evaluate(async()=>{
    const sig=p=>JSON.stringify([p.sheet,p.itemSheet,[...p.direct],[...p.operations],[...p.rows],[...p.other],[...p.cands]]);
    const fast=sig(ui.sh.plan);window.SH_PLAN_SHEETJS=true;
    try{return fast===sig(await shPlanRead(ui.sh.last.plan.file,null,shc().cols.plan,shc().cols.planItem));}
    finally{delete window.SH_PLAN_SHEETJS;}
  });assert.equal(parity,true);
  assert.equal(await page.locator('tr[data-shsub]').count(),3);
  await page.locator('#shMoveFile').setInputFiles(moves);
  await page.waitForFunction(()=>shList().items.find(x=>x.ean==='0000456')?.subs.length===3);
  assert.equal(await page.locator('tr[data-shsub]').count(),3);
  assert.equal(await page.evaluate(()=>shList().items[0].rec.state),'Hotová kontrola');
  await saved(); console.log('ok výrobní plán, poddíly, evidence pohybu, WPA');
  // Propiska upravuje i poddíl; zrušení nic nezmění a nový plán opravu nepřepíše.
  const subId=await page.evaluate(()=>shList().items.find(x=>x.ean==='0000456').subs.find(x=>x.code==='B.2').id);
  assert.equal(await page.locator('[data-shedit]').count(),6);
  await page.locator(`[data-shedit="${subId}"]`).click();await page.locator('#dlg[open]').waitFor();
  await page.locator('#dlg [name="ean"]').fill('ZRUŠENO');await page.locator('#dlgCancel').click();
  assert.equal(await page.evaluate(id=>shEntry(shList(),id).entry.ean,subId),'0000902');
  await page.locator(`[data-shedit="${subId}"]`).click();await page.locator('#dlg[open]').waitFor();
  for(const [key,value] of Object.entries({ean:'0000888',name:'Poddíl ručně',order:'OBJ-SUB',index:'C',qty:'7',op:'Kontrola Hala 3',link:'',code:'MAN.SUB',note:'Poznámka poddílu'}))await page.locator(`#dlg [name="${key}"]`).fill(value);
  await page.locator('#dlg [name="st"]').selectOption('wait');await page.locator('#dlgOk').click();
  await page.waitForFunction(id=>shEntry(shList(),id).entry.code==='MAN.SUB',subId);
  await page.evaluate(()=>{shUsePlan(shList(),ui.sh.plan);save();renderShortage();});await saved();
  assert.deepEqual(await page.evaluate(id=>{const s=shEntry(shList(),id).entry;return [s.ean,s.qty,s.op,s.note,s.st,s.rec];},subId),['0000888','7','Lakovna','Poznámka poddílu','wait',null]);
  assert.equal(await page.evaluate(()=>shList().items[0].op),'Vrtání Hala 2');
  assert.match(await page.locator('.sh-tab thead').innerText(),/Oddělení \/ Probíhající operace/i);
  // Nový plán aktualizuje hlavní díl i ručně opravený poddíl, jeho ostatní údaje zůstanou.
  dws.C2.v='Balení Hala 2';dws.C3.v='';pws.AM3.v='Kontrola Hala 4';
  const updatedPlan=path.join(resultDir,'plan-aktualizovany.xlsx');workbook(updatedPlan,[['Díly',dws],['Poddíly',pws]]);
  await page.locator('#shPlanFile').setInputFiles(updatedPlan);
  await page.waitForFunction(()=>shList().items[0].op==='Balení Hala 2');
  assert.equal(await page.evaluate(()=>shList().items.find(x=>x.ean==='0000456').op),'');
  assert.equal(await page.evaluate(id=>shEntry(shList(),id).entry.op,subId),'Kontrola Hala 4');
  assert.equal(await page.evaluate(id=>shEntry(shList(),id).entry.code,subId),'MAN.SUB');
  assert.ok(await page.locator('.sh-ops').getByRole('button',{name:/Balení Hala 2/}).count());
  const first=await page.evaluate(()=>shList().items[0].id);
  await page.locator(`[data-shnote="${first}"]`).fill('Dodat do 10:00');
  await page.locator(`[data-shnote="${first}"]`).press('Tab');
  await page.locator(`[data-shst="${first}"]`).selectOption('run');
  await saved();
  await page.locator('#shQ').fill('Kryt');
  assert.equal(await page.locator('tr[data-shid]:visible').count(),1);
  await page.locator('#shQ').fill('');
  await page.locator('#shDepts summary').click();
  await page.locator('#shDeptNew').fill('Hala 2');await page.locator('[data-shdeptadd]').click();
  const dept=await page.evaluate(()=>S.shortage.depts[0].id);
  await page.locator('[data-shopdept]').first().selectOption(dept);
  await saved();
  // PDF pro celý seznam a PDF po odděleních; QR ověřený z vyrenderovaného PDF níže.
  const pdf=await download('[data-shpdf]','shortage.pdf');
  assert.equal((await fs.readFile(pdf)).subarray(0,5).toString(),'%PDF-');
  await download('[data-shpdfdept]','shortage-oddeleni.pdf');
  await page.locator('[data-shmode="rozbor"]').click();
  const excel=await download('[data-shaxlsx]','rozbor.xlsx');
  const out=X.read(await fs.readFile(excel),{type:'buffer'});assert.ok(out.Sheets.Rozbor);const analysisRows=X.utils.sheet_to_json(out.Sheets.Rozbor);assert.ok(analysisRows.length>=6);assert.ok(analysisRows.some(x=>x['Název dílu']==='Poddíl ručně'&&x['Urgentní množství']==='7'&&x['Poznámka']==='Poznámka poddílu'));
  await page.locator('[data-shmode="list"]').click();
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(resultDir,'shortage-light.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:path.join(resultDir,'shortage-dark.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  await page.locator('#backup').click();
  await page.waitForFunction(()=>$('#toast').textContent==='Záloha byla uložena.');
  const backup=JSON.parse(await fs.readFile(path.join(resultDir,'backup.json'),'utf8'));
  assert.equal(backup.state.shortage.lists[0].items[0].note,'Dodat do 10:00');
  // Přepnutí stránky a nový proces používají stejné soubory, žádný server ani localStorage.
  await page.reload();await page.waitForFunction(()=>typeof initialized!=='undefined' && initialized);
  assert.equal(await page.locator(`[data-shnote="${first}"]`).inputValue(),'Dodat do 10:00');
  assert.equal(await page.locator(`[data-shst="${first}"]`).inputValue(),'run');
  await app.close();app=null;await open();
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Dodat do 10:00');
  console.log('ok PDF, PDF po odděleních, rozbor do Excelu, historie a nový proces');
  // Skutečná událost paste pro barevný urgent.
  await paste('<table><tr><td>OBJ4</td><td>Barevný díl</td><td style="background-color:#FF0000"><a href="https://erp.example/?activeBarcode=C.1">0000999</a></td><td>A</td><td>8</td></tr></table>','OBJ4\tBarevný díl\t0000999\tA\t8');
  await page.locator('#dlg[open]').waitFor();assert.match(await page.locator('#dlgTitle').innerText(),/Barvy/);await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>S.shortage.lists.length===2);assert.equal(await page.evaluate(()=>shList().items[0].top),true);await saved();
  await paste('<table><tr><td>OBJ5</td><td>Z Kooperace</td><td><a href="https://erp.example/?activeBarcode=C.2">0000997</a></td><td>B</td><td>6</td><td></td><td>TOP2</td><td>Brush Hala 2</td></tr></table>','OBJ5\tZ Kooperace\t0000997\tB\t6\t\tTOP2\tBrush Hala 2');
  await page.waitForFunction(()=>S.shortage.lists.length===3);
  assert.equal(await page.evaluate(()=>shList().items[0].top2),true);
  assert.equal(await page.evaluate(()=>shList().items[0].code),'C.2');
  await page.locator('[data-shmanual]').first().click();await page.locator('#dlg[open]').waitFor();
  await page.locator('#dlg [name="name"]').fill('Ručně přidaný díl');await page.locator('#dlg [name="ean"]').fill('0000998');await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>shList().items.length===2);await saved();
  // Široká tabulka urgentů bez hlavičky. Datum v B nesmí přepnout import na evidenci pohybu.
  const wide=Array(19).fill('');wide[0]='0000555';wide[1]='22.10.2026 8:00';wide[2]='Držák urgent';wide[5]='OBJ77';wide[6]='TOP';wide[7]='12,5';wide[18]='Brus Hala 2';
  await paste('',wide.join('\t'));
  await page.waitForFunction(()=>S.shortage.lists.length===4);
  assert.deepEqual(await page.evaluate(()=>{const i=shList().items[0];return [i.ean,i.name,i.order,i.index,i.qty,i.op,i.top];}),['0000555','Držák urgent','OBJ77','TOP','12,5','Brus Hala 2',false]);
  assert.equal(await page.evaluate(()=>shList().moves),null);
  assert.match(await page.locator('#shSt3').innerText(),/Volitelné/);
  await download('#shSkipMove','urgenty-bez-evidence.pdf');
  // HTML ze schránky musí zachovat odkaz u A i oddělení ze sloupce S.
  const htmlWide='<table><tr>'+wide.map((v,i)=>'<td>'+(i===0?'<a href="https://erp.example/?activeBarcode=U.1">'+v+'</a>':v)+'</td>').join('')+'</tr></table>';
  await app.evaluate(({clipboard,ClipboardItem}, data)=>clipboard.write([new ClipboardItem({'text/html':data.html,'text/plain':data.text})]),{html:htmlWide,text:wide.join('\t')});
  await page.locator('#shClipboard').click();await listColumns();await page.waitForFunction(()=>S.shortage.lists.length===5);
  assert.equal(await page.evaluate(()=>shList().items[0].code),'U.1');
  assert.equal(await page.evaluate(()=>shList().items[0].op),'Brus Hala 2');
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Poznámka od plánování: Brus Hala 2');
  const rawFile=path.join(resultDir,'urgenty-a-s.xlsx');
  const rawHead=Array(19).fill('');rawHead[0]='EAN';rawHead[2]='Název dílu';rawHead[5]='Číslo objednávky';rawHead[6]='Index';rawHead[7]='Urgentní množství';rawHead[18]='Oddělení kde v procesu';
  const rawRow=wide.slice();rawRow[0]=555;rawRow[5]='OBJ88';rawRow[6]='B';rawRow[7]=10;
  const rawSheet=X.utils.aoa_to_sheet([rawHead,rawRow]);rawSheet.A2.z='0000000';rawSheet.A2.l={Target:'https://erp.example/?activeBarcode=U.2'};
  workbook(rawFile,[['Urgenty',rawSheet]]);
  await page.locator('#shFile').setInputFiles(rawFile);await listColumns();await page.waitForFunction(()=>S.shortage.lists.length===6);
  assert.deepEqual(await page.evaluate(()=>{const i=shList().items[0];return [i.ean,i.order,i.qty,i.op,i.code];}),['0000555','OBJ88','10','Brus Hala 2','U.2']);
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Poznámka od plánování: Brus Hala 2');
  assert.equal(await page.evaluate(()=>shList().moves),null);assert.equal(await page.evaluate(()=>shList().plan),null);
  const rawPdf=await download('#shSkipMove','urgenty-a-s.pdf');await saved();
  assert.equal(await page.evaluate(()=>shList().moves),null);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(resultDir,'urgenty-a-s.png'),fullPage:true});
  console.log('ok urgenty A–S: text, HTML, Excel a PDF bez kroku 3');
  // Soubor jen s prvním listem: výběr jednoho EAN sloupce, žádný dotaz na sestavu.
  await paste('',wide.join('\t'));await page.waitForFunction(()=>S.shortage.lists.length===7);
  const one=path.join(resultDir,'plan-jen-dily.xlsx');const oneWs=X.utils.aoa_to_sheet([['','','','EAN dílu'],['','','','0000555']]);oneWs.D2.l={Target:'https://erp.example/?activeBarcode=U.0'};
  workbook(one,[['Jen díly',oneWs]]);await page.locator('#shPlanFile').setInputFiles(one);
  await page.waitForFunction(()=>$('#dlg').open && $('#dlgTitle').textContent.includes('1. list'));
  assert.equal(await page.locator('#dlg [data-shcol]').count(),2);await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>shList().items[0].code==='U.0');
  assert.equal(await page.locator('#dlg[open]').count(),0);assert.equal(await page.evaluate(()=>shList().items[0].subs.length),0);
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Poznámka od plánování: Brus Hala 2');await saved();
  await page.reload();await page.waitForFunction(()=>typeof initialized!=='undefined' && initialized);
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Poznámka od plánování: Brus Hala 2');
  console.log('ok tlačítko schránky, poznámky S a výrobní plán se samostatnými listy');
  // Více QR pro jeden EAN: zvláštní sekce, uložení voleb, ruční volba přes propisku.
  const editId=await page.evaluate(()=>shList().items[0].id);
  await page.locator(`[data-shedit="${editId}"]`).click();await page.locator('#dlg[open]').waitFor();
  await page.locator('#dlg [name="link"]').fill('');await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>!shList().items[0].code);
  const beforeChoices=path.join(resultDir,'zaznamy-pred-planem.xlsx');workbook(beforeChoices,[['Pohyb',X.utils.aoa_to_sheet([['QR kód','Datum a čas','Počet ks','Stav'],['Q.1','22.10.2026 8:15','4','Broušení']])]]);
  await page.locator('#shMoveFile').setInputFiles(beforeChoices);await page.waitForFunction(()=>shList().records.some(x=>x.code==='Q.1'));
  const ambiguous=path.join(resultDir,'plan-vice-qr.xlsx');const aw=X.utils.aoa_to_sheet([['EAN dílu','Probíhající operace'],['0000555','Brus'],['0000555','Lakovna']]);aw.A2.l={Target:'https://erp.example/?activeBarcode=Q.1'};aw.A3.l={Target:'https://erp.example/?activeBarcode=Q.2'};
  workbook(ambiguous,[['Díly',aw]]);await page.locator('#shPlanFile').setInputFiles(ambiguous);
  await page.waitForFunction(()=>$('#dlg').open&&$('#dlgTitle').textContent.includes('1. list'));await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>shList().items[0].qrChoices.length===2);await saved();
  assert.match(await page.locator('.sh-depthead').first().innerText(),/Nelze přidělit odkaz/);
  let qrMenu=page.locator(`[data-shqr="${editId}"]`);
  assert.match(await qrMenu.locator('option[value="Q.1"]').textContent(),/Operace: Brus.*Broušení.*4 ks.*8:15/);
  assert.match(await qrMenu.locator('option[value="Q.2"]').textContent(),/Operace: Lakovna.*Interní záznam: nenahrán/);
  const afterChoices=path.join(resultDir,'zaznamy-po-planu.xlsx');workbook(afterChoices,[['Pohyb',X.utils.aoa_to_sheet([['QR kód','Datum a čas','Počet ks','Stav'],['Q.2','22.10.2026 9:30','7','Hotovo']])]]);
  await page.locator('#shMoveFile').setInputFiles(afterChoices);await page.waitForFunction(()=>shList().items[0].qrChoices[1].rec?.state==='Hotovo');
  assert.match(await qrMenu.locator('option[value="Q.2"]').textContent(),/Lakovna.*Hotovo.*7 ks.*9:30/);
  await saved();
  await page.reload();await page.waitForFunction(()=>typeof initialized!=='undefined'&&initialized);
  assert.equal(await page.evaluate(()=>shList().items[0].qrChoices.length),2);
  qrMenu=page.locator(`[data-shqr="${editId}"]`);
  assert.match(await qrMenu.locator('option[value="Q.2"]').textContent(),/Lakovna.*Hotovo.*7 ks.*9:30/);
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(resultDir,'qr-varianty.png'),fullPage:true});
  await qrMenu.click();await page.screenshot({path:path.join(resultDir,'qr-varianty-nabidka.png')});await qrMenu.press('Escape');
  await qrMenu.selectOption('Q.1');await page.waitForFunction(()=>shList().items[0].code==='Q.1');
  assert.deepEqual(await page.evaluate(()=>{const i=shList().items[0];return [i.op,i.rec.state,i.rec.qty];}),['Brus','Broušení','4']);
  await qrMenu.selectOption('Q.2');await page.waitForFunction(()=>shList().items[0].code==='Q.2');
  assert.deepEqual(await page.evaluate(()=>{const i=shList().items[0];return [i.op,i.rec.state,i.rec.qty];}),['Lakovna','Hotovo','7']);
  await page.locator(`[data-shedit="${editId}"]`).click();await page.locator('#dlg[open]').waitFor();
  assert.match(await page.locator('#dlg [name="qrChoice"] option[value="1"]').textContent(),/Lakovna.*Hotovo/);
  await page.locator('#dlg [name="qrChoice"]').selectOption('1');
  assert.equal(await page.locator('#dlg [name="code"]').inputValue(),'Q.2');
  for(const [key,value] of Object.entries({name:'Ručně upravený díl',order:'MAN-ORDER',index:'M',qty:'42',op:'Lakovna',note:'Ručně zachovat'}))await page.locator(`#dlg [name="${key}"]`).fill(value);
  await page.locator('#dlg [name="tier"]').selectOption('top2');await page.locator('#dlg [name="st"]').selectOption('run');
  await page.screenshot({path:path.join(resultDir,'editace-polozky.png')});await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>shList().items[0].name==='Ručně upravený díl'&&!$('#dlg').open);
  assert.equal(await page.locator('[data-shdepthead="unlinked"]').count(),0);
  // Doplnění poznámek z jiného sloupce zachová rozpracovaný seznam i ruční údaje.
  const noteFile=path.join(resultDir,'poznamky.xlsx'),nh=Array(19).fill(''),nr=Array(19).fill('');nh[0]='EAN';nh[2]='Název dílu';nh[17]='Text plánovače';nh[18]='Oddělení';nr[0]='0000555';nr[2]='Původní název';nr[17]='Dodat do pátku';nr[18]='Původní operace';
  workbook(noteFile,[['Urgentní díly',X.utils.aoa_to_sheet([nh,nr])]]);
  await page.locator('#shNotesFile').setInputFiles(noteFile);await listColumns('R');
  await page.waitForFunction(()=>shList().items[0].note.includes('Dodat do pátku'));
  assert.equal(await page.evaluate(()=>S.shortage.lists.length),7);
  assert.deepEqual(await page.evaluate(()=>{const i=shList().items[0];return [i.name,i.order,i.qty,i.op,i.code,i.note,i.st,i.top2];}),['Ručně upravený díl','MAN-ORDER','42','Lakovna','Q.2','Ručně zachovat · Poznámka od plánování: Dodat do pátku','run',true]);
  const editedPdf=await download('#shSkipMove','upraveny-urgent.pdf');await saved();
  await page.reload();await page.waitForFunction(()=>typeof initialized!=='undefined'&&initialized);
  assert.equal(await page.evaluate(()=>S.shortage.cols.list.note),'R');
  assert.equal(await page.evaluate(()=>shList().items[0].code),'Q.2');
  assert.equal(await page.evaluate(()=>shList().items[0].rec.state),'Hotovo');
  console.log('ok nabídka QR variant s operacemi a interními záznamy před/po plánu i restartu');
  console.log('ok ruční úpravy položek a poddílů, výběr QR, poznámky z ručně vybraného sloupce');
  await page.locator('#restore').click();await page.locator('#dlg[open]').waitFor();await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>S.shortage.lists.length===1 && $('#saveState').dataset.state==='saved');
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Dodat do 10:00');
  assert.equal(await page.locator('#shMsg').innerText(),'');
  await page.locator('#history').click();await page.locator('#dlg[open]').waitFor();assert.match(await page.locator('#dlgBody').innerText(),/Shortage:/);await page.locator('#dlgOk').click();
  console.log('ok schránka z Kooperace (A–H bez hlavičky, TOP2), barvy, ruční položka, záloha a obnova');
  // Data i ovládací prvky zůstanou použitelné na menší obrazovce.
  await page.setViewportSize({width:1024,height:768});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(resultDir,'shortage-1024.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const longNote='Začátek poznámky. '+('Zkontrolovat rozměry a dodat všechny součásti do výroby. '.repeat(24))+'KONEC POZNÁMKY';
  const noteField=page.locator(`[data-shnote="${first}"]`);
  await noteField.fill(longNote);await noteField.press('Tab');await saved();
  assert.equal(await noteField.evaluate(e=>e.tagName),'TEXTAREA');
  assert.equal(await noteField.evaluate(e=>e.scrollHeight<=e.clientHeight+1),true);
  assert.ok(await noteField.evaluate(e=>e.clientHeight)>200);
  await page.locator('#shQ').fill('žádná shoda');await page.locator('#shQ').fill('');
  assert.equal(await noteField.evaluate(e=>e.scrollHeight<=e.clientHeight+1),true);
  await page.screenshot({path:path.join(resultDir,'cele-poznamky.png'),fullPage:true});
  const notesPdf=await download('[data-shpdf]','cele-poznamky.pdf');
  await page.reload();await page.waitForFunction(()=>typeof initialized!=='undefined'&&initialized);
  assert.equal(await page.locator(`[data-shnote="${first}"]`).inputValue(),longNote);
  assert.equal(await page.locator(`[data-shnote="${first}"]`).evaluate(e=>e.scrollHeight<=e.clientHeight+1),true);
  console.log('ok obnova probíhajících operací a plné víceřádkové poznámky po restartu');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log('ok žádné chyby JavaScriptu, žádné síťové požadavky');
  await app.close();app=null;
  const py=spawnSync('python3',['-c',`import sys,json,pymupdf
d=pymupdf.open(sys.argv[1]);p=d[0];r=p.search_for('A.1')[0];m=72/25.4
box=pymupdf.Rect(r.x0-6*m,r.y0-17*m,r.x1+6*m,r.y1+m)
pix=p.get_pixmap(matrix=pymupdf.Matrix(6,6),clip=box,alpha=False)
open(sys.argv[2],'wb').write(pix.samples)
raw=pymupdf.open(sys.argv[3])
edited=pymupdf.open(sys.argv[4])
notes=pymupdf.open(sys.argv[5])
print(json.dumps({'w':pix.width,'h':pix.height,'landscape':p.rect.width>p.rect.height,'text':' '.join(x.get_text() for x in d),'raw':' '.join(x.get_text() for x in raw),'edited':' '.join(x.get_text() for x in edited),'notes':' '.join(x.get_text() for x in notes),'noteBounds':all(b[3]<190*72/25.4+1 for page in notes for b in page.get_text('blocks') if b[1]<190*72/25.4)}))`,pdf,path.join(resultDir,'qr.raw'),rawPdf,editedPdf,notesPdf],{encoding:'utf8'});
  if(py.status===0){
    const info=JSON.parse(py.stdout);assert.equal(info.landscape,true);assert.match(info.text.replace(/\s+/g,' '),/Dodat do 10:00/);
    assert.match(info.text.replace(/\s+/g,' '),/Poddíl ručně/);assert.match(info.text.replace(/\s+/g,' '),/Poznámka poddílu/);
    assert.match(info.edited.replace(/\s+/g,' '),/Ručně upravený díl/);assert.match(info.edited,/Q\.2/);assert.match(info.edited.replace(/\s+/g,' '),/Dodat do pátku/);
    assert.match(info.notes.replace(/\s+/g,' '),/KONEC POZNÁMKY/);assert.equal(info.noteBounds,true);assert.equal((info.notes.match(/Zkontrolovat/g)||[]).length,24);assert.equal((info.notes.match(/rozměry/g)||[]).length,24);
    assert.match(info.text.replace(/\s+/g,' '),/Balení Hala 2/);
    assert.match(info.raw,/OBJ88/);assert.match(info.raw,/Brus Hala 2/);assert.match(info.raw,/U\.2/);assert.match(info.raw,/0000555/);
    assert.match(info.raw.replace(/\s+/g,' '),/Poznámka od plánování:/);
    const rgb=await fs.readFile(path.join(resultDir,'qr.raw'));const rgba=new Uint8ClampedArray(info.w*info.h*4);
    for(let i=0;i<info.w*info.h;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=255;}
    const qr=require('jsqr')(rgba,info.w,info.h);assert.ok(qr,'QR kód v PDF musí jít přečíst');assert.equal(qr.data,'A.1');
    console.log('ok QR kód přečtený z PDF, český text a A4 na šířku');
  }
  else console.log('poznámka: kontrola obsahu PDF vyžaduje Python s PyMuPDF');
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(resultDir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(app)await app.close().catch(()=>{});if(profile)await fs.rm(profile,{recursive:true,force:true});});
