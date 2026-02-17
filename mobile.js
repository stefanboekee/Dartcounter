/* ==========================================
   Dartcounter V1.5 — mobile.js
   Mobile rendering layer + shared UI logic:
   - Numpad input
   - Hamburger menu
   - Light / dark theme
   All game logic stays in script.js untouched.
   ========================================== */

/* ====================================================
   NUMPAD
   ==================================================== */
let numpadWaarde = "";

function numpadInput(digit) {
  if (numpadWaarde.length >= 3) return;
  numpadWaarde += digit;
  updateScoreDisplay();
}

function numpadClear() {
  numpadWaarde = "";
  updateScoreDisplay();
}

function updateScoreDisplay() {
  const el = document.getElementById("scoreDisplayTekst");
  if (el) el.textContent = numpadWaarde === "" ? "—" : numpadWaarde;
}

function bevestigVanNumpad() {
  const waarde = numpadWaarde === "" ? "0" : numpadWaarde;
  let input = document.getElementById("invoer");
  if (!input) {
    input = document.createElement("input");
    input.id = "invoer";
    input.type = "number";
    input.style.display = "none";
    document.body.appendChild(input);
  }
  input.value = waarde;
  numpadWaarde = "";
  updateScoreDisplay();

  if (teamMode) {
    verwerkTeamBeurt(beurt);
  } else {
    verwerkBeurt(beurt);
  }
}

/* ====================================================
   RESPONSIVE HELPER
   ==================================================== */
function isMobile() {
  return window.innerWidth < 768;
}

/* ====================================================
   HAMBURGER MENU
   Overrides the stubs defined in script.js.
   ==================================================== */
let _menuOpen = false;

window.toggleMenu = function() {
  _menuOpen ? window.closeMenu() : window.openMenu();
};

window.openMenu = function() {
  _menuOpen = true;
  const menu     = document.getElementById("dropdownMenu");
  const btn      = document.getElementById("hamburgerBtn");
  const backdrop = document.getElementById("menuBackdrop");
  if (menu)     { menu.style.display = "block"; }
  if (btn)      { btn.classList.add("open"); btn.setAttribute("aria-expanded","true"); }
  if (backdrop) { backdrop.style.display = "block"; }
};

window.closeMenu = function() {
  _menuOpen = false;
  const menu     = document.getElementById("dropdownMenu");
  const btn      = document.getElementById("hamburgerBtn");
  const backdrop = document.getElementById("menuBackdrop");
  if (menu)     { menu.style.display = "none"; }
  if (btn)      { btn.classList.remove("open"); btn.setAttribute("aria-expanded","false"); }
  if (backdrop) { backdrop.style.display = "none"; }
};

/**
 * Show/hide game-specific menu items.
 * Call with true when the game is active, false on setup/end screens.
 */
function _setGameMenuItems(active) {
  const ids = ["menuSpelerBtn","menuHerstelBtn","menuStopBtn"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = active ? "" : "none";
  });
  // Only show "speler toevoegen" in single mode
  const spelerBtn = document.getElementById("menuSpelerBtn");
  if (spelerBtn) spelerBtn.style.display = (active && !teamMode) ? "" : "none";
}

/* ====================================================
   Override the stub menu functions defined in script.js
   with full implementations that also close the menu.
   ==================================================== */
window.menuToggleTheme = function() {
  toggleTheme();
  closeMenu();
};

window.menuNieuweSpeler = function() {
  closeMenu();
  nieuweSpelerToevoegen();
};

window.menuHerstel = function() {
  closeMenu();
  herstelLaatsteScore();
};

window.menuStop = function() {
  closeMenu();
  stopSpel();
};

/* ====================================================
   THEME TOGGLE
   Overrides the stub in script.js.
   ==================================================== */
window.toggleTheme = function() {
  const isLight = document.body.classList.contains("light-mode");
  _applyTheme(isLight ? "dark" : "light");
  try { localStorage.setItem("dartTheme", isLight ? "dark" : "light"); } catch(e) {}
};

function _applyTheme(theme) {
  const icon = document.getElementById("themeIcon");
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (icon) icon.textContent = "☀️";
  } else {
    document.body.classList.remove("light-mode");
    if (icon) icon.textContent = "🌙";
  }
}

/* ====================================================
   OVERRIDE: renderSpel  (single mode)
   ==================================================== */
const _origRenderSpel = window.renderSpel;

window.renderSpel = function () {
  _setGameMenuItems(true);

  if (!isMobile()) {
    document.getElementById("spelContainer").style.display = "none";
    document.getElementById("spel").style.display = "flex";
    _origRenderSpel.call(this);
    return;
  }

  // MOBILE PATH
  document.getElementById("spel").style.display = "none";
  document.getElementById("spelContainer").style.display = "flex";
  document.getElementById("eindscherm").style.display = "none";

  toggleSpelControls(true);

  // Scorebord (other players)
  const scorebord = document.getElementById("scorebord");
  scorebord.innerHTML = "";
  spelers.forEach((s, idx) => {
    if (idx === beurt) return;
    const card = document.createElement("div");
    card.className = "sb-card";
    card.innerHTML = `
      <div class="sb-naam">${s.naam}</div>
      <div class="sb-score">${s.score}</div>
      <div class="sb-legs">${s.legsGewonnen}/${legsTeWinnen} legs</div>
    `;
    scorebord.appendChild(card);
  });

  // Active player panel
  const panel = document.getElementById("actiefPanel");
  panel.innerHTML = "";
  const s = spelers[beurt];
  if (!s) return;

  const avgHuidig = s.geschiedenis.length ? gemiddelde(s.geschiedenis).toFixed(1) : "0.0";
  const avgTotaal = s.totaalGeschiedenis.length ? gemiddelde(s.totaalGeschiedenis).toFixed(1) : "0.0";
  const checkoutHint = getCheckoutHint(s.score);

  const kaart = document.createElement("div");
  kaart.className = "actief-kaart";
  kaart.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div class="actief-naam">🎯 ${s.naam}</div>
      <span class="remove-speler" onclick="verwijderSpeler(${beurt})">✖</span>
    </div>
    <div class="actief-score">${s.score}</div>
    ${checkoutHint !== "-" ? `<div class="actief-checkout">🏁 ${checkoutHint}</div>` : '<div class="actief-checkout"></div>'}
    <div class="actief-stats">
      <div class="stat-chip">Legs<strong>${s.legsGewonnen}/${legsTeWinnen}</strong></div>
      <div class="stat-chip">Pijlen<strong>${s.pijlenGegooid || 0}</strong></div>
      <div class="stat-chip">Gem. leg<strong>${avgHuidig}</strong></div>
      <div class="stat-chip">Gem. totaal<strong>${avgTotaal}</strong></div>
      ${s.besteLeg     ? `<div class="stat-chip">Beste leg<strong>${s.besteLeg} 🎯</strong></div>` : ''}
      ${s.hoogsteFinish ? `<div class="stat-chip">Top finish<strong>${s.hoogsteFinish}</strong></div>` : ''}
    </div>
    ${s.geschiedenis.length ? `<div class="actief-geschiedenis">📋 ${s.geschiedenis.slice(-8).join(" · ")}</div>` : ''}
  `;
  panel.appendChild(kaart);

  _ensureHiddenInvoer();

  if (eersteLeg) {
    eersteLeg = false;
    const overlay = document.getElementById("startLogoOverlay");
    overlay.classList.add("visible");
    const audio = playSound('gameon.mp3');
    if (audio) audio.onended = () => overlay.classList.remove("visible");
    else overlay.classList.remove("visible");
  }

  suppressNextScoreAnnouncement = false;
  updateStatistieken();
};

/* ====================================================
   OVERRIDE: renderTeamSpel  (team mode)
   ==================================================== */
const _origRenderTeamSpel = window.renderTeamSpel;

window.renderTeamSpel = function () {
  _setGameMenuItems(true);

  if (!isMobile()) {
    document.getElementById("spelContainer").style.display = "none";
    document.getElementById("spel").style.display = "flex";
    _origRenderTeamSpel.call(this);
    return;
  }

  // MOBILE PATH
  document.getElementById("spel").style.display = "none";
  document.getElementById("spelContainer").style.display = "flex";
  document.getElementById("eindscherm").style.display = "none";

  toggleSpelControls(true);

  const scorebord = document.getElementById("scorebord");
  scorebord.innerHTML = "";
  teams.forEach((t, tIdx) => {
    if (tIdx === beurt) return;
    const card = document.createElement("div");
    card.className = "sb-card";
    card.innerHTML = `
      <div class="sb-naam">${t.naam}</div>
      <div class="sb-score">${t.score}</div>
      <div class="sb-legs">${t.legsGewonnen}/${legsTeWinnen} legs</div>
    `;
    scorebord.appendChild(card);
  });

  const panel = document.getElementById("actiefPanel");
  panel.innerHTML = "";
  const team = teams[beurt];
  if (!team) return;

  const spelerIdx  = teamBeurtIndex % Math.max(1, team.spelers.length);
  const spelersHtml = team.spelers.map((naam, i) =>
    `<span class="team-speler-chip ${i === spelerIdx ? "actief-chip" : ""}">${naam}</span>`
  ).join("");

  const avgHuidig = team.geschiedenis.length ? gemiddelde(team.geschiedenis).toFixed(1) : "0.0";
  const avgTotaal = team.totaalGeschiedenis.length ? gemiddelde(team.totaalGeschiedenis).toFixed(1) : "0.0";
  const checkoutHint = getCheckoutHint(team.score);

  const kaart = document.createElement("div");
  kaart.className = "actief-kaart";
  kaart.innerHTML = `
    <div class="actief-naam">🎯 ${team.spelers[spelerIdx] || team.naam}</div>
    <div class="team-naam-sub">${team.naam}</div>
    ${team.spelers.length > 1 ? `<div class="team-spelers-strip">${spelersHtml}</div>` : ''}
    <div class="actief-score">${team.score}</div>
    ${checkoutHint !== "-" ? `<div class="actief-checkout">🏁 ${checkoutHint}</div>` : '<div class="actief-checkout"></div>'}
    <div class="actief-stats">
      <div class="stat-chip">Legs<strong>${team.legsGewonnen}/${legsTeWinnen}</strong></div>
      <div class="stat-chip">Pijlen<strong>${team.pijlenGegooid || 0}</strong></div>
      <div class="stat-chip">Gem. leg<strong>${avgHuidig}</strong></div>
      <div class="stat-chip">Gem. totaal<strong>${avgTotaal}</strong></div>
      ${team.besteLeg     ? `<div class="stat-chip">Beste leg<strong>${team.besteLeg} 🎯</strong></div>` : ''}
      ${team.hoogsteFinish ? `<div class="stat-chip">Top finish<strong>${team.hoogsteFinish}</strong></div>` : ''}
    </div>
  `;
  panel.appendChild(kaart);

  _ensureHiddenInvoer();

  if (eersteLeg) {
    eersteLeg = false;
    const overlay = document.getElementById("startLogoOverlay");
    overlay.classList.add("visible");
    const audio = playSound('gameon.mp3');
    if (audio) audio.onended = () => overlay.classList.remove("visible");
    else overlay.classList.remove("visible");
  }

  suppressNextScoreAnnouncement = false;
  updateStatistieken();
};

/* ====================================================
   OVERRIDE: toonEindscherm
   ==================================================== */
const _origToonEindscherm = window.toonEindscherm;

window.toonEindscherm = function (winnaar, deelnemers) {
  _setGameMenuItems(false);

  if (!isMobile()) {
    _origToonEindscherm.call(this, winnaar, deelnemers);
    return;
  }

  document.getElementById("spelContainer").style.display = "none";
  document.getElementById("spel").style.display = "none";
  toggleSpelControls(false);

  const container = document.getElementById("eindscherm");
  container.style.display = "block";

  const gesorteerd = [...deelnemers].sort((a, b) => {
    const legsA = a.legsGewonnen || 0, legsB = b.legsGewonnen || 0;
    if (legsB !== legsA) return legsB - legsA;
    const sA = typeof a.score === "number" ? a.score : Infinity;
    const sB = typeof b.score === "number" ? b.score : Infinity;
    return sA - sB;
  });

  const medailles    = ["🥇","🥈","🥉"];
  const podiumKlasse = ["podium-goud","podium-zilver","podium-brons"];

  let html = `
    <div style="padding:20px 16px 8px;text-align:center;">
      <div style="font-size:2.5rem;">🏆</div>
      <h2 style="font-size:1.5rem;color:var(--gold);">Winnaar: ${winnaar.naam}</h2>
    </div>
    <div class="eind-actie-btns">
      <button class="btn-opnieuw" onclick="opnieuwSpelen()">🔄 Opnieuw</button>
      ${!teamMode ? `<button class="btn-speler" onclick="nieuweSpelerToevoegen()">➕ Speler</button>` : ''}
    </div>
    <div class="eind-ranglijst">
  `;

  gesorteerd.forEach((speler, idx) => {
    const totaal = Array.isArray(speler.totaalGeschiedenis) ? speler.totaalGeschiedenis : [];
    const avg = totaal.length ? gemiddelde(totaal).toFixed(1) : "0.0";
    const isWinnaar = speler.naam === winnaar.naam;
    html += `
      <div class="eind-kaart ${isWinnaar ? "winnaar-highlight" : ""} ${podiumKlasse[idx] || ""}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="eind-naam">${medailles[idx] || "#"+(idx+1)} ${speler.naam}</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--accent)">${speler.legsGewonnen||0}/${legsTeWinnen}</div>
        </div>
        <div class="eind-stats-grid">
          <div>Score: <strong>${speler.score}</strong></div>
          <div>Gem.: <strong>${avg}</strong></div>
          <div>Pijlen: <strong>${speler.pijlenGegooid||0}</strong></div>
          <div>Beste leg: <strong>${speler.besteLeg||'-'}</strong></div>
          <div>Top finish: <strong>${speler.hoogsteFinish||'-'}</strong></div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
};

/* ====================================================
   OVERRIDE: opnieuwSpelen
   ==================================================== */
const _origOpnieuwSpelen = window.opnieuwSpelen;

window.opnieuwSpelen = function () {
  document.getElementById("eindscherm").style.display = "none";
  numpadWaarde = "";
  updateScoreDisplay();
  _origOpnieuwSpelen.call(this);
};

/* ====================================================
   OVERRIDE: toggleSpelControls
   ==================================================== */
const _origToggleSpelControls = window.toggleSpelControls;

window.toggleSpelControls = function (tonen) {
  _origToggleSpelControls.call(this, tonen);
  const sc = document.getElementById("spelControls");
  if (sc) sc.style.display = tonen ? "flex" : "none";
};

/* ====================================================
   OVERRIDE: toggleAddPlayerSmallBtn  (no-op on mobile,
   menu handles it; kept so script.js doesn't error)
   ==================================================== */
window.toggleAddPlayerSmallBtn = function() {};

/* ====================================================
   HELPER: ensure hidden #invoer for script.js
   ==================================================== */
function _ensureHiddenInvoer() {
  if (!document.getElementById("invoer")) {
    const inp = document.createElement("input");
    inp.id = "invoer"; inp.type = "number"; inp.style.display = "none";
    document.body.appendChild(inp);
  }
}

/* ====================================================
   INIT
   ==================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // Restore theme
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem("dartTheme") || "dark"; } catch(e){}
  _applyTheme(savedTheme);

  // Hide game menu items until game starts
  _setGameMenuItems(false);

  // Hide spelControls until game starts
  const sc = document.getElementById("spelControls");
  if (sc) sc.style.display = "none";

  // MutationObserver: style dynamic elements from script.js
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.scoreselectie button').forEach(btn => {
      if (!btn.classList.contains('scoreknop')) btn.classList.add('scoreknop');
    });
    document.querySelectorAll('#teamSetup input[type="text"]').forEach(inp => {
      if (!inp.classList.contains('naamveld')) inp.classList.add('naamveld');
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Close menu on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _menuOpen) closeMenu();
  });
});
