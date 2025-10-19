// ==========================================================
// 🌎 ChaacImpact — Simulador Ficticio con Parámetros Manuales (Bilingüe + Animación Real)
// ==========================================================

// === Traducciones dinámicas ===
const LANG_TEXTS = {
  es: {
    impactPoint: "Punto de impacto",
    simulateBtn: "Simular impacto",
    legendOrange: "Zona de impacto (cráter y fuego)",
    legendBlue: "Onda expansiva atmosférica",
    modalLocal: "🟢 Impacto Local — Nivel Verde",
    modalContinental: "🟠 Impacto Continental — Nivel Naranja",
    modalGlobal: "🔴 Impacto Global — Nivel Rojo",
    modalLocalDesc: "Daños severos en un radio de decenas de kilómetros.",
    modalContinentalDesc: "Destrucción continental. Incendios globales y alteración climática.",
    modalGlobalDesc: "Extinción masiva global. Oscurecimiento atmosférico y fusión superficial terrestre.",
    loading: "Cargando terreno...",
    selectPoint: "Selecciona un punto del mapa.",
  },
  en: {
    impactPoint: "Impact point",
    simulateBtn: "Simulate impact",
    legendOrange: "Impact zone (crater & fire)",
    legendBlue: "Atmospheric shockwave",
    modalLocal: "🟢 Local Impact — Green Level",
    modalContinental: "🟠 Continental Impact — Orange Level",
    modalGlobal: "🔴 Global Impact — Red Level",
    modalLocalDesc: "Severe damage within tens of kilometers.",
    modalContinentalDesc: "Continental destruction. Global fires and climate alteration.",
    modalGlobalDesc: "Mass extinction event. Global darkness and surface melting.",
    loading: "Loading terrain...",
    selectPoint: "Select a point on the map.",
  },
};

let currentLang = localStorage.getItem("lang") || "es";
let viewer;
let selectedCoords = null;

// ==========================================================
// ⚙️ INICIALIZACIÓN CESIUM
// ==========================================================
async function inicializarCesium() {
  const container = document.getElementById("cesiumContainer");
  if (!container) return;

  if (viewer && !viewer.isDestroyed()) viewer.destroy();

  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NmY5ZDA2Yi0zMzliLTRkOTEtYTYyYS05YTQ0NjQxYzMxNmMiLCJpZCI6MzQ4MzgxLCJpYXQiOjE3NTk5MzI3NDB9.RAB3s6EwdShkIYv8LKHz7SjfB_THmMtcmIvwDC_g3IA";

  viewer = new Cesium.Viewer("cesiumContainer", {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
  });

  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.skyAtmosphere.brightnessShift = 0.5;
  viewer.scene.skyAtmosphere.hueShift = 0.05;
  viewer.scene.skyAtmosphere.saturationShift = 0.2;

  const simulateBtn = document.getElementById("simulateBtn");
  simulateBtn.disabled = true;
  simulateBtn.textContent = LANG_TEXTS[currentLang].loading;

  try {
    await viewer.scene.globe.readyPromise;
    await viewer.terrainProvider.readyPromise;
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  } catch (err) {
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  }

  // === Selección de punto de impacto ===
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((e) => {
    const cartesian = viewer.scene.pickPosition(e.position);
    if (!cartesian) return;
    const c = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const lat = Cesium.Math.toDegrees(c.latitude);
    selectedCoords = { lon, lat };

    viewer.entities.removeAll();
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 14,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
      },
      label: {
        text: LANG_TEXTS[currentLang].impactPoint,
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
      },
    });
    document.getElementById("coords").innerText = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
window.addEventListener("DOMContentLoaded", () => setTimeout(inicializarCesium, 200));

// ==========================================================
// 🎚️ ACTUALIZACIÓN DE SLIDERS EN TIEMPO REAL
// ==========================================================
const diamRange = document.getElementById("diamRange");
const velRange = document.getElementById("velRange");
const densRange = document.getElementById("densRange");
const valDiam = document.getElementById("valDiam");
const valVel = document.getElementById("valVel");
const valDens = document.getElementById("valDens");

if (diamRange && valDiam) {
  diamRange.max = 30000;
  diamRange.addEventListener("input", () => (valDiam.textContent = diamRange.value));
}
if (velRange && valVel) {
  velRange.max = 50;
  velRange.addEventListener("input", () => (valVel.textContent = velRange.value));
}
if (densRange && valDens) {
  densRange.max = 6000;
  densRange.addEventListener("input", () => (valDens.textContent = densRange.value));
}

// ==========================================================
// 🍔 BURGER
// ==========================================================
document.getElementById("burgerBtn").addEventListener("click", () => {
  document.getElementById("panel").classList.toggle("hidden");
});

// ==========================================================
// 🧮 FUNCIONES FÍSICAS
// ==========================================================
const g = 9.81,
  mu = 0.22,
  nu = 0.33,
  Cg = 1.6,
  k_c = 1.3,
  k_e = 3.0;

function densidadTerrenoPorAltura(altura, lat) {
  if (Math.abs(lat) >= 66.5) {
    if (altura <= 100) return { rho_t: 900, tipo: "Región polar / hielo marino" };
    return { rho_t: 1500, tipo: "Región polar / capa de hielo" };
  }
  if (altura <= 20) return { rho_t: 1000, tipo: "Océano" };
  if (altura <= 500) return { rho_t: 1800, tipo: "Zona costera / sedimentos" };
  if (altura <= 1500) return { rho_t: 2300, tipo: "Continente rocoso" };
  return { rho_t: 2700, tipo: "Montaña" };
}

function masaImpactor(d, rho_i) {
  const r = d / 2;
  return (4 / 3) * Math.PI * r ** 3 * rho_i;
}

function energiaImpacto(masa, v_km_s) {
  const v = v_km_s * 1000;
  const E = 0.5 * masa * v ** 2;
  const E_Mt = E / 4.184e15;
  return { E, E_Mt };
}

function craterYEyecta(d, v_km_s, rho_i, rho_t, ang) {
  const theta = (ang * Math.PI) / 180;
  const v_eff = v_km_s * Math.max(Math.sin(theta), 0.2);
  const D_t = Cg * g ** -mu * (rho_i / rho_t) ** nu * d ** (1 - mu) * (v_eff * 1000) ** (2 * mu);
  const D_f = k_c * D_t;
  const R_e = k_e * (D_f / 2);
  return { D_f, R_e };
}

// ==========================================================
// 🚀 SIMULAR IMPACTO
// ==========================================================
document.getElementById("simulateBtn").onclick = async () => {
  if (!selectedCoords) return alert(LANG_TEXTS[currentLang].selectPoint);

  const diam = parseFloat(diamRange.value);
  const vel = parseFloat(velRange.value);
  const densidad = parseFloat(densRange.value);
  const angulo = 45;

  const carto = Cesium.Cartographic.fromDegrees(selectedCoords.lon, selectedCoords.lat);
  const [sample] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
  const altura = sample?.height ?? 0;

  const { rho_t, tipo } = densidadTerrenoPorAltura(altura, selectedCoords.lat);
  const masa = masaImpactor(diam, densidad);
  const { E, E_Mt } = energiaImpacto(masa, vel);
  const { D_f, R_e } = craterYEyecta(diam, vel, densidad, rho_t, angulo);

  generarInformeDesastres(E_Mt, D_f, tipo);
  animarImpacto(selectedCoords, D_f, E_Mt);
};

// ==========================================================
// 🌠 ANIMACIÓN ORIGINAL COMPLETA
// ==========================================================
function animarImpacto(coords, D_f_m, E_Mt) {
  const startHeight = 8000000;
  const impactPos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);
  const asteroid = viewer.entities.add({
    name: "asteroid",
    position: Cesium.Cartesian3.fromDegrees(coords.lon - 5, coords.lat + 3, startHeight),
    billboard: {
      image: crearTexturaFuego(),
      scale: 0.7,
      color: Cesium.Color.ORANGE.withAlpha(0.95),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const duration = 4000;
  const start = performance.now();
  const trailParticles = [];

  function anim(now) {
    const t = Math.min((now - start) / duration, 1);
    const lon = coords.lon - 5 * (1 - t);
    const lat = coords.lat + 3 * (1 - t);
    const height = startHeight * (1 - Math.pow(t, 1.1));
    const currentPos = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    asteroid.position = currentPos;

    if (Math.random() < 0.6) {
      const p = viewer.entities.add({
        position: currentPos,
        point: { pixelSize: 6, color: Cesium.Color.fromCssColorString("rgba(255,120,0,0.9)") },
      });
      trailParticles.push({ e: p, life: 1 });
    }

    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.life -= 0.05;
      if (p.life <= 0) {
        viewer.entities.remove(p.e);
        trailParticles.splice(i, 1);
      }
    }

    if (t < 1) requestAnimationFrame(anim);
    else {
      // 💥 Limpieza total de partículas y asteroide
      trailParticles.forEach(p => viewer.entities.remove(p.e));
      trailParticles.length = 0;
      viewer.entities.remove(asteroid);

      // 💥 Efectos de impacto
      shakePantalla(600);
      mostrarExplosion(impactPos, D_f_m, E_Mt);
    }

  }
  requestAnimationFrame(anim);
}

// ==========================================================
// 💥 EXPLOSIÓN CON ONDA ANIMADA (original)
// ==========================================================
function mostrarExplosion(impactPos, crater_m, E_Mt) {
  if (E_Mt >= 1e6) { flashAtmosferico(2000); shakePantalla(2000); }
  else { flashAtmosferico(800); }

  const ringSize = Math.max(5000, crater_m * 0.5);
  const maxCrater = crater_m * 2;
  const R_ref_m = 8000, E_ref_Mt = 10;
  const ondaTotal = R_ref_m * Math.cbrt(Math.max(E_Mt, 1e-6) / E_ref_Mt);

  const ring = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: ringSize,
      semiMinorAxis: ringSize,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      material: Cesium.Color.fromCssColorString("rgba(255,140,0,0.7)"),
    }
  });

  let size = ringSize;
  function expand() {
    size += maxCrater / 120;
    ring.ellipse.semiMajorAxis = size;
    ring.ellipse.semiMinorAxis = size;
    if (size < maxCrater) requestAnimationFrame(expand);
    else setTimeout(() => mostrarCrater(impactPos, crater_m), 800);
  }
  setTimeout(expand, 1000);

  generarOndaAtmosferica(impactPos, ondaTotal);
  mostrarLeyendaImpacto();
}

function generarOndaAtmosferica(pos, radioFinal) {
  let radio = 10000;
  const duracion = 3000;
  const inicio = performance.now();

  const wave = viewer.entities.add({
    position: pos,
    ellipse: {
      semiMajorAxis: new Cesium.CallbackProperty(() => radio, false),
      semiMinorAxis: new Cesium.CallbackProperty(() => radio, false),
      material: Cesium.Color.fromCssColorString("rgba(0,157,255,0.35)"),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("rgba(0,157,255,0.6)"),
    },
  });

  function animar(now) {
    const t = Math.min((now - inicio) / duracion, 1);
    radio = Cesium.Math.lerp(10000, radioFinal, t);
    if (t < 1) requestAnimationFrame(animar);
    else viewer.entities.remove(wave);
  }
  requestAnimationFrame(animar);
}

// ==========================================================
// 🔥 EFECTOS VISUALES Y LEYENDA
// ==========================================================
function flashAtmosferico(duracion = 900) {
  const overlay = document.createElement("div");
  overlay.className = "flash-overlay";
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("on"));
  setTimeout(() => overlay.classList.remove("on"), duracion * 0.7);
  setTimeout(() => overlay.remove(), duracion + 300);
}

function shakePantalla(d = 600) {
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), d);
}

function crearTexturaFuego() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,200,1)");
  g.addColorStop(0.25, "rgba(255,200,100,0.95)");
  g.addColorStop(0.6, "rgba(255,100,0,0.8)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

function mostrarCrater(impactPos, crater_m) {
  viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: crater_m,
      semiMinorAxis: crater_m,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      material: Cesium.Color.fromCssColorString("rgba(255,140,0,0.25)"),
    },
  });
}

function mostrarLeyendaImpacto() {
  // Elimina la leyenda anterior si existe
  const old = document.querySelector(".impact-legend");
  if (old) old.remove();

  // Crea nueva leyenda
  const legend = document.createElement("div");
  legend.className = "impact-legend";
  legend.innerHTML = `
    <div><span class="legend-dot orange"></span> ${LANG_TEXTS[currentLang].legendOrange}</div>
    <div><span class="legend-dot blue"></span> ${LANG_TEXTS[currentLang].legendBlue}</div>
  `;
  document.body.appendChild(legend);

  // Aparece suave
  legend.style.opacity = "0";
  setTimeout(() => (legend.style.opacity = "1"), 100);

  // Desaparece luego de 7 s
  setTimeout(() => {
    legend.style.transition = "opacity 2s ease";
    legend.style.opacity = "0";
    setTimeout(() => legend.remove(), 2500);
  }, 7000);
}


// ==========================================================
// 🧾 INFORME
// ==========================================================
function generarInformeDesastres(E_Mt, D_f) {
  let titulo, descripcion;
  if (E_Mt < 1e3) {
    titulo = LANG_TEXTS[currentLang].modalLocal;
    descripcion = LANG_TEXTS[currentLang].modalLocalDesc;
  } else if (E_Mt < 1e6) {
    titulo = LANG_TEXTS[currentLang].modalContinental;
    descripcion = LANG_TEXTS[currentLang].modalContinentalDesc;
  } else {
    titulo = LANG_TEXTS[currentLang].modalGlobal;
    descripcion = LANG_TEXTS[currentLang].modalGlobalDesc;
  }

  document.getElementById("verInformeBtn").style.display = "block";
  document.getElementById("tituloInforme").innerText = titulo;
  document.getElementById("infoCrater").innerText = (D_f / 1000).toFixed(2) + " km";
  document.getElementById("infoEnergia").innerText = (E_Mt / 1000).toFixed(1) + " Gt TNT";
  document.getElementById("infoDescripcion").innerText = descripcion;
}

// Modal
const modal = document.getElementById("informeModal");
document.getElementById("verInformeBtn").onclick = () => (modal.style.display = "flex");
document.getElementById("cerrarInforme").onclick = () => (modal.style.display = "none");
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };


