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
async function paste(html,text){await page.evaluate(({html,text})=>{
  const d=new DataTransfer();d.setData('text/html',html);d.setData('text/plain',text);
  document.querySelector('#shPaste').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));
},{html,text});}
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
  workbook(planFile,[['Souhrn',X.utils.aoa_to_sheet([['Souhrn']])],['Poddíly',pws]]);
  const moves=path.join(resultDir,'pohyb.xlsx');
  workbook(moves,[['Pohyb',X.utils.aoa_to_sheet([['QR kód','Datum a čas','Počet ks','Stav'],['A.1','22.10.2026 9:00',5,'Hotová kontrola'],['B.1','22.10.2026 9:30',10,'Broušení'],['B.2','22.10.2026 9:35',10,'Lakovna'],['B.3','22.10.2026 9:40',10,'Odesláno na WPA']])]]);
  await open();
  assert.match(await page.locator('#shView').innerText(),/Zatím žádný seznam/);
  await page.locator('#shFile').setInputFiles(urgent);
  await page.waitForFunction(()=>S.shortage.lists[0]?.items.length===3);
  assert.deepEqual(await page.evaluate(()=>shList().items.map(x=>x.ean)),['0000123','0000789','0000456']);
  assert.equal(await page.evaluate(()=>shList().sheet),'Shortage');
  assert.equal(await page.evaluate(()=>shList().items[1].top2),true);
  await saved();
  console.log('ok import Excelu, EAN s nulami a priority');
  await page.locator('#shPlanFile').setInputFiles(planFile);
  await page.waitForFunction(()=>shList().items.find(x=>x.ean==='0000456')?.subs.length===1);
  assert.equal(await page.locator('tr[data-shsub]').count(),1);
  await page.locator('#shMoveFile').setInputFiles(moves);
  await page.waitForFunction(()=>shList().items.find(x=>x.ean==='0000456')?.subs.length===2);
  assert.equal(await page.locator('tr[data-shsub]').count(),2);
  assert.equal(await page.evaluate(()=>shList().items[0].rec.state),'Hotová kontrola');
  await saved(); console.log('ok výrobní plán, poddíly, evidence pohybu, WPA');
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
  const out=X.read(await fs.readFile(excel),{type:'buffer'});assert.ok(out.Sheets.Rozbor);assert.ok(X.utils.sheet_to_json(out.Sheets.Rozbor).length>=5);
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
  await page.locator('#restore').click();await page.locator('#dlg[open]').waitFor();await page.locator('#dlgOk').click();
  await page.waitForFunction(()=>S.shortage.lists.length===1 && $('#saveState').dataset.state==='saved');
  assert.equal(await page.evaluate(()=>shList().items[0].note),'Dodat do 10:00');
  assert.equal(await page.locator('#shMsg').innerText(),'');
  await page.locator('#history').click();await page.locator('#dlg[open]').waitFor();assert.match(await page.locator('#dlgBody').innerText(),/Shortage:/);await page.locator('#dlgOk').click();
  console.log('ok schránka z Kooperace (A–H bez hlavičky, TOP2), barvy, ruční položka, záloha a obnova');
  // Data i ovládací prvky zůstanou použitelné na menší obrazovce.
  await page.setViewportSize({width:1024,height:768});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(resultDir,'shortage-1024.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log('ok žádné chyby JavaScriptu, žádné síťové požadavky');
  await app.close();app=null;
  const py=spawnSync('python3',['-c',`import sys,json,pymupdf
d=pymupdf.open(sys.argv[1]);p=d[0];r=p.search_for('A.1')[0];m=72/25.4
box=pymupdf.Rect(r.x0-6*m,r.y0-17*m,r.x1+6*m,r.y1+m)
pix=p.get_pixmap(matrix=pymupdf.Matrix(6,6),clip=box,alpha=False)
open(sys.argv[2],'wb').write(pix.samples)
print(json.dumps({'w':pix.width,'h':pix.height,'landscape':p.rect.width>p.rect.height,'text':' '.join(x.get_text() for x in d)}))`,pdf,path.join(resultDir,'qr.raw')],{encoding:'utf8'});
  if(py.status===0){
    const info=JSON.parse(py.stdout);assert.equal(info.landscape,true);assert.match(info.text.replace(/\s+/g,' '),/Dodat do 10:00/);
    const rgb=await fs.readFile(path.join(resultDir,'qr.raw'));const rgba=new Uint8ClampedArray(info.w*info.h*4);
    for(let i=0;i<info.w*info.h;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=255;}
    const qr=require('jsqr')(rgba,info.w,info.h);assert.ok(qr,'QR kód v PDF musí jít přečíst');assert.equal(qr.data,'A.1');
    console.log('ok QR kód přečtený z PDF, český text a A4 na šířku');
  }
  else console.log('poznámka: kontrola obsahu PDF vyžaduje Python s PyMuPDF');
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(resultDir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(app)await app.close().catch(()=>{});if(profile)await fs.rm(profile,{recursive:true,force:true});});
