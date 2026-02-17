/* ==========================================
   Dartcounter V1.5 — mobile.js
   Mobile rendering layer.
   Overrides renderSpel() and renderTeamSpel()
   from script.js to use the new mobile UI.
   All game logic stays in script.js untouched.
   ========================================== */

/* ---- Numpad state ---- */
let numpadWaarde = "";

function numpadInput(digit) {
  if (numpadWaarde.length >= 3) return; // max 3 digits (0-180)
  numpadWaarde += digit;
  updateScoreDisplay();
}

function numpadClear() {
  numpadWaarde = "";
  updateScoreDisplay();
}

function updateScoreDisplay() {
  const el = document.getElementById("scoreDisplayTekst");
  if (!el) return;
  el.textContent = numpadWaarde === "" ? "—" : numpadWaarde;
}

/**
 * Confirms the numpad value by stuffing it into the hidden input
 * then calling the correct confirm function from script.js.
 */
function bevestigVanNumpad() {
  const waarde = numpadWaarde === "" ? "0" : numpadWaarde;

  // Inject value into the existing #invoer field (script.js reads from there)
  let input = document.getElementById("invoer");
  if (!input) {
    // Create a hidden input if it somehow doesn't exist
    input = document.createElement("input");
    input.id = "invoer";
    input.type = "number";
    input.style.display = "none";
    document.body.appendChild(input);
  }
  input.value = waarde;

  // Clear numpad
  numpadWaarde = "";
  updateScoreDisplay();

  // Call the correct game function
  if (teamMode) {
    verwerkTeamBeurt(beurt);
  } else {
    verwerkBeurt(beurt);
  }
}

/* ---- Detect mobile ---- */
function isMobile() {
  return window.innerWidth < 768;
}

/* ====================================================
   OVERRIDE: renderSpel  (single mode)
   ==================================================== */
const _origRenderSpel = window.renderSpel; // keep reference to desktop version

window.renderSpel = function () {
  // Always run the desktop version for its side-effects
  // (it populates #spel which we don't use on mobile, but we need
  //  the flag-resets, toggleSpelControls, etc.)
  if (!isMobile()) {
    // On desktop: render into #spel as before, then ensure #spel is visible
    document.getElementById("spelContainer").style.display = "none";
    document.getElementById("spel").style.display = "flex";
    _origRenderSpel.call(this);
    return;
  }

  // ---- MOBILE PATH ----
  // Hide desktop #spel, show mobile container
  document.getElementById("spel").style.display = "none";
  document.getElementById("spelContainer").style.display = "flex";
  document.getElementById("eindscherm").style.display = "none";

  // Ensure controls visible (mirrors desktop behaviour)
  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(false); // we use fixed button

  // Add-player button
  const addBtn = document.getElementById("addPlayerSmallBtn");
  if (addBtn) addBtn.style.display = "flex";

  // ---- Scorebord (other players) ----
  const scorebord = document.getElementById("scorebord");
  scorebord.innerHTML = "";
  spelers.forEach((s, idx) => {
    if (idx === beurt) return; // active player shown separately
    const card = document.createElement("div");
    card.className = "sb-card";
    card.innerHTML = `
      <div class="sb-naam">${s.naam}</div>
      <div class="sb-score">${s.score}</div>
      <div class="sb-legs">${s.legsGewonnen}/${legsTeWinnen} legs</div>
    `;
    scorebord.appendChild(card);
  });

  // ---- Active Player Panel ----
  const panel = document.getElementById("actiefPanel");
  panel.innerHTML = "";
  const s = spelers[beurt];
  if (!s) return;

  const avgHuidig  = s.geschiedenis.length     ? gemiddelde(s.geschiedenis).toFixed(1)     : "0.0";
  const avgTotaal  = s.totaalGeschiedenis.length ? gemiddelde(s.totaalGeschiedenis).toFixed(1) : "0.0";
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
      ${s.besteLeg    ? `<div class="stat-chip">Beste leg<strong>${s.besteLeg} 🎯</strong></div>` : ''}
      ${s.hoogsteFinish ? `<div class="stat-chip">Top finish<strong>${s.hoogsteFinish}</strong></div>` : ''}
    </div>
    ${s.geschiedenis.length ? `<div class="actief-geschiedenis">📋 ${s.geschiedenis.slice(-8).join(" · ")}</div>` : ''}
  `;
  panel.appendChild(kaart);

  // Add hidden invoer so game logic can read it
  _ensureHiddenInvoer();

  // Start overlay / audio (mirror of original)
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
  if (!isMobile()) {
    document.getElementById("spelContainer").style.display = "none";
    document.getElementById("spel").style.display = "flex";
    _origRenderTeamSpel.call(this);
    return;
  }

  // ---- MOBILE PATH ----
  document.getElementById("spel").style.display = "none";
  document.getElementById("spelContainer").style.display = "flex";
  document.getElementById("eindscherm").style.display = "none";

  toggleSpelControls(true);

  // ---- Scorebord (other teams) ----
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

  // ---- Active Team Panel ----
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
      ${team.besteLeg    ? `<div class="stat-chip">Beste leg<strong>${team.besteLeg} 🎯</strong></div>` : ''}
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
  if (!isMobile()) {
    _origToonEindscherm.call(this, winnaar, deelnemers);
    return;
  }

  // Hide game UI
  document.getElementById("spelContainer").style.display = "none";
  document.getElementById("spel").style.display = "none";
  toggleSpelControls(false);

  const container = document.getElementById("eindscherm");
  container.style.display = "block";

  const gesorteerd = [...deelnemers].sort((a, b) => {
    const legsA = a.legsGewonnen || 0;
    const legsB = b.legsGewonnen || 0;
    if (legsB !== legsA) return legsB - legsA;
    const scoreA = typeof a.score === "number" ? a.score : Infinity;
    const scoreB = typeof b.score === "number" ? b.score : Infinity;
    return scoreA - scoreB;
  });

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

  const medailles = ["🥇","🥈","🥉"];
  const podiumClasses = ["podium-goud","podium-zilver","podium-brons"];

  gesorteerd.forEach((speler, idx) => {
    const totaal = Array.isArray(speler.totaalGeschiedenis) ? speler.totaalGeschiedenis : [];
    const avgTotal = totaal.length ? gemiddelde(totaal).toFixed(1) : "0.0";
    const isWinnaar = speler.naam === winnaar.naam;

    html += `
      <div class="eind-kaart ${isWinnaar ? "winnaar-highlight" : ""} ${podiumClasses[idx] || ""}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="eind-naam">${medailles[idx] || "#"+(idx+1)} ${speler.naam}</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--accent)">${speler.legsGewonnen || 0}/${legsTeWinnen}</div>
        </div>
        <div class="eind-stats-grid">
          <div>Score: <strong>${speler.score}</strong></div>
          <div>Gem.: <strong>${avgTotal}</strong></div>
          <div>Pijlen: <strong>${speler.pijlenGegooid || 0}</strong></div>
          <div>Beste leg: <strong>${speler.besteLeg || '-'}</strong></div>
          <div>Top finish: <strong>${speler.hoogsteFinish || '-'}</strong></div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
};

/* ====================================================
   OVERRIDE: opnieuwSpelen — keep game state in spelContainer
   ==================================================== */
const _origOpnieuwSpelen = window.opnieuwSpelen;

window.opnieuwSpelen = function () {
  document.getElementById("eindscherm").style.display = "none";
  numpadWaarde = "";
  updateScoreDisplay();
  _origOpnieuwSpelen.call(this);
  // After opnieuw, the render functions are called which handle mobile vs desktop
};

/* ====================================================
   Helper: ensure a hidden #invoer input exists
   script.js reads & writes document.getElementById("invoer")
   ==================================================== */
function _ensureHiddenInvoer() {
  if (!document.getElementById("invoer")) {
    const inp = document.createElement("input");
    inp.id = "invoer";
    inp.type = "number";
    inp.style.display = "none";
    document.body.appendChild(inp);
  }
}

/* ====================================================
   Override toggleSpelControls so it handles
   both old controls (#stopKnop/#herstelKnop in DOM)
   and mobile controls (#stopKnopMobiel/#herstelKnopMobiel)
   ==================================================== */
const _origToggleSpelControls = window.toggleSpelControls;

window.toggleSpelControls = function (tonen) {
  _origToggleSpelControls.call(this, tonen); // desktop controls
  // Mobile controls — always present in DOM
  const display = tonen ? "flex" : "none";
  const sc = document.getElementById("spelControls");
  if (sc) sc.style.display = display;
};

/* ====================================================
   Override toggleAddPlayerSmallBtn for mobile
   ==================================================== */
const _origToggleAdd = window.toggleAddPlayerSmallBtn;
window.toggleAddPlayerSmallBtn = function(tonen) {
  _origToggleAdd.call(this, tonen);
  // Also update our fixed mobile button (it's now a div, needs display:flex)
  const btn = document.getElementById("addPlayerSmallBtn");
  if (!btn) return;
  if (isMobile()) {
    btn.style.display = tonen ? "flex" : "none";
  }
};

/* ====================================================
   Setup screens: inject score-keuze and setup-row
   styling for mobile
   ==================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // Ensure spelControls starts hidden
  const sc = document.getElementById("spelControls");
  if (sc) sc.style.display = "none";

  // Wire up "score keuze" buttons to use scoreknop class
  // (this is done dynamically in script.js; we patch it after the fact via MutationObserver)
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.scoreselectie button').forEach(btn => {
      if (!btn.classList.contains('scoreknop')) {
        btn.classList.add('scoreknop');
      }
    });
    // Also style team setup inputs nicely
    document.querySelectorAll('#teamSetup input[type="text"]').forEach(inp => {
      inp.classList.add('naamveld');
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Apply saved theme
  _applyTheme(localStorage.getItem("dartTheme") || "dark");

  // Init draggable add-player button
  _initDraggableBtn();
});

/* ====================================================
   Keyboard: Enter key on desktop invoer still works
   (script.js already handles this, nothing to override)
   ==================================================== */

/* ====================================================
   THEME TOGGLE
   ==================================================== */
function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  const next = isLight ? "dark" : "light";
  _applyTheme(next);
  localStorage.setItem("dartTheme", next);
}

function _applyTheme(theme) {
  const btn = document.getElementById("themeToggle");
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (btn) btn.textContent = "🌙";
  } else {
    document.body.classList.remove("light-mode");
    if (btn) btn.textContent = "☀️";
  }
}

/* ====================================================
   DRAGGABLE ADD-PLAYER BUTTON
   Works with both touch and mouse.
   Saves position to localStorage so it persists.
   ==================================================== */
function _initDraggableBtn() {
  const btn = document.getElementById("addPlayerSmallBtn");
  if (!btn) return;

  // Restore saved position
  const saved = _loadBtnPos();
  if (saved) {
    btn.style.left   = saved.left;
    btn.style.top    = saved.top;
    btn.style.right  = "auto";
    btn.style.bottom = "auto";
  }

  let dragging = false;
  let startX, startY, origLeft, origTop;

  // ---- Touch ----
  btn.addEventListener("touchstart", (e) => {
    // Only drag via the grip, or the outer div directly (not the text span)
    if (e.target.classList.contains("drag-grip") || e.target === btn) {
      dragging = true;
      const touch = e.touches[0];
      const rect = btn.getBoundingClientRect();
      startX = touch.clientX - rect.left;
      startY = touch.clientY - rect.top;
      btn.style.transition = "none";
      e.preventDefault();
    }
  }, { passive: false });

  btn.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    _moveTo(btn, touch.clientX - startX, touch.clientY - startY);
  }, { passive: false });

  btn.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    _clampAndSave(btn);
  });

  // ---- Mouse ----
  btn.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("drag-grip") || e.target === btn) {
      dragging = true;
      const rect = btn.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      btn.style.transition = "none";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    _moveTo(btn, e.clientX - startX, e.clientY - startY);
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    _clampAndSave(btn);
  });
}

function _moveTo(el, x, y) {
  el.style.left   = x + "px";
  el.style.top    = y + "px";
  el.style.right  = "auto";
  el.style.bottom = "auto";
}

function _clampAndSave(el) {
  const rect = el.getBoundingClientRect();
  const maxX = window.innerWidth  - rect.width  - 4;
  const maxY = window.innerHeight - rect.height - 4;
  const clampedLeft = Math.max(4, Math.min(rect.left, maxX));
  const clampedTop  = Math.max(4, Math.min(rect.top,  maxY));
  el.style.left = clampedLeft + "px";
  el.style.top  = clampedTop  + "px";
  localStorage.setItem("dartAddBtnPos", JSON.stringify({ left: clampedLeft + "px", top: clampedTop + "px" }));
}

function _loadBtnPos() {
  try {
    const raw = localStorage.getItem("dartAddBtnPos");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
