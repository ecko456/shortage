# Shortage pro Windows

Samostatná offline aplikace pro seznamy chybějících dílů. Převzatý modul Shortage
z Odměn V2, oddělený od hodnocení lidí a ostatních modulů.

## Stažení a spuštění

1. Otevři [nejnovější vydání](https://github.com/ecko456/shortage/releases/latest).
2. Stáhni `Shortage-1.0.0-Windows-x64.exe` do svého počítače.
3. Spusť soubor. Instalace, PHP, Node.js ani připojení k serveru nejsou potřeba.

Určeno pro **Windows 10/11, 64 bitů (x64)**. Jde o přenosný program; data ukládá do
profilu Windows, takže přesunutí nebo výměna `.exe` souboru data nesmaže. Balíček
není digitálně podepsaný; Windows může při prvním spuštění zobrazit upozornění
SmartScreen. Aplikace nemá automatickou aktualizaci.

## Co aplikace umí

- **Urgentní díly:** Excel (`xlsx`, `xls`, `xlsm`, `ods`) nebo vložení tabulky přes
  Ctrl+V, zachování nul v EANu a odkazů, TOP SHORTAGE / TOP 2 podle textu nebo barvy.
- **Výrobní plán:** dohledání poddílů podle EANu sestavy, indexu a objednávky,
  včetně rychlého čtení velkých XLSX souborů.
- **Evidence pohybu:** soubor Excelu, CSV/text nebo Ctrl+V; nejnovější záznam ke kódu,
  přidání poddílů z jiných operací, vynechání stavu „Odesláno na WPA“.
- **Úpravy:** poznámky, ruční přidání a odebrání položky, pořadí myší/klávesnicí,
  priority, stav položky, oddělení, hledání a filtry.
- **Rozbor:** probíhající operace, poddíly a interní záznamy, doplnění prázdných
  poznámek a export do Excelu.
- **PDF:** A4 na šířku, QR s hodnotou `activeBarcode`, kolonky pro stav v 10:00 a
  13:00, poznámky, skrytí jednotlivých položek a samostatné stránky po odděleních.
- **Místní historie, záloha a obnova.** Světlý i tmavý režim podle Windows.

Sloupce souborů se rozpoznávají **místně podle hlavičky**, volbu lze ručně opravit a
zapamatovat. Online AI byla odstraněna. Všechny knihovny i česká písma jsou přibalené.
Aplikace neposílá data na internet. Odkazy z ERP uchovává jako podklad pro QR;
online stránky ERP z této offline aplikace neotvírá.

### Výstup z Kooperace Hala 2

Načti `shortage_RRRR-MM-DD.xlsx`, případně v Kooperaci použij **Kopírovat shortage**
a vlož tabulku do Shortage přes Ctrl+V. Import očekává:

| Sloupec | Obsah |
|---|---|
| A | Číslo objednávky |
| B | Název dílu |
| C | EAN s hypertextovým odkazem obsahujícím `activeBarcode` |
| D | Index (line) |
| E | Urgentní množství |
| F | Nevyužitý |
| G | `TOP` nebo `TOP2` (případně `TOP 2`) |
| H | Probíhající operace |

V sešitu má přednost list **Shortage**, i když má druhý list **Kontrola URGENTY**
více řádků. Sloupec I „Kde je“ je informativní a tento modul jej neimportuje.
Kopie ze schránky funguje i bez hlavičky, pokud obsahuje HTML tabulku s odkazy u EANů.
Kooperace nadále obstarává přípravu seznamu; tato aplikace ji nespouští a nemění její
Google tabulku ani složku se záznamy.

## Data a zálohy

- Ukládá se automaticky; horní lišta ukazuje „Uloženo v počítači“ nebo chybu zápisu.
- Soubory jsou v `%APPDATA%\Shortage` (tlačítko **Složka dat**).
- `shortage.json` je aktuální stav. Složka `backups` obsahuje posledních 20
  předchozích uložených stavů. Nejde o denní zálohy: při častých změnách se obměňují.
- **Zálohovat** uloží samostatný JSON soubor na zvolené místo. Doporučené pro přenos
  na druhý počítač nebo zálohu na jiný disk.
- **Obnovit zálohu** nahradí stav po potvrzení; dosavadní soubor se zachová v automatických
  zálohách. Umí obnovit i stav při poškození hlavního souboru.
- Zápisy jsou řazené a atomické; při běžném zavření aplikace se čeká na jejich dokončení.
  Druhá instance programu otevře stávající okno.

Data a zálohy jsou místní **nešifrované JSON soubory**, chráněné účtem a diskem Windows.
Přístupové kartičky, PIN a serverové šifrování z Odměn sem nepatří. Aplikace začíná
prázdná; žádná skutečná provozní data ani přihlašovací údaje nebyly do repozitáře přeneseny.
Šifrované zálohy `.odmeny` se sem přímo nenačítají. Načti původní pracovní Excel soubory.

Limity původního modulu: 30 seznamů, 1 000 položek v seznamu, 50 viditelných poddílů
u položky a 20 oddělení. Velikost místní zálohy je nejvýš 32 MB.

## Vývoj

Node.js 22 nebo novější; závislosti jsou uzamčené v `package-lock.json`.

```bash
npm ci
npm test
npm run test:e2e
npm start
```

`npm test` ověřuje výpočty/importy a zápisy dat včetně poškozeného souboru,
souběžných zápisů a rotace záloh. `test:e2e` spouští skutečný Electron s dočasným
profilem a syntetickými sešity: import, plán, pohyb, filtry, stavy, oddělení,
PDF/Excel, restart, zálohu a obnovu. Snímky jsou v ignorované složce `test-results`.
Kontrola textu a QR z PDF navíc vyžaduje Python s PyMuPDF; bez něj je tento krok
výslovně vynechán. Na Linuxu test používá headless režim; `--no-sandbox` platí jen
pro testovací proces v kontejneru.

```bash
npm run dist:win
```

Výsledkem je přenosný `.exe` v `dist/`. `npm run dist:zip` vytvoří ZIP se spustitelnou
aplikací. Při prvním sestavení se stáhnou sestavovací nástroje a Electron; uživatel
hotové aplikace internet nepotřebuje. Windows sestavení lze provést i na Linuxu.
CI workflow build ověří na Windows a uloží balíček jako artefakt.

## Struktura a původ

| Cesta | Obsah |
|---|---|
| `app/core/shortage.js` | Pravidla importu, párování, priority, oddělení, čištění a rozbor. |
| `app/ui/shortage.js` | Rozhraní modulu, Excel, schránka, PDF a QR. |
| `app/shared.js` | Pouze sdílené pomocné funkce potřebné pro Shortage. |
| `app/runtime.js`, `app/bootstrap.js` | Místní ukládání, historie, zálohy a start aplikace. |
| `desktop/` | Electron, omezené IPC rozhraní, místní soubory a automatické zálohy. |
| `tests/` | Testy jádra, úložiště a rozhraní. |

Zdroj: `ecko456/odmeny_v2`, větev `claude/elegant-clarke-vl5n7d`, commit
[`ce1ae206ba3bea365e9b21e5fd8f21b18a1ae84d`](https://github.com/ecko456/odmeny_v2/commit/ce1ae206ba3bea365e9b21e5fd8f21b18a1ae84d).
Původní repozitář ani serverová instalace nebyly změněny. Licence přibalených knihoven:
[THIRD_PARTY.md](THIRD_PARTY.md).
