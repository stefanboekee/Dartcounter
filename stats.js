/* ==========================================
   Dartcounter — stats.js  v5
   Persistente spelersstatistieken:
     1. localStorage  → snelle cache, werkt offline
     2. JSONBin.io    → blijft na wissen browserdata

   SETUP (eenmalig, gratis):
     1. Maak account op jsonbin.io
     2. Klik "Create Bin" → plak {} → sla op
     3. Kopieer het Bin ID uit de URL
     4. Ga naar API Keys → maak key aan → kopieer
     5. Vul JSONBIN_BIN_ID en JSONBIN_API_KEY hieronder in

   MECHANISME leg-detectie:
   - Override renderSpel + renderTeamSpel
   - Vergelijk legsGewonnen na elke render
   - Pijlen via totaalGeschiedenisLen (×3 per beurt)
   - toonEindscherm-hook voor matchafsluiting
   ========================================== */

const STATS_KEY = 'dartcounter_stats';

/* ====================================================
   ☁️  JSONBIN CONFIGURATIE  ← hier invullen
   ==================================================== */
const JSONBIN_BIN_ID  = '69e9e583856a68218963b4fb';
const JSONBIN_API_KEY = '$2a$10$9rxIAAcuAGZdrO8/ESPq9OWcZBMxiBxIojhkV8gM/c4KALkwp5Gn6';

/* ====================================================
   CLOUD SYNC — functies
   ==================================================== */

/** Haalt stats op van JSONBin. Geeft null bij fout of lege config. */
async function _cloudLaden() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) return null;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.record || null;
  } catch { return null; }
}

/** Stuurt alle stats naar JSONBin (fire-and-forget). */
async function _cloudOpslaan(data) {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) return;
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method:  'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY,
      },
      body: JSON.stringify(data),
    });
  } catch { /* offline of fout — lokaal al opgeslagen */ }
}

/**
 * Samenvoegen van lokale en cloud data.
 * Cloud wint voor gedeelde sessies; lokale extra sessies worden bewaard.
 */
function _mergeStats(lokaal, cloud) {
  if (!cloud || Object.keys(cloud).length === 0) return lokaal;
  const merged = JSON.parse(JSON.stringify(cloud));

  Object.keys(lokaal).forEach(naam => {
    if (!merged[naam]) {
      merged[naam] = lokaal[naam];
    } else {
      const cloudGames = merged[naam].games || [];
      const lokaalGames = lokaal[naam].games || [];
      const byId = {};
      cloudGames.forEach(g => { if (g._sessieId) byId[g._sessieId] = g; });
      lokaalGames.forEach(g => {
        if (g._sessieId && !byId[g._sessieId]) byId[g._sessieId] = g;
        else if (!g._sessieId) cloudGames.push(g);
      });
      merged[naam].games = Object.values(byId).sort((a, b) =>
        (a.datum || '').localeCompare(b.datum || '')
      );
    }
  });

  return merged;
}

/** Laadt cloud-data, synchroniseert met localStorage, en uploadt lokale data die de cloud mist. */
async function _syncVanCloud() {
  const lokaalData = statsLaden();
  const cloudData  = await _cloudLaden();

  // Geen verbinding of fout — werk alleen met lokale data
  if (cloudData === null) return;

  const merged = _mergeStats(lokaalData, cloudData);

  // Lokaal bijwerken als cloud nieuwe data had
  if (JSON.stringify(merged) !== JSON.stringify(lokaalData)) {
    _statsOpslaanLokaal(merged);
  }

  // Cloud bijwerken als lokaal nieuwe data had die cloud miste
  if (JSON.stringify(merged) !== JSON.stringify(cloudData)) {
    await _cloudOpslaan(merged);
  }
}

/** Sla op in localStorage (synchroon, snel). */
function _statsOpslaanLokaal(data) {
  try   { localStorage.setItem(STATS_KEY, JSON.stringify(data)); }
  catch (e) { console.warn('Lokale opslag mislukt:', e); }
}

/* ====================================================
   SORTEER-STATUS voor de ranglijst-tabel
   ==================================================== */
let _sortKolom    = 'winPct';
let _sortRichting = -1;

/* ====================================================
   SESSIE & STAAT TRACKING
   ==================================================== */
let _sessieId    = null;  // unieke ID per game
let _cumulPijlen = {};    // { naam: totaal_pijlen_alle_legs }

// Per-speler vorige render staat
// { naam: { legsGewonnen, totaalLen, pijlenDezeLeg } }
let _vorigeState = {};

function _nieuweSessie() {
  _sessieId    = Date.now().toString();
  _cumulPijlen = {};
  _vorigeState = {};
}

/* ====================================================
   OVERRIDE: startSpel & startTeamSpel
   Nieuwe sessie bij elke game start.
   ==================================================== */
(function () {
  const _orig = window.startSpel;
  window.startSpel = function (...args) {
    _nieuweSessie();
    return typeof _orig === 'function' ? _orig.apply(this, args) : undefined;
  };
})();

(function () {
  const _orig = window.startTeamSpel;
  window.startTeamSpel = function (...args) {
    _nieuweSessie();
    return typeof _orig === 'function' ? _orig.apply(this, args) : undefined;
  };
})();

/* ====================================================
   OVERRIDE: renderSpel (single mode)
   Loopt na ELKE beurt — detecteert leg wins hier.
   stats.js laadt als laatste, dus window.renderSpel
   is op dit moment de mobile.js versie.
   ==================================================== */
(function () {
  const _orig = window.renderSpel;
  window.renderSpel = function (...args) {
    _controleerLegWin();
    return typeof _orig === 'function' ? _orig.apply(this, args) : undefined;
  };
})();

/* ====================================================
   OVERRIDE: renderTeamSpel (team mode)
   ==================================================== */
(function () {
  const _orig = window.renderTeamSpel;
  if (typeof _orig !== 'function') return;
  window.renderTeamSpel = function (...args) {
    _controleerLegWin();
    return typeof _orig === 'function' ? _orig.apply(this, args) : undefined;
  };
})();

/* ====================================================
   KERN: _controleerLegWin
   Wordt na elke renderSpel/renderTeamSpel aangeroepen.
   Leest de huidige spelstaat en detecteert of er een
   leg gewonnen is door legsGewonnen te vergelijken.
   ==================================================== */
function _controleerLegWin() {
  if (!_sessieId) return;

  const deelnemers = _getDeelnemers();
  if (!deelnemers.length) return;

  let heeftLegWin = false;

  deelnemers.forEach(d => {
    const naam        = d.naam;
    const huidigLegs  = d.legsGewonnen || 0;
    const huidigLen   = Array.isArray(d.totaalGeschiedenis) ? d.totaalGeschiedenis.length : 0;

    // Eerste keer: initialiseer staat, geen actie
    if (!_vorigeState[naam]) {
      _vorigeState[naam] = {
        legsGewonnen:  huidigLegs,
        totaalLen:     huidigLen,
        pijlenDezeLeg: 0
      };
      return;
    }

    const v = _vorigeState[naam];

    // Nieuwe gooien bijhouden via totaalGeschiedenisLen
    // Elke +1 in totaalLen = 1 beurt = 3 pijlen
    const nieuweGooien = Math.max(0, huidigLen - v.totaalLen);
    v.pijlenDezeLeg   += nieuweGooien * 3;
    v.totaalLen        = huidigLen;

    // Leg win: legsGewonnen is gestegen
    if (huidigLegs > v.legsGewonnen) {
      heeftLegWin     = true;
      v.legsGewonnen  = huidigLegs;
    }
  });

  if (heeftLegWin) {
    // Sla pijlen van de voltooide leg op voor ALLE spelers
    // en reset de per-leg teller
    deelnemers.forEach(d => {
      const naam = d.naam;
      if (!_cumulPijlen[naam]) _cumulPijlen[naam] = 0;
      _cumulPijlen[naam] += _vorigeState[naam].pijlenDezeLeg || 0;
      _vorigeState[naam].pijlenDezeLeg = 0;
    });

    try { _upsertGame(null); } catch (e) { console.warn('stats leg-save fout:', e); }
  }
}

/* ====================================================
   OVERRIDE: toonEindscherm
   Slaat de definitieve matchafronding op.
   Bij een match-win wordt renderSpel NIET aangeroepen,
   dus _controleerLegWin loopt niet voor de laatste leg.
   We gebruiken d.pijlenGegooid voor de laatste leg
   (nog niet gereset op dit punt).
   ==================================================== */
(function () {
  const _vorige = window.toonEindscherm;

  window.toonEindscherm = function (winnaar, deelnemers) {
    if (!_sessieId) _sessieId = Date.now().toString();

    const huidig = _getDeelnemers();
    huidig.forEach(d => {
      // pijlenGegooid = pijlen van de LAATSTE leg (nog niet gereset)
      if (!_cumulPijlen[d.naam]) _cumulPijlen[d.naam] = 0;
      _cumulPijlen[d.naam] += (d.pijlenGegooid || 0);
    });

    try { _upsertGame(winnaar); } catch (e) { console.warn('stats eindscherm-save fout:', e); }

    if (typeof _vorige === 'function') _vorige.call(this, winnaar, deelnemers);
  };
})();

/* ====================================================
   KERN: _upsertGame
   Maakt of overschrijft de game-entry voor _sessieId.
   winnaar = null  → tussentijdse leg-update
   winnaar = object → definitieve afsluiting
   ==================================================== */
function _upsertGame(winnaar) {
  const db         = statsLaden();
  const modus      = (typeof teamMode     !== 'undefined' && teamMode)     ? 'teams'  : 'single';
  const legs       = (typeof legsTeWinnen !== 'undefined') ? legsTeWinnen  : 3;
  const start      = (typeof startScore   !== 'undefined') ? startScore    : 501;
  const deelnemers = _getDeelnemers();
  const datumNu    = new Date().toISOString();

  deelnemers.forEach(d => {
    const naam = d.naam;
    if (!db[naam]) db[naam] = { naam, games: [] };

    const idx    = db[naam].games.findIndex(g => g._sessieId === _sessieId);
    const totaal = Array.isArray(d.totaalGeschiedenis) ? d.totaalGeschiedenis : [];
    const avg    = totaal.length
      ? parseFloat((totaal.reduce((a, b) => a + b, 0) / totaal.length).toFixed(1))
      : 0;

    const entry = {
      _sessieId,
      datum:         idx >= 0 ? db[naam].games[idx].datum : datumNu,
      modus,
      startScore:    start,
      legsTeWinnen:  legs,
      legsGewonnen:  d.legsGewonnen  || 0,
      gewonnen:      winnaar ? d.naam === winnaar.naam : false,
      afgerond:      winnaar !== null,
      pijlen:        _cumulPijlen[naam] || 0,
      gemiddelde:    avg,
      hoogsteFinish: d.hoogsteFinish || null,
      besteLeg:      d.besteLeg      || null,
    };

    if (idx >= 0) { db[naam].games[idx] = entry; }
    else          { db[naam].games.push(entry);   }
  });

  statsOpslaan(db);
}

/* ====================================================
   STORAGE HELPERS
   ==================================================== */

/** Laad stats uit localStorage (synchroon). */
function statsLaden() {
  try   { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
  catch { return {}; }
}

/**
 * Sla stats op:
 * 1. localStorage (direct, synchroon)
 * 2. Netlify Blobs via function (async, fire-and-forget)
 */
function statsOpslaan(data) {
  _statsOpslaanLokaal(data);
  _cloudOpslaan(data); // geen await — gameplay wordt niet vertraagd
}

function _getDeelnemers() {
  if (typeof teamMode !== 'undefined' && teamMode) {
    return Array.isArray(teams)   ? teams   : [];
  }
  return Array.isArray(spelers) ? spelers : [];
}

/* ====================================================
   MENU-ITEM TOEVOEGEN
   ==================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Synchroniseer op de achtergrond met cloud-opslag
  _syncVanCloud();

  const menu = document.getElementById('dropdownMenu');
  if (!menu) return;

  const btn = document.createElement('button');
  btn.className = 'menu-item';
  btn.id        = 'menuStatsBtn';
  btn.innerHTML = '📊 Statistieken';
  btn.onclick   = menuOpenStats;

  const divider = menu.querySelector('.menu-divider');
  divider ? menu.insertBefore(btn, divider) : menu.appendChild(btn);
});

function menuOpenStats() {
  if (typeof closeMenu === 'function') closeMenu();
  toonStatsScherm();
}

/* ====================================================
   STATS SCHERM HOOFD
   ==================================================== */
function toonStatsScherm() {
  const scherm = document.getElementById('statsScherm');
  if (!scherm) return;
  scherm.style.display = 'flex';
  renderStatsOverzicht();
}

function sluitStatsScherm() {
  const scherm = document.getElementById('statsScherm');
  if (scherm) scherm.style.display = 'none';
}

/* ====================================================
   RENDER: OVERZICHT — sorteerbare ranglijst
   ==================================================== */
function renderStatsOverzicht() {
  const scherm = document.getElementById('statsScherm');
  const db     = statsLaden();
  // Filter: alleen echte speler-entries (hebben een games array)
  const namen  = Object.keys(db).filter(k => db[k] && Array.isArray(db[k].games));

  let html = `
    <div class="stats-header">
      <button class="stats-sluit-btn" onclick="sluitStatsScherm()">&#x2715;</button>
      <h2 class="stats-titel">&#x1F4CA; Statistieken</h2>
      <div class="stats-header-spacer"></div>
    </div>
    <div class="stats-body">
  `;

  if (namen.length === 0) {
    html += `
      <div class="stats-leeg">
        <div class="stats-leeg-icon">&#x1F3AF;</div>
        <p class="stats-leeg-tekst">Nog geen statistieken beschikbaar.</p>
        <p class="stats-leeg-sub">Voltooi een leg om data op te slaan.</p>
      </div>`;
  } else {
    const rijen = namen.map(naam => {
      const alleGames = db[naam].games || [];
      const afgerond  = alleGames.filter(g => g.afgerond);
      const lopend    = alleGames.find(g => !g.afgerond && g._sessieId === _sessieId);

      const gewonnen  = afgerond.filter(g => g.gewonnen).length;
      const winPct    = afgerond.length ? Math.round((gewonnen / afgerond.length) * 100) : 0;

      // Statistieken over ALLE entries (inclusief lopende game)
      const avgs     = alleGames.map(g => g.gemiddelde).filter(a => a > 0);
      const gemAvg   = avgs.length ? parseFloat((avgs.reduce((a,b)=>a+b,0)/avgs.length).toFixed(1)) : null;
      const allLegs  = alleGames.map(g => g.besteLeg).filter(Boolean);
      const besteLeg = allLegs.length ? Math.min(...allLegs) : null;
      const allFin   = alleGames.map(g => g.hoogsteFinish).filter(Boolean);
      const topFin   = allFin.length ? Math.max(...allFin) : null;
      const totLegs  = alleGames.reduce((s,g) => s + (g.legsGewonnen||0), 0);

      return { naam, games: afgerond.length, gewonnen, winPct, gemAvg, besteLeg, topFin, totLegs, lopend: !!lopend };
    });

    rijen.sort((a, b) => {
      let va = a[_sortKolom], vb = b[_sortKolom];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (_sortKolom === 'besteLeg') return (va - vb) * _sortRichting * -1;
      if (typeof va === 'string') return va.localeCompare(vb) * _sortRichting;
      return (va - vb) * _sortRichting;
    });

    const kolommen = [
      { id: 'naam',     label: 'SPELER',     align: 'left'  },
      { id: 'totLegs',  label: 'LEGS',       align: 'right' },
      { id: 'winPct',   label: 'WIN%',       align: 'right' },
      { id: 'gemAvg',   label: 'GEM.',       align: 'right' },
      { id: 'besteLeg', label: 'BESTE LEG',  align: 'right' },
      { id: 'topFin',   label: 'TOP FINISH', align: 'right' },
    ];
    const medailles = ['🥇','🥈','🥉'];

    html += `<div class="rl-wrap"><div class="rl-label">🏆 RANGLIJST</div><div class="rl-scroll"><table class="rl-tabel"><thead><tr><th class="rl-th rl-th-rank">#</th>`;
    kolommen.forEach(k => {
      const actief   = _sortKolom === k.id;
      const pijl     = actief ? (_sortRichting === -1 ? ' ↓' : ' ↑') : '';
      const richting = actief && _sortRichting === -1 ? 1 : -1;
      html += `<th class="rl-th rl-th-${k.align} ${actief ? 'rl-th-actief' : ''}" onclick="_sorteerTabel('${k.id}', ${richting})">${k.label}${pijl}</th>`;
    });
    html += `</tr></thead><tbody>`;

    rijen.forEach((r, idx) => {
      const medaille  = medailles[idx] || '';
      const winKleur  = r.winPct === 100 ? 'rl-val-groen' : r.winPct >= 50 ? 'rl-val-groen-dim' : '';
      const liveBadge = r.lopend ? ' <span class="rl-live">🔄</span>' : '';
      html += `
        <tr class="rl-rij" onclick="renderStatsDetail('${_escJs(r.naam)}')">
          <td class="rl-td rl-td-rank">${medaille || (idx+1)}</td>
          <td class="rl-td rl-td-naam">${r.naam}${liveBadge}</td>
          <td class="rl-td rl-td-num">${r.totLegs}</td>
          <td class="rl-td rl-td-num ${winKleur}">${r.winPct}%</td>
          <td class="rl-td rl-td-num">${r.gemAvg !== null ? r.gemAvg : '—'}</td>
          <td class="rl-td rl-td-num">${r.besteLeg !== null ? r.besteLeg + ' 🎯' : '—'}</td>
          <td class="rl-td rl-td-num">${r.topFin !== null ? r.topFin : '—'}</td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;
    html += `<button class="stats-danger-btn" onclick="bevestigAllesWissen()">🗑️ Alle statistieken wissen</button>`;
  }

  html += `</div>`;
  scherm.innerHTML = html;
}

function _sorteerTabel(kolom, richting) {
  _sortKolom    = kolom;
  _sortRichting = richting;
  renderStatsOverzicht();
}

/* ====================================================
   RENDER: DETAIL — één speler
   ==================================================== */
function renderStatsDetail(naam) {
  const scherm = document.getElementById('statsScherm');
  const db     = statsLaden();
  const data   = db[naam];
  if (!data || !data.games || data.games.length === 0) { renderStatsOverzicht(); return; }

  const alleGames     = data.games;
  const afgerondGames = alleGames.filter(g => g.afgerond);
  const lopendGame    = alleGames.find(g => !g.afgerond && g._sessieId === _sessieId);

  const totaalGames   = afgerondGames.length;
  const gewonnen      = afgerondGames.filter(g => g.gewonnen).length;
  const winPct        = totaalGames ? Math.round((gewonnen / totaalGames) * 100) : 0;

  const alleGeldig    = alleGames;
  const totalePijlen  = alleGeldig.reduce((s,g) => s + (g.pijlen||0), 0);
  const avgs          = alleGeldig.map(g => g.gemiddelde).filter(a => a > 0);
  const gemAvg        = avgs.length ? (avgs.reduce((a,b)=>a+b,0)/avgs.length).toFixed(1) : '—';
  const besteGem      = avgs.length ? Math.max(...avgs).toFixed(1) : '—';
  const slechtGem     = avgs.length ? Math.min(...avgs).toFixed(1) : '—';
  const allFinishes   = alleGeldig.map(g => g.hoogsteFinish).filter(Boolean);
  const hoogsteFinish = allFinishes.length ? Math.max(...allFinishes) : '—';
  const allLegs       = alleGeldig.map(g => g.besteLeg).filter(Boolean);
  const besteLeg      = allLegs.length ? Math.min(...allLegs) : '—';
  const totalLegs     = alleGeldig.reduce((s,g) => s + (g.legsGewonnen||0), 0);
  const singleGames   = afgerondGames.filter(g => g.modus === 'single').length;
  const teamGames     = totaalGames - singleGames;

  let maxStreak = 0, huidigStreak = 0;
  afgerondGames.forEach(g => {
    if (g.gewonnen) { huidigStreak++; maxStreak = Math.max(maxStreak, huidigStreak); }
    else huidigStreak = 0;
  });

  const lopendBanner = lopendGame ? `
    <div class="stats-lopend-banner">
      🔄 Lopende game — ${lopendGame.legsGewonnen} leg(s) gewonnen · gem. ${lopendGame.gemiddelde || '—'} · ${lopendGame.pijlen || 0} pijlen
    </div>` : '';

  const sparkline = avgs.length >= 3 ? _maakSparkline(avgs) : '';

  let html = `
    <div class="stats-header">
      <button class="stats-sluit-btn" onclick="renderStatsOverzicht()">&#x2190;</button>
      <h2 class="stats-titel">${naam}</h2>
      <div class="stats-header-spacer"></div>
    </div>
    <div class="stats-body">
      ${lopendBanner}
      <div class="stats-section-label">Carrière overzicht</div>
      <div class="stats-career-grid">
        <div class="career-tile career-tile-accent"><span class="career-val">${winPct}%</span><span class="career-lbl">Win %</span></div>
        <div class="career-tile"><span class="career-val">${totaalGames}</span><span class="career-lbl">Games</span></div>
        <div class="career-tile"><span class="career-val">${gewonnen}</span><span class="career-lbl">Gewonnen</span></div>
        <div class="career-tile"><span class="career-val">${totalLegs}</span><span class="career-lbl">Legs gewonnen</span></div>
        <div class="career-tile"><span class="career-val">${gemAvg}</span><span class="career-lbl">Gem. score</span></div>
        <div class="career-tile career-tile-gold"><span class="career-val">${besteGem}</span><span class="career-lbl">Beste gem.</span></div>
        <div class="career-tile"><span class="career-val">${slechtGem}</span><span class="career-lbl">Laagste gem.</span></div>
        <div class="career-tile"><span class="career-val">${totalePijlen}</span><span class="career-lbl">Pijlen totaal</span></div>
        <div class="career-tile career-tile-gold"><span class="career-val">${hoogsteFinish}</span><span class="career-lbl">Hoogste finish</span></div>
        <div class="career-tile career-tile-gold"><span class="career-val">${besteLeg !== '—' ? besteLeg + ' 🎯' : '—'}</span><span class="career-lbl">Beste leg</span></div>
        <div class="career-tile"><span class="career-val">${maxStreak}</span><span class="career-lbl">Langste streak</span></div>
        <div class="career-tile"><span class="career-val">${singleGames}/${teamGames}</span><span class="career-lbl">Single/Team</span></div>
      </div>
      ${sparkline ? `<div class="stats-section-label">Gemiddelde score per game</div><div class="stats-chart-wrap">${sparkline}</div>` : ''}
      <div class="stats-section-label">Game geschiedenis (${totaalGames})</div>
      <div class="stats-game-list">
        ${[...afgerondGames].reverse().map(g => `
          <div class="stats-game-row ${g.gewonnen ? 'game-gewonnen' : 'game-verloren'}">
            <div class="game-badge">${g.gewonnen ? '🏆' : '💀'}</div>
            <div class="game-info">
              <div class="game-datum">${_formatDatum(g.datum)}</div>
              <div class="game-meta">${g.startScore} · ${g.modus} · ${g.legsGewonnen}/${g.legsTeWinnen} legs</div>
            </div>
            <div class="game-nums">
              <div>Gem: <strong>${g.gemiddelde || '—'}</strong></div>
              <div>Pijlen: <strong>${g.pijlen || '—'}</strong></div>
              ${g.hoogsteFinish ? `<div>Finish: <strong>${g.hoogsteFinish}</strong></div>` : ''}
              ${g.besteLeg      ? `<div>Beste leg: <strong>${g.besteLeg} 🎯</strong></div>` : ''}
            </div>
          </div>`).join('')}
      </div>
      <button class="stats-danger-btn" onclick="bevestigSpelerWissen('${_escJs(naam)}')">🗑️ Data van ${naam} wissen</button>
    </div>`;

  scherm.innerHTML = html;
}

/* ====================================================
   SPARKLINE
   ==================================================== */
function _maakSparkline(waarden) {
  const B = 320, H = 72, P = 10;
  const min = Math.min(...waarden), max = Math.max(...waarden);
  const bereik = max - min || 1, n = waarden.length;
  const toX = i => P + (i / (n-1)) * (B - P*2);
  const toY = v => H - P - ((v - min) / bereik) * (H - P*2);
  const punten = waarden.map((v,i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const gebied = [`${toX(0).toFixed(1)},${H-P}`, ...waarden.map((v,i)=>`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`), `${toX(n-1).toFixed(1)},${H-P}`].join(' ');
  const gemAvg = waarden.reduce((a,b)=>a+b,0)/n;
  const gemY   = toY(gemAvg).toFixed(1);
  return `<svg viewBox="0 0 ${B} ${H}" class="stats-sparkline" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
    </linearGradient></defs>
    <polygon points="${gebied}" fill="url(#sgGrad)"/>
    <line x1="${P}" y1="${gemY}" x2="${B-P}" y2="${gemY}" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>
    <text x="${B-P-2}" y="${parseFloat(gemY)-3}" fill="var(--text-dim)" font-size="8" text-anchor="end">gem. ${gemAvg.toFixed(1)}</text>
    <polyline points="${punten}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${waarden.map((v,i)=>`<circle cx="${toX(i).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="3" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.5"/>`).join('')}
    <text x="${P}" y="${H-1}" fill="var(--text-dim)" font-size="8">${min.toFixed(0)}</text>
    <text x="${P}" y="9" fill="var(--text-dim)" font-size="8">${max.toFixed(0)}</text>
  </svg>`;
}

/* ====================================================
   RESET FUNCTIES
   ==================================================== */
function bevestigAllesWissen() {
  if (confirm('Weet je zeker dat je ALLE statistieken wilt wissen?\nDit kan niet ongedaan worden gemaakt.')) {
    try { localStorage.removeItem(STATS_KEY); } catch (e) {}
    renderStatsOverzicht();
  }
}

function bevestigSpelerWissen(naam) {
  if (confirm(`Weet je zeker dat je alle data van ${naam} wilt wissen?`)) {
    const db = statsLaden(); delete db[naam]; statsOpslaan(db);
    renderStatsOverzicht();
  }
}

/* ====================================================
   HELPERS
   ==================================================== */
function _formatDatum(isoString) {
  try {
    return new Date(isoString).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return isoString || '—'; }
}

function _escJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
