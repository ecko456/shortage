'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Store,validate,MAX_BYTES}=require('../desktop/store.cjs');
const data=n=>JSON.stringify({format:'shortage-offline',version:1,state:{shortage:{lists:[{id:'sh'+n,items:[]}]},log:[]}});
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shortage-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:new Store(dir)};}
test('Uložení přežije nový proces a nezanechá dočasné soubory',async t=>{
  const {dir,store}=await setup(t);assert.equal(await store.load(),null);await store.save(data(1));assert.equal(await new Store(dir).load(),data(1));assert.deepEqual(await fs.readdir(dir),['shortage.json']);
});
test('Souběžné zápisy se provedou v pořadí a zachovají zálohy',async t=>{
  const {dir,store}=await setup(t);await store.load();await Promise.all([store.save(data(1)),store.save(data(2)),store.save(data(3))]);assert.equal(await store.load(),data(3));const backups=await fs.readdir(path.join(dir,'backups'));assert.equal(backups.length,2);
});
test('Automatické zálohy drží posledních 20 stavů',async t=>{
  const {dir,store}=await setup(t);await store.load();for(let i=0;i<24;i++)await store.save(data(i));assert.equal((await fs.readdir(path.join(dir,'backups'))).length,20);
});
test('Poškozená data se nepřepíší prázdným stavem; explicitní obnova je zachová v záloze',async t=>{
  const {dir,store}=await setup(t);await fs.writeFile(store.file,'porušeno');await assert.rejects(store.load(),/Původní soubor/);await assert.rejects(store.save(data(1)),/Nejdřív/);assert.equal(await fs.readFile(store.file,'utf8'),'porušeno');await store.save(data(2),{recovery:true});assert.equal(await store.load(),data(2));const b=await fs.readdir(path.join(dir,'backups'));assert.equal(await fs.readFile(path.join(dir,'backups',b[0]),'utf8'),'porušeno');
});
test('Neplatná a budoucí záloha se odmítne a neovlivní uložená data',async t=>{
  const {store}=await setup(t);await store.load();await store.save(data(1));await assert.rejects(store.save('{"format":"shortage-offline","version":2}'));assert.equal(await store.load(),data(1));assert.throws(()=>validate('x'.repeat(MAX_BYTES+1)),/velký/);
});
