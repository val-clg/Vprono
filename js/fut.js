/* Vprono Club: player cards, packs, collection, objectives, cosmetic shop.
 * Everything here is bought with points earned in the app. The only real-money items are cosmetic
 * (Supporter), sold at a fixed price, never points and never random packs.
 * VPFut(core) -> { render, click, input, track, badge, style, nameHtml, avatarFrame, onGiftItems } */
window.VPFut = function (core) {
  "use strict";
  const { S, esc, save, toast } = core;
  const rand = (n) => { const a = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; };
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const flag = (cc) => { if (cc === "GB-ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿"; if (cc === "GB-SCT") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿"; if (cc === "GB-NIR") return "🇬🇧"; if (cc === "XK") return "🇽🇰"; return cc.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))); };

  /* ---------- card set ---------- */
  const RAR = {
    c: { name: "Commune", sell: 3, cls: "r-c" }, r: { name: "Rare", sell: 10, cls: "r-r" }, e: { name: "Épique", sell: 30, cls: "r-e" },
    l: { name: "Légende", sell: 90, cls: "r-l" }, i: { name: "Icône", sell: 300, cls: "r-i" },
  };
  const ORDER = ["c", "r", "e", "l", "i"];
  const CARDS = [], BY = {}, POOL = { c: [], r: [], e: [], l: [], i: [] };
  let section = "";
  for (const line of (window.VP_CARDS_RAW || "").split("\n")) {
    const t = line.trim(); if (!t) continue;
    if (t.startsWith("#")) { section = t.slice(1).trim(); continue; }
    const [name, pos, nat, club, ovr] = t.split("|"); const o = Number(ovr); if (!o) continue;
    const r = section === "ICONS" ? "i" : o >= 86 ? "l" : o >= 83 ? "e" : o >= 80 ? "r" : "c";
    const c = { id: slug(name), name, pos, nat, club, ovr: o, r, league: section };
    if (BY[c.id]) continue; CARDS.push(c); BY[c.id] = c; POOL[r].push(c);
  }
  const owned = () => (S.me.cards && typeof S.me.cards === "object" ? S.me.cards : (S.me.cards = {}));
  const inv = () => (S.me.packs && typeof S.me.packs === "object" ? S.me.packs : (S.me.packs = {}));
  const items = () => (S.me.items && typeof S.me.items === "object" ? S.me.items : (S.me.items = {}));
  const eq = () => (S.me.eq && typeof S.me.eq === "object" ? S.me.eq : (S.me.eq = {}));

  /* ---------- packs ---------- */
  const PACKS = {
    bronze: { name: "Pack Bronze", price: 40, n: 3, odds: { c: 820, r: 150, e: 27, l: 2.8, i: 0.2 }, guard: null, color: "#B07A45" },
    argent: { name: "Pack Argent", price: 120, n: 4, odds: { c: 600, r: 320, e: 65, l: 13, i: 2 }, guard: "r", color: "#AEB6C4" },
    or: { name: "Pack Or", price: 300, n: 5, odds: { c: 350, r: 420, e: 180, l: 42, i: 8 }, guard: "e", color: "#E8B923" },
    premium: { name: "Pack Premium", price: 800, n: 6, odds: { c: 0, r: 500, e: 350, l: 120, i: 30 }, guard: "e", color: "#9B5CFF" },
    icone: { name: "Pack Icône", price: 2500, n: 3, odds: { c: 0, r: 0, e: 400, l: 450, i: 150 }, guard: "l", color: "#F4E3B1" },
    createur: { name: "Pack Créateur", price: 0, n: 7, odds: { c: 0, r: 0, e: 0, l: 550, i: 450 }, guard: "l", color: "#FF2D55", hidden: true },
  };
  function drawRarity(odds, min) {
    const ks = ORDER.filter((k) => ORDER.indexOf(k) >= ORDER.indexOf(min || "c") && odds[k] > 0);
    const tot = ks.reduce((s, k) => s + odds[k], 0); let u = (rand(1e6) / 1e6) * tot;
    for (const k of ks) { if (u < odds[k]) return k; u -= odds[k]; } return ks[ks.length - 1];
  }
  function openPack(kind) {
    const P = PACKS[kind]; const out = [];
    for (let i = 0; i < P.n; i++) out.push(drawRarity(P.odds, i === 0 && P.guard ? P.guard : "c"));
    if (kind === "icone" && rand(100) < 20) out[0] = "i";
    if (kind === "createur") { out[0] = "i"; out[1] = "i"; out[2] = "i"; }   // 3 Icons guaranteed, the rest Légende or Icône
    const cards = out.map((r) => POOL[r][rand(POOL[r].length)]);
    cards.sort((a, b) => ORDER.indexOf(a.r) - ORDER.indexOf(b.r) || a.ovr - b.ovr);   // best card revealed last
    const O = owned(); const fresh = cards.map((c) => !O[c.id]);
    cards.forEach((c) => (O[c.id] = (O[c.id] || 0) + 1));
    const st = S.me.club || (S.me.club = {}); st.packs = (st.packs || 0) + 1;
    if (cards.some((c) => c.r === "l" || c.r === "i")) st.bigPulls = (st.bigPulls || 0) + 1;
    track("pack"); milestones(); save();
    return { kind, cards, fresh };
  }
  function buyPack(kind) {
    const P = PACKS[kind];
    if (S.me.balance < P.price) { toast("Il te faut " + P.price + " pts pour ce pack."); return; }
    S.me.balance -= P.price; core.bumpBalance(); showOpening(openPack(kind));
  }
  function useFreePack(kind) { const I = inv(); if (!I[kind]) return; I[kind]--; showOpening(openPack(kind)); }

  /* ---------- card rendering ---------- */
  const SIL = `<svg viewBox="0 0 100 80" aria-hidden="true"><circle cx="50" cy="26" r="17"/><path d="M14 80c2-20 17-32 36-32s34 12 36 32z"/></svg>`;
  function cardHtml(c, opts = {}) {
    const n = owned()[c.id] || 0, locked = opts.locked && !n;
    return `<div class="fcard ${RAR[c.r].cls} ${locked ? "locked" : ""} ${opts.big ? "big" : ""}" ${opts.click ? `data-fcard="${c.id}"` : ""} role="${opts.click ? "button" : "img"}" tabindex="${opts.click ? 0 : -1}" aria-label="${esc(c.name)}, ${c.ovr}, ${RAR[c.r].name}">
      <div class="fc-top"><b class="num">${locked ? "?" : c.ovr}</b><span>${c.pos}</span><i>${flag(c.nat)}</i></div>
      <div class="fc-sil">${SIL}</div>
      <div class="fc-name">${locked ? "???" : esc(c.name)}</div><div class="fc-club">${locked ? RAR[c.r].name : esc(c.club)}</div>
      ${opts.count && n > 1 ? `<span class="fc-count num">×${n}</span>` : ""}${opts.isNew ? `<span class="fc-new">NOUVEAU</span>` : ""}</div>`;
  }

  /* ---------- opening animation ---------- */
  let OPEN = null;
  function showOpening(res) {
    OPEN = { res, step: -1 };
    const ov = document.getElementById("fOpen") || Object.assign(document.createElement("div"), { id: "fOpen", className: "f-open" });
    document.body.appendChild(ov); renderOpening();
  }
  function renderOpening() {
    const ov = document.getElementById("fOpen"); if (!ov || !OPEN) return;
    const { res, step } = OPEN, P = PACKS[res.kind], best = res.cards[res.cards.length - 1];
    if (step === -1) {
      ov.innerHTML = `<div class="fo-stage"><button class="fo-pack shake" data-fopen="1" style="--pc:${P.color}" aria-label="Ouvrir le pack"><span>${esc(P.name)}</span><b>V</b><small>Touche pour ouvrir</small></button></div>`;
      return;
    }
    if (step < res.cards.length) {
      const c = res.cards[step], walk = c.r === "l" || c.r === "i";
      ov.innerHTML = `<div class="fo-stage ${walk ? "walkout " + RAR[c.r].cls : ""}">
        ${walk && !OPEN.walked ? `<div class="fo-walk"><div class="fo-flag">${flag(c.nat)}</div><div class="fo-pos">${c.pos}</div><div class="fo-club">${esc(c.club)}</div></div>`
          : `<div class="fo-card reveal">${cardHtml(c, { big: true, isNew: res.fresh[step] })}</div><p class="fo-rar ${RAR[c.r].cls}">${RAR[c.r].name}${res.fresh[step] ? " · nouvelle carte !" : " · doublon"}</p>`}
        <p class="fo-count">${step + 1} / ${res.cards.length}</p><button class="cta" data-fnext="1">${walk && !OPEN.walked ? "Révéler" : step < res.cards.length - 1 ? "Carte suivante" : "Voir le pack"}</button></div>`;
      if (walk && !OPEN.walked) setTimeout(() => { if (OPEN && OPEN.step === step && !OPEN.walked) { OPEN.walked = true; renderOpening(); } }, 1900);
      return;
    }
    ov.innerHTML = `<div class="fo-stage"><h2>${esc(P.name)}</h2><div class="fo-grid">${res.cards.map((c, i) => cardHtml(c, { isNew: res.fresh[i] })).join("")}</div>
      <p class="note">${res.fresh.filter(Boolean).length} nouvelle${res.fresh.filter(Boolean).length > 1 ? "s" : ""} carte${res.fresh.filter(Boolean).length > 1 ? "s" : ""} dans ta collection.</p>
      <button class="cta" data-fclose="1">Super !</button></div>`;
    if (best.r === "i" || best.r === "l") core.toastBig && core.toastBig(best);
  }

  /* ---------- objectives ---------- */
  const parisDay = () => core.today();
  function weekKey() { const d = new Date(core.today() + "T12:00:00Z"); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); }
  const DAILY = [
    { id: "d_bet", ev: "bet", n: 2, label: "Place 2 paris", reward: "bronze" },
    { id: "d_win", ev: "win", n: 1, label: "Gagne 1 pari", reward: "argent" },
    { id: "d_game", ev: "game", n: 3, label: "Joue 3 parties de mini-jeux", reward: "bronze" },
    { id: "d_casino", ev: "casino", n: 5, label: "Joue 5 tours au casino", reward: "bronze" },
    { id: "d_chat", ev: "chat", n: 1, label: "Envoie un message dans le chat", reward: "bronze" },
  ];
  const WEEKLY = [
    { id: "w_duel", ev: "duel_win", n: 2, label: "Gagne 2 duels", reward: "or" },
    { id: "w_win", ev: "win", n: 5, label: "Gagne 5 paris", reward: "or" },
    { id: "w_pack", ev: "pack", n: 5, label: "Ouvre 5 packs", reward: "argent" },
    { id: "w_flash", ev: "flash", n: 3, label: "Place 3 paris flash", reward: "argent" },
    { id: "w_all", ev: "daily_all", n: 3, label: "Termine tous les objectifs du jour 3 fois", reward: "premium" },
  ];
  const MILES = [
    { id: "m_25", test: (n) => n >= 25, label: "Collectionne 25 cartes différentes", reward: "argent" },
    { id: "m_75", test: (n) => n >= 75, label: "Collectionne 75 cartes différentes", reward: "or" },
    { id: "m_150", test: (n) => n >= 150, label: "Collectionne 150 cartes différentes", reward: "premium" },
    { id: "m_300", test: (n) => n >= 300, label: "Collectionne 300 cartes différentes", reward: "icone" },
    { id: "m_leg", test: () => CARDS.some((c) => (c.r === "l" || c.r === "i") && owned()[c.id]), label: "Obtiens ta 1re Légende ou Icône", reward: "or" },
  ];
  function obj() {
    const o = S.me.obj && typeof S.me.obj === "object" ? S.me.obj : (S.me.obj = {});
    if (o.day !== parisDay()) { o.day = parisDay(); o.d = {}; o.dc = {}; }
    if (o.week !== weekKey()) { o.week = weekKey(); o.w = {}; o.wc = {}; }
    o.mc = o.mc || {}; return o;
  }
  function track(ev, k = 1) { if (core.mode() !== "cloud") return; const o = obj(); o.d[ev] = (o.d[ev] || 0) + k; o.w[ev] = (o.w[ev] || 0) + k; core.renderBadges(); }
  function claim(id) {
    const o = obj(); let def = DAILY.find((x) => x.id === id), scope = "d";
    if (!def) { def = WEEKLY.find((x) => x.id === id); scope = "w"; }
    if (!def) { def = MILES.find((x) => x.id === id); scope = "m"; }
    if (!def) return;
    const done = scope === "m" ? def.test(Object.keys(owned()).length) : (o[scope][def.ev] || 0) >= def.n;
    const claimed = o[scope + "c"]; if (!done || claimed[id]) return;
    claimed[id] = true; inv()[def.reward] = (inv()[def.reward] || 0) + 1;
    if (scope === "d" && DAILY.every((x) => o.dc[x.id])) { o.w.daily_all = (o.w.daily_all || 0) + 1; }
    save(); toast("🎁 " + PACKS[def.reward].name + " gagné ! Ouvre-le dans « Mes packs »."); core.rerender();
  }
  function claimable() {
    const o = obj(); let n = 0;
    DAILY.forEach((x) => { if ((o.d[x.ev] || 0) >= x.n && !o.dc[x.id]) n++; });
    WEEKLY.forEach((x) => { if ((o.w[x.ev] || 0) >= x.n && !o.wc[x.id]) n++; });
    MILES.forEach((x) => { if (x.test(Object.keys(owned()).length) && !o.mc[x.id]) n++; });
    return n;
  }
  function milestones() { /* rewards are claimed by hand in Objectifs; nothing automatic */ }

  /* ---------- cosmetics ---------- */
  const SHOP = [
    { id: "col_ocean", kind: "color", name: "Pseudo Océan", price: 150, css: "linear-gradient(90deg,#1FA2FF,#12D8FA)" },
    { id: "col_feu", kind: "color", name: "Pseudo Feu", price: 250, css: "linear-gradient(90deg,#FF512F,#F09819)" },
    { id: "col_jungle", kind: "color", name: "Pseudo Jungle", price: 250, css: "linear-gradient(90deg,#11998E,#38EF7D)" },
    { id: "col_royal", kind: "color", name: "Pseudo Royal", price: 400, css: "linear-gradient(90deg,#8E2DE2,#4A00E0)" },
    { id: "col_or", kind: "color", name: "Pseudo Or", price: 800, css: "linear-gradient(90deg,#B8860B,#FFD700,#B8860B)" },
    { id: "fr_bronze", kind: "frame", name: "Cadre Bronze", price: 200, css: "#B07A45" },
    { id: "fr_argent", kind: "frame", name: "Cadre Argent", price: 400, css: "#C9D1DE" },
    { id: "fr_or", kind: "frame", name: "Cadre Or", price: 900, css: "#E8B923" },
    { id: "fr_icone", kind: "frame", name: "Cadre Icône", price: 2500, css: "conic-gradient(#F4E3B1,#fff,#E8B923,#F4E3B1)" },
    { id: "bd_ballon", kind: "badge", name: "Badge Ballon", price: 100, emoji: "⚽" },
    { id: "bd_feu", kind: "badge", name: "Badge En feu", price: 150, emoji: "🔥" },
    { id: "bd_chevre", kind: "badge", name: "Badge GOAT", price: 300, emoji: "🐐" },
    { id: "bd_crane", kind: "badge", name: "Badge Tête brûlée", price: 300, emoji: "💀" },
    { id: "bd_couronne", kind: "badge", name: "Badge Couronne", price: 600, emoji: "👑" },
    { id: "bd_fusee", kind: "badge", name: "Badge Fusée", price: 400, emoji: "🚀" },
  ];
  const SUPPORTER = [
    { id: "pass_supporter", name: "Pass Supporter", eur: "2.99", desc: "Badge 💎 Supporter, pseudo Arc-en-ciel animé, cadre Diamant, et ton nom en tête des remerciements.", grants: ["bd_diamant", "col_arcenciel", "fr_diamant"] },
    { id: "pack_neon", name: "Pack Néon", eur: "1.49", desc: "Pseudo Néon qui brille et cadre Néon.", grants: ["col_neon", "fr_neon"] },
  ];
  const EXCLU = [
    { id: "bd_diamant", kind: "badge", name: "Badge Supporter", emoji: "💎" },
    { id: "col_arcenciel", kind: "color", name: "Pseudo Arc-en-ciel", css: "linear-gradient(90deg,#ff004c,#ff8a00,#ffe600,#2bd96b,#1fa2ff,#8e2de2,#ff004c)", anim: 1 },
    { id: "fr_diamant", kind: "frame", name: "Cadre Diamant", css: "conic-gradient(#7FDBFF,#fff,#B19CFF,#7FDBFF)" },
    { id: "col_neon", kind: "color", name: "Pseudo Néon", css: "linear-gradient(90deg,#00F5A0,#00D9F5)", glow: 1 },
    { id: "fr_neon", kind: "frame", name: "Cadre Néon", css: "#00F5A0" },
    { id: "col_createur", kind: "color", name: "Pseudo Créateur", css: "linear-gradient(90deg,#FFD700,#FF2D55,#FF8A00,#FFD700,#FF2D55)", anim: 1, glow: 1 },
    { id: "fr_createur", kind: "frame", name: "Cadre Créateur", css: "conic-gradient(#FFD700,#FF2D55,#FF8A00,#FFF3B0,#FFD700)" },
    { id: "bd_createur", kind: "badge", name: "Badge Fondateur", emoji: "🛠️" },
  ];
  const ITEM = Object.fromEntries(SHOP.concat(EXCLU).map((x) => [x.id, x]));
  function buyItem(id) {
    const it = SHOP.find((x) => x.id === id); if (!it || items()[id]) return;
    if (S.me.balance < it.price) { toast("Il te faut " + it.price + " pts."); return; }
    S.me.balance -= it.price; items()[id] = true; eq()[it.kind] = id; core.bumpBalance(); save();
    toast("✨ " + it.name + " débloqué et équipé !"); core.rerender(); core.restyle();
  }
  function equip(kind, id) { if (id && !items()[id]) return; eq()[kind] = id || null; save(); core.rerender(); core.restyle(); }

  /* style of any player (data = their player document) */
  function styleOf(data) {
    const e = (data && data.eq) || {}, has = (id) => id && data && data.items && data.items[id];
    return { color: has(e.color) ? ITEM[e.color] : null, frame: has(e.frame) ? ITEM[e.frame] : null, badge: has(e.badge) ? ITEM[e.badge] : null };
  }
  function nameHtml(name, data) {
    const st = styleOf(data), uid = data && (data.uid || (data === S.me ? S.uid : null));
    const creator = uid && uid === (window.VPRONO_CONFIG || {}).creatorId ? ` <span class="creator-tag">👑 Créateur</span>` : "";
    const col = st.color ? ` class="vp-name ${st.color.anim ? "anim" : ""} ${st.color.glow ? "glow" : ""}" style="background-image:${st.color.css}"` : "";
    return `<span${col}>${esc(name)}</span>${st.badge ? ` <span class="vp-badge" title="${esc(st.badge.name)}">${st.badge.emoji}</span>` : ""}${creator}`;
  }
  function frameStyle(data) { const st = styleOf(data); return st.frame ? `box-shadow:0 0 0 3px var(--bg),0 0 0 6px transparent;background-clip:padding-box;outline:3px solid transparent;--fr:${st.frame.css}` : ""; }
  function frameClass(data) { return styleOf(data).frame ? "vp-framed" : ""; }

  /* ---------- Supporter purchase (manual confirmation by the creator) ---------- */
  async function requestPurchase(id) {
    const p = SUPPORTER.find((x) => x.id === id); if (!p) return;
    if (!S.me.pseudo) { toast("Choisis d'abord un pseudo dans « Paris »."); return; }
    const code = "VP-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    try { await core.requestPurchase({ item: id, price: p.eur, code }); } catch (e) { toast("Impossible d'enregistrer la demande. Réessaie."); return; }
    const pm = (window.VPRONO_CONFIG || {}).paypalMe || "";
    const url = pm ? pm.replace(/\/$/, "") + "/" + p.eur + "EUR" : "";
    const w = document.getElementById("welcome"); w.hidden = false;
    w.innerHTML = `<div class="card glass gift-card" role="dialog" aria-modal="true"><div class="gift-box">💎</div><h2>${esc(p.name)} · ${p.eur.replace(".", ",")} €</h2>
      <p class="sub">1. Paie avec PayPal en ajoutant ce code dans le message :</p><p class="code">${code}</p>
      <p class="sub">2. Dès que le paiement est reçu, ${esc(p.name)} arrive dans ton compte (en général sous 24 h), avec une notification cadeau.</p>
      ${url ? `<a class="cta" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">Payer ${p.eur.replace(".", ",")} € avec PayPal</a>` : ""}
      <button class="linkbtn" id="pClose">Fermer</button><p class="note">Achat 100 % cosmétique : aucun point, aucun pack, aucun avantage en jeu.</p></div>`;
  }
  function onGiftItems(list) { (list || []).forEach((id) => { if (ITEM[id]) items()[id] = true; else if (/^pack:/.test(id) && PACKS[id.slice(5)]) { const k = id.slice(5); inv()[k] = (inv()[k] || 0) + 1; } }); const any = (list || []).find((id) => ITEM[id]); if (any) { const k = ITEM[any].kind; if (!eq()[k]) eq()[k] = any; } }

  /* ---------- views ---------- */
  const V = { tab: "shop", filter: "all", sel: null };
  function packTile(kind, free) {
    const P = PACKS[kind], o = P.odds, tot = ORDER.reduce((s, k) => s + o[k], 0), pct = (k) => (o[k] ? ((o[k] / tot) * 100).toFixed(o[k] / tot < 0.01 ? 2 : 1) + " %" : "–");
    return `<div class="pack-tile glass"><div class="pack-art" style="--pc:${P.color}"><b>V</b><span>${P.n} cartes</span></div><div class="pack-info"><h3>${P.name}</h3>
      <small class="note">Par carte : Rare ${pct("r")} · Épique ${pct("e")} · Légende ${pct("l")} · Icône ${pct("i")}${P.guard ? ` · 1 ${RAR[P.guard].name} minimum` : ""}${kind === "icone" ? " · 20 % de chance d'Icône garantie" : ""}</small></div>
      ${free ? `<button class="cta" data-fusepack="${kind}">Ouvrir (${free})</button>` : `<button class="cta" data-fbuy="${kind}" ${S.me.balance < P.price ? "disabled" : ""}>${P.price} pts</button>`}</div>`;
  }
  function shopHtml() {
    const I = inv(), mine = Object.keys(PACKS).filter((k) => I[k] > 0);
    const it = (x) => { const own = items()[x.id]; const prev = x.kind === "badge" ? `<span class="prev-badge">${x.emoji}</span>` : x.kind === "color" ? `<span class="vp-name prev-name" style="background-image:${x.css}">Pseudo</span>` : `<span class="prev-frame" style="--fr:${x.css}"></span>`;
      return `<div class="shop-item glass">${prev}<b>${esc(x.name)}</b>${own ? `<button class="ghost" data-fequip="${x.kind}:${x.id}" ${eq()[x.kind] === x.id ? "disabled" : ""}>${eq()[x.kind] === x.id ? "Équipé" : "Équiper"}</button>` : `<button class="cta" data-fitem="${x.id}" ${S.me.balance < x.price ? "disabled" : ""}>${x.price} pts</button>`}</div>`; };
    return `${mine.length ? `<h3>🎁 Mes packs</h3><div class="pack-list">${mine.map((k) => packTile(k, I[k])).join("")}</div>` : ""}
      <h3>Packs de cartes</h3><p class="sub">Les vraies stars du foot et les Icônes de légende. Les doublons se revendent dans ta collection.</p>
      <div class="pack-list">${Object.keys(PACKS).filter((k) => !PACKS[k].hidden).map((k) => packTile(k)).join("")}</div>
      <h3>Style</h3><p class="sub">Couleurs de pseudo, cadres et badges, visibles au classement et dans le chat.</p>
      <div class="shop-grid">${SHOP.map(it).join("")}</div>
      <h3>💎 Soutenir Vprono</h3><p class="sub">Des objets exclusifs pour ceux qui veulent aider l'appli. 100 % cosmétique : aucun point, aucun pack, aucun avantage en jeu.</p>
      <div class="pack-list">${SUPPORTER.map((p) => { const own = p.grants.every((g) => items()[g]); return `<div class="pack-tile glass supporter"><div class="pack-art sup"><b>💎</b></div><div class="pack-info"><h3>${esc(p.name)}</h3><small class="note">${esc(p.desc)}</small></div>${own ? `<span class="pill real">Débloqué</span>` : `<button class="cta" data-fsup="${p.id}">${p.eur.replace(".", ",")} €</button>`}</div>`; }).join("")}</div>`;
  }
  function collectionHtml() {
    const O = owned(), have = CARDS.filter((c) => O[c.id]).length;
    const per = ORDER.map((r) => { const t = POOL[r].length, h = POOL[r].filter((c) => O[c.id]).length; return `<span class="pill ${RAR[r].cls}-pill">${RAR[r].name} ${h}/${t}</span>`; }).join("");
    const filt = V.filter;
    const list = CARDS.filter((c) => filt === "all" ? true : filt === "mine" ? O[c.id] : filt === "dup" ? O[c.id] > 1 : c.r === filt)
      .sort((a, b) => ORDER.indexOf(b.r) - ORDER.indexOf(a.r) || b.ovr - a.ovr || a.name.localeCompare(b.name));
    const dupVal = CARDS.reduce((s, c) => s + Math.max(0, (O[c.id] || 0) - 1) * RAR[c.r].sell, 0);
    return `<div class="coll-head"><div><b class="num">${have}</b> / ${CARDS.length} cartes</div><div class="coll-bar"><i style="width:${(have / CARDS.length) * 100}%"></i></div></div>
      <div class="chips">${per}</div>
      <div class="chips">${[["all", "Toutes"], ["mine", "Mes cartes"], ["dup", "Doublons"], ["i", "Icônes"], ["l", "Légendes"], ["e", "Épiques"], ["r", "Rares"], ["c", "Communes"]].map(([k, l]) => `<button data-ffilter="${k}" aria-pressed="${filt === k}">${l}</button>`).join("")}</div>
      ${dupVal ? `<button class="ghost" data-fselldup="1">Vendre tous les doublons · +${dupVal} pts</button>` : ""}
      <div class="card-grid">${list.slice(0, 600).map((c) => cardHtml(c, { locked: true, count: true, click: true })).join("") || `<p class="empty">Aucune carte ici pour l'instant.</p>`}</div>`;
  }
  function objectivesHtml() {
    const o = obj(), nOwned = Object.keys(owned()).length;
    const row = (x, have, scope) => { const done = scope === "m" ? x.test(nOwned) : have >= x.n, got = o[scope + "c"][x.id];
      return `<div class="obj ${done ? "done" : ""}"><div><b>${esc(x.label)}</b><small class="note">${scope === "m" ? "" : Math.min(have, x.n) + " / " + x.n + " · "}Récompense : ${PACKS[x.reward].name}</small>${scope === "m" ? "" : `<span class="obj-bar"><i style="width:${Math.min(100, (have / x.n) * 100)}%"></i></span>`}</div>
        ${got ? `<span class="pill real">Récupéré</span>` : `<button class="cta" data-fclaim="${x.id}" ${done ? "" : "disabled"}>Récupérer</button>`}</div>`; };
    return `<h3>Aujourd'hui</h3><div class="obj-list">${DAILY.map((x) => row(x, o.d[x.ev] || 0, "d")).join("")}</div>
      <h3>Cette semaine</h3><div class="obj-list">${WEEKLY.map((x) => row(x, o.w[x.ev] || 0, "w")).join("")}</div>
      <h3>Collection</h3><div class="obj-list">${MILES.map((x) => row(x, 0, "m")).join("")}</div>`;
  }
  function styleHtml() {
    const kinds = [["color", "Couleur du pseudo"], ["frame", "Cadre"], ["badge", "Badge"]];
    const mine = (k) => Object.keys(items()).filter((id) => ITEM[id] && ITEM[id].kind === k);
    return `<div class="glass panel"><span class="label">Aperçu</span><div class="style-prev"><span class="lb-av big ${frameClass(S.me)}" style="${ITEM[eq().frame] && items()[eq().frame] ? "--fr:" + ITEM[eq().frame].css : ""}">${esc((S.me.pseudo || "?").slice(0, 1).toUpperCase())}</span><b>${nameHtml(S.me.pseudo || "Toi", S.me)}</b></div></div>
      ${kinds.map(([k, l]) => `<h3>${l}</h3><div class="chips">${`<button data-fequip="${k}:" aria-pressed="${!eq()[k]}">Aucun</button>`}${mine(k).map((id) => `<button data-fequip="${k}:${id}" aria-pressed="${eq()[k] === id}">${ITEM[id].emoji ? ITEM[id].emoji + " " : ""}${esc(ITEM[id].name)}</button>`).join("") || `<span class="note">Rien pour l'instant : passe à la boutique !</span>`}</div>`).join("")}`;
  }
  function cardSheet(id) {
    const c = BY[id], n = owned()[id] || 0; if (!c) return;
    const w = document.getElementById("welcome"); w.hidden = false;
    w.innerHTML = `<div class="card glass gift-card" role="dialog" aria-modal="true">${cardHtml(c, { big: true, locked: true })}
      <p class="sub">${RAR[c.r].name} · ${esc(c.club)} · ${n ? "tu l'as en " + n + " exemplaire" + (n > 1 ? "s" : "") : "pas encore dans ta collection"}</p>
      ${n > 1 ? `<button class="ghost" data-fsell="${id}">Vendre un doublon · +${RAR[c.r].sell} pts</button>` : ""}<button class="cta" id="pClose">Fermer</button></div>`;
  }
  function welcomeGift() {
    const st = S.me.club || (S.me.club = {});
    if (st.welcome || core.mode() !== "cloud") return;
    st.welcome = 1; const I = inv(); I.bronze = (I.bronze || 0) + 1; I.argent = (I.argent || 0) + 1; save();
    toast("🎁 Bienvenue au Club ! 1 Pack Bronze et 1 Pack Argent offerts.");
  }
  function render() {
    welcomeGift();
    const tabs = [["shop", "🛍️ Boutique"], ["coll", "📒 Collection"], ["obj", "🎯 Objectifs"], ["style", "✨ Mon style"]];
    const nc = claimable();
    return `<div><h2>Club Vprono</h2><p class="sub">Ouvre des packs, complète ta collection des stars du foot et des Icônes, et personnalise ton profil.</p></div>
      <div class="seg glass fut-tabs">${tabs.map(([k, l]) => `<button data-ftab="${k}" aria-pressed="${V.tab === k}">${l}${k === "obj" && nc ? ` <span class="badge num">${nc}</span>` : ""}</button>`).join("")}</div>
      ${V.tab === "shop" ? shopHtml() : V.tab === "coll" ? collectionHtml() : V.tab === "obj" ? objectivesHtml() : styleHtml()}`;
  }
  function click(t) {
    const d = t.dataset;
    if (d.ftab) { V.tab = d.ftab; core.rerender(); return true; }
    if (d.fbuy) { buyPack(d.fbuy); return true; }
    if (d.fusepack) { useFreePack(d.fusepack); return true; }
    if (d.fopen) { OPEN.step = 0; OPEN.walked = false; renderOpening(); return true; }
    if (d.fnext) { const c = OPEN.res.cards[OPEN.step]; if ((c.r === "l" || c.r === "i") && !OPEN.walked) { OPEN.walked = true; } else { OPEN.step++; OPEN.walked = false; } renderOpening(); return true; }
    if (d.fclose) { const ov = document.getElementById("fOpen"); if (ov) ov.remove(); OPEN = null; core.rerender(); return true; }
    if (d.ffilter) { V.filter = d.ffilter; core.rerender(); return true; }
    if (d.fcard) { cardSheet(d.fcard); return true; }
    if (d.fsell) { const c = BY[d.fsell], O = owned(); if (c && O[c.id] > 1) { O[c.id]--; S.me.balance += RAR[c.r].sell; core.bumpBalance(); save(); toast("+" + RAR[c.r].sell + " pts"); cardSheet(c.id); core.rerender(); } return true; }
    if (d.fselldup) { const O = owned(); let g = 0; CARDS.forEach((c) => { const x = (O[c.id] || 0) - 1; if (x > 0) { g += x * RAR[c.r].sell; O[c.id] = 1; } }); if (g) { S.me.balance += g; core.bumpBalance(); save(); toast("Doublons vendus : +" + g + " pts"); core.rerender(); } return true; }
    if (d.fclaim) { claim(d.fclaim); return true; }
    if (d.fitem) { buyItem(d.fitem); return true; }
    if (d.fequip != null) { const [k, id] = d.fequip.split(":"); equip(k, id); return true; }
    if (d.fsup) { requestPurchase(d.fsup); return true; }
    return false;
  }
  function summary() {
    const I = inv(), packs = Object.keys(PACKS).reduce((s, k) => s + (I[k] || 0), 0), o = obj();
    const best = CARDS.filter((c) => owned()[c.id]).sort((a, b) => ORDER.indexOf(b.r) - ORDER.indexOf(a.r) || b.ovr - a.ovr)[0];
    return { packs, have: Object.keys(owned()).length, total: CARDS.length, claim: claimable(), dailyDone: DAILY.filter((x) => (o.d[x.ev] || 0) >= x.n).length, dailyTotal: DAILY.length,
      best: best ? cardHtml(best) : "", nextDaily: DAILY.find((x) => (o.d[x.ev] || 0) < x.n) };
  }
  return { render, click, track, claimable, summary, setTab: (t) => { V.tab = t; }, nameHtml, frameClass, styleOf, onGiftItems, count: () => CARDS.length, item: (id) => ITEM[id] };
};
