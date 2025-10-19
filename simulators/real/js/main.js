// ==========================================================
// 🌎 ChaacImpact — Simulador 3D Realista SIN BACKEND (versión estable post-refresh)
// ==========================================================

// === Traducciones dinámicas ===
const LANG_TEXTS = {
  es: {
    searchLoading: "Buscando asteroides",
    searchError: "⚠️ Error al conectar con la NASA API.",
    noResults: "No se encontraron resultados.",
    selectBoth: "Selecciona un asteroide y un punto del mapa.",
    impactPoint: "Punto de impacto",
    localImpact: "Impacto local (daños regionales)",
    continentalImpact: "Impacto continental",
    globalImpact: "Impacto global catastrófico",
    legendOrange: "Zona de impacto (cráter y fuego)",
    legendBlue: "Onda expansiva atmosférica",
    simulateBtn: "Simular impacto",
    loadingTerrain: "Cargando terreno..."
  },
  en: {
    searchLoading: "Searching asteroids",
    searchError: "⚠️ Error connecting to NASA API.",
    noResults: "No results found.",
    selectBoth: "Select an asteroid and a point on the map.",
    impactPoint: "Impact point",
    localImpact: "Local impact (regional damage)",
    continentalImpact: "Continental impact",
    globalImpact: "Global catastrophic impact",
    legendOrange: "Impact zone (crater & fire)",
    legendBlue: "Atmospheric shockwave",
    simulateBtn: "Simulate impact",
    loadingTerrain: "Loading terrain..."
  }
};

let currentLang = localStorage.getItem("lang") || "es";

// === Variables globales ===
let viewer;
let selectedCoords = null;
let selectedAsteroid = null;
let ultimoInforme = null;

// ==========================================================
// ⚙️ INICIALIZACIÓN CESIUM — versión ultra estable
// ==========================================================
async function inicializarCesium() {
  const container = document.getElementById("cesiumContainer");
  if (!container) {
    console.error("❌ No se encontró el contenedor Cesium.");
    return;
  }

  // Si existe un viewer previo, lo destruimos
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }

  // Token de Cesium Ion
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NmY5ZDA2Yi0zMzliLTRkOTEtYTYyYS05YTQ0NjQxYzMxNmMiLCJpZCI6MzQ4MzgxLCJpYXQiOjE3NTk5MzI3NDB9.RAB3s6EwdShkIYv8LKHz7SjfB_THmMtcmIvwDC_g3IA";

  // Crear el viewer
  viewer = new Cesium.Viewer("cesiumContainer", {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    baseLayerPicker: false,
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
  });

  // Precarga de terreno para evitar arrays vacíos
  viewer.scene.globe.preloadSiblings = true;
  viewer.scene.globe.preloadAncestors = true;
  viewer.scene.globe.maximumScreenSpaceError = 1;

  // Ajustes visuales
  viewer.scene.skyAtmosphere.brightnessShift = 0.5;
  viewer.scene.skyAtmosphere.hueShift = 0.05;
  viewer.scene.skyAtmosphere.saturationShift = 0.2;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.mapProjection.ellipsoid = Cesium.Ellipsoid.WGS84;

  // Botón de simular (bloqueado hasta que todo esté listo)
  const simulateBtn = document.getElementById("simulateBtn");
  simulateBtn.disabled = true;
  simulateBtn.textContent = LANG_TEXTS[currentLang].loadingTerrain;

  try {
    // Esperar a que el terreno y la escena estén listos
    await viewer.scene.globe.readyPromise;
    await viewer.terrainProvider.readyPromise;

    console.log("✅ Cesium y terreno cargados completamente");

    // Habilitar simulación cuando todo esté OK
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  } catch (err) {
    console.error("⚠️ Error al inicializar Cesium:", err);
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  }

  // === CAPTURA DE COORDENADAS ===
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

// === Esperar a que cargue todo el DOM ===
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => inicializarCesium(), 200);
});


// ==========================================================
// 🍔 BOTÓN HAMBURGUESA
// ==========================================================
const burgerBtn = document.getElementById("burgerBtn");
const panel = document.getElementById("panel");
burgerBtn.addEventListener("click", () => panel.classList.toggle("hidden"));

// ==========================================================
// 🔎 BÚSQUEDA CON CACHÉ LOCAL NASA API
// ==========================================================
const cacheAsteroides = {};

async function buscarAsteroides(nombre) {
  const NASA_KEY = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B";
  let url = `https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=${NASA_KEY}`;
  const resultados = [];
  const maxPaginas = 15;
  const cont = document.getElementById("results");

  cont.style.display = "block";
  cont.innerHTML = `
  <div class="search-loading">
    <div class="loader"></div>
    <span>${LANG_TEXTS[currentLang].searchLoading}<span class="dots">...</span></span>
  </div>
`;

  const key = nombre.toLowerCase();
  if (cacheAsteroides[key]) {
    mostrarResultados(cacheAsteroides[key]);
    return;
  }

  const barra = document.createElement("div");
  barra.style.height = "4px";
  barra.style.width = "0%";
  barra.style.background = "#8A9AA5";
  barra.style.transition = "width 0.3s ease";
  cont.appendChild(barra);

  for (let i = 0; i < maxPaginas; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();

      const matches = data.near_earth_objects.filter((a) =>
        a.name.toLowerCase().includes(nombre.toLowerCase())
      );

      barra.style.width = `${((i + 1) / maxPaginas) * 100}%`;

      if (matches.length) {
        resultados.push(...matches);
        break;
      }

      if (!data.links.next) break;
      url = data.links.next;
    } catch (error) {
      console.error("❌ Error al buscar asteroides:", error);
      cont.innerHTML = `<p style='color:#ff7070'>${LANG_TEXTS[currentLang].searchError}</p>`;
      return;
    }
  }

  setTimeout(() => (barra.style.width = "100%"), 200);
  setTimeout(() => barra.remove(), 800);

  if (!resultados.length) {
    cont.innerHTML = `<p>${LANG_TEXTS[currentLang].noResults}</p>`;
  } else {
    cacheAsteroides[key] = resultados;
    mostrarResultados(resultados);
  }
}

function mostrarResultados(lista) {
  const cont = document.getElementById("results");
  cont.innerHTML = "";
  if (!lista.length) {
    cont.innerHTML = `<p>${LANG_TEXTS[currentLang].noResults}</p>`;
    return;
  }

  lista.forEach((a) => {
    const div = document.createElement("div");
    div.className = "asteroid-item";
    const diam = a.estimated_diameter.meters.estimated_diameter_max.toFixed(0);
    div.innerHTML = `${a.name} • ${diam} m`;
    div.onclick = () => seleccionarAsteroide(a);
    cont.appendChild(div);
  });
}

function seleccionarAsteroide(a) {
  selectedAsteroid = a;
  const diam = a.estimated_diameter.meters.estimated_diameter_max.toFixed(0);
  const vel =
    a.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second || 20;
  document.getElementById("diam").innerText = diam;
  document.getElementById("vel").innerText = vel;
  console.log(`🪐 Asteroide seleccionado: ${a.name}`);
}

// === Buscar con botón ===
document.getElementById("searchBtn").onclick = async () => {
  const nombre = document.getElementById("searchAst").value.trim();
  if (!nombre) return alert(LANG_TEXTS[currentLang].selectBoth);
  await buscarAsteroides(nombre);
};

// === Buscar también con Enter ===
document.getElementById("searchAst").addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // evita recargar la página
    const nombre = e.target.value.trim();
    if (!nombre) return alert(LANG_TEXTS[currentLang].selectBoth);
    await buscarAsteroides(nombre);
  }
});


// ==========================================================
// === SIMULAR IMPACTO (versión segura) ===
// ==========================================================
document.getElementById("simulateBtn").onclick = async () => {
  if (!selectedCoords || !selectedAsteroid)
    return alert(LANG_TEXTS[currentLang].selectBoth);

  const diam = parseFloat(
    selectedAsteroid.estimated_diameter.meters.estimated_diameter_max || 100
  );
  const vel = parseFloat(
    selectedAsteroid.close_approach_data?.[0]?.relative_velocity
      ?.kilometers_per_second || 20
  );
  const densidad = 3000;
  const angulo = 45;

  const carto = Cesium.Cartographic.fromDegrees(
    selectedCoords.lon,
    selectedCoords.lat
  );

  // 🧱 --- bloque seguro de terreno ---
  let altura = 0;
  try {
    await viewer.terrainProvider.readyPromise; // espera provider listo
    const samples = await Cesium.sampleTerrainMostDetailed(
      viewer.terrainProvider,
      [carto]
    );
    if (
      Array.isArray(samples) &&
      samples.length > 0 &&
      isFinite(samples[0].height)
    ) {
      altura = samples[0].height;
    } else {
      console.warn(
        "⚠️ Cesium devolvió alturas inválidas. Usando altura 0 por seguridad."
      );
    }
  } catch (err) {
    console.error("⚠️ Error obteniendo altura del terreno:", err);
    altura = 0; // valor de respaldo seguro
  }
  // -----------------------------------

  const { rho_t, tipo } = densidadTerrenoPorAltura(
    altura,
    selectedCoords.lat,
    selectedCoords.lon
  );
  const masa = masaImpactor(diam, densidad);
  const { E, E_Mt } = energiaImpacto(masa, vel);
  const { D_f, R_e } = craterYEyecta(diam, vel, densidad, rho_t, angulo);
  const efectos = calcularEfectosSecundarios(E, D_f, vel, tipo, R_e);

  console.log("📊 Parámetros del impacto:", {
    diam,
    vel,
    densidad,
    angulo,
    altura,
    rho_t,
    tipo,
  });
  console.log("💥 Resultados físicos:", { masa, E_Mt, D_f, R_e, efectos });

  generarInformeDesastres(E_Mt, D_f, R_e, tipo);
  animarImpacto(selectedCoords, D_f, E_Mt, R_e);
};

// ==========================================================
// === FUNCIONES FÍSICAS (sin cambios)
// ==========================================================
const g = 9.81, mu = 0.22, nu = 0.33, Cg = 1.6, k_c = 1.3, k_e = 3.0;

function densidadTerrenoPorAltura(altura, lat, lon) {
  if (Math.abs(lat) >= 66.5) {
    if (altura <= 100) return { rho_t: 900, tipo: "Región polar / hielo marino" };
    if (altura > 100) return { rho_t: 1500, tipo: "Región polar / capa de hielo" };
  }
  if (altura <= 20) return { rho_t: 1000, tipo: "Océano" };
  if (altura <= 500) return { rho_t: 1800, tipo: "Zona costera / sedimentos" };
  if (altura <= 1500) return { rho_t: 2300, tipo: "Continente rocoso" };
  return { rho_t: 2700, tipo: "Montaña" };
}

function masaImpactor(d_m, rho_i) {
  const r = d_m / 2;
  return (4 / 3) * Math.PI * r ** 3 * rho_i;
}

function energiaImpacto(masa, v_km_s) {
  const v = v_km_s * 1000;
  const E = 0.5 * masa * v ** 2;
  const E_Mt = E / 4.184e15;
  return { E, E_Mt };
}

function craterYEyecta(d_m, v_km_s, rho_i, rho_t, ang) {
  const theta = (ang * Math.PI) / 180;
  const v_eff = v_km_s * Math.max(Math.sin(theta), 0.2);
  const D_t = Cg * g ** -mu * (rho_i / rho_t) ** nu * d_m ** (1 - mu) * (v_eff * 1000) ** (2 * mu);
  const D_f = k_c * D_t;
  const R_e = k_e * (D_f / 2);
  return { D_t, D_f, R_e };
}

function calcularEfectosSecundarios(E, D_f, velocidad, tipoTerreno, R_e) {
  const f_s = 1e-4;
  const E_s = f_s * E;
  const M_richter = (2 / 3) * Math.log10(E_s) - 3.2;
  const d_ref = 1000;
  const P_mpa = 0.28 * (E ** (1 / 3)) / d_ref;
  const v_viento = 100 * P_mpa;
  const intensidad_dB = 110 + 10 * Math.log10(P_mpa);
  const T_e = 0.5 * Math.pow(D_f / (2 * (d_ref * 1000)), 3);
  const frag_mm = 2 + Math.log10(D_f / 1000);
  let fireball = "Sin bola de fuego", R_fire = 0;
  if (velocidad >= 15) {
    fireball = "Bola de fuego presente";
    R_fire = 0.1 * Math.pow(E / 1e15, 0.4);
  }
  let H_ola = 0;
  if (tipoTerreno.includes("Océano")) H_ola = 0.14 * Math.pow(E / 1e15, 0.25);

  return {
    sismo_M: M_richter.toFixed(2),
    viento_m_s: v_viento.toFixed(1),
    sobrepresion_MPa: P_mpa.toExponential(2),
    sonido_dB: intensidad_dB.toFixed(1),
    eyeccion_espesor_m: T_e.toExponential(2),
    frag_media_mm: frag_mm.toFixed(2),
    termico: fireball,
    radio_fireball_m: R_fire.toExponential(2),
    tsunami_altura_m: H_ola.toFixed(2)
  };
}

// ==========================================================
// === SIMULAR IMPACTO ===
// ==========================================================
document.getElementById("simulateBtn").onclick = async () => {
  if (!selectedCoords || !selectedAsteroid)
    return alert("Selecciona un asteroide y un punto del mapa.");

  const diam = parseFloat(selectedAsteroid.estimated_diameter.meters.estimated_diameter_max || 100);
  const vel = parseFloat(selectedAsteroid.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second || 20);
  const densidad = 3000;
  const angulo = 45;

  const carto = Cesium.Cartographic.fromDegrees(selectedCoords.lon, selectedCoords.lat);
  const [sample] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
  const altura = sample?.height ?? 0;

  const { rho_t, tipo } = densidadTerrenoPorAltura(altura, selectedCoords.lat, selectedCoords.lon);
  const masa = masaImpactor(diam, densidad);
  const { E, E_Mt } = energiaImpacto(masa, vel);
  const { D_f, R_e } = craterYEyecta(diam, vel, densidad, rho_t, angulo);
  const efectos = calcularEfectosSecundarios(E, D_f, vel, tipo, R_e);

  console.log("📊 Parámetros del impacto:", { diam, vel, densidad, angulo, altura, rho_t, tipo });
  console.log("💥 Resultados físicos:", { masa, E_Mt, D_f, R_e, efectos });

  generarInformeDesastres(E_Mt, D_f, R_e, tipo);
  animarImpacto(selectedCoords, D_f, E_Mt, R_e);
};

// ==========================================================
// === ANIMACIÓN DEL ASTEROIDE CON FUEGO + CÁMARA CINEMÁTICA ===
// ==========================================================
function animarImpacto(coords, D_f_m, E_Mt, R_e_m) {
  const startHeight = 8000000; // 8,000 km — visible desde el espacio
  const impactPos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);

  // Desplazamiento inicial para que entre en DIAGONAL (desde Noroeste hacia el punto)
  const lonOffset0 = 6.0;   // grados al Oeste
  const latOffset0 = 3.0;   // grados al Norte

  // 🌠 Asteroide con textura de fuego
  const asteroid = viewer.entities.add({
    name: "asteroid",
    position: Cesium.Cartesian3.fromDegrees(coords.lon - lonOffset0, coords.lat + latOffset0, startHeight),
    billboard: {
      image: crearTexturaFuego(),
      scale: 0.75,
      color: Cesium.Color.ORANGE.withAlpha(0.95),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const duration = 4000; // 4 s de caída
  const start = performance.now();
  const trailParticles = [];

  function anim(now) {
    const t = Math.min((now - start) / duration, 1);

    // Trayectoria DIAGONAL + descenso acelerado
    const lon = coords.lon - lonOffset0 * (1 - t);
    const lat = coords.lat + latOffset0 * (1 - t);
    const height = startHeight * (1 - Math.pow(t, 1.1));

    const currentPos = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    asteroid.position = currentPos;

    // 🔥 Cola de fuego dinámica
    if (Math.random() < 0.65) {
      const particle = viewer.entities.add({
        position: currentPos,
        point: {
          pixelSize: 8 + Math.random() * 4,
          color: Cesium.Color.fromCssColorString(
            `rgba(255, ${100 + Math.random() * 100}, 0, 0.85)`
          ),
        },
      });
      trailParticles.push({ entity: particle, life: 1.0 });
    }

    // 💨 Desvanecer partículas viejas
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.life -= 0.04;
      if (p.life <= 0) {
        viewer.entities.remove(p.entity);
        trailParticles.splice(i, 1);
      } else {
        p.entity.point.color = Cesium.Color.fromCssColorString(
          `rgba(255, ${80 + p.life * 175}, 0, ${p.life * 0.8})`
        );
      }
    }

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      // 💫 Mini vibración previa al impacto
      shakePantalla(500);

      viewer.entities.remove(asteroid);
      trailParticles.forEach(p => viewer.entities.remove(p.entity));
      mostrarExplosion(impactPos, D_f_m, E_Mt, R_e_m);
    }
  }

  requestAnimationFrame(anim);
}

// ==========================================================
// === EXPLOSIÓN PRINCIPAL (Flash + Sacudida + Onda Azul original) ===
// ==========================================================
function mostrarExplosion(impactPos, crater_km, E_Mt, R_e) {
  // 💥 Impactos globales = flash total blanco + sacudida 3s
  if (E_Mt >= 1e6) {
    flashAtmosferico(2000);
    shakePantalla(2000);
  } else {
    // 💨 Impactos locales o continentales = flash breve
    flashAtmosferico(800);
  }

  // 🔵 Tu onda expansiva azul y cráter original
  const craterMetros = crater_km;
  const maxCrater = craterMetros * 2;
  const elevacion = Math.max(5000, craterMetros * 0.1);
  const flashSize = Math.max(20000, craterMetros * 5);
  const ringSize = Math.max(5000, craterMetros * 0.5);
  const R_ref_m = 8000, E_ref_Mt = 10;
  const ondaExpansiva_m = R_ref_m * Math.cbrt(Math.max(E_Mt, 1e-6) / E_ref_Mt);
  const waveSize = Math.max(10000, ondaExpansiva_m);

  const ring = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: ringSize,
      semiMinorAxis: ringSize,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      material: Cesium.Color.ORANGE.withAlpha(0.7),
      classificationType: Cesium.ClassificationType.TERRAIN,
      zIndex: 2
    }
  });

  const wave = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: waveSize,
      semiMinorAxis: waveSize,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      material: Cesium.Color.BLUE.withAlpha(0.6),
      outline: true,
      outlineColor: Cesium.Color.BLUE,
      classificationType: Cesium.ClassificationType.TERRAIN,
      zIndex: 1
    }
  });

  let size = ringSize;
  function expand() {
    size += maxCrater / 120;
    ring.ellipse.semiMajorAxis = size;
    ring.ellipse.semiMinorAxis = size;
    if (size < maxCrater) requestAnimationFrame(expand);
    else setTimeout(() => mostrarCrater(impactPos, crater_km), 1000);
  }
  setTimeout(() => expand(), 1500);

  mostrarLeyendaImpacto();
}

// ==========================================================
// === EFECTOS VISUALES (Flash + Sacudida + Textura de fuego) ===
// ==========================================================
function flashAtmosferico(duracionMs = 900) {
  const overlay = document.createElement('div');
  overlay.className = 'flash-overlay';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('on'));
  setTimeout(() => overlay.classList.remove('on'), duracionMs * 0.7);
  setTimeout(() => overlay.remove(), duracionMs + 300);
}

function shakePantalla(duration = 3000) {
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), duration);
}

function crearTexturaFuego() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,200,1)");
  grad.addColorStop(0.25, "rgba(255,220,100,0.95)");
  grad.addColorStop(0.55, "rgba(255,140,0,0.8)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

// ==========================================================
// 🟠🔵 LEYENDA VISUAL TRADUCIBLE
// ==========================================================
function mostrarLeyendaImpacto() {
  const old = document.querySelector(".impact-legend");
  if (old) old.remove();

  const legend = document.createElement("div");
  legend.className = "impact-legend";
  legend.innerHTML = `
    <div><span class="legend-dot orange"></span> ${LANG_TEXTS[currentLang].legendOrange}</div>
    <div><span class="legend-dot blue"></span> ${LANG_TEXTS[currentLang].legendBlue}</div>
  `;
  document.body.appendChild(legend);

  legend.style.opacity = "0";
  setTimeout(() => (legend.style.opacity = "1"), 300);
  setTimeout(() => {
    legend.style.transition = "opacity 2s ease";
    legend.style.opacity = "0";
    setTimeout(() => legend.remove(), 2500);
  }, 8000);
}

// ==========================================================
// === INFORME FINAL ===
// ==========================================================
function generarInformeDesastres(E_Mt, D_f, R_e, tipo) {
  const txt = LANG_TEXTS[currentLang];

  let nivel, titulo, descripcion;
  if (E_Mt < 1e3) {
    nivel = txt.localImpact;
    titulo = currentLang === "es" ? "🟢 Impacto Local — Nivel Verde" : "🟢 Local Impact — Green Level";
    descripcion = currentLang === "es"
      ? "Daños severos en un radio de decenas de kilómetros. Colapso estructural y vientos supersónicos localizados."
      : "Severe damage within tens of kilometers. Structural collapse and localized supersonic winds.";
  } else if (E_Mt < 1e6) {
    nivel = txt.continentalImpact;
    titulo = currentLang === "es" ? "🟠 Impacto Continental — Nivel Naranja" : "🟠 Continental Impact — Orange Level";
    descripcion = currentLang === "es"
      ? "Destrucción continental. Incendios globales y alteración climática a gran escala."
      : "Continental destruction. Global fires and large-scale climate disruption.";
  } else {
    nivel = txt.globalImpact;
    titulo = currentLang === "es" ? "🔴 Impacto Global — Nivel Rojo" : "🔴 Global Impact — Red Level";
    descripcion = currentLang === "es"
      ? "Extinción masiva global. Oscurecimiento atmosférico y fusión superficial terrestre."
      : "Global mass extinction. Atmospheric darkening and surface melting of the Earth.";
  }

  const velocidad_impacto = (Math.random() * 12 + 5).toFixed(1);
  const profundidad_crater = (D_f * 0.06 / 1000).toFixed(2);

  ultimoInforme = {
    energia_MT: E_Mt.toFixed(0),
    crater_km: (D_f / 1000).toFixed(2),
    profundidad_km: profundidad_crater,
    velocidad_km_s: velocidad_impacto,
    radio_km: (R_e / 1000).toFixed(2),
    nivel,
    tipo,
    descripcion
  };

  document.getElementById("verInformeBtn").style.display = "block";
  document.getElementById("infoCrater").innerText = `${ultimoInforme.crater_km} km`;
  document.getElementById("infoProf").innerText = `${ultimoInforme.profundidad_km} km`;
  document.getElementById("infoVel").innerText = `${ultimoInforme.velocidad_km_s} km/s`;
  document.getElementById("infoEnergia").innerText = `${(ultimoInforme.energia_MT / 1000).toFixed(1)} Gigatones TNT`;
  document.getElementById("infoDescripcion").innerText = ultimoInforme.descripcion;

  const tituloElem = document.getElementById("tituloInforme");
  tituloElem.className = "";
  if (nivel.includes("local") || nivel.includes("Local")) tituloElem.classList.add("nivel-verde");
  else if (nivel.includes("continental") || nivel.includes("Continental")) tituloElem.classList.add("nivel-naranja");
  else tituloElem.classList.add("nivel-rojo");

  tituloElem.innerText = titulo;

  // 🧩 Etiquetas del modal traducidas
  document.querySelector('.label span:nth-child(2)').innerText = currentLang === "es" ? "Cráter:" : "Crater:";
  document.querySelectorAll('.label span:nth-child(2)')[1].innerText = currentLang === "es" ? "Profundidad:" : "Depth:";
  document.querySelectorAll('.label span:nth-child(2)')[2].innerText = currentLang === "es" ? "Velocidad:" : "Velocity:";
  document.querySelectorAll('.label span:nth-child(2)')[3].innerText = currentLang === "es" ? "Energía:" : "Energy:";
}



const modal = document.getElementById("informeModal");
const verInformeBtn = document.getElementById("verInformeBtn");
const cerrarInforme = document.getElementById("cerrarInforme");

verInformeBtn.onclick = () => {
  if (!ultimoInforme) return;
  modal.style.display = "flex";
  document.getElementById("infoCrater").innerText = `${ultimoInforme.crater_km} km`;
  document.getElementById("infoEnergia").innerText = `${(ultimoInforme.energia_MT / 1000).toFixed(1)} Gigatones TNT`;
  document.getElementById("infoDescripcion").innerText = ultimoInforme.descripcion;
};

cerrarInforme.onclick = () => (modal.style.display = "none");
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

