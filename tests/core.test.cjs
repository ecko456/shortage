'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function core() {
  const ctx = vm.createContext({ console, crypto: globalThis.crypto, TextDecoder, TextEncoder, DecompressionStream, TextDecoderStream, setTimeout, clearTimeout });
  vm.runInContext('const SAFE_ID=/^[A-Za-z0-9_-]{1,40}$/; let S={shortage:{}};', ctx);
  for (const file of ['app/shared.js', 'app/core/shortage.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename:file });
  return code => JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`, ctx));
}
const seed = `const c=(text,link='',fill='')=>({text,link,fill}); const L=code=>'https://erp.example/?activeBarcode='+code;`;

test('Import zachová EAN s nulami a seřadí TOP, TOP 2, ostatní', () => {
  const out=core()(seed+`return shBuild([
    ['Objednávka','Název dílu','EAN','Index','Množství','','TOP','Operace'].map(x=>c(x)),
    [c('O1'),c('Běžný'),c('000123',L('A.1')),c('A'),c('2')],
    [c('O2'),c('Prioritní'),c('000124',L('A.2')),c('A'),c('3'),c(''),c('TOP')],
    [c('O3'),c('Další'),c('000125',L('A.3')),c('A'),c('4'),c(''),c('TOP 2')]]);`);
  assert.deepEqual(out.items.map(x=>x.ean),['000124','000125','000123']);
  assert.equal(out.items[2].code,'A.1'); assert.equal(out.header,0);
});
test('Odkazy odmítají spustitelná schémata, QR obsahuje jen activeBarcode', () => {
  assert.deepEqual(core()(`return [shLink('javascript:alert(1)'), shLink('data:text/html,x'), shCode('https://erp.example/?activeBarcode=A%2E2&x=3'), shCodeClean('a b')];`),['','','A.2','']);
});
test('Sanitizace zachová stav, poznámky, poddíly a odstraní neznámá data', () => {
  const out=core()(`return cleanShortage({lists:[{id:'sh1',at:1,items:[{id:'x',ean:'1',note:' Poznámka ',st:'run',stAt:4,subs:[{id:'x',ean:'2',code:'B.2',note:'Poddíl'}],secret:'x'}, {id:'x',ean:'3',link:'javascript:x'}]}],employees:{secret:1}});`);
  const list=out.lists[0]; assert.equal(list.items[0].st,'run'); assert.equal(list.items[0].note,'Poznámka');
  assert.equal(list.items[0].subs[0].note,'Poddíl'); assert.equal(list.items[1].link,'');
  assert.equal(new Set([list.items[0].id,list.items[0].subs[0].id,list.items[1].id]).size,3);
  assert.equal('employees' in out,false); assert.equal('secret' in list.items[0],false);
});
test('Evidence pohybu vybere nejnovější záznam a starší nepřepíše uložený', () => {
  const out=core()(seed+`const l=cleanShortage({lists:[{id:'sh1',at:1,items:[{ean:'1',code:'A.1'}]}]}).lists[0];
    const rows=[['A.1','22.10.2026 8:00','1','Starý'],['A.1','22.10.2026 9:00','2','Nový']].map(r=>r.map(x=>c(x)));
    shApplyRecs(l,shRecBuild(rows).recs,{at:1,by:'PC'});
    const r=shApplyRecs(l,shRecBuild([rows[0]]).recs,{at:2,by:'PC'});return {rec:l.items[0].rec,r};`);
  assert.equal(out.rec.state,'Nový'); assert.equal(out.rec.qty,'2'); assert.equal(out.r.older,1);
});
test('Plán přiřadí poddíly podle sestavy, indexu a objednávky', () => {
  const out=core()(seed+`const l=cleanShortage({lists:[{id:'sh1',at:1,items:[{ean:'00100',index:'A',order:'OBJ1'}]}]}).lists[0];
    const p=shPlanBlank('plan.xlsx'); shPlanRow(p,'100','200','A','OBJ1','Brush Hala 2',L('B.1'));
    shPlanRow(p,'100','300','B','OBJ1','Brush Hala 2',L('B.2')); shPlanRow(p,'100','400','A','OBJ2','Brush Hala 2',L('B.3'));
    shApplyPlan(l,p); l.items[0].subs[0].note='Zachovat';shApplyPlan(l,p); return l.items[0];`);
  assert.equal(out.subs.length,1); assert.equal(out.subs[0].ean,'200'); assert.equal(out.subs[0].note,'Zachovat');
});
test('Čekající poddíl se nepřidá pro stav Odesláno na WPA', () => {
  const out=core()(seed+`const l=cleanShortage({lists:[{id:'sh1',at:1,items:[{ean:'1',cands:[{ean:'2',code:'B.1',op:'Lakovna'}]}]}]}).lists[0];
    const r=shApplyRecs(l,shRecBuild([['B.1','22.10.2026 8:00','1','Odesláno na WPA'].map(x=>c(x))]).recs,{});return {r,subs:l.items[0].subs};`);
  assert.equal(out.r.wpa,1); assert.deepEqual(out.subs,[]);
});
test('Sloupce se rozpoznají místně i v přeházené tabulce', () => {
  const out=core()(`return shColsGuess('list',[['EAN','Název dílu','Množství','Číslo objednávky','Index','Operace']],SH_COLS.list);`);
  assert.equal(out.cols.ean,'A'); assert.equal(out.cols.order,'D'); assert.equal(out.cols.qty,'C');
});
test('Barvy výplně určují prioritu TOP a TOP 2', () => {
  const out=core()(seed+`return shBuild([[c('O1'),c('První'),c('1','','FF0000')],[c('O2'),c('Druhý'),c('2','','FFFF00')]],null,{FF0000:'top',FFFF00:'top2'}).items;`);
  assert.equal(out[0].top,true); assert.equal(out[1].top2,true);
});
test('Ruční přesun respektuje skupiny priorit a přiřazení oddělení', () => {
  const out=core()(`const sh=cleanShortage({depts:[{id:'sd1',name:'Brus',ops:[]}],lists:[{id:'sh1',at:1,items:[{id:'a',ean:'1',top:true},{id:'b',ean:'2'},{id:'c',ean:'3'}]}]}); const l=sh.lists[0];shMoveItem(l,'c',0);shDrop(sh,l,'c','sd1',null);return {order:l.items.map(x=>x.id),dept:shDeptOf(sh,l.items.find(x=>x.id==='c'))};`);
  assert.equal(out.order[0],'a'); assert.equal(out.dept,'sd1');
});
test('Doplnění chybějících nevrací ručně odstraněné položky bez výslovné volby', () => {
  const out=core()(`const l={items:[{ean:'1',index:'A',order:'O'}],gone:['2|A|O']};return shMergePlan(l,[{ean:'1',index:'A',order:'O'},{ean:'2',index:'A',order:'O'},{ean:'3',index:'A',order:'O'}],false);`);
  assert.equal(out.have,1); assert.equal(out.add.length,1); assert.equal(out.add[0].ean,'3');
});
test('Historie popíše změnu stavu a poznámky', () => {
  const out=core()(`const a=cleanShortage({lists:[{id:'sh1',at:1,items:[{id:'a',ean:'1'}]}]});const b=JSON.parse(JSON.stringify(a));b.lists[0].items[0].note='Urgent';shSetStatus(b.lists[0],'a','run',{at:2,by:'PC'});const out=[];shChanges(a,b,(kind,text,x)=>out.push({text,x}));return out;`);
  assert.ok(out.some(x=>x.text.includes('Urgent'))); assert.ok(out.some(x=>x.x?.v1==='Rozpracováno'));
});
test('Excel export neutralizuje vzorce v textových buňkách', () => {
  assert.equal(core()(`return safeCell('=HYPERLINK("https://example.com")');`).startsWith("'="),true);
});
