/* Vprono 1v1 duels: Tirs au but (turn by turn, live) and Quiz duel (same 5 questions, async).
 * Both players stake the same amount; the winner takes the pot, a draw refunds both.
 * Each player only writes their own moves column, so simultaneous moves never clash. */
window.VPDuels = function (core) {
  "use strict";
  const { S, esc, save, toast, rerender } = core;
  const D = { list: [], view: null, form: null, players: null, search: "", unsub: null, err: false };
  const GAMES = { pen: { name: "Tirs au but", icon: "🥅", desc: "En direct, à tour de rôle" }, quiz: { name: "Quiz duel", icon: "🧠", desc: "Mêmes questions, le meilleur gagne" } };
  const log = () => (S.me.duelLog && typeof S.me.duelLog === "object" ? S.me.duelLog : (S.me.duelLog = {}));
  const me = () => S.uid;
  const mine = (d) => (d.a === me() ? d.a_moves : d.b_moves) || [];
  const theirs = (d) => (d.a === me() ? d.b_moves : d.a_moves) || [];
  const oppName = (d) => (d.a === me() ? d.b_pseudo || "Adversaire" : d.a_pseudo || "Adversaire");
  const hoursAgo = (t) => (Date.now() - Date.parse(t)) / 3600000;

  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; // same order on every device
  /* ---------- rules ---------- */
  function penState(d) {
    const A = d.a_moves || [], B = d.b_moves || [], n = Math.min(A.length, B.length);
    let ga = 0, gb = 0, sa = 0, sb = 0; const turns = [];
    let winner = null;
    for (let t = 0; t < n; t++) {
      const aShoots = t % 2 === 0, shot = aShoots ? A[t] : B[t], dive = aShoots ? B[t] : A[t], goal = shot !== dive;
      if (aShoots) { sa++; if (goal) ga++; } else { sb++; if (goal) gb++; }
      turns.push({ t, aShoots, goal, shot, dive });
      if (t < 10) { const ra = 5 - sa, rb = 5 - sb; if (ga > gb + rb) { winner = "a"; break; } if (gb > ga + ra) { winner = "b"; break; } }
      if (t >= 9 && t % 2 === 1 && ga !== gb) { winner = ga > gb ? "a" : "b"; break; }
      if (t >= 19 && t % 2 === 1 && ga === gb) { winner = "draw"; break; }
    }
    return { ga, gb, turns, resolved: turns.length, winner };
  }
  function quizQuestions(d) {
    const bank = core.quizBank || [];
    let h = 2166136261; for (const c of d.id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    return shuffle(bank.map((_, i) => i), r).slice(0, 5).map((i) => { const [q, a, w] = bank[i]; return { q, a, opts: shuffle([a, ...w], r) }; });
  }
  function quizState(d) {
    const A = d.a_moves || [], B = d.b_moves || [];
    const sc = (m) => m.filter((x) => x && x.ok).length, ms = (m) => m.reduce((s, x) => s + ((x && x.ms) || 0), 0);
    let winner = null;
    if (A.length >= 5 && B.length >= 5) {
      const a = sc(A), b = sc(B);
      winner = a !== b ? (a > b ? "a" : "b") : ms(A) !== ms(B) ? (ms(A) < ms(B) ? "a" : "b") : "draw";
    }
    return { sa: sc(A), sb: sc(B), ta: ms(A), tb: ms(B), winner };
  }
  const result = (d) => (d.status === "active" || d.status === "done" ? (d.game === "pen" ? penState(d) : quizState(d)).winner : null);
  function myTurn(d) {
    if (d.status === "pending" && d.b === me()) return true;
    if (d.status !== "active") return false;
    if (result(d)) return false;
    if (d.game === "pen") { const st = penState(d); return mine(d).length === st.resolved; }
    return mine(d).length < 5;
  }

  /* ---------- money: stake, payout, refund (each player settles their own balance once) ---------- */
  function settle() {
    let changed = false, gain = 0; const L = log();
    for (const d of D.list) {
      const amA = d.a === me(), amB = d.b === me(); if (!amA && !amB) continue;
      if (L[d.id] === "done") continue;
      if ((d.status === "declined" || d.status === "cancelled") && amA && L[d.id] === "paid") { S.me.balance += d.stake; L[d.id] = "done"; changed = true; gain += d.stake; continue; }
      const w = result(d);
      if (w && L[d.id] === "paid") {
        const won = (w === "a" && amA) || (w === "b" && amB);
        const pay = w === "draw" ? d.stake : won ? d.stake * 2 : 0;
        S.me.balance += pay; L[d.id] = "done"; changed = true; gain += pay;
        if (won && core.track) core.track("duel_win");
        const st = S.me.stats; st.duelsWon = (st.duelsWon || 0) + (won ? 1 : 0); st.duelsPlayed = (st.duelsPlayed || 0) + 1;
        toast(w === "draw" ? "Duel nul contre " + oppName(d) + " : mise rendue." : won ? "🏆 Duel gagné contre " + oppName(d) + " : +" + pay + " pts !" : "Duel perdu contre " + oppName(d) + ".");
        if (d.status !== "done") VP.duels.update(d.id, { status: "done" }).catch(() => {});
      }
    }
    if (changed) { save(); core.bumpBalance(); }
    return gain;
  }

  /* ---------- data ---------- */
  function watch() {
    if (D.unsub || !window.VP || !VP.duels || !me()) return;
    D.unsub = VP.duels.watch(me(), (rows) => { D.err = false; D.list = rows || []; settle(); rerender(); }, () => { D.err = true; rerender(); });
  }
  async function create() {
    const f = D.form; const stake = Number(f.stake);
    if (!Number.isInteger(stake) || stake < 1 || stake > 500) { toast("Mise entre 1 et 500 pts."); return; }
    if (stake > S.me.balance) { toast("Pas assez de points."); return; }
    if (f.mode === "player" && !f.opp) { toast("Choisis ton adversaire."); return; }
    if (!S.me.pseudo) { toast("Choisis d'abord un pseudo dans « Mes paris »."); return; }
    try {
      const row = await VP.duels.create({ game: f.game, stake, a: me(), a_pseudo: S.me.pseudo, b: f.mode === "player" ? f.opp.id : null, b_pseudo: f.mode === "player" ? f.opp.pseudo : "", status: f.mode === "player" ? "pending" : "open" });
      S.me.balance -= stake; log()[row.id] = "paid"; save(); core.bumpBalance();
      D.list.unshift(row); D.form = null; D.view = row.id;
      if (f.mode === "open" && core.sendGlobal) core.sendGlobal({ t: "⚔️ Je lance un duel ouvert : " + GAMES[f.game].name + ", " + stake + " pts en jeu. Qui ose ? (Mini-jeux → Duel 1v1)" }).catch(() => {});
      toast(f.mode === "player" ? "Défi envoyé à " + f.opp.pseudo + " !" : "Duel ouvert publié dans le chat général.");
      rerender();
    } catch (e) { toast("Le duel n'a pas pu être créé. Réessaie."); }
  }
  async function accept(d) {
    if (d.stake > S.me.balance) { toast("Il te faut " + d.stake + " pts pour accepter."); return; }
    if (!S.me.pseudo) { toast("Choisis d'abord un pseudo dans « Mes paris »."); return; }
    try {
      const row = d.status === "open" ? await VP.duels.accept(d.id, me(), S.me.pseudo) : await VP.duels.update(d.id, { status: "active" });
      if (!row) { toast("Trop tard, quelqu'un a déjà accepté ce duel."); return; }
      S.me.balance -= d.stake; log()[d.id] = "paid"; save(); core.bumpBalance();
      Object.assign(d, row); D.view = d.id; toast("C'est parti ! " + d.stake * 2 + " pts en jeu."); rerender();
    } catch (e) { toast("Impossible d'accepter pour l'instant."); }
  }
  async function move(d, value) {
    const col = d.a === me() ? "a_moves" : "b_moves";
    const next = mine(d).concat([value]);
    try { const row = await VP.duels.update(d.id, { [col]: next }); if (row) Object.assign(d, row); settle(); rerender(); }
    catch (e) { toast("Coup non envoyé, réessaie."); }
  }

  /* ---------- views ---------- */
  const card = (d, extra) => {
    const g = GAMES[d.game], w = result(d), amA = d.a === me();
    let st = "";
    if (d.status === "open") st = amA ? "En attente d'un adversaire" : "Duel ouvert";
    else if (d.status === "pending") st = amA ? "En attente de réponse" : "Te défie !";
    else if (d.status === "declined") st = "Refusé"; else if (d.status === "cancelled") st = "Annulé";
    else if (w) st = w === "draw" ? "Match nul" : ((w === "a") === amA ? "🏆 Gagné" : "Perdu");
    else st = myTurn(d) ? "À toi de jouer !" : "Au tour de " + oppName(d);
    const who = d.status === "open" && !amA ? esc(d.a_pseudo) : "toi vs " + esc(d.status === "open" ? "?" : oppName(d));
    return `<div class="duel-card ${myTurn(d) ? "hot" : ""}"><span class="game-ic">${g.icon}</span><div class="dc-main"><b>${esc(g.name)} · ${d.stake * (d.status === "active" || d.status === "done" ? 2 : 1)} pts</b><small>${who} — ${esc(st)}</small></div>${extra || `<button class="ghost" data-duel="${d.id}">${myTurn(d) ? "Jouer" : "Voir"}</button>`}</div>`;
  };
  function lobby() {
    const L = D.list, mineL = L.filter((d) => d.a === me() || d.b === me());
    const todo = mineL.filter(myTurn), live = mineL.filter((d) => d.status === "active" && !result(d) && !myTurn(d));
    const waiting = mineL.filter((d) => (d.status === "open" || d.status === "pending") && d.a === me());
    const open = L.filter((d) => d.status === "open" && d.a !== me());
    const done = mineL.filter((d) => result(d) || d.status === "declined" || d.status === "cancelled").slice(0, 8);
    const st = S.me.stats || {};
    const sec = (title, arr, fn) => (arr.length ? `<div class="duel-sec"><span class="label">${title}</span>${arr.map(fn || ((d) => card(d))).join("")}</div>` : "");
    return `<p class="sub">Défie un joueur ou lance un duel ouvert : chacun mise la même somme, le gagnant rafle tout. ${st.duelsPlayed ? `Ton bilan : <b>${st.duelsWon || 0}</b> victoire${(st.duelsWon || 0) > 1 ? "s" : ""} sur ${st.duelsPlayed}.` : ""}</p>
      <button class="cta" data-dnew="1" ${S.canWrite ? "" : "disabled"}>⚔️ Nouveau duel</button>
      ${D.err ? `<p class="err">Les duels ne sont pas joignables pour l'instant.</p>` : ""}
      ${sec("À toi de jouer", todo, (d) => d.status === "pending" ? card(d, `<span class="dc-act"><button class="cta" data-daccept="${d.id}">Accepter</button><button class="linkbtn" data-ddecline="${d.id}">Refuser</button></span>`) : card(d))}
      ${sec("En cours", live)}
      ${sec("Duels ouverts", open, (d) => card(d, `<button class="cta" data-daccept="${d.id}">Relever · ${d.stake} pts</button>`))}
      ${sec("Tes défis en attente", waiting, (d) => card(d, `<button class="linkbtn" data-dcancel="${d.id}">Annuler</button>`))}
      ${sec("Terminés", done)}
      ${!L.length && !D.err ? `<p class="empty">Aucun duel pour l'instant. Lance le premier !</p>` : ""}`;
  }
  function form() {
    const f = D.form, ps = D.players;
    return `<button class="linkbtn" data-dback="1" style="align-self:flex-start">‹ Retour aux duels</button>
      <span class="label">Jeu</span><div class="duel-games">${Object.entries(GAMES).map(([k, g]) => `<button class="duel-game" data-dgame="${k}" aria-pressed="${f.game === k}"><span class="game-ic">${g.icon}</span><b>${g.name}</b><small>${g.desc}</small></button>`).join("")}</div>
      <label class="label" for="dStake">Mise (chacun)</label><div class="stake"><input id="dStake" type="number" min="1" max="500" step="1" value="${esc(f.stake)}"><button class="chipbtn" data-dst="5">5</button><button class="chipbtn" data-dst="10">10</button><button class="chipbtn" data-dst="25">25</button></div>
      <span class="label">Adversaire</span><div class="seg glass"><button data-dmode="open" aria-pressed="${f.mode === "open"}">🌍 Duel ouvert</button><button data-dmode="player" aria-pressed="${f.mode === "player"}">🎯 Défier un joueur</button></div>
      ${f.mode === "player" ? `<input id="dSearch" class="dsearch" placeholder="Chercher un pseudo…" value="${esc(D.search)}" autocomplete="off">
        <div class="dplayers">${ps == null ? `<p class="note">Chargement…</p>` : ps.filter((p) => p.id !== me()).map((p) => `<button class="dplayer" data-dopp="${p.id}" data-dname="${esc(p.pseudo)}" aria-pressed="${f.opp && f.opp.id === p.id}"><span>${esc(p.pseudo)}</span><small class="num">${p.score} pts</small></button>`).join("") || `<p class="note">Aucun joueur trouvé.</p>`}</div>`
        : `<p class="note">Ton duel sera annoncé dans le chat général. Le premier qui l'accepte joue contre toi.</p>`}
      <button class="cta" data-dcreate="1">Lancer le duel · ${Number(f.stake) || 0} pts</button>`;
  }
  function room(d) {
    const g = GAMES[d.game], w = result(d), amA = d.a === me();
    const head = `<button class="linkbtn" data-dback="1" style="align-self:flex-start">‹ Retour aux duels</button>
      <div class="vsbar"><div><b>${esc(S.me.pseudo || "Toi")}</b><small>toi</small></div><div class="pot num">${d.status === "active" || d.status === "done" ? d.stake * 2 : d.stake} pts</div><div><b>${esc(d.status === "open" ? "?" : oppName(d))}</b><small>adversaire</small></div></div>`;
    if (d.status === "open" || d.status === "pending") return head + `<p class="empty">${amA ? "En attente que ton adversaire accepte…" : ""}</p>` + (amA ? `<button class="ghost" data-dcancel="${d.id}">Annuler et récupérer ma mise</button>` : `<button class="cta" data-daccept="${d.id}">Accepter · ${d.stake} pts</button>`);
    if (d.status === "declined" || d.status === "cancelled") return head + `<p class="empty">Duel ${d.status === "declined" ? "refusé" : "annulé"}. La mise est rendue.</p>`;
    const end = w ? `<p class="duel-end ${w === "draw" ? "" : (w === "a") === amA ? "win" : "lose"}">${w === "draw" ? "Match nul : chacun récupère sa mise." : (w === "a") === amA ? "🏆 Victoire ! +" + d.stake * 2 + " pts" : "Défaite… " + esc(oppName(d)) + " empoche le pot."}</p>` : "";
    if (d.game === "pen") {
      const st = penState(d), myG = amA ? st.ga : st.gb, opG = amA ? st.gb : st.ga;
      const dots = (forA) => st.turns.filter((t) => t.aShoots === forA).map((t) => `<i class="${t.goal ? "g" : "m"}"></i>`).join("") + Array(Math.max(0, 5 - st.turns.filter((t) => t.aShoots === forA).length)).fill("<i></i>").join("");
      const last = st.turns[st.turns.length - 1];
      let lastTxt = "";
      if (last) { const shooterIsMe = last.aShoots === amA; lastTxt = last.goal ? (shooterIsMe ? "⚽ BUUUT ! Tu as marqué." : "😬 " + esc(oppName(d)) + " marque.") : (shooterIsMe ? "🧤 Ton tir est arrêté !" : "🧤 Arrêt ! Tu as sorti le tir."); }
      const t = st.resolved, iShoot = (t % 2 === 0) === amA, waiting = mine(d).length > t;
      return head + `<div class="pen-score"><div><b class="num">${myG}</b><span class="shots">${dots(amA)}</span></div><span>–</span><div><b class="num">${opG}</b><span class="shots">${dots(!amA)}</span></div></div>
        ${lastTxt ? `<p class="gmsg">${lastTxt}</p>` : ""}${end}
        ${w ? "" : waiting ? `<p class="empty">En attente de ${esc(oppName(d))}… (il ou elle voit ton coup seulement après avoir joué)</p>`
          : `<p class="gmsg">${iShoot ? "🎯 À toi de tirer : choisis ton coin" : "🧤 Tu es gardien : choisis où plonger"}</p>
             <div class="goal">${["Gauche", "Centre", "Droite"].map((c, i) => `<button data-dmove="${i}">${c}</button>`).join("")}<div class="keeper" style="left:33.3%">${iShoot ? "🧤" : "⚽"}</div></div>`}`;
    }
    const qs = quizQuestions(d), st = quizState(d), M = mine(d), i = M.length;
    if (w || i >= 5) {
      return head + `<div class="pen-score"><div><b class="num">${amA ? st.sa : st.sb}/5</b><small class="note">${((amA ? st.ta : st.tb) / 1000).toFixed(1)} s</small></div><span>–</span><div><b class="num">${theirs(d).length >= 5 ? (amA ? st.sb : st.sa) + "/5" : "…"}</b><small class="note">${theirs(d).length >= 5 ? ((amA ? st.tb : st.ta) / 1000).toFixed(1) + " s" : theirs(d).length + "/5 répondues"}</small></div></div>${end}
        ${w ? "" : `<p class="empty">Tu as fini ! En attente de ${esc(oppName(d))}…</p>`}`;
    }
    const q = qs[i]; D.qStart = D.qStart && D.qFor === d.id + ":" + i ? D.qStart : performance.now(); D.qFor = d.id + ":" + i;
    return head + `<div class="quiz"><div class="row-between"><span class="label">Question ${i + 1}/5</span><span class="label">Ton score ${M.filter((x) => x.ok).length} · chrono en cours ⏱️</span></div>
      <h3>${esc(q.q)}</h3><div class="qopts">${q.opts.map((o) => `<button class="qopt" data-dquiz="${esc(o)}">${esc(o)}</button>`).join("")}</div></div>`;
  }
  function render() {
    if (D.form) return form();
    const d = D.view && D.list.find((x) => x.id === D.view);
    return d ? room(d) : lobby();
  }
  async function loadPlayers() { try { D.players = await VP.duels.players(D.search); } catch (e) { D.players = []; } rerender(); }

  function click(t) {
    const ds = t.dataset, find = (id) => D.list.find((x) => x.id === id);
    if (ds.dnew) { D.form = { game: "pen", stake: 10, mode: "open", opp: null }; D.view = null; rerender(); return true; }
    if (ds.dback) { D.form = null; D.view = null; rerender(); return true; }
    if (ds.dgame) { D.form.game = ds.dgame; rerender(); return true; }
    if (ds.dst) { D.form.stake = Number(ds.dst); rerender(); return true; }
    if (ds.dmode) { D.form.mode = ds.dmode; if (ds.dmode === "player" && D.players == null) loadPlayers(); rerender(); return true; }
    if (ds.dopp) { D.form.opp = { id: ds.dopp, pseudo: ds.dname }; rerender(); return true; }
    if (ds.dcreate) { create(); return true; }
    if (ds.duel) { D.view = ds.duel; rerender(); return true; }
    if (ds.daccept) { const d = find(ds.daccept); if (d) accept(d); return true; }
    if (ds.ddecline) { const d = find(ds.ddecline); if (d) VP.duels.update(d.id, { status: "declined" }).then((r) => { if (r) Object.assign(d, r); rerender(); toast("Défi refusé."); }).catch(() => toast("Réessaie.")); return true; }
    if (ds.dcancel) { const d = find(ds.dcancel); if (d) VP.duels.update(d.id, { status: "cancelled" }).then((r) => { if (r) Object.assign(d, r); settle(); D.view = null; rerender(); toast("Duel annulé, mise rendue."); }).catch(() => toast("Réessaie.")); return true; }
    if (ds.dmove != null) { const d = find(D.view); if (d && myTurn(d)) { t.closest(".goal").querySelectorAll("button").forEach((b) => (b.disabled = true)); move(d, Number(ds.dmove)); } return true; }
    if (ds.dquiz != null) { const d = find(D.view); if (!d || !myTurn(d)) return true; const q = quizQuestions(d)[mine(d).length]; const ok = ds.dquiz === q.a; t.classList.add(ok ? "good" : "bad"); t.closest(".qopts").querySelectorAll("button").forEach((b) => (b.disabled = true)); const ms = Math.round(performance.now() - D.qStart); setTimeout(() => move(d, { ok, ms }), 450); return true; }
    return false;
  }
  function input(e) {
    if (e.target.id === "dStake" && D.form) { D.form.stake = e.target.value; const b = document.querySelector("[data-dcreate]"); if (b) b.textContent = "Lancer le duel · " + (Number(e.target.value) || 0) + " pts"; return true; }
    if (e.target.id === "dSearch") { D.search = e.target.value; clearTimeout(D.st); D.st = setTimeout(async () => { await loadPlayers(); const i = document.getElementById("dSearch"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); return true; }
    return false;
  }
  return {
    tile: { id: "duel", title: "Duel 1v1", icon: "⚔️", desc: "Affronte un joueur en ligne", daily: () => D.list.some(myTurn) },
    render, click, input, watch, settle,
    todo: () => D.list.filter(myTurn).length,
    open(id) { D.view = id || null; D.form = null; },
    challenge(opp) { D.view = null; D.form = { game: "pen", stake: 10, mode: "player", opp }; if (D.players == null) loadPlayers(); },
  };
};
