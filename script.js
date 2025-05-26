let spelers = [];
let beurt = 0;
let legsTeWinnen = 3;
let sessieGeschiedenis = [];

function setupNamen() {
  const aantal = Math.min(6, Math.max(1, parseInt(document.getElementById("aantalSpelers").value)));
  legsTeWinnen = parseInt(document.getElementById("aantalLegs").value);
  const container = document.getElementById("namenSetup");
  container.innerHTML = `<h2>Voer spelersnamen in:</h2>`;

  for (let i = 0; i < aantal; i++) {
    container.innerHTML += `
      <label>Speler ${i + 1} naam:</label>
      <input type="text" id="spelerNaam${i}" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('bevestigNamen').click();}">
    `;
  }
  container.innerHTML += `<button id="bevestigNamen" onclick="startSpel(${aantal})">Start spel</button>`;
}

function startSpel(aantal) {
  const container = document.getElementById("spel");
  container.innerHTML = '';
  document.getElementById("setup").style.display = 'none';
  document.getElementById("namenSetup").style.display = 'none';

  // Voeg knop 'Stop spel' toe
  const stopKnop = document.createElement("button");
  stopKnop.textContent = "Stop spel";
  stopKnop.style.margin = "20px auto";
  stopKnop.style.display = "block";
  stopKnop.onclick = function() {
    if(confirm("Weet je zeker dat je het spel wilt stoppen?")) {
      resetSpel();
    }
  };
  container.appendChild(stopKnop);

  spelers = [];
  beurt = 0;
  sessieGeschiedenis = [];

  for (let i = 0; i < aantal; i++) {
    const naam = document.getElementById(`spelerNaam${i}`).value || `Speler ${i + 1}`;
    spelers.push({
      naam: naam,
      score: 501,
      geschiedenis: [],
      legsGewonnen: 0,
    });
  }
  renderSpel();
}

function resetSpel() {
  spelers = [];
  beurt = 0;
  sessieGeschiedenis = [];
  document.getElementById("spel").innerHTML = '';
  document.getElementById("setup").style.display = 'block';
  document.getElementById("namenSetup").style.display = 'block';
  document.getElementById("namenSetup").innerHTML = '';
  document.getElementById("statistiekenLijst").innerHTML = '';
}

function renderSpel() {
  const container = document.getElementById("spel");

  // Zorg dat knop 'Stop spel' altijd bovenaan staat
  let stopKnop = container.querySelector("button");
  if (!stopKnop) {
    stopKnop = document.createElement("button");
    stopKnop.textContent = "Stop spel";
    stopKnop.style.margin = "20px auto";
    stopKnop.style.display = "block";
    stopKnop.onclick = function() {
      if(confirm("Weet je zeker dat je het spel wilt stoppen?")) {
        resetSpel();
      }
    };
    container.appendChild(stopKnop);
  }

  // Maak ruimte onder knop vrij voor spelers
  container.innerHTML = '';
  container.appendChild(stopKnop);

  spelers.forEach((speler, index) => {
    const div = document.createElement("div");
    div.className = "speler" + (index === beurt ? " aan-de-beurt" : "");
    const avg = speler.geschiedenis.length ? (gemiddelde(speler.geschiedenis).toFixed(1)) : 0;

    div.innerHTML = `
      <h2>${speler.naam}</h2>
      <div class="grote-score">${speler.score}</div>
      <p>Legs gewonnen: ${speler.legsGewonnen}/${legsTeWinnen}</p>
      <p>Gemiddelde score: ${avg}</p>
      <p>Checkout hint: <strong>${getCheckoutHint(speler.score)}</strong></p>
      <p class="geschiedenis">Geschiedenis: ${speler.geschiedenis.join(", ")}</p>
      ${index === beurt ? `
      <label for="invoer">Score invoeren:</label>
      <input id="invoer" type="number" min="0" max="180" onkeydown="if(event.key==='Enter'){verwerkBeurt(${index})}">
      <button onclick="verwerkBeurt(${index})">Bevestig beurt</button>
      ` : ''}
    `;

    container.appendChild(div);
  });

  updateStatistieken();
}

function verwerkBeurt(index) {
  const invoer = document.getElementById("invoer");
  const score = parseInt(invoer.value);
  if (isNaN(score) || score < 0 || score > 180) {
    alert("Voer een geldige score in tussen 0 en 180.");
    return;
  }

  let audio = new Audio(`${score}.wav`);
  audio.play().catch(() => {});

  const speler = spelers[index];
  const nieuweScore = speler.score - score;

  if (nieuweScore < 0 || nieuweScore === 1) {
    alert("Busted! Score is te hoog of eindigt op 1. Beurt telt niet.");
  } else if (nieuweScore === 0) {
    speler.geschiedenis.push(score);
    speler.legsGewonnen++;

    // Reset scores en geschiedenis van alle spelers
    spelers.forEach(s => {
      s.score = 501;
      s.geschiedenis = [];
    });

    sessieGeschiedenis.push(`${speler.naam} wint een leg met een finish van ${score}`);

    if (speler.legsGewonnen >= legsTeWinnen) {
      alert(`${speler.naam} heeft het spel gewonnen!`);
      sessieGeschiedenis.push(`${speler.naam} wint de sessie`);
      // Hier kun je eventueel het spel pauzeren of resetten
    }
  } else {
    speler.geschiedenis.push(score);
    speler.score = nieuweScore;
  }
  beurt = (beurt + 1) % spelers.length;
  renderSpel();
}

function gemiddelde(beurten) {
  if (!beurten.length) return 0;
  const totaal = beurten.reduce((a, b) => a + b, 0);
  return (totaal / beurten.length);
}

function getCheckoutHint(score) {
  const hints = {
    170: "T20, T20, Bull", 167: "T20, T19, Bull", 164: "T20, T18, Bull", 161: "T20, T17, Bull",
    160: "T20, T20, D20", 158: "T20, T20, D19", 157: "T20, T19, D20", 156: "T20, T20, D18",
    155: "T20, T19, D19", 153: "T20, T19, D18", 152: "T20, T20, D16", 151: "T20, T17, D20",
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
    102: "T20, 10, D16", 101: "T17, 10, D20", 100: "T20, D20",
  };
  return hints[score] || "-";
}

function updateStatistieken() {
  const lijst = document.getElementById("statistiekenLijst");
  if (!lijst) return;

  lijst.innerHTML = `<h2>Spelsessie Geschiedenis</h2>`;
  if (sessieGeschiedenis.length === 0) {
    lijst.innerHTML += "<p>Geen acties tot nu toe.</p>";
  } else {
    lijst.innerHTML += "<ul>" + sessieGeschiedenis.map(e => `<li>${e}</li>`).join("") + "</ul>";
  }
}
