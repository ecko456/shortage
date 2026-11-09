/* Převzato z ecko456/odmeny_v2, commit ce1ae206ba3bea365e9b21e5fd8f21b18a1ae84d.
 * Samostatná offline edice Shortage. Původ a úpravy: viz THIRD_PARTY.md. */
const SH_MAX_LISTS=30;

const SH_MAX_ITEMS=1000;

const SH_MAX_SUBS=50;

const SH_MAX_CANDS=100;

const SH_MAX_DEPTS=20;

const SH_MAX_DEPT_OPS=100;

const SH_MAX_GONE=1000;

function blankShortage(){return {lists:[],depts:[],cols:{},colors:{}};}

function shUnxml(s){
  return String(s==null?"":s).replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi,(m,e)=>{
    const k=e.toLowerCase(),named={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
    if(named[k])return named[k];
    const n=k[1]==="x"?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
    return n>0&&n<=0x10FFFF?String.fromCodePoint(n):m;
  });
}

function shLink(v){
  let s=String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g,"").trim();
  if(/^www\./i.test(s))s="https://"+s;
  return s.length<=2000&&/^https?:\/\/[^\s<>"]+$/i.test(s)?s:"";
}

function shCodeClean(v){
  const s=String(v==null?"":v).trim();
  return /^[\x21-\x7E]{1,120}$/.test(s)?s:"";
}

function shCode(link){
  const m=String(link==null?"":link).match(/activeBarcode=([^&#]*)/i);
  if(!m)return "";
  let v=m[1];
  try{v=decodeURIComponent(v);}catch(e){/* nechá se, jak je */}
  return shCodeClean(v);
}

function shRecClean(r,line){
  if(!r||typeof r!=="object")return null;
  const n=v=>Number.isFinite(+v)?Math.max(0,+v):0;
  return {ts:n(r.ts),when:line(r.when,40),qty:line(r.qty,40),state:line(r.state,400),op:line(r.op,200),n:Math.min(99999,Math.round(n(r.n))),at:n(r.at),by:line(r.by,60)};
}

function shParseWhen(v){
  const s=String(v==null?"":v).trim();
  let m,y,mo,d,h=0,mi=0,se=0;
  if((m=s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))){d=+m[1];mo=+m[2];y=+m[3];if(y<100)y+=2000;h=+(m[4]||0);mi=+(m[5]||0);se=+(m[6]||0);}
  else if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))){y=+m[1];mo=+m[2];d=+m[3];h=+(m[4]||0);mi=+(m[5]||0);se=+(m[6]||0);}
  else if(/^\d{5}(?:[.,]\d+)?$/.test(s)){
    const x=parseFloat(s.replace(",","."));
    if(x<20000||x>80000)return 0;
    const days=Math.floor(x),secs=Math.round((x-days)*86400),b=new Date(1899,11,30+days);
    return new Date(b.getFullYear(),b.getMonth(),b.getDate(),Math.floor(secs/3600),Math.floor(secs%3600/60),secs%60).getTime();
  }
  else return 0;
  if(mo<1||mo>12||d<1||d>31||h>23||mi>59||se>59)return 0;
  const t=new Date(y,mo-1,d,h,mi,se);
  return t.getMonth()===mo-1&&t.getDate()===d?t.getTime():0;
}

function shWhenText(ts){const d=new Date(ts||0);return dayText(todayIso(ts||0))+" "+d.getHours()+":"+String(d.getMinutes()).padStart(2,"0");}

function shLooksLikeRecs(rows){
  const t=(r,c)=>String((r&&r[c]&&r[c].text)!=null?r[c].text:"").trim();
  const data=(Array.isArray(rows)?rows:[]).filter(r=>[0,1,2,3].some(c=>t(r,c)));
  const dated=data.filter(r=>t(r,0)&&shParseWhen(t(r,1))).length;
  return dated>0&&dated*2>=data.length-1;
}

function shRecBuild(rows,cols){
  const t=(r,c)=>c<0?"":String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const n=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // sloupce evidence pohybu (2.61): výchozí A QR kód, B datum a čas, C ks, D stav
  const x=shColIdx("move",cols);
  const recs=new Map(),cnt=new Map();let count=0,bad=0;
  (Array.isArray(rows)?rows:[]).forEach(r=>{
    const raw=t(r,x.code),when=t(r,x.when),qty=t(r,x.qty),state=t(r,x.state),op=t(r,x.op);
    if(!raw&&!when&&!qty&&!state)return;
    const ts=shParseWhen(when),code=shCodeClean(raw);
    if(!ts&&(/^(qr|kod|code|barcode)/.test(n(raw))||/datum|cas/.test(n(when))&&/stav/.test(n(state))))return;   // nadpisy
    if(!code){bad++;return;}
    count++;
    cnt.set(code,(cnt.get(code)||0)+1);
    const prev=recs.get(code);
    if(!prev||ts>=prev.ts)recs.set(code,{ts,when:ts?shWhenText(ts):when.slice(0,40),qty:qty.slice(0,40),state:state.slice(0,400),op:op.slice(0,200)});
  });
  recs.forEach((r,code)=>{r.n=cnt.get(code)||1;});
  return {recs,rows:count,bad};
}

function shApplyRecs(list,recs,meta){
  const by=new Map(),cands=new Map();
  // položky i jejich poddíly (2.29)
  list.items.forEach(it=>[it,...(it.subs||[])].forEach(i=>{if(i.code){if(!by.has(i.code))by.set(i.code,[]);by.get(i.code).push(i);}}));
  // čekající poddíly s jinou operací (2.29.1): záznam s jejich kódem je přidá pod sestavu
  list.items.forEach(it=>(it.cands||[]).forEach(c=>{if(c.code&&!by.has(c.code)){if(!cands.has(c.code))cands.set(c.code,[]);cands.get(c.code).push({it,c});}}));
  const out={matched:0,updated:0,same:0,older:0,added:0,wpa:0,missing:[]};
  const stamp=r=>({...r,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)});
  recs.forEach((r,code)=>{
    const items=by.get(code);
    if(!items){
      const cs=cands.get(code);
      if(!cs){out.missing.push(code);return;}
      out.matched++;
      if(shWpa(r.state)){out.wpa++;return;}   // „Odesláno na WPA“: nepřidávat
      cs.forEach(({it,c})=>{
        if((it.subs||[]).length>=SH_MAX_SUBS)return;
        it.subs=[...(it.subs||[]),{id:"",ean:c.ean,link:c.link,code:c.code,op:c.op,note:"",rec:stamp(r),byRec:true}];
        it.cands=it.cands.filter(x=>x!==c);
        out.added++;
      });
      return;
    }
    out.matched++;
    items.forEach(i=>{
      const p=i.rec;
      if(p&&p.ts===r.ts&&p.qty===r.qty&&p.state===r.state&&p.when===r.when&&(p.op||"")===(r.op||"")&&(p.n||0)===(r.n||0)){out.same++;return;}
      if(p&&p.ts&&r.ts&&r.ts<p.ts){out.older++;return;}
      i.rec=stamp(r);
      out.updated++;
    });
  });
  return out;
}

function shMoveItem(list,id,to){
  const from=list.items.findIndex(i=>i.id===id);
  if(from<0)return false;
  const it=list.items[from],r=shRank(it);
  const lo=list.items.filter(i=>shRank(i)<r).length,hi=lo+list.items.filter(i=>shRank(i)===r).length-1;
  to=Math.max(lo,Math.min(hi,Math.round(+to||0)));
  if(to===from)return false;
  list.items.splice(from,1);
  list.items.splice(to,0,it);
  return true;
}

function shRank(i){return i.top?0:i.top2?1:2;}

function shTopFirst(items){return [0,1,2].flatMap(r=>items.filter(i=>shRank(i)===r));}

function shSetTier(list,id,tier){
  const it=list&&list.items.find(i=>i.id===id);
  if(!it)return false;
  const top=tier==="top",top2=tier==="top2";
  if(!!it.top===top&&!!it.top2===top2)return false;
  it.top=top;it.top2=top2;
  const order=shTopFirst(list.items);
  list.items.splice(0,list.items.length,...order);
  return true;
}

function shSetTop(list,id,on){return shSetTier(list,id,on?"top":"");}

function shDeptMap(sh){const m=new Map();((sh&&sh.depts)||[]).forEach(d=>d.ops.forEach(o=>{if(!m.has(o.key))m.set(o.key,d.id);}));return m;}

function shAutoDept(sh,it,map){
  map=map||shDeptMap(sh);
  const own=map.get(shOpKey(it.op));
  if(own)return own;
  for(const x of it.subs||[]){const d=map.get(shOpKey(x.op));if(d)return d;}
  return "";
}

function shDeptOf(sh,it,map){
  const ids=new Set(((sh&&sh.depts)||[]).map(d=>d.id));
  if(it.dept==="-")return "";
  if(it.dept&&ids.has(it.dept))return it.dept;
  return shAutoDept(sh,it,map);
}

function shSections(sh,items){
  const depts=(sh&&sh.depts)||[],map=shDeptMap(sh);
  if(!depts.length)return [{id:"",name:"",items:items.slice()}];
  const by=new Map(depts.map(d=>[d.id,[]]));by.set("",[]);
  items.forEach(i=>by.get(shDeptOf(sh,i,map)).push(i));
  return depts.map(d=>({id:d.id,name:d.name,items:by.get(d.id)})).concat([{id:"",name:"Nezařazeno",items:by.get("")}]).filter(x=>x.items.length);
}

function shDrop(sh,list,id,dept,before){
  const it=list&&list.items.find(i=>i.id===id);
  if(!it)return false;
  const ids=new Set(((sh&&sh.depts)||[]).map(d=>d.id));
  if(dept&&!ids.has(dept))return false;
  const was=JSON.stringify([it.dept||"",list.items.map(i=>i.id)]);
  const auto=shAutoDept(sh,it);
  it.dept=dept===auto?"":(dept||"-");
  const rest=list.items.filter(i=>i!==it),map=shDeptMap(sh);
  let at=before?rest.findIndex(i=>i.id===before):-1;
  if(at<0){at=rest.length;for(let k=rest.length-1;k>=0;k--){if(shDeptOf(sh,rest[k],map)===(dept||"")){at=k+1;break;}}}
  rest.splice(at,0,it);
  list.items.splice(0,list.items.length,...shTopFirst(rest));
  return JSON.stringify([it.dept||"",list.items.map(i=>i.id)])!==was;
}

function shAssignOp(sh,key,label,deptId){
  if(!sh||!Array.isArray(sh.depts))return false;
  let changed=false;
  // z ostatních oddělení pryč, v cílovém zůstane (opakované přiřazení nic nemění)
  sh.depts.forEach(d=>{if(d.id===deptId)return;const n=d.ops.length;d.ops=d.ops.filter(o=>o.key!==key);if(d.ops.length!==n)changed=true;});
  const d=sh.depts.find(x=>x.id===deptId);
  if(d&&!d.ops.some(o=>o.key===key)){d.ops.push({key,label:String(label||key).replace(/\s+/g," ").trim().slice(0,120)});changed=true;}
  return changed;
}

function shOpKey(op){return shOpNorm(op)||"-";}

function shOpList(list){
  const m=new Map();
  const add=op=>{const k=shOpKey(op);const x=m.get(k);if(x)x.n++;else m.set(k,{key:k,label:k==="-"?"bez operace":String(op).trim(),n:1});};
  ((list&&list.items)||[]).forEach(i=>{add(i.op);(i.subs||[]).forEach(x=>add(x.op));});
  return [...m.values()].sort((a,b)=>b.n-a.n||(a.key==="-")-(b.key==="-")||a.label.localeCompare(b.label,"cs"));
}

function shOpsAll(sh){
  const m=new Map();
  ((sh&&sh.lists)||[]).forEach(l=>shOpList(l).forEach(o=>{const x=m.get(o.key);if(x)x.n+=o.n;else m.set(o.key,{...o});}));
  ((sh&&sh.depts)||[]).forEach(d=>d.ops.forEach(o=>{if(!m.has(o.key))m.set(o.key,{key:o.key,label:o.label,n:0});}));
  return [...m.values()].sort((a,b)=>(a.key==="-")-(b.key==="-")||a.label.localeCompare(b.label,"cs"));
}

function shOpPick(items,keys){
  if(!keys||!keys.size)return items;
  return items.map(i=>{const subs=(i.subs||[]).filter(x=>keys.has(shOpKey(x.op)));return keys.has(shOpKey(i.op))||subs.length?{...i,subs}:null;}).filter(Boolean);
}

function shStClean(x,line){return SH_ST_KEYS.has(x.st)?{st:x.st,stAt:Number.isFinite(+x.stAt)?Math.max(0,+x.stAt):0,stBy:line(x.stBy,60)}:{};}

const SH_ST=[["plan","Bude rozpracováno"],["run","Rozpracováno"],["wait","Čekáme na díl"],["done","Hotovo"]];

const SH_ST_KEYS=new Set(SH_ST.map(x=>x[0]));

const shStName=k=>(SH_ST.find(x=>x[0]===k)||["",""])[1];

function shSetStatus(list,id,st,meta){
  const hit=shEntry(list,id);
  if(!hit)return false;
  const e=hit.entry,v=SH_ST_KEYS.has(st)?st:"";
  if((e.st||"")===v)return false;
  if(v){e.st=v;e.stAt=(meta&&meta.at)||Date.now();e.stBy=(meta&&meta.by)||"";}else{delete e.st;delete e.stAt;delete e.stBy;}
  return true;
}

function cleanShortage(o){
  o=o&&typeof o==="object"?o:{};
  const line=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const num=v=>Number.isFinite(+v)?Math.max(0,+v):0;
  const seen=new Set(),uniq=(v,p)=>{let x=typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  // poddíl z výrobního plánu (2.29): EAN a odkaz poddílu, kód do QR, operace, poznámka, poslední záznam
  const sub=s=>({id:"",ean:line(s.ean,60),link:shLink(s.link),code:"code" in s?shCodeClean(s.code):shCode(s.link),op:line(s.op,300),note:line(s.note,300),rec:shRecClean(s.rec,line),byRec:s.byRec===true,pdfHide:s.pdfHide===true,...shStClean(s,line),_id:s.id});
  // čekající poddíl s jinou operací (2.29.1): přidá ho až poslední záznam s jeho kódem
  const cand=c=>({ean:line(c.ean,60),link:shLink(c.link),code:shCodeClean(c.code),op:line(c.op,300)});
  const meta=m=>m&&typeof m==="object"?{file:line(m.file,160),at:num(m.at),by:line(m.by,60),rows:Math.round(num(m.rows))}:null;
  const lists=(Array.isArray(o.lists)?o.lists:[]).filter(l=>l&&typeof l==="object"&&Array.isArray(l.items)).map(l=>({
    id:uniq(l.id,"sh"),at:num(l.at),by:line(l.by,60),file:line(l.file,160),sheet:line(l.sheet,80),
    plan:l.plan&&typeof l.plan==="object"?{file:line(l.plan.file,160),at:num(l.plan.at),by:line(l.plan.by,60)}:null,
    // evidence pohybu (2.61, 3. krok): odkud jsou poslední záznamy
    moves:meta(l.moves),
    // ručně odebrané položky (2.36): při doplnění chybějících se samy nevrátí
    gone:[...new Set((Array.isArray(l.gone)?l.gone:[]).filter(k=>typeof k==="string"&&k).map(k=>k.slice(0,240)))].slice(-SH_MAX_GONE),
    // seznam ze 2.27 nemá top, op ani code: kód se dopočítá z odkazu; seznam ze 2.27.1 nemá id, note ani rec; ze 2.28 nemá subs
    items:shTopFirst(l.items.filter(i=>i&&typeof i==="object").map(i=>({id:"",order:line(i.order,80),name:line(i.name,200),ean:line(i.ean,60),
      index:line(i.index,40),qty:line(i.qty,40),top:i.top===true,top2:i.top2===true&&i.top!==true,op:line(i.op,300),link:shLink(i.link),
      code:"code" in i?shCodeClean(i.code):shCode(i.link),note:line(i.note,300),rec:shRecClean(i.rec,line),pdfHide:i.pdfHide===true,full:i.full===true,
      dept:i.dept==="-"||(typeof i.dept==="string"&&SAFE_ID.test(i.dept))?i.dept:"",...shStClean(i,line),...(line(i.pop,300)?{pop:line(i.pop,300)}:{}),
      subs:(Array.isArray(i.subs)?i.subs:[]).filter(s=>s&&typeof s==="object").map(sub).filter(s=>s.ean||s.code).slice(0,SH_MAX_SUBS),
      cands:(Array.isArray(i.cands)?i.cands:[]).filter(c=>c&&typeof c==="object").map(cand).filter(c=>c.code||c.ean).slice(0,SH_MAX_CANDS),_id:i.id})).filter(i=>i.ean||i.name)).slice(0,SH_MAX_ITEMS),
  }));
  lists.forEach(l=>{
    // id položek i poddílů jsou jedinečné v celém seznamu
    const ids=new Set(),give=(x,p)=>{let v=typeof x._id==="string"&&SAFE_ID.test(x._id)&&!ids.has(x._id)?x._id:uid(p);while(ids.has(v))v=uid(p);ids.add(v);x.id=v;delete x._id;};
    l.items.forEach(i=>give(i,"si"));
    l.items.forEach(i=>i.subs.forEach(s=>give(s,"sp")));
  });
  // oddělení (2.32): jedinečné id a název, operace nejvýš v jednom oddělení
  const dSeen=new Set(),opSeen=new Set();
  const depts=(Array.isArray(o.depts)?o.depts:[]).filter(d=>d&&typeof d==="object").map(d=>{
    let id=typeof d.id==="string"&&SAFE_ID.test(d.id)?d.id:uid("sd");while(dSeen.has(id))id=uid("sd");dSeen.add(id);
    const ops=(Array.isArray(d.ops)?d.ops:[]).filter(x=>x&&typeof x==="object").map(x=>({key:shOpKey(x.key),label:line(x.label||x.key,120)}))
      .filter(x=>x.key&&!opSeen.has(x.key)&&(opSeen.add(x.key),true)).slice(0,SH_MAX_DEPT_OPS);
    return {id,name:line(d.name,60)||"Oddělení",ops};
  }).slice(0,SH_MAX_DEPTS);
  const dIds=new Set(depts.map(d=>d.id));
  lists.forEach(l=>l.items.forEach(i=>{if(i.dept&&i.dept!=="-"&&!dIds.has(i.dept))i.dept="";}));   // smazané oddělení: zase podle operace
  // nejnovější první; nad SH_MAX_LISTS se nejstarší zahodí
  lists.sort((a,b)=>b.at-a.at);
  // sloupce tří importů (2.61) a barvy výplně buňky EANu → TOP / TOP 2 / běžná shortage
  const cols={};
  Object.keys(SH_COLS).forEach(k=>{if(o.cols&&o.cols[k]&&typeof o.cols[k]==="object")cols[k]=shColsClean(k,o.cols[k]);});
  const colors={};
  if(o.colors&&typeof o.colors==="object")Object.keys(o.colors).slice(0,SH_MAX_COLORS).forEach(k=>{const h=shHex(k);if(h&&SH_TIERS.includes(o.colors[k]))colors[h]=o.colors[k];});
  return {lists:lists.slice(0,SH_MAX_LISTS),depts,cols,colors};
}

function shIsHeader(t){
  const n=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const re=[/objedn|zakaz/,/nazev|^dil\b|popis/,/\bean\b|kod|carov/,/^index\b/,/mnozstv|^ks\b|pocet/];
  return re.filter((r,i)=>r.test(n(t[i]))).length>=2&&!/\d/.test(String(t[4]||""));
}

function shBuild(rows,cols,colors){
  rows=Array.isArray(rows)?rows:[];
  const t=(r,c)=>c<0?"":String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  // sloupce (2.61): výchozí A objednávka, B název, C EAN, D index, E množství, G TOP, H operace
  const x=shColIdx("list",cols);
  let header=-1;
  for(let i=0;i<Math.min(rows.length,15);i++)if(shIsHeader([x.order,x.name,x.ean,x.index,x.qty].map(c=>t(rows[i],c)))){header=i;break;}
  const items=[],warn={noLink:0,noCode:0,noEan:0,skipped:0},fills=new Map();
  const width=Math.max(8,...rows.slice(0,50).map(r=>(r||[]).length));
  rows.forEach((r,ri)=>{
    if(ri<=header)return;
    const order=t(r,x.order),name=t(r,x.name),ean=t(r,x.ean),index=t(r,x.index),qty=t(r,x.qty),op=t(r,x.op);
    if(!order&&!name&&!ean&&!index&&!qty&&!op)return;
    if(!ean&&!name){warn.skipped++;return;}
    const cell=c=>c<0?"":String((r&&r[c]&&r[c].link)||"").trim();
    let raw=cell(x.ean);
    for(let c=0;!raw&&c<width;c++)if(c!==x.ean)raw=cell(c);
    const code=shCode(raw);
    if(!raw)warn.noLink++;else if(!code)warn.noCode++;
    if(!ean)warn.noEan++;
    // G: „TOP“ = TOP SHORTAGE, „TOP2“ / „TOP 2“ = zpracovat hned po TOP (2.32)
    const g=t(r,x.top),top2=/^top\s*-?\s*2\b/i.test(g);
    // barva výplně buňky EANu (2.61): vzorník po importu přiřadí barvám TOP / TOP 2
    const fill=shHex(r&&r[x.ean]&&r[x.ean].fill);
    if(fill)fills.set(fill,(fills.get(fill)||0)+1);
    items.push({order,name,ean,index,qty,top:!top2&&/^top\b/i.test(g),top2,op,link:shLink(raw),code,...(fill?{fill}:{})});
  });
  if(colors)shApplyColors(items,colors);
  const all=shTopFirst(items);
  return {items:all.slice(0,SH_MAX_ITEMS),more:Math.max(0,all.length-SH_MAX_ITEMS),header,top:items.filter(i=>i.top).length,top2:items.filter(i=>i.top2).length,warn,fills};
}

function shItemKey(i){i=i||{};return (shPlanKeyPart(i.ean)||"#"+shOpNorm(i.name))+"|"+shPlanKeyPart(i.index)+"|"+shPlanKeyPart(i.order);}

function shMergePlan(list,items,back){
  const left=new Map();
  ((list&&list.items)||[]).forEach(i=>{const k=shItemKey(i);left.set(k,(left.get(k)||0)+1);});
  const gone=new Set((list&&list.gone)||[]),out={add:[],have:0,gone:[]};
  (items||[]).forEach(i=>{
    const k=shItemKey(i),n=left.get(k)||0;
    if(n>0){left.set(k,n-1);out.have++;}
    else if(gone.has(k)&&!back)out.gone.push(i);
    else out.add.push(i);
  });
  return out;
}

function shTsv(text){
  const rows=[],s=String(text==null?"":text).replace(/\r\n?/g,"\n");
  let row=[],cell="",q=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(q){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}
    else if(ch==='"'&&cell==="")q=true;
    else if(ch==="\t"){row.push(cell);cell="";}
    else if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

const SH_SUB_OPS=["Broušení – hala 2","Brush Hala 2","Frézování Hala 2","Frézování VF-11","gravírování Hala 2","řez kotoučovou pilou 2","Odjehlení hala 2","Label Hala 2","Lepení 3M-Hala 2","Pískování – hala 2","Leštění – hala 2"];

function shOpNorm(s){return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[‐-―−_\-]+/g," ").replace(/\s+/g," ").trim();}

const SH_SUB_OPSET=new Set(SH_SUB_OPS.map(shOpNorm));

function shSubOp(op){return SH_SUB_OPSET.has(shOpNorm(op));}

function shPlanKeyPart(v){let s=String(v==null?"":v).replace(/\s+/g,"").toUpperCase();if(/^\d+$/.test(s))s=s.replace(/^0+(?=\d)/,"");return s;}

function shPlanKey(ean,index,order){return shPlanKeyPart(ean)+"|"+shPlanKeyPart(index)+"|"+shPlanKeyPart(order);}

function shPlanBlank(file){return {file:String(file||"").slice(0,160),at:Date.now(),sheet:"",total:0,rows:new Map(),other:new Map(),cands:new Map()};}

function shPlanRow(plan,a,e,h,m,op,link){
  if(!shPlanKeyPart(a)||!String(e==null?"":e).trim())return;
  const k=shPlanKey(a,h,m),t=String(link||"").trim();
  const row={ean:String(e).replace(/\s+/g," ").trim().slice(0,60),link:shLink(t),code:shCode(t),op:String(op==null?"":op).replace(/\s+/g," ").trim().slice(0,120)};
  if(!shSubOp(op)){
    plan.other.set(k,(plan.other.get(k)||0)+1);
    // poddíl s jinou operací čeká na poslední záznam; od 2.61 i bez kódu, ať je v rozboru celá sestava
    if(!plan.cands.has(k))plan.cands.set(k,[]);plan.cands.get(k).push(row);
    return;
  }
  if(!plan.rows.has(k))plan.rows.set(k,[]);
  plan.rows.get(k).push(row);
}

function shWpa(state){return /odeslano na wpa/.test(shOpNorm(state));}

function shApplyPlan(list,plan){
  const out={items:0,subs:0,noCode:0,other:0,cands:0,changed:0};
  let selfOps=[];
  const group=(rows,self)=>{
    const by=new Map();
    rows.forEach(r=>{
      if(shPlanKeyPart(r.ean)===self){if(r.op&&!selfOps.includes(r.op))selfOps.push(r.op);return;}   // sestava sama sebe není poddíl, její operace do rozboru (2.61)
      const key=shPlanKeyPart(r.ean)+"|"+r.code,x=by.get(key);
      if(x){if(r.op&&!x.ops.includes(r.op))x.ops.push(r.op);if(!x.link&&r.link)x.link=r.link;}
      else by.set(key,{ean:r.ean,link:r.link,code:r.code,ops:r.op?[r.op]:[]});
    });
    return by;
  };
  list.items.forEach(it=>{
    const k=shPlanKey(it.ean,it.index,it.order),rows=plan.rows.get(k)||[],self=shPlanKeyPart(it.ean);
    selfOps=[];
    const by=group(rows,self),cby=group((plan.cands&&plan.cands.get(k))||[],self);
    it.pop=selfOps.join(" · ").slice(0,300);
    const old=new Map((it.subs||[]).map(s=>[shPlanKeyPart(s.ean)+"|"+s.code,s]));
    by.forEach((x,key)=>cby.delete(key));
    // poddíl přidaný podle posledního záznamu zůstane, když ho plán pořád má
    old.forEach((s,key)=>{if(s.byRec&&cby.has(key)&&!by.has(key)){by.set(key,{...cby.get(key),byRec:true});cby.delete(key);}});
    if(!rows.length&&plan.other.get(k)&&![...by.values()].length)out.other++;
    const subs=[...by.entries()].slice(0,SH_MAX_SUBS).map(([key,x])=>{const p=old.get(key);return {id:p?p.id:"",ean:x.ean,link:x.link,code:x.code,op:x.ops.join(" · "),note:p?p.note:"",rec:p?p.rec:null,byRec:x.byRec===true,pdfHide:!!(p&&p.pdfHide)};});
    const sig=a=>JSON.stringify((a||[]).map(s=>[s.ean,s.code,s.op]));
    if(sig(subs)!==sig(it.subs))out.changed++;
    it.subs=subs;
    it.cands=[...cby.values()].slice(0,SH_MAX_CANDS).map(x=>({ean:x.ean,link:x.link,code:x.code,op:x.ops.join(" · ")}));
    out.cands+=it.cands.filter(c=>c.code).length;
    out.candsAll=(out.candsAll||0)+it.cands.length;
    if(subs.length){out.items++;out.subs+=subs.length;out.noCode+=subs.filter(s=>!s.code).length;}
  });
  return out;
}

function shEntry(list,id){
  for(const it of (list&&list.items)||[]){
    if(it.id===id)return {entry:it,item:it,sub:false};
    const s=(it.subs||[]).find(x=>x.id===id);
    if(s)return {entry:s,item:it,sub:true};
  }
  return null;
}

const SH_COLS={
  list:{order:"A",name:"B",ean:"C",index:"D",qty:"E",top:"G",op:"H"},
  plan:{asm:"A",sub:"E",index:"H",order:"M",op:"AM"},
  move:{code:"A",when:"B",qty:"C",state:"D",op:""},
};

const SH_COL_NEED={list:["ean"],plan:["asm","sub"],move:["code","when"]};

const SH_COL_NAMES={
  list:{order:"Číslo objednávky",name:"Název dílu",ean:"EAN (s odkazem, barva = TOP)",index:"Index",qty:"Urgentní množství",top:"TOP (text)",op:"Probíhající operace"},
  plan:{asm:"EAN sestavy",sub:"EAN poddílu (s odkazem)",index:"Index",order:"Číslo objednávky",op:"Probíhající operace"},
  move:{code:"QR kód",when:"Datum a čas",qty:"Počet ks",state:"Stav",op:"Operace / pracoviště"},
};

const SH_COL_WORDS={
  list:{order:/objedn|zakaz/,name:/nazev|popis|^dil\b/,ean:/\bean\b|carov/,index:/^index|^idx/,qty:/mnozstv|urgent|^ks\b|pocet/,top:/^top\b|priorit/,op:/operac|probih/},
  plan:{asm:/sestav/,sub:/poddil|komponent/,index:/^index|^idx/,order:/objedn|zakaz/,op:/probih|operac/},
  move:{code:/\bqr\b|barcode|^kod/,when:/datum|\bcas\b|time/,qty:/\bks\b|mnozstv|pocet/,state:/stav|status|udalost/,op:/operac|pracovist/},
};

const SH_TIERS=["top","top2","none"];

const SH_MAX_COLORS=40;

function shHex(v){const t=String(v==null?"":v).trim().replace(/^#/,"").toUpperCase();const h=/^[0-9A-F]{8}$/.test(t)?t.slice(2):t;return /^[0-9A-F]{6}$/.test(h)&&h!=="FFFFFF"?h:"";}

function shColLetter(v){const t=String(v==null?"":v).trim().toUpperCase();return /^[A-Z]{1,3}$/.test(t)?t:"";}

function shColsClean(kind,c){
  c=c&&typeof c==="object"?c:{};
  const out={};
  Object.keys(SH_COLS[kind]).forEach(f=>{out[f]=f in c?shColLetter(c[f]):SH_COLS[kind][f];});
  SH_COL_NEED[kind].forEach(f=>{if(!out[f])out[f]=SH_COLS[kind][f];});
  if(kind==="plan")out.sheet=String(c.sheet==null?"":c.sheet).replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,80);
  return out;
}

function shColIdx(kind,cols){
  const c=shColsClean(kind,cols||SH_COLS[kind]),out={};
  Object.keys(SH_COLS[kind]).forEach(f=>{out[f]=c[f]?waIndex(c[f]):-1;});
  return out;
}

function shColsOf(kind,sh){return shColsClean(kind,((sh||S.shortage||{}).cols||{})[kind]||SH_COLS[kind]);}

function shColsGuess(kind,aoa,base){
  const n=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const words=SH_COL_WORDS[kind],fields=Object.keys(words);
  let best={hits:0,row:-1,map:{}};
  (aoa||[]).slice(0,10).forEach((r,ri)=>{
    const map={},used=new Set();
    fields.forEach(f=>{
      const k=(r||[]).findIndex((v,ci)=>!used.has(ci)&&typeof v==="string"&&words[f].test(n(v)));
      if(k>=0){map[f]=colLetter(k);used.add(k);}
    });
    // „EAN sestavy“ a „EAN poddílu“: první EAN bez upřesnění je sestava, druhý poddíl
    if(kind==="plan"){
      const eans=(r||[]).map((v,ci)=>typeof v==="string"&&/\bean\b/.test(n(v))&&!used.has(ci)?ci:-1).filter(ci=>ci>=0);
      if(!map.asm&&eans.length){map.asm=colLetter(eans.shift());}
      if(!map.sub&&eans.length){map.sub=colLetter(eans.shift());}
    }
    if(kind==="move"&&!map.code){const ci=(r||[]).findIndex((v,c)=>!used.has(c)&&typeof v==="string"&&/\bean\b|kod/.test(n(v)));if(ci>=0)map.code=colLetter(ci);}
    const hits=Object.keys(map).length;
    if(hits>best.hits)best={hits,row:ri,map};
  });
  const cols=shColsClean(kind,{...shColsClean(kind,base||SH_COLS[kind]),...(best.hits>=2?best.map:{})});
  return {cols,header:best.hits>=2?best.row:-1,found:best.hits>=2?Object.keys(best.map):[]};
}

function shApplyColors(items,colors){
  (items||[]).forEach(i=>{
    const t=i.fill&&colors?colors[i.fill]:"";
    if(t==="top"){i.top=true;i.top2=false;}
    else if(t==="top2"&&!i.top)i.top2=true;
  });
  return items;
}

function shColorGuess(hex){
  const h=shHex(hex);if(!h)return "none";
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  if(r>=170&&g<=110&&b<=110)return "top";
  if(r>=200&&g>=110&&b<=120)return "top2";
  return "none";
}

const SH_INDEXED=("000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  +"800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF "
  +"000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
  +"3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333").split(" ");

function shIndexed(i){i=+i;return Number.isInteger(i)&&i>=0&&i<SH_INDEXED.length?SH_INDEXED[i]:"";}

function shAnalysis(it){
  const rec=it.rec||null;
  const subs=[...(it.subs||[]).map(s=>({ean:s.ean,code:s.code,op:s.op,rec:s.rec||null,hall:!s.byRec,byRec:!!s.byRec})),
    ...(it.cands||[]).map(c=>({ean:c.ean,code:c.code,op:c.op,rec:null,hall:false,byRec:false}))];
  const cur=it.op||it.pop||"";
  const recText=r=>[r.state,r.op&&!String(r.state||"").includes(r.op)?r.op:"",r.qty?(/^[\d\s.,]+$/.test(r.qty)?r.qty+" ks":r.qty):"",r.when].filter(Boolean).join(", ");
  const noRec=subs.filter(s=>!s.rec).length;
  const parts=[cur?"Probíhá: "+cur:"Probíhající operace neuvedena",
    rec?"poslední záznam: "+recText(rec)+(rec.n>1?" ("+rec.n+(rec.n<=4?" záznamy)":" záznamů)"):""):"bez interního záznamu"];
  if(subs.length)parts.push("poddíly "+subs.length+(noRec?" ("+noRec+" bez záznamu)":", všechny se záznamem"));
  return {cur,last:rec,internal:!!rec,subs,noRec,note:parts.join(" · ").slice(0,300),recText};
}

function shAnalysisSheet(l){
  const rows=[["#","Typ","TOP","Číslo objednávky","Název dílu","EAN","Index","Urgentní množství","QR kód","Probíhající operace","Poslední záznam: stav","Operace v záznamu","Ks v záznamu","Datum a čas záznamu","Počet záznamů","Interní záznam","Poznámka","Rozbor"]];
  (l&&l.items||[]).forEach((it,j)=>{
    const a=shAnalysis(it),r=it.rec||{};
    rows.push([j+1,a.subs.length?"sestava":"díl",it.top?"TOP SHORTAGE":it.top2?"TOP 2":"",it.order,it.name,it.ean,it.index,it.qty,it.code,a.cur,r.state||"",r.op||"",r.qty||"",r.when||"",r.n||(it.rec?1:0),it.rec?"ano":"ne",it.note||"",a.note]);
    a.subs.forEach((s,k)=>{const q=s.rec||{};rows.push([(j+1)+"."+(k+1),s.hall?"poddíl":"poddíl (jiná operace)","",it.order,"",s.ean,it.index,"",s.code,s.op,q.state||"",q.op||"",q.qty||"",q.when||"",q.n||(s.rec?1:0),s.rec?"ano":"ne","",""]);});
  });
  return {name:"Rozbor",rows,cols:[6,18,13,18,30,16,8,10,18,26,28,18,10,18,9,9,30,60]};
}

function shWhen(l){return shWhenText(l.at||0);}

function shItemsN(n){return n===1?"položka":n>=2&&n<=4?"položky":"položek";}

function shChanges(A,B,add){
  A=A||blankShortage();B=B||blankShortage();
  const ia=new Set(A.lists.map(l=>l.id)),ib=new Set(B.lists.map(l=>l.id));
  // oddělení a jejich operace (2.32)
  const da=new Map((A.depts||[]).map(d=>[d.id,d])),db=new Map((B.depts||[]).map(d=>[d.id,d]));
  db.forEach((d,id)=>{const p=da.get(id);if(!p)add("shortage","Shortage: nové oddělení "+d.name,{m:"shdp:"+id});else if(p.name!==d.name)add("shortage","Shortage: oddělení "+p.name+" přejmenováno na "+d.name,{m:"shdp:"+id});});
  da.forEach((d,id)=>{if(!db.has(id))add("shortage","Shortage: smazáno oddělení "+d.name,{m:"shdx:"+id});});
  const opA=new Map(),opB=new Map();
  (A.depts||[]).forEach(d=>d.ops.forEach(o=>opA.set(o.key,{d,o})));(B.depts||[]).forEach(d=>d.ops.forEach(o=>opB.set(o.key,{d,o})));
  opB.forEach((x,k)=>{const p=opA.get(k);if(!p||p.d.id!==x.d.id)add("shortage","Shortage: operace "+x.o.label+" patří do oddělení "+x.d.name,{m:"shdo:"+k});});
  opA.forEach((x,k)=>{if(!opB.has(k)&&db.has(x.d.id))add("shortage","Shortage: operace "+x.o.label+" už nepatří do žádného oddělení",{m:"shdo:"+k});});
  // sloupce importů a barvy EANu (2.61)
  const KIND={list:"urgentních dílů",plan:"výrobního plánu",move:"evidence pohybu"};
  Object.keys(KIND).forEach(k=>{
    const a=(A.cols||{})[k],b=(B.cols||{})[k];
    if(b&&JSON.stringify(a||null)!==JSON.stringify(b))add("shortage","Shortage: sloupce "+KIND[k]+": "+Object.keys(SH_COL_NAMES[k]).filter(f=>b[f]).map(f=>SH_COL_NAMES[k][f].split(" (")[0]+" "+b[f]).join(", ")+(b.sheet?", list "+b.sheet:""),{m:"shc:"+k});
  });
  const TIER={top:"TOP SHORTAGE",top2:"TOP 2",none:"běžná shortage"};
  Object.keys(B.colors||{}).forEach(h=>{if((A.colors||{})[h]!==B.colors[h])add("shortage","Shortage: barva EANu #"+h+" = "+TIER[B.colors[h]],{m:"shk:"+h});});
  B.lists.forEach(l=>{const o=A.lists.find(x=>x.id===l.id);if(o&&l.moves&&JSON.stringify(o.moves||null)!==JSON.stringify(l.moves))add("shortage","Shortage: evidence pohybu "+(l.moves.file||"")+" u seznamu "+shWhen(l)+" ("+l.moves.rows+" záznamů)",{m:"shv:"+l.id+":"+l.moves.at});});
  const what=l=>{const n=l.items.length,top=l.items.filter(i=>i.top).length;return " ("+n+" "+shItemsN(n)+(top?", z toho "+top+" TOP":"")+(l.file?", "+l.file:"")+")";};
  B.lists.forEach(l=>{if(!ia.has(l.id))add("shortage","Shortage: nahrán seznam "+shWhen(l)+what(l),{m:"shl:"+l.id});});
  // smazání má vlastní klíč, ať v historii zůstane i záznam o nahrání
  A.lists.forEach(l=>{if(!ib.has(l.id))add("shortage","Shortage: smazán seznam "+shWhen(l)+what(l),{m:"shd:"+l.id});});
  // úpravy položek seznamu (2.28): odebrání, poznámka, poslední záznamy, pořadí; poddíly z plánu (2.29)
  B.lists.forEach(l=>{
    const o=A.lists.find(x=>x.id===l.id);
    if(!o)return;
    const label=i=>((i.ean||"")+" "+(i.name||"")).trim()||"bez názvu",ol=o.items.map(i=>i.id),nl=l.items.map(i=>i.id);
    const oi=new Map(o.items.map(i=>[i.id,i])),ni=new Map(l.items.map(i=>[i.id,i]));
    const subsOf=list=>new Map(list.items.flatMap(i=>(i.subs||[]).map(x=>[x.id,{s:x,i}])));
    const os=subsOf(o),ns=subsOf(l),planChanged=JSON.stringify(o.plan||null)!==JSON.stringify(l.plan||null);
    o.items.forEach(i=>{if(!ni.has(i.id))add("shortage","Shortage: ze seznamu "+shWhen(l)+" odebrána položka "+label(i),{m:"shr:"+l.id+":"+i.id});});
    // doplnění chybějících (2.36)
    const fresh=l.items.filter(i=>!oi.has(i.id));
    if(fresh.length)add("shortage","Shortage: do seznamu "+shWhen(l)+" doplněn"+(fresh.length===1?"a ":fresh.length<=4?"y ":"o ")+fresh.length+" "+shItemsN(fresh.length)+": "+fresh.slice(0,5).map(label).join(", ")+(fresh.length>5?" …":""),{m:"shm:"+l.id+":"+fresh[0].id});   // každé doplnění zvlášť
    l.items.forEach(i=>{
      const p=oi.get(i.id);
      if(p&&(p.note||"")!==(i.note||""))add("shortage",i.note?"Shortage: poznámka k položce "+label(i)+" (seznam "+shWhen(l)+"): "+i.note:"Shortage: smazána poznámka k položce "+label(i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+i.id});
    });
    if(planChanged&&l.plan){
      const n=l.items.reduce((a,i)=>a+(i.subs||[]).length,0),k=l.items.filter(i=>(i.subs||[]).length).length;
      add("shortage","Shortage: poddíly z výrobního plánu "+(l.plan.file||"")+" u seznamu "+shWhen(l)+": "+n+" "+(n===1?"poddíl":n>=2&&n<=4?"poddíly":"poddílů")+" u "+k+" "+(k===1?"sestavy":"sestav"),{m:"shp:"+l.id});
    }else{
      os.forEach((x,id)=>{if(ni.has(x.i.id)&&!ns.has(id))add("shortage","Shortage: odebrán poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shr:"+l.id+":"+id});});
      ns.forEach((x,id)=>{if(oi.has(x.i.id)&&!os.has(id)&&x.s.byRec)add("shortage","Shortage: podle posledního záznamu přidán poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"sha:"+l.id+":"+id});});
    }
    ns.forEach((x,id)=>{
      const p=os.get(id);
      if(p&&(p.s.note||"")!==(x.s.note||""))add("shortage",x.s.note?"Shortage: poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+"): "+x.s.note:"Shortage: smazána poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+id});
    });
    // ruční TOP SHORTAGE a plné zobrazení sestavy (2.31)
    const tier=i=>i.top?" ručně označena jako TOP SHORTAGE":i.top2?" označena jako TOP 2 (zpracovat hned po TOP shortage)":"";
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(!!p.top!==!!i.top||!!p.top2!==!!i.top2))add("shortage","Shortage: položka "+label(i)+(tier(i)||(p.top?" už není TOP SHORTAGE":" už není TOP 2"))+" (seznam "+shWhen(l)+")",{m:"sht:"+l.id+":"+i.id});});
    // ruční přesun do oddělení (2.32)
    const dName=id=>id==="-"?"nezařazeno":((B.depts||[]).find(d=>d.id===id)||{}).name||"oddělení";
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(p.dept||"")!==(i.dept||""))add("shortage","Shortage: položka "+label(i)+(i.dept?" ručně přesunuta: "+dName(i.dept):" zase v oddělení podle operace")+" (seznam "+shWhen(l)+")",{m:"shdi:"+l.id+":"+i.id});});
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&!!p.full!==!!i.full)add("shortage","Shortage: sestava "+label(i)+(i.full?" zobrazena plně (QR kód, záznam, kolonky)":" zase jen orientačně")+" (seznam "+shWhen(l)+")",{m:"shf:"+l.id+":"+i.id});});
    // skrytí v PDF (2.29.1)
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(p.st||"")!==(i.st||""))add("shortage","",{m:"shst:"+l.id+":"+i.id,p:"Shortage: položka "+label(i)+" – stav: ",v0:shStName(p.st)||"bez stavu",v1:shStName(i.st)||"bez stavu"});});
    ns.forEach((x,id)=>{const p=os.get(id);if(p&&(p.s.st||"")!==(x.s.st||""))add("shortage","",{m:"shst:"+l.id+":"+id,p:"Shortage: poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" – stav: ",v0:shStName(p.s.st)||"bez stavu",v1:shStName(x.s.st)||"bez stavu"});});
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&!!p.pdfHide!==!!i.pdfHide)add("shortage","Shortage: položka "+label(i)+(i.pdfHide?" skryta v PDF":" znovu v PDF")+" (seznam "+shWhen(l)+")",{m:"shh:"+l.id+":"+i.id});});
    ns.forEach((x,id)=>{const p=os.get(id);if(p&&!!p.s.pdfHide!==!!x.s.pdfHide)add("shortage","Shortage: poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+(x.s.pdfHide?" skryt v PDF":" znovu v PDF")+" (seznam "+shWhen(l)+")",{m:"shh:"+l.id+":"+id});});
    const recN=l.items.filter(i=>oi.has(i.id)&&JSON.stringify(oi.get(i.id).rec||null)!==JSON.stringify(i.rec||null)).length
      +[...ns.entries()].filter(([id,x])=>os.has(id)&&JSON.stringify(os.get(id).s.rec||null)!==JSON.stringify(x.s.rec||null)).length;
    if(recN)add("shortage","Shortage: poslední záznamy u "+recN+" "+(recN===1?"položky":"položek")+" seznamu "+shWhen(l),{m:"shz:"+l.id});
    // přesun kvůli změně TOP se jako změna pořadí nepočítá
    const keep=id=>oi.has(id)&&ni.has(id)&&shRank(oi.get(id))===shRank(ni.get(id))&&(oi.get(id).dept||"")===(ni.get(id).dept||"");
    if(ol.filter(keep).join()!==nl.filter(keep).join())add("shortage","Shortage: změněno pořadí položek v seznamu "+shWhen(l),{m:"sho:"+l.id});
  });
}
