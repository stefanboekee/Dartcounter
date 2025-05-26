const legsTeWinnen = 3;
let spelers = [];
let beurt = 0;
let spelGestart = false;

function startSpel() {
  const namenInput = document.getElementById("namen");
  const namen = namenInput.value.split(",").map(n => n.trim()).filter(n => n);
  if(namen.length < 1) {
    alert("Voer minstens één speler in, gescheiden door komma's");
    return;
  }

  spelers = namen.map(naam => ({
    naam,
    score: 501,
    legsGewonnen: 0,
    geschiedenis: []
  }));

  beurt = 0;
  spelGestart = true;

  document.getElementById("setup").style.display = "none";
  document.getElementById("spel").style.display = "block";

  renderSpel();
}

function renderSpel() {
  const container = document.getElementById("spel");
  container.innerHTML = '';

  // Stop knop bovenaan
  const stopKnop = document.createElement("button");
  stopKnop.textContent = "Stop spel";
  stopKnop.onclick = () => {
    if(confirm("Weet je zeker dat je het spel wilt stoppen?")) {
      resetSpel();
    }
  };
  container.appendChild(stopKnop);

  const wrapper = document.createElement("div");
  wrapper.className = "spelersContainer";

  spelers.forEach((speler, index) => {
    const div = document.createElement("div");
    div.className = "speler";
    if(index === beurt) div.classList.add("beurt");

    const avg = speler.geschiedenis.length ? (gemiddelde(speler.geschiedenis).toFixed(1)) : 0;

    div.innerHTML = `
      <h2>${speler.naam}</h2>
      <div class="score">${speler.score}</div>
      <div class="legs">Legs: ${speler.legsGewonnen} / ${legsTeWinnen}</div>
      <div class="avgScore">Gem. score: ${avg}</div>
      <div class="checkoutHint">Checkout: <strong>${getCheckoutHint(speler.score)}</strong></div>
      <div class="geschiedenis">Geschiedenis: ${speler.geschiedenis.join(", ")}</div>
    `;

    if (index === beurt) {
      div.innerHTML += `
        <input id="invoer" type="number" min="0" max="180" placeholder="Score invoeren" onkeydown="if(event.key==='Enter'){verwerkBeurt(${index})}">
        <button class="bevestig" onclick="verwerkBeurt(${index})">Bevestig beurt</button>
      `;
    }

    wrapper.appendChild(div);
  });

  container.appendChild(wrapper);
  updateStatistieken();
}

function verwerkBeurt(index) {
  const invoer = document.getElementById("invoer");
  let score = parseInt(invoer.value);
  if (isNaN(score) || score < 0 || score > 180) {
    alert("Voer een geldige score in tussen 0 en 180");
    return;
  }

  let speler = spelers[index];

  if (score > speler.score) {
    alert("Score mag niet hoger zijn dan de huidige score.");
    invoer.value = "";
    return;
  }

  speler.score -= score;
  speler.geschiedenis.push(score);
  invoer.value = "";

  // Check uitgooien
  if(speler.score === 0) {
    speler.legsGewonnen++;
    alert(`${speler.naam} heeft een leg gewonnen!`);

    // Reset scores voor alle spelers
    spelers.forEach(sp => {
      sp.score = 501;
      sp.geschiedenis = [];
    });

    // Check of iemand legsTeWinnen heeft bereikt
    if(speler.legsGewonnen >= legsTeWinnen) {
      alert(`${speler.naam} heeft het spel gewonnen!`);
      resetSpel();
      return;
    }
  } else if(speler.score < 0) {
    // Score overgeslagen, beurt blijft bij dezelfde speler, score terugzetten
    speler.score += score;
    speler.geschiedenis.pop();
    alert("Score te hoog, beurt ongeldig.");
    renderSpel();
    return;
  }

  // Volgende speler
  beurt = (beurt + 1) % spelers.length;

  renderSpel();
}

function resetSpel() {
  spelers = [];
  beurt = 0;
  spelGestart = false;
  document.getElementById("spel").style.display = "none";
  document.getElementById("setup").style.display = "block";
  document.getElementById("namen").value = "";
}

function gemiddelde(arr) {
  if(arr.length === 0) return 0;
  return arr.reduce((a,b) => a+b,0) / arr.length;
}

function getCheckoutHint(score) {
  // Simpele checkout hints (kan uitgebreid)
  if(score <= 170 && score >= 2) {
    return "Check mogelijk";
  }
  return "-";
}

function updateStatistieken() {
  // Hier kun je later algemene statistieken updaten
}

// Initial setup show/hide
window.onload = () => {
  document.getElementById("spel").style.display = "none";
};
