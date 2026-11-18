/* Vprono accounts: sign up (pseudo + email + password), sign in, password reset.
 * window.VPAuth.ensure() resolves with a Supabase session, showing the account screen until there is one. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = `
  .vpa{position:fixed;inset:0;z-index:35;display:grid;place-items:center;overflow:auto;background:rgba(5,8,20,.3);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);padding:calc(20px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  .vpa-card{width:min(420px,100%);border-radius:30px;padding:26px 22px;display:flex;flex-direction:column;gap:14px;background:var(--glass-strong);animation:pop .35s cubic-bezier(.2,.9,.3,1.2)}
  .vpa-card>*{position:relative}
  .vpa-top{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
  .vpa-top img{width:72px;height:72px;border-radius:21px;box-shadow:0 10px 30px rgba(123,92,255,.4)}
  .vpa-top .wordmark{font-family:var(--display);font-weight:900;font-size:30px;letter-spacing:-.03em}
  .vpa-top .wordmark i{font-style:normal;background:linear-gradient(120deg,var(--accent),var(--accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
  .vpa-top p{margin:0;color:var(--muted)}
  .vpa form{display:flex;flex-direction:column;gap:10px}
  .vpa label{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:-4px}
  .vpa input{width:100%;border:1px solid var(--glass-edge);background:var(--glass);border-radius:14px;padding:12px 14px;font-size:16px;font-weight:500}
  .vpa .seg{align-self:center}
  .vpa .msg{margin:0;text-align:center;font-size:13px;font-weight:600}
  .vpa .msg.bad{color:var(--loss)} .vpa .msg.ok{color:var(--win)}
  .vpa .row{display:flex;justify-content:center;gap:16px}
  @media (prefers-reduced-motion:reduce){.vpa-card{animation:none}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const FR = {
    "Invalid login credentials": "Email ou mot de passe incorrect.",
    "Email not confirmed": "Confirme d'abord ton email : clique sur le lien reçu, puis reviens te connecter.",
    "User already registered": "Un compte existe déjà avec cet email. Connecte-toi.",
    "Password should be at least 6 characters.": "Le mot de passe doit faire au moins 6 caractères.",
  };
  const fr = (m) => FR[m] || (/rate limit/i.test(m) ? "Trop d'essais. Patiente une minute puis réessaie." : m || "Ça n'a pas marché, réessaie.");

  let root = null, mode = "signup", resolve = null, message = null;
  function show(m) { mode = m || mode; if (!root) { root = document.createElement("div"); root.className = "vpa"; document.body.appendChild(root); } render(); }
  function hide() { if (root) { root.remove(); root = null; } }
  function render() {
    const title = { signup: "Crée ton compte", signin: "Content de te revoir", reset: "Mot de passe oublié", newpass: "Nouveau mot de passe" }[mode];
    let form = "";
    if (mode === "signup") form = `
      <label for="aP">Pseudo</label><input id="aP" maxlength="24" autocomplete="nickname" placeholder="ex. Le Roi du Nul" required>
      <label for="aE">Email</label><input id="aE" type="email" autocomplete="email" inputmode="email" required>
      <label for="aW">Mot de passe</label><input id="aW" type="password" minlength="6" autocomplete="new-password" placeholder="6 caractères minimum" required>
      <button class="cta">Créer mon compte · +50 pts</button>`;
    if (mode === "signin") form = `
      <label for="aE">Email</label><input id="aE" type="email" autocomplete="email" inputmode="email" required>
      <label for="aW">Mot de passe</label><input id="aW" type="password" autocomplete="current-password" required>
      <button class="cta">Se connecter</button>`;
    if (mode === "reset") form = `
      <label for="aE">Email du compte</label><input id="aE" type="email" autocomplete="email" inputmode="email" required>
      <button class="cta">Recevoir un lien</button>`;
    if (mode === "newpass") form = `
      <label for="aW">Nouveau mot de passe</label><input id="aW" type="password" minlength="6" autocomplete="new-password" required>
      <button class="cta">Enregistrer</button>`;
    root.innerHTML = `<div class="vpa-card glass" role="dialog" aria-modal="true" aria-labelledby="aT">
      <div class="vpa-top"><img src="icons/icon-192.png" alt=""><div class="wordmark">V<i>prono</i></div><p>Paris sportifs entre potes. Zéro euro, 100 % frissons.</p></div>
      ${mode === "signup" || mode === "signin" ? `<div class="seg glass"><button data-m="signup" aria-pressed="${mode === "signup"}">Inscription</button><button data-m="signin" aria-pressed="${mode === "signin"}">Connexion</button></div>` : `<h2 id="aT" style="text-align:center">${title}</h2>`}
      <form id="aForm" novalidate>${form}</form>
      ${message ? `<p class="msg ${message[0]}">${esc(message[1])}</p>` : ""}
      <div class="row">${mode === "signin" ? `<button class="linkbtn" data-m="reset">Mot de passe oublié ?</button>` : ""}${mode === "reset" ? `<button class="linkbtn" data-m="signin">Retour à la connexion</button>` : ""}</div></div>`;
    root.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { message = null; show(b.dataset.m); }));
    $("#aForm", root).onsubmit = submit;
    const first = root.querySelector("input"); if (first && window.innerWidth > 700) first.focus();
  }
  async function submit(e) {
    e.preventDefault();
    const btn = $("#aForm .cta", root); btn.disabled = true;
    const v = (id) => { const el = $("#" + id, root); return el ? el.value.trim() : ""; };
    try {
      if (mode === "signup") {
        const pseudo = v("aP").slice(0, 24), email = v("aE"), pw = $("#aW", root).value;
        if (!pseudo || !email || pw.length < 6) { message = ["bad", "Remplis ton pseudo, ton email et un mot de passe de 6 caractères minimum."]; return render(); }
        const { data, error } = await VP.signUp(email, pw, pseudo);
        if (error) { message = ["bad", fr(error.message)]; return render(); }
        if (!data.session) { message = ["ok", "Compte créé ! Clique sur le lien reçu par email pour le confirmer, puis connecte-toi ici."]; mode = "signin"; return render(); }
      } else if (mode === "signin") {
        const { error } = await VP.signIn(v("aE"), $("#aW", root).value);
        if (error) { message = ["bad", fr(error.message)]; return render(); }
      } else if (mode === "reset") {
        const { error } = await VP.reset(v("aE"));
        message = error ? ["bad", fr(error.message)] : ["ok", "Si un compte existe avec cet email, un lien vient de partir. Ouvre-le pour choisir un nouveau mot de passe."];
        return render();
      } else if (mode === "newpass") {
        const { error } = await VP.updatePassword($("#aW", root).value);
        if (error) { message = ["bad", fr(error.message)]; return render(); }
        message = null; mode = "signin"; hide();
        history.replaceState(null, "", location.pathname);
        const s = await VP.session(); if (s && resolve) { const r = resolve; resolve = null; r(s); }
      }
    } finally { const b = root && $("#aForm .cta", root); if (b) b.disabled = false; }
  }

  async function ensure() {
    return new Promise(async (res) => {
      resolve = res;
      VP.onAuth((ev, session) => {
        if (ev === "PASSWORD_RECOVERY") { message = null; show("newpass"); return; }
        if (session && resolve && mode !== "newpass") { hide(); const r = resolve; resolve = null; r(session); }
        if (ev === "SIGNED_OUT") location.reload();
      });
      const s = await VP.session();
      if (s && location.hash.indexOf("type=recovery") < 0) { const r = resolve; resolve = null; return r(s); }
      if (!s) show("signup");
    });
  }
  window.VPAuth = { ensure, signOut: () => VP.signOut() };
})();
