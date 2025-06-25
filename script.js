let spelers = [];
let teams = [];
let teamMode = false;
let beurt = 0;
let legsTeWinnen = 3;
let sessieGeschiedenis = [];
let startVolgordeIndex = 0;
let vorigeScore = null;
let teamBeurtIndex = 0;
let startScore = 501;
let herstelGeschiedenis = []; // stapel voor meerdere herstelslagen
const ongeldigeScores = [179, 178, 176, 175, 173, 172, 169, 166, 163];

function toggleSpelControls(tonen) {
  const display = tonen ? "block" : "none";
  document.getElementById("statistieken").style.display = display;
  document.getElementById("stopKnop").style.display = tonen ? "inline-block" : "none";
  document.getElementById("herstelKnop").style.display = tonen ? "inline-block" : "none";
}

function speelStartGeluid() {
  const audio = new Audio('Gameon.mp3');
  audio.play().catch(() => {});
}

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

function startTeamSpel(aantal) {
  teams = [];
  beurt = 0;
  teamBeurtIndex = 0;
  sessieGeschiedenis = [];

  for (let i = 0; i < aantal; i++) {
    const teamNaam = document.getElementById(`teamNaam${i}`).value || `Team ${i + 1}`;
    const spelersInput = document.getElementById(`teamSpelers${i}`).value;
    const teamSpelers = spelersInput.split(',').map(n => n.trim()).filter(Boolean);
    teams.push({
      naam: teamNaam,
      score: startScore,
      spelers: teamSpelers,
      legsGewonnen: 0,
    });
  }
  document.getElementById("teamSetup").style.display = 'none';
  renderTeamSpel();
}

function renderTeamSpel() {
  toggleSpelControls(true);

  const container = document.getElementById("spel");
  container.innerHTML = '';

  teams.forEach((team, tIndex) => {
    const spelerNaam = team.spelers[teamBeurtIndex % team.spelers.length];
    const isBeurt = tIndex === beurt;

    const div = document.createElement("div");
    div.className = "speler" + (isBeurt ? " aan-de-beurt" : "");
    div.innerHTML = `
      <h2>${spelerNaam} (${team.naam})</h2>
      <div class="grote-score">${team.score}</div>
      <p>Legs gewonnen: ${team.legsGewonnen}/${legsTeWinnen}</p>
      <p>Pijlen gegooid: ${team.pijlenGegooid || 0}</p>
      <p>Beste leg: ${team.besteLeg || '-'}</p>
      <p>Checkout hint: <strong>${getCheckoutHint(team.score)}</strong></p>
      ${isBeurt ? `
        <label for="invoer">Score invoeren:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button onclick="verwerkTeamBeurt(${tIndex})">Bevestig beurt</button>
      ` : ''}
    `;
    container.appendChild(div);
  });

  setTimeout(() => {
    const input = document.getElementById("invoer");
    if (input) {
      input.focus();
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          if (input.value.trim() === "") input.value = "0";
          verwerkTeamBeurt(beurt);
        }
        if (e.key === "Backspace") input.value = '';
      });
    }

if (spelers[beurt].score <= 170) {
  const intro = new Audio('your_score_is.mp3');
  const scoreAudio = new Audio(`${teams[beurt].score}.mp3`);
  intro.onended = () => scoreAudio.play().catch(() => {});
  
  // Wacht voordat je het intro-geluid afspeelt
  setTimeout(() => {
    intro.play().catch(() => {});
  }, 2500);
}
  }, 0);

  updateStatistieken();
}

function verwerkTeamBeurt(tIndex) {
  const input = document.getElementById("invoer");
  const score = parseInt(input.value);
  if (isNaN(score) || score < 0 || score > 180 || ongeldigeScores.includes(score)) {
    alert("Voer een geldige score in tussen 0 en 180.");
    input.value = '';
    input.focus();
    return;
  }
  let audio = new Audio(`${score}.wav`);
  audio.play().catch(() => {});

  const team = teams[tIndex];
  const spelerIndex = teamBeurtIndex % team.spelers.length;

  herstelGeschiedenis.push({ team: tIndex, score, spelerIndex });

  const nieuweScore = team.score - score;

  if (!team.pijlenGegooid) team.pijlenGegooid = 0;
  team.pijlenGegooid += 3;

  if (nieuweScore === 0) {
    team.legsGewonnen++;
    sessieGeschiedenis.push(`${team.naam} wint een leg!`);

    if (!team.besteLeg || team.pijlenGegooid < team.besteLeg) {
      team.besteLeg = team.pijlenGegooid;
    }
    if (team.legsGewonnen >= legsTeWinnen) {
      alert(`${team.naam} wint de sessie!`);
      stopSpel();
      return;
    }
    teams.forEach(t => {t.score = startScore; t.pijlengegooid = 0});
    teamBeurtIndex++;
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % teams.length;
    speelStartGeluid();
  } else if (nieuweScore < 0 || nieuweScore === 1) {
    alert("Bust!");
  } else {
    team.score = nieuweScore;
    beurt = (beurt + 1) % teams.length;
    if (beurt === 0) teamBeurtIndex++;
  }

  input.value = '';
  renderTeamSpel();
}

function setupNamen() {
  const aantal = parseInt(document.getElementById("aantalSpelers").value);
  legsTeWinnen = parseInt(document.getElementById("aantalLegs").value);
  const container = document.getElementById("namenSetup");
  container.innerHTML = `<h2>Voer spelersnamen in:</h2>`;
  for (let i = 0; i < aantal; i++) {
    container.innerHTML += `
      <label>Speler ${i + 1} naam:</label>
      <input type="text" id="spelerNaam${i}" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('bevestigNamen').click();}" class="naamveld">
      </br>
    `;
  }
  container.innerHTML += `<button id="bevestigNamen" onclick="startSpel(${aantal})">Start spel</button>`;
}

function startSpel(aantal) {
  spelers = [];
  beurt = 0;
  sessieGeschiedenis = [];
  for (let i = 0; i < aantal; i++) {
    const naam = document.getElementById(`spelerNaam${i}`).value || `Speler ${i + 1}`;
    spelers.push({
      naam,
      score: startScore,
      geschiedenis: [],
      legsGewonnen: 0
    });
  }
  document.getElementById("setup").style.display = 'none';
  document.getElementById("namenSetup").style.display = 'none';
  renderSpel();
}

function renderSpel() {
  toggleSpelControls(true);

  const container = document.getElementById("spel");
  container.innerHTML = '';
  spelers.forEach((speler, index) => {
    const div = document.createElement("div");
    div.className = "speler" + (index === beurt ? " aan-de-beurt" : "");
    const avg = speler.geschiedenis.length ? (gemiddelde(speler.geschiedenis).toFixed(1)) : 0;
    div.innerHTML = `
      <h2>${speler.naam}</h2>
      <div class="grote-score">${speler.score}</div>
      <p>Legs gewonnen: ${speler.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gemiddelde score: ${avg}</p>
      <p>Pijlen gegooid: ${speler.pijlenGegooid || 0}</p>
      <p>Beste leg: ${speler.besteLeg || '-'}</p>
      <p>Checkout hint: <strong>${getCheckoutHint(speler.score)}</strong></p>
      <p class="geschiedenis">Geschiedenis: ${speler.geschiedenis.join(", ")}</p>
      ${index === beurt ? `
        <label for="invoer">Score invoeren:</label>
        <input id="invoer" type="number" min="0" max="180">
        <button onclick="verwerkBeurt(${index})">Bevestig beurt</button>
      ` : ''}
    `;
    container.appendChild(div);
  });

  setTimeout(() => {
    const input = document.getElementById("invoer");
    if (input) {
      input.focus();
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          if (input.value.trim() === "") input.value = "0";
          verwerkBeurt(beurt);
        }
        if (e.key === "Backspace") input.value = '';
      });
    }

if (spelers[beurt].score <= 170) {
  const intro = new Audio('your_score_is.mp3');
  const scoreAudio = new Audio(`${spelers[beurt].score}.mp3`);
  intro.onended = () => scoreAudio.play().catch(() => {});
  
  // Wacht voordat je het intro-geluid afspeelt
  setTimeout(() => {
    intro.play().catch(() => {});
  }, 2500);
}
  }, 0);

  updateStatistieken();
}

function verwerkBeurt(index) {
  const input = document.getElementById("invoer");
  const score = parseInt(input.value);
  if (isNaN(score) || score < 0 || score > 180) {
    alert("Voer een geldige score in tussen 0 en 180.");
    input.value = '';
    input.focus();
    return;
  }

let audio = new Audio(`${score}.wav`);
audio.play().catch(() => {});

  const speler = spelers[index];
  const nieuweScore = speler.score - score;
  vorigeScore = { index, score };
  herstelGeschiedenis.push({ index, score });

  if (!speler.pijlenGegooid) speler.pijlenGegooid = 0;
  speler.pijlenGegooid += 3;

  if (nieuweScore === 0) {
    speler.legsGewonnen++;
    sessieGeschiedenis.push(`${speler.naam} wint een leg!`);


    if (!speler.besteLeg || speler.pijlenGegooid < speler.besteLeg) {
      speler.besteLeg = speler.pijlenGegooid;
    }

    if (speler.legsGewonnen >= legsTeWinnen) {
      alert(`${speler.naam} wint de sessie!`);
      stopSpel();
      return;
    }
    spelers.forEach(s => { s.score = startScore; s.geschiedenis = []; s.pijlenGegooid = 0;});
    beurt = startVolgordeIndex = (startVolgordeIndex + 1) % spelers.length;
    speelStartGeluid();
  } else if (nieuweScore < 0 || nieuweScore === 1) {
    alert("Bust!");
  } else {
    speler.score = nieuweScore;
    speler.geschiedenis.push(score);
    beurt = (beurt + 1) % spelers.length;
  }

  input.value = '';
  renderSpel();
}

function gemiddelde(beurten) {
  return beurten.length ? beurten.reduce((a, b) => a + b, 0) / beurten.length : 0;
}

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
    122: "T18, T20, D4", 121: "T20, T11, D14", 120: "T20, 20, D20", 119: "T19, 10, D16",
    118: "T20, 18, D20", 117: "T20, 17, D20", 116: "T20, 16, D20", 115: "T20, 15, D20",
    114: "T20, 14, D20", 113: "T20, 13, D20", 112: "T20, 12, D20", 111: "T20, 11, D20",
    110: "T20, 10, D20", 109: "T20, 9, D20", 108: "T20, 8, D20", 107: "T19, 10, D20",
    106: "T20, 6, D20", 105: "T20, 5, D20", 104: "T18, 18, D16", 103: "T20, 3, D20",
    102: "T20, 10, D16", 101: "T17, 10, D20", 100: "T20, D20", 100: "T20, D20", 99: "T19, 10, D16", 98: "T20, D19", 97: "T19, D20", 96: "T20, D18", 95: "T19, D19", 
    94: "T18, D20", 93: "T19, D18", 92: "T20, D16", 91: "T17, D20", 90: "T18, D18", 89: "T19, D16",
    88: "T16, D20", 87: "T17, D18", 86: "T18, D16", 85: "T15, D20", 84: "T20, D12", 83: "T17, D16",
    82: "Bull, D16", 81: "T15, D18", 80: "T20, D10", 79: "T13, D20", 78: "T18, D12", 77: "T19, D10",
    76: "T20, D8", 75: "T17, D12", 74: "T14, D16", 73: "T19, D8", 72: "T16, D12", 71: "T13, D16",
    70: "T18, D8", 69: "T19, D6", 68: "T20, D4", 67: "T17, D8", 66: "T10, D18", 65: "T19, D4",
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

function herstelLaatsteScore() {
  if (herstelGeschiedenis.length === 0) {
    alert("Niets om te herstellen.");
    return;
  }

  const laatste = herstelGeschiedenis.pop();

  if (teamMode && laatste?.team !== undefined) {
    const t = teams[laatste.team];
    t.score = Math.min(t.score + laatste.score, startScore);
    beurt = laatste.team;
    teamBeurtIndex = Math.max(0, laatste.spelerIndex);
    sessieGeschiedenis.push(`Herstel: ${t.spelers[teamBeurtIndex % t.spelers.length]} (${t.naam}) is weer aan de beurt.`);
    renderTeamSpel();
  } else if (!teamMode && laatste?.index !== undefined) {
    const s = spelers[laatste.index];
    s.score = Math.min(s.score + laatste.score, startScore);
    if (s.geschiedenis.length) s.geschiedenis.pop();
    beurt = laatste.index;
    sessieGeschiedenis.push(`Herstel: ${s.naam} is weer aan de beurt.`);
    renderSpel();
  }
}

function stopSpel() {
  if (confirm("Weet je zeker dat je het spel wilt stoppen?")) {
  toggleSpelControls(false);
    location.reload();
  }
}
