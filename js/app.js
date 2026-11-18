(function(){
"use strict";
const START=50,MAX_BETS=80,SCORE_BONUS=30,MSG_MAX=400;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LEAGUES=[
 {id:"CL",name:"Ligue des champions",flag:"radial-gradient(circle,#fff 30%,#0B1E5B 32%)"},
 {id:"L1",name:"Ligue 1",flag:"linear-gradient(90deg,#1F3FA8 33%,#fff 33% 66%,#D3272E 66%)"},
 {id:"PL",name:"Premier League",flag:"linear-gradient(#fff 40%,#C8102E 40% 60%,#fff 60%)"},
 {id:"LL",name:"LaLiga",flag:"linear-gradient(#AA151B 25%,#F1BF00 25% 75%,#AA151B 75%)"},
 {id:"BL",name:"Bundesliga",flag:"linear-gradient(#111 33%,#DD0000 33% 66%,#FFCE00 66%)"},
 {id:"SA",name:"Serie A",flag:"linear-gradient(90deg,#009246 33%,#fff 33% 66%,#CE2B37 66%)"}];
const LG=Object.fromEntries(LEAGUES.map(l=>[l.id,l]));
const tz="Europe/Paris";
const fTime=new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit",timeZone:tz});
const fDay=new Intl.DateTimeFormat("fr-FR",{weekday:"short",timeZone:"UTC"});
const fLong=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"});
const fDT=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:tz});
const parisDay=ms=>new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(ms);
const today=()=>parisDay(Date.now());
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function crest(name,cls=""){const h=hash(name)%360;const ini=name.replace(/^(FC|AS|AC|SS|US|RC|OGC|SC|VfB|VfL|TSG|1\.|RCD|CA|CD|SL|SK|FK|NK|AFC|Real|Racing|Stade|Club|Olympique)\s+/i,"").replace(/[^A-Za-zÀ-ÿ ]/g,"").trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();return`<i class="crest ${cls}" style="background:radial-gradient(circle at 32% 26%,hsl(${h} 75% 64%),hsl(${h} 62% 34%) 72%)" aria-hidden="true">${esc(ini||"?")}</i>`}
const short=n=>{const p=String(n).split(" ");return p.length>1?p.slice(-1)[0]:n};
const NICK={"Paris Saint-Germain FC":"PSG","Olympique de Marseille":"OM","Olympique Lyonnais":"OL","Manchester City FC":"Man City","Manchester United FC":"Man Utd","FC Internazionale Milano":"Inter","Club Atlético de Madrid":"Atlético","FC Bayern München":"Bayern","Real Madrid CF":"Real Madrid","FC Barcelona":"Barça","Borussia Dortmund":"Dortmund","Borussia Mönchengladbach":"Gladbach","Bayer 04 Leverkusen":"Leverkusen","Tottenham Hotspur FC":"Tottenham","Brighton & Hove Albion FC":"Brighton","Real Betis Balompié":"Betis","Real Sociedad de Fútbol":"Real Sociedad","Racing Club de Lens":"Lens","Stade Rennais FC 1901":"Rennes","RC Strasbourg Alsace":"Strasbourg","Stade Brestois 29":"Brest","AS Monaco FC":"Monaco","Aston Villa FC":"Aston Villa","Newcastle United FC":"Newcastle","Nottingham Forest FC":"Forest","Crystal Palace FC":"Palace","Rayo Vallecano de Madrid":"Rayo","RCD Espanyol de Barcelona":"Espanyol","RC Deportivo La Coruña":"Deportivo","Real Racing Club de Santander":"Racing","Eintracht Frankfurt":"Francfort","TSG 1899 Hoffenheim":"Hoffenheim","SV Werder Bremen":"Brême","1. FC Union Berlin":"Union Berlin","Hamburger SV":"Hambourg","SC Paderborn 07":"Paderborn","SV 07 Elversberg":"Elversberg","Paris FC":"Paris FC","Lille OSC":"Lille","Le Havre AC":"Le Havre","Le Mans FC":"Le Mans","Angers SCO":"Angers","Coventry City FC":"Coventry","Hull City AFC":"Hull","Ipswich Town FC":"Ipswich","Leeds United FC":"Leeds","RC Celta de Vigo":"Celta","Sevilla FC":"Séville","West Ham United FC":"West Ham","Wolverhampton Wanderers FC":"Wolves","Club Brugge":"Bruges","Bodø/Glimt":"Bodø"};
const STRIP=/^(FC|CF|AFC|SC|AC|AS|SSC|BC|CFC|FK|SK|US|SS|OGC|RC|RCD|CA|UD|VfB|VfL|1\.|Calcio|Club|de|del|\d+)$/i;
const tshort=n=>{if(NICK[n])return NICK[n];const p=String(n).split(" ").filter(w=>!STRIP.test(w));return p.length?p[p.length-1]:n};

const MK2={"HO05":"Dom. marque","HO15":"Dom. +1,5 buts","AO05":"Ext. marque","AO15":"Ext. +1,5 buts","TG0":"0 but","TG1":"1 but","TG2":"2 buts","TG3":"3 buts","TG4":"4 buts ou +","ODD":"Total impair","EVEN":"Total pair"};
const MK={"1":"1","X":"N","2":"2","1X":"1 ou N","12":"1 ou 2","X2":"N ou 2","O15":"+1,5 buts","U15":"−1,5 buts","O25":"+2,5 buts","U25":"−2,5 buts","O35":"+3,5 buts","U35":"−3,5 buts","BY":"Les 2 marquent","BN":"Pas les 2"};
function pickLabel(m,k){
  if(k==="1")return"Victoire "+m.h; if(k==="2")return"Victoire "+m.a; if(k==="X")return"Match nul";
  if(k==="HC1")return m.h+" gagne de 2 buts ou +"; if(k==="HC2")return m.a+" gagne de 2 buts ou +";
  if(k==="W1N")return m.h+" gagne sans encaisser"; if(k==="W2N")return m.a+" gagne sans encaisser";
  if(k==="1BY")return m.h+" gagne et les 2 marquent"; if(k==="2BY")return m.a+" gagne et les 2 marquent"; if(k==="XBY")return"Nul et les 2 marquent";
  if(k==="HO05")return m.h+" marque"; if(k==="HO15")return m.h+" marque 2 buts ou +"; if(k==="AO05")return m.a+" marque"; if(k==="AO15")return m.a+" marque 2 buts ou +";
  if(MK2[k])return MK2[k]+" dans le match";
  if(k==="1X")return m.h+" ou nul"; if(k==="X2")return"Nul ou "+m.a; if(k==="12")return"Pas de nul";
  if(k.startsWith("CS:"))return"Score exact "+k.slice(3); if(k.startsWith("SC:"))return k.slice(5)+" marque"; if(k.startsWith("PD:"))return k.slice(5)+" fait une passe décisive";
  return MK[k]||k;
}
function legResult(k,m){
  if(m.st==="PST"||m.st==="CANC")return"void";
  if(m.st!=="FT"||!m.sc)return null;
  const [h,a]=m.sc;
  if(k.startsWith("CS:")){const [x,y]=k.slice(3).split("-").map(Number);return h===x&&a===y?"won":"lost"}
  if(k.startsWith("SC:")||k.startsWith("PD:")){
    const list=k.startsWith("SC:")?(m.ev||null):(m.as||null),side=k[3],name=pnorm(k.slice(5));
    if(h+a===0)return"lost";
    if(!list||(!list.length&&k.startsWith("SC:"))){return (Date.now()-m.k>3*86400000)?"void":null}
    return list.some(e=>!e.og&&e.t===side&&pnorm(e.n)===name)?"won":"lost";
  }
  const t=h+a,r={"HC1":h-a>=2,"HC2":a-h>=2,"HO05":h>=1,"HO15":h>=2,"AO05":a>=1,"AO15":a>=2,"W1N":h>a&&a===0,"W2N":a>h&&h===0,"1BY":h>a&&a>0,"XBY":h===a&&h>0,"2BY":a>h&&h>0,"TG0":t===0,"TG1":t===1,"TG2":t===2,"TG3":t===3,"TG4":t>=4,"ODD":t%2===1,"EVEN":t%2===0,"1":h>a,"X":h===a,"2":h<a,"1X":h>=a,"12":h!==a,"X2":h<=a,"O15":t>1.5,"U15":t<1.5,"O25":t>2.5,"U25":t<2.5,"O35":t>3.5,"U35":t<3.5,"BY":h>0&&a>0,"BN":!(h>0&&a>0)}[k];
  return r===undefined?"void":r?"won":"lost";
}
const pnorm=n=>String(n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g," ").trim().split(/\s+/).pop();
function oddOf(m,k){if(m&&k.startsWith("PD:")){const s=((m.assists||{})[k[3]]||[]).find(p=>p.n===k.slice(5));return s?s.o:null}if(!m||!m.odds)return null;if(k.startsWith("CS:"))return(m.odds.CS||{})[k.slice(3)]||null;if(k.startsWith("SC:")){const s=((m.scorers||{})[k[3]]||[]).find(p=>p.n===k.slice(5));return s?s.o:null}return m.odds[k]||null}
function isReal(m,k){return (m.real||[]).includes(k)||(k.startsWith("SC:")&&(((m.scorers||{})[k[3]]||[]).find(p=>p.n===k.slice(5))||{}).r)}
/* Betting closes at kickoff; status from data, corrected by the clock when the sync is behind */
function phase(m,now=Date.now()){
  if(m.st==="FT")return"done"; if(m.st==="PST"||m.st==="CANC")return"off";
  if(m.st==="LIVE"||m.st==="HT")return"live";
  if(now>=m.k)return now<m.k+2.2*3600000?"live":"wait";
  if(m.lock&&now>=m.lock)return"locked";
  return"open";
}

/* ---------- State ---------- */
const S={view:"matchs",league:"ALL",day:today(),meta:null,days:{},daySub:null,detail:null,sheetTab:"paris",
  slip:[],stake:5,slipOpen:false,uid:null,db:null,user:null,canWrite:true,mode:"loading",
  me:freshPlayer(),groupsMeta:{},activeGroup:null,members:[],unsub:null,chatUnsub:null,messages:[],names:{},betsTab:"pending",
  pen:null,wheelBusy:false,wheelRot:0,chatDraft:"",unread:0};
function freshPlayer(){return{balance:START,bets:[],groups:[],picks:{},lastSpin:"",lastRescue:"",pseudo:"",stats:{won:0,lost:0,best:0,games:0},createdAt:Date.now()}}
function normalize(p){const f=freshPlayer();return Object.assign(f,p||{},{stats:Object.assign(f.stats,(p&&p.stats)||{}),picks:(p&&p.picks)||{},groups:(p&&p.groups)||[],bets:(p&&p.bets)||[]})}
let saving=false,dirty=false;
function scoreOf(p){return (Number(p.balance)||0)+(p.lbets||[]).filter(b=>b.status==="pending").reduce((a,b)=>a+(Number(b.stake)||0),0)+(p.bets||[]).filter(b=>b.status==="pending").reduce((a,b)=>a+(Number(b.stake)||0),0)}
async function save(){
  S.me.updatedAt=Date.now();S.me.score=scoreOf(S.me);
  if(S.me.bets.length>MAX_BETS){const pend=S.me.bets.filter(b=>b.status==="pending"),done=S.me.bets.filter(b=>b.status!=="pending");S.me.bets=pend.concat(done.slice(0,Math.max(0,MAX_BETS-pend.length)))}
  if(S.mode!=="cloud")return;
  if(saving){dirty=true;return}
  saving=true;
  try{await S.db.doc("players/"+S.uid).set(JSON.parse(JSON.stringify(S.me)))}
  catch(e){toast(e&&e.code==="permission_denied"?"Tu peux regarder mais pas jouer : demande l'accès « interagir » au propriétaire.":"Sauvegarde impossible pour l'instant, réessaie.")}
  saving=false;if(dirty){dirty=false;save()}
}
let tt;function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(tt);tt=setTimeout(()=>el.hidden=true,3400)}

/* ---------- Data access ---------- */
function findMatch(d,id){const doc=S.days[d];const m=doc&&doc.matches.find(m=>m.id===id);if(m)return m;
  for(const k in S.days){const x=S.days[k].matches.find(m=>m.id===id);if(x)return x}return null}
const shiftDay=(d,n)=>{const t=new Date(d+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
function watchDay(d){
  if(S.daySub){S.daySub();S.daySub=null}
  if(!S.db)return;
  let t=setTimeout(()=>{if(!S.days[d]){S.dayErr=d;renderMatchs()}},10000);
  S.daySub=S.db.doc("days/"+d).onSnapshot(snap=>{clearTimeout(t);S.dayErr=null;S.days[d]=snap.exists?snap.data():{date:d,matches:[]};settle();renderMatchs();if(S.view==="jeux")renderJeux()},
    ()=>{clearTimeout(t);S.dayErr=d;renderMatchs()});
}
async function loadDays(list){
  await Promise.all([...new Set(list)].filter(d=>d&&!S.days[d]).map(async d=>{try{const s=await S.db.doc("days/"+d).get();S.days[d]=s.exists?s.data():{date:d,matches:[]}}catch(e){}}));
}
async function refreshPendingDays(){
  if(!S.db)return;
  const ds=new Set();S.me.bets.forEach(b=>b.status==="pending"&&b.legs.forEach(l=>{if(l.d)[-2,-1,0,1,2].forEach(n=>ds.add(shiftDay(l.d,n)))}));Object.keys(S.me.picks).forEach(id=>{const p=S.me.picks[id];if(!p.settled&&p.d)ds.add(p.d)});
  await Promise.all([...ds].filter(d=>d!==S.day).map(async d=>{try{const s=await S.db.doc("days/"+d).get();if(s.exists)S.days[d]=s.data()}catch(e){}}));
  if(settle())renderAll();
}

/* ---------- Settlement ---------- */
function settle(){
  let changed=false,gain=0;
  S.me.bets.forEach(b=>{
    if(b.status!=="pending")return;
    let lost=false,all=true;
    b.legs.forEach(l=>{
      if(l.res)return; if(!l.d){l.res="void";return}
      const m=findMatch(l.d,l.mid);
      if(!m){const doc=S.days[l.d];if(doc&&l.k&&Date.now()>l.k+6*3600000){l.res="void";changed=true}else all=false;return}
      const r=legResult(l.mk,m);if(!r){all=false;return}l.res=r;changed=true;
    });
    b.legs.forEach(l=>{if(l.res==="lost")lost=true;if(!l.res)all=false});
    if(lost){b.status="lost";b.payout=0;S.me.stats.lost++;changed=true}
    else if(all){
      const live=b.legs.filter(l=>l.res==="won");
      if(!live.length){b.status="void";b.payout=b.stake}else{b.status="won";b.payout=Math.floor(b.stake*live.reduce((a,l)=>a*l.odd,1));S.me.stats.won++;S.me.stats.best=Math.max(S.me.stats.best,b.odds)}
      S.me.balance+=b.payout;gain+=b.payout;changed=true;
    }
  });
  Object.entries(S.me.picks).forEach(([id,p])=>{
    if(p.settled||!p.d)return;const m=findMatch(p.d,id);if(!m)return;
    if(m.st==="PST"||m.st==="CANC"){p.settled=true;p.won=false;changed=true;return}
    if(m.st!=="FT"||!m.sc)return;
    p.settled=true;p.won=m.sc[0]===p.h&&m.sc[1]===p.a;if(p.won){S.me.balance+=SCORE_BONUS;gain+=SCORE_BONUS}changed=true;
  });
  const lg=GAMES?GAMES.settle():0;
  if(lg){changed=true;if(lg>=1){gain+=lg;toast("Loto Foot 7 : +"+lg+" pts !")}}
  if(changed){save();if(gain)toast("Paris réglés : +"+gain+" pts");}
  return changed;
}

/* ---------- Matches ---------- */
function dayList(){return S.meta?Object.keys(S.meta.days).sort():[]}
function visibleDays(){const all=dayList();return S.league==="ALL"?all:all.filter(d=>S.meta.days[d][1].includes(S.league))}
function nearestDay(list){const t=today();return list.find(d=>d>=t)||list[list.length-1]||t}
function oddBtn(m,k,label,ph){
  const o=oddOf(m,k);if(!o)return"";
  const sel=S.slip.some(s=>s.mid===m.id&&s.mk===k),won=ph==="done"&&legResult(k,m)==="won";
  return`<button class="odd${won?" won":""}" ${ph!=="open"?"disabled":""} data-mid="${esc(m.id)}" data-d="${esc(S.detail?S.detailDay:S.day)}" data-mk="${esc(k)}" aria-pressed="${sel}" title="${esc(pickLabel(m,k))}${isReal(m,k)?" · cote réelle":""}"><small>${esc(label)}</small><b class="num">${o.toFixed(2)}</b></button>`;
}
function statusTag(m,ph){
  if(ph==="open")return`<span>${m.tbc?"Horaire à confirmer":fTime.format(m.k)}</span>`;
  if(ph==="live")return`<span class="pill live">${m.st==="HT"?"Mi-temps":m.min?"Direct "+m.min+"'":"En cours"}</span>`;
  if(ph==="wait")return`<span class="pill">Résultat en attente</span>`;
  if(ph==="locked")return`<span class="pill">Horaire à confirmer · paris fermés</span>`;
  if(ph==="off")return`<span class="pill">${m.st==="PST"?"Reporté":"Annulé"}</span>`;
  return`<span class="pill">Terminé</span>`;
}
function renderMatchs(){
  const v=$("#v-matchs");
  if(S.detail)return renderSheet();
  const modeSeg=`<div class="seg glass mode-seg"><button data-mmode="foot" aria-pressed="${S.matchMode!=="live"}">⚽ Matchs réels</button><button data-mmode="live" aria-pressed="${S.matchMode==="live"}">⚡ Live flash</button></div>`;
  if(S.matchMode==="live"&&LIVE&&S.mode==="cloud"){v.innerHTML=modeSeg+LIVE.render();return}
  if(S.mode==="local"){v.innerHTML=`<div><h2>Les matchs</h2></div><div class="glass panel empty">Vprono n'arrive pas à joindre le serveur. Vérifie ta connexion internet puis relance l'appli.</div>`;return}
  if(!S.meta){v.innerHTML=`<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>${S.metaErr?`<p class="note">Le calendrier n'est pas joignable pour l'instant. Réessaie dans un moment.</p>`:""}`;return}
  const days=visibleDays();if(!days.includes(S.day))S.day=nearestDay(days);
  const t=today(),doc=S.days[S.day],now=Date.now();
  let h=modeSeg+boostCard()+`<div class="row-between"><div><h2>${esc(fLong.format(Date.parse(S.day+"T12:00:00Z")))}</h2><p class="sub">${S.day===t?"Aujourd'hui · ":""}Touche une cote pour l'ajouter au ticket, ou « + paris » pour les buteurs et les compos.</p></div></div>
  <div class="chips" role="group" aria-label="Compétition"><button data-lg="ALL" aria-pressed="${S.league==="ALL"}">Toutes</button>${LEAGUES.map(l=>`<button data-lg="${l.id}" aria-pressed="${S.league===l.id}"><span class="flag" style="background:${l.flag}"></span>${l.name}</button>`).join("")}</div>
  <div class="days"><button class="arrow" data-shift="-1" aria-label="Jour précédent">‹</button><div class="strip" id="strip">${days.map(d=>{const dt=Date.parse(d+"T12:00:00Z"),n=S.meta.days[d][0];return`<button data-day="${d}" aria-pressed="${d===S.day}" class="${d===t?"today":""}"><small>${d===t?"Auj.":fDay.format(dt).replace(".","")}</small><b class="num">${d.slice(8)}</b><i>${["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"][Number(d.slice(5,7))-1]} · ${n}</i></button>`}).join("")}</div><button class="arrow" data-shift="1" aria-label="Jour suivant">›</button></div>`;
  if(!doc){h+=S.dayErr===S.day?`<div class="glass panel empty">Les matchs de ce jour ne sont pas joignables pour l'instant.</div>`:`<div class="skeleton"></div><div class="skeleton"></div>`}
  else{
    const ms=doc.matches.filter(m=>S.league==="ALL"||m.l===S.league);
    const rank=m=>(m.l==="CL"?0:10)+(m.odds?Math.abs(m.odds["1"]-m.odds["2"]):5);
    const feats=ms.filter(m=>["open","live"].includes(phase(m,now))).sort((a,b)=>rank(a)-rank(b)).slice(0,5);
    if(feats.length>1)h+=`<div class="hero" aria-label="À la une">${feats.map(m=>{const ph=phase(m,now),hue=hash(m.h)%360;return`<article class="feat glass"><span class="glow" style="background:hsl(${hue} 80% 60%)"></span>
      <div class="meta"><span class="pill star">À la une</span><span class="flag" style="background:${LG[m.l].flag}"></span>${esc(LG[m.l].name)}</div>
      <button class="feat-open" data-open="${esc(m.id)}" aria-label="Voir ${esc(m.h)} – ${esc(m.a)}"><div class="vs"><div class="tm">${crest(m.h)}${esc(m.h)}</div><div>${m.sc?`<div class="ko num">${m.sc[0]} - ${m.sc[1]}</div>`:`<div class="ko num">${m.tbc?"--:--":fTime.format(m.k)}</div>`}<div class="note">${ph==="live"?"En direct":m.tbc?"à confirmer":"coup d'envoi"}</div></div><div class="tm">${crest(m.a)}${esc(m.a)}</div></div></button>
      <div class="odds">${oddBtn(m,"1",tshort(m.h),ph)}${oddBtn(m,"X","Nul",ph)}${oddBtn(m,"2",tshort(m.a),ph)}</div></article>`}).join("")}</div>`;
    if(!ms.length)h+=`<div class="glass panel empty">Pas de match ce jour-là dans cette compétition.</div>`;
    LEAGUES.forEach(lg=>{
      const list=ms.filter(m=>m.l===lg.id);if(!list.length)return;
      h+=`<div class="league glass"><div class="league-h"><span class="flag" style="background:${lg.flag}"></span>${lg.name}<span class="note">${esc(list[0].r||"")}</span></div>`;
      list.forEach(m=>{
        const ph=phase(m,now),sc=m.sc,real=(m.real||[]).includes("1");
        h+=`<div class="match"><button class="teams" data-open="${esc(m.id)}" aria-label="Voir ${esc(m.h)} – ${esc(m.a)}"><div class="meta">${statusTag(m,ph)}${real?`<span class="pill real">Cote réelle</span>`:""}${(()=>{const n=S.lb?betsOn(m.id).length:0;return n?`<span class="pill">👥 ${n}</span>`:""})()}</div>
          <div class="row"><span>${crest(m.h)}<em>${esc(m.h)}</em></span>${sc?`<b class="num">${sc[0]}</b>`:""}</div><div class="row"><span>${crest(m.a)}<em>${esc(m.a)}</em></span>${sc?`<b class="num">${sc[1]}</b>`:""}</div></button>
          <div class="odds">${oddBtn(m,"1","1",ph)}${oddBtn(m,"X","N",ph)}${oddBtn(m,"2","2",ph)}</div>
          <button class="morebtn" data-open="${esc(m.id)}">+ paris ›</button></div>`;
      });
      h+=`</div>`;
    });
    if(doc.updatedAt)h+=`<p class="note">Données mises à jour le ${fDT.format(doc.updatedAt)}${doc.src==="api-football"?" (API-Football)":" (calendrier officiel, cotes estimées)"}.</p>`;
  }
  v.innerHTML=h;
  const sel=document.querySelector('#strip [aria-pressed="true"]');if(sel){const st=$("#strip");st.scrollLeft=sel.offsetLeft-st.clientWidth/2+31}
}

/* ---------- Match sheet ---------- */
function lineupRows(lu,side){
  if(!lu||!lu.xi||!lu.xi.length)return null;
  let rows={};
  const byGrid=lu.xi.every(p=>p.g);
  const shape=String(lu.f||"").split("-").map(Number).filter(n=>n>0);
  if(!byGrid&&shape.length>=2&&shape.reduce((x,y)=>x+y,0)===lu.xi.length-1){
    const order={G:0,D:1,M:2,F:3},xi=lu.xi.slice().sort((x,y)=>(order[x.p]??2)-(order[y.p]??2));
    const out=[[xi[0]]];let i=1;shape.forEach(n=>{out.push(xi.slice(i,i+n));i+=n});return out;
  }
  lu.xi.forEach(p=>{const r=byGrid?Number(p.g.split(":")[0]):({G:1,D:2,M:3,F:4}[p.p]||3);(rows[r]=rows[r]||[]).push(p)});
  let keys=Object.keys(rows).map(Number).sort((a,b)=>a-b);
  if(byGrid)keys.forEach(k=>rows[k].sort((a,b)=>Number(a.g.split(":")[1])-Number(b.g.split(":")[1])));
  return keys.map(k=>rows[k]);
}
function playerChip(m,side,p,ph){
  const k="SC:"+side+":"+p.n,o=oddOf(m,k),sel=S.slip.some(s=>s.mid===m.id&&s.mk===k);
  return`<button class="pl ${side}" ${o&&ph==="open"?`data-mid="${esc(m.id)}" data-d="${esc(S.detailDay)}" data-mk="${esc(k)}"`:"disabled"} aria-pressed="${sel}" title="${esc(p.n)}${o?" · buteur à "+o.toFixed(2):""}"><i>${esc(p.no??"")}</i><span>${esc(short(p.n))}</span>${o?`<small class="num">${o.toFixed(2)}</small>`:""}</button>`;
}
function betsOn(mid){
  const out=[];for(const p of S.lb||[])for(const b of p.bets||[]){const l=(b.legs||[]).find(x=>x.mid===mid);if(l)out.push({p,b,l})}
  return out.sort((x,y)=>(y.b.placedAt||0)-(x.b.placedAt||0));
}
function bettorsHtml(m){
  if(!S.lb)return"";
  const list=betsOn(m.id);
  const stl={pending:"…",won:"Gagné",lost:"Perdu",void:"Remb."};
  return`<div class="glass panel"><div class="row-between"><h3>👥 Les paris des joueurs</h3><span class="note">${list.length} pari${list.length>1?"s":""}</span></div>
    ${list.length?`<div class="feed" style="margin-top:6px">${list.slice(0,30).map(({p,b,l})=>`<div><span class="lb-name">${avatar(p.uid,lbName(p),"lb-av")}<span><b>${esc(lbName(p))}</b>${p.uid===S.uid?" (toi)":""} · ${esc(l.lbl||pickLabel(m,l.mk))} @${Number(l.odd).toFixed(2)}${b.legs.length>1?` <span class="note">(combiné × ${b.legs.length})</span>`:""} · <b class="num">${Number(b.stake)||0} pts</b></span></span><span class="st ${esc(b.status)}">${stl[b.status]||""}</span></div>`).join("")}</div>`:`<p class="empty">Personne n'a encore parié sur ce match. Sois le premier !</p>`}</div>`;
}
function renderSheet(){
  const v=$("#v-matchs"),m=findMatch(S.detailDay,S.detail);
  if(!m){v.innerHTML=`<button class="back" data-back>‹ Retour aux matchs</button><div class="skeleton"></div>`;return}
  const ph=phase(m),sc=m.sc,lg=LG[m.l];
  let h=`<button class="back" data-back>‹ Retour aux matchs</button>
  <div class="glass sheet"><div class="row-between" style="margin-bottom:14px;position:relative"><span class="meta"><span class="flag" style="background:${lg.flag}"></span>${lg.name} · ${esc(m.r||"")}</span><span class="meta">${statusTag(m,ph)}</span></div>
   <div class="sheet-h"><div class="tm">${crest(m.h)}${esc(m.h)}</div><div>${sc?`<div class="sc num">${sc[0]} - ${sc[1]}</div>`:`<div class="ko num">${m.tbc?"--:--":fTime.format(m.k)}</div><div class="note">${esc(fLong.format(Date.parse(S.detailDay+"T12:00:00Z")))}</div>`}</div><div class="tm">${crest(m.a)}${esc(m.a)}</div></div>
   ${m.ev&&m.ev.length?`<div class="goals note">${m.ev.map(e=>`<span>⚽ ${e.m?esc(e.m)+"' ":""}${esc(e.n)}${e.og?" (csc)":""} · ${esc(tshort(e.t==="h"?m.h:m.a))}</span>`).join("")}${(m.as||[]).length?`<span>🅰️ Passes décisives : ${m.as.map(x=>esc(x.n)).join(", ")}</span>`:""}</div>`:""}
  </div>
  <div class="seg glass"><button data-st2="paris" aria-pressed="${S.sheetTab==="paris"}">Tous les paris</button><button data-st2="buteurs" aria-pressed="${S.sheetTab==="buteurs"}">Buteurs & passeurs</button><button data-st2="compos" aria-pressed="${S.sheetTab==="compos"}">Compos</button></div>`;
  const src=(m.real||[]).length?`Cotes réelles${m.book?" ("+esc(m.book)+")":""} pour ${(m.real||[]).includes("1")?"le résultat":"certains marchés"} ; les autres marchés sont calculés à partir de ces cotes.`:"Cotes estimées par notre modèle à partir des résultats de la saison (pas encore de cote bookmaker pour ce match).";
  if(S.sheetTab==="paris"){
    const mk=(title,keys,cls="")=>{const b=keys.map(([k,l])=>oddBtn(m,k,l,ph)).join("");return b?`<div class="glass panel market"><h3>${title}</h3><div class="opts ${cls}">${b}</div></div>`:""};
    h+=mk("Résultat du match",[["1",tshort(m.h)],["X","Nul"],["2",tshort(m.a)]])+
      mk("Double chance",[["1X","1 ou N"],["12","1 ou 2"],["X2","N ou 2"]])+
      mk("Nombre de buts",[["O15","+1,5"],["U15","−1,5"],["O25","+2,5"],["U25","−2,5"],["O35","+3,5"],["U35","−3,5"]])+
      mk("Les deux équipes marquent",[["BY","Oui"],["BN","Non"]])+
      mk("Résultat + les 2 marquent",[["1BY",tshort(m.h)+" & oui"],["XBY","Nul & oui"],["2BY",tshort(m.a)+" & oui"]])+
      mk("Handicap (victoire de 2 buts ou +)",[["HC1",tshort(m.h)+" −1,5"],["HC2",tshort(m.a)+" −1,5"]])+
      mk("Gagne sans encaisser",[["W1N",tshort(m.h)],["W2N",tshort(m.a)]])+
      mk("Buts de "+tshort(m.h),[["HO05","Marque"],["HO15","2 buts ou +"]])+
      mk("Buts de "+tshort(m.a),[["AO05","Marque"],["AO15","2 buts ou +"]])+
      mk("Nombre exact de buts",[["TG0","0"],["TG1","1"],["TG2","2"],["TG3","3"],["TG4","4 ou +"]])+
      mk("Total pair ou impair",[["EVEN","Pair"],["ODD","Impair"]])+
      mk("Score exact",Object.keys((m.odds||{}).CS||{}).sort().map(s=>["CS:"+s,s]),"cs")+
      `<p class="note">${src}</p>`;
  }else if(S.sheetTab==="buteurs"){
    if(!m.scorers){h+=`<div class="glass panel empty">Les cotes buteurs et passeurs arrivent avec les compositions. Le 11 probable est publié en général la veille du match, le 11 officiel environ une heure avant.</div>`}
    else{
      const col=(side,key,pre)=>{const list=((m[key]||{})[side]||[]);return`<div class="glass panel"><h3 style="margin-bottom:10px">${esc(tshort(side==="h"?m.h:m.a))}</h3><ol>${list.map(p=>{const k=pre+side+":"+p.n,sel=S.slip.some(s=>s.mid===m.id&&s.mk===k);return`<li><button ${ph!=="open"?"disabled":""} data-mid="${esc(m.id)}" data-d="${esc(S.detailDay)}" data-mk="${esc(k)}" aria-pressed="${sel}"><span>${esc(p.n)}</span><b class="num">${p.o.toFixed(2)}</b></button></li>`}).join("")||"<li class='note'>Pas de cote.</li>"}</ol></div>`};
      h+=`<div><h3>Buteur</h3><p class="sub">Marque à tout moment du match (hors but contre son camp).</p></div><div class="scorers">${col("h","scorers","SC:")}${col("a","scorers","SC:")}</div>`;
      if(m.assists)h+=`<div><h3>Passeur décisif</h3><p class="sub">Délivre au moins une passe décisive pendant le match.</p></div><div class="scorers">${col("h","assists","PD:")}${col("a","assists","PD:")}</div>`;
      h+=`<p class="note">Cotes calculées à partir des cotes du match, du poste de chaque joueur et de ses stats de la saison. Si le résultat détaillé n'est pas trouvé dans les 3 jours, la sélection est remboursée.</p>`;
    }
  }else{
    if(!m.lu){h+=`<div class="glass panel empty">Compositions pas encore disponibles. Le 11 probable arrive en général la veille du match, le 11 officiel environ une heure avant le coup d'envoi.</div>`}
    else{
      const rh=lineupRows(m.lu.h),ra=lineupRows(m.lu.a);
      const kind=s=>m.lu[s]?(m.lu[s].kind==="official"?"11 officiel":"11 probable"):"";
      h+=`<div class="pitch" role="img" aria-label="Compositions des deux équipes">
        <div class="pitch-tag"><span>${esc(m.h)} ${m.lu.h&&m.lu.h.f?"· "+esc(m.lu.h.f):""}</span><span>${kind("h")}</span></div>
        <div class="half">${rh?rh.map(r=>`<div class="line">${r.map(p=>playerChip(m,"h",p,ph)).join("")}</div>`).join(""):`<p class="note" style="color:#fff;text-align:center">Composition inconnue</p>`}</div>
        <div class="half">${ra?ra.slice().reverse().map(r=>`<div class="line">${r.map(p=>playerChip(m,"a",p,ph)).join("")}</div>`).join(""):`<p class="note" style="color:#fff;text-align:center">Composition inconnue</p>`}</div>
        <div class="pitch-tag"><span>${esc(m.a)} ${m.lu.a&&m.lu.a.f?"· "+esc(m.lu.a.f):""}</span><span>${kind("a")}</span></div></div>
        <p class="note">Touche un joueur pour parier qu'il marque. Le 11 probable vient de la presse sportive ; il est remplacé par le 11 officiel environ une heure avant le coup d'envoi.</p>`;
    }
  }
  h+=bettorsHtml(m);
  v.innerHTML=h;
}

/* ---------- Slip ---------- */
function slipOdds(){return Math.round(S.slip.reduce((a,s)=>a*s.odd,1)*100)/100}
function renderSlip(){
  const el=$("#slip"),mobile=window.innerWidth<=980;el.classList.toggle("collapsed",mobile&&!S.slipOpen);
  $("#scrim").classList.toggle("on",mobile&&S.slipOpen);
  const fab=$("#fab");fab.hidden=!S.slip.length||(mobile&&S.slipOpen);
  if(S.slip.length)fab.innerHTML=`<i class="num">${S.slip.length}</i>Ticket <b class="num">@${slipOdds().toFixed(2)}</b>`;
  const n=S.slip.length,odds=slipOdds(),stake=Number(S.stake)||0,gain=Math.floor(stake*odds);
  let err="";if(n){if(stake>S.me.balance)err="Pas assez de points.";else if(stake<1||!Number.isInteger(stake))err="Mise minimale : 1 pt (nombre entier)."}
  el.innerHTML=`<div class="slip-h" id="slipToggle"><h3>Ticket ${n>1?"combiné":""}</h3><span class="count num">${n}</span></div>
  <div class="slip-body">${n?S.slip.map((s,i)=>`<div class="leg"><div><div class="t">${esc(s.lbl)}</div><div class="s">${esc(s.mt)}</div></div><b class="num">${s.odd.toFixed(2)}</b><button class="x" data-rm="${i}" aria-label="Retirer">×</button></div>`).join(""):`<p class="empty">Ton ticket est vide.<br>Choisis une cote dans la liste des matchs.</p>`}
  ${n?`<div class="sum" style="margin-top:8px"><span>Cote totale</span><b class="num">${odds.toFixed(2)}</b></div>
  <label class="label" for="stakeIn">Mise</label>
  <div class="stake"><input id="stakeIn" type="number" inputmode="numeric" min="1" step="1" value="${esc(S.stake)}"><button class="chipbtn" data-st="5">5</button><button class="chipbtn" data-st="10">10</button><button class="chipbtn" data-st="max">Max</button></div>
  <div class="sum"><span>Gain potentiel</span><b class="num">${gain} pts</b></div>
  ${err?`<p class="err">${err}</p>`:""}
  <button class="cta" id="place" ${err||!S.canWrite?"disabled":""}>Valider le pari</button>
  <p class="note">Un seul pari par match dans un combiné.</p>`:""}</div>`;
}
function toggleOdd(d,mid,mk){
  const m=findMatch(d,mid);if(!m||phase(m)!=="open")return;
  const odd=oddOf(m,mk);if(!odd)return;
  const i=S.slip.findIndex(s=>s.mid===mid),leg={d,mid,mk,odd,lbl:pickLabel(m,mk),mt:m.h+" – "+m.a};
  if(i>=0&&S.slip[i].mk===mk)S.slip.splice(i,1);
  else if(i>=0){S.slip[i]=leg;toast("Sélection remplacée : un seul pari par match.")}
  else{if(S.slip.length>=10){toast("10 sélections maximum par combiné.");return}S.slip.push(leg)}
  renderMatchs();renderSlip();
}
function place(){
  const stake=Number(S.stake);
  if(!S.slip.length||!Number.isInteger(stake)||stake<1||stake>S.me.balance)return;
  const closed=S.slip.filter(s=>{const m=findMatch(s.d,s.mid);return !m||phase(m)!=="open"});
  if(closed.length){S.slip=S.slip.filter(s=>!closed.includes(s));toast("Un match a commencé, il a été retiré du ticket.");renderAll();return}
  // reprice to the latest odds
  let moved=false;S.slip.forEach(s=>{const o=oddOf(findMatch(s.d,s.mid),s.mk);if(o&&o!==s.odd){s.odd=o;moved=true}});
  if(moved){toast("Les cotes ont bougé. Vérifie ton ticket puis valide à nouveau.");renderSlip();return}
  const odds=slipOdds();
  S.me.balance-=stake;
  S.me.bets.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),legs:S.slip.map(s=>({d:s.d,mid:s.mid,mk:s.mk,odd:s.odd,lbl:s.lbl,mt:s.mt,k:(findMatch(s.d,s.mid)||{}).k})),stake,odds,placedAt:Date.now(),status:"pending"});
  S.slip=[];S.slipOpen=false;save();toast("Pari validé : "+stake+" pts à "+odds.toFixed(2));renderAll();
}

/* ---------- My bets ---------- */
function betCard(b){
  const legs=b.legs.map(l=>{const m=l.d&&findMatch(l.d,l.mid);const sc=m&&m.sc;return`<div class="leg"><div><div class="t">${esc(l.lbl||(m?pickLabel(m,l.mk):l.mk))}</div><div class="s">${esc(l.mt||(m?m.h+" – "+m.a:"Ancien match de démo"))}${sc?" · "+sc[0]+"-"+sc[1]:""}</div></div><b class="num">${l.odd.toFixed(2)}</b><span class="dot ${l.res||""}" title="${l.res||"en cours"}"></span></div>`}).join("");
  const lab={pending:"En cours",won:"Gagné",lost:"Perdu",void:"Remboursé"}[b.status];
  return`<div class="glass panel bet"><div class="bet-h"><strong>${b.legs.length>1?"Combiné × "+b.legs.length:"Simple"}</strong><span class="st ${b.status}">${lab}</span></div>${legs}
  <div class="bet-f"><span>Mise <b class="num">${b.stake} pts</b> · cote <b class="num">${b.odds.toFixed(2)}</b></span><span>${b.status==="won"?"Gain <b class='num'>+"+b.payout+" pts</b>":b.status==="pending"?"Gain potentiel <b class='num'>"+Math.floor(b.stake*b.odds)+" pts</b>":b.status==="void"?"Mise rendue":"—"}</span>
  ${S.mode==="cloud"?`<span style="display:flex;gap:14px;flex-wrap:wrap"><button class="linkbtn" data-gshare="${b.id}">Partager à tous</button>${S.me.groups.length?`<button class="linkbtn" data-share="${b.id}">Partager dans ${esc((S.groupsMeta[S.activeGroup||S.me.groups[0]]||{}).name||"mon groupe")}</button>`:""}</span>`:""}</div></div>`;
}
function donateCard(){
  const url=(window.VPRONO_CONFIG||{}).donateUrl;if(!url||!/^https:\/\//.test(url))return"";
  return`<div class="glass panel support"><div class="support-in"><div class="support-heart" aria-hidden="true">♥</div><div><h3>Soutenir Vprono</h3><p class="sub">Vprono est gratuit et sans pub pour les paris d'argent. Un petit don aide à payer le serveur et les nouvelles fonctions. Les dons ne donnent aucun point ni avantage dans le jeu.</p></div></div><a class="cta support-btn" href="${esc(url)}" target="_blank" rel="noopener">Faire un don</a></div>`;
}
function renderParis(){
  const st=S.me.stats,pend=S.me.bets.filter(b=>b.status==="pending"),done=S.me.bets.filter(b=>b.status!=="pending");
  const rate=st.won+st.lost?Math.round(100*st.won/(st.won+st.lost))+" %":"–";
  const list=S.betsTab==="pending"?pend:done;
  $("#v-paris").innerHTML=`<div><h2>Mes paris</h2><p class="sub">Les paris se règlent automatiquement quand le résultat officiel arrive.</p></div>
  <div class="stats"><div class="stat glass"><span class="label">Solde</span><b class="num">${S.me.balance}</b></div><div class="stat glass"><span class="label">En jeu</span><b class="num">${pend.reduce((a,b)=>a+b.stake,0)}</b></div><div class="stat glass"><span class="label">Réussite</span><b class="num">${rate}</b></div><div class="stat glass"><span class="label">Plus grosse cote</span><b class="num">${st.best?st.best.toFixed(2):"–"}</b></div></div>
  <div class="subtabs"><button data-bt="pending" aria-pressed="${S.betsTab==="pending"}">En cours (${pend.length})</button><button data-bt="done" aria-pressed="${S.betsTab==="done"}">Terminés (${done.length})</button></div>
  ${list.length?list.map(betCard).join(""):`<div class="glass panel empty">${S.betsTab==="pending"?"Aucun pari en cours. Va dans Matchs pour en placer un.":"Pas encore de pari terminé."}</div>`}
  <div class="glass panel"><label class="label" for="pseudo">Ton pseudo (visible dans tes groupes et au classement)</label><div class="form" style="margin-top:6px"><input id="pseudo" maxlength="24" placeholder="ex. Le Roi du Nul" value="${esc(S.me.pseudo)}"><button class="ghost" id="savePseudo">Enregistrer</button></div></div>
  <div class="glass panel"><div class="row-between"><div><span class="label">Compte</span><div style="font-weight:600;position:relative">${esc(S.email||"")}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${window.VPInstall&&!VPInstall.standalone()?`<button class="ghost" id="installApp">Installer l'appli</button>`:""}<button class="ghost" id="logout">Se déconnecter</button></div></div>${notifPromptHtml()?`<div style="margin-top:10px">${notifPromptHtml()}</div>`:""}</div>
  ${donateCard()}`;
}

/* ---------- Groups + chat ---------- */
function nameOf(uid){const p=S.members.find(x=>x.uid===uid);return(p&&p.pseudo)||S.names[uid]||"Joueur"}
const fMsg=new Intl.DateTimeFormat("fr-FR",{weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:tz});
function msgHtml(x,name){
  const mine=x.u===S.uid,who=`<span class="who">${esc(name)}<span class="when">${x.ts?esc(fMsg.format(x.ts)):""}</span></span>`;
  if(x.kind==="bet"&&x.bet){const b=x.bet;return`<div class="msg ticket${mine?" mine":""}">${who}🎟️ Ticket ${b.n>1?"combiné × "+esc(b.n):"simple"} · ${Number(b.stake)||0} pts à <b>${Number(b.odds||0).toFixed(2)}</b><ul>${(b.legs||[]).slice(0,10).map(l=>`<li>${esc(l)}</li>`).join("")}</ul></div>`}
  return`<div class="msg${mine?" mine":""}">${who}${esc(x.t)}</div>`;
}
function fillChat(box,list,nameFn,jumpKey){
  if(!box)return;const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  box.innerHTML=list.length?list.map(x=>msgHtml(x,nameFn(x))).join(""):`<p class="empty">Aucun message. Lance la discussion !</p>`;
  if(atBottom||S[jumpKey]){box.scrollTop=box.scrollHeight;S[jumpKey]=false}
}
function renderChat(){
  fillChat($("#msgs"),S.messages,x=>nameOf(x.u),"chatJump");
  fillChat($("#gmsgs"),S.gmsgs||[],x=>(x.u===S.uid?(S.me.pseudo||x.p):x.p)||"Joueur","gJump");
}
function watchGlobal(){
  if(S.gUnsub||!S.db)return;let first=true;
  S.gUnsub=S.db.collection("global/messages").orderBy("ts","desc").limit(80).onSnapshot(snap=>{
    const prev=(S.gmsgs||[]).length,lastTs=prev?S.gmsgs[prev-1].ts:0;
    S.gmsgs=snap.docs.map(d=>d.data()).reverse();
    const fresh=S.gmsgs.filter(m=>m.ts>lastTs&&m.u!==S.uid).length;
    if(!first&&fresh&&!(S.view==="groupes"&&S.social==="global")){S.unread+=fresh;renderTabs()}
    first=false;renderChat();
  },()=>{});
}
async function sendGlobal(data){
  if(!S.canWrite)return false;
  if(!S.me.pseudo){toast("Choisis d'abord un pseudo dans « Mes paris ».");return false}
  try{await S.db.collection("global/messages").add(Object.assign({u:S.uid,p:S.me.pseudo,ts:Date.now()},data));S.gJump=true;return true}
  catch(e){toast("Message non envoyé, réessaie.");return false}
}
function renderGroupes(){
  const v=$("#v-groupes");
  if(S.mode!=="cloud"){v.innerHTML=`<div><h2>Groupes</h2></div><div class="glass panel empty">${S.mode==="loading"?"Connexion…":"Connecte-toi pour jouer avec tes amis."}</div>`;return}
  const g=S.activeGroup,meta=g&&S.groupsMeta[g];
  const soc=S.social||"global";
  const head=`<div><h2>Social</h2><p class="sub">Discute avec tous les joueurs de Vprono, ou affronte tes potes dans vos groupes.</p></div>
  <div class="seg glass"><button data-social="global" aria-pressed="${soc==="global"}">🌍 Chat général</button><button data-social="groups" aria-pressed="${soc==="groups"}">👥 Mes groupes</button></div>`;
  if(soc==="global"){
    v.innerHTML=head+`<div class="glass panel chat chat-global"><div class="row-between"><h3>Tous les joueurs</h3><span class="note">Reste cool : pas d'insultes, pas de pub.</span></div><div class="msgs" id="gmsgs"></div>
      <form class="form" id="gChatForm"><input id="gChatIn" maxlength="${MSG_MAX}" placeholder="${S.me.pseudo?"Message à tout le monde…":"Choisis un pseudo pour écrire"}" autocomplete="off" value="${esc(S.gDraft||"")}"><button class="cta" ${S.canWrite?"":"disabled"}>Envoyer</button></form></div>`;
    S.gJump=true;renderChat();return;
  }
  let h=head+`
  <div class="grid2"><div class="glass panel"><h3>Créer un groupe</h3><div class="form" style="margin-top:8px"><input id="gName" maxlength="32" placeholder="ex. Les potes du foot"><button class="cta" id="gCreate" ${S.canWrite?"":"disabled"}>Créer</button></div></div>
  <div class="glass panel"><h3>Rejoindre</h3><div class="form" style="margin-top:8px"><input id="gCode" maxlength="6" placeholder="Code à 6 caractères" style="text-transform:uppercase"><button class="ghost" id="gJoin" ${S.canWrite?"":"disabled"}>Rejoindre</button></div></div></div>`;
  if(!S.me.groups.length){v.innerHTML=h+`<div class="glass panel empty">Tu n'es dans aucun groupe pour l'instant.</div>`;return}
  h+=`<div class="subtabs">${S.me.groups.map(c=>`<button data-g="${c}" aria-pressed="${c===g}">${esc((S.groupsMeta[c]||{}).name||c)}</button>`).join("")}</div>`;
  if(g){
    const mem=S.members.slice().sort((a,b)=>b.balance-a.balance);
    const feed=[];mem.forEach(p=>(p.bets||[]).slice(0,10).forEach(b=>feed.push({p,b})));feed.sort((a,b)=>b.b.placedAt-a.b.placedAt);
    h+=`<div class="glass panel"><div class="bet-h"><div><h3>${esc(meta?meta.name:g)}</h3><span class="note">${mem.length} joueur${mem.length>1?"s":""}</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="code">${esc(g)}</span><button class="ghost" id="copyCode">Copier le code</button><button class="linkbtn" id="leave">Quitter</button></div></div>
    <div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>#</th><th>Joueur</th><th class="r">Solde</th><th class="r">Gagnés</th><th class="r">Meilleure cote</th></tr></thead><tbody>
    ${mem.map((p,i)=>`<tr class="${p.uid===S.uid?"me":""}"><td class="rank">${i===0?"🏆":i+1}</td><td>${esc(nameOf(p.uid))}${p.uid===S.uid?" (toi)":""}</td><td class="r num"><b>${Number(p.balance)||0}</b></td><td class="r num">${(p.stats||{}).won||0}</td><td class="r num">${(p.stats||{}).best?Number(p.stats.best).toFixed(2):"–"}</td></tr>`).join("")}
    </tbody></table></div></div>
    <div class="grid2"><div class="glass panel chat"><h3>Chat du groupe</h3><div class="msgs" id="msgs"></div>
      <form class="form" id="chatForm"><input id="chatIn" maxlength="${MSG_MAX}" placeholder="Écris un message…" autocomplete="off" value="${esc(S.chatDraft)}"><button class="cta" ${S.canWrite?"":"disabled"}>Envoyer</button></form></div>
    <div class="glass panel"><h3>Activité</h3><div class="feed">${feed.slice(0,14).map(({p,b})=>{const l=b.legs[0]||{};return`<div><span><b>${esc(nameOf(p.uid))}</b> · ${Number(b.stake)||0} pts sur ${b.legs.length>1?"un combiné × "+b.legs.length:esc(l.lbl||"un pari")+(l.mt?" ("+esc(l.mt)+")":"")} @${Number(b.odds||0).toFixed(2)}</span><span class="st ${esc(b.status)}">${b.status==="pending"?"…":b.status==="won"?"+"+(Number(b.payout)||0):b.status==="void"?"remb.":"perdu"}</span></div>`}).join("")||`<p class="empty">Aucun pari pour l'instant.</p>`}</div></div></div>`;
  }
  v.innerHTML=h;renderChat();
}
function openGroup(code){
  if(S.unsub){S.unsub();S.unsub=null}
  if(S.chatUnsub){S.chatUnsub();S.chatUnsub=null}
  S.activeGroup=code;S.members=[];S.messages=[];S.chatJump=true;
  if(!code||!S.db)return renderGroupes();
  S.unsub=S.db.collection("players").where("groups","array-contains",code).onSnapshot(async snap=>{
    S.members=snap.docs.map(d=>Object.assign({uid:d.id},d.data()));
    if(S.user){try{const ps=await S.user.profiles(S.members.map(m=>m.uid));Object.values(ps).forEach(p=>{if(p.name)S.names[p.id]=p.name})}catch(e){}}
    if(S.view==="groupes")renderGroupes();
  },()=>toast("Le classement du groupe n'est pas joignable pour l'instant."));
  let first=true;
  S.chatUnsub=S.db.collection("groups/"+code+"/messages").orderBy("ts","desc").limit(60).onSnapshot(snap=>{
    const prev=S.messages.length;S.messages=snap.docs.map(d=>d.data()).reverse();
    if(!first&&S.view!=="groupes"&&S.messages.length>prev){S.unread+=S.messages.length-prev;renderTabs()}
    first=false;renderChat();
  },()=>{});
  renderGroupes();
}
async function sendMsg(data){
  if(!S.activeGroup||!S.canWrite)return false;
  try{await S.db.collection("groups/"+S.activeGroup+"/messages").add(Object.assign({u:S.uid,ts:Date.now()},data));S.chatJump=true;return true}
  catch(e){toast("Message non envoyé, réessaie.");return false}
}
async function loadGroupMeta(){await Promise.all(S.me.groups.map(async c=>{if(S.groupsMeta[c])return;try{const d=await S.db.doc("groups/"+c).get();if(d.exists)S.groupsMeta[c]=d.data()}catch(e){}}))}
async function createGroup(){
  const name=$("#gName").value.trim();if(!name){toast("Donne un nom à ton groupe.");return}
  const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let code="";for(let i=0;i<6;i++)code+=A[Math.floor(Math.random()*A.length)];
  try{await S.db.doc("groups/"+code).set({name,createdBy:S.uid,createdAt:Date.now()})}catch(e){toast("Création impossible pour l'instant.");return}
  S.groupsMeta[code]={name};S.me.groups.push(code);await save();toast("Groupe créé ! Partage le code "+code);openGroup(code);
}
async function joinGroup(){
  const code=$("#gCode").value.trim().toUpperCase();if(code.length!==6){toast("Le code fait 6 caractères.");return}
  if(S.me.groups.includes(code)){openGroup(code);return}
  try{const d=await S.db.doc("groups/"+code).get();if(!d.exists){toast("Aucun groupe avec ce code.");return}S.groupsMeta[code]=d.data()}catch(e){toast("Impossible de vérifier ce code.");return}
  S.me.groups.push(code);await save();toast("Bienvenue dans "+S.groupsMeta[code].name+" !");openGroup(code);
}

/* ---------- Mini-games ---------- */
const WHEEL=[5,10,5,25,10,50,5,15];
const WCOL=["#FFBE2E","#7FA2FF","#FF8A6B","#5FD49A","#FFBE2E","#C792FF","#FF8A6B","#7FA2FF"];
function featured(){
  const d=dayList().find(x=>x>=today()&&S.days[x]&&S.days[x].matches.some(m=>phase(m)==="open"))||S.day;
  const doc=S.days[d];if(!doc)return null;
  const open=doc.matches.filter(m=>phase(m)==="open"&&m.odds);const pool=open.length?open:doc.matches;if(!pool.length)return null;
  const rank=m=>(m.l==="CL"?0:10)+Math.abs((m.odds?m.odds["1"]:3)-(m.odds?m.odds["2"]:3));
  const m=pool.slice().sort((a,b)=>rank(a)-rank(b))[0];return{m,d};
}
const CLASSIC=[
  {id:"wheel",title:"La roue du jour",icon:"🎡",desc:"Un tour gratuit par jour",daily:()=>S.me.lastSpin!==today()},
  {id:"pen",title:"Tirs au but",icon:"🥅",desc:"5 tirs, jusqu'à ×3 ta mise"},
  {id:"exact",title:"Score exact",icon:"🎯",desc:"Trouve le score de l'affiche : +"+SCORE_BONUS+" pts",daily:()=>{const F=featured();return !!(F&&phase(F.m)==="open"&&!S.me.picks[F.m.id])}}];
function allGames(){return (DUELS?[DUELS.tile]:[]).concat(CLASSIC,GAMES?GAMES.list:[])}
function dailyCount(){return allGames().filter(g=>g.daily&&g.daily()).length}
function classicHtml(id){
  const seg=360/WHEEL.length,P=S.pen;
  if(id==="wheel"){const spun=S.me.lastSpin===today();return`<p class="sub">Un tour gratuit par jour : de 5 à 50 pts.</p>
    <div class="wheel-box"><div class="pointer"></div><div class="wheel" id="wheel" style="transform:rotate(${S.wheelRot}deg);background:conic-gradient(${WHEEL.map((v,i)=>WCOL[i]+" "+i*seg+"deg "+(i+1)*seg+"deg").join(",")})">
     ${WHEEL.map((v,i)=>`<span style="transform:rotate(${i*seg+seg/2-90}deg) translate(58px,-10px)">${v}</span>`).join("")}</div></div>
    <button class="cta" id="spin" ${spun||S.wheelBusy||!S.canWrite?"disabled":""}>${spun?"Déjà tournée, reviens demain":"Tourner la roue"}</button>`}
  if(id==="pen")return`<p class="sub">5 tirs, choisis ton coin, le gardien plonge au hasard. 5/5 = ×3, 4/5 = ×1,2, 3/5 = ×0,5.</p>
    <div class="goal">${["Gauche","Centre","Droite"].map((c,i)=>`<button data-shot="${i}" ${P&&!P.done&&!P.busy?"":"disabled"}>${c}</button>`).join("")}<div class="keeper" style="left:${P&&P.kp!=null?P.kp*33.3:33.3}%">🧤</div></div>
    <div class="shots">${[0,1,2,3,4].map(i=>`<i class="${P&&P.shots[i]!=null?(P.shots[i]?"g":"m"):""}"></i>`).join("")}</div>
    <p class="gmsg">${P?esc(P.msg):"Mise des points puis tire."}</p>
    ${!P||P.done?`<div class="stake"><input id="penStake" type="number" min="1" step="1" value="5" aria-label="Mise tirs au but"><button class="cta" id="penGo" ${S.canWrite?"":"disabled"}>Jouer</button></div>`:""}`;
  if(id==="exact"){const F=featured(),f=F&&F.m,fph=f&&phase(f),pk=f&&S.me.picks[f.id];if(!f){loadUpcoming();return`<p class="empty">L'affiche arrive avec le calendrier.</p>`}
    return`<p class="sub">Trouve le score exact de l'affiche, c'est gratuit : +${SCORE_BONUS} pts si c'est juste.</p>
    <p style="text-align:center;font-weight:600;margin:0">${esc(f.h)} – ${esc(f.a)}<br><span class="note">${esc(LG[f.l].name)} · ${fph==="open"?(f.tbc?"date ":"coup d'envoi ")+esc(fDT.format(f.k)):"prono fermé"}</span></p>
    <div class="pick"><input id="ph" type="number" min="0" max="15" value="${pk?pk.h:""}" aria-label="Buts ${esc(f.h)}" ${fph!=="open"?"disabled":""}><b>–</b><input id="pa" type="number" min="0" max="15" value="${pk?pk.a:""}" aria-label="Buts ${esc(f.a)}" ${fph!=="open"?"disabled":""}></div>
    <button class="ghost" id="savePick" ${fph!=="open"||!S.canWrite?"disabled":""}>${pk?"Modifier mon prono":"Valider mon prono"}</button>
    ${pk&&pk.settled?`<p class="gmsg">${pk.won?"Bien vu ! +"+SCORE_BONUS+" pts":"Raté cette fois."}</p>`:""}`}
  return"";
}
let upcomingLoading=false;
function loadUpcoming(){
  if(upcomingLoading||!S.db||!S.meta)return;upcomingLoading=true;
  const ds=dayList().filter(d=>d>=today()).slice(0,5);
  loadDays(ds).then(()=>{upcomingLoading=false;if(S.view==="jeux")renderJeux()});
}
function renderJeux(){
  const v=$("#v-jeux");
  const broke=S.me.balance<1&&!S.me.bets.some(b=>b.status==="pending"),rescued=S.me.lastRescue===today();
  const rescue=broke?`<div class="glass panel"><h3>Plus de points ?</h3><p class="sub">Ça arrive aux meilleurs. Reprends 20 pts une fois par jour.</p><button class="cta" id="rescue" style="margin-top:8px" ${rescued?"disabled":""}>${rescued?"Reviens demain":"Récupérer 20 pts"}</button></div>`:"";
  if(S.gameId){
    const g=allGames().find(x=>x.id===S.gameId);
    const body=S.gameId==="duel"&&DUELS?DUELS.render():CLASSIC.some(x=>x.id===S.gameId)?classicHtml(S.gameId):(GAMES?GAMES.render(S.gameId):"");
    v.innerHTML=`<button class="back" data-game-back>‹ Tous les jeux</button>${rescue}<div class="glass panel game game-open"><div class="game-h"><span class="game-ic" aria-hidden="true">${g?g.icon:""}</span><h2>${esc(g?g.title:"")}</h2></div>${body}</div>`;
    if(GAMES)GAMES.mount(S.gameId);
    return;
  }
  const n=dailyCount();
  v.innerHTML=`<div><h2>Mini-jeux</h2><p class="sub">${n?`<b>${n}</b> jeu${n>1?"x":""} gratuit${n>1?"s":""} à faire aujourd'hui.`:"Tous tes bonus du jour sont faits. Reviens demain !"}</p></div>${rescue}
  <div class="tiles">${allGames().map(g=>{const free=g.daily&&g.daily();return`<button class="tile glass" data-game="${g.id}"><span class="game-ic" aria-hidden="true">${g.icon}</span><b>${esc(g.title)}</b><small>${esc(g.desc)}</small>${free?`<span class="pill star">Dispo</span>`:""}</button>`}).join("")}</div>`;
}
function openGame(id){if(GAMES)GAMES.unmount();if(id==="duel"&&DUELS)DUELS.open();S.gameId=id;renderJeux();const v=$("#v-jeux");v.classList.remove("enter");void v.offsetWidth;v.classList.add("enter");window.scrollTo({top:0})}
function spin(){
  if(S.me.lastSpin===today()||S.wheelBusy)return;
  const i=Math.floor(Math.random()*WHEEL.length),seg=360/WHEEL.length;
  S.wheelBusy=true;S.me.lastSpin=today();
  S.wheelRot=S.wheelRot-(S.wheelRot%360)+360*5+(360-(i*seg+seg/2));
  const wh=$("#wheel");if(wh)wh.style.transform=`rotate(${S.wheelRot}deg)`;const sb=$("#spin");if(sb)sb.disabled=true;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(()=>{S.wheelBusy=false;S.me.balance+=WHEEL[i];save();toast("+"+WHEEL[i]+" pts gagnés à la roue !");renderAll()},reduce?100:4100);
}
function penStart(){
  const st=Number($("#penStake").value);
  if(!Number.isInteger(st)||st<1){toast("Mise un nombre entier de points.");return}
  if(st>S.me.balance){toast("Pas assez de points.");return}
  S.me.balance-=st;save();S.pen={stake:st,shots:[],kp:null,msg:"À toi de tirer !",done:false,busy:false};renderAll();
}
function penShot(c){
  const P=S.pen;if(!P||P.done||P.busy)return;
  P.busy=true;const k=Math.floor(Math.random()*3);P.kp=k;const goal=k!==c;P.shots.push(goal);
  P.msg=goal?"BUUUT !":"Arrêt du gardien…";renderJeux();
  setTimeout(()=>{P.busy=false;P.kp=null;
    if(P.shots.length===5){const n=P.shots.filter(Boolean).length,mult=n===5?3:n===4?1.2:n===3?.5:0,win=Math.floor(P.stake*mult);
      P.done=true;P.msg=n+"/5 · "+(win?"tu récupères "+win+" pts":"perdu, retente ta chance");S.me.balance+=win;S.me.stats.games=(S.me.stats.games||0)+1;save();renderAll()}
    else renderJeux();},700);
}

/* ---------- Games module ---------- */
const GAMES=window.VPGames?window.VPGames({S,esc,today,save,toast,
  rerender:()=>{if(S.view==="jeux")renderJeux();renderHeader();renderTabs()},
  bumpBalance:()=>renderHeader(),
  dayList,findMatch,phase,legResult,pickLabel,tshort,fDT,loadUpcoming}):null;

const DUELS=window.VPDuels?window.VPDuels({S,esc,save,toast,
  rerender:()=>{if(S.view==="jeux"&&S.gameId==="duel"){renderJeux()}else if(S.view==="jeux"&&!S.gameId){renderJeux()}renderHeader();renderTabs()},
  bumpBalance:()=>renderHeader(),sendGlobal:(d)=>sendGlobal(d),quizBank:GAMES?GAMES.quizBank:[]}):null;

const LIVE=window.VPLive?window.VPLive({S,esc,save,toast,bumpBalance:()=>renderHeader(),
  rerender:()=>{if(S.view==="matchs"&&S.matchMode==="live")renderMatchs()}}):null;

/* ---------- Evening boosted odd + notifications ---------- */
const BOOST_MAX=20;
function watchBoost(){if(VP.boosts)VP.boosts.watch(today(),doc=>{S.boost=doc;if(doc&&doc.d)loadDays([doc.d]).then(()=>{if(S.view==="matchs")renderMatchs()});if(S.view==="matchs")renderMatchs()})}
function boostCard(){
  const b=S.boost;if(!b)return"";
  const m=findMatch(b.d,b.mid),ph=m?phase(m):"open",taken=S.me.boostDay===b.date;
  const pend=S.me.bets.find(x=>x.boost===b.date);
  return`<div class="boost glass"><div class="boost-top"><span class="boost-fire" aria-hidden="true">🔥</span><div><span class="label">Cote boostée du soir</span><h3>${esc(b.lbl)}</h3><small class="note">${esc(b.mt)} · ${esc(fTime.format(b.k))}</small></div></div>
    <div class="boost-odds"><s class="num">${Number(b.base).toFixed(2)}</s><span aria-hidden="true">→</span><b class="num">${Number(b.odd).toFixed(2)}</b></div>
    ${taken?`<p class="note boost-done">${pend?`Tu as misé ${pend.stake} pts dessus. Rendez-vous au coup de sifflet !`:"Déjà joué aujourd'hui."}</p>`:ph!=="open"?`<p class="note">Le match a commencé, la cote boostée est fermée.</p>`:`<div class="stake"><input id="boostStake" type="number" min="1" max="${BOOST_MAX}" step="1" value="${Math.min(BOOST_MAX,10)}" aria-label="Mise cote boostée"><button class="cta" id="boostGo" ${S.canWrite?"":"disabled"}>Parier (max ${BOOST_MAX} pts)</button></div>`}
    ${notifPromptHtml()}</div>`;
}
function placeBoost(){
  const b=S.boost;if(!b||S.me.boostDay===b.date)return;
  const m=findMatch(b.d,b.mid);if(!m||phase(m)!=="open"){toast("Le match a commencé.");return}
  const st=Number($("#boostStake").value);
  if(!Number.isInteger(st)||st<1||st>BOOST_MAX){toast("Mise entre 1 et "+BOOST_MAX+" pts.");return}
  if(st>S.me.balance){toast("Pas assez de points.");return}
  S.me.balance-=st;S.me.boostDay=b.date;
  S.me.bets.unshift({id:Date.now().toString(36)+"b",boost:b.date,legs:[{d:b.d,mid:b.mid,mk:b.mk,odd:Number(b.odd),lbl:"🔥 "+b.lbl,mt:b.mt,k:m.k}],stake:st,odds:Number(b.odd),placedAt:Date.now(),status:"pending"});
  save();toast("🔥 Cote boostée jouée : "+st+" pts @"+Number(b.odd).toFixed(2));renderAll();
}
const pushSupported=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function notifPromptHtml(){
  const key=(window.VPRONO_CONFIG||{}).vapidPublicKey;if(!key)return"";
  if(isIOS&&window.VPInstall&&!VPInstall.standalone())return`<p class="note">🔔 Sur iPhone, installe Vprono sur ton écran d'accueil pour recevoir la cote boostée chaque soir.</p>`;
  if(!pushSupported()||S.notifOn||Notification.permission==="denied")return typeof Notification!=="undefined"&&Notification.permission==="denied"?`<p class="note">🔕 Notifications bloquées : réactive-les dans les réglages du navigateur pour recevoir la cote du soir.</p>`:"";
  return`<button class="ghost notif-btn" id="notifOn">🔔 Me prévenir chaque soir</button>`;
}
const b64u=s=>{const p="=".repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))};
async function enableNotifs(){
  try{
    if(await Notification.requestPermission()!=="granted"){toast("Notifications refusées. Tu pourras les activer plus tard.");renderAll();return}
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(VPRONO_CONFIG.vapidPublicKey)});
    await VP.push.save(S.uid,sub);S.notifOn=true;toast("🔔 C'est noté : tu recevras la cote boostée chaque soir.");renderAll();
  }catch(e){toast("Impossible d'activer les notifications sur cet appareil.")}
}
async function checkNotifs(){
  try{if(!pushSupported()||Notification.permission!=="granted")return;const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
    if(sub){S.notifOn=true;VP.push.save(S.uid,sub).catch(()=>{})}}catch(e){}
}

const CASINO=window.VPCasino?window.VPCasino({S,esc,save,toast,bumpBalance:()=>renderHeader(),rerender:()=>renderCasino()}):null;
function renderCasino(){const v=$("#v-casino");if(!v)return;if(S.mode!=="cloud"){v.innerHTML=`<div><h2>🎰 Casino</h2></div><div class="glass panel empty">Connexion…</div>`;return}if(CASINO)v.innerHTML=CASINO.render()}

/* ---------- Gifts from the creator ---------- */
const giftQueue=[];let giftBusy=false;
function watchGifts(){
  if(!VP.gifts)return;
  VP.gifts.watch(S.uid,async list=>{
    for(const g of list||[]){
      if(giftBusy||giftQueue.some(x=>x.id===g.id))continue;
      giftBusy=true;
      try{if(await VP.gifts.claim(g.id)){S.me.balance+=g.amount;S.me.gifts=(S.me.gifts||0)+g.amount;await save();renderHeader();giftQueue.push(g);showGift()}}catch(e){}
      giftBusy=false;
    }
  });
}
function showGift(){
  const w=$("#welcome");if(!w.hidden||!giftQueue.length)return;
  const g=giftQueue.shift();w.hidden=false;
  w.innerHTML=`<div class="card glass gift-card" role="dialog" aria-modal="true" aria-labelledby="gTitle"><div class="gift-box" aria-hidden="true">🎁</div>
    <h2 id="gTitle">Un cadeau pour toi !</h2><p class="sub">De la part de ${esc(g.from_label||"le créateur de Vprono")}</p>
    <div class="gift num">+${g.amount} pts</div>${g.message?`<p class="gift-msg">« ${esc(g.message)} »</p>`:""}
    <button class="cta" id="giftOk">Merci !</button></div>`;
}

/* ---------- Glue ---------- */
function renderTabs(){const b=$("#gBadge");b.hidden=!S.unread;b.textContent=S.unread;const j=$("#jBadge");if(j){const n=S.mode==="cloud"?dailyCount():0;j.hidden=!n;j.textContent=n}}
let lastBal=null;
function renderHeader(){const el=$("#bal");if(lastBal!==null&&lastBal!==S.me.balance){el.classList.remove("bump");void el.offsetWidth;el.classList.add("bump")}lastBal=S.me.balance;el.innerHTML=S.me.balance+"<span>pts</span>";$("#who").textContent=S.mode==="cloud"?(S.me.pseudo||S.names[S.uid]||""):S.mode==="loading"?"Chargement…":"Hors connexion"}
function avatar(uid,label,cls){const h=hash(uid||"x")%360;return`<i class="${cls}" style="background:radial-gradient(circle at 32% 26%,hsl(${h} 75% 64%),hsl(${h} 62% 36%) 72%)" aria-hidden="true">${esc((label||"?").trim().slice(0,1).toUpperCase())}</i>`}
function lbName(p){return p.pseudo||S.names[p.uid]||"Joueur"}
function watchLeaderboard(){
  if(S.lbUnsub||!S.db)return;
  let t=setTimeout(()=>{if(!S.lb){S.lbErr=true;renderClassement()}},10000);
  S.lbUnsub=S.db.collection("players").orderBy("score","desc").limit(200).onSnapshot(async snap=>{
    clearTimeout(t);S.lbErr=false;S.lb=snap.docs.map(d=>Object.assign({uid:d.id},d.data()));
    const missing=S.lb.filter(p=>!p.pseudo&&!S.names[p.uid]).map(p=>p.uid);
    if(S.user&&missing.length){try{const ps=await S.user.profiles(missing.slice(0,64));Object.values(ps).forEach(p=>{if(p.name)S.names[p.id]=p.name})}catch(e){}}
    renderClassement();if(S.view==="matchs")renderMatchs();
  },()=>{clearTimeout(t);S.lbErr=true;renderClassement()});
}
function playerSheet(uid){
  const p=(S.lb||[]).find(x=>x.uid===uid);if(!p)return;
  const w=$("#welcome"),st=p.stats||{},n=(st.won||0)+(st.lost||0);
  const stl={pending:"En cours",won:"Gagné",lost:"Perdu",void:"Remboursé"};
  w.hidden=false;
  w.innerHTML=`<div class="card glass player-card" role="dialog" aria-modal="true" aria-labelledby="pTitle">
    <div class="row-between"><span class="lb-name">${avatar(p.uid,lbName(p),"av")}<h2 id="pTitle">${esc(lbName(p))}</h2></span><button class="x" id="pClose" aria-label="Fermer">×</button></div>
    <div class="stats3"><div><b class="num">${Number(p.score)||scoreOf(p)}</b><small>points</small></div><div><b class="num">${st.won||0}</b><small>paris gagnés</small></div><div><b class="num">${n?Math.round(100*(st.won||0)/n)+"%":"–"}</b><small>réussite</small></div><div><b class="num">${st.duelsWon||0}</b><small>duels gagnés</small></div></div>
    <h3>Derniers paris</h3>
    <div class="feed pc-feed">${(p.bets||[]).slice(0,12).map(b=>`<div><span>${b.legs.length>1?`<b>Combiné × ${b.legs.length}</b><br>`:""}${b.legs.slice(0,4).map(l=>`${esc(l.lbl||l.mk)} <span class="note">· ${esc(l.mt||"")} @${Number(l.odd).toFixed(2)}</span>`).join("<br>")}<br><span class="note">Mise ${Number(b.stake)||0} pts · cote ${Number(b.odds||0).toFixed(2)}</span></span><span class="st ${esc(b.status)}">${stl[b.status]||""}${b.status==="won"?" +"+(Number(b.payout)||0):""}</span></div>`).join("")||`<p class="empty">Aucun pari pour l'instant.</p>`}</div>
    ${p.uid!==S.uid&&p.pseudo&&window.VPDuels?`<button class="cta" id="pDuel" data-uid="${esc(p.uid)}" data-name="${esc(p.pseudo)}">⚔️ Défier ${esc(p.pseudo)} en duel</button>`:""}</div>`;
}
function renderClassement(){
  const v=$("#v-classement");
  if(S.mode!=="cloud"){v.innerHTML=`<div><h2>Classement</h2></div><div class="glass panel empty">${S.mode==="loading"?"Connexion…":"Connecte-toi pour voir le classement."}</div>`;return}
  let h=`<div><h2>Classement général</h2><p class="sub">Tous les joueurs de Vprono, classés par points : solde + mises en cours.</p></div>`;
  if(!S.lb){v.innerHTML=h+(S.lbErr?`<div class="glass panel empty">Le classement n'est pas joignable pour l'instant.</div>`:`<div class="skeleton"></div><div class="skeleton"></div>`);return}
  const lb=S.lb.slice().sort((a,b)=>(Number(b.score)||scoreOf(b))-(Number(a.score)||scoreOf(a))),pts=p=>Number(p.score)||scoreOf(p);
  const myIdx=lb.findIndex(p=>p.uid===S.uid);
  h+=`<div class="myrank glass"><div><span class="label">Ta place</span><div><b class="num">${myIdx>=0?myIdx+1:"–"}</b><span class="note"> / ${lb.length} joueur${lb.length>1?"s":""}</span></div></div><div style="text-align:right"><span class="label">Tes points</span><div><b class="num">${scoreOf(S.me)}</b></div></div></div>`;
  const top=lb.slice(0,3);
  if(top.length){
    const order=[top[1],top[0],top[2]],cls=["p2","p1","p3"],med=["🥈","🥇","🥉"];
    h+=`<div class="podium">${order.map((p,i)=>p?`<div class="pod glass ${cls[i]}"><span class="medal">${med[i]}</span>${avatar(p.uid,lbName(p),"av")}<span class="nm">${esc(lbName(p))}${p.uid===S.uid?" (toi)":""}</span><b class="num">${pts(p)}</b><span class="note">pts</span></div>`:"<div></div>").join("")}</div>`;
  }
  h+=`<div class="glass panel"><div class="tablewrap"><table class="lb"><thead><tr><th>#</th><th>Joueur</th><th class="r">Points</th><th class="r opt">Gagnés</th><th class="r opt">Réussite</th></tr></thead><tbody>
  ${lb.map((p,i)=>{const st=p.stats||{},n=(st.won||0)+(st.lost||0);return`<tr class="${p.uid===S.uid?"me":""} lb-row" data-player="${esc(p.uid)}"><td class="rank num">${i+1}</td><td><div class="lb-name">${avatar(p.uid,lbName(p),"lb-av")}<span>${esc(lbName(p))}${p.uid===S.uid?" (toi)":""}</span></div></td><td class="r num"><b>${pts(p)}</b></td><td class="r num opt">${st.won||0}</td><td class="r num opt">${n?Math.round(100*(st.won||0)/n)+" %":"–"}</td></tr>`}).join("")}
  </tbody></table></div></div><p class="note">Le top 200 s'affiche. Pour apparaître sous ton pseudo, choisis-le dans « Mes paris ».</p>`;
  v.innerHTML=h;
}
function renderWelcome(){
  const w=$("#welcome");
  if(w.querySelector(".gift-card,.player-card"))return;
  if(S.mode!=="cloud"||S.me.pseudo||S.welcomeDone||!S.canWrite){w.hidden=true;return}
  w.hidden=false;
  w.innerHTML=`<div class="card glass" role="dialog" aria-modal="true" aria-labelledby="wTitle"><div class="brand" style="justify-content:center;font-size:26px"><svg class="logo big" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="vpg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F7BFF"/><stop offset=".55" stop-color="#7B5CFF"/><stop offset="1" stop-color="#FF4D8D"/></linearGradient><linearGradient id="vph2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="18" fill="url(#vpg2)"/><rect x="2" y="2" width="60" height="30" rx="18" fill="url(#vph2)"/><path d="M15 17l13 30 11-25" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="45" cy="17" r="7.5" fill="#fff"/><path d="M45 12.6l3.6 2.6-1.4 4.2h-4.4l-1.4-4.2z" fill="#1B1F3B"/></svg><span>V<i>prono</i></span></div>
    <h2 id="wTitle">Bienvenue${S.names[S.uid]?" "+esc(S.names[S.uid].split(" ")[0]):""} !</h2>
    <p class="sub">Ton compte est créé. Voici tes points de départ pour parier sur les vrais matchs, sans argent réel.</p>
    <div class="gift num">+${START} pts</div>
    <form id="welcomeForm" class="form" style="flex-direction:column"><label class="label" for="wPseudo">Choisis ton pseudo</label><input id="wPseudo" maxlength="24" placeholder="ex. Le Roi du Nul" autocomplete="off" required><button class="cta">C'est parti</button></form>
    <button class="linkbtn" id="wSkip" style="align-self:center">Plus tard</button></div>`;
  setTimeout(()=>{const i=$("#wPseudo");if(i)i.focus()},50);
}
function renderAll(){renderHeader();renderTabs();renderMatchs();renderSlip();renderParis();renderGroupes();renderJeux();renderClassement();renderWelcome()}
function setView(v){const changed=S.view!==v;if(changed&&S.view==="jeux"&&GAMES){GAMES.unmount()}if(changed&&S.view==="casino"&&CASINO)CASINO.leave();S.view=v;S.slipOpen=false;if(v==="groupes"){S.unread=0;renderTabs();S.chatJump=true;S.gJump=true;renderChat()}document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));if(v==="classement"){watchLeaderboard();renderClassement()}if(v==="casino")renderCasino();["matchs","paris","groupes","jeux","classement","casino"].forEach(x=>{const el=$("#v-"+x);el.hidden=x!==v;if(x===v&&changed){el.classList.remove("enter");void el.offsetWidth;el.classList.add("enter")}});$("#slip").hidden=v!=="matchs"&&!S.slip.length;renderSlip();window.scrollTo({top:0});if(v==="jeux")renderJeux();if(v==="paris")renderParis()}
function selectDay(d){S.day=d;S.detail=null;watchDay(d);renderMatchs()}

$("#tabs").addEventListener("click",e=>{const b=e.target.closest("button");if(b)setView(b.dataset.v)});
document.addEventListener("submit",async e=>{
  if(e.target.id==="welcomeForm"){e.preventDefault();const v=$("#wPseudo").value.trim().slice(0,24);if(!v)return;S.me.pseudo=v;S.welcomeDone=true;await save();renderAll();toast("Bienvenue "+v+" ! Bons paris.");return}
  if(e.target.id==="gChatForm"){e.preventDefault();const i=$("#gChatIn"),t=i.value.trim().slice(0,MSG_MAX);if(!t)return;i.value="";S.gDraft="";if(!await sendGlobal({t})){i.value=t;S.gDraft=t}return}
  if(e.target.id!=="chatForm")return;e.preventDefault();
  const i=$("#chatIn"),t=i.value.trim().slice(0,MSG_MAX);if(!t)return;
  i.value="";S.chatDraft="";if(!await sendMsg({t})){i.value=t;S.chatDraft=t}
});
$("#scrim").addEventListener("click",()=>{S.slipOpen=false;renderSlip()});
window.addEventListener("resize",()=>renderSlip());
document.addEventListener("click",e=>{const r=e.target.closest("tr[data-player]");if(r)playerSheet(r.dataset.player)});
document.addEventListener("click",async e=>{
  const t=e.target.closest("button,[id=slipToggle]");if(!t)return;
  if(t.id==="giftOk"){$("#welcome").hidden=true;showGift();return}
  if(S.view==="casino"&&CASINO&&CASINO.click(t))return;
  if(t.id==="pClose"){$("#welcome").hidden=true;return}
  if(t.id==="boostGo"){placeBoost();return}
  if(t.id==="notifOn"){enableNotifs();return}
  if(t.dataset.mmode){S.matchMode=t.dataset.mmode;try{localStorage.setItem("vp-mmode",S.matchMode)}catch(_){}renderMatchs();return}
  if(S.view==="matchs"&&S.matchMode==="live"&&LIVE&&LIVE.click(t))return;
  if(t.id==="pDuel"){$("#welcome").hidden=true;setView("jeux");openGame("duel");if(DUELS)DUELS.challenge({id:t.dataset.uid,pseudo:t.dataset.name});renderJeux();return}
  if(S.view==="jeux"){if(t.dataset.game){openGame(t.dataset.game);return}if(t.hasAttribute("data-game-back")){openGame(null);return}if(S.gameId==="duel"&&DUELS&&DUELS.click(t))return;if(GAMES&&GAMES.click(t))return}
  if(t.dataset.day){selectDay(t.dataset.day)}
  else if(t.dataset.shift){const ds=visibleDays(),i=ds.indexOf(S.day)+Number(t.dataset.shift);if(ds[i])selectDay(ds[i])}
  else if(t.dataset.lg){S.league=t.dataset.lg;const ds=visibleDays();if(!ds.includes(S.day)){S.day=nearestDay(ds);watchDay(S.day)}renderMatchs()}
  else if(t.dataset.open){S.detail=t.dataset.open;S.detailDay=S.day;S.sheetTab="paris";renderMatchs();const v=$("#v-matchs");v.classList.remove("enter");void v.offsetWidth;v.classList.add("enter");window.scrollTo({top:0})}
  else if(t.hasAttribute("data-back")){S.detail=null;renderMatchs()}
  else if(t.dataset.st2){S.sheetTab=t.dataset.st2;renderMatchs()}
  else if(t.dataset.mid){toggleOdd(t.dataset.d,t.dataset.mid,t.dataset.mk)}
  else if(t.dataset.rm!=null){S.slip.splice(Number(t.dataset.rm),1);renderMatchs();renderSlip()}
  else if(t.dataset.st){S.stake=t.dataset.st==="max"?S.me.balance:Number(t.dataset.st);renderSlip()}
  else if(t.id==="slipToggle"){if(window.innerWidth<=980){S.slipOpen=false;renderSlip()}}
  else if(t.id==="fab"){S.slipOpen=true;renderSlip()}
  else if(t.id==="place")place();
  else if(t.dataset.bt){S.betsTab=t.dataset.bt;renderParis()}
  else if(t.dataset.share){const b=S.me.bets.find(x=>x.id===t.dataset.share);if(!b)return;if(!S.activeGroup)openGroup(S.me.groups[0]);if(await sendMsg({kind:"bet",bet:{n:b.legs.length,stake:b.stake,odds:b.odds,legs:b.legs.map(l=>(l.lbl||l.mk)+" · "+(l.mt||"")+" @"+l.odd.toFixed(2))}}))toast("Ticket partagé dans le groupe.")}
  else if(t.id==="installApp"){VPInstall.open(true)}
  else if(t.id==="logout"){if(t.dataset.confirm){VPAuth.signOut()}else{t.dataset.confirm="1";t.textContent="Confirmer ?"}}
  else if(t.id==="wSkip"){S.welcomeDone=true;renderWelcome()}
  else if(t.id==="savePseudo"){S.me.pseudo=$("#pseudo").value.trim().slice(0,24);save();toast("Pseudo enregistré.");renderHeader()}
  else if(t.id==="gCreate")createGroup();
  else if(t.id==="gJoin")joinGroup();
  else if(t.dataset.g)openGroup(t.dataset.g);
  else if(t.dataset.social){S.social=t.dataset.social;if(S.social==="global"){S.unread=0;renderTabs()}renderGroupes()}
  else if(t.dataset.gshare){const b=S.me.bets.find(x=>x.id===t.dataset.gshare);if(!b)return;if(await sendGlobal({kind:"bet",bet:{n:b.legs.length,stake:b.stake,odds:b.odds,legs:b.legs.map(l=>(l.lbl||l.mk)+" · "+(l.mt||"")+" @"+l.odd.toFixed(2))}}))toast("Ticket partagé dans le chat général.")}
  else if(t.id==="copyCode"){const c=S.activeGroup;try{await navigator.clipboard.writeText(c);toast("Code copié : "+c)}catch(_){toast("Code du groupe : "+c)}}
  else if(t.id==="leave"){if(t.dataset.confirm){S.me.groups=S.me.groups.filter(c=>c!==S.activeGroup);await save();openGroup(S.me.groups[0]||null);toast("Tu as quitté le groupe.")}else{t.dataset.confirm="1";t.textContent="Confirmer ?"}}
  else if(t.id==="spin")spin();
  else if(t.id==="penGo")penStart();
  else if(t.dataset.shot!=null)penShot(Number(t.dataset.shot));
  else if(t.id==="savePick"){const F=featured();if(!F)return;const f=F.m,h=Number($("#ph").value),a=Number($("#pa").value);if($("#ph").value===""||$("#pa").value===""||!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0){toast("Entre un score valide.");return}if(phase(f)!=="open")return;S.me.picks[f.id]={h,a,d:F.d};save();toast("Prono enregistré : "+h+"-"+a);renderJeux()}
  else if(t.id==="rescue"){if(S.me.lastRescue===today())return;S.me.lastRescue=today();S.me.balance+=20;save();toast("+20 pts. Bonne reprise !");renderAll()}
});
document.addEventListener("input",e=>{
  if(DUELS&&S.gameId==="duel"&&DUELS.input(e))return;
  if(LIVE&&LIVE.input(e))return;
  if(S.view==="casino"&&CASINO&&CASINO.input(e))return;
  if(e.target.id==="chatIn")S.chatDraft=e.target.value;
  if(e.target.id==="gChatIn")S.gDraft=e.target.value;
  if(e.target.id==="stakeIn"){S.stake=e.target.value===""?"":Number(e.target.value);const pos=e.target.selectionStart;renderSlip();const i=$("#stakeIn");if(i){i.focus();try{i.setSelectionRange(pos,pos)}catch(_){}}}
});

renderAll();setView("matchs");
setInterval(()=>{renderHeader();if(S.view==="matchs"&&S.matchMode!=="live")renderMatchs()},30000);
setInterval(()=>{if(S.view==="matchs"&&S.matchMode==="live"&&!S.detail&&LIVE&&LIVE.tick())renderMatchs()},1000);
setInterval(()=>{if(LIVE&&S.mode==="cloud")LIVE.settle()},15000);
setInterval(()=>{refreshPendingDays()},5*60000);

(async function boot(){
  if(!window.VP||!window.VPAuth){S.mode="local";renderAll();return}
  await (window.VPInstall?VPInstall.open():Promise.resolve());
  const session=await VPAuth.ensure();
  const user=VP.userApi(session),db=VP.db;
  S.user=user;S.db=db;S.uid=session.user.id;S.email=session.user.email;
  if(user.pseudo)S.names[S.uid]=user.pseudo;
  let mt=setTimeout(()=>{if(!S.meta){S.metaErr=true;renderMatchs()}},10000);
  db.doc("meta/season").onSnapshot(s=>{clearTimeout(mt);S.metaErr=false;S.meta=s.exists?s.data():{days:{}};const ds=visibleDays();if(!S.days[S.day]&&!ds.includes(S.day)){S.day=nearestDay(ds)}if(!S.daySub)watchDay(S.day);renderMatchs()},()=>{clearTimeout(mt);S.metaErr=true;renderMatchs()});
  let snap=null;
  try{snap=await Promise.race([db.doc("players/"+S.uid).get(),new Promise((_,r)=>setTimeout(()=>r(new Error("timeout")),10000))])}
  catch(e){toast("Ton compte n'est pas joignable pour l'instant. Vérifie ta connexion.");S.mode="local";renderAll();return}
  S.mode="cloud";
  if(snap.exists){S.me=normalize(snap.data());if(S.me.score!==scoreOf(S.me))save()}
  else{S.me=freshPlayer();S.me.pseudo=user.pseudo||"";await save();if(S.me.pseudo){S.welcomeDone=true;setTimeout(()=>toast("Bienvenue "+S.me.pseudo+" ! Voici tes "+START+" pts de départ."),400)}}
  await loadGroupMeta();
  renderAll();setView(S.view);
  if(S.me.groups.length)openGroup(S.me.groups[0]);
  watchGlobal();watchLeaderboard();if(LIVE)LIVE.settle();
  if(DUELS)DUELS.watch();
  watchGifts();watchBoost();checkNotifs();
  refreshPendingDays();
})();
})();
