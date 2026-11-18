/* Vprono mini-games: Loto Foot 7, La Fusée, Plus ou Moins, Quiz foot, Ticket à gratter, Jongles.
 * VPGames(core) returns { list, render(id), mount(id), unmount(), click(btn), settle(), dailyCount() }.
 * `core` exposes the app state and helpers (see app.js). Balances only move through core.add(). */
window.VPGames = function (core) {
  "use strict";
  const { S, esc, today, save, toast, rerender } = core;
  const rnd = () => (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const add = (n, why) => { n = Math.floor(n); if (!n) return; S.me.balance += n; core.bumpBalance(); save(); if (why) toast(why); };
  const pay = (n) => { if (!Number.isInteger(n) || n < 1) { toast("Mise un nombre entier de points."); return false; } if (n > S.me.balance) { toast("Pas assez de points."); return false; } S.me.balance -= n; core.bumpBalance(); save(); return true; };
  const G = S.g || (S.g = {});
  const mem = (k) => (S.me[k] && typeof S.me[k] === "object" ? S.me[k] : (S.me[k] = {}));
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; // same order on every device
  function seeded(seed) { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

  /* ================= Loto Foot 7 ================= */
  const LOTO_PRIZE = { 7: 300, 6: 60, 5: 20 };
  function lotoCandidates() {
    const out = [];
    for (const d of core.dayList()) {
      if (d < today()) continue;
      const doc = S.days[d]; if (!doc) continue;
      for (const m of doc.matches) if (core.phase(m) === "open" && m.odds && !m.tbc) out.push({ m, d });
      if (out.length >= 7) break;
    }
    return out.sort((a, b) => a.m.k - b.m.k).slice(0, 7);
  }
  function lotoRender() {
    const L = S.me.loto;
    if (L && !L.settled) {
      const rows = L.picks.map((p) => { const m = core.findMatch(p.d, p.mid); const r = m ? core.legResult(p.k, m) : null;
        return `<div class="lrow"><span class="lteams">${esc(p.mt)}</span><span class="lpick ${r || ""}">${{ "1": "1", X: "N", "2": "2" }[p.k]}</span>${m && m.sc ? `<span class="note num">${m.sc[0]}-${m.sc[1]}</span>` : `<span class="note">…</span>`}</div>`; }).join("");
      const ok = L.picks.filter((p) => { const m = core.findMatch(p.d, p.mid); const r = m && core.legResult(p.k, m); return r === "won" || r === "void"; }).length;
      return `<p class="sub">Ta grille est validée. Résultat quand les 7 matchs sont terminés.</p><div class="loto">${rows}</div><p class="gmsg">${ok} bon${ok > 1 ? "s" : ""} pronostic${ok > 1 ? "s" : ""} pour l'instant</p>`;
    }
    const last = L && L.settled ? `<p class="gmsg">Dernière grille : ${L.n}/7${L.win ? " · +" + L.win + " pts" : ""}</p>` : "";
    const c = lotoCandidates();
    if (c.length < 7) { core.loadUpcoming(); return last + `<p class="empty">La prochaine grille arrive avec le calendrier.</p>`; }
    G.loto = G.loto || {};
    const rows = c.map(({ m }) => `<div class="lrow"><span class="lteams">${esc(core.tshort(m.h))} – ${esc(core.tshort(m.a))}<small class="note"> · ${esc(core.fDT.format(m.k))}</small></span><span class="lbtns">${["1", "X", "2"].map((k) => `<button class="lb" data-loto="${esc(m.id)}" data-k="${k}" aria-pressed="${G.loto[m.id] === k}">${k === "X" ? "N" : k}</button>`).join("")}</span></div>`).join("");
    const n = c.filter(({ m }) => G.loto[m.id]).length;
    return last + `<p class="sub">Gratuit. 7/7 = <b>+300 pts</b>, 6/7 = +60, 5/7 = +20. Un match reporté compte comme bon.</p><div class="loto">${rows}</div>
      <button class="cta" id="lotoGo" ${n < 7 || !S.canWrite ? "disabled" : ""}>${n < 7 ? `Choisis encore ${7 - n} prono${7 - n > 1 ? "s" : ""}` : "Valider ma grille"}</button>`;
  }
  function lotoSubmit() {
    const c = lotoCandidates(); if (c.length < 7 || c.some(({ m }) => !G.loto[m.id])) return;
    S.me.loto = { at: Date.now(), settled: false, picks: c.map(({ m, d }) => ({ mid: m.id, d, k: G.loto[m.id], mt: core.tshort(m.h) + " – " + core.tshort(m.a) })) };
    G.loto = {}; save(); toast("Grille validée. Bonne chance !"); rerender();
  }
  function lotoSettle() {
    const L = S.me.loto; if (!L || L.settled) return 0;
    let n = 0;
    for (const p of L.picks) { const m = core.findMatch(p.d, p.mid); if (!m) return 0; const r = core.legResult(p.k, m); if (!r) return 0; if (r !== "lost") n++; }
    L.settled = true; L.n = n; L.win = LOTO_PRIZE[n] || 0; if (L.win) S.me.balance += L.win; return L.win || 0.0001;
  }

  /* ================= La Fusée (crash) ================= */
  function rocketRender() {
    const R = G.rocket;
    return `<p class="sub">Mise, la cote décolle… encaisse avant que la fusée explose. Plus tu attends, plus ça rapporte.</p>
      <div class="rocket"><canvas id="rkCanvas" width="600" height="300" aria-label="Courbe de la fusée"></canvas><div class="rk-mult num" id="rkMult">${R && R.state !== "idle" ? "×" + R.m.toFixed(2) : "×1.00"}</div></div>
      <p class="gmsg" id="rkMsg">${R ? esc(R.msg || "") : "Record perso : ×" + ((S.me.games2 || {}).rocketBest || 1).toFixed(2)}</p>
      ${R && R.state === "fly" ? `<button class="cta" id="rkCash">Encaisser ${Math.floor(R.stake * R.m)} pts</button>` :
        `<div class="stake"><input id="rkStake" type="number" min="1" step="1" value="${R ? R.stake : 5}" aria-label="Mise de la fusée"><button class="cta" id="rkGo" ${S.canWrite ? "" : "disabled"}>Décoller</button></div>`}`;
  }
  function rocketStart() {
    const st = Number(document.getElementById("rkStake").value); if (!pay(st)) return;
    const crash = Math.min(100, Math.max(1, 0.97 / (1 - rnd())));
    G.rocket = { state: "fly", stake: st, m: 1, crash, t0: performance.now(), pts: [], msg: "" };
    rerender(); rocketLoop();
  }
  function rocketLoop() {
    const R = G.rocket; if (!R || R.state !== "fly") return;
    const t = (performance.now() - R.t0) / 1000;
    R.m = Math.min(R.crash, Math.exp(0.11 * t * (1 + t / 25)));
    R.pts.push(R.m);
    const el = document.getElementById("rkMult"); if (el) el.textContent = "×" + R.m.toFixed(2);
    const b = document.getElementById("rkCash"); if (b) b.textContent = "Encaisser " + Math.floor(R.stake * R.m) + " pts";
    rocketDraw();
    if (R.m >= R.crash) { R.state = "boom"; R.msg = "💥 Explosion à ×" + R.crash.toFixed(2) + ". Mise perdue."; S.me.stats.games = (S.me.stats.games || 0) + 1; save(); rerender(); rocketDraw(); return; }
    R.raf = requestAnimationFrame(rocketLoop);
  }
  function rocketCash() {
    const R = G.rocket; if (!R || R.state !== "fly") return;
    R.state = "cashed"; cancelAnimationFrame(R.raf);
    const win = Math.floor(R.stake * R.m); const g2 = mem("games2"); g2.rocketBest = Math.max(g2.rocketBest || 1, R.m);
    R.msg = "Encaissé à ×" + R.m.toFixed(2) + " : +" + win + " pts (la fusée aurait explosé à ×" + R.crash.toFixed(2) + ")";
    S.me.stats.games = (S.me.stats.games || 0) + 1; add(win); rerender(); rocketDraw();
  }
  function rocketDraw() {
    const c = document.getElementById("rkCanvas"); if (!c) return; const R = G.rocket; const x = c.getContext("2d");
    const W = c.width, H = c.height; x.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    x.strokeStyle = css.getPropertyValue("--glass-line") || "rgba(0,0,0,.1)"; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, (H * i) / 4); x.lineTo(W, (H * i) / 4); x.stroke(); }
    if (!R || !R.pts.length) return;
    const maxM = Math.max(2, R.m * 1.15), n = R.pts.length;
    const grad = x.createLinearGradient(0, H, W, 0); grad.addColorStop(0, "#3D8BFF"); grad.addColorStop(1, R.state === "boom" ? "#FF453A" : "#FF4D8D");
    x.strokeStyle = grad; x.lineWidth = 5; x.lineCap = "round"; x.beginPath();
    R.pts.forEach((m, i) => { const px = 20 + ((W - 60) * i) / Math.max(60, n), py = H - 20 - ((H - 50) * (m - 1)) / (maxM - 1); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    const px = 20 + ((W - 60) * (n - 1)) / Math.max(60, n), py = H - 20 - ((H - 50) * (R.m - 1)) / (maxM - 1);
    x.font = "34px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(R.state === "boom" ? "💥" : "🚀", px, py);
  }

  /* ================= Plus ou Moins (real odds) ================= */
  function hiloDeck() {
    const deck = [];
    for (const d of Object.keys(S.days)) for (const m of S.days[d].matches) if (m.odds) for (const k of ["1", "X", "2"]) if (m.odds[k] && m.odds[k] < 30) deck.push({ o: m.odds[k], lbl: core.pickLabel(m, k), mt: core.tshort(m.h) + " – " + core.tshort(m.a) });
    return deck;
  }
  function hiloRender() {
    const H = G.hilo;
    const card = (c, hidden) => `<div class="hl-card ${hidden ? "hidden" : ""}"><small>${hidden ? "?" : esc(c.mt)}</small><b class="num">${hidden ? "?" : c.o.toFixed(2)}</b><span>${hidden ? "Prochaine cote" : esc(c.lbl)}</span></div>`;
    if (!H || H.state !== "play") {
      const deck = hiloDeck(); if (deck.length < 20) { core.loadUpcoming(); return `<p class="empty">Il faut des matchs chargés pour jouer. Ouvre l'onglet Matchs puis reviens.</p>`; }
      return `<p class="sub">Une vraie cote s'affiche. La suivante sera-t-elle plus haute ou plus basse ? Le gain dépend du risque. Encaisse quand tu veux.</p>
        ${H && H.msg ? `<p class="gmsg">${esc(H.msg)}</p>` : `<p class="note" style="text-align:center">Meilleure série : ${(S.me.games2 || {}).hiloBest || 0}</p>`}
        <div class="stake"><input id="hlStake" type="number" min="1" step="1" value="${H ? H.stake : 5}" aria-label="Mise plus ou moins"><button class="cta" id="hlGo" ${S.canWrite ? "" : "disabled"}>Jouer</button></div>`;
    }
    const ph = H.deck.filter((c) => c.o > H.cur.o).length / H.deck.length, pl = H.deck.filter((c) => c.o < H.cur.o).length / H.deck.length;
    H.mh = ph > 0 ? Math.max(1.01, 0.95 / ph) : 0; H.ml = pl > 0 ? Math.max(1.01, 0.95 / pl) : 0;
    return `<div class="hl-row">${card(H.cur)}${card(null, true)}</div>
      <div class="hl-btns"><button class="cta" id="hlUp" ${H.mh ? "" : "disabled"}>▲ Plus haute <small class="num">×${H.mh ? H.mh.toFixed(2) : "–"}</small></button><button class="cta" id="hlDown" ${H.ml ? "" : "disabled"}>▼ Plus basse <small class="num">×${H.ml ? H.ml.toFixed(2) : "–"}</small></button></div>
      <div class="sum"><span>Série : <b class="num">${H.streak}</b></span><span>Gain en cours : <b class="num">${Math.floor(H.stake * H.mult)} pts</b></span></div>
      <button class="ghost" id="hlCash" ${H.streak ? "" : "disabled"}>Encaisser ${Math.floor(H.stake * H.mult)} pts</button>${H.msg ? `<p class="gmsg">${esc(H.msg)}</p>` : ""}`;
  }
  function hiloStart() {
    const st = Number(document.getElementById("hlStake").value); const deck = hiloDeck(); if (deck.length < 20) return; if (!pay(st)) return;
    G.hilo = { state: "play", stake: st, mult: 1, streak: 0, deck, cur: deck[Math.floor(rnd() * deck.length)], msg: "" }; rerender();
  }
  function hiloGuess(up) {
    const H = G.hilo; if (!H || H.state !== "play") return;
    const next = H.deck[Math.floor(rnd() * H.deck.length)], m = up ? H.mh : H.ml;
    const ok = up ? next.o > H.cur.o : next.o < H.cur.o;
    if (ok) { H.mult *= m; H.streak++; H.msg = "✅ " + next.lbl + " @" + next.o.toFixed(2); H.cur = next; const g2 = mem("games2"); if (H.streak > (g2.hiloBest || 0)) { g2.hiloBest = H.streak; } }
    else { H.state = "lost"; H.msg = "❌ C'était " + next.lbl + " @" + next.o.toFixed(2) + ". Mise perdue."; S.me.stats.games = (S.me.stats.games || 0) + 1; save(); }
    rerender();
  }
  function hiloCash() { const H = G.hilo; if (!H || H.state !== "play" || !H.streak) return; H.state = "cashed"; const w = Math.floor(H.stake * H.mult); H.msg = "Encaissé : +" + w + " pts après " + H.streak + " bonne" + (H.streak > 1 ? "s" : "") + " réponse" + (H.streak > 1 ? "s" : ""); S.me.stats.games = (S.me.stats.games || 0) + 1; add(w); rerender(); }

  /* ================= Quiz foot (same 5 questions for everyone, once a day) ================= */
  const QUIZ = [
    ["Quel pays a remporté la Coupe du monde 2018 ?", "France", ["Croatie", "Belgique", "Brésil"]],
    ["Quel pays a remporté la Coupe du monde 2022 ?", "Argentine", ["France", "Croatie", "Maroc"]],
    ["Quel club a remporté le plus de Ligues des champions ?", "Real Madrid", ["AC Milan", "Bayern Munich", "Liverpool"]],
    ["En quelle année l'OM a-t-il gagné la Ligue des champions ?", "1993", ["1991", "1996", "2004"]],
    ["Qui a remporté le Ballon d'or 1998 ?", "Zinédine Zidane", ["Ronaldo", "Rivaldo", "Thierry Henry"]],
    ["Quel pays a remporté l'Euro 2016 ?", "Portugal", ["France", "Allemagne", "Pays de Galles"]],
    ["Quel pays a remporté l'Euro 2024 ?", "Espagne", ["Angleterre", "France", "Italie"]],
    ["Comment s'appelle le stade du FC Barcelone ?", "Camp Nou", ["Santiago Bernabéu", "Mestalla", "Wanda Metropolitano"]],
    ["Comment s'appelle le stade de Liverpool ?", "Anfield", ["Old Trafford", "Goodison Park", "Emirates Stadium"]],
    ["Quel club est surnommé « la Vieille Dame » ?", "Juventus", ["AC Milan", "AS Rome", "Inter"]],
    ["Quel club est surnommé « les Canaris » ?", "FC Nantes", ["FC Sochaux", "Stade Rennais", "Le Havre AC"]],
    ["Quel club est surnommé « les Verts » ?", "AS Saint-Étienne", ["FC Nantes", "OGC Nice", "Montpellier"]],
    ["Quel club joue en « Sang et Or » ?", "RC Lens", ["Stade Rennais", "Toulouse FC", "FC Lorient"]],
    ["Combien de cartons jaunes valent un rouge dans un même match ?", "2", ["3", "1", "4"]],
    ["À quelle distance du but est le point de penalty ?", "11 mètres", ["9,15 mètres", "12 mètres", "16,5 mètres"]],
    ["Quel pays a remporté le plus de Coupes du monde ?", "Brésil", ["Allemagne", "Italie", "Argentine"]],
    ["En quelle année a eu lieu la première Coupe du monde ?", "1930", ["1924", "1934", "1950"]],
    ["Contre qui la France a-t-elle perdu la finale de la Coupe du monde 2006 ?", "Italie", ["Brésil", "Allemagne", "Portugal"]],
    ["Quel club anglais est surnommé « The Gunners » ?", "Arsenal", ["Chelsea", "West Ham", "Tottenham"]],
    ["Quel club est surnommé « les Red Devils » ?", "Manchester United", ["Liverpool", "Nottingham Forest", "Arsenal"]],
    ["Quel club est surnommé « les Gones » ?", "Olympique Lyonnais", ["AS Saint-Étienne", "Girondins de Bordeaux", "OGC Nice"]],
    ["Qui a remporté le Ballon d'or 2023 ?", "Lionel Messi", ["Erling Haaland", "Kylian Mbappé", "Kevin De Bruyne"]],
    ["Qui a remporté le Ballon d'or 2024 ?", "Rodri", ["Vinícius Júnior", "Jude Bellingham", "Lionel Messi"]],
    ["Qui a remporté le Ballon d'or 2025 ?", "Ousmane Dembélé", ["Lamine Yamal", "Vitinha", "Mohamed Salah"]],
    ["Quel club a remporté la Ligue des champions 2024-25 ?", "Paris Saint-Germain", ["Inter", "Arsenal", "Barcelone"]],
    ["Quel club a remporté la Ligue des champions 2023-24 ?", "Real Madrid", ["Borussia Dortmund", "Manchester City", "Bayern Munich"]],
    ["Quel club a remporté le plus de titres de champion de France ?", "Paris Saint-Germain", ["AS Saint-Étienne", "Olympique de Marseille", "Olympique Lyonnais"]],
    ["Combien de remplacements une équipe peut-elle faire dans un match officiel (hors prolongation) ?", "5", ["3", "4", "6"]],
    ["Combien durent les prolongations au total ?", "30 minutes", ["20 minutes", "15 minutes", "45 minutes"]],
    ["Quel match oppose le Real Madrid au FC Barcelone ?", "El Clásico", ["Le Derby d'Italie", "Le Superclásico", "Der Klassiker"]],
    ["Le « Derby della Madonnina » oppose…", "l'Inter et l'AC Milan", ["la Roma et la Lazio", "la Juventus et le Torino", "Naples et la Roma"]],
    ["Quels pays organisent la Coupe du monde 2026 ?", "États-Unis, Canada, Mexique", ["États-Unis seuls", "Maroc, Espagne, Portugal", "Canada et États-Unis"]],
    ["Avec quel club Kylian Mbappé a-t-il débuté chez les pros ?", "AS Monaco", ["Paris Saint-Germain", "Real Madrid", "Olympique Lyonnais"]],
    ["Sur quel joueur Zidane a-t-il donné son coup de tête en finale 2006 ?", "Marco Materazzi", ["Gennaro Gattuso", "Fabio Cannavaro", "Andrea Pirlo"]],
    ["Combien d'équipes disputent la Ligue 1 en 2026-27 ?", "18", ["20", "16", "19"]],
    ["Combien de clubs disputent la phase de ligue de la Ligue des champions ?", "36", ["32", "24", "40"]],
    ["Quel pays a accueilli la Coupe du monde 1998 ?", "France", ["Italie", "États-Unis", "Allemagne"]],
    ["Comment s'appelle le stade du Real Madrid ?", "Santiago Bernabéu", ["Camp Nou", "Metropolitano", "Mestalla"]],
    ["Combien de joueurs une équipe aligne-t-elle sur le terrain au coup d'envoi ?", "11", ["10", "12", "9"]],
    ["Quel club allemand joue au Signal Iduna Park ?", "Borussia Dortmund", ["Bayern Munich", "Schalke 04", "Bayer Leverkusen"]],
  ];
  function quizToday() {
    const r = seeded("quiz" + today()); const idx = shuffle(QUIZ.map((_, i) => i), r).slice(0, 5);
    return idx.map((i) => { const [q, a, w] = QUIZ[i]; const opts = shuffle([a, ...w], r); return { q, a, opts }; });
  }
  function quizRender() {
    const Q = mem("quiz");
    if (Q.day === today() && Q.done) return `<p class="gmsg">Quiz du jour terminé : ${Q.score}/5 · +${Q.win} pts</p><p class="note" style="text-align:center">Nouveau quiz demain. Tout le monde a les mêmes questions : compare avec tes potes !</p>`;
    const qs = quizToday(); const st = G.quiz && G.quiz.day === today() ? G.quiz : (G.quiz = { day: today(), i: 0, score: 0, picked: null });
    if (st.i >= 5) return "";
    const q = qs[st.i];
    return `<p class="sub">5 questions, les mêmes pour tout le monde aujourd'hui. +10 pts par bonne réponse, +10 de bonus si tu fais 5/5.</p>
      <div class="quiz"><div class="row-between"><span class="label">Question ${st.i + 1}/5</span><span class="label num">Score ${st.score}</span></div>
      <h3>${esc(q.q)}</h3><div class="qopts">${q.opts.map((o) => `<button class="qopt ${st.picked != null ? (o === q.a ? "good" : o === st.picked ? "bad" : "") : ""}" data-quiz="${esc(o)}" ${st.picked != null ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${st.picked != null ? `<button class="cta" id="quizNext">${st.i < 4 ? "Question suivante" : "Voir mon score"}</button>` : ""}</div>`;
  }
  function quizPick(o) {
    const st = G.quiz; const q = quizToday()[st.i]; if (!st || st.picked != null) return;
    st.picked = o; if (o === q.a) st.score++; rerender();
  }
  function quizNext() {
    const st = G.quiz; st.i++; st.picked = null;
    if (st.i >= 5) { const Q = mem("quiz"); Q.day = today(); Q.done = true; Q.score = st.score; Q.win = st.score * 10 + (st.score === 5 ? 10 : 0); add(Q.win, "Quiz terminé : " + st.score + "/5, +" + Q.win + " pts"); }
    rerender();
  }

  /* ================= Ticket à gratter (1 free per day) ================= */
  const SC_SYM = ["⚽", "🏆", "🥅", "🧤", "👟", "🎯"];
  function scratchTicket() {
    const r = seeded("scratch" + today() + S.uid);
    const u = r(); const prize = u < 0.01 ? 100 : u < 0.05 ? 50 : u < 0.15 ? 20 : u < 0.4 ? 10 : 0;
    const PRIZE_SYM = { 100: "🏆", 50: "🎯", 20: "👟", 10: "⚽" };
    let cells = [];
    if (prize) { const s = PRIZE_SYM[prize]; cells = [s, s, s]; }
    const pool = SC_SYM.filter((s) => !prize || s !== PRIZE_SYM[prize]);
    const count = {}; cells.forEach((s) => (count[s] = (count[s] || 0) + 1));
    while (cells.length < 9) { const s = pool[Math.floor(r() * pool.length)]; if ((count[s] || 0) >= 2) continue; count[s] = (count[s] || 0) + 1; cells.push(s); }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return { prize, cells };
  }
  function scratchRender() {
    const T = mem("scratch"); const done = T.day === today();
    const tk = scratchTicket();
    return `<p class="sub">Un ticket gratuit par jour. Gratte avec ton doigt : 3 symboles identiques = gagné ! ⚽ 10 · 👟 20 · 🎯 50 · 🏆 100 pts</p>
      <div class="scratch"><div class="sc-grid">${tk.cells.map((c) => `<span>${c}</span>`).join("")}</div>${done ? "" : `<canvas id="scCanvas" width="300" height="300" aria-label="Zone à gratter"></canvas>`}</div>
      <p class="gmsg" id="scMsg">${done ? (T.win ? "Gagné : +" + T.win + " pts !" : "Perdu cette fois. Nouveau ticket demain.") : "Gratte la zone argentée"}</p>
      ${done ? "" : `<button class="linkbtn" id="scReveal" style="align-self:center">Tout révéler</button>`}`;
  }
  function scratchMount() {
    const c = document.getElementById("scCanvas"); if (!c) return; const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 300, 300); g.addColorStop(0, "#C9CED8"); g.addColorStop(0.5, "#EEF1F6"); g.addColorStop(1, "#B5BBC7");
    x.fillStyle = g; x.fillRect(0, 0, 300, 300);
    x.fillStyle = "rgba(60,70,90,.55)"; x.font = "bold 26px system-ui"; x.textAlign = "center"; x.fillText("GRATTE ICI", 150, 158);
    let down = false, n = 0;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) * 300) / r.width, ((e.clientY - r.top) * 300) / r.height]; };
    const scr = (e) => { const [px, py] = pos(e); x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(px, py, 22, 0, 7); x.fill(); if (++n % 12 === 0) check(); };
    c.onpointerdown = (e) => { down = true; c.setPointerCapture(e.pointerId); scr(e); };
    c.onpointermove = (e) => { if (down) scr(e); };
    c.onpointerup = () => { down = false; check(); };
    function check() { const d = x.getImageData(0, 0, 300, 300).data; let clear = 0; for (let i = 3; i < d.length; i += 64) if (d[i] === 0) clear++; if (clear / (d.length / 64) > 0.6) scratchDone(); }
  }
  function scratchDone() {
    const T = mem("scratch"); if (T.day === today()) return;
    const tk = scratchTicket(); T.day = today(); T.win = tk.prize;
    if (tk.prize) add(tk.prize, "Ticket gagnant : +" + tk.prize + " pts !"); else save();
    rerender();
  }

  /* ================= Jongles (skill) ================= */
  const JG_DAILY_MAX = 30;
  function juggleRender() {
    const J = mem("juggle"); const left = J.day === today() ? Math.max(0, JG_DAILY_MAX - (J.earned || 0)) : JG_DAILY_MAX;
    return `<p class="sub">Touche le ballon pour le garder en l'air. 1 pt tous les 5 jongles (jusqu'à ${JG_DAILY_MAX} pts par jour).</p>
      <div class="juggle"><canvas id="jgCanvas" width="360" height="480" aria-label="Terrain de jongles"></canvas><div class="jg-hud"><span class="num" id="jgCount">0</span></div></div>
      <div class="sum"><span>Record : <b class="num">${J.best || 0}</b></span><span>Encore <b class="num">${left}</b> pts à gagner aujourd'hui</span></div>
      <button class="cta" id="jgGo">${G.jg && G.jg.over ? "Rejouer" : "Commencer"}</button>`;
  }
  function juggleStart() {
    const c = document.getElementById("jgCanvas"); if (!c) return; const x = c.getContext("2d");
    if (G.jg && G.jg.raf) cancelAnimationFrame(G.jg.raf);
    const J = G.jg = { x: 180, y: 300, vx: (rnd() - 0.5) * 60, vy: -820, r: 30, n: 0, over: false, last: performance.now(), spin: 0 };
    document.getElementById("jgGo").disabled = true;
    c.onpointerdown = (e) => {
      if (J.over) return; const r = c.getBoundingClientRect(); const px = ((e.clientX - r.left) * 360) / r.width, py = ((e.clientY - r.top) * 480) / r.height;
      if (Math.hypot(px - J.x, py - J.y) < J.r * 1.7 && J.vy > -200) { J.vy = -620 - Math.min(J.n * 6, 220); J.vx = (J.x - px) * 9 + (rnd() - 0.5) * 120; J.n++; J.spin += (rnd() - 0.5) * 2; const el = document.getElementById("jgCount"); if (el) el.textContent = J.n; }
    };
    const step = (now) => {
      const dt = Math.min(0.033, (now - J.last) / 1000); J.last = now;
      J.vy += (1500 + J.n * 12) * dt; J.x += J.vx * dt; J.y += J.vy * dt; J.spin += J.vx * dt / 30;
      if (J.x < J.r) { J.x = J.r; J.vx = Math.abs(J.vx) * 0.8; } if (J.x > 360 - J.r) { J.x = 360 - J.r; J.vx = -Math.abs(J.vx) * 0.8; }
      if (J.y < J.r) { J.y = J.r; J.vy = Math.abs(J.vy) * 0.5; }
      x.clearRect(0, 0, 360, 480);
      x.fillStyle = "rgba(46,158,94,.85)"; x.fillRect(0, 440, 360, 40);
      x.save(); x.translate(J.x, J.y); x.rotate(J.spin); x.font = "56px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("⚽", 0, 2); x.restore();
      if (J.y > 440 - J.r) { J.over = true; juggleEnd(); return; }
      J.raf = requestAnimationFrame(step);
    };
    J.raf = requestAnimationFrame(step);
  }
  function juggleEnd() {
    const J = G.jg, M = mem("juggle");
    if (M.day !== today()) { M.day = today(); M.earned = 0; }
    const gain = Math.min(Math.floor(J.n / 5), JG_DAILY_MAX - (M.earned || 0));
    const rec = J.n > (M.best || 0); M.best = Math.max(M.best || 0, J.n);
    if (gain > 0) { M.earned += gain; add(gain, J.n + " jongles : +" + gain + " pts" + (rec ? " · nouveau record !" : "")); }
    else { save(); toast(J.n + " jongle" + (J.n > 1 ? "s" : "") + (rec ? " · nouveau record !" : "")); }
    rerender();
  }

  /* ================= registry ================= */
  const list = [
    { id: "loto", title: "Loto Foot 7", icon: "🎟️", desc: "7 vrais matchs, gratuit, jackpot 300 pts", daily: () => !(S.me.loto && !S.me.loto.settled) },
    { id: "rocket", title: "La Fusée", icon: "🚀", desc: "Encaisse avant l'explosion" },
    { id: "hilo", title: "Plus ou Moins", icon: "📈", desc: "Devine la prochaine vraie cote" },
    { id: "quiz", title: "Quiz foot", icon: "🧠", desc: "5 questions par jour, jusqu'à 60 pts", daily: () => !((S.me.quiz || {}).day === today() && S.me.quiz.done) },
    { id: "scratch", title: "Ticket à gratter", icon: "🪙", desc: "Un ticket gratuit par jour", daily: () => (S.me.scratch || {}).day !== today() },
    { id: "juggle", title: "Jongles", icon: "⚽", desc: "Jeu d'adresse, jusqu'à 30 pts par jour", daily: () => !((S.me.juggle || {}).day === today() && (S.me.juggle.earned || 0) >= JG_DAILY_MAX) },
  ];
  const R = { loto: lotoRender, rocket: rocketRender, hilo: hiloRender, quiz: quizRender, scratch: scratchRender, juggle: juggleRender };
  return {
    list,
    render: (id) => (R[id] ? R[id]() : ""),
    mount(id) { if (id === "scratch") scratchMount(); if (id === "rocket") rocketDraw(); },
    unmount() { if (G.rocket && G.rocket.state === "fly") rocketCash(); if (G.jg && G.jg.raf) { cancelAnimationFrame(G.jg.raf); G.jg = null; } },
    click(t) {
      if (t.dataset.loto) { G.loto = G.loto || {}; G.loto[t.dataset.loto] = t.dataset.k; rerender(); return true; }
      if (t.dataset.quiz != null) { quizPick(t.dataset.quiz); return true; }
      const f = { lotoGo: lotoSubmit, rkGo: rocketStart, rkCash: rocketCash, hlGo: hiloStart, hlUp: () => hiloGuess(true), hlDown: () => hiloGuess(false), hlCash: hiloCash, quizNext, scReveal: scratchDone, jgGo: juggleStart }[t.id];
      if (f) { f(); return true; }
      return false;
    },
    settle: lotoSettle,
    quizBank: QUIZ,
    dailyCount: () => list.filter((g) => g.daily && g.daily()).length,
  };
};
