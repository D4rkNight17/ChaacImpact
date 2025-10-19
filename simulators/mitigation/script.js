/* ================== SIMULADOR NEO EARTH-CENTERED - OPTIMIZADO ================== */

/* -------------------- SISTEMA DE TRADUCCIÓN -------------------- */
const translations = {
  es: {
    // Mensajes generales
    noAsteroidSelected: "Primero selecciona un asteroide",
    loadingData: "Cargando datos del asteroide...",
    searchInProgress: "Buscando en NASA NEOs...",
    noResults: "No se encontraron resultados. Intenta: Apophis, 433, Bennu",
    errorFetchingNASA: "Error al consultar NASA",
    impactAlert: "🚨 ALERTA DE IMPACTO INMINENTE",
    imminentImpact: "Tiempo disponible: <strong>{days} días</strong><br>Calcula estrategias y aplica una deflexión",
    gameStartLog: "🎮 Modo juego iniciado: {days} días para evitar impacto",
    simulationCompleted: "Simulación completada",
    gameReset: "🔄 Juego reseteado",
    impactDetected: "⚠️ IMPACTO: {distance} ({radii} R⊕)",
    missionSuccessTitle: "🎉 ¡MISIÓN EXITOSA!",
    missionFailTitle: "💥 GAME OVER",
    missionSuccessSubtitle: "Has salvado la Tierra",
    missionFailSubtitle: "IMPACTO DIRECTO",
    missionFailWarning: "Necesitas > 2 R⊕ para tener éxito",
    missionRetry: "Reintentar",
    missionNew: "Nueva Misión",
    // UI
    play: "▶️ Play",
    pause: "⏸️ Pause",
    reset: "🔄 Reset",
    distanceLabel: "Distancia actual:",
    minLabel: "Mín:",
    waiting: "Esperando asteroide...",
    none: "Ninguno",
    noResultsSummary: "Sin resultados",
    resultsLabel: "{n} estrategias • Δv requerido (estim.): {dv}",
    kineticImpact: "Impacto Cinético",
    gravitationalTractor: "Tractor Gravitacional",
    laserAblation: "Ablación Láser",
    ionBeam: "Haz de Iones",
    nuclearExplosion: "Explosión Nuclear",
    // Tutorial
    tutWelcomeTitle: "¡Bienvenido, defensor planetario!",
    tutWelcomeContent: "Soy Chaac, tu guía en esta misión. Esta es la Calculadora de Mitigación de Asteroides NEO, donde aprenderás a salvar la Tierra de impactos cósmicos.",
    tutSearchTitle: "Busca asteroides reales",
    tutSearchContent: "Aquí puedes buscar asteroides del catálogo de la NASA. Prueba con nombres famosos como \"Apophis\", \"Bennu\", o simplemente un número como \"433\".",
    tutSelectTitle: "Selecciona tu objetivo",
    tutSelectContent: "Los resultados aparecerán aquí. Haz doble clic en cualquier asteroide para cargarlo, o usa el botón \"Cargar Detalle\" debajo.",
    tutInfoTitle: "Conoce a tu enemigo",
    tutInfoContent: "Aquí verás toda la información del asteroide: diámetro, masa, velocidad y parámetros orbitales. ¡Datos cruciales para planear tu defensa!",
    tut3DTitle: "Visualización 3D en tiempo real",
    tut3DContent: "Este es tu centro de comando. Verás las órbitas del asteroide (línea azul punteada) y la Tierra. Usa el ratón para rotar, hacer zoom y explorar el espacio.",
    tutMissionTitle: "Configura tu misión",
    tutMissionContent: "Define cuántos años de anticipación tienes. Más tiempo = más opciones de deflexión. Luego haz clic en \"Calcular Estrategias\".",
    tutStrategiesTitle: "Estrategias de mitigación",
    tutStrategiesContent: "Aquí aparecerán 5 estrategias diferentes: Impacto Cinético, Tractor Gravitacional, Ablación Láser, Haz de Iones y Explosión Nuclear. ¡Cada una con su efectividad!",
    tutGameTitle: "Modo Defensa Planetaria",
    tutGameContent: "¿Listo para el desafío? Este modo simula un asteroide en curso de colisión. Tienes tiempo limitado para aplicar una estrategia y salvarnos a todos. ¡Buena suerte, defensor!",
  },
  en: {
    noAsteroidSelected: "Select an asteroid first",
    loadingData: "Loading asteroid data...",
    searchInProgress: "Searching NASA NEOs...",
    noResults: "No results found. Try: Apophis, 433, Bennu",
    errorFetchingNASA: "Error fetching NASA data",
    impactAlert: "🚨 IMMINENT IMPACT ALERT",
    imminentImpact: "Available time: <strong>{days} days</strong><br>Compute strategies and apply a deflection",
    gameStartLog: "🎮 Game mode started: {days} days to avoid impact",
    simulationCompleted: "Simulation completed",
    gameReset: "🔄 Game reset",
    impactDetected: "⚠️ IMPACT: {distance} ({radii} R⊕)",
    missionSuccessTitle: "🎉 MISSION SUCCESS!",
    missionFailTitle: "💥 GAME OVER",
    missionSuccessSubtitle: "You saved Earth",
    missionFailSubtitle: "DIRECT IMPACT",
    missionFailWarning: "You need > 2 R⊕ to succeed",
    missionRetry: "Retry",
    missionNew: "New Mission",
    play: "▶️ Play",
    pause: "⏸️ Pause",
    reset: "🔄 Reset",
    distanceLabel: "Current distance:",
    minLabel: "Min:",
    waiting: "Waiting for asteroid...",
    none: "None",
    noResultsSummary: "No results",
    resultsLabel: "{n} strategies • Required Δv (est.): {dv}",
    kineticImpact: "Kinetic Impact",
    gravitationalTractor: "Gravitational Tractor",
    laserAblation: "Laser Ablation",
    ionBeam: "Ion Beam",
    nuclearExplosion: "Nuclear Explosion",
    tutWelcomeTitle: "Welcome, planetary defender!",
    tutWelcomeContent: "I'm Chaac, your mission guide. This is the NEO Asteroid Mitigation Calculator, where you'll learn how to save Earth from cosmic impacts.",
    tutSearchTitle: "Search real asteroids",
    tutSearchContent: "Here you can search asteroids from NASA's catalog. Try names like \"Apophis\", \"Bennu\", or a number like \"433\".",
    tutSelectTitle: "Select your target",
    tutSelectContent: "Results appear here. Double-click any asteroid to load it or use the 'Load Detail' button below.",
    tutInfoTitle: "Know your enemy",
    tutInfoContent: "Here you will see all asteroid data: diameter, mass, velocity and orbital parameters. Essential info for mission planning!",
    tut3DTitle: "3D visualization in real time",
    tut3DContent: "This is your command center. You’ll see asteroid (blue dashed line) and Earth orbits. Use the mouse to rotate, zoom and explore space.",
    tutMissionTitle: "Set your mission",
    tutMissionContent: "Define how many years of warning you have. More time = more deflection options. Then click 'Calculate Strategies'.",
    tutStrategiesTitle: "Mitigation strategies",
    tutStrategiesContent: "Here you’ll find 5 different strategies: Kinetic Impact, Gravitational Tractor, Laser Ablation, Ion Beam and Nuclear Explosion.",
    tutGameTitle: "Planetary Defense Mode",
    tutGameContent: "Ready for the challenge? This mode simulates an asteroid on collision course. You have limited time to apply a strategy and save us all. Good luck, defender!",
  }
};

function t(key, vars = {}) {
  const lang = localStorage.getItem("lang") || "es";
  let text = translations[lang][key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replace(`{${k}}`, v);
  });
  return text;
}

/* -------------------- CONSTANTES -------------------- */
const AU = 1.495978707e11;
const MU_SUN = 1.32712440018e20;
const NASA_API_KEY = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B";
const NASA_BASE = "https://api.nasa.gov/neo/rest/v1";
const EARTH_RADIUS = 6.371e6;
const EARTH_RADIUS_KM = 6371;
const EARTH_ROTATION_PERIOD = 86400; // 24 horas en segundos
const MOON_ORBITAL_PERIOD = 27.3 * 86400; // 27.3 días
const MOON_DISTANCE = 384400; // km desde la Tierra

const SCALE_OPTIONS = {
  "1k": { km: 1e3, label: "1,000 km/unidad" },
  "10k": { km: 1e4, label: "10,000 km/unidad" },
  "100k": { km: 1e5, label: "100,000 km/unidad" },
  "1M": { km: 1e6, label: "1,000,000 km/unidad (1 Mkm)" },
  "10M": { km: 1e7, label: "10,000,000 km/unidad (10 Mkm)" },
};

// ...continúa con materialProperties, earthOrbit y demás tal cual tu versión original

/* -------------------- PROPIEDADES MATERIALES -------------------- */
const materialProperties = {
  "rocoso": { density: 3000, color: 0x999999 },
  "carbonáceo": { density: 2200, color: 0x555555 },
  "metálico": { density: 7800, color: 0xbbbbbb },
};

/* -------------------- ÓRBITA DE LA TIERRA -------------------- */
const earthOrbit = {
  a: 1 * AU,
  e: 0.0167,
  i: 0,
  Ω: 0,
  ω: 0,
  M0: 0,
};

/* -------------------- UTILIDADES -------------------- */
function formatNumber(num) {
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDistance(km) {
  return `${formatNumber(km)} km`;
}

function logMessage(msg) {
  console.log(`[ChaacImpact] ${msg}`);
}

/* -------------------- FUNCIÓN NASA FETCH -------------------- */
async function fetchFromNASA(query) {
  const lang = localStorage.getItem("lang") || "es";
  try {
    logMessage(t("searchInProgress"));
    const res = await fetch(`${NASA_BASE}/neo/browse?api_key=${NASA_API_KEY}`);
    if (!res.ok) throw new Error(t("errorFetchingNASA"));
    const data = await res.json();

    const filtered = data.near_earth_objects.filter(neo =>
      neo.name.toLowerCase().includes(query.toLowerCase()) ||
      neo.id.includes(query)
    );

    if (filtered.length === 0) {
      alert(t("noResults"));
      return [];
    }

    logMessage(`${filtered.length} NEOs encontrados`);
    return filtered;
  } catch (err) {
    alert(`${t("errorFetchingNASA")}: ${err.message}`);
    return [];
  }
}

/* -------------------- RENDERIZADO 3D -------------------- */
let scene, camera, renderer, controls;
let asteroidMesh, earthMesh, orbitLines = [];

function initScene() {
  const container = document.getElementById("canvas3d");
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1e9);
  renderer = new THREE.WebGLRenderer({ canvas: container, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  camera.position.set(0, 0, 10 * EARTH_RADIUS);
  controls.update();

  const light = new THREE.PointLight(0xffffff, 1);
  light.position.set(0, 0, 0);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);

  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({ color: 0x0077ff });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earthMesh);
  logMessage("Escena 3D inicializada");
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/* -------------------- BÚSQUEDA Y CARGA DE ASTEROIDES -------------------- */
async function searchAsteroid() {
  const query = document.getElementById("searchQuery").value.trim();
  if (!query) return alert(t("noAsteroidSelected"));
  const results = await fetchFromNASA(query);

  const neoSelect = document.getElementById("neoSelect");
  neoSelect.innerHTML = "";
  results.forEach(neo => {
    const opt = document.createElement("option");
    opt.value = neo.id;
    opt.textContent = `${neo.name} (${formatNumber(neo.estimated_diameter.kilometers.estimated_diameter_max)} km)`;
    neoSelect.appendChild(opt);
  });
}

async function loadAsteroidDetail() {
  const select = document.getElementById("neoSelect");
  if (select.selectedIndex === -1) return alert(t("noAsteroidSelected"));
  const id = select.value;
  const res = await fetch(`${NASA_BASE}/neo/${id}?api_key=${NASA_API_KEY}`);
  const data = await res.json();
  displayAsteroidInfo(data);
  renderAsteroid(data);
}

function displayAsteroidInfo(data) {
  const container = document.getElementById("asteroidDetails");
  container.innerHTML = `
    <strong>${data.name}</strong><br>
    ${t("distanceLabel")} ${formatDistance(parseFloat(data.close_approach_data[0]?.miss_distance.kilometers || 0))}<br>
    ${t("minLabel")} ${formatDistance(parseFloat(data.estimated_diameter.kilometers.estimated_diameter_min))} - ${formatDistance(parseFloat(data.estimated_diameter.kilometers.estimated_diameter_max))}
  `;
}

/* -------------------- RENDER DEL ASTEROIDE -------------------- */
function renderAsteroid(data) {
  if (asteroidMesh) scene.remove(asteroidMesh);
  const size = data.estimated_diameter.kilometers.estimated_diameter_max * 1000;
  const geom = new THREE.SphereGeometry(size / 2, 32, 32);
  const mat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
  asteroidMesh = new THREE.Mesh(geom, mat);
  asteroidMesh.position.set(5 * EARTH_RADIUS, 0, 0);
  scene.add(asteroidMesh);
  logMessage(`${t("loadingData")}: ${data.name}`);
}

/* -------------------- EVENTOS -------------------- */
document.getElementById("searchBtn").addEventListener("click", searchAsteroid);
document.getElementById("loadDetailBtn").addEventListener("click", loadAsteroidDetail);
document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("searchQuery").value = "";
  document.getElementById("neoSelect").innerHTML = "";
  document.getElementById("asteroidDetails").innerHTML = `<em>${t("none")}</em>`;
});

/* -------------------- INICIALIZACIÓN -------------------- */
window.addEventListener("DOMContentLoaded", () => {
  initScene();
  animate();
});

/* -------------------- CONTROL DE SIMULACIÓN -------------------- */
let isPaused = false;
let simInterval = null;

function togglePlayPause() {
  const btn = document.getElementById("playPauseBtn");
  if (isPaused) {
    isPaused = false;
    btn.textContent = t("pause");
    startSimulation();
  } else {
    isPaused = true;
    btn.textContent = t("play");
    stopSimulation();
  }
}

function startSimulation() {
  if (simInterval) clearInterval(simInterval);
  simInterval = setInterval(() => updateSimulation(), 100);
}

function stopSimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

/* -------------------- ACTUALIZACIÓN DE SIMULACIÓN -------------------- */
let currentDistance = 0;
let minDistance = Infinity;

function updateSimulation() {
  if (!asteroidMesh || isPaused) return;

  // Movimiento simplificado de órbita
  const time = Date.now() * 0.00005;
  asteroidMesh.position.x = Math.cos(time) * 5 * EARTH_RADIUS;
  asteroidMesh.position.y = Math.sin(time) * 5 * EARTH_RADIUS;

  const distance = asteroidMesh.position.length() - EARTH_RADIUS;
  currentDistance = distance / 1000;
  if (distance < minDistance) minDistance = distance;

  const distEl = document.getElementById("currentDistance");
  const minEl = document.getElementById("minDistanceInfo");

  distEl.innerHTML = `<strong>${t("distanceLabel")}</strong> ${formatDistance(currentDistance)}`;
  minEl.innerHTML = `<strong>${t("minLabel")}</strong> ${formatDistance(minDistance / 1000)}`;
}

/* -------------------- REINICIO DE SIMULACIÓN -------------------- */
function resetSimulation() {
  stopSimulation();
  minDistance = Infinity;
  currentDistance = 0;
  if (asteroidMesh) {
    asteroidMesh.position.set(5 * EARTH_RADIUS, 0, 0);
  }
  document.getElementById("currentDistance").innerHTML = `<strong>${t("distanceLabel")}</strong> ${t("waiting")}`;
  document.getElementById("minDistanceInfo").innerHTML = `<strong>${t("minLabel")}</strong> N/A`;
  alert(t("gameReset"));
}

/* -------------------- BOTONES PRINCIPALES -------------------- */
document.getElementById("playPauseBtn").addEventListener("click", togglePlayPause);
document.getElementById("resetSimBtn").addEventListener("click", resetSimulation);

/* -------------------- CÁLCULOS DE ESTRATEGIAS -------------------- */
function calculateStrategies() {
  const summary = document.getElementById("resultsSummary");
  summary.textContent = t("calculating");

  // Simulación de cálculo aleatorio
  setTimeout(() => {
    const deltaV = (Math.random() * 5 + 1).toFixed(2);
    const strategies = [
      t("kineticImpact"),
      t("gravitationalTractor"),
      t("laserAblation"),
      t("ionBeam"),
      t("nuclearExplosion"),
    ];

    const grid = document.getElementById("resultsGrid");
    grid.innerHTML = "";
    strategies.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "result-card";
      div.innerHTML = `
        <h3>${s}</h3>
        <p>${t("resultsLabel", { n: i + 1, dv: deltaV })}</p>
      `;
      grid.appendChild(div);
    });

    summary.textContent = `${t("resultsLabel", { n: 5, dv: deltaV })}`;
  }, 1500);
}

document.getElementById("calcBtn").addEventListener("click", calculateStrategies);

/* -------------------- PANEL DE INFORMACIÓN -------------------- */
function showInfoPanel(type) {
  const panel = document.getElementById("infoPanel");
  const overlay = document.getElementById("infoPanelOverlay");
  const title = document.getElementById("infoPanelTitle");
  const text = document.getElementById("infoPanelText");

  const lang = localStorage.getItem("lang") || "es";
  const infoTexts = {
    game: {
      es: "El modo de defensa planetaria simula un impacto inminente. Ajusta los días hasta el impacto y aplica estrategias para evitarlo.",
      en: "Planetary defense mode simulates an imminent impact. Adjust the days to impact and apply strategies to avoid it.",
    },
    days: {
      es: "Cantidad de días restantes hasta el impacto. Valores más altos dan más tiempo de preparación.",
      en: "Number of days remaining until impact. Higher values mean more preparation time.",
    },
    mission: {
      es: "Configura los parámetros de tu misión: tiempo de advertencia y cálculo de estrategias de mitigación.",
      en: "Set your mission parameters: warning time and mitigation strategy calculation.",
    },
    warning: {
      es: "Tiempo que transcurre entre la detección del asteroide y el posible impacto.",
      en: "Time between asteroid detection and possible impact.",
    },
    calculate: {
      es: "Inicia el cálculo de estrategias de mitigación disponibles según el tiempo de advertencia.",
      en: "Start calculating available mitigation strategies based on warning time.",
    },
    rendering: {
      es: "Controla la resolución del renderizado 3D: más segmentos y muestras = mayor calidad visual.",
      en: "Control the 3D render resolution: more segments and samples = better visual quality.",
    },
    segments: {
      es: "Cantidad de segmentos para modelar las órbitas.",
      en: "Number of segments used to model the orbits.",
    },
    samples: {
      es: "Cantidad de muestras o pasos para calcular la órbita completa.",
      en: "Number of samples or steps for complete orbit calculation.",
    },
  };

  title.textContent = type.toUpperCase();
  text.textContent = infoTexts[type][lang];
  panel.style.display = "block";
  overlay.style.display = "block";
}

function closeInfoPanel() {
  document.getElementById("infoPanel").style.display = "none";
  document.getElementById("infoPanelOverlay").style.display = "none";
}

/* -------------------- MODO DEFENSA PLANETARIA -------------------- */
function startGameMode() {
  const days = parseInt(document.getElementById("gameDaysInput").value);
  alert(`${t("impactAlert")}\n\n${t("imminentImpact", { days })}`);
  logMessage(t("gameStartLog", { days }));
  resetSimulation();
  startSimulation();
}

document.getElementById("startGameBtn").addEventListener("click", startGameMode);

/* -------------------- TUTORIAL CHAAC -------------------- */
const tutorialSteps = [
  { icon: "⚡", title: "tutWelcomeTitle", content: "tutWelcomeContent" },
  { icon: "🔍", title: "tutSearchTitle", content: "tutSearchContent" },
  { icon: "📋", title: "tutSelectTitle", content: "tutSelectContent" },
  { icon: "📊", title: "tutInfoTitle", content: "tutInfoContent" },
  { icon: "🌌", title: "tut3DTitle", content: "tut3DContent" },
  { icon: "🎯", title: "tutMissionTitle", content: "tutMissionContent" },
  { icon: "🛡️", title: "tutStrategiesTitle", content: "tutStrategiesContent" },
  { icon: "🚨", title: "tutGameTitle", content: "tutGameContent" },
];

let currentStep = 0;
const dialog = document.getElementById("tutorialDialog");
const icon = document.getElementById("tutorialIcon");
const title = document.getElementById("tutorialTitleText");
const content = document.getElementById("tutorialContentText");
const progress = document.getElementById("tutorialProgress");

function showTutorialStep(step) {
  const s = tutorialSteps[step];
  icon.textContent = s.icon;
  title.textContent = t(s.title);
  content.textContent = t(s.content);
  progress.textContent = `${step + 1} / ${tutorialSteps.length}`;
  dialog.style.display = "block";
}

function nextStep() {
  currentStep++;
  if (currentStep < tutorialSteps.length) {
    showTutorialStep(currentStep);
  } else {
    endTutorial();
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    showTutorialStep(currentStep);
  }
}

function skipTutorial() {
  endTutorial();
}

function restartTutorial() {
  currentStep = 0;
  showTutorialStep(currentStep);
}

function endTutorial() {
  dialog.style.display = "none";
  document.getElementById("tutorialCharacter").style.display = "none";
}

document.getElementById("tutorialNext").addEventListener("click", nextStep);
document.getElementById("tutorialPrev").addEventListener("click", prevStep);
document.getElementById("tutorialSkip").addEventListener("click", skipTutorial);

/* -------------------- INICIALIZACIÓN DEL TUTORIAL -------------------- */
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tutorialCharacter").style.display = "block";
  restartTutorial();
});

/* -------------------- FINALIZACIÓN Y LOGS -------------------- */
window.addEventListener("beforeunload", () => {
  logMessage(t("simulationCompleted"));
});

/* -------------------- INFORME FINAL DE MISIÓN -------------------- */
function missionResult(success, distance) {
  const overlay = document.createElement("div");
  overlay.className = "mission-overlay";
  overlay.innerHTML = `
    <div class="mission-dialog">
      <h2>${success ? t("missionSuccessTitle") : t("missionFailTitle")}</h2>
      <p>${success ? t("missionSuccessSubtitle") : t("missionFailSubtitle")}</p>
      <p>${t("impactDetected", {
        distance: formatDistance(distance / 1000),
        radii: (distance / EARTH_RADIUS).toFixed(2),
      })}</p>
      <p>${!success ? t("missionFailWarning") : ""}</p>
      <div class="mission-buttons">
        <button onclick="resetSimulation()">${t("missionRetry")}</button>
        <button onclick="window.location.reload()">${t("missionNew")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* -------------------- DETECCIÓN DE IMPACTO (SIMULADA) -------------------- */
setInterval(() => {
  if (asteroidMesh && !isPaused) {
    const distance = asteroidMesh.position.length() - EARTH_RADIUS;
    if (distance < EARTH_RADIUS * 2.0) {
      stopSimulation();
      const success = distance > EARTH_RADIUS * 1.5;
      missionResult(success, distance);
    }
  }
}, 2000);

/* -------------------- MENSAJE DE ARRANQUE -------------------- */
logMessage("🌐 ChaacImpact listo y bilingüe — sistema de traducción activo");
