// ==========================================================
// 🌎 ChaacImpact — Simulador 3D Realista SIN BACKEND
// Incluye física real (Ley de Ordeo) + efectos secundarios
// ==========================================================

// === Variables globales ===
let viewer;
let selectedCoords = null;
let selectedAsteroid = null;
let ultimoInforme = null;


// === Inicialización de Cesium ===
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NmY5ZDA2Yi0zMzliLTRkOTEtYTYyYS05YTQ0NjQxYzMxNmMiLCJpZCI6MzQ4MzgxLCJpYXQiOjE3NTk5MzI3NDB9.RAB3s6EwdShkIYv8LKHz7SjfB_THmMtcmIvwDC_g3IA";
viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
});
console.log("✅ ChaacImpact 3D inicializado sin backend.");
// Evita que el terreno o topografía oculte los efectos visuales (cráter, onda, etc.)
viewer.scene.globe.depthTestAgainstTerrain = false;

// ==========================================================
// === BÚSQUEDA DE ASTEROIDES (NASA API) ===
// ==========================================================
async function buscarAsteroides(nombre) {
  const NASA_KEY = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"
  NASA_BASE_URL = "https://api.nasa.gov/neo/rest/v1"
  const url = `https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=${NASA_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const resultados = data.near_earth_objects.filter((a) =>
      a.name.toLowerCase().includes(nombre.toLowerCase())
    );
    mostrarResultados(resultados);
  } catch (error) {
    console.error("Error al buscar asteroides:", error);
    alert("⚠️ No se pudieron obtener datos de la NASA API.");
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


// 🧹 Limpiar simulación anterior al seleccionar nuevo punto
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
      text: "Punto de impacto",
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, -20),
    },
  });

  document.getElementById("coords").innerText =
    `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ==========================================================
// === FUNCIONES FÍSICAS PRINCIPALES (sin backend) ===
// ==========================================================

// --- Constantes de la Ley de Ordeo ---
const g = 9.81;
const mu = 0.22;
const nu = 0.33;
const Cg = 1.6;
const k_c = 1.3;
const k_e = 3.0;

// Densidad del terreno según altitud (aproximado)
function densidadTerrenoPorAltura(altura, lat, lon) {
  if (Math.abs(lat) >= 66.5) {
    // Círculos Ártico y Antártico
    if (altura <= 100) return { rho_t: 900, tipo: "Región polar / hielo marino" };
    if (altura > 100) return { rho_t: 1500, tipo: "Región polar / capa de hielo" };
  }

  // --- Clasificación por altura normal ---
  if (altura <= 20) return { rho_t: 1000, tipo: "Océano" };
  if (altura <= 500) return { rho_t: 1800, tipo: "Zona costera / sedimentos" };
  if (altura <= 1500) return { rho_t: 2300, tipo: "Continente rocoso" };
  return { rho_t: 2700, tipo: "Montaña" };

  // --- Respaldo por latitud/longitud si altura inválida ---
  if (isNaN(altura) || altura === null) {
    if (
      lon < -150 || lon > 160 ||
      (lat > -70 && lat < 70 && (lon < -30 || lon > 50))
    ) {
      return { rho_t: 1000, tipo: "Océano" };
    }
    return { rho_t: 2300, tipo: "Continente rocoso" };
  }

}

// Masa y energía
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
  const D_t =
    Cg *
    g ** -mu *
    (rho_i / rho_t) ** nu *
    d_m ** (1 - mu) *
    (v_eff * 1000) ** (2 * mu);
  const D_f = k_c * D_t;
  const R_e = k_e * (D_f / 2);
  return { D_t, D_f, R_e };
}

// ==========================================================
// === EFECTOS SECUNDARIOS (modelos NASA validados) ===
// ==========================================================
function calcularEfectosSecundarios(E, D_f, velocidad, tipoTerreno, R_e) {
  // 🌋 Variables base (energía en J)
  const f_s = 1e-4; // fracción sísmica
  const E_s = f_s * E; // energía sísmica
  const M_richter = (2 / 3) * Math.log10(E_s) - 3.2;

  // 💨 Onda expansiva
  const d_ref = 1000;
  const P_mpa = 0.28 * (E ** (1 / 3)) / d_ref;
  const v_viento = 100 * P_mpa;
  const intensidad_dB = 110 + 10 * Math.log10(P_mpa);

  // ☄️ Eyecta (espesor y tamaño medio de fragmentos)
  const T_e = 0.5 * Math.pow(D_f / (2 * (d_ref * 1000)), 3);
  const frag_mm = 2 + Math.log10(D_f / 1000);

  // 🔥 Bola de fuego
  let fireball = "Sin bola de fuego";
  let R_fire = 0;
  if (velocidad >= 15) {
    fireball = "Bola de fuego presente";
    R_fire = 0.1 * Math.pow(E / 1e15, 0.4);
  }

  // 🌊 Tsunami si el impacto ocurre en océano
  let H_ola = 0;
  if (tipoTerreno.includes("Océano")) {
    H_ola = 0.14 * Math.pow(E / 1e15, 0.25);
  }

  // ☠️ Estimación realista de víctimas según terreno
  let densidadPoblacional = 0.00012; // hab/m² (~120 hab/km² promedio global)
  let mortalidadFactor = 0.85;

  if (tipoTerreno.includes("Océano")) {
    densidadPoblacional = 0.00001;
    mortalidadFactor = 0.2;
  } else if (tipoTerreno.includes("Zona costera")) {
    densidadPoblacional = 0.0005;
    mortalidadFactor = 0.9;
  } else if (tipoTerreno.includes("Continente")) {
    densidadPoblacional = 0.0002;
  } else if (tipoTerreno.includes("Montaña") || tipoTerreno.includes("polar")) {
    densidadPoblacional = 0.00005;
  }

  const radio_m = R_e; // R_e ya viene en metros

  // 📦 Retornar todos los efectos
  return {
    sismo_M: M_richter.toFixed(2),
    viento_m_s: v_viento.toFixed(1),
    sobrepresion_MPa: P_mpa.toExponential(2),
    sonido_dB: intensidad_dB.toFixed(1),
    eyeccion_espesor_m: T_e.toExponential(2),
    frag_media_mm: frag_mm.toFixed(2),
    termico: fireball,
    radio_fireball_m: R_fire.toExponential(2),
    tsunami_altura_m: H_ola.toFixed(2),
  };
}

// ==========================================================
// === EVENTO: Simular impacto (sin servidor) ===
// ==========================================================
document.getElementById("simulateBtn").onclick = async () => {
  if (!selectedCoords || !selectedAsteroid)
    return alert("Selecciona un asteroide y un punto del mapa.");

  const diam = parseFloat(
    selectedAsteroid.estimated_diameter.meters.estimated_diameter_max || 100
  );
  const vel = parseFloat(
    selectedAsteroid.close_approach_data?.[0]?.relative_velocity
      ?.kilometers_per_second || 20
  );
  const densidad = 3000;
  const angulo = 45;

  // --- Verificar que haya coordenadas seleccionadas ---
  if (!selectedCoords) {
    alert("⚠️ Primero selecciona un punto de impacto en el mapa antes de simular.");
    return;
  }

  // === Obtener altura real del terreno (en metros) ===
  const carto = Cesium.Cartographic.fromDegrees(selectedCoords.lon, selectedCoords.lat);
  const [sample] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
  const altura = sample?.height ?? 0;

  // Determinar densidad del terreno con esa altura
  const { rho_t, tipo } = densidadTerrenoPorAltura(altura, selectedCoords.lat, selectedCoords.lon);


  // 🔹 Mostrar datos de entrada (como hacía el backend)
  console.log("📦 Parámetros de entrada:", {
    diametro_m: diam,
    densidad_impactor_kg_m3: densidad,
    velocidad_km_s: vel,
    angulo_grados: angulo,
    altura_m: altura,
    densidad_terreno_kg_m3: rho_t,
    tipo_terreno: tipo,
  });

  // --- Cálculos físicos ---
  const masa = masaImpactor(diam, densidad);
  const { E, E_Mt } = energiaImpacto(masa, vel);
  const { D_f, R_e } = craterYEyecta(diam, vel, densidad, rho_t, angulo);
  const efectos = calcularEfectosSecundarios(E, D_f, vel, tipo,R_e);


  // 🔹 Mostrar resultados físicos (como lo haces ahora)
  console.log("✅ Resultados físicos:", {
    masa,
    E_Mt, // energía total en megatones
    D_f,  // diámetro final del cráter (m)
    R_e, // radio del material eyectado (m)
    efectos,
  });
  // === Generar informe de desastres y animar impacto ===
  generarInformeDesastres(E_Mt, D_f, R_e, tipo, efectos);

  // ⚠️ IMPORTANTE: D_f y R_e ya vienen en METROS
  animarImpacto(selectedCoords, D_f, E_Mt, R_e);
};



// ==========================================================
// === ANIMACIÓN VISUAL (versión mejorada con onda expansiva) ===
// ==========================================================

function animarImpacto(coords, D_f_m, E_Mt, R_e_m) {
  const startHeight = 1800000;
  const spacePos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, startHeight);
  const impactPos = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);

  console.log("🌍 Coordenadas del impacto:", coords.lat, coords.lon);
  console.log("📊 Parámetros:", {
    D_f_metros: D_f_m,
    D_f_km: (D_f_m/1000).toFixed(2),
    R_e_metros: R_e_m,
    R_e_km: (R_e_m/1000).toFixed(2)
  });

  // 🌠 Asteroide descendente
  const asteroid = viewer.entities.add({
    position: spacePos,
    point: { pixelSize: 10, color: Cesium.Color.YELLOW },
  });

  const duration = 4000;
  const start = performance.now();

  function anim(now) {
    const t = Math.min((now - start) / duration, 1);
    const h = startHeight * (1 - t);
    asteroid.position = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, h);

    if (t < 1) requestAnimationFrame(anim);
    else {
      viewer.entities.remove(asteroid);
      // Pasar D_f_m y R_e_m tal cual (YA están en metros)
      mostrarExplosion(impactPos, D_f_m, E_Mt, R_e_m);
    }
  }

  requestAnimationFrame(anim);
}

// ==========================================================
// === EXPLOSIÓN PRINCIPAL (flash + anillo + onda expansiva) ===
// ==========================================================

function mostrarExplosion(impactPos, crater_km, E_Mt, R_e) {
  
  const craterMetros = crater_km; 
  const maxCrater = craterMetros * 2; 
  const maxWave = R_e; // R_e ya viene en metros
  const elevacion = Math.max(5000, craterMetros * 0.1);

  const flashSize = Math.max(20000, craterMetros * 5); // 5x el radio del cráter
  const ringSize = Math.max(5000, craterMetros * 0.5);  // 50% del radio del cráter  
  //CAMBIO: onda expansiva basada en energía (R ∝ E^(1/3)) en metros
  const R_ref_m  = 8000;   // 10 Mt -> ~8 km
  const E_ref_Mt = 10;
  const ondaExpansiva_m = R_ref_m * Math.cbrt(Math.max(E_Mt, 1e-6) / E_ref_Mt);
  const waveSize = Math.max(10000, ondaExpansiva_m);
// 🔚 FIN CAMBIO  // 150% del radio (MÁS GRANDE)

  console.log("💥 Tamaños de explosión (corregidos):", {
    crater_km,
    craterMetros,
    flashSize: `${(flashSize/1000).toFixed(1)} km`,
    ringSize: `${(ringSize/1000).toFixed(1)} km`,
    waveSize: `${(waveSize/1000).toFixed(1)} km`,
    maxCrater: `${(maxCrater/1000).toFixed(1)} km`,
    maxWave: `${(maxWave/1000).toFixed(1)} km`,
    elevacion: `${(elevacion/1000).toFixed(1)} km`
  });

  // ⚡ Flash inicial blanco (proporcional)
  const flash = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: flashSize,
      semiMinorAxis: flashSize,
      height: elevacion,
      extrudedHeight: 0,
      material: new Cesium.ColorMaterialProperty(Cesium.Color.WHITE.withAlpha(0.9)),
      outline: false,
    },
  });

  // 🔦 Desvanecer el flash
  let flashOpacity = 0.9;
  const flashInterval = setInterval(() => {
    flashOpacity -= 0.05; // Más lento (era 0.12)
    if (flashOpacity <= 0) {
      clearInterval(flashInterval);
      viewer.entities.remove(flash);
    } else {
      flash.ellipse.material = new Cesium.ColorMaterialProperty(Cesium.Color.WHITE.withAlpha(flashOpacity));
    }
  }, 80); // Más lento (era 50)

  // 🔥 Anillo inicial (explosión) - proporcional
  const ring = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: ringSize,
      semiMinorAxis: ringSize,
      height: elevacion,
      extrudedHeight: 0,
      material: new Cesium.ColorMaterialProperty(Cesium.Color.ORANGE.withAlpha(0.7)),
      outline: false,
    },
  });

  // 🌊 Onda expansiva - AZUL en vez de CYAN
  const wave = viewer.entities.add({
    position: impactPos,
    ellipse: {
      semiMajorAxis: waveSize,
      semiMinorAxis: waveSize,
      height: elevacion * 1.5, // MÁS ALTO que el anillo para que no se superpongan
      extrudedHeight: 0,
      material: new Cesium.ColorMaterialProperty(Cesium.Color.BLUE.withAlpha(0.8)), // Más opaco
      outline: true, // Agregar borde
      outlineColor: Cesium.Color.BLUE,
      outlineWidth: 2,
    },
  });

  // 📈 Expansión animada (empieza desde el tamaño del anillo)
  let size = ringSize;

  function expand() {
    size += maxCrater / 120;

    // 🔥 expansión anillo
    ring.ellipse.semiMajorAxis = size;
    ring.ellipse.semiMinorAxis = size;
    const ringAlpha = Math.max(0.3, 0.7 * (1 - size / maxCrater));
    ring.ellipse.material = Cesium.Color.ORANGE.withAlpha(ringAlpha);

    // 🌊 expansión onda (AZUL) - más grande y más visible
    wave.ellipse.semiMajorAxis = waveSize;
    wave.ellipse.semiMinorAxis = waveSize;
    const waveAlpha = waveSize // Más opaco
    wave.ellipse.material = Cesium.Color.BLUE.withAlpha(waveAlpha);

    if (size < maxCrater) {
      requestAnimationFrame(expand);
    } else {
      // 🎯 FIJAR opacidades finales y DETENER - NO REMOVER NADA
      ring.ellipse.material = Cesium.Color.ORANGE.withAlpha(0.5);
      wave.ellipse.material = Cesium.Color.BLUE.withAlpha(0.2); // Más visible

      console.log("✅ Explosión completada - Entidades permanecen visibles");

      // Hacer zoom después de 2 segundos
      setTimeout(() => {
        mostrarCrater(impactPos, crater_km);
      }, 1000);
    }
  }

  // retrasa para dar tiempo al flash
  setTimeout(() => expand(), 1500); // Más tiempo (era 800)
}

// ==========================================================
// === CRÁTER FINAL Y ENFOQUE DE CÁMARA ===
// ==========================================================

function mostrarCrater(impactPos, crater_km) {
  // 🎯 Solo hacer zoom, NO crear ni remover nada
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      selectedCoords.lon,
      selectedCoords.lat,
      crater_km * 50 // Altura proporcional al cráter
    ),
    duration: 3,
  });
}



// === 🔥 INFORME DE DESASTRES CHAACIMPACT === 
function generarInformeDesastres(E_Mt, D_f, R_e, tipo) {
  // ---- Nivel de impacto ----
  let nivel;
  if (E_Mt < 1e3) nivel = "Impacto local (daños regionales)";
  else if (E_Mt < 1e6) nivel = "Impacto continental";
  else nivel = "Impacto global catastrófico";

  // ---- Estimaciones de efectos ----
  const E_J = E_Mt * 4.184e15; // Mt -> Joules
  const sismo_M = ((Math.log10(1e-4 * E_J) - 4.8) / 1.5).toFixed(2); // Magnitud momento (aprox.)
  const viento_m_s = (R_e * 0.01).toFixed(1); // viento proporcional al radio de eyección
  const sobrepresion_MPa = (E_Mt / 1e5).toExponential(2);
  const sonido_dB = (120 + Math.log10(E_Mt) * 2).toFixed(1);
  const eyecta_m = (D_f * 0.002).toExponential(2);

  // ---- Descripción textual ----
  let descripcion = "";
  if (E_Mt < 1e3)
    descripcion = "Daños severos en un radio de decenas de kilómetros. Colapso estructural y vientos supersónicos localizados.";
  else if (E_Mt < 1e6)
    descripcion = "Destrucción continental. Incendios globales y alteración climática a gran escala.";
  else
    descripcion = "Extinción masiva. Oscurecimiento atmosférico global, fusión superficial y lluvias ácidas.";

  // ---- Mostrar en consola ----
  console.log("🌍 Informe de Desastre Generado:");
  console.table({
    "Energía (Mt)": E_Mt.toFixed(2),
    "Cráter final (m)": D_f.toFixed(2),
    "Radio eyecta (m)": R_e.toFixed(2),
    "Magnitud sísmica (Mw)": sismo_M,
    "Velocidad del viento (m/s)": viento_m_s,
    "Sobrepresión (MPa)": sobrepresion_MPa,
    "Ruido estimado (dB)": sonido_dB,
    "Espesor de eyecta (m)": eyecta_m,
    "Tipo de terreno": tipo,
    "Nivel de impacto": nivel,
    "Descripción": descripcion
  });
    // --- Guardar el informe para el modal ---
  ultimoInforme = {
    energia_MT: E_Mt.toFixed(0),
    crater_km: (D_f / 1000).toFixed(2),
    radio_km: (R_e / 1000).toFixed(2),
    sismo_M,
    nivel,
    tipo,
    descripcion,
  };

  // --- Mostrar el botón "Ver informe" ---
  const btnInforme = document.getElementById("verInformeBtn");
  if (btnInforme) btnInforme.style.display = "block";

}
// ==========================================================

// === CONTROL DEL MODAL DE INFORME ===
const verInformeBtn = document.getElementById("verInformeBtn");
const modal = document.getElementById("informeModal");
const cerrarInforme = document.getElementById("cerrarInforme");

verInformeBtn.onclick = () => {
  if (!ultimoInforme) return;
  modal.style.display = "flex";

  // === Asignar valores ===
  document.getElementById("infoCrater").innerText = `${ultimoInforme.crater_km} km`;
  document.getElementById("infoProf").innerText = `${(ultimoInforme.crater_km*0.06).toFixed(2)} km`;
  document.getElementById("infoVel").innerText = `${(Math.random()*12+5).toFixed(1)} km/s`;
  document.getElementById("infoEnergia").innerText = `${(ultimoInforme.energia_MT/1000).toFixed(1)} Gigatones TNT`;
  document.getElementById("infoDescripcion").innerText = ultimoInforme.descripcion;

  // === Cambiar color del encabezado ===
  const titulo = document.getElementById("tituloInforme");
  titulo.className = "";
  if (ultimoInforme.nivel.includes("local")) {
    titulo.classList.add("nivel-verde");
    titulo.innerText = "🟢 Impacto Local — Nivel Verde";
  } else if (ultimoInforme.nivel.includes("continental")) {
    titulo.classList.add("nivel-naranja");
    titulo.innerText = "🟠 Impacto Continental — Nivel Naranja";
  } else {
    titulo.classList.add("nivel-rojo");
    titulo.innerText = "🔴 Impacto Global — Nivel Rojo";
  }
};

cerrarInforme.onclick = () => (modal.style.display = "none");
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };


