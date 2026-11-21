export const VERSION = 1;
export const STORAGE_KEY = 'hash-infinity-state-v1';
export const DEFAULT_STATE = Object.freeze({
  version: VERSION,
  profile: { name: 'Explorer', theme: 'dark', pinned: ['assistant','tasks','notes','calculator','focus','study'] },
  tasks: [], notes: [], plans: [], expenses: [], habits: [], flashcards: [], bookmarks: [],
  trades: [], quotes: {}, sessions: []
});
export const clone = value => JSON.parse(JSON.stringify(value));
export function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function newId(){return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function validHttpUrl(input){try{const u=new URL(input);return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;}catch{return null;}}
export function safeImport(raw){
  const s=typeof raw==='string'?JSON.parse(raw):raw;
  if(!s || typeof s!=='object' || Array.isArray(s) || s.version !== VERSION) throw new Error('Backup version not supported.');
  const next=clone(DEFAULT_STATE);
  if(s.profile && typeof s.profile==='object'){
    next.profile.name=String(s.profile.name ?? 'Explorer').slice(0,40);
    next.profile.theme=s.profile.theme==='light'?'light':'dark';
    next.profile.pinned=Array.isArray(s.profile.pinned)?s.profile.pinned.filter(x=>typeof x==='string').slice(0,32):next.profile.pinned;
  }
  for(const key of ['tasks','notes','plans','expenses','habits','flashcards','bookmarks','trades','sessions']){
    if(!Array.isArray(s[key])) continue;
    next[key]=s[key].slice(0,3000).filter(x=>x && typeof x==='object' && !Array.isArray(x)).map(x=>{
      const rec={};for(const [k,v] of Object.entries(x).slice(0,24)){
        if(['__proto__','prototype','constructor'].includes(k))continue;
        if(typeof v==='string')rec[k]=v.slice(0,30000);
        else if(typeof v==='number' && Number.isFinite(v))rec[k]=v;
        else if(typeof v==='boolean')rec[k]=v;
      }return rec;
    });
  }
  if(s.quotes && typeof s.quotes==='object' && !Array.isArray(s.quotes)){
    for(const [k,v] of Object.entries(s.quotes).slice(0,300)) if(/^[A-Z0-9.\-]{1,12}$/.test(k) && Number.isFinite(v) && v>0)next.quotes[k]=v;
  }
  return next;
}
export function formatMoney(value,currency='AED'){
  const n=Number(value);return (Number.isFinite(n)?n:0).toLocaleString('en-AE',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2});
}
export function todayKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function calc(input){
  const expression=String(input).replace(/×/g,'*').replace(/÷/g,'/');
  if(expression.length>150 || !/^[\d\s.+\-*/%^()]+$/.test(expression))throw new Error('Invalid expression.');
  let pos=0; const s=expression.replace(/\s+/g,'');
  const eat=x=>s[pos]===x?(pos++,true):false;
  function primary(){
    if(eat('(')){const v=add();if(!eat(')'))throw new Error('Missing closing bracket.');return v;}
    const m=s.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?/);
    if(!m)throw new Error('Expected a number.');pos+=m[0].length;return Number(m[0]);
  }
  function unary(){if(eat('+'))return unary();if(eat('-'))return -unary();return power();}
  function power(){let v=primary();if(eat('^'))v=Math.pow(v,unary());return v;}
  function mul(){let v=unary();while(true){if(eat('*'))v*=unary();else if(eat('/'))v/=unary();else if(eat('%'))v%=unary();else break;}return v;}
  function add(){let v=mul();while(true){if(eat('+'))v+=mul();else if(eat('-'))v-=mul();else break;}return v;}
  const result=add();if(pos!==s.length||!Number.isFinite(result))throw new Error('Cannot calculate this expression.');return result;
}
export const UNIT_GROUPS={
 length:{m:1,km:1000,cm:0.01,mm:0.001,mi:1609.344,ft:0.3048,in:0.0254},
 mass:{kg:1,g:0.001,mg:0.000001,lb:0.45359237,oz:0.028349523125},
 speed:{'m/s':1,'km/h':1/3.6,mph:0.44704,knots:0.514444},
 data:{B:1,KB:1000,MB:1e6,GB:1e9,KiB:1024,MiB:1048576,GiB:1073741824},
 temperature:{'°C':1,'°F':1,K:1}
};
export function convert(value,category,from,to){
  const v=Number(value);if(!Number.isFinite(v))throw new Error('Enter a valid number.');
  const units=UNIT_GROUPS[category];if(!units || !(from in units)||!(to in units))throw new Error('Unknown units.');
  if(category==='temperature'){
    const c=from==='°C'?v:from==='°F'?(v-32)*5/9:v-273.15;
    return to==='°C'?c:to==='°F'?c*9/5+32:c+273.15;
  }
  return v*units[from]/units[to];
}
export function humanNum(value){return Number.isFinite(value)?Number(value.toPrecision(10)).toLocaleString('en-US',{maximumFractionDigits:10}):'—';}
export function portfolio(trades,quotes){
  const positions={};let cash=10000;
  for(const trade of trades){
    const ticker=String(trade.ticker||'').toUpperCase(); const qty=Number(trade.qty); const price=Number(trade.price);
    if(!ticker || !(qty>0) || !(price>0) || !['buy','sell'].includes(trade.side))continue;
    const p=positions[ticker]??{qty:0,cost:0};
    if(trade.side==='buy'){cash-=qty*price;p.qty+=qty;p.cost+=qty*price;}
    else if(p.qty>=qty){cash+=qty*price;const avg=p.qty?p.cost/p.qty:0;p.qty-=qty;p.cost-=qty*avg;}
    positions[ticker]=p;
  }
  const active=Object.entries(positions).filter(([,p])=>p.qty>0.0000001).map(([ticker,p])=>({ticker,qty:p.qty,average:p.cost/p.qty,mark:Number(quotes[ticker])||p.cost/p.qty}));
  const equity=cash+active.reduce((sum,p)=>sum+p.qty*p.mark,0);
  return {cash,equity,positions:active};
}
export function randomPassword(length=20,alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'){
  if(!globalThis.crypto?.getRandomValues)throw new Error('Secure random generation is unavailable.');
  if(!Number.isInteger(length)||length<8||length>128||alphabet.length<2||alphabet.length>256)throw new Error('Invalid password options.');
  const bytes=new Uint8Array(Math.max(64,length*2));let out=''; const limit=Math.floor(256/alphabet.length)*alphabet.length;
  while(out.length<length){globalThis.crypto.getRandomValues(bytes);for(const b of bytes){if(b<limit){out+=alphabet[b%alphabet.length];if(out.length===length)break;}}}
  return out;
}
export function monthExpenses(items,date=new Date()){
  const key=todayKey(date).slice(0,7);return items.filter(x=>String(x.date||'').startsWith(key)).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
}
