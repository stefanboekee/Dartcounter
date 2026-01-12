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

let huidigeAudio = null; // globale referentie naar momenteel spelend audio-object
let suppressNextScoreAnnouncement = false;

const ongeldigeScores = [179, 178, 176, 175, 173, 172, 169, 166, 163]; // scores die niet mogelijk zijn


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
    <button onclick="selecteerStartScore('${mode}', 301)">301</button>
    <button onclick="selecteerStartScore('${mode}', 501)">501</button>
  `;
  document.body.insertBefore(scoreKeuze, document.getElementById("setup"));
  teamMode = (mode === 'teams');
}

/**
 * Startscore gekozen — toon juiste setup (namen of teamsetup).
 */
function selecteerStartScore(mode, score) {
  startScore = score;
  document.getElementById("scoreKeuze")?.remove();

  if (mode === 'teams') {
    document.getElementById("setup").style.display = 'none';
    document.getElementById("teamSetup").innerHTML = `
      <label for="aantalTeams">Aantal teams:</label>
      <input type="number" id="aantalTeams" min="2" max="4" value="3" class="compact-input">
      <label for="aantalLegs">Aantal legs te winnen:</label>
      <input type="number" id="aantalLegs" min="1" max="10" value="2" class="compact-input">
      </br>    
      <button onclick="setupTeams()">Volgende</button>
    `;
    document.getElementById("teamSetup").style.display = 'block';
  } else {
    document.getElementById("setup").style.display = 'block';
  }
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
  container.innerHTML += `<button onclick="startTeamSpel(${aantal})">Start teamspel</button>`;
}

/**
 * Start een teamspel met de ingevulde teams en spelers.
 */
function startTeamSpel(aantal) {
  teams = [];
  beurt = 0;
  teamBeurtIndex = 0;
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
      hoogsteFinish: null
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

  const container = document.getElementById("namenSetup");
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
    <button id="bevestigNamen" onclick="startSpel(${aantal})">Start spel</button>
  `;
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
      besteLeg: null
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

  // push naar undo stack
  herstelGeschiedenis.push({
  index,
  score,
  pijlen: 3
});


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
    const audio = playSound(`${score}.mp3`);

    if (audio) {
      audio.onended = () => {
        const volgendeSpeler = spelers[beurt];
        if (volgendeSpeler && volgendeSpeler.score <= 170) {
          const intro = playSound('your_score_is.mp3');
          if (intro) {
            intro.onended = () => playSound(`${volgendeSpeler.score}.mp3`);
          } else {
            playSound(`${volgendeSpeler.score}.mp3`);
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
  const spelerIndex = teamBeurtIndex % team.spelers.length;
  const nieuweScore = team.score - score;

  let isLegOfMatchWin = false;

  // undo stack
  herstelGeschiedenis.push({
  team: tIndex,
  score,
  spelerIndex,
  pijlen: 3
});


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
    });

    // volgende startteam + spelerrotatie
    teamBeurtIndex++;
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % teams.length;
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

    beurt = (beurt + 1) % teams.length;
    if (beurt === 0) {
      teamBeurtIndex++;
    }
  }

  // input reset
  if (input) input.value = '';

  /* =========================
     🔊 SCORE AUDIO (alleen als GEEN leg/match win)
     ========================= */
  if (!isLegOfMatchWin) {
    const audio = playSound(`${score}.mp3`);

    if (audio) {
      audio.onended = () => {
        const volgendeTeam = teams[beurt];
        if (volgendeTeam && volgendeTeam.score <= 170) {
          const intro = playSound('your_score_is.mp3');
          if (intro) {
            intro.onended = () => playSound(`${volgendeTeam.score}.mp3`);
          } else {
            playSound(`${volgendeTeam.score}.mp3`);
          }
        }
      };
    }
  }

  renderTeamSpel();
}

/**
 * Voeg een nieuwe speler toe (alleen in single mode).
 * De gebruiker krijgt een prompt en het spel wordt herstart met nieuwe speler toegevoegd.
 */
function nieuweSpelerToevoegen() {
  if (teamMode) return;

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
    const t = teams[laatste.team];
    t.score = Math.min(t.score + laatste.score, startScore);

// geschiedenis & gemiddelde herstellen
if (t.geschiedenis.length) t.geschiedenis.pop();
if (t.totaalGeschiedenis.length) t.totaalGeschiedenis.pop();

// pijlen herstellen
t.pijlenGegooid = Math.max(0, (t.pijlenGegooid || 0) - (laatste.pijlen || 3));

// beurt herstellen
beurt = laatste.team;
teamBeurtIndex = Math.max(0, laatste.spelerIndex);

sessieGeschiedenis.push(
  `Herstel: ${t.spelers[teamBeurtIndex % t.spelers.length]} (${t.naam}) is weer aan de beurt.`
);
suppressNextScoreAnnouncement = true;
renderTeamSpel();

    sessieGeschiedenis.push(`Herstel: ${t.spelers[teamBeurtIndex % t.spelers.length]} (${t.naam}) is weer aan de beurt.`);
	suppressNextScoreAnnouncement = true;
    renderTeamSpel();
  } else if (!teamMode && laatste?.index !== undefined) {
    const s = spelers[laatste.index];

// score terug
s.score = Math.min(s.score + laatste.score, startScore);

// geschiedenis & gemiddelde herstellen
if (s.geschiedenis.length) s.geschiedenis.pop();
if (s.totaalGeschiedenis.length) s.totaalGeschiedenis.pop();

// pijlen terugzetten
s.pijlenGegooid = Math.max(0, (s.pijlenGegooid || 0) - (laatste.pijlen || 3));

// beurt terug
beurt = laatste.index;

sessieGeschiedenis.push(`Herstel: ${s.naam} is weer aan de beurt.`);
suppressNextScoreAnnouncement = true;
renderSpel();

    sessieGeschiedenis.push(`Herstel: ${s.naam} is weer aan de beurt.`);
	suppressNextScoreAnnouncement = true;
    renderSpel();
  }
}

/**
 * Stop het spel en refresh de pagina (met confirm).
 */
function stopSpel() {
  if (confirm("Weet je zeker dat je het spel wilt stoppen?")) {
    toggleSpelControls(false);
    eersteLeg = true;
    location.reload();
  }
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
function renderSpel() {
  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(!teamMode);

  const container = document.getElementById("spel");
  container.innerHTML = '';

  spelers.forEach((speler, index) => {
    const isBeurt = index === beurt;
    const avgHuidig = speler.geschiedenis.length ? gemiddelde(speler.geschiedenis).toFixed(1) : 0;
    const avgTotaal = speler.totaalGeschiedenis.length ? gemiddelde(speler.totaalGeschiedenis).toFixed(1) : 0;

    const div = document.createElement("div");
    div.className = "speler" + (isBeurt ? " aan-de-beurt" : "");
    div.innerHTML = `
	  <span class="remove-speler" onclick="verwijderSpeler(${index})">✖</span>
      <h2>${speler.naam}</h2>
      <div class="grote-score">${speler.score}</div>
      <p>Legs gewonnen: ${speler.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gemiddelde: ${avgHuidig}</p>
      <p>Gemiddelde totaal: ${avgTotaal}</p>
      <p>Pijlen gegooid: ${speler.pijlenGegooid || 0}</p>
      <p>Beste leg: ${speler.besteLeg || '-'}</p>
      <p>Hoogste finish: ${speler.hoogsteFinish || '-'}</p>
      <p>Checkout hint: <strong>${getCheckoutHint(speler.score)}</strong></p>
      <p class="geschiedenis">Geschiedenis: ${speler.geschiedenis.join(", ")}</p>
      ${isBeurt ? `
        <label for="invoer">Score invoeren:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button onclick="verwerkBeurt(${index})">Bevestig beurt</button>
      ` : ''}
    `;
    container.appendChild(div);
  });

  // Zorg dat input werkt en Enter toetst
  const input = document.getElementById('invoer');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (["e", "E", "+", "-"].includes(e.key)) {
        e.preventDefault();
      }
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

  // start overlay en audio bij eerste leg
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
 * Render het spel voor team mode.
 */
function renderTeamSpel() {
  toggleSpelControls(true);
  toggleAddPlayerSmallBtn(false); // geen nieuwe speler knop in teammode

  const container = document.getElementById("spel");
  container.innerHTML = '';

  teams.forEach((team, tIndex) => {
    const spelerNaam = team.spelers[teamBeurtIndex % Math.max(1, team.spelers.length)] || "Speler";
    const isBeurt = tIndex === beurt;

    const div = document.createElement("div");
    div.className = "speler" + (isBeurt ? " aan-de-beurt" : "");
    div.innerHTML = `
      <h2>${spelerNaam} (${team.naam})</h2>
      <div class="grote-score">${team.score}</div>
      <p>Legs gewonnen: ${team.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gemiddelde: ${team.geschiedenis.length ? gemiddelde(team.geschiedenis).toFixed(1) : 0}</p>
      <p>Gemiddelde totaal: ${team.totaalGeschiedenis.length ? gemiddelde(team.totaalGeschiedenis).toFixed(1) : 0}</p>
      <p>Pijlen gegooid: ${team.pijlenGegooid || 0}</p>
      <p>Beste leg: ${team.besteLeg || '-'}</p>
      <p>Hoogste finish: ${team.hoogsteFinish || '-'}</p>
      <p>Checkout hint: <strong>${getCheckoutHint(team.score)}</strong></p>
      ${isBeurt ? `
        <label for="invoer">Score invoeren:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button onclick="verwerkTeamBeurt(${tIndex})">Bevestig beurt</button>
      ` : ''}
    `;
    container.appendChild(div);
  });

  // input focus / enter handling
  const input = document.getElementById('invoer');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (["e", "E", "+", "-"].includes(e.key)) {
        e.preventDefault();
      }
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

    // podium-classes voor #1–#3
    let podiumClass = "";
    if (idx === 0) podiumClass = "podium-goud";
    else if (idx === 1) podiumClass = "podium-zilver";
    else if (idx === 2) podiumClass = "podium-brons";

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

  html += `</div><button onclick="opnieuwSpelen()">Opnieuw spelen</button>`;

  // Voeg hier knop toe om nieuwe speler toe te voegen (alleen single mode)
  if (!teamMode) {
    html += `<button style="background-color:#28a745; margin-left:10px;" onclick="nieuweSpelerToevoegen()">➕ Nieuwe speler toevoegen</button>`;
  }

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
      t.pijlenGegooid = 0;
      t.besteLeg = null;
      t.legsGewonnen = 0;
    });
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % teams.length;
    renderTeamSpel();
  } else {
    spelers.forEach(s => {
      s.score = startScore;
      s.geschiedenis = [];
      s.pijlenGegooid = 0;
      s.besteLeg = null;
      s.legsGewonnen = 0;
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

  spelers.splice(index, 1);

  // Als huidige beurt speler was → beurt corrigeren
  if (beurt >= spelers.length) {
    beurt = 0;
  }

  // Veiligheid: minimaal 1 speler
  if (spelers.length === 0) {
    alert("Geen spelers meer over. Spel wordt gestopt.");
    stopSpel();
    return;
  }

  renderSpel();
}
