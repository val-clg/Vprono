/* Vprono "Live flash": quick bets that run all day, for the wait between real matches.
 *  - Match virtuel: a simulated football match every 4 minutes (90 minutes played in 3), live score.
 *  - Course hippique virtuelle: a 6-horse race every 2 minutes.
 *  - Bitcoin 5 min: will the real BTC price be higher or lower at the end of the next 5-minute round?
 * Virtual events are drawn from a seed of their time slot, so every player sees the same match and the same race.
 * VPLive(core) -> { render, tick, click, input, settle, pendingStake } */
window.VPLive = function (core) {
  "use strict";
  const { S, esc, save, toast } = core;
  const L = { stakes: { vf: 10, hr: 10, btc: 10 }, btc: { price: null, hist: [], err: false, last: 0 }, slotVf: -1, slotHr: -1, open: false };
  const bets = () => (Array.isArray(S.me.lbets) ? S.me.lbets : (S.me.lbets = []));
  const now = () => Date.now();
  const SALT = "vprono-live-1";
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; // same order on every device
  function rng(seed) { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
  const pois = (l, k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; };
  const odd = (p, m) => Math.max(1.05, Math.round(100 / (p * m)) / 100);
  const fmtS = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return (s >= 60 ? Math.floor(s / 60) + " min " : "") + (s % 60) + " s"; };

  /* ---------- Match virtuel ---------- */
  const VF_SLOT = 240000, VF_PLAY = 180000;
  const CLUBS = [["Racing Lumière", 82], ["Les Comètes", 79], ["Olympique Azur", 77], ["FC Tempête", 75], ["Union Volcan", 74], ["Sporting Néon", 72], ["AS Boréale", 71], ["Real Sirocco", 70],
    ["Stade Mistral", 68], ["Dynamo Zénith", 67], ["Athletic Orage", 66], ["FC Météore", 65], ["US Galaxie", 64], ["Inter Aurore", 63], ["Celtic Brume", 62], ["Club Éclipse", 60]];
  function vfMatch(n) {
    const r = rng(SALT + "vf" + n);
    const i = Math.floor(r() * CLUBS.length); let j = Math.floor(r() * (CLUBS.length - 1)); if (j >= i) j++;
    const [h, rh] = CLUBS[i], [a, ra] = CLUBS[j];
    const lh = Math.exp(0.3 + 0.32 * (rh - ra) / 10 + 0.08), la = Math.exp(0.3 - 0.32 * (rh - ra) / 10 - 0.08);
    let p1 = 0, px = 0, po = 0, pb = 0;
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) { const p = pois(lh, x) * pois(la, y); if (x > y) p1 += p; else if (x === y) px += p; if (x + y > 2) po += p; if (x && y) pb += p; }
    const sample = (l) => { const L0 = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L0); return k - 1; };
    const gh = sample(lh), ga = sample(la), goals = [];
    for (let g = 0; g < gh; g++) goals.push({ m: 1 + Math.floor(r() * 90), t: "h" });
    for (let g = 0; g < ga; g++) goals.push({ m: 1 + Math.floor(r() * 90), t: "a" });
    goals.sort((x, y) => x.m - y.m);
    const ko = n * VF_SLOT + (VF_SLOT - VF_PLAY);
    return { n, h, a, ko, end: ko + VF_PLAY, final: [gh, ga], goals,
      odds: { "1": odd(p1, 1.07), X: odd(px, 1.07), "2": odd(1 - p1 - px, 1.07), O: odd(po, 1.07), U: odd(1 - po, 1.07), BY: odd(pb, 1.07), BN: odd(1 - pb, 1.07) } };
  }
  const vfMin = (m, t) => Math.min(90, Math.max(0, Math.floor((t - m.ko) / (VF_PLAY / 90))));
  const vfScore = (m, t) => { const mn = t >= m.end ? 90 : vfMin(m, t); return [m.goals.filter((g) => g.t === "h" && g.m <= mn).length, m.goals.filter((g) => g.t === "a" && g.m <= mn).length]; };
  const VF_LBL = (m, k) => ({ "1": m.h, X: "Match nul", "2": m.a, O: "+2,5 buts", U: "−2,5 buts", BY: "Les 2 marquent", BN: "Pas les 2" }[k]);
  const vfWins = (k, [h, a]) => ({ "1": h > a, X: h === a, "2": h < a, O: h + a > 2, U: h + a < 3, BY: h > 0 && a > 0, BN: !(h > 0 && a > 0) }[k]);

  /* ---------- Course hippique ---------- */
  const HR_SLOT = 120000, HR_RUN = 40000;
  const HORSES = ["Éclair de Lune", "Petit Tonnerre", "Belle Comète", "Roi du Sprint", "Vent d'Ouest", "Flèche d'Or", "Douce Folie", "Grand Galop", "Nuit Blanche", "Pépite Royale", "Sans Souci", "Joli Cœur"];
  const SILK = ["#FF4D8D", "#3D8BFF", "#FFBE2E", "#33D17A", "#9B7BFF", "#FF8A3D"];
  function hrRace(n) {
    const r = rng(SALT + "hr" + n);
    const names = shuffle(HORSES.slice(), r).slice(0, 6);
    const w = names.map(() => 0.5 + r() * 2.2), W = w.reduce((x, y) => x + y, 0);
    const order = [], left = names.map((_, i) => i);
    while (left.length) { const tot = left.reduce((s, i) => s + w[i], 0); let u = r() * tot, k = 0; while (u > w[left[k]] && k < left.length - 1) { u -= w[left[k]]; k++; } order.push(left.splice(k, 1)[0]); }
    // place odds (top 2) by simulation with a separate stream so it does not depend on the draw above
    const r2 = rng(SALT + "hrsim" + n), top2 = names.map(() => 0);
    for (let s = 0; s < 600; s++) { const lf = names.map((_, i) => i), pick = []; for (let q = 0; q < 2; q++) { const tot = lf.reduce((a, i) => a + w[i], 0); let u = r2() * tot, k = 0; while (u > w[lf[k]] && k < lf.length - 1) { u -= w[lf[k]]; k++; } pick.push(lf.splice(k, 1)[0]); } pick.forEach((i) => top2[i]++); }
    const start = n * HR_SLOT + (HR_SLOT - HR_RUN - 20000);
    const finish = order.map((_, pos) => HR_RUN * (0.86 + pos * 0.035 + r() * 0.02)); // finishing time by position
    const fin = []; order.forEach((hi, pos) => (fin[hi] = finish[pos]));
    return { n, names, start, end: start + HR_RUN, order, fin, wobble: names.map(() => r() * 6.28),
      win: names.map((_, i) => odd(w[i] / W, 1.12)), place: names.map((_, i) => odd(Math.min(0.97, top2[i] / 600), 1.12)) };
  }
  function hrPos(race, i, t) {
    const el = t - race.start; if (el <= 0) return 0;
    const f = Math.min(1, el / race.fin[i]);
    return Math.min(1, f + Math.sin(el / 900 + race.wobble[i]) * 0.012 * (1 - f));
  }

  /* ---------- Bitcoin 5 min ---------- */
  const BTC_SLOT = 300000;
  async function btcPrice() {
    try { const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"); if (!r.ok) throw 0; return Number((await r.json()).price); }
    catch (_) { const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot"); if (!r.ok) throw new Error("price"); return Number((await r.json()).data.amount); }
  }
  async function btcRound(start) {
    const end = start + BTC_SLOT;
    try {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${start}&endTime=${end - 1}&limit=5`);
      if (!r.ok) throw 0; const k = await r.json(); if (k.length < 5) return null;
      return { open: Number(k[0][1]), close: Number(k[k.length - 1][4]) };
    } catch (_) {
      const r = await fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${new Date(start).toISOString()}&end=${new Date(end - 60000).toISOString()}`);
      if (!r.ok) return null; const c = await r.json(); if (!Array.isArray(c) || c.length < 5) return null;
      c.sort((x, y) => x[0] - y[0]); return { open: Number(c[0][3]), close: Number(c[c.length - 1][4]) };
    }
  }
  async function pollBtc() {
    if (now() - L.btc.last < 5000) return; L.btc.last = now();
    try { const p = await btcPrice(); L.btc.price = p; L.btc.err = false; L.btc.hist.push(p); if (L.btc.hist.length > 60) L.btc.hist.shift(); }
    catch (_) { L.btc.err = true; }
  }

  /* ---------- ticket legs: {live:1, g, n, k, odd, lbl, mt} ---------- */
  const hhmm = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  function closeAt(g, n) { return g === "vf" ? vfMatch(n).ko : g === "hr" ? hrRace(n).start : n * BTC_SLOT; }
  function endAt(g, n) { return g === "vf" ? vfMatch(n).end : g === "hr" ? hrRace(n).end : (n + 1) * BTC_SLOT + 60000; }
  const btcRes = {};   // round -> {open, close} once known
  async function fetchBtc(n) { if (btcRes[n] || btcRes[n] === 0) return; btcRes[n] = 0; const r = await btcRound(n * BTC_SLOT).catch(() => null); if (r) btcRes[n] = r; else delete btcRes[n]; }
  function legResult(l) {
    const t = now(); if (t < endAt(l.g, l.n)) return null;
    if (l.g === "vf") return vfWins(l.k, vfMatch(l.n).final) ? "won" : "lost";
    if (l.g === "hr") { const r = hrRace(l.n), [hi, mode] = String(l.k).split(":"), pos = r.order.indexOf(Number(hi)); return (mode === "p" ? pos < 2 : pos === 0) ? "won" : "lost"; }
    const rd = btcRes[l.n];
    if (rd && rd.open) return rd.close === rd.open ? "void" : (rd.close > rd.open) === (l.k === "up") ? "won" : "lost";
    if (t > endAt(l.g, l.n) + 6 * 3600000) return "void";
    fetchBtc(l.n).then(() => { if (btcRes[l.n]) core.onResults(); });
    return null;
  }
  function ctx(l) {
    const t = now();
    if (l.g === "vf") { const m = vfMatch(l.n), sc = t >= m.ko ? vfScore(m, t) : null; return `⚡ Match virtuel ${hhmm(m.ko)} · ${m.h} – ${m.a}${sc ? " · " + sc.join("-") + (t < m.end ? " (en cours)" : "") : ""}`; }
    if (l.g === "hr") { const r = hrRace(l.n); return `⚡ Course de ${hhmm(r.start)}${t >= r.end ? " · 1er " + r.names[r.order[0]] + ", 2e " + r.names[r.order[1]] : ""}`; }
    const rd = btcRes[l.n]; return `⚡ Bitcoin ${hhmm(l.n * BTC_SLOT)}–${hhmm((l.n + 1) * BTC_SLOT)}${rd && rd.open ? " · " + Math.round(rd.open).toLocaleString("fr-FR") + " → " + Math.round(rd.close).toLocaleString("fr-FR") + " $" : ""}`;
  }

  /* ---------- old direct flash bets (before the ticket), still settled ---------- */
  function place(g, n, k, odds, lbl) {
    const stake = Number(L.stakes[g]);
    if (!Number.isInteger(stake) || stake < 1) { toast("Mise un nombre entier de points."); return; }
    if (stake > 100) { toast("100 pts maximum par pari flash."); return; }
    if (stake > S.me.balance) { toast("Pas assez de points."); return; }
    if (bets().some((b) => b.g === g && b.n === n && b.k === k && b.status === "pending")) { toast("Tu as déjà ce pari en cours."); return; }
    S.me.balance -= stake;
    bets().unshift({ id: now().toString(36) + Math.random().toString(36).slice(2, 5), g, n, k, odd: odds, lbl, stake, at: now(), status: "pending" });
    if (bets().length > 40) S.me.lbets = bets().filter((b, i) => i < 40 || b.status === "pending");
    save(); core.bumpBalance(); toast("⚡ Pari flash : " + stake + " pts sur " + lbl + " @" + odds.toFixed(2)); core.rerender(true);
  }
  let settling = false;
  async function settle() {
    if (settling) return 0; settling = true; let gain = 0, changed = false;
    try {
      for (const b of bets()) {
        if (b.status !== "pending") continue;
        let res = null;
        if (b.g === "vf") { const m = vfMatch(b.n); if (now() >= m.end) res = vfWins(b.k, m.final) ? "won" : "lost"; }
        else if (b.g === "hr") { const r = hrRace(b.n); if (now() >= r.end) { const [hi, mode] = b.k.split(":"); const pos = r.order.indexOf(Number(hi)); res = (mode === "p" ? pos < 2 : pos === 0) ? "won" : "lost"; } }
        else if (b.g === "btc") {
          const start = b.n * BTC_SLOT;
          if (now() >= start + BTC_SLOT + 60000) {
            const rd = await btcRound(start).catch(() => null);
            if (rd) { b.open = rd.open; b.close = rd.close; res = rd.close === rd.open ? "void" : (rd.close > rd.open) === (b.k === "up") ? "won" : "lost"; }
            else if (now() > start + BTC_SLOT + 6 * 3600000) res = "void";
          }
        }
        if (!res) continue;
        b.status = res; b.payout = res === "won" ? Math.floor(b.stake * b.odd) : res === "void" ? b.stake : 0;
        S.me.balance += b.payout; gain += res === "won" ? b.payout : 0; changed = true;
        const st = S.me.stats; if (res === "won") st.flashWon = (st.flashWon || 0) + 1;
      }
      if (changed) { save(); core.bumpBalance(); if (gain) toast("⚡ Paris flash gagnés : +" + gain + " pts"); }
    } finally { settling = false; }
    return gain;
  }

  /* ---------- view ---------- */
  const stakeRow = (g) => `<div class="stake"><input data-lstake="${g}" type="number" min="1" max="100" step="1" value="${esc(L.stakes[g])}" aria-label="Mise"><button class="chipbtn" data-lst="${g}:5">5</button><button class="chipbtn" data-lst="${g}:10">10</button><button class="chipbtn" data-lst="${g}:25">25</button></div>`;
  const btn = (g, n, k, o, label, lbl) => `<button class="odd" data-lsel="${g}|${n}|${k}|${o}|${esc(lbl)}" aria-pressed="${core.inSlip(g + ":" + n, k)}"><small>${esc(label)}</small><b class="num">${o.toFixed(2)}</b></button>`;
  function vfHtml(t) {
    const n0 = Math.floor(t / VF_SLOT), cur = vfMatch(n0), nextN = t < cur.ko ? n0 : n0 + 1, nxt = vfMatch(nextN);
    const liveM = t >= cur.ko && t < cur.end ? cur : null, prev = vfMatch(n0 - 1);
    const shown = liveM || prev, sc = vfScore(shown, t);
    const lastGoal = liveM ? liveM.goals.filter((g) => g.m <= vfMin(liveM, t)).slice(-1)[0] : null;
    return `<div class="live-card glass"><div class="live-h"><span class="game-ic">⚽</span><div><h3>Match virtuel</h3><small class="note">Ligue Vprono · un match toutes les 4 min</small></div></div>
      <div class="vf-board"><span class="pill ${liveM ? "live" : ""}" id="vfState">${liveM ? "Direct " + vfMin(liveM, t) + "'" : "Terminé"}</span>
        <div class="vf-teams"><b>${esc(shown.h)}</b><span class="vf-sc num" id="vfScore">${sc[0]} - ${sc[1]}</span><b>${esc(shown.a)}</b></div>
        <small class="note" id="vfGoal">${lastGoal ? "⚽ But " + (lastGoal.t === "h" ? esc(shown.h) : esc(shown.a)) + " (" + lastGoal.m + "')" : ""}</small></div>
      <div class="live-next"><span class="label">Prochain match · coup d'envoi dans <span data-cd="${nxt.ko}">${fmtS(nxt.ko - t)}</span></span>
        <div class="vf-teams sm"><b>${esc(nxt.h)}</b><span>vs</span><b>${esc(nxt.a)}</b></div>
        <div class="live-odds">${btn("vf", nextN, "1", nxt.odds["1"], "1", nxt.h)}${btn("vf", nextN, "X", nxt.odds.X, "N", "Match nul")}${btn("vf", nextN, "2", nxt.odds["2"], "2", nxt.a)}</div>
        <div class="live-odds">${btn("vf", nextN, "O", nxt.odds.O, "+2,5 buts", "+2,5 buts")}${btn("vf", nextN, "U", nxt.odds.U, "−2,5", "−2,5 buts")}${btn("vf", nextN, "BY", nxt.odds.BY, "2 marquent", "Les 2 marquent")}</div>
        <p class="note">Touche une cote pour l'ajouter à ton ticket.</p></div></div>`;
  }
  function hrHtml(t) {
    const n0 = Math.floor(t / HR_SLOT), cur = hrRace(n0), running = t >= cur.start && t < cur.end + 15000;
    const nextN = t < cur.start ? n0 : n0 + 1, nxt = hrRace(nextN), shown = running ? cur : hrRace(n0 - 1);
    const done = t >= shown.end;
    return `<div class="live-card glass"><div class="live-h"><span class="game-ic">🏇</span><div><h3>Course hippique</h3><small class="note">6 chevaux · une course toutes les 2 min</small></div></div>
      <div class="track" id="hrTrack">${shown.names.map((nm, i) => `<div class="lane"><span class="lane-n">${i + 1}</span><span class="horse" data-h="${i}" style="left:calc(${(done ? (shown.order.indexOf(i) === 0 ? 1 : hrPos(shown, i, shown.end)) : hrPos(shown, i, t)) * 100}% * .86)"><i style="background:${SILK[i]}"></i>🏇</span></div>`).join("")}<div class="finish"></div></div>
      <p class="note" id="hrRes">${done ? "Arrivée : " + shown.order.slice(0, 3).map((i, p) => ["🥇", "🥈", "🥉"][p] + " " + esc(shown.names[i])).join("  ") : t < shown.start ? "" : "Course en cours…"}</p>
      <div class="live-next"><span class="label">Prochaine course dans <span data-cd="${nxt.start}">${fmtS(nxt.start - t)}</span> · gagnant / placé (top 2)</span>
        <div class="hr-list">${nxt.names.map((nm, i) => `<div class="hr-row"><span><i class="silk" style="background:${SILK[i]}"></i>${i + 1}. ${esc(nm)}</span>${btn("hr", nextN, i + ":w", nxt.win[i], "Gagnant", nm + " gagnant")}${btn("hr", nextN, i + ":p", nxt.place[i], "Placé", nm + " placé")}</div>`).join("")}</div>
        <p class="note">Touche une cote pour l'ajouter à ton ticket.</p></div></div>`;
  }
  function btcHtml(t) {
    const cur = Math.floor(t / BTC_SLOT), next = cur + 1, start = next * BTC_SLOT;
    const h = L.btc.hist, mn = Math.min(...h), mx = Math.max(...h);
    const spark = h.length > 1 ? `<svg viewBox="0 0 200 50" class="spark" aria-hidden="true"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="${h.map((p, i) => `${(i * 200) / (h.length - 1)},${mx === mn ? 25 : 46 - ((p - mn) * 42) / (mx - mn)}`).join(" ")}"/></svg>` : "";
    return `<div class="live-card glass"><div class="live-h"><span class="game-ic">₿</span><div><h3>Bitcoin 5 min</h3><small class="note">Le vrai cours, en direct</small></div></div>
      <div class="btc"><b class="num" id="btcPrice">${L.btc.price ? L.btc.price.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " $" : L.btc.err ? "Cours indisponible" : "Chargement…"}</b>${spark}</div>
      <div class="live-next"><span class="label">Manche de ${new Date(start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} à ${new Date(start + BTC_SLOT).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · paris ouverts encore <span data-cd="${start}">${fmtS(start - t)}</span></span>
        <p class="note">Le cours à la fin de la manche sera-t-il plus haut ou plus bas qu'au début ? Égalité : mise rendue.</p>
        <div class="live-odds">${btn("btc", next, "up", 1.9, "▲ Plus haut", "Bitcoin monte")}${btn("btc", next, "down", 1.9, "▼ Plus bas", "Bitcoin baisse")}</div>
        <p class="note">Touche une cote pour l'ajouter à ton ticket.</p></div></div>`;
  }
  function mineHtml() {
    const tickets = (S.me.bets || []).filter((b) => b.legs.some((l) => l.live)).slice(0, 8);
    const old = bets().filter((b) => b.status === "pending");
    if (!tickets.length && !old.length) return "";
    const st = { pending: "En cours", won: "Gagné", lost: "Perdu", void: "Remboursé" };
    return `<div class="glass panel"><div class="row-between"><h3>Mes tickets flash</h3><button class="linkbtn" data-goparis="1">Tout voir dans Paris ›</button></div><div class="feed">${tickets.map((b) => `<div><span><b>${b.legs.length > 1 ? "Combiné × " + b.legs.length : esc(b.legs[0].lbl)}</b> @${b.odds.toFixed(2)} · ${b.stake} pts<br><span class="note">${esc(b.legs.length > 1 ? b.legs.map((l) => l.lbl).join(" + ") : ctx(b.legs[0]))}</span></span><span class="st ${b.status}">${st[b.status]}${b.status === "won" ? " +" + b.payout : ""}</span></div>`).join("")}
      ${old.map((b) => `<div><span><b>${esc(b.lbl)}</b> @${b.odd.toFixed(2)} · ${b.stake} pts</span><span class="st pending">En cours</span></div>`).join("")}</div></div>`;
  }
  function render() {
    const t = now(); L.slotVf = Math.floor(t / VF_SLOT); L.slotHr = Math.floor(t / HR_SLOT); L.slotBtc = Math.floor(t / BTC_SLOT);
    L.hrPhase = t >= hrRace(L.slotHr).start; L.vfPhase = t >= vfMatch(L.slotVf).ko;
    pollBtc();
    return `<div><h2>⚡ Live flash</h2><p class="sub">Des paris express toute la journée, pour vibrer en attendant les vrais matchs. Les matchs et courses sont virtuels, tirés au sort pour tout le monde en même temps. Le Bitcoin, lui, est bien réel. Max 100 pts par pari.</p></div>
      <div class="live-grid">${vfHtml(t)}${hrHtml(t)}${btcHtml(t)}</div>${mineHtml()}`;
  }
  /* light per-second update; returns true when a full re-render is needed (new slot or phase) */
  function tick() {
    const t = now();
    if (Math.floor(t / VF_SLOT) !== L.slotVf || Math.floor(t / HR_SLOT) !== L.slotHr || Math.floor(t / BTC_SLOT) !== L.slotBtc) return true;
    if ((t >= hrRace(L.slotHr).start) !== L.hrPhase || (t >= vfMatch(L.slotVf).ko) !== L.vfPhase) return true;
    document.querySelectorAll("[data-cd]").forEach((el) => (el.textContent = fmtS(Number(el.dataset.cd) - t)));
    const cur = vfMatch(L.slotVf);
    if (t >= cur.ko && t < cur.end) {
      const sc = vfScore(cur, t), mn = vfMin(cur, t), g = cur.goals.filter((x) => x.m <= mn).slice(-1)[0];
      const a = document.getElementById("vfScore"), b = document.getElementById("vfState"), c = document.getElementById("vfGoal");
      if (a) a.textContent = sc[0] + " - " + sc[1]; if (b) b.textContent = "Direct " + mn + "'"; if (c) c.textContent = g ? "⚽ But " + (g.t === "h" ? cur.h : cur.a) + " (" + g.m + "')" : "";
    }
    const race = hrRace(L.slotHr);
    if (t >= race.start && t < race.end) document.querySelectorAll("#hrTrack .horse").forEach((el) => { el.style.left = `calc(${hrPos(race, Number(el.dataset.h), t) * 100}% * .86)`; });
    pollBtc(); const p = document.getElementById("btcPrice"); if (p && L.btc.price) p.textContent = L.btc.price.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " $";
    return false;
  }
  function click(t) {
    if (t.dataset.lsel) {
      const [g, n, k, o, lbl] = t.dataset.lsel.split("|"); const N = Number(n);
      if (now() >= closeAt(g, N)) { toast("Trop tard, c'est parti ! Choisis la manche suivante."); core.rerender(true); return true; }
      const mt = g === "vf" ? (() => { const m = vfMatch(N); return "⚡ " + m.h + " – " + m.a + " · " + hhmm(m.ko); })() : g === "hr" ? "⚡ Course de " + hhmm(hrRace(N).start) : "⚡ Bitcoin " + hhmm(N * BTC_SLOT) + "–" + hhmm((N + 1) * BTC_SLOT);
      core.toggleLive({ live: 1, g, n: N, k, odd: Number(o), lbl, mt, lid: g + ":" + N });
      return true;
    }
    if (t.dataset.goparis) { core.goParis(); return true; }
    return false;
  }
  function input(e) { const g = e.target.dataset && e.target.dataset.lstake; if (!g) return false; L.stakes[g] = e.target.value; return true; }
  return { render, tick, click, input, settle, legResult, ctx, closed: (l) => now() >= closeAt(l.g, l.n), pendingStake: () => bets().filter((b) => b.status === "pending").reduce((s, b) => s + (b.stake || 0), 0) };
};
