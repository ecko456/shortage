# Původ kódu a přibalené knihovny

Kód Shortage, sdílené pomocné funkce a vzhled jsou na žádost vlastníka odděleny
z `https://github.com/ecko456/odmeny_v2`, větev `claude/elegant-clarke-vl5n7d`,
commit `ce1ae206ba3bea365e9b21e5fd8f21b18a1ae84d`.

Převzaté části: `private/core/23-shortage.js`, `private/core/24-shortage-kroky.js`,
`private/app/26-shortage.js`, sekce Shortage z HTML, potřebné deklarace z pomocných
souborů pro XML/XLSX, PDF, datum, dialogy a formátování, styly a písma. Ostatní moduly,
PHP, databáze a přihlašování se nepřenášejí. Původní repozitář neobsahuje společnou
licenci pro vlastní aplikační kód; tento dokument mu novou licenci nepřiděluje.

Úpravy: odstraněna online AI a její závislosti, odstraněny nepoužité exporty pro
Node a vazby do panelu ostatních modulů, přidán Electron a místní úložiště/zálohy.
Opravena chybějící uvozovka atributu `class` v řádku poddílu a texty pro offline běh.
Import sešitu z Kooperace přednostně vybírá list `Shortage` před kontrolním reportem.
Verze 1.1 navíc podporuje tabulku urgentů A–S a přímé PDF bez evidence pohybu.
Z původních stylů jsou odstraněny nepotřebné části ostatních pohledů.

| Knihovna | Licence | Umístění licence |
|---|---|---|
| SheetJS (přibalená verze ze zdroje) | Apache 2.0 | `app/vendor/LICENSE-xlsx.txt` |
| jsPDF (přibalená verze ze zdroje) | MIT | `app/vendor/LICENSE-jspdf.txt` |
| qrcode-generator | MIT | Hlavička `app/vendor/qrcode.js` |
| IBM Plex Sans (TTF pro PDF) | SIL OFL 1.1 | `app/vendor/LICENSE-plex-sans.txt` |
| IBM Plex Sans / Mono, Barlow Semi Condensed, Plus Jakarta Sans (WOFF2) | SIL OFL 1.1 | `app/fonts/OFL-*.txt` |

Electron přidává do výsledného balíčku vlastní `LICENSE` a
`LICENSES.chromium.html`. Vývojové nástroje a jejich licence jsou v `node_modules`
a do aplikace se nepřibalují. jsQR se používá pouze v testu pro zpětné přečtení QR z PDF.

Verze 1.2: nativní tlačítko schránky, oddělené mapování prvního a druhého listu
výrobního plánu a poznámka od plánování ze sloupce S.

Verze 1.3: všechny operace poddílů ihned v seznamu, ruční zdroj a doplnění poznámek,
sekce nejednoznačných QR odkazů a editace položek/poddílů včetně exportů.
