/* Vprono Casino: European roulette, blackjack, slot machine, Mines.
 * Real casino rules and house edges (roulette 2.7 %, blackjack ~0.5 %, slots 95 % paid back, Mines 97 %),
 * secure random numbers, 100 pts max per round. VPCasino(core) -> { render, click, input, mount, unmount }. */
window.VPCasino = function (core) {
  "use strict";
  const { S, esc, save, toast } = core;
  const MAX = 100;
  const C = { game: null, chip: 5, rl: { bets: {}, spinning: false, last: [], rot: 0 }, bj: null, bjBet: 10, sl: { bet: 5, spinning: false, reels: ["7️⃣", "💎", "⚽"], msg: "" }, mn: null, mnBet: 10, mnCount: 3 };
  const rand = (n) => { const a = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; };
  const stats = () => (S.me.casino && typeof S.me.casino === "object" ? S.me.casino : (S.me.casino = { wagered: 0, won: 0, biggest: 0 }));
  const take = (n) => { if (core.track) core.track("casino"); if (!Number.isInteger(n) || n < 1) { toast("Mise un nombre entier de points."); return false; } if (n > S.me.balance) { toast("Pas assez de points."); return false; } S.me.balance -= n; stats().wagered += n; core.bumpBalance(); return true; };
  const give = (n) => { n = Math.floor(n); if (n > 0) { S.me.balance += n; stats().won += n; stats().biggest = Math.max(stats().biggest || 0, n); core.bumpBalance(); } save(); };
  const rr = () => core.rerender();
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= Roulette ================= */
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const color = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
  const OUT = { red: [1, (n) => RED.has(n)], black: [1, (n) => n && !RED.has(n)], even: [1, (n) => n && n % 2 === 0], odd: [1, (n) => n % 2 === 1], low: [1, (n) => n >= 1 && n <= 18], high: [1, (n) => n >= 19],
    d1: [2, (n) => n >= 1 && n <= 12], d2: [2, (n) => n >= 13 && n <= 24], d3: [2, (n) => n >= 25], c1: [2, (n) => n && n % 3 === 1], c2: [2, (n) => n && n % 3 === 2], c3: [2, (n) => n && n % 3 === 0] };
  const OUTL = { red: "Rouge", black: "Noir", even: "Pair", odd: "Impair", low: "1-18", high: "19-36", d1: "1-12", d2: "13-24", d3: "25-36", c1: "Col. 1", c2: "Col. 2", c3: "Col. 3" };
  const rlTotal = () => Object.values(C.rl.bets).reduce((a, b) => a + b, 0);
  function rlPay(key, n) { if (/^\d+$/.test(key)) return Number(key) === n ? 36 : 0; const o = OUT[key]; return o && o[1](n) ? o[0] + 1 : 0; }
  function rouletteHtml() {
    const R = C.rl, b = R.bets, chip = (k) => (b[k] ? `<i class="rchip num">${b[k]}</i>` : "");
    const nums = []; for (let r = 0; r < 12; r++) for (let c = 1; c <= 3; c++) { const n = r * 3 + c; nums.push(`<button class="rn ${color(n)}" data-rb="${n}">${n}${chip(String(n))}</button>`); }
    return `<div class="rl-stage"><canvas id="rlCanvas" aria-label="Roue de la roulette"></canvas>
        <div class="rl-result" id="rlResult" ${R.show != null && !R.spinning ? "" : "hidden"}>${R.show != null ? `<b class="rball big ${color(R.show)}">${R.show}</b><span>${R.show === 0 ? "Zéro" : RED.has(R.show) ? "Rouge" : "Noir"}</span>` : ""}</div>
        <button class="rl-sound" data-rsound="1" aria-label="${R.mute ? "Activer le son" : "Couper le son"}">${R.mute ? "🔇" : "🔊"}</button></div>
      <div class="rl-last"><span class="label">Derniers numéros</span><div>${R.last.map((n) => `<b class="rball ${color(n)}">${n}</b>`).join("") || `<span class="note">—</span>`}</div>${R.msg ? `<p class="gmsg">${esc(R.msg)}</p>` : ""}</div>
      ${chips()}
      <div class="rtable"><button class="rn green zero" data-rb="0">0${chip("0")}</button>${nums.join("")}
        ${["c1", "c2", "c3"].map((k) => `<button class="rout" data-rb="${k}">2:1${chip(k)}</button>`).join("")}</div>
      <div class="rout-grid">${["d1", "d2", "d3"].map((k) => `<button class="rout" data-rb="${k}">${OUTL[k]}${chip(k)}</button>`).join("")}</div>
      <div class="rout-grid six">${["low", "even", "red", "black", "odd", "high"].map((k) => `<button class="rout ${k === "red" ? "red" : k === "black" ? "black" : ""}" data-rb="${k}">${OUTL[k]}${chip(k)}</button>`).join("")}</div>
      <div class="sum"><span>Mise totale : <b class="num">${rlTotal()} pts</b></span><button class="linkbtn" data-rclear="1" ${rlTotal() && !R.spinning ? "" : "disabled"}>Effacer</button></div>
      <button class="cta" id="rlSpin" ${rlTotal() && !R.spinning ? "" : "disabled"}>${R.spinning ? "La bille tourne…" : "Lancer la roulette"}</button>
      <p class="note">Plein (un numéro) payé 35 fois la mise, douzaine/colonne 2 fois, rouge/noir, pair/impair, 1-18/19-36 1 fois. Le 0 fait perdre les chances simples.</p>`;
  }
  function rouletteBet(key) {
    const R = C.rl; if (R.spinning) return;
    if (rlTotal() + C.chip > MAX) { toast(MAX + " pts maximum par tour."); return; }
    if (rlTotal() + C.chip > S.me.balance) { toast("Pas assez de points."); return; }
    R.bets[key] = (R.bets[key] || 0) + C.chip; R.msg = ""; R.show = null; W.glow = -1; rr();
  }
  /* --- animated wheel (canvas): the wheel turns one way, the ball the other, then drops into the drawn pocket --- */
  const TAU = Math.PI * 2, SEG = TAU / 37;
  const W = C.rw = C.rw || { wheel: 0, ball: null, ballR: 0, glow: -1, raf: 0 };
  let audio = null;
  function tick(vol, freq) {
    if (C.rl.mute) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "triangle"; o.frequency.value = freq || 1800 + Math.random() * 600;
      g.gain.setValueAtTime(vol || 0.05, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.06);
    } catch (_) {}
  }
  function drawWheel() {
    const c = document.getElementById("rlCanvas"); if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.min(c.parentElement.clientWidth, 340);
    if (c.width !== Math.round(size * dpr)) { c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); c.style.width = size + "px"; c.style.height = size + "px"; }
    const x = c.getContext("2d"), R0 = c.width / 2;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.translate(R0, R0);
    // wooden rim + ball track
    let g = x.createRadialGradient(0, 0, R0 * 0.82, 0, 0, R0); g.addColorStop(0, "#5A341A"); g.addColorStop(0.5, "#A86B35"); g.addColorStop(1, "#4A2A12");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R0 * 0.99, 0, TAU); x.fill();
    g = x.createRadialGradient(0, 0, R0 * 0.70, 0, 0, R0 * 0.86); g.addColorStop(0, "#2A2F3A"); g.addColorStop(1, "#6B7280");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R0 * 0.86, 0, TAU); x.fill();
    // rotating part
    x.save(); x.rotate(W.wheel);
    for (let i = 0; i < 37; i++) {
      const n = WHEEL[i], a0 = -Math.PI / 2 + i * SEG - SEG / 2;
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R0 * 0.74, a0, a0 + SEG); x.closePath();
      x.fillStyle = n === 0 ? "#159A55" : RED.has(n) ? "#C8202F" : "#15181F"; x.fill();
      if (W.glow === i) { x.fillStyle = "rgba(255,215,90,.55)"; x.fill(); }
      x.strokeStyle = "rgba(230,190,110,.9)"; x.lineWidth = Math.max(1, R0 * 0.008); x.stroke();
      x.save(); x.rotate(a0 + SEG / 2 + Math.PI / 2); x.fillStyle = "#fff"; x.font = `800 ${Math.round(R0 * 0.068)}px Inter, system-ui, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(n), 0, -R0 * 0.665); x.restore();
    }
    // pocket ring + frets
    x.beginPath(); x.arc(0, 0, R0 * 0.6, 0, TAU); x.fillStyle = "#2B1A0E"; x.fill();
    for (let i = 0; i < 37; i++) { const a = -Math.PI / 2 + i * SEG - SEG / 2; x.beginPath(); x.moveTo(Math.cos(a) * R0 * 0.48, Math.sin(a) * R0 * 0.48); x.lineTo(Math.cos(a) * R0 * 0.6, Math.sin(a) * R0 * 0.6); x.strokeStyle = "#D9B26A"; x.lineWidth = R0 * 0.012; x.stroke(); }
    // cone + turret
    g = x.createRadialGradient(-R0 * 0.1, -R0 * 0.12, R0 * 0.05, 0, 0, R0 * 0.48); g.addColorStop(0, "#C98B4B"); g.addColorStop(1, "#5B3416");
    x.beginPath(); x.arc(0, 0, R0 * 0.48, 0, TAU); x.fillStyle = g; x.fill();
    x.strokeStyle = "#E8C27A"; x.lineWidth = R0 * 0.03; x.lineCap = "round";
    for (let k = 0; k < 4; k++) { x.save(); x.rotate((k * Math.PI) / 2); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -R0 * 0.2); x.stroke(); x.beginPath(); x.arc(0, -R0 * 0.21, R0 * 0.025, 0, TAU); x.fillStyle = "#F3D99A"; x.fill(); x.restore(); }
    g = x.createRadialGradient(-R0 * 0.02, -R0 * 0.02, 1, 0, 0, R0 * 0.07); g.addColorStop(0, "#FFF2C8"); g.addColorStop(1, "#B9883E");
    x.beginPath(); x.arc(0, 0, R0 * 0.07, 0, TAU); x.fillStyle = g; x.fill();
    x.restore();
    // ball (world frame)
    if (W.ball != null) {
      const bx = Math.cos(W.ball - Math.PI / 2) * R0 * W.ballR, by = Math.sin(W.ball - Math.PI / 2) * R0 * W.ballR, br = R0 * 0.035;
      x.beginPath(); x.arc(bx + br * 0.25, by + br * 0.35, br, 0, TAU); x.fillStyle = "rgba(0,0,0,.35)"; x.fill();
      g = x.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br); g.addColorStop(0, "#fff"); g.addColorStop(1, "#BFC5CF");
      x.beginPath(); x.arc(bx, by, br, 0, TAU); x.fillStyle = g; x.fill();
    }
  }
  function animateSpin(n, done) {
    const idx = WHEEL.indexOf(n), T = 8200, tDrop = 4300, tLand = 6100;
    const w0 = W.wheel, wSpin = TAU * 2.2;                          // wheel: ~2 turns, slowing down
    const wheelAt = (t) => w0 + wSpin * (1 - Math.pow(1 - Math.min(1, t / T), 2.4));
    const pocket = idx * SEG;                                        // pocket angle in the wheel frame
    const K = TAU * 9;                                               // ball laps relative to the wheel before landing
    const R_TRACK = 0.79, R_POCKET = 0.54;
    let lastBounce = 0, landed = false;
    const t0 = performance.now();
    cancelAnimationFrame(W.raf);
    const frame = (now) => {
      const t = now - t0, wa = wheelAt(t);
      W.wheel = wa;
      if (t < tLand) {
        const u = t / tLand, rel = -K * Math.pow(1 - u, 3);          // relative angle -> 0 at landing, ball runs opposite at first
        let jitter = 0, r = R_TRACK;
        if (t > tDrop) {
          const v = (t - tDrop) / (tLand - tDrop);                     // 0..1 while it falls and bounces on the frets
          r = R_TRACK - (R_TRACK - R_POCKET) * Math.min(1, v * 1.3) + Math.abs(Math.sin(v * 22)) * 0.05 * (1 - v);
          jitter = Math.sin(v * 31) * 0.06 * (1 - v);
          if (t - lastBounce > 120 + v * 260) { lastBounce = t; tick(0.06 * (1 - v) + 0.015); }
        } else if (t - lastBounce > 90) { lastBounce = t; tick(0.012, 900); }
        W.ball = wa + pocket + rel + jitter; W.ballR = r;
      } else {
        if (!landed) { landed = true; tick(0.09, 1300); W.glow = idx; }
        W.ball = wa + pocket; W.ballR = R_POCKET;
      }
      drawWheel();
      if (t < T) W.raf = requestAnimationFrame(frame); else done();
    };
    W.raf = requestAnimationFrame(frame);
  }
  function rouletteSpin() {
    const R = C.rl, tot = rlTotal(); if (!tot || R.spinning || !take(tot)) return;
    const n = rand(37);
    R.spinning = true; R.show = null; W.glow = -1; rr();
    const st = document.querySelector(".rl-stage"); if (st && st.scrollIntoView) st.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
    const finish = () => {
      let win = 0; for (const [k, v] of Object.entries(R.bets)) win += v * rlPay(k, n);
      R.spinning = false; R.show = n; R.last = [n].concat(R.last).slice(0, 10);
      R.msg = `${n} ${n === 0 ? "vert" : RED.has(n) ? "rouge" : "noir"} · ${win ? "tu gagnes " + win + " pts !" : "perdu"}`;
      give(win); if (win) toast("🎰 Roulette : +" + win + " pts"); R.bets = {}; rr();
    };
    if (reduce()) { W.wheel += 1; W.ball = W.wheel + WHEEL.indexOf(n) * SEG; W.ballR = 0.54; W.glow = WHEEL.indexOf(n); drawWheel(); setTimeout(finish, 300); }
    else animateSpin(n, finish);
  }

  /* ================= Blackjack ================= */
  const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  function shoe() { const s = []; for (let d = 0; d < 6; d++) for (const su of SUITS) for (const r of RANKS) s.push({ r, su }); for (let i = s.length - 1; i > 0; i--) { const j = rand(i + 1); [s[i], s[j]] = [s[j], s[i]]; } return s; }
  const val = (c) => (c.r === "A" ? 11 : ["J", "Q", "K"].includes(c.r) ? 10 : Number(c.r));
  function total(h) { let t = h.reduce((a, c) => a + val(c), 0), aces = h.filter((c) => c.r === "A").length; while (t > 21 && aces) { t -= 10; aces--; } return { t, soft: aces > 0 }; }
  const isBJ = (h) => h.length === 2 && total(h).t === 21;
  const draw = () => { if (!C.shoe || C.shoe.length < 60) C.shoe = shoe(); return C.shoe.pop(); };
  const cardHtml = (c, hidden) => hidden ? `<span class="pcard back"></span>` : `<span class="pcard ${c.su === "♥" || c.su === "♦" ? "redc" : ""}"><b>${c.r}</b><i>${c.su}</i></span>`;
  function bjDeal() {
    const bet = Number(C.bjBet); if (bet > MAX) { toast(MAX + " pts maximum par main."); return; } if (!take(bet)) return;
    const B = C.bj = { hands: [{ cards: [draw(), draw()], bet, done: false }], dealer: [draw(), draw()], cur: 0, over: false, msg: "" };
    if (isBJ(B.hands[0].cards) || isBJ(B.dealer)) return bjFinish();
    save(); rr();
  }
  function bjHand() { return C.bj.hands[C.bj.cur]; }
  function bjNext() { const B = C.bj; bjHand().done = true; if (B.cur < B.hands.length - 1) { B.cur++; const h = bjHand(); if (h.cards.length === 1) h.cards.push(draw()); if (h.splitAces) { h.done = true; return bjNext(); } rr(); } else bjFinish(); }
  function bjHit() { const h = bjHand(); h.cards.push(draw()); if (total(h.cards).t >= 21) bjNext(); else rr(); }
  function bjDouble() { const h = bjHand(); if (h.cards.length !== 2 || !take(h.bet)) return; h.bet *= 2; h.doubled = true; h.cards.push(draw()); bjNext(); }
  function bjSplit() {
    const B = C.bj, h = bjHand(); if (B.hands.length > 1 || h.cards.length !== 2 || val(h.cards[0]) !== val(h.cards[1]) || !take(h.bet)) return;
    const aces = h.cards[0].r === "A";
    B.hands = [{ cards: [h.cards[0], draw()], bet: h.bet, done: false, splitAces: aces }, { cards: [h.cards[1]], bet: h.bet, done: false, splitAces: aces }];
    if (aces) { B.hands[0].done = true; B.cur = 0; return bjNext(); }
    rr();
  }
  function bjFinish() {
    const B = C.bj, d = B.dealer; B.over = true;
    const playerBJ = B.hands.length === 1 && isBJ(B.hands[0].cards), dealerBJ = isBJ(d);
    if (!playerBJ && !dealerBJ && B.hands.some((h) => total(h.cards).t <= 21)) { while (total(d).t < 17) d.push(draw()); }
    const dt = total(d).t; let win = 0; const res = [];
    for (const h of B.hands) {
      const pt = total(h.cards).t; let p = 0, r;
      if (playerBJ && !dealerBJ) { p = h.bet * 2.5; r = "Blackjack ! payé 3 pour 2"; }
      else if (dealerBJ && !playerBJ) { r = "Blackjack du croupier"; }
      else if (playerBJ && dealerBJ) { p = h.bet; r = "Égalité de blackjacks"; }
      else if (pt > 21) r = "Tu dépasses 21";
      else if (dt > 21) { p = h.bet * 2; r = "Le croupier saute"; }
      else if (pt > dt) { p = h.bet * 2; r = "Gagné " + pt + " contre " + dt; }
      else if (pt === dt) { p = h.bet; r = "Égalité, mise rendue"; }
      else r = "Perdu " + pt + " contre " + dt;
      win += p; res.push(r);
    }
    B.msg = res.join(" · ") + (win ? ` · +${Math.floor(win)} pts` : "");
    give(win); if (win > B.hands.reduce((a, h) => a + h.bet, 0)) toast("🃏 Blackjack : +" + Math.floor(win) + " pts"); rr();
  }
  function blackjackHtml() {
    const B = C.bj;
    if (!B) return `<div class="felt"><p class="felt-txt">Le croupier tire jusqu'à 17. Blackjack payé 3 pour 2. Tu peux doubler et séparer une paire.</p></div>${chips("bj")}
      <div class="stake"><input id="bjBet" type="number" min="1" max="${MAX}" step="1" value="${esc(C.bjBet)}" aria-label="Mise blackjack"><button class="cta" id="bjDeal">Distribuer</button></div>`;
    const dShow = B.over, dt = total(B.dealer).t;
    const h = B.over ? null : bjHand();
    const canSplit = h && B.hands.length === 1 && h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1]) && S.me.balance >= h.bet;
    const canDouble = h && h.cards.length === 2 && S.me.balance >= h.bet;
    return `<div class="felt"><div class="bj-row"><span class="label">Croupier ${dShow ? "· " + dt : ""}</span><div class="cards">${B.dealer.map((c, i) => cardHtml(c, !dShow && i === 1)).join("")}</div></div>
      ${B.hands.map((x, i) => `<div class="bj-row ${!B.over && i === B.cur ? "active" : ""}"><span class="label">${B.hands.length > 1 ? "Main " + (i + 1) : "Toi"} · ${total(x.cards).t}${x.doubled ? " · doublé" : ""} · ${x.bet} pts</span><div class="cards">${x.cards.map((c) => cardHtml(c)).join("")}</div></div>`).join("")}
      ${B.msg ? `<p class="felt-txt">${esc(B.msg)}</p>` : ""}</div>
      ${B.over ? `${chips("bj")}<div class="stake"><input id="bjBet" type="number" min="1" max="${MAX}" step="1" value="${esc(C.bjBet)}" aria-label="Mise blackjack"><button class="cta" id="bjDeal">Rejouer</button></div>`
        : `<div class="bj-btns"><button class="cta" id="bjHit">Tirer</button><button class="ghost" id="bjStand">Rester</button><button class="ghost" id="bjDouble" ${canDouble ? "" : "disabled"}>Doubler</button><button class="ghost" id="bjSplit" ${canSplit ? "" : "disabled"}>Séparer</button></div>`}`;
  }

  /* ================= Machine à sous ================= */
  const SYM = [["🍒", 6], ["🍋", 6], ["🔔", 5], ["⭐", 4], ["⚽", 3], ["💎", 2], ["7️⃣", 1]];
  const PAY3 = { "🍒": 10, "🍋": 10, "🔔": 20, "⭐": 40, "⚽": 80, "💎": 200, "7️⃣": 1000 };
  const pick = () => { let u = rand(27); for (const [s, w] of SYM) { if (u < w) return s; u -= w; } return "🍒"; };
  function slotPay(r) { if (r[0] === r[1] && r[1] === r[2]) return PAY3[r[0]]; if (r.filter((x) => x === "🍒").length === 2) return 2; return 0; }
  function slotsHtml() {
    const L = C.sl;
    return `<div class="slot"><div class="slot-win">${L.reels.map((s, i) => `<div class="reel" id="reel${i}"><div class="reel-strip">${s}</div></div>`).join("")}</div><div class="slot-line"></div></div>
      <p class="gmsg" id="slMsg">${esc(L.msg || "3 symboles identiques sur la ligne = jackpot")}</p>
      <div class="paytable">${Object.entries(PAY3).reverse().map(([s, p]) => `<span>${s}${s}${s} <b class="num">×${p}</b></span>`).join("")}<span>🍒🍒 <b class="num">×2</b></span></div>
      ${chips("sl")}
      <div class="stake"><input id="slBet" type="number" min="1" max="${MAX}" step="1" value="${esc(L.bet)}" aria-label="Mise machine à sous"><button class="cta" id="slSpin" ${L.spinning ? "disabled" : ""}>${L.spinning ? "…" : "Lancer"}</button></div>`;
  }
  function slotsSpin() {
    const L = C.sl; if (L.spinning) return; const bet = Number(L.bet); if (bet > MAX) { toast(MAX + " pts maximum par tour."); return; } if (!take(bet)) return;
    const res = [pick(), pick(), pick()]; L.spinning = true; L.msg = ""; rr();
    const all = SYM.map((s) => s[0]); const fast = reduce();
    res.forEach((sym, i) => {
      const el = document.querySelector(`#reel${i} .reel-strip`); if (!el) return;
      const seq = Array.from({ length: 18 + i * 6 }, () => all[rand(all.length)]).concat([sym]);
      el.innerHTML = seq.map((s) => `<span>${s}</span>`).join(""); el.style.transition = "none"; el.style.transform = "translateY(0)";
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = `transform ${fast ? 0.05 : 1.1 + i * 0.45}s cubic-bezier(.15,.8,.25,1)`; el.style.transform = `translateY(calc(-${seq.length - 1} * var(--reel-h)))`; }));
    });
    setTimeout(() => {
      const mult = slotPay(res), win = bet * mult; L.reels = res; L.spinning = false;
      L.msg = mult ? (mult >= 200 ? "💥 JACKPOT ! " : "Gagné ! ") + "×" + mult + " = +" + win + " pts" : "Perdu, retente ta chance";
      give(win); if (mult >= 20) toast("🎰 Machine à sous : +" + win + " pts !"); rr();
    }, fast ? 300 : 2300);
  }

  /* ================= Mines ================= */
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  const mnMult = (m, k) => (k ? Math.floor(0.97 * (comb(25, k) / comb(25 - m, k)) * 100) / 100 : 1);
  function minesHtml() {
    const M = C.mn;
    if (!M || M.over) {
      const grid = M ? M.cells.map((c, i) => `<button class="mtile ${M.open.has(i) || M.over ? (c ? "bomb" : "gem") : ""} ${M.boom === i ? "boom" : ""}" disabled>${M.open.has(i) || M.over ? (c ? "💣" : "💎") : ""}</button>`).join("") : Array(25).fill(`<button class="mtile" disabled></button>`).join("");
      return `<div class="mines">${grid}</div>${M ? `<p class="gmsg">${esc(M.msg)}</p>` : `<p class="sub">Trouve les 💎 sans tomber sur une 💣. Chaque case sûre augmente ton gain : encaisse quand tu veux.</p>`}
        <span class="label">Nombre de mines</span><div class="chips">${[1, 3, 5, 10, 15].map((n) => `<button data-mcount="${n}" aria-pressed="${C.mnCount === n}">${n} 💣</button>`).join("")}</div>
        ${chips("mn")}<div class="stake"><input id="mnBet" type="number" min="1" max="${MAX}" step="1" value="${esc(C.mnBet)}" aria-label="Mise Mines"><button class="cta" id="mnGo">Jouer</button></div>`;
    }
    const k = M.open.size, next = mnMult(M.m, k + 1), now = mnMult(M.m, k);
    return `<div class="mines">${M.cells.map((c, i) => `<button class="mtile ${M.open.has(i) ? "gem" : ""}" data-mtile="${i}" ${M.open.has(i) ? "disabled" : ""}>${M.open.has(i) ? "💎" : ""}</button>`).join("")}</div>
      <div class="sum"><span>Cases sûres : <b class="num">${k}</b></span><span>Prochaine : <b class="num">×${next.toFixed(2)}</b></span></div>
      <button class="cta" id="mnCash" ${k ? "" : "disabled"}>Encaisser ${Math.floor(M.bet * now)} pts (×${now.toFixed(2)})</button>`;
  }
  function minesStart() {
    const bet = Number(C.mnBet); if (bet > MAX) { toast(MAX + " pts maximum par partie."); return; } if (!take(bet)) return;
    const cells = Array(25).fill(0); let placed = 0; while (placed < C.mnCount) { const i = rand(25); if (!cells[i]) { cells[i] = 1; placed++; } }
    C.mn = { m: C.mnCount, bet, cells, open: new Set(), over: false, msg: "" }; save(); rr();
  }
  function minesClick(i) {
    const M = C.mn; if (!M || M.over || M.open.has(i)) return;
    if (M.cells[i]) { M.over = true; M.boom = i; M.msg = "💥 Boum ! Mise perdue."; save(); rr(); return; }
    M.open.add(i); if (M.open.size === 25 - M.m) return minesCash(); rr();
  }
  function minesCash() { const M = C.mn; if (!M || M.over || !M.open.size) return; const w = Math.floor(M.bet * mnMult(M.m, M.open.size)); M.over = true; M.msg = "Encaissé : +" + w + " pts"; give(w); toast("💎 Mines : +" + w + " pts"); rr(); }

  /* ================= shell ================= */
  const chips = (target) => `<div class="cchips" role="group" aria-label="Jetons">${[1, 5, 10, 25, 50].map((v) => `<button class="cchip c${v} ${C.chip === v && !target ? "on" : ""}" data-cchip="${v}" data-ct="${target || "rl"}">${v}</button>`).join("")}</div>`;
  const GAMES = [
    { id: "roulette", title: "Roulette", icon: "🎡", desc: "Européenne, 37 numéros", html: rouletteHtml },
    { id: "blackjack", title: "Blackjack", icon: "🃏", desc: "Bats le croupier sans dépasser 21", html: blackjackHtml },
    { id: "slots", title: "Machine à sous", icon: "🎰", desc: "Jackpot ×1000 sur les 7️⃣", html: slotsHtml },
    { id: "mines", title: "Mines", icon: "💣", desc: "Déniche les diamants", html: minesHtml },
  ];
  function render() {
    const st = stats();
    if (C.game) {
      const g = GAMES.find((x) => x.id === C.game);
      return `<button class="back" data-cgame="">‹ Casino</button><div class="glass panel game game-open casino-${g.id}"><div class="game-h"><span class="game-ic">${g.icon}</span><h2>${g.title}</h2></div>${g.html()}</div>`;
    }
    const net = (st.won || 0) - (st.wagered || 0);
    return `<div><h2>🎰 Casino</h2><p class="sub">Roulette, blackjack, machine à sous et Mines, avec de vraies règles de casino. 100 pts max par tour.</p></div>
      <div class="tiles">${GAMES.map((g) => `<button class="tile glass" data-cgame="${g.id}"><span class="game-ic">${g.icon}</span><b>${g.title}</b><small>${g.desc}</small></button>`).join("")}</div>
      <div class="glass panel casino-stats"><span class="label">Ton bilan casino</span><div class="stats3"><div><b class="num">${st.wagered || 0}</b><small>pts misés</small></div><div><b class="num">${st.won || 0}</b><small>pts gagnés</small></div><div><b class="num ${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${net}</b><small>bilan</small></div><div><b class="num">${st.biggest || 0}</b><small>plus gros gain</small></div></div></div>
      <p class="note">Comme dans un vrai casino, la maison garde un petit avantage : sur la durée, on reperd un peu de ce qu'on mise (entre 1 et 5 %). C'est fait pour s'amuser avec des points, jamais avec de l'argent. Si le jeu d'argent devient un souci pour toi ou un proche : Joueurs Info Service, 09 74 75 13 13.</p>`;
  }
  function click(t) {
    const d = t.dataset;
    if (d.cgame != null) { C.game = d.cgame || null; rr(); window.scrollTo({ top: 0 }); return true; }
    if (d.cchip) { const v = Number(d.cchip); if (d.ct === "rl") { C.chip = v; } else if (d.ct === "bj") C.bjBet = v; else if (d.ct === "sl") C.sl.bet = v; else if (d.ct === "mn") C.mnBet = v; rr(); return true; }
    if (d.rb != null) { rouletteBet(d.rb); return true; }
    if (d.rclear) { C.rl.bets = {}; rr(); return true; }
    if (d.rsound) { C.rl.mute = !C.rl.mute; try { localStorage.setItem("vp-rl-mute", C.rl.mute ? "1" : ""); } catch (_) {} rr(); return true; }
    if (d.mcount) { C.mnCount = Number(d.mcount); rr(); return true; }
    if (d.mtile != null) { minesClick(Number(d.mtile)); return true; }
    const f = { rlSpin: rouletteSpin, bjDeal, bjHit, bjStand: bjNext, bjDouble, bjSplit, slSpin: slotsSpin, mnGo: minesStart, mnCash: minesCash }[t.id];
    if (f) { f(); return true; }
    return false;
  }
  function input(e) {
    const id = e.target.id, v = e.target.value;
    if (id === "bjBet") C.bjBet = v; else if (id === "slBet") C.sl.bet = v; else if (id === "mnBet") C.mnBet = v; else return false;
    return true;
  }
  try { C.rl.mute = !!localStorage.getItem("vp-rl-mute"); } catch (_) {}
  function mount() { if (C.game === "roulette") { if (W.ball == null && C.rl.last.length) { W.ball = W.wheel + WHEEL.indexOf(C.rl.last[0]) * SEG; W.ballR = 0.54; } drawWheel(); } }
  window.addEventListener("resize", () => { if (C.game === "roulette" && !C.rl.spinning) drawWheel(); });
  return { render, click, input, mount, leave() { if (C.mn && !C.mn.over && C.mn.open.size) minesCash(); } };
};
