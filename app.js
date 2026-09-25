/* ============================================================
   SLAORUS MINI — launcher app
   Add permanent games in games.js (deployed with the site).
   Games added in the UI are saved in this browser's localStorage.
   ============================================================ */
"use strict";

/* ---------- storage ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem("slaorus_" + k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ localStorage.setItem("slaorus_" + k, JSON.stringify(v)); }
};

let playtime   = store.get("pt", {});      // { gameId: seconds }
let lastPlayed = store.get("lp", {});      // { gameId: timestamp }
let favorites  = store.get("fav", []);     // [ gameId ]
let hiddenIds  = store.get("hidden", []);  // deleted game ids
let customGames= store.get("custom", []);  // added via UI
let streak     = store.get("streak", { last: null, count: 0 });
let accent     = store.get("accent", "#c9b8ff");
let fxOn       = store.get("fx", true);

/* ---------- date helper ---------- */
const dayKey = (d = new Date()) =>
  d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");

/* ---------- daily streak (visiting or playing) ---------- */
(function updateStreak(){
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 864e5));
  if (streak.last === today) return;
  streak.count = (streak.last === yesterday) ? streak.count + 1 : 1;
  streak.last = today;
  store.set("streak", streak);
})();

/* ---------- game library ---------- */
function allGames(){
  const merged = [...(window.BUILT_IN_GAMES || []), ...customGames];
  return merged.filter(g => !hiddenIds.includes(g.id));
}
function uid(){ return "g_" + Math.random().toString(36).slice(2, 10); }
// give games.js entries without ids a stable id
(window.BUILT_IN_GAMES || []).forEach(g => { if(!g.id) g.id = "bi_" + g.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"); });

const isNew = g => g.addedAt && (Date.now() - g.addedAt) < 7 * 864e5;

/* ---------- accent ---------- */
const ACCENTS = ["#c9b8ff","#a8b8ff","#8be9fd","#ff9ff3","#7bed9f","#ffd166","#c56cf0","#ff6b6b"];
function applyAccent(c){
  accent = c;
  document.documentElement.style.setProperty("--accent", c);
  document.body.dataset.accent = c;
}

/* ---------- elements ---------- */
const $ = id => document.getElementById(id);
const library = $("library"), chipsEl = $("chips"), searchEl = $("search");
let activeChip = "All";

/* ---------- starfield ---------- */
const canvas = $("stars"), ctx = canvas.getContext("2d");
let starList = [];
function initStars(){
  canvas.width = innerWidth; canvas.height = innerHeight;
  starList = Array.from({length: 90}, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    r: Math.random()*1.4 + .3, p: Math.random()*Math.PI*2, s: .5 + Math.random()*1.5
  }));
}
function drawStars(t){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (const s of starList){
    const a = .3 + .7 * Math.abs(Math.sin(t/1000*s + s.p));
    ctx.globalAlpha = a;
    ctx.fillStyle = "#cdd6ff";
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(drawStars);
}
initStars(); addEventListener("resize", initStars);
requestAnimationFrame(drawStars);

/* ---------- formatting ---------- */
function fmtTime(sec){
  sec = Math.floor(sec);
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec/60), s = sec%60;
  if (m < 60) return s ? m + "m " + s + "s" : m + "m";
  const h = Math.floor(m/60);
  return h + "h " + (m%60) + "m";
}
function timeAgo(ts){
  const d = Date.now() - ts;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return Math.floor(d/60e3) + "m ago";
  if (d < 86400e3) return Math.floor(d/3600e3) + "h ago";
  return Math.floor(d/86400e3) + "d ago";
}

/* ---------- card builder ---------- */
function makeCard(g, opts = {}){
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = g.id;

  const pt = playtime[g.id] || 0;
  if (isNew(g)){
    const b = document.createElement("span");
    b.className = "badge-new"; b.textContent = "NEW!";
    card.appendChild(b);
  }
  if (opts.crown){
    const b = document.createElement("span");
    b.className = "badge-crown"; b.textContent = "👑 #1";
    card.appendChild(b);
  }
  if (pt > 0){
    const t = document.createElement("span");
    t.className = "playtime-tag"; t.textContent = "⏱ " + fmtTime(pt);
    card.appendChild(t);
  }

  if (g.icon){
    const img = document.createElement("img");
    img.className = "thumb"; img.src = g.icon; img.alt = g.name; img.loading = "lazy";
    img.onerror = () => { img.replaceWith(fallbackTile(g)); };
    card.appendChild(img);
  } else {
    card.appendChild(fallbackTile(g));
  }

  const fav = document.createElement("button");
  fav.className = "fav" + (favorites.includes(g.id) ? " on" : "");
  fav.textContent = favorites.includes(g.id) ? "★" : "☆";
  fav.title = "Favorite";
  fav.onclick = e => { e.stopPropagation(); toggleFav(g.id); };
  card.appendChild(fav);

  const del = document.createElement("button");
  del.className = "del"; del.textContent = "✕"; del.title = "Remove game";
  del.onclick = e => {
    e.stopPropagation();
    if (confirm(`Remove "${g.name}" from your library?`)){
      hiddenIds.push(g.id); store.set("hidden", hiddenIds); render();
    }
  };
  card.appendChild(del);

  const name = document.createElement("div");
  name.className = "cname"; name.textContent = g.name;
  card.appendChild(name);

  card.onclick = () => openGame(g);
  return card;
}
function fallbackTile(g){
  const d = document.createElement("div");
  d.className = "thumb-fallback";
  d.textContent = (g.name || "?").trim().charAt(0).toUpperCase();
  return d;
}
function toggleFav(id){
  favorites = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
  store.set("fav", favorites);
  render();
}

/* ---------- rendering ---------- */
function render(){
  const games = allGames();
  const q = searchEl.value.trim().toLowerCase();
  library.innerHTML = "";
  chipsEl.innerHTML = "";

  // chips
  const tags = ["All", ...new Set(games.map(g => g.tag).filter(Boolean))];
  if (!tags.includes(activeChip)) activeChip = "All";
  for (const t of tags){
    const c = document.createElement("button");
    c.className = "chip" + (t === activeChip ? " active" : "");
    c.textContent = t;
    c.onclick = () => { activeChip = t; render(); };
    chipsEl.appendChild(c);
  }

  const filtered = games.filter(g =>
    (activeChip === "All" || g.tag === activeChip) &&
    (!q || g.name.toLowerCase().includes(q))
  );

  const section = (title, list, opts) => {
    if (!list.length && !opts.force) return;
    const h = document.createElement("div");
    h.className = "section-title"; h.textContent = title;
    library.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "grid";
    if (!list.length){
      const e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = opts.empty || "Nothing here yet.";
      grid.appendChild(e);
    }
    list.forEach(g => grid.appendChild(makeCard(g, opts)));
    library.appendChild(grid);
  };

  // FEATURED: NEW! games sorted to top
  const news = filtered.filter(isNew).sort((a,b) => b.addedAt - a.addedAt);
  section("✨ New & Featured", news, { force: news.length > 0, empty: "" });

  // RECENTLY PLAYED
  const recent = filtered
    .filter(g => lastPlayed[g.id])
    .sort((a,b) => lastPlayed[b.id] - lastPlayed[a.id])
    .slice(0, 6);
  section("🕒 Recently Played", recent, { empty: "Play something and it'll show up here." });

  // FAVORITES
  const favs = filtered.filter(g => favorites.includes(g.id));
  section("⭐ Favorites", favs, { empty: "Tap the ☆ on any game to favorite it." });

  // ALL GAMES
  const crownId = topGameId(games);
  const rest = filtered.filter(g => !news.includes(g));
  section("🎮 All Games", rest, {
    crown: false,
    empty: 'No games yet — click <b>＋ Add Game</b> to add your first one!'
  });
  if (crownId){
    // mark crown on the card in the grid
    const card = library.querySelector(`.card[data-id="${crownId}"]`);
    if (card && !card.querySelector(".badge-crown")){
      const b = document.createElement("span");
      b.className = "badge-crown"; b.textContent = "👑 #1";
      card.insertBefore(b, card.firstChild);
    }
  }

  // streak badge
  $("streakBadge").textContent = "🔥 " + streak.count;
}

function topGameId(games){
  let best = null, bestT = 0;
  for (const g of games){
    const t = playtime[g.id] || 0;
    if (t > bestT){ bestT = t; best = g.id; }
  }
  return best;
}

searchEl.addEventListener("input", render);

/* ---------- player + playtime tracking ---------- */
let currentGame = null, sessionStart = 0, tick = null;
function openGame(g){
  currentGame = g; sessionStart = Date.now();
  lastPlayed[g.id] = Date.now(); store.set("lp", lastPlayed);
  $("playerName").textContent = g.name;
  $("playerFrame").src = g.url;
  $("player").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  clearInterval(tick);
  tick = setInterval(() => {
    $("playerClock").textContent = fmtTime((playtime[g.id]||0) + (Date.now()-sessionStart)/1000);
  }, 1000);
  render();
}
function finalizeSession(){
  if (!currentGame) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  if (elapsed > 0){
    playtime[currentGame.id] = (playtime[currentGame.id] || 0) + elapsed;
    store.set("pt", playtime);
  }
  sessionStart = Date.now();
}
function closePlayer(){
  finalizeSession();
  clearInterval(tick);
  $("playerFrame").src = "about:blank";
  $("player").classList.add("hidden");
  document.body.style.overflow = "";
  currentGame = null;
  render();
}
$("closeBtn").onclick = closePlayer;
$("fsBtn").onclick = () => {
  const p = $("player");
  document.fullscreenElement ? document.exitFullscreen() : p.requestFullscreen();
};
$("tabBtn").onclick = () => { if (currentGame) window.open(currentGame.url, "_blank"); };
addEventListener("beforeunload", finalizeSession);
document.addEventListener("visibilitychange", () => { if (document.hidden) finalizeSession(); });

/* ---------- random ---------- */
$("randomBtn").onclick = () => {
  const games = allGames();
  if (!games.length) return alert("Add a game first!");
  openGame(games[Math.floor(Math.random() * games.length)]);
};

/* ---------- add game ---------- */
$("addBtn").onclick = () => $("addModal").classList.remove("hidden");
$("saveGame").onclick = () => {
  const name = $("gName").value.trim();
  const url  = $("gUrl").value.trim();
  const icon = $("gIcon").value.trim();
  const tag  = $("gTag").value.trim();
  if (!name) return alert("Give the game a name.");
  if (!url)  return alert("Give the game a URL.");
  customGames.push({ id: uid(), name, url, icon, tag: tag || "Custom", addedAt: Date.now() });
  store.set("custom", customGames);
  ["gName","gUrl","gIcon","gTag"].forEach(i => $(i).value = "");
  $("addModal").classList.add("hidden");
  render();
};

/* ---------- stats ---------- */
$("statsBtn").onclick = () => {
  const games = allGames();
  const total = Object.values(playtime).reduce((a,b) => a+b, 0);
  const topId = topGameId(games);
  const top = games.find(g => g.id === topId);
  const sorted = [...games].sort((a,b) => (playtime[b.id]||0) - (playtime[a.id]||0)).slice(0, 8);
  const max = Math.max(1, ...sorted.map(g => playtime[g.id] || 0));

  $("statsBody").innerHTML = `
    <div class="stat-hero">
      <div class="stat-box"><div class="num">${fmtTime(total)}</div><div class="lbl">Total playtime</div></div>
      <div class="stat-box"><div class="num">${games.length}</div><div class="lbl">Games</div></div>
      <div class="stat-box"><div class="num">🔥 ${streak.count}</div><div class="lbl">Day streak</div></div>
    </div>
    ${top ? `<div class="stat-box" style="margin-bottom:14px">
        <div class="num">👑 ${top.name}</div>
        <div class="lbl">#1 most played — ${fmtTime(playtime[top.id])}</div></div>` :
        `<div class="stat-box" style="margin-bottom:14px"><div class="num">👑 —</div>
        <div class="lbl">Play a game to crown your #1!</div></div>`}
    <div class="setting-label">MOST PLAYED</div>
    ${sorted.length ? sorted.map(g => `
      <div class="bar-row">
        <div class="bar-name">${g.id === topId ? "👑 " : ""}${g.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${((playtime[g.id]||0)/max*100).toFixed(1)}%"></div></div>
        <div class="bar-time">${fmtTime(playtime[g.id]||0)}</div>
      </div>`).join("") : '<p class="muted">No playtime yet.</p>'}
  `;
  $("statsModal").classList.remove("hidden");
};

/* ---------- settings ---------- */
$("settingsBtn").onclick = () => $("settingsModal").classList.remove("hidden");
$("saveSettings").onclick = () => {
  store.set("accent", accent);
  fxOn = $("fxToggle").checked;
  store.set("fx", fxOn);
  document.body.classList.toggle("nofx", !fxOn);
  $("settingsModal").classList.add("hidden");
};
$("resetBtn").onclick = () => {
  if (confirm("Reset ALL Slaorus Mini data (games, playtime, favorites, streak)?")){
    Object.keys(localStorage).filter(k => k.startsWith("slaorus_")).forEach(k => localStorage.removeItem(k));
    location.reload();
  }
};
// build accent swatches
ACCENTS.forEach(c => {
  const s = document.createElement("div");
  s.className = "swatch" + (c === accent ? " sel" : "");
  s.style.background = c; s.style.color = c; s.title = c;
  s.onclick = () => {
    applyAccent(c);
    document.querySelectorAll(".swatch").forEach(x => x.classList.remove("sel"));
    s.classList.add("sel");
  };
  $("accentRow").appendChild(s);
});

/* ---------- modal close ---------- */
document.querySelectorAll(".closeModal").forEach(b =>
  b.onclick = e => e.target.closest(".modal").classList.add("hidden"));
document.querySelectorAll(".modal").forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));
addEventListener("keydown", e => {
  if (e.key === "Escape"){
    document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
    if (!$("player").classList.contains("hidden")) closePlayer();
  }
});

/* ---------- boot ---------- */
applyAccent(accent);
document.body.classList.toggle("nofx", !fxOn);
$("fxToggle").checked = fxOn;
render();
