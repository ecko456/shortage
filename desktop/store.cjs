'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 32 * 1024 * 1024;

function validate(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('Soubor je příliš velký (nejvýš 32 MB).');
  const value = JSON.parse(text);
  if (!value || value.format !== 'shortage-offline' || value.version !== 1 || !value.state || !value.state.shortage || !Array.isArray(value.state.shortage.lists)) {
    throw new Error('Tohle není podporovaná záloha aplikace Shortage.');
  }
  return value;
}

async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temp, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

class Store {
  constructor(dir) { this.dir = dir; this.file = path.join(dir, 'shortage.json'); this.tail = Promise.resolve(); this.loaded = false; }
  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const text = await fs.readFile(this.file, 'utf8');
      validate(text);
      this.loaded = true;
      return text;
    } catch (error) {
      if (error.code === 'ENOENT') { this.loaded = true; return null; }
      throw new Error(`Uložená data nelze přečíst. Původní soubor zůstal zachovaný. ${error.message}`);
    }
  }
  save(text, { recovery = false } = {}) {
    const job = this.tail.then(async () => {
      validate(text);
      if (!this.loaded && !recovery) throw new Error('Nejdřív je potřeba načíst data nebo obnovit zálohu.');
      let previous;
      try { previous = await fs.readFile(this.file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (previous && previous !== text) {
        const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const dir = path.join(this.dir, 'backups');
        await atomicWrite(path.join(dir, `shortage-${stamp}.json`), previous);
        const files = (await fs.readdir(dir)).filter(n => /^shortage-\d+-[a-f0-9]+\.json$/.test(n)).sort();
        for (const old of files.slice(0, -20)) await fs.rm(path.join(dir, old));
      }
      await atomicWrite(this.file, text);
      this.loaded = true;
      return { savedAt: Date.now() };
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
module.exports = { Store, validate, atomicWrite, MAX_BYTES };
