/* Vprono install guide: shown on first visit in a browser tab, with steps for the visitor's device.
 * window.VPInstall.open(force) reopens it; resolves when the visitor installs or chooses to continue in the browser. */
(function () {
  "use strict";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);
  const isMacSafari = !isIOS && isSafari && /Macintosh/.test(ua);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener("appinstalled", () => { try { localStorage.setItem("vp-installed", "1"); } catch (_) {} close(); });

  const ICON = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 8v6M9 11l3 3 3-3M8 21h8"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><rect x="8.5" y="6" width="3" height="3" rx=".8"/><rect x="12.5" y="6" width="3" height="3" rx=".8"/><rect x="8.5" y="10" width="3" height="3" rx=".8"/><path d="M11 18h2"/></svg>',
    dock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="15" width="18" height="5" rx="2"/><rect x="9" y="6" width="6" height="6" rx="1.6"/><path d="M12 12v2"/></svg>',
  };

  function steps() {
    if (isIOS && !isSafari) return { title: "Ouvre Vprono dans Safari", list: [
      [ICON.share, "Copie l'adresse de cette page, puis ouvre-la dans <b>Safari</b>."],
      [ICON.share, "Dans Safari, touche le bouton <b>Partager</b> en bas de l'écran."],
      [ICON.plus, "Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>."]], note: "Sur iPhone, l'installation passe par Safari." };
    if (isIOS) return { title: "Installe Vprono sur ton iPhone", list: [
      [ICON.share, "Touche le bouton <b>Partager</b> <span class='vpi-key'>" + ICON.share + "</span> dans la barre de Safari (en bas, ou en haut sur iPad)."],
      [ICON.plus, "Fais défiler et choisis <b>Sur l'écran d'accueil</b> <span class='vpi-key'>" + ICON.plus + "</span>."],
      [ICON.home, "Touche <b>Ajouter</b>. Vprono apparaît sur ton écran d'accueil : ouvre-le depuis là."]] };
    if (isAndroid) return { title: "Installe Vprono sur ton téléphone", list: deferred ? [
      [ICON.install, "Touche <b>Installer Vprono</b> ci-dessous, puis confirme."],
      [ICON.home, "L'icône Vprono arrive sur ton écran d'accueil : ouvre-la depuis là."]] : [
      [ICON.dots, isSamsung ? "Touche le menu <b>☰</b> en bas de Samsung Internet." : "Touche le menu <b>⋮</b> en haut à droite de Chrome."],
      [ICON.plus, "Choisis <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>."],
      [ICON.home, "Confirme, puis ouvre Vprono depuis ton écran d'accueil."]] };
    if (isMacSafari) return { title: "Installe Vprono sur ton Mac", list: [
      [ICON.share, "Dans Safari, ouvre le menu <b>Fichier</b> (ou le bouton Partager)."],
      [ICON.dock, "Choisis <b>Ajouter au Dock</b>, puis <b>Ajouter</b>."],
      [ICON.home, "Lance Vprono depuis le Dock ou le Launchpad."]] };
    if (isFirefox) return { title: "Installe Vprono sur ton ordi", list: [
      [ICON.install, "Firefox ne sait pas installer d'applis web : ouvre cette page dans <b>Chrome</b> ou <b>Edge</b>."],
      [ICON.install, "Clique sur l'icône <b>Installer</b> dans la barre d'adresse."],
      [ICON.home, "Vprono s'ouvre dans sa propre fenêtre, comme une appli."]], note: "Tu peux aussi continuer dans Firefox, tout fonctionne." };
    return { title: "Installe Vprono sur ton ordi", list: deferred ? [
      [ICON.install, "Clique sur <b>Installer Vprono</b> ci-dessous."],
      [ICON.home, "Vprono s'ouvre dans sa propre fenêtre et se range avec tes applis."]] : [
      [ICON.install, "Clique sur l'icône <b>Installer</b> <span class='vpi-key'>" + ICON.install + "</span> à droite de la barre d'adresse (Chrome, Edge)."],
      [ICON.dots, "Ou ouvre le menu <b>⋮</b> → <b>Caster, enregistrer et partager</b> → <b>Installer la page en tant qu'application</b>."],
      [ICON.home, "Vprono s'ouvre dans sa propre fenêtre, comme une appli."]] };
  }

  const css = `
  .vpi{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));background:rgba(5,8,20,.35);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);overflow:auto}
  .vpi-card{width:min(440px,100%);border-radius:30px;padding:26px 22px 20px;display:flex;flex-direction:column;gap:16px;background:var(--glass-strong);animation:pop .35s cubic-bezier(.2,.9,.3,1.2)}
  .vpi-card>*{position:relative}
  .vpi-top{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
  .vpi-top img{width:76px;height:76px;border-radius:22px;box-shadow:0 10px 30px rgba(123,92,255,.4)}
  .vpi-top p{margin:0;color:var(--muted)}
  .vpi ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;counter-reset:s}
  .vpi li{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:center;padding:12px;border-radius:18px;background:var(--glass);border:1px solid var(--glass-edge);counter-increment:s}
  .vpi li .ic{position:relative;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(150deg,var(--accent),var(--accent-2))}
  .vpi li .ic svg{width:22px;height:22px}
  .vpi li .ic::after{content:counter(s);position:absolute;top:-6px;left:-6px;width:18px;height:18px;border-radius:50%;background:var(--ink);color:var(--bg);font-size:11px;font-weight:800;display:grid;place-items:center}
  .vpi-key{display:inline-grid;place-items:center;width:22px;height:22px;vertical-align:-6px;border-radius:6px;background:var(--faint);color:var(--accent)}
  .vpi-key svg{width:15px;height:15px}
  .vpi-arrow{position:fixed;left:50%;bottom:calc(6px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:41;color:#fff;font-weight:800;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.5);animation:bob 1.2s ease-in-out infinite alternate;pointer-events:none}
  @keyframes bob{to{transform:translate(-50%,8px)}}
  @media (prefers-reduced-motion:reduce){.vpi-arrow{animation:none}.vpi-card{animation:none}}
  .vpi .note{text-align:center}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  let root = null, resolver = null;
  function close() {
    if (root) { root.remove(); root = null; }
    const a = document.querySelector(".vpi-arrow"); if (a) a.remove();
    if (resolver) { const r = resolver; resolver = null; r(); }
  }
  function render() {
    if (!root) return;
    const s = steps();
    root.innerHTML = `<div class="vpi-card glass" role="dialog" aria-modal="true" aria-labelledby="vpiT">
      <div class="vpi-top"><img src="icons/icon-192.png" alt=""><h2 id="vpiT">${s.title}</h2><p>Vprono s'utilise comme une vraie appli : icône sur ton écran, plein écran, et elle se met à jour toute seule.</p></div>
      <ol>${s.list.map(([ic, t]) => `<li><span class="ic">${ic}</span><span>${t}</span></li>`).join("")}</ol>
      ${s.note ? `<p class="note">${s.note}</p>` : ""}
      ${deferred ? `<button class="cta" id="vpiGo">Installer Vprono</button>` : ""}
      <button class="${deferred ? "linkbtn" : "ghost"}" id="vpiSkip" style="align-self:center">Continuer dans le navigateur</button></div>`;
    root.querySelector("#vpiSkip").onclick = () => { try { localStorage.setItem("vp-install-skip", String(Date.now())); } catch (_) {} close(); };
    const go = root.querySelector("#vpiGo");
    if (go) go.onclick = async () => { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === "accepted") close(); else render(); };
    let arrow = document.querySelector(".vpi-arrow");
    if (isIOS && isSafari && !/iPad/.test(ua) && !arrow) { arrow = document.createElement("div"); arrow.className = "vpi-arrow"; arrow.innerHTML = "Partager est ici<br>↓"; document.body.appendChild(arrow); }
  }
  function open(force) {
    return new Promise((res) => {
      let skipped = 0; try { skipped = Number(localStorage.getItem("vp-install-skip")) || 0; } catch (_) {}
      if (standalone() || (!force && skipped)) return res();
      if (root) { resolver = res; return; }
      resolver = res;
      root = document.createElement("div"); root.className = "vpi"; document.body.appendChild(root); render();
    });
  }
  window.VPInstall = { open, standalone, canPrompt: () => !!deferred };
})();
