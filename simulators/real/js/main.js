// ==========================================================
// 🌎 ChaacImpact — Simulador 3D Realista SIN BACKEND (versión final)
// ==========================================================

// === Variables globales ===
let viewer;
let selectedCoords = null;
let selectedAsteroid = null;
let ultimoInforme = null;

// ==========================================================
// ⚙️ CONFIGURACIÓN VISUAL DE CESIUM
// ==========================================================
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NmY5ZDA2Yi0zMzliLTRkOTEtYTYyYS05YTQ0NjQxYzMxNmMiLCJpZCI6MzQ4MzgxLCJpYXQiOjE3NTk5MzI3NDB9.RAB3s6EwdShkIYv8LKHz7SjfB_THmMtcmIvwDC_g3IA";

viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  animation: false,
  timeline: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  baseLayerPicker: true,
  geocoder: true,
  homeButton: true,
  sceneModePicker: true
});

viewer.scene.globe.depthTestAgainstTerrain = false;
console.log("✅ ChaacImpact 3D inicializado sin backend.");

// Limitar vista 2D y evitar scroll infinito
viewer.scene.globe.maximumScreenSpaceError = 2;
viewer.scene.mapProjection.ellipsoid = Cesium.Ellipsoid.WGS84;
viewer.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);

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
  cont.innerHTML = `<p style="color:#00b4ff"><span class="loader"></span>Buscando asteroides...</p>`;

  // Si está en caché, usarlo directamente
  const key = nombre.toLowerCase();
  if (cacheAsteroides[key]) {
    console.log("♻️ Resultado obtenido desde caché:", key);
    mostrarResultados(cacheAsteroides[key]);
    return;
  }

  // Barra de carga
  const barra = document.createElement("div");
  barra.style.height = "4px";
  barra.style.width = "0%";
  barra.style.background = "#00b4ff";
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
      cont.innerHTML = "<p style='color:#ff7070'>⚠️ Error al conectar con la NASA API.</p>";
      return;
    }
  }

  setTimeout(() => (barra.style.width = "100%"), 200);
  setTimeout(() => barra.remove(), 800);

  if (!resultados.length) {
    cont.innerHTML = "<p>No se encontraron resultados.</p>";
  } else {
    cacheAsteroides[key] = resultados;
    mostrarResultados(resultados);
  }
}

function mostrarResultados(lista) {
  const cont = document.getElementById("results");
  cont.innerHTML = "";
  if (!lista.length) {
    cont.innerHTML = "<p>No se encontraron resultados.</p>";
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

document.getElementById("searchBtn").onclick = async () => {
  const nombre = document.getElementById("searchAst").value.trim();
  if (!nombre) return alert("Ingresa el nombre de un asteroide.");
  await buscarAsteroides(nombre);
};

// ==========================================================
// === CAPTURA DE COORDENADAS EN EL GLOBO ===
// ==========================================================
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
    point: { pixelSize: 14, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 3 },
    label: { text: "Punto de impacto", fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0, -20) }
  });

  document.getElementById("coords").innerText = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ==========================================================
// === FUNCIONES FÍSICAS PRINCIPALES (versión avanzada NASA) ===
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
// === ANIMACIÓN VISUAL + ONDA EXPANSIVA AZUL ===
// ==========================================================
function animarImpacto(coords, D_f_m, E_Mt, R_e_m) {
  const startHeight = 1800000;
  const spacePos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, startHeight);
  const impactPos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);
  console.log("🌍 Coordenadas impacto:", coords.lat, coords.lon);

  const asteroid = viewer.entities.add({
    position: spacePos,
    point: { pixelSize: 10, color: Cesium.Color.YELLOW }
  });

  const duration = 4000, start = performance.now();
  function anim(now) {
    const t = Math.min((now - start) / duration, 1);
    asteroid.position = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, startHeight * (1 - t));
    if (t < 1) requestAnimationFrame(anim);
    else {
      viewer.entities.remove(asteroid);
      mostrarExplosion(impactPos, D_f_m, E_Mt, R_e_m);
    }
  }
  requestAnimationFrame(anim);
}

// ==========================================================
// === EXPLOSIÓN PRINCIPAL (Flash + Anillo + Onda Azul) ===
// ==========================================================
function mostrarExplosion(impactPos, crater_km, E_Mt, R_e) {
  const craterMetros = crater_km;
  const maxCrater = craterMetros * 2;
  const elevacion = Math.max(5000, craterMetros * 0.1);
  const flashSize = Math.max(20000, craterMetros * 5);
  const ringSize = Math.max(5000, craterMetros * 0.5);
  const R_ref_m = 8000, E_ref_Mt = 10;
  const ondaExpansiva_m = R_ref_m * Math.cbrt(Math.max(E_Mt, 1e-6) / E_ref_Mt);
  const waveSize = Math.max(10000, ondaExpansiva_m);

  console.log("💥 Tamaños de explosión:", { crater_km, flashSize, ringSize, waveSize });

  // Desvanecimiento del flash
  let flashOpacity = 0.9;
  const fade = setInterval(() => {
    flashOpacity -= 0.05;
    if (flashOpacity <= 0) {
      clearInterval(fade);
      viewer.entities.remove(flash);
    } else {
      flash.ellipse.material = Cesium.Color.WHITE.withAlpha(flashOpacity);
    }
  }, 80);

  // === ANILLO NARANJA (cráter y fuego) ===
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

  // === ONDA EXPANSIVA AZUL ===
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

  // Expansión del anillo naranjado
  let size = ringSize;
  function expand() {
    size += maxCrater / 120;
    ring.ellipse.semiMajorAxis = size;
    ring.ellipse.semiMinorAxis = size;
    if (size < maxCrater) {
      requestAnimationFrame(expand);
    } else {
      setTimeout(() => mostrarCrater(impactPos, crater_km), 1000);
    }
  }
  setTimeout(() => expand(), 1500);
}

// ==========================================================
// === CRÁTER FINAL ===
// ==========================================================
function mostrarCrater(impactPos, crater_km) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(selectedCoords.lon, selectedCoords.lat, crater_km * 50),
    duration: 3
  });
}

// ==========================================================
// === INFORME FINAL ===
// ==========================================================
function generarInformeDesastres(E_Mt, D_f, R_e, tipo) {
  let nivel;
  if (E_Mt < 1e3) nivel = "Impacto local (daños regionales)";
  else if (E_Mt < 1e6) nivel = "Impacto continental";
  else nivel = "Impacto global catastrófico";

  const descripcion =
    E_Mt < 1e3
      ? "Daños severos en un radio de decenas de kilómetros. Colapso estructural y vientos supersónicos localizados."
      : E_Mt < 1e6
      ? "Destrucción continental. Incendios globales y alteración climática a gran escala."
      : "Extinción masiva global. Oscurecimiento atmosférico y fusión superficial terrestre.";

  const velocidad_impacto = (Math.random() * 12 + 5).toFixed(1); // km/s promedio
  const profundidad_crater = (D_f * 0.06 / 1000).toFixed(2); // km aprox

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

  console.table({
    "Energía (Mt)": E_Mt.toFixed(2),
    "Cráter (m)": D_f.toFixed(2),
    "Radio eyecta (m)": R_e.toFixed(2),
    "Profundidad (m)": (D_f * 0.06).toFixed(2),
    "Velocidad (km/s)": velocidad_impacto,
    "Terreno": tipo,
    "Nivel": nivel,
    "Descripción": descripcion
  });

  // === Mostrar en el modal ===
  document.getElementById("verInformeBtn").style.display = "block";
  document.getElementById("infoCrater").innerText = `${ultimoInforme.crater_km} km`;
  document.getElementById("infoProf").innerText = `${ultimoInforme.profundidad_km} km`;
  document.getElementById("infoVel").innerText = `${ultimoInforme.velocidad_km_s} km/s`;
  document.getElementById("infoEnergia").innerText = `${(ultimoInforme.energia_MT / 1000).toFixed(1)} Gigatones TNT`;
  document.getElementById("infoDescripcion").innerText = ultimoInforme.descripcion;

  const titulo = document.getElementById("tituloInforme");
  titulo.className = "";
  if (nivel.includes("local")) {
    titulo.classList.add("nivel-verde");
    titulo.innerText = "🟢 Impacto Local — Nivel Verde";
  } else if (nivel.includes("continental")) {
    titulo.classList.add("nivel-naranja");
    titulo.innerText = "🟠 Impacto Continental — Nivel Naranja";
  } else {
    titulo.classList.add("nivel-rojo");
    titulo.innerText = "🔴 Impacto Global — Nivel Rojo";
  }
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

