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

/* =========================================================
   Escala visual SOLO para la onda azul (ajusta a gusto)
========================================================= */
const BLUE_WAVE_SCALE = 2.8;

/* =========================================================
   Utilidades de saneo y clamps
========================================================= */
const num = (v, fallback, min = null, max = null) => {
  let n = Number(v);
  if (!Number.isFinite(n)) {
    n = Number(fallback);
    if (!Number.isFinite(n)) n = 0;
  }
  if (min !== null && Number.isFinite(min) && n < min) n = min;
  if (max !== null && Number.isFinite(max) && n > max) n = max;
  return n;
};
const clamp = (x, min, max, fallback = min) => {
  const v = Number.isFinite(x) ? x : fallback;
  return Math.min(Math.max(v, min), max);
};
// Saneo fuerte para radios/valores que Cesium usa (evita NaN/0/negativos)
const safePos = (v, fallback = 1, min = 1, max = 2e6) => {
  let n = Number(v);
  if (!Number.isFinite(n)) n = Number(fallback);
  if (!Number.isFinite(n)) n = 1;
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
};

/* =========================================================
   Variables globales
========================================================= */
let viewer, selectedCoords = null, selectedAsteroid = null, ultimoInforme = null;

/* =========================================================
   ⚙️ CESIUM (seguro post-refresh)
========================================================= */
async function inicializarCesium() {
  const container = document.getElementById("cesiumContainer");
  if (!container) {
    console.error("❌ No se encontró el contenedor Cesium.");
    return;
  }

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
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
  });

  // Ajustes visuales
  viewer.scene.skyAtmosphere.brightnessShift = 0.5;
  viewer.scene.skyAtmosphere.hueShift = 0.05;
  viewer.scene.skyAtmosphere.saturationShift = 0.2;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;

  viewer.scene.globe.maximumScreenSpaceError = 1;
  viewer.scene.mapProjection.ellipsoid = Cesium.Ellipsoid.WGS84;

  // Bloqueo de botón hasta cargar terreno
  const simulateBtn = document.getElementById("simulateBtn");
  simulateBtn.disabled = true;
  simulateBtn.textContent = LANG_TEXTS[currentLang].loadingTerrain;

  try {
    await viewer.scene.globe.readyPromise;
    await viewer.terrainProvider.readyPromise;
    console.log("✅ Cesium y terreno cargados completamente");
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  } catch (err) {
    console.error("⚠️ Error al inicializar Cesium:", err);
    simulateBtn.disabled = false;
    simulateBtn.textContent = LANG_TEXTS[currentLang].simulateBtn;
  }

  // Captura de coordenadas
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

    document.getElementById("coords").innerText =
      `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

window.addEventListener("DOMContentLoaded", () => setTimeout(inicializarCesium, 100));

/* =========================================================
   UI
========================================================= */
const burgerBtn = document.getElementById("burgerBtn");
const panel = document.getElementById("panel");
if (burgerBtn && panel) burgerBtn.addEventListener("click", () => panel.classList.toggle("hidden"));

/* =========================================================
   🔎 Búsqueda NASA (con caché)
========================================================= */
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
    </div>`;

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
  const vel = a.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second || 20;
  document.getElementById("diam").innerText = diam;
  document.getElementById("vel").innerText = vel;
  console.log(`🪐 Asteroide seleccionado: ${a.name}`);
}

function mostrarResultados(lista) {
  const cont = document.getElementById("results");
  if (!cont) return;
  cont.innerHTML = "";
  if (!lista.length) { cont.innerHTML = `<p>${LANG_TEXTS[currentLang].noResults}</p>`; return; }
  lista.forEach(a => {
    const div = document.createElement("div");
    div.className = "asteroid-item";
    const diam = num(a?.estimated_diameter?.meters?.estimated_diameter_max, 100);
    div.innerHTML = `${a.name} • ${diam.toFixed(0)} m`;
    div.onclick = () => seleccionarAsteroide(a);
    cont.appendChild(div);
  });
}
function seleccionarAsteroide(a) {
  selectedAsteroid = a;
  const diam = num(a?.estimated_diameter?.meters?.estimated_diameter_max, 100);
  const vel = num(a?.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second, 20);
  const dEl = document.getElementById("diam"), vEl = document.getElementById("vel");
  if (dEl) dEl.innerText = diam.toFixed(0);
  if (vEl) vEl.innerText = vel.toFixed(1);
}

/* =========================================================
   FÍSICA
========================================================= */
const g = 9.81, mu = 0.22, nu = 0.33, Cg = 1.6, k_c = 1.3, k_e = 3.0;
function densidadTerrenoPorAltura(altura, lat) {
  if (Math.abs(lat) >= 66.5) {
    if (altura <= 100) return { rho_t: 900,  tipo: "Región polar / hielo marino" };
    return                 { rho_t: 1500, tipo: "Región polar / capa de hielo" };
  }
  if (altura <= 20)   return { rho_t: 1000, tipo: "Océano" };
  if (altura <= 500)  return { rho_t: 1800, tipo: "Zona costera / sedimentos" };
  if (altura <= 1500) return { rho_t: 2300, tipo: "Continente rocoso" };
  return { rho_t: 2700, tipo: "Montaña" };
}
function masaImpactor(d_m, rho_i) { const r = d_m/2; return (4/3)*Math.PI*r**3*rho_i; }
function energiaImpacto(masa, v_km_s) {
  const v = v_km_s*1000; const E = 0.5*masa*v**2; const E_Mt = E/4.184e15; return {E,E_Mt};
}
function craterYEyecta(d_m, v_km_s, rho_i, rho_t, ang) {
  const theta = (ang*Math.PI)/180;
  const v_eff = v_km_s * Math.max(Math.sin(theta), 0.2);
  const D_t = Cg * g**-mu * (rho_i/rho_t)**nu * d_m**(1-mu) * (v_eff*1000)**(2*mu);
  const D_f = k_c * D_t;
  const R_e = k_e * (D_f/2);
  return { D_t, D_f, R_e };
}
function calcularEfectosSecundarios(E, D_f, velocidad, tipoTerreno, R_e) {
  const f_s = 1e-4, E_s=f_s*E, M_richter=(2/3)*Math.log10(E_s)-3.2;
  const d_ref=1000, P_mpa=0.28*(E**(1/3))/d_ref, v_viento=100*P_mpa;
  const intensidad_dB=110+10*Math.log10(P_mpa);
  const T_e=0.5*Math.pow(D_f/(2*(d_ref*1000)),3);
  const frag_mm=2+Math.log10(D_f/1000);
  let fireball="Sin bola de fuego", R_fire=0;
  if (velocidad>=15){ fireball="Bola de fuego presente"; R_fire=0.1*Math.pow(E/1e15,0.4); }
  let H_ola=0; if (tipoTerreno.includes("Océano")) H_ola=0.14*Math.pow(E/1e15,0.25);
  return {
    sismo_M:M_richter.toFixed(2), viento_m_s:v_viento.toFixed(1),
    sobrepresion_MPa:P_mpa.toExponential(2), sonido_dB:intensidad_dB.toFixed(1),
    eyeccion_espesor_m:T_e.toExponential(2), frag_media_mm:frag_mm.toFixed(2),
    termico:fireball, radio_fireball_m:R_fire.toExponential(2), tsunami_altura_m:H_ola.toFixed(2)
  };
}

/* =========================================================
   SIMULAR (con saneo fuerte)
========================================================= */
const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.onclick = async () => {
  const nombre = document.getElementById("searchAst").value.trim();
  if (!nombre) return alert(LANG_TEXTS[currentLang].selectBoth);
  await buscarAsteroides(nombre);
};
const searchInput = document.getElementById("searchAst");
if (searchInput) searchInput.addEventListener("keydown", async (e)=>{
  if (e.key === "Enter") {
    e.preventDefault();
    const nombre = e.target.value.trim();
    if (!nombre) return alert(LANG_TEXTS[currentLang].selectBoth);
    await buscarAsteroides(nombre);
  }
});

const simulateBtn = document.getElementById("simulateBtn");
document.getElementById("simulateBtn").onclick = async () => {
  if (!selectedCoords || !selectedAsteroid)
    return alert(LANG_TEXTS[currentLang].selectBoth);

  const diam = parseFloat(selectedAsteroid.estimated_diameter.meters.estimated_diameter_max || 100);
  const vel = parseFloat(selectedAsteroid.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second || 20);
  const densidad = 3000;
  const angulo = 45;

  const carto = Cesium.Cartographic.fromDegrees(selectedCoords.lon, selectedCoords.lat);

  let altura = 0;
  try {
    await viewer.terrainProvider.readyPromise;
    const samples = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
    if (Array.isArray(samples) && samples.length > 0 && isFinite(samples[0].height)) {
      altura = samples[0].height;
    }
  } catch (err) {
    console.error("⚠️ Error obteniendo altura del terreno:", err);
    altura = 0;
  }

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

/* =========================================================
   ANIMACIÓN ASTEROIDE
========================================================= */
function animarImpacto(coords, crater_m, E_Mt, R_e_m) {
  const startHeight = 8_000_000;
  const impactPos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);
  const lonOffset0 = 6.0, latOffset0 = 3.0;

  const asteroid = viewer.entities.add({
    name: "asteroid",
    position: Cesium.Cartesian3.fromDegrees(coords.lon - lonOffset0, coords.lat + latOffset0, startHeight),
    billboard: {
      image: crearTexturaFuego(), scale: 0.75, color: Cesium.Color.ORANGE.withAlpha(0.95),
      verticalOrigin: Cesium.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const duration = 4000, start = performance.now(), trailParticles = [];
  function anim(now){
    const t = Math.min((now-start)/duration, 1);
    const lon = coords.lon - lonOffset0*(1-t);
    const lat = coords.lat + latOffset0*(1-t);
    const height = startHeight*(1-Math.pow(t,1.1));
    const currentPos = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    asteroid.position = currentPos;

    if (Math.random()<0.65) {
      const particle = viewer.entities.add({
        position: currentPos, point:{ pixelSize: 8+Math.random()*4,
        color: Cesium.Color.fromCssColorString(`rgba(255, ${100+Math.random()*100}, 0, 0.85)`) }
      });
      trailParticles.push({entity:particle, life:1.0});
    }
    for (let i=trailParticles.length-1;i>=0;i--){
      const p = trailParticles[i]; p.life-=0.04;
      if (p.life<=0){ viewer.entities.remove(p.entity); trailParticles.splice(i,1); }
      else { p.entity.point.color = Cesium.Color.fromCssColorString(`rgba(255, ${80+p.life*175}, 0, ${p.life*0.8})`); }
    }
    if (t<1) requestAnimationFrame(anim);
    else {
      shakePantalla(500);
      viewer.entities.remove(asteroid);
      trailParticles.forEach(p=>viewer.entities.remove(p.entity));
      mostrarExplosion(impactPos, crater_m, E_Mt);
    }
  }
  requestAnimationFrame(anim);
}

/* =========================================================
   CÍRCULOS RELLENOS 2D con CallbackProperty (robusto)
========================================================= */
function filledCircleEntity(centerCartesian, radiusGetter, options = {}) {
  const {
    fillColor   = Cesium.Color.WHITE.withAlpha(0.3),
    outlineColor= Cesium.Color.WHITE.withAlpha(0.9),
    outlineWidth= 3,
    height      = 0
  } = options;

  let lastR = 1;

  const radiusProp = new Cesium.CallbackProperty(() => {
    try {
      let r = radiusGetter ? radiusGetter() : lastR;
      // 💥 Asegura que nunca sea NaN, Infinity o fuera de rango
      if (!Number.isFinite(r) || r <= 0) r = lastR;
      r = Math.max(1, Math.min(r, 2e6)); // 1 m – 2000 km
      lastR = r;
      return r;
    } catch {
      return lastR;
    }
  }, false);

  // 🔒 Evita el bug del “Invalid array length”
  const ellipse = {
    semiMajorAxis: radiusProp,
    semiMinorAxis: radiusProp,
    height,
    heightReference: Cesium.HeightReference.NONE,
    material: fillColor,
    outline: true,
    outlineColor,
    outlineWidth
  };

  // ✅ Filtro de seguridad
  Object.keys(ellipse).forEach(k => {
    if (ellipse[k] === undefined || ellipse[k] === null)
      delete ellipse[k];
  });

  return viewer.entities.add({ position: centerCartesian, ellipse });
}


/* =========================================================
   EXPLOSIÓN + ONDA (2D, más grande y a prueba de NaN)
========================================================= */
function mostrarExplosion(impactPos, crater_m, E_Mt) {
  // Efectos
  if (E_Mt >= 1e6) { flashAtmosferico(2000); shakePantalla(2000); } else flashAtmosferico(800);

  // Saneo fuerte de entrada
  const craterSafe = safePos(crater_m, 1000, 10, 4e5);   // 10 m .. 400 km
  const energyMt   = safePos(E_Mt, 1, 1e-6, 1e12);

  // Onda azul: ~E^(1/3) y escala visual
  const k_wave_m = 5000;
  let waveFinal_m = k_wave_m * Math.cbrt(energyMt);
  waveFinal_m = safePos(waveFinal_m * BLUE_WAVE_SCALE,
                        craterSafe * 2, Math.max(3000, craterSafe * 1.5), 1e7);

  // Anillo naranja (2D)
  let ringRadius = safePos(craterSafe * 0.25, 200, 120, craterSafe);
  const ringEntity = filledCircleEntity(
    impactPos,
    () => ringRadius,
    {
      fillColor: Cesium.Color.ORANGE.withAlpha(0.25),
      outlineColor: Cesium.Color.ORANGE.withAlpha(0.95),
      outlineWidth: 3,
      height: 0
    }
  );

  // Onda azul (2D)
  let waveRadius = safePos(Math.max(ringRadius * 1.3, Math.min(15000, waveFinal_m * 0.22)), 2000, 200, waveFinal_m);
  const waveEntity = filledCircleEntity(
    impactPos,
    () => waveRadius,
    {
      fillColor: Cesium.Color.BLUE.withAlpha(0.20),
      outlineColor: Cesium.Color.BLUE.withAlpha(0.92),
      outlineWidth: 3,
      height: 0
    }
  );

  // Animación anillo naranja
  const ringGrowSteps = 120;
  let ringStep = 0;
  function growRing() {
    ringStep++;
    const target = craterSafe;
    const delta  = (target - ringRadius) / (ringGrowSteps - ringStep + 8);
    ringRadius   = safePos(ringRadius + Math.max(60, delta), ringRadius, 1, target);
    if (ringStep < ringGrowSteps) requestAnimationFrame(growRing);
    else setTimeout(() => mostrarCrater(impactPos, craterSafe), 600);
  }
  requestAnimationFrame(growRing);

  // Animación onda azul
  const waveGrowSteps = 180;
  let waveStep = 0;
  function growWave() {
    waveStep++;
    const delta = (waveFinal_m - waveRadius) / (waveGrowSteps - waveStep + 12);
    waveRadius  = safePos(waveRadius + Math.max(120, delta), waveRadius, 1, waveFinal_m);

    if (waveStep >= waveGrowSteps - 30) {
      const a = 0.20 + 0.06 * Math.sin((waveStep - (waveGrowSteps - 30)) * 0.2);
      waveEntity.ellipse.material = Cesium.Color.BLUE.withAlpha(clamp(a, 0.12, 0.26));
    }
    if (waveStep < waveGrowSteps) requestAnimationFrame(growWave);
    else waveEntity.ellipse.material = Cesium.Color.BLUE.withAlpha(0.20); // queda visible
  }
  requestAnimationFrame(growWave);

  mostrarLeyendaImpacto();

  try {
  const carto = Cesium.Cartographic.fromCartesian(impactPos);

  const altura = Math.max(waveFinal_m * 2.2, 200000); 
  const destino = Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    altura
  );

  viewer.camera.flyTo({
    destination: destino,
    duration: 2.5,
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO, 
      roll: 0
    }
  });
} catch (_) { /* no-op */ }
}

/* =========================================================
   CRÁTER (relleno ellipse) 2D + mínimos seguros
========================================================= */
function mostrarCrater(impactPos, crater_m) {
  const c = safePos(crater_m, 1000, 10, 1.2e6);
  viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: c / 2,
      semiMinorAxis: c / 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // ✅ vuelve a pegarlo al suelo
      material: Cesium.Color.fromCssColorString('#5a3e2b').withAlpha(0.65),
      outline: true,
      outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
      outlineWidth: 2
    }
  });
}


/* =========================================================
   EFECTOS VISUALES
========================================================= */
function flashAtmosferico(duracionMs=900){
  const overlay=document.createElement('div'); overlay.className='flash-overlay';
  document.body.appendChild(overlay);
  requestAnimationFrame(()=> overlay.classList.add('on'));
  setTimeout(()=> overlay.classList.remove('on'), duracionMs*0.7);
  setTimeout(()=> overlay.remove(), duracionMs+300);
}
function shakePantalla(duration=3000){ document.body.classList.add('shake'); setTimeout(()=>document.body.classList.remove('shake'), duration); }
function crearTexturaFuego(){
  const canvas=document.createElement("canvas"); canvas.width=64; canvas.height=64;
  const ctx=canvas.getContext("2d");
  const grad=ctx.createRadialGradient(32,32,5,32,32,30);
  grad.addColorStop(0,"rgba(255,255,200,1)");
  grad.addColorStop(0.25,"rgba(255,220,100,0.95)");
  grad.addColorStop(0.55,"rgba(255,140,0,0.8)");
  grad.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=grad; ctx.fillRect(0,0,64,64); return canvas;
}

/* =========================================================
   LEYENDA + INFORME
========================================================= */
function mostrarLeyendaImpacto(){
  const old=document.querySelector(".impact-legend"); if (old) old.remove();
  const legend=document.createElement("div"); legend.className="impact-legend";
  legend.innerHTML=`<div><span class="legend-dot orange"></span> ${LANG_TEXTS[currentLang].legendOrange}</div>
                    <div><span class="legend-dot blue"></span> ${LANG_TEXTS[currentLang].legendBlue}</div>`;
  document.body.appendChild(legend);
  legend.style.opacity="0"; setTimeout(()=> (legend.style.opacity="1"), 300);
  setTimeout(()=>{ legend.style.transition="opacity 2s ease"; legend.style.opacity="0"; setTimeout(()=>legend.remove(), 2500); }, 8000);
}

function generarInformeDesastres(E_Mt, D_f_m, R_e, tipo){
  const txt=LANG_TEXTS[currentLang];
  let nivel, titulo, descripcion;
  if (E_Mt < 1e3) { nivel=txt.localImpact;       titulo=currentLang==="es"?"🟢 Impacto Local — Nivel Verde":"🟢 Local Impact — Green Level";
    descripcion=currentLang==="es"?"Daños severos en un radio de decenas de kilómetros. Colapso estructural y vientos supersónicos localizados.":"Severe damage within tens of kilometers. Structural collapse and localized supersonic winds."; }
  else if (E_Mt < 1e6) { nivel=txt.continentalImpact; titulo=currentLang==="es"?"🟠 Impacto Continental — Nivel Naranja":"🟠 Continental Impact — Orange Level";
    descripcion=currentLang==="es"?"Destrucción continental. Incendios globales y alteración climática a gran escala.":"Continental destruction. Global fires and large-scale climate disruption."; }
  else { nivel=txt.globalImpact; titulo=currentLang==="es"?"🔴 Impacto Global — Nivel Rojo":"🔴 Global Impact — Red Level";
    descripcion=currentLang==="es"?"Extinción masiva global. Oscurecimiento atmosférico y fusión superficial terrestre.":"Global mass extinction. Atmospheric darkening and surface melting of the Earth."; }

  const velocidad_impacto = (Math.random()*12+5).toFixed(1);
  const profundidad_crater = (num(D_f_m,1000)*0.06/1000).toFixed(2);

  ultimoInforme = {
    energia_MT: num(E_Mt,1).toFixed(0),
    crater_km: (num(D_f_m,1000)/1000).toFixed(2),
    profundidad_km: profundidad_crater,
    velocidad_km_s: velocidad_impacto,
    radio_km: (num(R_e,1000)/1000).toFixed(2),
    nivel, tipo, descripcion
  };

  const setText = (id, text) => { const el=document.getElementById(id); if (el) el.innerText=text; };
  const verBtn=document.getElementById("verInformeBtn"); if (verBtn) verBtn.style.display="block";
  setText("infoCrater", `${ultimoInforme.crater_km} km`);
  setText("infoProf", `${ultimoInforme.profundidad_km} km`);
  setText("infoVel", `${ultimoInforme.velocidad_km_s} km/s`);
  setText("infoEnergia", `${(ultimoInforme.energia_MT/1000).toFixed(1)} Gigatones TNT`);
  setText("infoDescripcion", ultimoInforme.descripcion);

  const tituloElem=document.getElementById("tituloInforme");
  if (tituloElem){
    tituloElem.className="";
    if (nivel.includes("local")||nivel.includes("Local")) tituloElem.classList.add("nivel-verde");
    else if (nivel.includes("continental")||nivel.includes("Continental")) tituloElem.classList.add("nivel-naranja");
    else tituloElem.classList.add("nivel-rojo");
    tituloElem.innerText=titulo;
  }
  const labels=document.querySelectorAll('.label span:nth-child(2)');
  if (labels && labels.length>=4){
    labels[0].innerText=currentLang==="es"?"Cráter:":"Crater:";
    labels[1].innerText=currentLang==="es"?"Profundidad:":"Depth:";
    labels[2].innerText=currentLang==="es"?"Velocidad:":"Velocity:";
    labels[3].innerText=currentLang==="es"?"Energía:":"Energy:";
  }
}

/* =========================================================
   Modal
========================================================= */
const modal=document.getElementById("informeModal");
const verInformeBtn=document.getElementById("verInformeBtn");
const cerrarInforme=document.getElementById("cerrarInforme");
if (verInformeBtn) verInformeBtn.onclick=()=>{
  if (!ultimoInforme||!modal) return;
  modal.style.display="flex";
  const setText=(id,text)=>{ const el=document.getElementById(id); if (el) el.innerText=text; };
  setText("infoCrater", `${ultimoInforme.crater_km} km`);
  setText("infoEnergia", `${(ultimoInforme.energia_MT/1000).toFixed(1)} Gigatones TNT`);
  setText("infoDescripcion", ultimoInforme.descripcion);
};
if (cerrarInforme && modal) cerrarInforme.onclick=()=> (modal.style.display="none");
if (modal) window.onclick=(e)=>{ if (e.target===modal) modal.style.display="none"; };


/* =========================================================
   ESCALA VISUAL — dinámica según zoom e idioma
========================================================= */
function inicializarEscalaVisual() {
  let escalaDiv = document.getElementById("escalaContainer");
  if (!escalaDiv) {
    escalaDiv = document.createElement("div");
    escalaDiv.id = "escalaContainer";
    escalaDiv.className = "escala-overlay";
    document.body.appendChild(escalaDiv);
  }

  const actualizarEscala = () => {
    if (!viewer || viewer.isDestroyed() || !viewer.camera) return;
    const altura = viewer.camera.positionCartographic.height / 1000; // km
    let escalaKm = Math.round(altura / 15);
    if (escalaKm < 1) escalaKm = 1;

    const texto =
      currentLang === "es"
        ? `Escala visual: 1 cm ≈ ${escalaKm.toLocaleString("es-MX")} km`
        : `Visual scale: 1 cm ≈ ${escalaKm.toLocaleString("en-US")} km`;

    escalaDiv.textContent = texto;
  };

  // Escucha el cambio de cámara y actualiza
  viewer.camera.changed.addEventListener(actualizarEscala);

  // Primer render (espera un poco para que Cesium esté listo)
  setTimeout(actualizarEscala, 1000);
}

// Esperar a que CESIUM esté completamente inicializado
const esperarViewer = setInterval(() => {
  if (typeof viewer !== "undefined" && viewer && !viewer.isDestroyed()) {
    inicializarEscalaVisual();
    clearInterval(esperarViewer);
  }
}, 800);

/* =========================================================
   🔄 REINICIAR SIMULACIÓN
========================================================= */
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.onclick = () => {
    try {
      // Limpia entidades (impactos, ondas, cráteres, etc.)
      if (viewer && !viewer.isDestroyed()) viewer.entities.removeAll();

      // Resetea variables globales
      selectedCoords = null;
      selectedAsteroid = null;
      ultimoInforme = null;

      // Limpia la UI
      const limpiar = ["coords", "diam", "vel", "infoCrater", "infoProf", "infoVel", "infoEnergia", "infoDescripcion"];
      limpiar.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = "–";
      });

      // Oculta el botón de informe y el modal
      const verBtn = document.getElementById("verInformeBtn");
      const modal = document.getElementById("informeModal");
      if (verBtn) verBtn.style.display = "none";
      if (modal) modal.style.display = "none";

      // Borra leyenda si queda en pantalla
      const legend = document.querySelector(".impact-legend");
      if (legend) legend.remove();

      // Feedback visual
      resetBtn.innerText = currentLang === "es" ? "Reiniciado ✅" : "Reset ✅";
      setTimeout(() => {
        resetBtn.innerText = currentLang === "es" ? "Reiniciar Simulación" : "Reset Simulation";
      }, 1500);

      // Vuelve la cámara a la vista global
      viewer.camera.flyHome(1.8);
    } catch (err) {
      console.error("⚠️ Error al reiniciar:", err);
    }
  };
}

// Esperar a que Cesium esté listo
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (typeof viewer !== "undefined") inicializarEscalaVisual();
  }, 1500);
});
