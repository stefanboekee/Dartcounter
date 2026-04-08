// -------------------------------
// Dartcounter - script.js (opgeschoond)
// Structuur:
// 1) Config & globale variabelen
// 2) UI helpers (tonen/verbergen, geluiden)
// 3) Setup functies (single / teams)
// 4) Spelverloop (beurt verwerken, teams, herstel, stoppen)
// 5) Render functies (scherm bijwerken voor single en team)
// 6) Helpers (gemiddelde, checkout hints, statistieken update)
// Alle comments en namen zijn in het Nederlands.
// -------------------------------

/* ===========================
   1) Config & globale variabelen
   =========================== */

let spelers = [];
let teams = [];
let teamMode = false;

let beurt = 0;                  // index van huidige speler of team (in single mode index speler)
let teamBeurtIndex = 0;         // extra teller voor wie binnen een team momenteel gooit
let eersteLeg = true;
let startScore = 501;
let legsTeWinnen = 3;

let sessieGeschiedenis = [];   // korte log voor UI (vb. 'Jan wint een leg!')
let herstelGeschiedenis = [];   // stapel voor undo (meerdere levels)

let startVolgordeIndex = 0;
let vorigeScore = null;

// Team-modus beurtbeheer: één globale positie in de platte spelersvolgorde.
// De platte volgorde is: T0S0, T1S0, T2S0, T0S1, T1S1, T2S1, T0S0, ...
// legStartPositie telt elke leg +1 op (ook tussen matches door).
let legStartPositie = 0;
let globaleBeurtPositie = 0;

let huidigeAudio = null; // globale referentie naar momenteel spelend audio-object
let suppressNextScoreAnnouncement = false;

const ongeldigeScores = [179, 178, 176, 175, 173, 172, 169, 166, 163]; // scores die niet mogelijk zijn


/* ===========================
   1b) Thema & menu helpers
   Stubs — mobile.js overschrijft deze na het laden.
   =========================== */

/**
 * Wissel tussen licht en donker thema.
 * Wordt overschreven door mobile.js; deze versie dekt het geval
 * dat mobile.js nog niet geladen is.
 */
function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  const next = isLight ? "dark" : "light";
  document.body.classList.toggle("light-mode", next === "light");
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = next === "light" ? "☀️" : "🌙";
  try { localStorage.setItem("dartTheme", next); } catch(e) {}
}

/**
 * Stubs voor hamburger-menu functies (gedefinieerd in mobile.js).
 * Hier gedefinieerd zodat inline onclick-handlers niet falen
 * als mobile.js (nog) niet geladen is.
 */
function toggleMenu()        { /* overschreven door mobile.js */ }
function closeMenu()         { /* overschreven door mobile.js */ }
function openMenu()          { /* overschreven door mobile.js */ }
function menuToggleTheme()   { toggleTheme(); }
function menuNieuweSpeler()  { nieuweSpelerToevoegen(); }
function menuHerstel()       { herstelLaatsteScore(); }
function menuStop()          { stopSpel(); }

/* ===========================
   2) UI helpers (tonen / verbergen, geluid)
   =========================== */

/**
 * Toon of verberg de belangrijkste bedieningsknoppen (stop / herstel).
 * We gebruiken inline-block zodat de knoppen op 1 lijn blijven wanneer zichtbaar.
 */
function toggleSpelControls(tonen) {
  const display = tonen ? "inline-block" : "none";
  const stopKnop = document.getElementById("stopKnop");
  const herstelKnop = document.getElementById("herstelKnop");
  if (stopKnop) stopKnop.style.display = display;
  if (herstelKnop) herstelKnop.style.display = display;
}

function toon67Gif(duration = 3000) {
  const overlay = document.getElementById("gif67Overlay");
  if (!overlay) return;

  overlay.classList.add("visible");

  setTimeout(() => {
    overlay.classList.remove("visible");
  }, duration);
}

/**
 * Toon of verberg de kleine "Nieuwe speler" knop (onder waar de statistieken stonden).
 */
function toggleAddPlayerSmallBtn(tonen) {
  const btn = document.getElementById("addPlayerSmallBtn");
  if (!btn) return;
  btn.style.display = tonen ? "inline-block" : "none";
}

/**
 * Speel een geluid; stop eerst het huidige geluid (indien aanwezig).
 * Retourneert het Audio-object (of null).
 */
function playSound(src) {
  try {
    // stop eventueel bestaand geluid
    if (huidigeAudio) {
      try { huidigeAudio.pause(); huidigeAudio.currentTime = 0; } catch (e) {}
      huidigeAudio = null;
    }

    const audio = new Audio(src);
	audio.playbackRate = 1.25; // 🎧 Speelt geluid 25% sneller af
    huidigeAudio = audio;
    audio.play().catch(() => {});

    // schoonmaken wanneer audio is afgelopen
    audio.onended = () => {
      if (huidigeAudio === audio) huidigeAudio = null;
    };

    return audio;
  } catch (e) {
    return null;
  }
}

/* ===========================
   3) Setup functies (single & team)
   =========================== */

/**
 * Gebruiker kiest game modus single of teams.
 * Toont de score-keuze (301 / 501) en configureert teamMode.
 */
function selecteerModus(mode) {
  document.getElementById("keuzeMode").style.display = 'none';

  const scoreKeuze = document.createElement("div");
  scoreKeuze.id = "scoreKeuze";
  scoreKeuze.className = "scoreselectie";
  scoreKeuze.innerHTML = `
    <h3>Kies startscore:</h3>
    <div class="setup-btn-row">
      <button class="primary-btn" onclick="selecteerStartScore('${mode}', 301)">301</button>
      <button class="primary-btn" onclick="selecteerStartScore('${mode}', 501)">501</button>
    </div>
    <div class="setup-btn-row" style="max-width:200px;">
      <button class="back-btn" onclick="terug_naarModus()">← Terug</button>
    </div>
  `;
  document.body.insertBefore(scoreKeuze, document.getElementById("setup"));
  teamMode = (mode === 'teams');
}

function terug_naarModus() {
  document.getElementById("scoreKeuze")?.remove();
  document.getElementById("setup").style.display = "none";
  document.getElementById("teamSetup").style.display = "none";
  document.getElementById("teamSetup").innerHTML = "";
  document.getElementById("keuzeMode").style.display = "block";
}

/**
 * Startscore gekozen — toon juiste setup (namen of teamsetup).
 */
function selecteerStartScore(mode, score) {
  startScore = score;
  document.getElementById("scoreKeuze")?.remove();

  if (mode === 'teams') {
    document.getElementById("setup").style.display = 'none';
    const teamSetupEl = document.getElementById("teamSetup");
    teamSetupEl.innerHTML = `
      <label for="aantalTeams">Aantal teams:</label>
      <input type="number" id="aantalTeams" min="2" max="4" value="3" class="compact-input">
      <label for="aantalLegs">Aantal legs te winnen:</label>
      <input type="number" id="aantalLegs" min="1" max="10" value="2" class="compact-input">
      </br>
      <div class="setup-btn-row">
        <button class="back-btn" onclick="terug_naarScore('teams')">← Terug</button>
        <button class="primary-btn" onclick="setupTeams()">Volgende →</button>
      </div>
    `;
    teamSetupEl.style.display = 'block';
  } else {
    document.getElementById("setup").style.display = 'block';
  }
}

function terug_naarScore(mode) {
  document.getElementById("teamSetup").style.display = "none";
  document.getElementById("teamSetup").innerHTML = "";
  document.getElementById("setup").style.display = "none";
  document.getElementById("namenSetup").style.display = "none";
  document.getElementById("namenSetup").innerHTML = "";
  selecteerModus(mode);
}

/**
 * Team setup (aantal teams gekozen) — bouw formulier voor teamnamen & spelers.
 */
function setupTeams() {
  const aantal = parseInt(document.getElementById("aantalTeams").value);
  legsTeWinnen = parseInt(document.getElementById("aantalLegs").value);
  const container = document.getElementById("teamSetup");
  container.innerHTML = `<h2>Teamnamen en spelers</h2>`;
  for (let i = 0; i < aantal; i++) {
    container.innerHTML += `
      <label>Team ${i + 1} naam:</label>
      <input type="text" id="teamNaam${i}" placeholder="Team ${i + 1}" class="naamveld">
      <label>Spelers (komma-gescheiden):</label>
      <input type="text" id="teamSpelers${i}" placeholder="bijv. Jan,Piet" class="naamveld">
      </br>
    `;
  }
  container.innerHTML += `
    <div class="setup-btn-row">
      <button class="back-btn" onclick="terug_naarScore('teams')">← Terug</button>
      <button class="primary-btn" onclick="startTeamSpel(${aantal})">Start teamspel</button>
    </div>
  `;
}

/**
 * Start een teamspel met de ingevulde teams en spelers.
 */
function startTeamSpel(aantal) {
  teams = [];
  beurt = 0;
  teamBeurtIndex = 0;
  legStartPositie = 0;
  globaleBeurtPositie = 0;
  sessieGeschiedenis = [];
  herstelGeschiedenis = [];

  for (let i = 0; i < aantal; i++) {
    const teamNaam = document.getElementById(`teamNaam${i}`).value || `Team ${i + 1}`;
    const spelersInput = document.getElementById(`teamSpelers${i}`).value;
    const teamSpelers = spelersInput.split(',').map(n => n.trim()).filter(Boolean);
    teams.push({
      naam: teamNaam,
      score: startScore,
      spelers: teamSpelers,
      legsGewonnen: 0,
      geschiedenis: [],        // scores huidige leg
      totaalGeschiedenis: [],  // alle scores van alle legs
      pijlenGegooid: 0,
      besteLeg: null,
      hoogsteFinish: null,
      trainActief: false     // 🚂 geluid al gespeeld deze leg?
    });
  }

  document.getElementById("teamSetup").style.display = 'none';
  renderTeamSpel();
}

/**
 * Setup namen voor single mode (aantal spelers)
 */
function setupNamen() {
  const aantal = parseInt(document.getElementById("aantalSpelers").value);
  legsTeWinnen = parseInt(document.getElementById("aantalLegs").value);

  // Verberg setup, toon namenSetup (ook na een stop/herstart)
  document.getElementById("setup").style.display = "none";
  const container = document.getElementById("namenSetup");
  container.style.display = "block";
  container.innerHTML = "<h2>Voer spelersnamen in</h2>";

  const namenOpties = [
    "Gerbrand",
    "Guido",
    "Harm",
    "Sander",
    "Thomas",
    "Ron",
    "Stefan",
    "Kylian",
    "Joshua",
	"Bunyamin",
	"Sanne",
    "Anders"
  ];

  for (let i = 0; i < aantal; i++) {
    container.innerHTML += `
      <label>Speler ${i + 1} naam:</label>
      <select id="spelerSelect${i}" class="naamveld-select" onchange="toggleInput(${i})">
        ${namenOpties.map(naam => `<option value="${naam}">${naam}</option>`).join("")}
      </select>
      <input type="text" id="spelerInput${i}" class="naamveld-input" placeholder="Vul naam in..."><br>
    `;
  }

  container.innerHTML += `
    <div class="setup-btn-row">
      <button class="back-btn" onclick="terug_naarSetup()">← Terug</button>
      <button id="bevestigNamen" class="primary-btn" onclick="startSpel(${aantal})">Start spel</button>
    </div>
  `;
}

function terug_naarSetup() {
  const namenSetup = document.getElementById("namenSetup");
  namenSetup.style.display = "none";
  namenSetup.innerHTML = "";
  document.getElementById("setup").style.display = "block";
}

/**
 * Start een single-player match (meerdere spelers, niet teams).
 */
function startSpel(aantal) {
  spelers = [];
  beurt = 0;
  sessieGeschiedenis = [];

  for (let i = 0; i < aantal; i++) {
    const select = document.getElementById(`spelerSelect${i}`);
    const input = document.getElementById(`spelerInput${i}`);
    const naam = select.value === "Anders" ? input.value.trim() : select.value;

    if (!naam) {
      alert(`Vul een naam in bij speler ${i+1}`);
      return;
    }

    spelers.push({
      naam,
      score: startScore,
      geschiedenis: [],
      scores: [], // huidige leg
      totaalGeschiedenis: [], // alle scores van alle legs
      legsGewonnen: 0,
      pijlenGegooid: 0,
      besteLeg: null,
      trainActief: false  // 🚂 geluid al gespeeld deze leg?
    });
  }

  document.getElementById("setup").style.display = "none";
  document.getElementById("namenSetup").style.display = "none";
  renderSpel();
}
/* ===========================
   4) Spelverloop (beurten verwerken, herstel, stop, opnieuw)
   =========================== */

/**
 * Verwerk een beurt voor single mode.
 * index = index van speler die de beurt bevestigt.
 */
function verwerkBeurt(index) {
  const input = document.getElementById("invoer");
  const score = parseInt(input?.value || "0", 10);
  // 🎯 67 gegooid → GIF (niet bij 67 over)
if (score === 67) {
  toon67Gif();
}


  if (isNaN(score) || score < 0 || score > 180 || ongeldigeScores.includes(score)) {
    alert("Voer een geldige score in tussen 0 en 180.");
    if (input) {
      input.value = '';
      input.focus();
    }
    return;
  }

  const speler = spelers[index];
  const nieuweScore = speler.score - score;

  let isLegOfMatchWin = false;

  // push naar undo stack (snapshot wordt hieronder aangevuld indien leg win)
  herstelGeschiedenis.push({
    index,
    score,
    pijlen: 3,
    wasLegWin: false,
    spelersSnapshot: null,
    vorigeBeurt: index,
    vorigeStartVolgordeIndex: startVolgordeIndex
  });

  // Sla snapshot op VÓÓR pijlen en stats worden bijgewerkt, zodat leg-win herstel volledig werkt
  if (nieuweScore === 0) {
    herstelGeschiedenis[herstelGeschiedenis.length - 1].wasLegWin = true;
    herstelGeschiedenis[herstelGeschiedenis.length - 1].spelersSnapshot = spelers.map(s => ({
      score: s.score,
      geschiedenis: [...s.geschiedenis],
      totaalGeschiedenis: [...s.totaalGeschiedenis],
      legsGewonnen: s.legsGewonnen,
      pijlenGegooid: s.pijlenGegooid,
      besteLeg: s.besteLeg,
      hoogsteFinish: s.hoogsteFinish
    }));
  }

  // pijlen tellen
  speler.pijlenGegooid = (speler.pijlenGegooid || 0) + 3;

  /* =========================
     🎯 LEG OF MATCH GEWONNEN
     ========================= */
  if (nieuweScore === 0) {
    isLegOfMatchWin = true;

    speler.geschiedenis.push(score);
    speler.totaalGeschiedenis.push(score);
    speler.legsGewonnen++;
    sessieGeschiedenis.push(`${speler.naam} wint een leg!`);

    // hoogste finish
    if (!speler.hoogsteFinish || speler.score > speler.hoogsteFinish) {
      speler.hoogsteFinish = speler.score;
    }

    // beste leg (min pijlen)
    if (!speler.besteLeg || speler.pijlenGegooid < speler.besteLeg) {
      speler.besteLeg = speler.pijlenGegooid;
    }

    // 🏆 MATCH GEWONNEN → alleen victory
    if (speler.legsGewonnen >= legsTeWinnen) {
      playSound('victory.mp3');
      toonEindscherm(speler, spelers);
      return;
    }

    // 🎉 NORMALE LEG WIN → alleen leg win
    playSound('leg_win.mp3');

    // reset spelers voor nieuwe leg
    spelers.forEach(s => {
      s.score = startScore;
      s.geschiedenis = [];
      s.pijlenGegooid = 0;
      s.trainActief = false;  // 🚂 reset voor nieuwe leg
    });

    // volgende startspeler
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % spelers.length;
  }

  /* =========================
     ❌ BUST
     ========================= */
  else if (nieuweScore < 0 || nieuweScore === 1) {
    alert("Bust!");
  }

  /* =========================
     ✅ NORMALE SCORE
     ========================= */
  else {
    speler.score = nieuweScore;
    speler.geschiedenis.push(score);
    speler.totaalGeschiedenis.push(score);
    beurt = (beurt + 1) % spelers.length;
  }

  // input reset
  if (input) input.value = '';

  /* =========================
     🔊 SCORE AUDIO (alleen als GEEN leg/match win)
     ========================= */
  if (!isLegOfMatchWin) {
    const spelendeSpeler = spelers[index];
    const legAvgNa = spelendeSpeler.geschiedenis.length ? gemiddelde(spelendeSpeler.geschiedenis) : null;
    const opFinish = spelendeSpeler.score <= 170 && getCheckoutHint(spelendeSpeler.score) !== '-';
    const isTrainNu = legAvgNa !== null && legAvgNa < 26 && !opFinish;

    // Als speler boven 26 gemiddelde uitkomt, reset zodat het geluid opnieuw kan spelen
    if (!isTrainNu) spelendeSpeler.trainActief = false;

    // 🚂 Speel score-geluid eerst, daarna train als dat van toepassing is
    const audio = playSound(`${score}.mp3`);
    if (audio) {
      audio.onended = () => {
        if (isTrainNu && !spelendeSpeler.trainActief) {
          // Eerste keer (of opnieuw) onder 26: speel trein
          spelendeSpeler.trainActief = true;
          playSound('train.mp3');
        } else {
          // Normale stroom: aankondiging volgende speler
          const volgendeSpeler = spelers[beurt];
          if (volgendeSpeler && volgendeSpeler.score <= 170) {
            const intro = playSound('your_score_is.mp3');
            if (intro) {
              intro.onended = () => playSound(`${volgendeSpeler.score}.wav`);
            } else {
              playSound(`${volgendeSpeler.score}.wav`);
            }
          }
        }
      };
    }
  }

  renderSpel();
}


/**
 * Verwerk een beurt voor team mode.
 * tIndex = team index
 */
function verwerkTeamBeurt(tIndex) {
  const input = document.getElementById("invoer");
  const score = parseInt(input?.value || "0", 10);

  if (isNaN(score) || score < 0 || score > 180 || ongeldigeScores.includes(score)) {
    alert("Voer een geldige score in tussen 0 en 180.");
    if (input) {
      input.value = '';
      input.focus();
    }
    return;
  }

  const team = teams[tIndex];
  const { spelerIndex } = teamBeurtInfo(globaleBeurtPositie);
  const nieuweScore = team.score - score;

  let isLegOfMatchWin = false;

  // undo stack
  herstelGeschiedenis.push({
    team: tIndex,
    score,
    spelerIndex,
    pijlen: 3,
    wasLegWin: false,
    teamsSnapshot: null,
    vorigeBeurt: tIndex,
    vorigeGlobaleBeurtPositie: globaleBeurtPositie,
    vorigeLegStartPositie: legStartPositie,
    vorigeStartVolgordeIndex: startVolgordeIndex
  });

  // Sla snapshot op VÓÓR pijlen en stats worden bijgewerkt
  if (nieuweScore === 0) {
    herstelGeschiedenis[herstelGeschiedenis.length - 1].wasLegWin = true;
    herstelGeschiedenis[herstelGeschiedenis.length - 1].teamsSnapshot = teams.map(t => ({
      score: t.score,
      geschiedenis: [...t.geschiedenis],
      totaalGeschiedenis: [...t.totaalGeschiedenis],
      legsGewonnen: t.legsGewonnen,
      pijlenGegooid: t.pijlenGegooid,
      besteLeg: t.besteLeg,
      hoogsteFinish: t.hoogsteFinish
    }));
  }

  // pijlen tellen
  team.pijlenGegooid = (team.pijlenGegooid || 0) + 3;

  /* =========================
     🎯 LEG OF MATCH GEWONNEN
     ========================= */
  if (nieuweScore === 0) {
    isLegOfMatchWin = true;

    team.geschiedenis.push(score);
    team.totaalGeschiedenis.push(score);
    team.legsGewonnen++;
    sessieGeschiedenis.push(`${team.naam} wint een leg!`);

    // hoogste finish
    if (!team.hoogsteFinish || team.score > team.hoogsteFinish) {
      team.hoogsteFinish = team.score;
    }

    // beste leg (min pijlen)
    if (!team.besteLeg || team.pijlenGegooid < team.besteLeg) {
      team.besteLeg = team.pijlenGegooid;
    }

    // 🏆 MATCH GEWONNEN → alleen victory
    if (team.legsGewonnen >= legsTeWinnen) {
      playSound('victory.mp3');
      toonEindscherm(team, teams);
      return;
    }

    // 🎉 NORMALE LEG WIN → alleen leg win
    playSound('leg_win.mp3');

    // reset teams voor nieuwe leg
    teams.forEach(t => {
      t.score = startScore;
      t.pijlenGegooid = 0;
      t.geschiedenis = [];
      t.trainActief = false;
    });

    // Volgende leg: startpositie schuift 1 op
    legStartPositie++;
    globaleBeurtPositie = legStartPositie;
    beurt = teamBeurtInfo(globaleBeurtPositie).teamIndex;
  }

  /* =========================
     ❌ BUST
     ========================= */
  else if (nieuweScore < 0 || nieuweScore === 1) {
    alert("Bust!");
  }

  /* =========================
     ✅ NORMALE SCORE
     ========================= */
  else {
    team.score = nieuweScore;
    team.geschiedenis.push(score);
    team.totaalGeschiedenis.push(score);

    globaleBeurtPositie++;
    beurt = teamBeurtInfo(globaleBeurtPositie).teamIndex;
  }

  // input reset
  if (input) input.value = '';

  /* =========================
     🔊 SCORE AUDIO (alleen als GEEN leg/match win)
     ========================= */
  if (!isLegOfMatchWin) {
    const teamLegAvgNa = team.geschiedenis.length ? gemiddelde(team.geschiedenis) : null;
    const teamOpFinish = team.score <= 170 && getCheckoutHint(team.score) !== '-';
    const isTeamTrainNu = teamLegAvgNa !== null && teamLegAvgNa < 26 && !teamOpFinish;

    // Als team boven 26 gemiddelde uitkomt, reset zodat het geluid opnieuw kan spelen
    if (!isTeamTrainNu) team.trainActief = false;

    // 🚂 Speel score-geluid eerst, daarna train als dat van toepassing is
    const audio = playSound(`${score}.mp3`);
    if (audio) {
      audio.onended = () => {
        if (isTeamTrainNu && !team.trainActief) {
          // Eerste keer (of opnieuw) onder 26: speel trein
          team.trainActief = true;
          playSound('train.mp3');
        } else {
          // Normale stroom: aankondiging volgend team
          const volgendeTeam = teams[beurt];
          if (volgendeTeam && volgendeTeam.score <= 170) {
            const intro = playSound('your_score_is.mp3');
            if (intro) {
              intro.onended = () => playSound(`${volgendeTeam.score}.wav`);
            } else {
              playSound(`${volgendeTeam.score}.wav`);
            }
          }
        }
      };
    }
  }

  renderTeamSpel();
}


/**
 * Voeg een nieuwe speler toe (alleen in single mode).
 * Vraagt bevestiging en naam via prompts.
 */
function nieuweSpelerToevoegen() {
  if (teamMode) return;

  if (!confirm("Weet je zeker dat je een nieuwe speler wilt toevoegen?")) return;

  const naam = prompt("Voer de naam van de nieuwe speler in:");
  if (!naam || !naam.trim()) return;

  spelers.push({
    naam: naam.trim(),
    score: startScore,
    geschiedenis: [],
    totaalGeschiedenis: [],
    legsGewonnen: 0,
    pijlenGegooid: 0,
    besteLeg: null,
    hoogsteFinish: null
  });

  renderSpel();
}


/**
 * Herstart het spel (reset spelers naar startwaarden maar behoud spelerslijst)
 */
function herstartSpel() {
  eersteLeg = true;
  sessieGeschiedenis = [];
  herstelGeschiedenis = [];

  spelers.forEach(s => {
    s.score = startScore;
    s.geschiedenis = [];
    if (!Array.isArray(s.totaalGeschiedenis)) s.totaalGeschiedenis = [];
    s.pijlenGegooid = 0;
    s.besteLeg = null;
    s.hoogsteFinish = s.hoogsteFinish || null; // behouden indien aanwezig
    s.legsGewonnen = 0;
    s.trainActief = false;
  });

  startVolgordeIndex = 0;
  beurt = 0;

  document.getElementById("eindscherm").style.display = "none";
  document.getElementById("spel").style.display = "flex";

  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(true);
  renderSpel();
}

/**
 * Undo / herstel laatste invoer (meerdere stappen mogelijk).
 */
function herstelLaatsteScore() {
  if (herstelGeschiedenis.length === 0) {
    alert("Niets om te herstellen.");
    return;
  }

  const laatste = herstelGeschiedenis.pop();

  if (teamMode && laatste?.team !== undefined) {

    // ── Leg-win herstel: zet alle teams terug naar snapshot ──
    if (laatste.wasLegWin && laatste.teamsSnapshot) {
      laatste.teamsSnapshot.forEach((snap, i) => {
        teams[i].score              = snap.score;
        teams[i].geschiedenis       = [...snap.geschiedenis];
        teams[i].totaalGeschiedenis = [...snap.totaalGeschiedenis];
        teams[i].legsGewonnen       = snap.legsGewonnen;
        teams[i].pijlenGegooid      = snap.pijlenGegooid;
        teams[i].besteLeg           = snap.besteLeg;
        teams[i].hoogsteFinish      = snap.hoogsteFinish;
      });
      globaleBeurtPositie = laatste.vorigeGlobaleBeurtPositie;
      legStartPositie     = laatste.vorigeLegStartPositie;
      beurt               = laatste.vorigeBeurt;
      startVolgordeIndex  = laatste.vorigeStartVolgordeIndex;
    } else {
      // Normale herstel
      const t = teams[laatste.team];
      t.score = Math.min(t.score + laatste.score, startScore);
      if (t.geschiedenis.length) t.geschiedenis.pop();
      if (t.totaalGeschiedenis.length) t.totaalGeschiedenis.pop();
      t.pijlenGegooid = Math.max(0, (t.pijlenGegooid || 0) - (laatste.pijlen || 3));
      globaleBeurtPositie = laatste.vorigeGlobaleBeurtPositie;
      beurt = laatste.vorigeBeurt;
    }

    sessieGeschiedenis.push(
      `Herstel: ${teamBeurtInfo(globaleBeurtPositie).spelerNaam} (${teams[beurt].naam}) is weer aan de beurt.`
    );
    suppressNextScoreAnnouncement = true;
    renderTeamSpel();

  } else if (!teamMode && laatste?.index !== undefined) {

    // ── Leg-win herstel: zet alle spelers terug naar snapshot ──
    if (laatste.wasLegWin && laatste.spelersSnapshot) {
      laatste.spelersSnapshot.forEach((snap, i) => {
        spelers[i].score              = snap.score;
        spelers[i].geschiedenis       = [...snap.geschiedenis];
        spelers[i].totaalGeschiedenis = [...snap.totaalGeschiedenis];
        spelers[i].legsGewonnen       = snap.legsGewonnen;
        spelers[i].pijlenGegooid      = snap.pijlenGegooid;
        spelers[i].besteLeg           = snap.besteLeg;
        spelers[i].hoogsteFinish      = snap.hoogsteFinish;
      });
      beurt              = laatste.vorigeBeurt;
      startVolgordeIndex = laatste.vorigeStartVolgordeIndex;
    } else {
      // Normale herstel
      const s = spelers[laatste.index];
      s.score = Math.min(s.score + laatste.score, startScore);
      if (s.geschiedenis.length) s.geschiedenis.pop();
      if (s.totaalGeschiedenis.length) s.totaalGeschiedenis.pop();
      s.pijlenGegooid = Math.max(0, (s.pijlenGegooid || 0) - (laatste.pijlen || 3));
      beurt = laatste.index;
    }

    sessieGeschiedenis.push(`Herstel: ${spelers[beurt].naam} is weer aan de beurt.`);
    suppressNextScoreAnnouncement = true;
    renderSpel();
  }
}

/**
 * Stop het spel en keer terug naar het startscherm (met confirm).
 * Geen page reload — reset alle state en toon de moduskeuze.
 */
function stopSpel() {
  if (!confirm("Weet je zeker dat je het spel wilt stoppen en terug wilt naar het startscherm?")) return;

  // Reset alle spelstate
  spelers = [];
  teams = [];
  teamMode = false;
  beurt = 0;
  teamBeurtIndex = 0;
  legStartPositie = 0;
  globaleBeurtPositie = 0;
  eersteLeg = true;
  startScore = 501;
  legsTeWinnen = 3;
  sessieGeschiedenis = [];
  herstelGeschiedenis = [];
  startVolgordeIndex = 0;

  // Stop audio
  if (huidigeAudio) {
    try { huidigeAudio.pause(); huidigeAudio.currentTime = 0; } catch(e) {}
    huidigeAudio = null;
  }

  // Verberg alle spelschermen
  toggleSpelControls(false);
  toggleAddPlayerSmallBtn(false);

  // Verberg spelschermen (niet namenSetup/teamSetup — die worden zichtbaar via setupNamen/selecteerStartScore)
  const ids = ["spel","spelContainer","eindscherm","setup","controls"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // Verwijder dynamisch aangemaakte scoreKeuze div indien aanwezig
  document.getElementById("scoreKeuze")?.remove();

  // Leeg en verberg dynamische containers; display wordt gereset zodat ze opnieuw getoond kunnen worden
  const namenSetup = document.getElementById("namenSetup");
  if (namenSetup) { namenSetup.innerHTML = ""; namenSetup.style.display = ""; }
  const teamSetup = document.getElementById("teamSetup");
  if (teamSetup) { teamSetup.innerHTML = ""; teamSetup.style.display = "none"; }
  const eindscherm = document.getElementById("eindscherm");
  if (eindscherm) { eindscherm.innerHTML = ""; eindscherm.style.display = "none"; }

  // Toon startscherm
  const keuze = document.getElementById("keuzeMode");
  if (keuze) keuze.style.display = "block";

  // Laat menu-items verdwijnen (via mobile.js hook als beschikbaar)
  if (typeof _setGameMenuItems === "function") _setGameMenuItems(false);
}

/* ===========================
   5) Render functies
   - renderSpel() voor single mode
   - renderTeamSpel() voor team mode
   - toonEindscherm() voor einde van match
   =========================== */

/**
 * Render het spel voor single mode (spelerskaarten).
 */
/**
 * Quick-enter a score (desktop): fills input and confirms the turn.
 */
function snelScoreInvoeren(score) {
  const input = document.getElementById('invoer');
  if (input) input.value = score;
  if (teamMode) {
    verwerkTeamBeurt(beurt);
  } else {
    verwerkBeurt(beurt);
  }
}

function renderSpel() {
  if (typeof _setGameMenuItems === "function") _setGameMenuItems(true);
  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(!teamMode);

  const container = document.getElementById("spel");
  container.innerHTML = '';

  const actief = spelers[beurt];
  const nextIdx = (beurt + 1) % spelers.length;

  // ── Desktop layout (ds-* elements) ──
  const desktopWrap = document.createElement("div");
  desktopWrap.className = "ds-actief-wrap";

  const avgHuidig = actief.geschiedenis.length ? gemiddelde(actief.geschiedenis).toFixed(1) : '—';
  const avgTotaal = actief.totaalGeschiedenis.length ? gemiddelde(actief.totaalGeschiedenis).toFixed(1) : '—';
  const checkout = getCheckoutHint(actief.score);
  const hist = actief.geschiedenis.slice(-6).join('  ·  ') || '—';

  // Train emoji for large tile: avg of current leg < 26
  const actiefLegAvg = actief.geschiedenis.length ? gemiddelde(actief.geschiedenis) : null;
  const actiefTrainEmoji = (actiefLegAvg !== null && actiefLegAvg < 26) ? ' 🚂' : '';

  desktopWrap.innerHTML = `
    <div class="ds-actief">

      <div class="ds-actief-left">
        <div class="ds-actief-name">${actief.naam}${actiefTrainEmoji}</div>
        <div class="ds-actief-legs">Legs: ${actief.legsGewonnen} / ${legsTeWinnen}</div>
        <div class="ds-actief-stat-grid">
          <div class="ds-stat">
            <div class="ds-stat-label">Gem. leg</div>
            <div class="ds-stat-value">${avgHuidig}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Gem. totaal</div>
            <div class="ds-stat-value">${avgTotaal}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Pijlen</div>
            <div class="ds-stat-value">${actief.pijlenGegooid || 0}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Beste leg</div>
            <div class="ds-stat-value">${actief.besteLeg || '—'}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Hoogste finish</div>
            <div class="ds-stat-value">${actief.hoogsteFinish || '—'}</div>
          </div>
        </div>
        <div class="ds-geschiedenis-text">📋 ${hist}</div>
      </div>

      <div class="ds-actief-score-wrap">
        <div class="ds-actief-big-score">${actief.score}</div>
        ${checkout !== '-' ? `<div class="ds-checkout-hint">🎯 ${checkout}</div>` : ''}
        <div class="ds-label-score">resterend</div>
      </div>

      <div class="ds-actief-right">
        <div class="ds-invoer-label">Score invoeren</div>
        <input id="invoer" class="ds-invoer-input" type="number" min="0" max="180" placeholder="0" autocomplete="off">
        <button class="ds-bevestig-btn" onclick="verwerkBeurt(${beurt})">✓ Bevestig</button>
        <div class="ds-quick-group">
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(11)">11</button>
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(26)">26</button>
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(67)">67</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(desktopWrap);

  // ── Compact tiles for ALL players ──
  const othersWrap = document.createElement("div");
  othersWrap.className = "ds-tiles-wrap";

  const tilesLabel = document.createElement("div");
  tilesLabel.className = "ds-tiles-label";
  tilesLabel.textContent = "Alle spelers";
  othersWrap.appendChild(tilesLabel);

  const tilesGrid = document.createElement("div");
  tilesGrid.className = "ds-tiles-grid";

  spelers.forEach((speler, index) => {
    const isActief = (index === beurt);
    const avg = speler.totaalGeschiedenis.length ? gemiddelde(speler.totaalGeschiedenis).toFixed(1) : '—';
    const avgLeg = speler.geschiedenis.length ? gemiddelde(speler.geschiedenis).toFixed(1) : '—';
    const checkout = getCheckoutHint(speler.score);
    let cls = "ds-tile";
    if (isActief) cls += " ds-tile-actief";

    const legAvgNum = speler.geschiedenis.length ? gemiddelde(speler.geschiedenis) : null;
    const isTrain = legAvgNum !== null && legAvgNum < 26;
    const histTekst = speler.geschiedenis.slice(-8).join(' · ') || '—';

    const tile = document.createElement("div");
    tile.className = cls;
    tile.innerHTML = `
      <div class="ds-tile-header">
        <div class="ds-tile-name">${isActief ? '🎯 ' : ''}${speler.naam}</div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
          <div class="ds-tile-score">${speler.score}</div>
          <button class="ds-tile-remove-btn" onclick="verwijderSpeler(${index})" title="Speler verwijderen">✖</button>
        </div>
      </div>
      <div class="ds-tile-legs">${speler.legsGewonnen}/${legsTeWinnen} legs</div>
      <div class="ds-tile-stats">
        <div class="ds-tile-stat">Gem leg: <strong>${avgLeg}</strong></div>
        <div class="ds-tile-stat">Gem totaal: <strong>${avg}</strong></div>
        <div class="ds-tile-stat">Pijlen: <strong>${speler.pijlenGegooid || 0}</strong></div>
        <div class="ds-tile-stat">Beste leg: <strong>${speler.besteLeg || '—'}</strong></div>
        <div class="ds-tile-stat">H. finish: <strong>${speler.hoogsteFinish || '—'}</strong></div>
        ${checkout !== '-' ? `<div class="ds-tile-checkout ds-tile-stat">🎯 ${checkout}</div>` : '<div class="ds-tile-stat"></div>'}
      </div>
      <div class="ds-tile-history">📋 ${histTekst}</div>
      ${isTrain ? '<div class="ds-tile-train">🚂</div>' : ''}
    `;
    tilesGrid.appendChild(tile);
  });
  othersWrap.appendChild(tilesGrid);
  container.appendChild(othersWrap);

  // ── Mobile fallback: old .speler divs (hidden on desktop via CSS) ──
  spelers.forEach((speler, index) => {
    const isBeurt = index === beurt;
    const avgH = speler.geschiedenis.length ? gemiddelde(speler.geschiedenis).toFixed(1) : 0;
    const avgT = speler.totaalGeschiedenis.length ? gemiddelde(speler.totaalGeschiedenis).toFixed(1) : 0;
    const div = document.createElement("div");
    div.className = "speler" + (isBeurt ? " aan-de-beurt" : "");
    div.innerHTML = `
      <span class="remove-speler" onclick="verwijderSpeler(${index})">✖</span>
      <h2>${speler.naam}</h2>
      <div class="grote-score">${speler.score}</div>
      <p>Legs: ${speler.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gem: ${avgH} / Totaal: ${avgT}</p>
      <p>Pijlen: ${speler.pijlenGegooid || 0} · Beste: ${speler.besteLeg || '-'}</p>
      <p>Checkout: <strong>${getCheckoutHint(speler.score)}</strong></p>
      <p class="geschiedenis">${speler.geschiedenis.join(", ")}</p>
      ${isBeurt ? `
        <label for="invoer">Score:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button class="primary-btn" onclick="verwerkBeurt(${index})">Bevestig</button>
        <div class="quick-score-group">
          <button class="quick-score-btn" onclick="snelScoreInvoeren(11)">11</button>
          <button class="quick-score-btn" onclick="snelScoreInvoeren(26)">26</button>
          <button class="quick-score-btn" onclick="snelScoreInvoeren(67)">67</button>
        </div>
      ` : ''}
    `;
    container.appendChild(div);
  });

  const input = document.getElementById('invoer');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
    });
    setTimeout(() => {
      input.focus();
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          if (input.value.trim() === "") input.value = "0";
          verwerkBeurt(beurt);
        }
      });
    }, 0);
  }

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
}

/**
 * Bereken de huidige beurt in team-modus op basis van globaleBeurtPositie.
 *
 * Platte volgorde (voorbeeld 3 teams, 2 spelers per team):
 *   positie 0 → T0S0, 1 → T1S0, 2 → T2S0,
 *   positie 3 → T0S1, 4 → T1S1, 5 → T2S1,
 *   positie 6 → T0S0 (herhaalt), ...
 *
 * De cycluslengte = aantalTeams × maxSpelersPerTeam.
 * Bij teams met minder spelers wordt de spelerindex gewrapped (mod team.spelers.length).
 *
 * Retourneert { teamIndex, spelerIndex, spelerNaam }
 */
function teamBeurtInfo(positie) {
  const aantalTeams = teams.length;
  // Gebruik het maximum aantal spelers over alle teams als cycluslengte
  const maxSpelers = teams.reduce((m, t) => Math.max(m, t.spelers.length), 1);
  const cyclusLen = aantalTeams * maxSpelers;

  const pos = ((positie % cyclusLen) + cyclusLen) % cyclusLen;
  const teamIndex   = pos % aantalTeams;
  const spelerSlot  = Math.floor(pos / aantalTeams);
  const team        = teams[teamIndex];
  const spelerIndex = spelerSlot % Math.max(1, team.spelers.length);
  const spelerNaam  = team.spelers[spelerIndex] || "Speler";
  return { teamIndex, spelerIndex, spelerNaam };
}

/**
 * Render het spel voor team mode.
 */
function renderTeamSpel() {
  if (typeof _setGameMenuItems === "function") _setGameMenuItems(true);
  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(false);

  const container = document.getElementById("spel");
  container.innerHTML = '';

  const { teamIndex: actiefTeamIdx, spelerNaam } = teamBeurtInfo(globaleBeurtPositie);
  beurt = actiefTeamIdx;
  const actiefTeam = teams[beurt];
  const nextIdx = (beurt + 1) % teams.length;

  // ── Desktop: big active tile ──
  const desktopWrap = document.createElement("div");
  desktopWrap.className = "ds-actief-wrap";

  const avgHuidig = actiefTeam.geschiedenis.length ? gemiddelde(actiefTeam.geschiedenis).toFixed(1) : '—';
  const avgTotaal = actiefTeam.totaalGeschiedenis.length ? gemiddelde(actiefTeam.totaalGeschiedenis).toFixed(1) : '—';
  const checkout = getCheckoutHint(actiefTeam.score);
  const teamLegAvgNum = actiefTeam.geschiedenis.length ? gemiddelde(actiefTeam.geschiedenis) : null;
  const teamTrainEmoji = (teamLegAvgNum !== null && teamLegAvgNum < 26) ? ' 🚂' : '';

  desktopWrap.innerHTML = `
    <div class="ds-actief">
      <div class="ds-actief-left">
        <div class="ds-actief-name">${spelerNaam}${teamTrainEmoji}</div>
        <div class="ds-actief-legs">${actiefTeam.naam} · Legs: ${actiefTeam.legsGewonnen} / ${legsTeWinnen}</div>
        <div class="ds-actief-stat-grid">
          <div class="ds-stat">
            <div class="ds-stat-label">Gem. leg</div>
            <div class="ds-stat-value">${avgHuidig}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Gem. totaal</div>
            <div class="ds-stat-value">${avgTotaal}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Pijlen</div>
            <div class="ds-stat-value">${actiefTeam.pijlenGegooid || 0}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Beste leg</div>
            <div class="ds-stat-value">${actiefTeam.besteLeg || '—'}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Hoogste finish</div>
            <div class="ds-stat-value">${actiefTeam.hoogsteFinish || '—'}</div>
          </div>
        </div>
      </div>

      <div class="ds-actief-score-wrap">
        <div class="ds-actief-big-score">${actiefTeam.score}</div>
        ${checkout !== '-' ? `<div class="ds-checkout-hint">🎯 ${checkout}</div>` : ''}
        <div class="ds-label-score">resterend</div>
      </div>

      <div class="ds-actief-right">
        <div class="ds-invoer-label">Score invoeren</div>
        <input id="invoer" class="ds-invoer-input" type="number" min="0" max="180" placeholder="0" autocomplete="off">
        <button class="ds-bevestig-btn" onclick="verwerkTeamBeurt(${beurt})">✓ Bevestig</button>
        <div class="ds-quick-group">
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(11)">11</button>
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(26)">26</button>
          <button class="ds-quick-btn" onclick="snelScoreInvoeren(67)">67</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(desktopWrap);

  // ── Compact tiles for ALL teams ──
  const othersWrap = document.createElement("div");
  othersWrap.className = "ds-tiles-wrap";

  const label = document.createElement("div");
  label.className = "ds-tiles-label";
  label.textContent = "Alle teams";
  othersWrap.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "ds-tiles-grid";
  teams.forEach((team, tIndex) => {
    const isActief = (tIndex === beurt);
    const avg = team.totaalGeschiedenis.length ? gemiddelde(team.totaalGeschiedenis).toFixed(1) : '—';
    const avgLeg = team.geschiedenis.length ? gemiddelde(team.geschiedenis).toFixed(1) : '—';
    const co = getCheckoutHint(team.score);
    let cls = "ds-tile";
    if (isActief) cls += " ds-tile-actief";
    const teamTileAvg = team.geschiedenis.length ? gemiddelde(team.geschiedenis) : null;
    const isTileTeamTrain = teamTileAvg !== null && teamTileAvg < 26;
    const teamHistTekst = team.geschiedenis.slice(-8).join(' · ') || '—';
    const tile = document.createElement("div");
    tile.className = cls;
    tile.innerHTML = `
      <div class="ds-tile-header">
        <div class="ds-tile-name">${isActief ? '🎯 ' : ''}${team.naam}</div>
        <div class="ds-tile-score">${team.score}</div>
      </div>
      <div class="ds-tile-legs">${team.legsGewonnen}/${legsTeWinnen} legs</div>
      <div class="ds-tile-stats">
        <div class="ds-tile-stat">Gem leg: <strong>${avgLeg}</strong></div>
        <div class="ds-tile-stat">Gem totaal: <strong>${avg}</strong></div>
        <div class="ds-tile-stat">Pijlen: <strong>${team.pijlenGegooid || 0}</strong></div>
        <div class="ds-tile-stat">Beste leg: <strong>${team.besteLeg || '—'}</strong></div>
        <div class="ds-tile-stat">H. finish: <strong>${team.hoogsteFinish || '—'}</strong></div>
        ${co !== '-' ? `<div class="ds-tile-checkout ds-tile-stat">🎯 ${co}</div>` : '<div class="ds-tile-stat"></div>'}
      </div>
      <div class="ds-tile-history">📋 ${teamHistTekst}</div>
      ${isTileTeamTrain ? '<div class="ds-tile-train">🚂</div>' : ''}
    `;
    grid.appendChild(tile);
  });
  othersWrap.appendChild(grid);
  container.appendChild(othersWrap);

  // ── Mobile fallback .speler divs ──
  teams.forEach((team, tIndex) => {
    const { spelerNaam: sNaam } = teamBeurtInfo(globaleBeurtPositie - (beurt - tIndex + teams.length) % teams.length);
    // Bereken de speler voor dit team op basis van hun relatieve positie
    const { spelerNaam: tileSpelerNaam } = teamBeurtInfo(globaleBeurtPositie + ((tIndex - beurt + teams.length) % teams.length));
    const isBeurt = tIndex === beurt;
    const div = document.createElement("div");
    div.className = "speler" + (isBeurt ? " aan-de-beurt" : "");
    div.innerHTML = `
      <h2>${tileSpelerNaam} (${team.naam})</h2>
      <div class="grote-score">${team.score}</div>
      <p>Legs: ${team.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gem: ${team.geschiedenis.length ? gemiddelde(team.geschiedenis).toFixed(1) : 0}</p>
      <p>Pijlen: ${team.pijlenGegooid || 0} · Beste: ${team.besteLeg || '-'}</p>
      <p>Checkout: <strong>${getCheckoutHint(team.score)}</strong></p>
      ${isBeurt ? `
        <label for="invoer">Score:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button class="primary-btn" onclick="verwerkTeamBeurt(${tIndex})">Bevestig</button>
        <div class="quick-score-group">
          <button class="quick-score-btn" onclick="snelScoreInvoeren(11)">11</button>
          <button class="quick-score-btn" onclick="snelScoreInvoeren(26)">26</button>
          <button class="quick-score-btn" onclick="snelScoreInvoeren(67)">67</button>
        </div>
      ` : ''}
    `;
    container.appendChild(div);
  });

  const input = document.getElementById('invoer');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
    });
    setTimeout(() => {
      input.focus();
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          if (input.value.trim() === "") input.value = "0";
          verwerkTeamBeurt(beurt);
        }
      });
    }, 0);
  }

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
}

/**
 * Toon het eindscherm met ranglijst en mogelijkheid om opnieuw te spelen.
 * 'winnaar' is het winnende speler- of team-object. 'deelnemers' is array van alle deelnemers.
 */
/**
 * Toon het eindscherm met ranglijst en mogelijkheid om opnieuw te spelen.
 * 'winnaar' is het winnende speler- of team-object. 'deelnemers' is array van alle deelnemers.
 */
function toonEindscherm(winnaar, deelnemers) {
  // Hook voor mobile.js: verberg game-menu-items op eindscherm
  if (typeof _setGameMenuItems === "function") _setGameMenuItems(false);
  toggleSpelControls(false);
  document.getElementById("spel").style.display = "none";

  const container = document.getElementById("eindscherm");
  container.style.display = "block";

  // Sorteer deelnemers eerst op aantal gewonnen legs (desc), daarna op resterende score (asc)
  const gesorteerd = [...deelnemers].sort((a, b) => {
    const legsA = a.legsGewonnen || 0;
    const legsB = b.legsGewonnen || 0;
    if (legsB !== legsA) return legsB - legsA; // meer legs -> hoger
    const scoreA = (typeof a.score === "number") ? a.score : Infinity;
    const scoreB = (typeof b.score === "number") ? b.score : Infinity;
    return scoreA - scoreB; // lagere score -> hoger
  });

  let html = `
    <h1>🏆 Winnaar: <span style="font-size: 3rem; color: gold;">${winnaar.naam}</span></h1>
    <h2>Ranglijst</h2>
    <div class="flex-container">
  `;

  gesorteerd.forEach((speler, idx) => {
    // bereken gemiddelde over alle gegooide scores (totaalGeschiedenis)
    const totaal = Array.isArray(speler.totaalGeschiedenis) ? speler.totaalGeschiedenis : [];
    const avgTotal = totaal.length ? gemiddelde(totaal).toFixed(1) : 0;

    const isWinnaar = (speler.naam === winnaar.naam);

    // podium-classes voor #1–#3, geen klasse voor de rest
    let podiumClass = "";
    if (idx === 0) podiumClass = "podium-goud";
    else if (idx === 1) podiumClass = "podium-zilver";
    else if (idx === 2) podiumClass = "podium-brons";
    else podiumClass = "podium-none";

    html += `
      <div class="speler ${isWinnaar ? "winnaar-highlight" : ""} ${podiumClass}">
        <h2>#${idx + 1} ${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : ""}</h2>
        <h3>${speler.naam}</h3>
        <p>Legs gewonnen: ${speler.legsGewonnen || 0}/${legsTeWinnen}</p>
        <p>Resterende score: ${speler.score}</p>
        <p>Gemiddelde score: ${avgTotal}</p>
        <p>Pijlen gegooid: ${speler.pijlenGegooid || 0}</p>
        <p>Beste leg: ${speler.besteLeg || '-'}</p>
        <p>Hoogste finish: ${speler.hoogsteFinish || '-'}</p>
      </div>
    `;
  });

  html += `</div><div class="eind-btn-row"><button class="eind-btn eind-btn-blauw" onclick="opnieuwSpelen()">🔄 Opnieuw spelen</button>`;

  // Voeg hier knop toe om nieuwe speler toe te voegen (alleen single mode)
  if (!teamMode) {
    html += `<button class="eind-btn eind-btn-groen" onclick="nieuweSpelerToevoegen()">➕ Speler toevoegen</button>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * Opnieuw spelen: reset scores maar behoud spelers/teams en verschuif startvolgorde.
 */
function opnieuwSpelen() {
  document.getElementById("eindscherm").style.display = "none";
  document.getElementById("spel").style.display = "flex";

  if (teamMode) {
    teams.forEach(t => {
      t.score = startScore;
      t.geschiedenis = [];
      t.pijlenGegooid = 0;
      t.besteLeg = null;
      t.hoogsteFinish = null;
      t.legsGewonnen = 0;
      t.trainActief = false;
    });
    // Positie loopt door: volgende leg start één positie verder
    legStartPositie++;
    globaleBeurtPositie = legStartPositie;
    teamBeurtIndex = 0;
    beurt = teamBeurtInfo(globaleBeurtPositie).teamIndex;
    renderTeamSpel();
  } else {
    spelers.forEach(s => {
      s.score = startScore;
      s.geschiedenis = [];
      s.pijlenGegooid = 0;
      s.besteLeg = null;
      s.legsGewonnen = 0;
      s.trainActief = false;
    });
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % spelers.length;
    renderSpel();
  }

  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(!teamMode);
}

/* ===========================
   6) Helpers (gemiddelde, checkout hints, statistieken)
   =========================== */

/**
 * Bereken gemiddelde van een array getallen.
 */
function gemiddelde(beurten) {
  return beurten && beurten.length ? beurten.reduce((a, b) => a + b, 0) / beurten.length : 0;
}

/**
 * Checkout hints tabel (ongewijzigd ten opzichte van origineel).
 * Retourneert string of '-' wanneer geen hint gevonden.
 */
function getCheckoutHint(score) {
  const hints = {
    170: "T20, T20, Bull", 167: "T20, T19, Bull", 164: "T20, T18, Bull", 161: "T20, T17, Bull",
    160: "T20, T20, D20", 158: "T20, T20, D19", 157: "T20, T19, D20", 156: "T20, T20, D18",
    155: "T20, T19, D19", 154: "T20. T18, D20", 153: "T20, T19, D18", 152: "T20, T20, D16", 151: "T20, T17, D20",
    150: "T20, T18, D18", 149: "T20, T19, D16", 148: "T20, T16, D20", 147: "T20, T17, D18",
    146: "T20, T18, D16", 145: "T20, T15, D20", 144: "T20, T20, D12", 143: "T20, T17, D16",
    142: "T20, T14, D20", 141: "T20, T19, D12", 140: "T20, T20, D10", 139: "T20, T13, D20",
    138: "T20, T18, D12", 137: "T20, T19, D10", 136: "T20, T20, D8", 135: "Bull, T15, D20",
    134: "T20, T14, D16", 133: "T20, T19, D8", 132: "Bull, Bull, D16", 131: "T20, T13, D16",
    130: "T20, T20, D5", 129: "T19, T16, D12", 128: "T18, T14, D16", 127: "T20, T17, D8",
    126: "T19, T19, D6", 125: "25, T20, D20", 124: "T20, T16, D8", 123: "T19, T16, D9",
    122: "T18, T20, D4", 121: "T20, T11, D14", 120: "T20, 20, D20", 119: "T19, T10, D16",
    118: "T20, 18, D20", 117: "T20, 17, D20", 116: "T20, 16, D20", 115: "T20, 15, D20",
    114: "T20, 14, D20", 113: "T20, 13, D20", 112: "T20, 12, D20", 111: "T20, 11, D20",
    110: "T20, 10, D20", 109: "T20, 9, D20", 108: "T20, 8, D20", 107: "T19, 10, D20",
    106: "T20, 6, D20", 105: "T20, 5, D20", 104: "T18, 18, D16", 103: "T20, 3, D20",
    102: "T20, 10, D16", 101: "T17, 10, D20", 100: "T20, D20", 99: "T19, 10, D16", 98: "T20, D19", 97: "T19, D20", 96: "T20, D18", 95: "T19, D19", 
    94: "T18, D20", 93: "T19, D18", 92: "T20, D16", 91: "T17, D20", 90: "T18, D18", 89: "T19, D16",
    88: "T16, D20", 87: "T17, D18", 86: "T18, D16", 85: "T15, D20", 84: "T20, D12", 83: "T17, D16",
    82: "Bull, D16", 81: "T15, D18", 80: "T20, D10", 79: "T13, D20", 78: "T18, D12", 77: "T19, D10",
    76: "T20, D8", 75: "T17, D12", 74: "T14, D16", 73: "T19, D8", 72: "T16, D12", 71: "T13, D16",
    70: "T18, D8", 69: "T19, D6", 68: "T20, D4", 67: "T17, D8", 66: "T10, D18", 65: "25, D20",
    64: "T16, D8", 63: "T13, D12", 62: "T10, D16", 61: "T15, D8", 60: "20, D20", 59: "19, D20",
    58: "18, D20", 57: "17, D20", 56: "16, D20", 55: "15, D20", 54: "14, D20", 53: "13, D20",
    52: "12, D20", 51: "11, D20", 50: "10, D20", 49: "9, D20", 48: "8, D20", 47: "7, D20",
    46: "6, D20", 45: "13, D16", 44: "12, D16", 43: "11, D16", 42: "10, D16", 41: "9, D16",
    40: "D20", 39: "7, D16", 38: "D19", 37: "5, D16", 36: "D18", 35: "3, D16", 34: "D17",
    33: "1, D16", 32: "D16", 31: "15, D8", 30: "D15", 29: "13, D8", 28: "D14", 27: "11, D8",
    26: "D13", 25: "9, D8", 24: "D12", 23: "7, D8", 22: "D11", 21: "5, D8", 20: "D10",
    19: "3, D8", 18: "D9", 17: "1, D8", 16: "D8", 15: "7, D4", 14: "D7", 13: "5, D4",
    12: "D6", 11: "3, D4", 10: "D5", 9: "1, D4", 8: "D4", 7: "3, D2", 6: "D3",
    5: "1, D2", 4: "D2", 3: "1, D1", 2: "D1"
  };
  return hints[score] || "-";
}

/**
 * Update statistieken - in jouw setup is de statistieken-div weggehaald,
 * dus deze functie werkt alleen als het lijst element aanwezig is.
 * We vullen maximaal de laatste 10 items.
 */
function updateStatistieken() {
  const lijst = document.getElementById('statistiekenLijst');
  if (!lijst) return;
  lijst.innerHTML = '';
  sessieGeschiedenis.slice(-10).forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    lijst.appendChild(li);
  });
}

/* ===========================
   Initialisatie: verberg standaard knoppen totdat spel start
   =========================== */
document.addEventListener("DOMContentLoaded", () => {
  toggleSpelControls(false);
  toggleAddPlayerSmallBtn(false);
});

function toggleInput(index) {
  const select = document.getElementById(`spelerSelect${index}`);
  const input = document.getElementById(`spelerInput${index}`);
  if (select.value === "Anders") {
    input.style.display = "inline-block";
  } else {
    input.style.display = "none";
    input.value = ""; // leegmaken als weggeklikt
  }
}

function verwijderSpeler(index) {
  if (!confirm(`Weet je zeker dat je ${spelers[index].naam} wilt verwijderen?`)) return;

  const wasHuidigeSpeler = (index === beurt);

  spelers.splice(index, 1);

  // Veiligheid: minimaal 1 speler
  if (spelers.length === 0) {
    alert("Geen spelers meer over. Spel wordt gestopt.");
    stopSpel();
    return;
  }

  if (wasHuidigeSpeler) {
    // Verwijderde speler was aan de beurt → volgende speler (zelfde index, of wrap naar 0)
    beurt = beurt % spelers.length;
  } else if (index < beurt) {
    // Verwijderde speler stond vóór de huidige → index schuift 1 naar beneden
    beurt = beurt - 1;
  }
  // Als index > beurt: geen aanpassing nodig, huidige speler blijft op zelfde index

  // Corrigeer ook startVolgordeIndex zodat de leg-startvolgorde klopt
  if (index < startVolgordeIndex) {
    startVolgordeIndex = Math.max(0, startVolgordeIndex - 1);
  } else if (startVolgordeIndex >= spelers.length) {
    startVolgordeIndex = 0;
  }

  renderSpel();
}
