/* ================== SIMULADOR NEO EARTH-CENTERED ================== */
/* Sistema de referencia centrado en la Tierra con escala configurable */

/* -------------------- CONSTANTES FÍSICAS -------------------- */
const AU = 1.495978707e11; // metros
const MU_SUN = 1.32712440018e20; // m³/s²
const NASA_API_KEY = 'Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B';
const NASA_BASE = 'https://api.nasa.gov/neo/rest/v1';
const EARTH_RADIUS = 6.371e6; // metros
const EARTH_RADIUS_KM = 6371; // km

/* -------------------- CONFIGURACIÓN DE ESCALA -------------------- */
// Escalas disponibles: 1 unidad de render = X km
const SCALE_OPTIONS = {
  '1k': { km: 1e3, label: '1,000 km/unidad' },
  '10k': { km: 1e4, label: '10,000 km/unidad' },
  '100k': { km: 1e5, label: '100,000 km/unidad' },
  '1M': { km: 1e6, label: '1,000,000 km/unidad (1 Mkm)' },
  '10M': { km: 1e7, label: '10,000,000 km/unidad (10 Mkm)' }
};

let currentRenderScale = 1e6; // Por defecto: 1 unidad = 1 Mkm
let segmentsOrbit = 256; // Segmentos por órbita
let samplesClosest = 1500; // Muestras para análisis de acercamiento

/* -------------------- CONTROL TEMPORAL -------------------- */
let timeStep = 86400 * 2 / 50; // 2 días por frame (configurable)
let isPaused = false;
let timeSpeed = 1.0; // Multiplicador de velocidad

/* -------------------- ESTADO GLOBAL -------------------- */
let asteroids = [];
let selectedAsteroid = null;
let currentResults = null;
let selectedStrategyIndex = 0;
let simulationTime = 0;
let earth, asteroidMesh, scene, camera, renderer, controls, animationId;
let originalOrbitLine, newOrbitLine, currentNewOrbit;
let asteroidMarker, earthMarker, encounterLine;
let visualizationMode = 'realistic';
let exaggerationFactor = 1;
let earthOrbitLine, asteroidOrbitLine, earthOrbitAroundSun;

// AGREGAR al inicio del archivo, después de las otras declaraciones globales:

/* -------------------- MODO JUEGO -------------------- */
let gameMode = false;
let gameStartTime = 0;
let gameTimeLimit = 0; // en segundos
let gameTimeRemaining = 0; // NUEVO: tiempo restante
let gameOver = false;
let gameWon = false;
let originalAsteroidOrbit = null;
// También agregar mean_motion_rad_s al objeto earthOrbit:
/* -------------------- PROPIEDADES MATERIALES -------------------- */
const materialProperties = {
  "silicato": { ablationEfficiency: 0.10, ionEfficiency: 0.15, exhaustVelocity: 30000 },
  "condrita": { ablationEfficiency: 0.12, ionEfficiency: 0.18, exhaustVelocity: 32000 },
  "carbonáceo": { ablationEfficiency: 0.08, ionEfficiency: 0.12, exhaustVelocity: 28000 },
  "metálico": { ablationEfficiency: 0.15, ionEfficiency: 0.22, exhaustVelocity: 35000 }
};

/* -------------------- CONVERSIÓN DE UNIDADES -------------------- */
// Convertir metros a unidades de render
const metersToRenderUnits = (meters) => (meters / 1000) / currentRenderScale;

// Convertir km a unidades de render
const kmToRenderUnits = (km) => km / currentRenderScale;

// Formatear distancias en escala humana
const formatDistance = (meters) => {
  const km = meters / 1000;
  if (km >= 1e6) return `${(km/1e6).toFixed(2)} Mkm`;
  if (km >= 1e3) return `${(km/1e3).toFixed(1)} k km`;
  return `${km.toFixed(0)} km`;
};

/* -------------------- UTILIDADES -------------------- */
const computeMassFromDiameter = (d, density = 2000) => {
  if (!d || d <= 0) return null;
  const r = d / 2;
  return (4/3) * Math.PI * Math.pow(r, 3) * density;
};

const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

const fmt = (value, unit = '', decimals = 2) => {
  if (value == null || typeof value !== 'number' || !isFinite(value)) 
    return String(value) + (unit ? ' ' + unit : '');
  if (Math.abs(value) < 1e-12) value = 0;
  const abs = Math.abs(value);
  const options = { 
    maximumFractionDigits: abs >= 1000 ? 2 : abs < 0.01 && abs > 0 ? 6 : decimals 
  };
  return value.toLocaleString('es-ES', options) + (unit ? ' ' + unit : '');
};

const fmtSmart = (value, unit) => {
  if (unit === 'm') {
    return Math.abs(value) >= 1000 ? fmt(value/1000, 'km', 2) : fmt(value, 'm', 0);
  }
  if (unit === 'kg') {
    if (Math.abs(value) >= 1e9) return fmt(value/1e9, 'mil millones t', 2);
    if (Math.abs(value) >= 1e6) return fmt(value/1e6, 'millones t', 2);
    if (Math.abs(value) >= 1000) return fmt(value/1000, 't', 2);
    return fmt(value, 'kg', 0);
  }
  if (unit === 'm/s') return fmt(value, 'm/s', 2);
  return fmt(value, unit, 2);
};

/* -------------------- API NASA (SIN CAMBIOS) -------------------- */
async function fetchFromNASA(pathOrId) {
  try {
    let url;
    if (/^\d+$/.test(String(pathOrId))) {
      url = `${NASA_BASE}/neo/${encodeURIComponent(pathOrId)}?api_key=${NASA_API_KEY}`;
    } else if (String(pathOrId).startsWith('/')) {
      url = `${NASA_BASE}${pathOrId}${pathOrId.includes('?') ? '&' : '?'}api_key=${NASA_API_KEY}`;
    } else {
      url = `${NASA_BASE}/neo/${encodeURIComponent(pathOrId)}?api_key=${NASA_API_KEY}`;
    }
    console.log('Fetching NASA:', url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('fetchFromNASA error:', err);
    return null;
  }
}

async function loadNeos(query = '') {
  const select = document.getElementById('neoSelect');
  if (!select) return;
  
  select.disabled = true;
  select.innerHTML = '<option>Buscando en NASA NEOs...</option>';
  
  const q = query.trim();
  const results = [];

  try {
    if (/^\d+$/.test(q)) {
      const data = await fetchFromNASA(q);
      if (data) {
        const diameter = data.estimated_diameter?.meters
          ? (data.estimated_diameter.meters.estimated_diameter_min + 
             data.estimated_diameter.meters.estimated_diameter_max) / 2
          : null;
        results.push({ 
          id: data.neo_reference_id || data.id, 
          name: data.name, 
          diameter_m: diameter 
        });
      }
    }

    if (results.length === 0 && q.length > 0) {
      const resp = await fetchFromNASA('/neo/browse?page=0&size=200');
      if (resp?.near_earth_objects) {
        resp.near_earth_objects
          .filter(n => n.name?.toLowerCase().includes(q.toLowerCase()))
          .forEach(n => {
            const diameter = n.estimated_diameter?.meters
              ? (n.estimated_diameter.meters.estimated_diameter_min + 
                 n.estimated_diameter.meters.estimated_diameter_max) / 2
              : null;
            results.push({ 
              id: n.neo_reference_id || n.id, 
              name: n.name, 
              diameter_m: diameter 
            });
          });
      }
    }

    asteroids = results;
    select.innerHTML = '';
    
    if (asteroids.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'No se encontraron resultados';
      opt.disabled = true;
      select.appendChild(opt);
    } else {
      asteroids.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.text = `${n.name}${n.diameter_m ? ` • ${Math.round(n.diameter_m)} m` : ''}`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('loadNeos error:', err);
    select.innerHTML = '<option disabled>Error al consultar NASA</option>';
  } finally {
    select.disabled = false;
  }
}

async function fetchNeoById(id) {
  try {
    const data = await fetchFromNASA(id);
    if (!data) return null;

    const od = data.orbital_data || {};
    const orbital = od.semi_major_axis ? {
      a_au: parseFloat(od.semi_major_axis),
      e: parseFloat(od.eccentricity || 0),
      i_deg: parseFloat(od.inclination || 0),
      Omega_deg: parseFloat(od.ascending_node_longitude || 0),
      omega_deg: parseFloat(od.perihelion_argument || 0),
      M_deg: parseFloat(od.mean_anomaly || 0),
      epoch: od.epoch_osculation
    } : null;

    const diameter = data.estimated_diameter?.meters
      ? (data.estimated_diameter.meters.estimated_diameter_min + 
         data.estimated_diameter.meters.estimated_diameter_max) / 2
      : 500;

    const density = 2000;
    const mass = computeMassFromDiameter(diameter, density);

    const asteroid = {
      id: data.neo_reference_id || data.id || id,
      name: data.name,
      fullName: data.name,
      diameter,
      mass,
      density,
      material: 'silicato',
      orbital
    };

    if (orbital?.a_au) {
      const st = orbitalElementsToStateVectors(
        orbital.a_au, orbital.e, orbital.i_deg,
        orbital.Omega_deg, orbital.omega_deg, orbital.M_deg
      );
      asteroid.position_m = st.r;
      asteroid.velocity_vector = st.v;
      asteroid.velocity = Math.hypot(...st.v);
      asteroid.nu = st.nu;
    } else {
      asteroid.velocity = 25000;
    }

    return asteroid;
  } catch (err) {
    console.error('fetchNeoById error:', err);
    return null;
  }
}

/* -------------------- CÁLCULOS ORBITALES (KEPLER) -------------------- */
function solveKeplerMeanToE(M_rad, e, tol = 1e-12, maxIter = 100) {
  let E = e < 0.8 ? M_rad : Math.PI;
  for (let k = 0; k < maxIter; k++) {
    const f = E - e * Math.sin(E) - M_rad;
    const fp = 1 - e * Math.cos(E);
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function orbitalElementsToStateVectors(a_au, e, i_deg, Omega_deg, omega_deg, M_deg, mu = MU_SUN) {
  const a = a_au * AU;
  const i = toRad(i_deg || 0);
  const Omega = toRad(Omega_deg || 0);
  const omega = toRad(omega_deg || 0);
  const M = toRad(M_deg || 0);

  const E = solveKeplerMeanToE(M, e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const sqrt1me2 = Math.sqrt(Math.max(0, 1 - e * e));
  const nu = Math.atan2(sqrt1me2 * sinE, cosE - e);

  const r_mag = a * (1 - e * cosE);
  const x_pf = r_mag * Math.cos(nu);
  const y_pf = r_mag * Math.sin(nu);

  const h = Math.sqrt(mu * a * (1 - e * e));
  const vx_pf = -(mu / h) * Math.sin(nu);
  const vy_pf = (mu / h) * (e + Math.cos(nu));

  const rotate = ([x, y, z]) => {
    const c1 = Math.cos(omega), s1 = Math.sin(omega);
    let [x1, y1, z1] = [c1*x - s1*y, s1*x + c1*y, z];
    
    const c2 = Math.cos(i), s2 = Math.sin(i);
    let [x2, y2, z2] = [x1, c2*y1 - s2*z1, s2*y1 + c2*z1];
    
    const c3 = Math.cos(Omega), s3 = Math.sin(Omega);
    return [c3*x2 - s3*y2, s3*x2 + c3*y2, z2];
  };

  return { 
    r: rotate([x_pf, y_pf, 0]), 
    v: rotate([vx_pf, vy_pf, 0]), 
    nu, 
    r_mag 
  };
}

function stateVectorsToOrbitalElements(r_vec, v_vec, mu = MU_SUN) {
  const r_mag = Math.hypot(...r_vec);
  const v_mag = Math.hypot(...v_vec);

  const h_vec = [
    r_vec[1] * v_vec[2] - r_vec[2] * v_vec[1],
    r_vec[2] * v_vec[0] - r_vec[0] * v_vec[2],
    r_vec[0] * v_vec[1] - r_vec[1] * v_vec[0]
  ];
  const h_mag = Math.hypot(...h_vec);

  const i = Math.acos(h_vec[2] / h_mag);
  let Omega = Math.atan2(h_vec[0], -h_vec[1]);
  if (Omega < 0) Omega += 2 * Math.PI;

  const E = (v_mag * v_mag) / 2 - mu / r_mag;
  const a = -mu / (2 * E);

  const e_vec_term1 = v_mag * v_mag - mu / r_mag;
  const e_vec_term2 = (r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2]);
  const e_vec = [
      (e_vec_term1 * r_vec[0] - e_vec_term2 * v_vec[0]) / mu,
      (e_vec_term1 * r_vec[1] - e_vec_term2 * v_vec[1]) / mu,
      (e_vec_term1 * r_vec[2] - e_vec_term2 * v_vec[2]) / mu,
  ];
  const e = Math.hypot(...e_vec);

  let omega;
  if (e > 1e-9) {
      const n_vec = [-h_vec[1], h_vec[0], 0];
      const n_mag = Math.hypot(...n_vec);
      const n_dot_e = n_vec[0]*e_vec[0] + n_vec[1]*e_vec[1];
      omega = Math.acos(n_dot_e / (n_mag * e));
      if (e_vec[2] < 0) omega = 2 * Math.PI - omega;
  } else {
      omega = 0;
  }

  let nu;
  if (e > 1e-9) {
      const r_dot_e = r_vec[0]*e_vec[0] + r_vec[1]*e_vec[1] + r_vec[2]*e_vec[2];
      nu = Math.acos(r_dot_e / (r_mag * e));
      const r_dot_v = r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2];
      if (r_dot_v < 0) nu = 2 * Math.PI - nu;
  } else {
      nu = Math.atan2(r_vec[1]*Math.cos(Omega) - r_vec[0]*Math.sin(Omega), r_vec[0]*Math.cos(Omega) + r_vec[1]*Math.sin(Omega));
  }
  
  return {
    a_au: a / AU, e, i_deg: toDeg(i),
    Omega_deg: toDeg(Omega), omega_deg: toDeg(omega),
    nu_deg: toDeg(nu)
  };
}

/* -------------------- ÓRBITA DE LA TIERRA (J2000) -------------------- */
const earthOrbit = {
  a_au: 1.000001018,
  e: 0.0167086,
  i_deg: 0.00005,
  Omega_deg: -11.26064,
  omega_deg: 102.94719,
  M_deg: 100.46435,
  mean_motion_rad_s: Math.sqrt(MU_SUN / Math.pow(1.000001018 * AU, 3)) // AGREGAR ESTO
};

/* -------------------- ANÁLISIS DE ACERCAMIENTO (EARTH-CENTERED) -------------------- */
function sampleClosestApproach(orbit, samples = null) {
  const actualSamples = samples || samplesClosest;
  let minDist = Infinity;
  let minM = 0;
  let stateAtMin = null;
  let earthStateAtMin = null;
  let timeAtMin = 0;

  const M0 = orbit.M_deg || 0;
  const a_m = orbit.a_au * AU;
  const period_ne = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
  const a_e_m = earthOrbit.a_au * AU;
  const n_earth = Math.sqrt(MU_SUN / Math.pow(a_e_m, 3));

  for (let k = 0; k <= actualSamples; k++) {
    const frac = k / actualSamples;
    const M_deg = (M0 + frac * 360) % 360;
    const t = frac * period_ne;

    const M_earth_rad = toRad(earthOrbit.M_deg) + n_earth * t;
    const M_earth_deg = ((toDeg(M_earth_rad) % 360) + 360) % 360;

    const st_ne = orbitalElementsToStateVectors(
      orbit.a_au, orbit.e || 0, orbit.i_deg || 0,
      orbit.Omega_deg || 0, orbit.omega_deg || 0, M_deg
    );
    const st_earth = orbitalElementsToStateVectors(
      earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg,
      earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_deg
    );

    const dx = st_ne.r[0] - st_earth.r[0];
    const dy = st_ne.r[1] - st_earth.r[1];
    const dz = (st_ne.r[2] || 0) - (st_earth.r[2] || 0);
    const dist = Math.hypot(dx, dy, dz);

    if (dist < minDist) {
      minDist = dist;
      minM = M_deg;
      stateAtMin = st_ne;
      earthStateAtMin = st_earth;
      timeAtMin = t;
    }
  }

  return { 
    minDist, 
    minDist_km: minDist / 1000,
    minM, 
    stateAtMin, 
    earthStateAtMin, 
    timeAtMin 
  };
}

function estimateRequiredDeltaV(orbit, desiredMissMeters, options = {}) {
  const {
    directions = ['tangential', 'radial', 'normal'],
    dv_test = 0.5,
    samples = null
  } = options;

  const actualSamples = samples || samplesClosest;
  const base = sampleClosestApproach(orbit, actualSamples);
  const baseDist = base.minDist;
  const requiredExtra = Math.max(0, desiredMissMeters - baseDist);

  if (requiredExtra <= 0) {
    return { requiredDV: 0, direction: null, baseDist, reason: 'Ya cumple la distancia deseada' };
  }

  const results = directions.map(dir => {
    const orbitAtApplication = { ...orbit, M_deg: base.minM };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, dv_test, dir);
    const changed = sampleClosestApproach(newOrbit, actualSamples);
    const deltaMiss = changed.minDist - baseDist;
    const sens = deltaMiss / dv_test;
    const requiredDV = (sens > 1e-12) ? Math.abs(requiredExtra / sens) : Infinity;
    return { dir, sens, requiredDV, baseDist, newDist: changed.minDist, deltaMiss };
  });

  results.sort((a, b) => a.requiredDV - b.requiredDV);

  return {
    requiredDV: results[0].requiredDV,
    direction: results[0].dir,
    details: results,
    baseDist
  };
}

/* -------------------- ACTUALIZACIÓN ORBITAL -------------------- */
function updateOrbitAfterDeltaV(initialOrbit, dv_ms, direction = 'tangential') {
  const st0 = orbitalElementsToStateVectors(
      initialOrbit.a_au, initialOrbit.e, initialOrbit.i_deg,
      initialOrbit.Omega_deg, initialOrbit.omega_deg, initialOrbit.M_deg
  );
  const { r: r0_vec, v: v0_vec } = st0;
  
  const v0_mag = Math.hypot(...v0_vec);
  const v_tangential_dir = v0_vec.map(c => c / v0_mag);
  
  let v_new_vec;
  if (direction === 'tangential') {
      v_new_vec = v0_vec.map((c, i) => c + v_tangential_dir[i] * dv_ms);
  } else {
      v_new_vec = v0_vec.map((c, i) => c + v_tangential_dir[i] * dv_ms);
  }

  const newOrbitElements = stateVectorsToOrbitalElements(r0_vec, v_new_vec);
  return newOrbitElements;
}

/* -------------------- ESTRATEGIAS DE MITIGACIÓN -------------------- */
const calculateKineticImpact = (asteroid, timeSeconds) => {
  const impactorMass = 500;
  const impactorVelocity = 1000000;
  const beta = 1.9;
  const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
  const deltaV = (beta * impactorMass * impactorVelocity) / mass;

  let deviation = null;
  let earthRadii = null;

  if (asteroid.orbital?.a_au) {
    const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
    const encounterApproach = sampleClosestApproach(asteroid.orbital);
    const a_m = asteroid.orbital.a_au * AU;
    const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
    const M_encounter_rad = toRad(encounterApproach.minM);
    const n = 2 * Math.PI / period_s;
    const M_application_rad = M_encounter_rad - n * timeBeforeEncounter;
    const M_application_deg = ((toDeg(M_application_rad) % 360) + 360) % 360;
    
    const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV, 'tangential');
    const M_new_encounter_rad = toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter;
    const M_new_encounter_deg = ((toDeg(M_new_encounter_rad) % 360) + 360) % 360;
    const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
    const newApproach = sampleClosestApproach(newOrbitAtEncounter);
    
    deviation = newApproach.minDist - encounterApproach.minDist;
    earthRadii = deviation / EARTH_RADIUS;
  } else {
    deviation = deltaV * timeSeconds;
    earthRadii = deviation / EARTH_RADIUS;
  }

  return {
    method: "Impacto Cinético",
    formula: "Δv = (β × m_impactor × v_impactor) / m_asteroide",
    parameters: {
      "Masa impactor": `${impactorMass} kg`,
      "Vel. impactor": `${impactorVelocity} m/s`,
      "β": beta,
      "Masa asteroide": fmtSmart(mass, 'kg'),
      "Tiempo anticipación": `${(timeSeconds/(365.25*24*3600)).toFixed(1)} años`
    },
    deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
  };
};

const calculateGravitationalTractor = (asteroid, timeSeconds) => {
  const spacecraftMass = 20000;
  const operationDistance = 100;
  const G = 6.674e-11;
  const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
  const force = (G * spacecraftMass * mass) / (operationDistance * operationDistance);
  const acceleration = force / mass;
  const deltaV = acceleration * timeSeconds;

  let deviation = null;
  let earthRadii = null;

  if (asteroid.orbital?.a_au) {
    const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
    const encounterApproach = sampleClosestApproach(asteroid.orbital);
    const a_m = asteroid.orbital.a_au * AU;
    const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
    const M_encounter_rad = toRad(encounterApproach.minM);
    const n = 2 * Math.PI / period_s;
    const M_application_rad = M_encounter_rad - n * timeBeforeEncounter;
    const M_application_deg = ((toDeg(M_application_rad) % 360) + 360) % 360;
    
    const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV, 'tangential');
    const M_new_encounter_rad = toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter;
    const M_new_encounter_deg = ((toDeg(M_new_encounter_rad) % 360) + 360) % 360;
    const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
    const newApproach = sampleClosestApproach(newOrbitAtEncounter);
    
    deviation = newApproach.minDist - encounterApproach.minDist;
    earthRadii = deviation / EARTH_RADIUS;
  }

  return {
    method: "Tractor Gravitacional",
    formula: "F = G × m_nave × m_asteroide / r²; Δv = (F/m) × t",
    parameters: {
      "Masa nave": `${spacecraftMass} kg`,
      "Distancia operación": `${operationDistance} m`,
      "G": `${G.toExponential(3)}`
    },
    deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
  };
};

const calculateLaserAblation = (asteroid, timeSeconds) => {
  const laserPower = 1e6;
  const mat = materialProperties[asteroid.material] || materialProperties['silicato'];
  const efficiency = mat.ablationEfficiency;
  const ablationVelocity = 1000;
  const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
  const massFlow = (laserPower * efficiency) / (0.5 * ablationVelocity * ablationVelocity);
  const deltaV = (massFlow * ablationVelocity * timeSeconds) / mass;

  let deviation = null;
  let earthRadii = null;

  if (asteroid.orbital?.a_au) {
    const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
    const encounterApproach = sampleClosestApproach(asteroid.orbital);
    const a_m = asteroid.orbital.a_au * AU;
    const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
    const M_encounter_rad = toRad(encounterApproach.minM);
    const n = 2 * Math.PI / period_s;
    const M_application_rad = M_encounter_rad - n * timeBeforeEncounter;
    const M_application_deg = ((toDeg(M_application_rad) % 360) + 360) % 360;
    
    const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV, 'tangential');
    const M_new_encounter_rad = toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter;
    const M_new_encounter_deg = ((toDeg(M_new_encounter_rad) % 360) + 360) % 360;
    const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
    const newApproach = sampleClosestApproach(newOrbitAtEncounter);
    
    deviation = newApproach.minDist - encounterApproach.minDist;
    earthRadii = deviation / EARTH_RADIUS;
  }

  return {
    method: "Ablación Láser",
    formula: "Δv = (ṁ × v_ablation × t) / m_asteroide",
    parameters: {
      "Potencia láser": `${(laserPower/1e6).toFixed(1)} MW`,
      "Material": asteroid.material,
      "Eficiencia": `${(efficiency*100).toFixed(1)}%`,
      "v_abla": `${ablationVelocity} m/s`,
      "ṁ": massFlow.toExponential(2)
    },
    deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
  };
};

const calculateIonBeam = (asteroid, timeSeconds) => {
  const beamPower = 5e5;
  const mat = materialProperties[asteroid.material] || materialProperties['silicato'];
  const efficiency = mat.ionEfficiency;
  const exhaustVelocity = mat.exhaustVelocity;
  const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
  const thrust = (2 * beamPower * efficiency) / exhaustVelocity;
  const acc = thrust / mass;
  const deltaV = acc * timeSeconds;

  let deviation = null;
  let earthRadii = null;

  if (asteroid.orbital?.a_au) {
    const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
    const encounterApproach = sampleClosestApproach(asteroid.orbital);
    const a_m = asteroid.orbital.a_au * AU;
    const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
    const M_encounter_rad = toRad(encounterApproach.minM);
    const n = 2 * Math.PI / period_s;
    const M_application_rad = M_encounter_rad - n * timeBeforeEncounter;
    const M_application_deg = ((toDeg(M_application_rad) % 360) + 360) % 360;
    
    const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV, 'tangential');
    const M_new_encounter_rad = toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter;
    const M_new_encounter_deg = ((toDeg(M_new_encounter_rad) % 360) + 360) % 360;
    const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
    const newApproach = sampleClosestApproach(newOrbitAtEncounter);
    
    deviation = newApproach.minDist - encounterApproach.minDist;
    earthRadii = deviation / EARTH_RADIUS;
  }

  return {
    method: "Haz de Iones",
    formula: "F = (2 × P × η) / v_exhaust; Δv = (F/m) × t",
    parameters: {
      "Potencia": `${(beamPower/1e3).toFixed(0)} kW`,
      "Eficiencia": `${(efficiency*100).toFixed(1)}%`,
      "v_exhaust": `${exhaustVelocity} m/s`,
      "Empuje": thrust.toExponential(2)
    },
    deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
  };
};

const calculateNuclearExplosion = (asteroid, timeSeconds) => {
  const yieldMegatons = 1;
  const yieldJ = yieldMegatons * 4.184e15;
  const efficiency = 0.05;
  const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
  const energyTransferred = yieldJ * efficiency;
  const deltaV = Math.sqrt((2 * energyTransferred) / mass);

  let deviation = null;
  let earthRadii = null;

  if (asteroid.orbital?.a_au) {
    const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
    const encounterApproach = sampleClosestApproach(asteroid.orbital);
    const a_m = asteroid.orbital.a_au * AU;
    const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
    const M_encounter_rad = toRad(encounterApproach.minM);
    const n = 2 * Math.PI / period_s;
    const M_application_rad = M_encounter_rad - n * timeBeforeEncounter;
    const M_application_deg = ((toDeg(M_application_rad) % 360) + 360) % 360;
    
    const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV, 'tangential');
    const M_new_encounter_rad = toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter;
    const M_new_encounter_deg = ((toDeg(M_new_encounter_rad) % 360) + 360) % 360;
    const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
    const newApproach = sampleClosestApproach(newOrbitAtEncounter);
    
    deviation = newApproach.minDist - encounterApproach.minDist;
    earthRadii = deviation / EARTH_RADIUS;
  }

  return {
    method: "Explosión Nuclear",
    formula: "Δv = √(2 × E_transferred / m_asteroide)",
    parameters: {
      "Yield": `${yieldMegatons} Mt`,
      "E_total": `${yieldJ.toExponential(2)} J`,
      "Eficiencia": `${(efficiency*100)}%`
    },
    deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
  };
};

/* -------------------- MODIFICAR ÓRBITA PARA COLISIÓN -------------------- */
function makeOrbitCollide(asteroid, daysUntilImpact = 180) {
  if (!asteroid?.orbital) return null;
  
  // Guardar órbita original
  originalAsteroidOrbit = JSON.parse(JSON.stringify(asteroid.orbital));
  
  const timeToImpact = daysUntilImpact * 86400;
  
  console.log('🎯 Creando escenario de colisión en', daysUntilImpact, 'días');
  
  // PASO 1: Calcular dónde estará la Tierra en el momento del impacto
  const a_e_m = earthOrbit.a_au * AU;
  const n_earth = Math.sqrt(MU_SUN / Math.pow(a_e_m, 3));
  const M_earth_now = toRad(earthOrbit.M_deg);
  const M_earth_future_rad = M_earth_now + n_earth * timeToImpact;
  const M_earth_future_deg = ((toDeg(M_earth_future_rad) % 360) + 360) % 360;
  
  // Calcular posición exacta de la Tierra en el futuro
  const earthFutureState = orbitalElementsToStateVectors(
    earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg,
    earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_future_deg
  );
  
  const earthFuturePos = earthFutureState.r;
  const r_earth_target = Math.hypot(...earthFuturePos);
  
  console.log('🌍 Posición futura de la Tierra:');
  console.log('   t =', daysUntilImpact, 'días');
  console.log('   M =', M_earth_future_deg.toFixed(2), '°');
  console.log('   r =', (r_earth_target / AU).toFixed(6), 'AU');
  console.log('   xyz =', [
    (earthFuturePos[0] / AU).toFixed(4),
    (earthFuturePos[1] / AU).toFixed(4),
    (earthFuturePos[2] / AU).toFixed(4)
  ]);
  
  // PASO 2: Crear una órbita que pase por ese punto exacto
  // Usamos una órbita que cruza la terrestre
  
  // Queremos que el asteroide esté en r ≈ r_earth en el momento del impacto
  // Crear una órbita elíptica que pase por r_earth_target
  
  const q_perihelio = 0.85;  // perihelio dentro de la órbita terrestre
  const Q_afelio = 1.15;     // afelio fuera de la órbita terrestre
  
  const a_collision = (q_perihelio + Q_afelio) / 2;
  const e_collision = (Q_afelio - q_perihelio) / (Q_afelio + q_perihelio);
  
  // Calcular período
  const a_collision_m = a_collision * AU;
  const period_collision = 2 * Math.PI * Math.sqrt(Math.pow(a_collision_m, 3) / MU_SUN);
  const n_collision = 2 * Math.PI / period_collision;
  
  console.log('');
  console.log('🛸 Órbita del asteroide:');
  console.log('   a =', a_collision.toFixed(4), 'AU');
  console.log('   e =', e_collision.toFixed(4));
  console.log('   Período =', (period_collision / 86400).toFixed(2), 'días');
  console.log('   q =', q_perihelio.toFixed(4), 'AU');
  console.log('   Q =', Q_afelio.toFixed(4), 'AU');
  
  // PASO 3: Calcular en qué anomalía verdadera el asteroide está a r = r_earth_target
  // r = a(1-e²)/(1 + e*cos(ν))
  // Despejando: cos(ν) = [a(1-e²)/r - 1] / e
  
  const r_target_au = r_earth_target / AU;
  const cos_nu_target = ((a_collision * (1 - e_collision * e_collision) / r_target_au) - 1) / e_collision;
  
  console.log('');
  console.log('🎯 Calculando punto de encuentro:');
  console.log('   r objetivo =', r_target_au.toFixed(6), 'AU');
  console.log('   cos(ν) =', cos_nu_target.toFixed(4));
  
  if (Math.abs(cos_nu_target) > 1) {
    console.warn('   ⚠️  No hay solución exacta, usando aproximación');
    // Forzar una órbita casi circular cerca de 1 AU
    asteroid.orbital = {
      a_au: 0.999,
      e: 0.003,
      i_deg: 0.0,
      Omega_deg: M_earth_future_deg,
      omega_deg: 0,
      M_deg: M_earth_future_deg - (toDeg(n_collision * timeToImpact) % 360),
      epoch: asteroid.orbital.epoch,
      mean_motion_rad_s: Math.sqrt(MU_SUN / Math.pow(0.999 * AU, 3))
    };
  } else {
    // Hay dos soluciones (el asteroide cruza dos veces)
    const nu_target_1 = Math.acos(cos_nu_target);
    const nu_target_2 = 2 * Math.PI - nu_target_1;
    
    // Elegir el cruce que ocurre DESPUÉS del perihelio (el primero)
    const nu_target = nu_target_1;
    
    console.log('   ν (anomalía verdadera) =', toDeg(nu_target).toFixed(2), '°');
    
    // PASO 4: Convertir ν a M (anomalía media)
    // ν → E → M
    const E_target = 2 * Math.atan(Math.sqrt((1 - e_collision) / (1 + e_collision)) * Math.tan(nu_target / 2));
    const M_target_rad = E_target - e_collision * Math.sin(E_target);
    const M_target_deg = ((toDeg(M_target_rad) % 360) + 360) % 360;
    
    console.log('   E (anomalía excéntrica) =', toDeg(E_target).toFixed(2), '°');
    console.log('   M (anomalía media) =', M_target_deg.toFixed(2), '°');
    
    // PASO 5: CLAVE - Calcular M inicial para que el asteroide llegue a M_target en timeToImpact
    // M(t) = M(0) + n*t
    // Queremos: M(timeToImpact) = M_target
    // Entonces: M(0) = M_target - n*timeToImpact
    
    const delta_M_rad = n_collision * timeToImpact;
    const delta_M_deg = toDeg(delta_M_rad);
    const M_initial_deg = ((M_target_deg - delta_M_deg) % 360 + 360) % 360;
    
    console.log('');
    console.log('⏱️  Sincronización temporal:');
    console.log('   ΔM (movimiento) =', delta_M_deg.toFixed(2), '° (', (delta_M_deg / 360).toFixed(2), 'órbitas)');
    console.log('   M inicial =', M_initial_deg.toFixed(2), '°');
    console.log('   M final (en t=' + daysUntilImpact + 'd) =', M_target_deg.toFixed(2), '°');
    console.log('   Tierra en t=' + daysUntilImpact + 'd: M =', M_earth_future_deg.toFixed(2), '°');
    
    // PASO 6: Alinear los nodos orbitales
    // Omega y omega deben alinear el cruce con la posición de la Tierra
    
    // Calcular el ángulo de la posición de la Tierra en coordenadas heliocéntricas
    const lon_earth = Math.atan2(earthFuturePos[1], earthFuturePos[0]);
    const lon_earth_deg = ((toDeg(lon_earth) % 360) + 360) % 360;
    
    // El argumento del perihelio debe colocar el cruce en esa longitud
    // lon = Omega + omega + nu
    // Queremos: lon_earth = Omega + omega + nu_target
    
    // Opción simple: Omega = 0, omega = lon_earth - nu_target
    const Omega_deg = 0;
    const omega_deg = ((lon_earth_deg - toDeg(nu_target)) % 360 + 360) % 360;
    
    console.log('');
    console.log('🧭 Alineación orbital:');
    console.log('   Longitud Tierra =', lon_earth_deg.toFixed(2), '°');
    console.log('   Ω (long. nodo asc.) =', Omega_deg.toFixed(2), '°');
    console.log('   ω (arg. perihelio) =', omega_deg.toFixed(2), '°');
    console.log('   ν (en encuentro) =', toDeg(nu_target).toFixed(2), '°');
    console.log('   Suma (Ω+ω+ν) =', ((Omega_deg + omega_deg + toDeg(nu_target)) % 360).toFixed(2), '°');
    
    // PASO 7: Configurar la órbita del asteroide
    asteroid.orbital = {
      a_au: a_collision,
      e: e_collision,
      i_deg: 0.0, // Mismo plano para garantizar encuentro
      Omega_deg: Omega_deg,
      omega_deg: omega_deg,
      M_deg: M_initial_deg,
      epoch: asteroid.orbital.epoch,
      mean_motion_rad_s: n_collision
    };
  }
  
  // VERIFICACIÓN FINAL
  console.log('');
  console.log('🔍 VERIFICANDO SINCRONIZACIÓN...');
  
  let minDist = Infinity;
  let minDistTime = 0;
  let minDistData = null;
  
  const verificationSteps = 5000; // Alta precisión
  
  for (let step = 0; step <= verificationSteps; step++) {
    const t = (step / verificationSteps) * timeToImpact * 1.2; // 120% del tiempo
    
    // Posición del asteroide en tiempo t
    const M_ast_rad = toRad(asteroid.orbital.M_deg) + asteroid.orbital.mean_motion_rad_s * t;
    const M_ast_deg = ((toDeg(M_ast_rad) % 360) + 360) % 360;
    
    const astState = orbitalElementsToStateVectors(
      asteroid.orbital.a_au, asteroid.orbital.e, asteroid.orbital.i_deg,
      asteroid.orbital.Omega_deg, asteroid.orbital.omega_deg, M_ast_deg
    );
    
    // Posición de la Tierra en tiempo t
    const M_earth_rad = toRad(earthOrbit.M_deg) + n_earth * t;
    const M_earth_deg = ((toDeg(M_earth_rad) % 360) + 360) % 360;
    
    const earthState = orbitalElementsToStateVectors(
      earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg,
      earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_deg
    );
    
    // Distancia entre el asteroide y la Tierra
    const dist = Math.hypot(
      astState.r[0] - earthState.r[0],
      astState.r[1] - earthState.r[1],
      astState.r[2] - earthState.r[2]
    );
    
    if (dist < minDist) {
      minDist = dist;
      minDistTime = t;
      minDistData = {
        t_days: t / 86400,
        dist_km: dist / 1000,
        dist_RE: dist / EARTH_RADIUS,
        M_ast: M_ast_deg,
        M_earth: M_earth_deg,
        r_ast_AU: Math.hypot(...astState.r) / AU,
        r_earth_AU: Math.hypot(...earthState.r) / AU
      };
    }
  }
  
  console.log('');
  console.log('✅ RESULTADO FINAL:');
  console.log('   Distancia mínima:', formatDistance(minDist));
  console.log('   Radios terrestres:', (minDist / EARTH_RADIUS).toFixed(3), 'R⊕');
  console.log('   Tiempo del encuentro:', (minDistTime / 86400).toFixed(2), 'días (esperado:', daysUntilImpact, 'd)');
  console.log('   Diferencia temporal:', Math.abs(minDistTime / 86400 - daysUntilImpact).toFixed(2), 'días');
  
  if (minDistData) {
    console.log('');
    console.log('📊 Detalles del encuentro:');
    console.log('   M asteroide =', minDistData.M_ast.toFixed(2), '°');
    console.log('   M Tierra =', minDistData.M_earth.toFixed(2), '°');
    console.log('   r asteroide =', minDistData.r_ast_AU.toFixed(6), 'AU');
    console.log('   r Tierra =', minDistData.r_earth_AU.toFixed(6), 'AU');
  }
  
  if (minDist < EARTH_RADIUS * 2) {
    console.log('   💥 COLISIÓN / IMPACTO DIRECTO');
  } else if (minDist < EARTH_RADIUS * 5) {
    console.log('   ⚠️  ACERCAMIENTO PELIGROSO');
  } else {
    console.log('   ❌ PASA MUY LEJOS - Ajustar parámetros');
  }
  
  // Doble verificación con función existente
  const finalCheck = sampleClosestApproach(asteroid.orbital, 5000);
  console.log('');
  console.log('🔄 Doble verificación:', formatDistance(finalCheck.minDist), '(', (finalCheck.minDist/EARTH_RADIUS).toFixed(3), 'R⊕)');
  
  return asteroid;
}

function startGameMode() {
  if (!selectedAsteroid?.orbital) {
    alert('Primero selecciona un asteroide');
    return;
  }
  
  const days = parseInt(document.getElementById('gameDaysInput')?.value) || 180;
  
  // Modificar órbita para colisión
  makeOrbitCollide(selectedAsteroid, days);
  
  // Configurar juego
  gameMode = true;
  gameStartTime = Date.now();
  gameTimeLimit = days * 86400; // convertir días a segundos de juego
  gameTimeRemaining = gameTimeLimit;
  gameOver = false;
  gameWon = false;
  simulationTime = 0;
  isPaused = false;
  
  // Actualizar visualización
  updateOriginalOrbitUnified(selectedAsteroid.orbital);
  
  // Verificar aproximación
  const approach = sampleClosestApproach(selectedAsteroid.orbital);
  updateClosestApproachMarkers(approach);
  
  const minDistEl = document.getElementById('minDistanceInfo');
  if (minDistEl) {
    const earthRadii = approach.minDist / EARTH_RADIUS;
    minDistEl.innerHTML = `<span style="color: ${earthRadii < 1 ? '#ff4444' : '#ffaa00'}">
      ⚠️ IMPACTO: ${formatDistance(approach.minDist)} (${earthRadii.toFixed(2)} R⊕)
    </span>`;
  }
  
  // Mostrar alerta en vizInfo
  const vizInfo = document.getElementById('vizInfo');
  if (vizInfo) {
    vizInfo.innerHTML = `
      <div style="background: rgba(255,50,50,0.8); padding: 12px; border-radius: 6px; border: 2px solid #ff4444;">
        <div style="font-size: 1.2rem; font-weight: bold; color: white; margin-bottom: 8px;">
          🚨 ALERTA DE IMPACTO INMINENTE
        </div>
        <div style="font-size: 0.95rem; color: #ffeeee;">
          Tiempo disponible: <strong>${days} días</strong><br>
          Calcula estrategias y aplica una deflexión
        </div>
      </div>
    `;
  }
  
  updateEncounterGraph();
  autoFrameScene();
  
  console.log(`🎮 Modo juego iniciado: ${days} días para evitar impacto`);
}

function checkGameStatus() {
  if (!gameMode || gameOver) return;
  
  // Actualizar tiempo restante
  gameTimeRemaining = gameTimeLimit - simulationTime;
  
  // Actualizar cronómetro
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) {
    const daysRemaining = gameTimeRemaining / 86400;
    const hoursRemaining = (gameTimeRemaining % 86400) / 3600;
    
    let timerColor = '#00ff88';
    if (daysRemaining < 30) timerColor = '#ffaa00';
    if (daysRemaining < 10) timerColor = '#ff4444';
    
    timerEl.innerHTML = `
      <div style="font-size: 1.1rem; font-weight: bold; color: ${timerColor};">
        ⏱️ ${Math.floor(daysRemaining)}d ${Math.floor(hoursRemaining)}h restantes
      </div>
    `;
  }
  
  // Verificar si se acabó el tiempo de simulación
  if (simulationTime >= gameTimeLimit) {
    // Determinar qué órbita verificar (modificada o original)
    const orbitToCheck = currentNewOrbit || selectedAsteroid.orbital;
    
    // Verificación final con alta precisión
    const finalApproach = sampleClosestApproach(orbitToCheck, 5000);
    const finalMiss = finalApproach.minDist;
    
    console.log('🎮 Fin del juego');
    console.log('📊 Distancia final:', formatDistance(finalMiss));
    console.log('🎯 Órbita usada:', currentNewOrbit ? 'MODIFICADA' : 'ORIGINAL');
    
    // Umbral de éxito: más de 2 radios terrestres
    const SUCCESS_THRESHOLD = EARTH_RADIUS * 2;
    
    if (finalMiss < SUCCESS_THRESHOLD) {
      gameWon = false;
      gameOver = true;
      
      if (currentNewOrbit) {
        showGameResult(false, finalMiss, 'La estrategia fue insuficiente');
      } else {
        showGameResult(false, finalMiss, 'No se aplicó ninguna estrategia');
      }
    } else {
      gameWon = true;
      gameOver = true;
      showGameResult(true, finalMiss, currentNewOrbit ? 'Estrategia exitosa' : 'El asteroide pasó de forma segura');
    }
    
    isPaused = true;
  }
}

function showGameResult(won, finalDistance, reason = '') {
  const vizInfo = document.getElementById('vizInfo');
  if (!vizInfo) return;
  
  if (won) {
    vizInfo.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(0,255,100,0.95), rgba(0,200,150,0.95)); padding: 25px; border-radius: 12px; text-align: center; border: 3px solid #00ff88;">
        <h2 style="margin: 0 0 15px 0; color: white; font-size: 2rem;">🎉 ¡MISIÓN EXITOSA!</h2>
        <div style="font-size: 1.3rem; margin-bottom: 15px; color: white; font-weight: 600;">
          Has salvado la Tierra
        </div>
        <div style="font-size: 1.1rem; color: #eeffee; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; margin-bottom: 15px;">
          <strong>Distancia final:</strong><br>
          ${formatDistance(finalDistance)}<br>
          <span style="font-size: 1.3rem;">(${(finalDistance/EARTH_RADIUS).toFixed(2)} R⊕)</span>
        </div>
        ${reason ? `<div style="font-size: 0.95rem; color: #ccffdd; margin-bottom: 15px;">✓ ${reason}</div>` : ''}
        <button onclick="resetGame()" style="margin-top: 10px; padding: 14px 28px; font-size: 1.15rem; cursor: pointer; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: none; border-radius: 8px; color: white; font-weight: 700;">
          🔄 Nueva Misión
        </button>
      </div>
    `;
  } else {
    const impactType = finalDistance < EARTH_RADIUS * 0.5 ? 'IMPACTO DIRECTO' : 'PASO PELIGROSO';
    
    vizInfo.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(255,50,50,0.95), rgba(200,0,0,0.95)); padding: 25px; border-radius: 12px; text-align: center; border: 3px solid #ff4444;">
        <h2 style="margin: 0 0 15px 0; color: white; font-size: 2rem;">💥 GAME OVER</h2>
        <div style="font-size: 1.3rem; margin-bottom: 15px; color: white; font-weight: 600;">
          ${impactType}
        </div>
        <div style="font-size: 1.1rem; color: #ffeeee; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; margin-bottom: 15px;">
          <strong>Distancia mínima:</strong><br>
          ${formatDistance(finalDistance)}<br>
          <span style="font-size: 1.3rem;">(${(finalDistance/EARTH_RADIUS).toFixed(2)} R⊕)</span>
        </div>
        ${reason ? `<div style="font-size: 0.95rem; color: #ffdddd; margin-bottom: 15px;">⚠️ ${reason}</div>` : ''}
        <div style="font-size: 0.9rem; color: #ffcccc; margin-bottom: 15px;">
          Necesitas > 2 R⊕ para tener éxito
        </div>
        <button onclick="resetGame()" style="margin-top: 10px; padding: 14px 28px; font-size: 1.15rem; cursor: pointer; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; border-radius: 8px; color: white; font-weight: 700;">
          🔄 Reintentar
        </button>
      </div>
    `;
  }
  
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) {
    timerEl.innerHTML = '<div style="color: #888;">Simulación completada</div>';
  }
}

function resetGame() {
  gameMode = false;
  gameOver = false;
  gameWon = false;
  simulationTime = 0;
  gameTimeRemaining = 0;
  
  // Restaurar órbita original si existe
  if (originalAsteroidOrbit && selectedAsteroid) {
    selectedAsteroid.orbital = JSON.parse(JSON.stringify(originalAsteroidOrbit));
    selectedAsteroid.orbital.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(selectedAsteroid.orbital.a_au * AU, 3));
    updateOriginalOrbitUnified(selectedAsteroid.orbital);
  }
  
  // Limpiar órbita modificada
  if (newOrbitLine && scene) {
    scene.remove(newOrbitLine);
    newOrbitLine = null;
  }
  currentNewOrbit = null;
  
  // Limpiar cronómetro
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) {
    timerEl.innerHTML = '';
  }
  
  // Restaurar vizInfo
  const vizInfo = document.getElementById('vizInfo');
  if (vizInfo) {
    vizInfo.innerHTML = 'Selecciona un asteroide y calcula estrategias para visualizar la deflexión';
  }
  
  const minDistEl = document.getElementById('minDistanceInfo');
  if (minDistEl && selectedAsteroid?.orbital) {
    const approach = sampleClosestApproach(selectedAsteroid.orbital);
    minDistEl.textContent = `Mín: ${formatDistance(approach.minDist)} (${(approach.minDist/EARTH_RADIUS).toFixed(2)} R⊕)`;
  }
  
  console.log('🔄 Juego reseteado');
}

/* -------------------- THREE.JS VISUALIZACIÓN (EARTH-CENTERED) -------------------- */
function initThreeUnified() {
    const canvas = document.getElementById('canvas3d');
    if (!canvas) {
        console.warn('No canvas3d encontrado.');
        return;
    }

    const { clientWidth: width, clientHeight: height } = canvas;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030515);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000);
    
    const initialDistance = kmToRenderUnits(500000);
    camera.position.set(initialDistance, initialDistance * 0.5, initialDistance * 0.5);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = kmToRenderUnits(10000);
    controls.maxDistance = kmToRenderUnits(10000000);

    scene.add(new THREE.AmbientLight(0x404040, 1.2));
    const pointLight = new THREE.PointLight(0xffeeaa, 2.0, 0);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);
    
    // La Tierra
    earth = new THREE.Mesh(
        new THREE.SphereGeometry(kmToRenderUnits(EARTH_RADIUS_KM), 32, 32),
        new THREE.MeshStandardMaterial({ 
            color: 0x2a9eff,
            emissive: 0x1a5ebb,
            emissiveIntensity: 0.3
        })
    );
    earth.position.set(0, 0, 0);
    scene.add(earth);

    asteroidMesh = new THREE.Mesh(
        new THREE.SphereGeometry(kmToRenderUnits(EARTH_RADIUS_KM) * 0.2, 12, 12),
        new THREE.MeshStandardMaterial({ 
            color: 0xff9500,
            emissive: 0xff6600,
            emissiveIntensity: 0.4
        })
    );
    scene.add(asteroidMesh);

    // Crear el Sol
    createSunSprite();
    
    // Crear la órbita de la Tierra (ESTÁTICA, se moverá con el Sol)
    earthOrbitAroundSun = createEarthOrbitAroundSun();
    scene.add(earthOrbitAroundSun);
    
    // Crear marcador de posición de la Tierra en su órbita
    createEarthPositionMarker();
    
    console.log('🌍 Órbita de la Tierra creada (referencia visual)');

    const gridSize = kmToRenderUnits(1000000);
    const gridDivisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    window.addEventListener('resize', onWindowResizeUnified);
    animateUnified();
    
    console.log('✅ Three.js inicializado - Cámara en posición:', camera.position);
}

// NUEVA FUNCIÓN: Crear el Sol como Sprite 2D
let sunSprite, sunGlow;

function createSunSprite() {
    // Canvas para el sol principal
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Gradiente radial para el sol
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 220, 100, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 180, 50, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 140, 20, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    sunSprite = new THREE.Sprite(material);
    
    // Tamaño del sprite basado en la escala
    const sunVisualSize = kmToRenderUnits(2000000); // 2M km visual
    sunSprite.scale.set(sunVisualSize, sunVisualSize, 1);
    
    scene.add(sunSprite);
    
    // Glow adicional (resplandor más grande y sutil)
    const canvasGlow = document.createElement('canvas');
    canvasGlow.width = 256;
    canvasGlow.height = 256;
    const ctxGlow = canvasGlow.getContext('2d');
    
    const gradientGlow = ctxGlow.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradientGlow.addColorStop(0, 'rgba(255, 200, 100, 0.3)');
    gradientGlow.addColorStop(0.5, 'rgba(255, 150, 50, 0.1)');
    gradientGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    
    ctxGlow.fillStyle = gradientGlow;
    ctxGlow.fillRect(0, 0, 256, 256);
    
    const textureGlow = new THREE.CanvasTexture(canvasGlow);
    const materialGlow = new THREE.SpriteMaterial({ 
        map: textureGlow,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    sunGlow = new THREE.Sprite(materialGlow);
    sunGlow.scale.set(sunVisualSize * 2.5, sunVisualSize * 2.5, 1);
    
    scene.add(sunGlow);
    
    console.log('☀️ Sol sprite creado');
}

function createEarthOrbitAroundSun() {
    const points = [];
    const segments = 720; // Más segmentos para una curva más suave
    
    // Usar directamente los vectores de estado para obtener puntos precisos
    for (let i = 0; i <= segments; i++) {
        const M_deg = (i / segments) * 360;
        
        // Calcular la posición EXACTA usando los elementos orbitales de la Tierra
        const state = orbitalElementsToStateVectors(
            earthOrbit.a_au, 
            earthOrbit.e, 
            earthOrbit.i_deg,
            earthOrbit.Omega_deg, 
            earthOrbit.omega_deg, 
            M_deg
        );
        
        points.push(new THREE.Vector3(
            metersToRenderUnits(state.r[0]),
            metersToRenderUnits(state.r[1]),
            metersToRenderUnits(state.r[2])
        ));
    }
  
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Línea sólida y más visible
    const material = new THREE.LineBasicMaterial({ 
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.5,
        linewidth: 2
    });
  
    const line = new THREE.Line(geometry, material);
    
    return line;
}

let earthPositionMarker;

function createEarthPositionMarker() {
  // Marcador simple sin el aro verde
  const geometry = new THREE.SphereGeometry(kmToRenderUnits(15000), 16, 16);
  const material = new THREE.MeshBasicMaterial({ 
    color: 0x00ffaa,
    transparent: true,
    opacity: 0.6,
    emissive: 0x00aa88,
    emissiveIntensity: 0.5
  });
  
  earthPositionMarker = new THREE.Mesh(geometry, material);
  scene.add(earthPositionMarker);
  
  return earthPositionMarker;
}

function createTextLabel(text, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.font = 'Bold 24px Arial';
    context.textAlign = 'center';
    context.fillText(text, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.5, 0.125, 1);
    
    return sprite;
}

/**
 * Crea una línea de órbita heliocéntrica (alrededor del Sol en 0,0,0).
 * Dibuja la elipse objetiva en el espacio.
 */
/**
 * Dibuja la órbita elíptica objetiva (heliocéntrica) en el espacio.
 * Los puntos se calculan en METROS para que la escala funcione correctamente.
 */
function createOrbitLine(orbit, color, dashed = false) {
    const points = [];
    const segments = segmentsOrbit;

    for (let i = 0; i <= segments; i++) {
        const M_deg = (i / segments) * 360;

        const state = orbitalElementsToStateVectors(
            orbit.a_au, orbit.e || 0, orbit.i_deg || 0,
            orbit.Omega_deg || 0, orbit.omega_deg || 0, M_deg
        );
        
        // CORRECCIÓN: Convertir a unidades de render
        points.push(new THREE.Vector3(
            metersToRenderUnits(state.r[0]),
            metersToRenderUnits(state.r[1]),
            metersToRenderUnits(state.r[2])
        ));
    }
  
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed
        ? new THREE.LineDashedMaterial({ 
            color, 
            dashSize: kmToRenderUnits(5e6),    // CAMBIAR: ahora en unidades de render
            gapSize: kmToRenderUnits(3e6),     // CAMBIAR: ahora en unidades de render
            linewidth: 2 
        })
        : new THREE.LineBasicMaterial({ color, linewidth: 2 });
  
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
  
    return line;
}

function updateOriginalOrbitUnified(orbitalData) {
    if (!scene) return;
    if (originalOrbitLine) scene.remove(originalOrbitLine);
    originalOrbitLine = createOrbitLine(orbitalData, 0x6fb5ff, true); // Llama a la función correcta
    scene.add(originalOrbitLine);
}

// AHORA USA createHeliocentricOrbitLine para ser coherente con el resto del simulador.
function updateNewOrbitUnified(orbitData) {
    if (!scene) return;
    currentNewOrbit = orbitData;
    if (newOrbitLine) scene.remove(newOrbitLine);
    newOrbitLine = createOrbitLine(orbitData, 0x00ff88, false); // Llama a la función correcta
    scene.add(newOrbitLine);
    updateEncounterGraph();
}

function onWindowResizeUnified() {
  const canvas = document.getElementById('canvas3d');
  if (!canvas || !camera || !renderer) return;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

const earthHeliocentricPos_m = new THREE.Vector3();

function animateUnified() {
    animationId = requestAnimationFrame(animateUnified);
    controls.update();

    if (!isPaused) {
        simulationTime += timeStep * timeSpeed;
    }

    const M0_e_rad = toRad(earthOrbit.M_deg);
    const M_e_current_rad = M0_e_rad + earthOrbit.mean_motion_rad_s * simulationTime;
    const earthState = orbitalElementsToStateVectors(
        earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, 
        earthOrbit.Omega_deg, earthOrbit.omega_deg, toDeg(M_e_current_rad)
    );
    earthHeliocentricPos_m.set(earthState.r[0], earthState.r[1], earthState.r[2]);

    earth.position.set(0, 0, 0);

    // Calcular offset UNA VEZ (redondeado para evitar vibraciones de precisión flotante)
    const earthOffsetX = Math.round(-metersToRenderUnits(earthHeliocentricPos_m.x) * 1e6) / 1e6;
    const earthOffsetY = Math.round(-metersToRenderUnits(earthHeliocentricPos_m.y) * 1e6) / 1e6;
    const earthOffsetZ = Math.round(-metersToRenderUnits(earthHeliocentricPos_m.z) * 1e6) / 1e6;

    // Actualizar posición del Sol (centro del sistema)
    if (sunSprite) {
        sunSprite.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
        
        if (sunGlow) {
            sunGlow.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
        }
    }
    
    // CRÍTICO: Actualizar la órbita SIN recrearla (solo mover)
    if (earthOrbitAroundSun) {
        earthOrbitAroundSun.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
    }
    
    // El marcador está en el origen (donde está la Tierra en nuestra vista geocéntrica)
    if (earthPositionMarker) {
        earthPositionMarker.position.set(0, 0, 0);
    }

    if (selectedAsteroid?.orbital) {
        const orb = selectedAsteroid.orbital;
        const M0_rad = toRad(orb.M_deg || 0);
        
        if (!orb.mean_motion_rad_s) {
            const a_m = orb.a_au * AU;
            orb.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(a_m, 3));
        }
        
        const M_current_rad = M0_rad + orb.mean_motion_rad_s * simulationTime;
        const asteroidState = orbitalElementsToStateVectors(
            orb.a_au, orb.e, orb.i_deg, 
            orb.Omega_deg, orb.omega_deg, toDeg(M_current_rad)
        );
        
        const relX = asteroidState.r[0] - earthHeliocentricPos_m.x;
        const relY = asteroidState.r[1] - earthHeliocentricPos_m.y;
        const relZ = asteroidState.r[2] - earthHeliocentricPos_m.z;

        asteroidMesh.position.set(
            metersToRenderUnits(relX),
            metersToRenderUnits(relY),
            metersToRenderUnits(relZ)
        );
        
        const distance_m = Math.hypot(relX, relY, relZ);
        updateDistanceDisplay(distance_m);
    }
    
    if (originalOrbitLine) {
        originalOrbitLine.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
        originalOrbitLine.visible = true;
    }
    
    if (newOrbitLine) {
        newOrbitLine.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
        newOrbitLine.visible = true;
    }

    if (gameMode && !gameOver) {
      checkGameStatus();
    }

    renderer.render(scene, camera);
}

function autoFrameScene() {
    if (!selectedAsteroid?.orbital || !camera || !controls) return;
    
    // Calcular el tamaño aproximado de la órbita
    const a_render = selectedAsteroid.orbital.a_au * AU / 1000 / currentRenderScale;
    const earthRadius_render = kmToRenderUnits(EARTH_RADIUS_KM);
    
    // Distancia de cámara basada en el semi-eje mayor
    const maxDimension = Math.max(a_render * 2, earthRadius_render * 10);
    const distance = maxDimension * 1.5;
    
    // Posicionar cámara para ver toda la órbita
    camera.position.set(distance, distance * 0.7, distance * 0.7);
    controls.target.set(0, 0, 0);
    controls.update();
    
    console.log(`📷 Cámara ajustada: distancia=${distance.toFixed(2)} unidades`);
}

function updateDistanceDisplay(distance_m) {
  const distEl = document.getElementById('currentDistance');
  if (distEl) {
    const earthRadii = distance_m / EARTH_RADIUS;
    distEl.innerHTML = `
      Distancia actual: <strong>${formatDistance(distance_m)}</strong>
      (<strong>${earthRadii.toFixed(2)} R⊕</strong>)
    `;
  }
}

// AHORA USA las coordenadas absolutas (heliocéntricas) para los marcadores
function updateClosestApproachMarkers(approachData) {
    if (!scene || !approachData.stateAtMin || !approachData.earthStateAtMin) return;

    if (!asteroidMarker) {
        const geometry = new THREE.SphereGeometry(kmToRenderUnits(5000), 16, 16); // CAMBIAR tamaño
        const material = new THREE.MeshBasicMaterial({ color: 0xff4747 });
        asteroidMarker = new THREE.Mesh(geometry, material);
        scene.add(asteroidMarker);
    }

    if (!earthMarker) {
        const geometry = new THREE.SphereGeometry(kmToRenderUnits(5000), 16, 16); // CAMBIAR tamaño
        const material = new THREE.MeshBasicMaterial({ color: 0x47d1ff });
        earthMarker = new THREE.Mesh(geometry, material);
        scene.add(earthMarker);
    }

    // CORRECCIÓN: Usar metersToRenderUnits en lugar de /AU
    const asteroidPos = approachData.stateAtMin.r;
    asteroidMarker.position.set(
        metersToRenderUnits(asteroidPos[0] - approachData.earthStateAtMin.r[0]),
        metersToRenderUnits(asteroidPos[1] - approachData.earthStateAtMin.r[1]),
        metersToRenderUnits(asteroidPos[2] - approachData.earthStateAtMin.r[2])
    );

    const earthPos = approachData.earthStateAtMin.r;
    earthMarker.position.set(0, 0, 0); // La Tierra siempre en el origen
}

function updateScaleIndicator() {
  const indicator = document.getElementById('scaleIndicator');
  if (indicator) {
    indicator.textContent = `Escala: 1 unidad = ${(currentRenderScale/1000).toFixed(0)} k km`;
  }
}

function focusOnEncounter() {
  if (!selectedAsteroid?.orbital || !controls) return;
  
  const approach = sampleClosestApproach(selectedAsteroid.orbital);
  const r_neo = approach.stateAtMin.r;
  const r_earth = approach.earthStateAtMin.r;
  const r_rel_x = r_neo[0] - r_earth[0];
  const r_rel_y = r_neo[1] - r_earth[1];
  const r_rel_z = (r_neo[2] || 0) - (r_earth[2] || 0);
  
  const distance = metersToRenderUnits(Math.hypot(r_rel_x, r_rel_y, r_rel_z)) * 2;
  
  camera.position.set(
    metersToRenderUnits(r_rel_x) + distance * 0.5,
    metersToRenderUnits(r_rel_y) + distance * 0.3,
    metersToRenderUnits(r_rel_z) + distance * 0.3
  );
  
  controls.target.set(
    metersToRenderUnits(r_rel_x) * 0.5,
    metersToRenderUnits(r_rel_y) * 0.5,
    metersToRenderUnits(r_rel_z) * 0.5
  );
  controls.update();
}

/* -------------------- GRÁFICO DE ENCUENTRO -------------------- */
function updateEncounterGraph() {
  const canvas = document.getElementById('encounterGraph');
  if (!canvas || !selectedAsteroid?.orbital) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, width, height);
  
  const daysRange = 60;
  const samples = 200;
  
  const baseApproach = sampleClosestApproach(selectedAsteroid.orbital);
  const encounterTime = baseApproach.timeAtMin;
  
  const originalData = [];
  const modifiedData = [];
  
  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const t = encounterTime + (fraction - 0.5) * daysRange * 86400;
    
    const a_m = selectedAsteroid.orbital.a_au * AU;
    const period = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
    const M_rad = toRad(selectedAsteroid.orbital.M_deg) + (2 * Math.PI / period) * t;
    const M_deg = ((toDeg(M_rad) % 360) + 360) % 360;
    
    const stateAst = orbitalElementsToStateVectors(
      selectedAsteroid.orbital.a_au, selectedAsteroid.orbital.e,
      selectedAsteroid.orbital.i_deg, selectedAsteroid.orbital.Omega_deg,
      selectedAsteroid.orbital.omega_deg, M_deg
    );
    
    const a_e_m = earthOrbit.a_au * AU;
    const n_earth = Math.sqrt(MU_SUN / Math.pow(a_e_m, 3));
    const M_earth_rad = toRad(earthOrbit.M_deg) + n_earth * t;
    const M_earth_deg = ((toDeg(M_earth_rad) % 360) + 360) % 360;
    
    const stateEarth = orbitalElementsToStateVectors(
      earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg,
      earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_deg
    );
    
    const dist = Math.hypot(
      stateAst.r[0] - stateEarth.r[0],
      stateAst.r[1] - stateEarth.r[1],
      stateAst.r[2] - stateEarth.r[2]
    );
    
    originalData.push({ t: (fraction - 0.5) * daysRange, dist });
    
    if (currentNewOrbit) {
      const stateNew = orbitalElementsToStateVectors(
        currentNewOrbit.a_au, currentNewOrbit.e,
        currentNewOrbit.i_deg || 0, currentNewOrbit.Omega_deg || 0,
        currentNewOrbit.omega_deg || 0, M_deg
      );
      
      const distNew = Math.hypot(
        stateNew.r[0] - stateEarth.r[0],
        stateNew.r[1] - stateEarth.r[1],
        stateNew.r[2] - stateEarth.r[2]
      );
      
      modifiedData.push({ t: (fraction - 0.5) * daysRange, dist: distNew });
    }
  }
  
  const allDists = [...originalData.map(d => d.dist), ...modifiedData.map(d => d.dist)];
  const minDist = Math.min(...allDists);
  const maxDist = Math.max(...allDists);
  const padding = (maxDist - minDist) * 0.1;
  
  const mapX = t => ((t + daysRange) / (2 * daysRange)) * (width - 80) + 40;
  const mapY = dist => height - 20 - ((dist - minDist + padding) / (maxDist - minDist + 2 * padding)) * (height - 40);
  
  // Ejes
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, height - 20);
  ctx.lineTo(width - 40, height - 20);
  ctx.moveTo(40, 20);
  ctx.lineTo(40, height - 20);
  ctx.stroke();
  
  // Etiquetas
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`-${daysRange}d`, 40, height - 5);
  ctx.fillText('Encuentro', width / 2, height - 5);
  ctx.fillText(`+${daysRange}d`, width - 40, height - 5);
  
  ctx.textAlign = 'right';
  ctx.fillText(formatDistance(minDist), 35, height - 20);
  ctx.fillText(formatDistance(maxDist), 35, 25);
  
  // Línea de 1 R⊕
  if (minDist < EARTH_RADIUS && maxDist > EARTH_RADIUS) {
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    const y = mapY(EARTH_RADIUS);
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(width - 40, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'left';
    ctx.fillText('1 R⊕', width - 35, y - 3);
  }
  
  // Curva original
  ctx.strokeStyle = '#6fb5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  originalData.forEach((point, i) => {
    const x = mapX(point.t);
    const y = mapY(point.dist);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Curva modificada
  if (modifiedData.length > 0) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    modifiedData.forEach((point, i) => {
      const x = mapX(point.t);
      const y = mapY(point.dist);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    const minOriginal = Math.min(...originalData.map(d => d.dist));
    const minModified = Math.min(...modifiedData.map(d => d.dist));
    
    const minOriginalPoint = originalData.find(d => d.dist === minOriginal);
    const minModifiedPoint = modifiedData.find(d => d.dist === minModified);
    
    ctx.fillStyle = '#6fb5ff';
    ctx.beginPath();
    ctx.arc(mapX(minOriginalPoint.t), mapY(minOriginalPoint.dist), 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(mapX(minModifiedPoint.t), mapY(minModifiedPoint.dist), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* -------------------- FUNCIONES UI -------------------- */
async function loadNeosHandler() {
  const q = document.getElementById('searchQuery')?.value?.trim() || '';
  await loadNeos(q);
}

async function fetchAndSelectNeo(id) {
    try {
        const neo = await fetchNeoById(id);
        if (!neo) {
            alert('No se pudo cargar el asteroide desde NASA');
            return;
        }

        selectedAsteroid = neo;
        simulationTime = 0;
        
        if (neo.orbital?.a_au) {
            const a_m = neo.orbital.a_au * AU;
            neo.orbital.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(a_m, 3));
        }
        
        console.log('Asteroide seleccionado:', neo);

        const detailsEl = document.getElementById('asteroidDetails');
        if (detailsEl) {
            detailsEl.innerHTML = `
              <strong>${neo.fullName || neo.name}</strong>
              <div style="margin-top:8px; line-height:1.6;">
                <div>🔍 Diámetro: ${fmtSmart(neo.diameter || 0, 'm')}</div>
                <div>⚖️ Masa: ${fmtSmart(neo.mass || 0, 'kg')}</div>
                <div>🚀 Velocidad: ${fmtSmart(neo.velocity || 0, 'm/s')}</div>
                ${neo.orbital ? `<div style="margin-top:6px; color:#9fc8ff;">
                  a: ${neo.orbital.a_au.toFixed(3)} AU • e: ${neo.orbital.e.toFixed(3)}
                </div>` : ''}
              </div>
            `;
        }

        if (originalOrbitLine) {
            scene.remove(originalOrbitLine);
            originalOrbitLine = null;
        }
        if (newOrbitLine) {
            scene.remove(newOrbitLine);
            newOrbitLine = null;
        }
        if (asteroidMarker) {
            scene.remove(asteroidMarker);
            asteroidMarker = null;
        }
        if (earthMarker) {
            scene.remove(earthMarker);
            earthMarker = null;
        }

        if (neo.orbital?.a_au) {
            originalOrbitLine = createOrbitLine(neo.orbital, 0x6fb5ff, true);
            scene.add(originalOrbitLine);

            const initialApproach = sampleClosestApproach(neo.orbital);
            updateClosestApproachMarkers(initialApproach);
            
            const minDistEl = document.getElementById('minDistanceInfo');
            if (minDistEl) {
                minDistEl.textContent = `Mín: ${formatDistance(initialApproach.minDist)} (${(initialApproach.minDist/EARTH_RADIUS).toFixed(2)} R⊕)`;
            }
            
            updateEncounterGraph();
            
            // AGREGAR: Auto-enfocar la escena
            setTimeout(() => autoFrameScene(), 100);
        }

    } catch (err) {
        console.error('Error fetchAndSelectNeo:', err);
        alert('Error al cargar NEO: ' + err.message);
    }
}

function calculateAllStrategies() {
  if (!selectedAsteroid) {
    alert('Selecciona un asteroide primero');
    return;
  }

  const warningYears = parseFloat(document.getElementById('warningTime')?.value) || 5;
  const distanceAU = parseFloat(document.getElementById('distance')?.value) || 1.5;
  const distanceMeters = distanceAU * AU;

  const v = selectedAsteroid.velocity || 25000;
  const timeByDistance = v > 0 ? (distanceMeters / v) : (warningYears * 365.25 * 24 * 3600);
  const timeByWarning = warningYears * 365.25 * 24 * 3600;
  const timeSecondsUsed = Math.min(timeByDistance, timeByWarning) || timeByWarning;

  const desiredMissMeters = EARTH_RADIUS;

  const deltaV_required = selectedAsteroid.orbital 
    ? estimateRequiredDeltaV(selectedAsteroid.orbital, desiredMissMeters, { dv_test: 0.5 }).requiredDV
    : desiredMissMeters / timeSecondsUsed;

  currentResults = [
    calculateKineticImpact(selectedAsteroid, timeSecondsUsed),
    calculateGravitationalTractor(selectedAsteroid, timeSecondsUsed),
    calculateLaserAblation(selectedAsteroid, timeSecondsUsed),
    calculateIonBeam(selectedAsteroid, timeSecondsUsed),
    calculateNuclearExplosion(selectedAsteroid, timeSecondsUsed)
  ];

  currentResults.forEach(r => {
    r.success = isFinite(deltaV_required) ? (r.deltaV >= deltaV_required) : false;
    r.timeSecondsUsed = timeSecondsUsed;
  });

  displayResultsUnified(currentResults, deltaV_required, timeSecondsUsed);

  const best = currentResults.reduce((acc, cur, idx) => 
    (cur.success && (cur.earthRadii || -Infinity) > acc.earthRadii) ? { ...cur, idx } : acc
  , { earthRadii: -1, idx: -1 });

  const pick = best.idx >= 0 ? best.idx : 0;
  selectStrategyUnified(pick);
}

function displayResultsUnified(results, deltaV_required, timeSecondsUsed) {
  const grid = document.getElementById('resultsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  results.forEach((res, index) => {
    const card = document.createElement('div');
    card.className = 'strategy-card';
    card.onclick = () => selectStrategyUnified(index);

    const paramsHTML = Object.entries(res.parameters || {})
      .map(([k, v]) => `<div class="result-item"><span class="result-label">${k}:</span> <span class="small">${v}</span></div>`)
      .join('');

    let extraNote = '';
    if (res.method === 'Impacto Cinético') {
      const m_req = (deltaV_required * Math.max(selectedAsteroid.mass, 1)) / (1.9 * 10000);
      extraNote = `<div class="result-item"><span class="result-label">Masa impactor requerida:</span> ${fmtSmart(m_req, 'kg')}</div>`;
    }

    const successClass = res.success ? '#00ff88' : '#ff6b35';
    const successText = res.success ? '✅ MISIÓN EXITOSA' : '❌ INSUFICIENTE';

    card.innerHTML = `
      <div class="strategy-title">${res.method}</div>
      <div class="formula">${res.formula || ''}</div>
      ${paramsHTML}
      <div class="result-item"><span class="result-label">Δv obtenido:</span> ${fmt(res.deltaV, 'm/s', 6)}</div>
      <div class="result-item"><span class="result-label">Δv requerido (estim.):</span> ${fmt(deltaV_required, 'm/s', 6)}</div>
      <div class="result-item" style="color:${successClass}; font-weight:bold">${successText}</div>
      ${extraNote}
      <div class="result-item"><span class="result-label">Desviación total:</span> ${formatDistance(res.deviation)}</div>
      <div class="result-item"><span class="result-label">Radios terrestres:</span> ${fmt(res.earthRadii, 'R⊕', 3)}</div>
      <div class="result-item"><span class="result-label">Tiempo usado:</span> ${fmt(timeSecondsUsed / (365.25 * 24 * 3600), 'años', 2)}</div>
    `;
    grid.appendChild(card);
  });

  const summaryEl = document.getElementById('resultsSummary');
  if (summaryEl) {
    summaryEl.textContent = `${results.length} estrategias • Δv requerido (estim.): ${fmt(deltaV_required, 'm/s')}`;
  }
}

function selectStrategyUnified(index) {
  selectedStrategyIndex = index;
  document.querySelectorAll('.strategy-card').forEach((c, i) => 
    c.classList.toggle('selected-strategy', i === index)
  );

  if (!currentResults?.[index] || !selectedAsteroid?.orbital) return;

  const result = currentResults[index];
  
  const baseApproach = sampleClosestApproach(selectedAsteroid.orbital);
  const orbitAtApplication = { ...selectedAsteroid.orbital, M_deg: baseApproach.minM };

  const newOrbit = updateOrbitAfterDeltaV(
    orbitAtApplication,
    result.deltaV,
    'tangential'
  );

  if (newOrbit && newOrbit.a_au > 0) {
    updateNewOrbitUnified(newOrbit);
    
    // En modo juego, verificar si la estrategia es suficiente
    if (gameMode && !gameOver) {
      const newApproach = sampleClosestApproach(newOrbit, 5000);
      const newMiss = newApproach.minDist;
      
      console.log('🎮 Estrategia aplicada - Nueva distancia:', formatDistance(newMiss));
      
      // Actualizar vizInfo con feedback inmediato
      const vizInfo = document.getElementById('vizInfo');
      if (vizInfo) {
        if (newMiss > EARTH_RADIUS * 2) {
          vizInfo.innerHTML = `
            <div style="background: rgba(0,200,100,0.9); padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #00ff88;">
              <h3 style="margin: 0 0 10px 0; color: white;">✅ ESTRATEGIA APLICADA</h3>
              <div style="font-size: 16px; color: white;">
                <strong>${result.method}</strong><br>
                Nueva distancia: <strong>${formatDistance(newMiss)}</strong><br>
                (<strong>${(newMiss/EARTH_RADIUS).toFixed(2)} R⊕</strong>)
              </div>
              <div style="font-size: 14px; color: #eeffee; margin-top: 10px;">
                ✅ Suficiente para evitar el impacto
              </div>
            </div>
          `;
        } else {
          vizInfo.innerHTML = `
            <div style="background: rgba(255,150,0,0.9); padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #ffaa00;">
              <h3 style="margin: 0 0 10px 0; color: white;">⚠️ INSUFICIENTE</h3>
              <div style="font-size: 16px; color: white;">
                <strong>${result.method}</strong><br>
                Distancia resultante: <strong>${formatDistance(newMiss)}</strong><br>
                (<strong>${(newMiss/EARTH_RADIUS).toFixed(2)} R⊕</strong>)
              </div>
              <div style="font-size: 14px; color: #ffeeee; margin-top: 10px;">
                ❌ Aún hay riesgo de impacto - Prueba otra estrategia
              </div>
            </div>
          `;
        }
      }
    }
  } else {
    if (newOrbitLine) scene.remove(newOrbitLine);
    newOrbitLine = null;
    currentNewOrbit = null;
    console.log("Órbita de escape (hiperbólica), no se puede dibujar.");
  }

  // Si NO está en modo juego, mostrar info normal
  if (!gameMode) {
    const vizInfo = document.getElementById('vizInfo');
    if (vizInfo) {
      const successIcon = result.success ? '✅' : '⚠️';
      vizInfo.innerHTML = `${successIcon} <strong>${result.method}</strong><br>Desviación: ${formatDistance(result.deviation)} (${fmt(result.earthRadii, 'R⊕', 3)})`;
    }
  }
}

/* -------------------- CONTROLES DE ESCALA Y TIEMPO -------------------- */
function changeRenderScale(scaleKey) {
  if (!SCALE_OPTIONS[scaleKey]) return;
  
  currentRenderScale = SCALE_OPTIONS[scaleKey].km;
  updateScaleIndicator();
  
  if (earth && scene) {
      scene.remove(earth);
      earth = new THREE.Mesh(
          new THREE.SphereGeometry(kmToRenderUnits(EARTH_RADIUS_KM), 32, 32),
          new THREE.MeshStandardMaterial({ 
              color: 0x2a9eff,
              emissive: 0x1a5ebb,
              emissiveIntensity: 0.3
          })
      );
      earth.position.set(0, 0, 0);
      scene.add(earth);
  }
  
  if (sunSprite) {
      const sunVisualSize = kmToRenderUnits(2000000);
      sunSprite.scale.set(sunVisualSize, sunVisualSize, 1);
      
      if (sunGlow) {
          sunGlow.scale.set(sunVisualSize * 2.5, sunVisualSize * 2.5, 1);
      }
  }
  
  // Recrear la órbita de la Tierra con nueva escala
  if (earthOrbitAroundSun) {
      scene.remove(earthOrbitAroundSun);
      earthOrbitAroundSun = createEarthOrbitAroundSun();
      scene.add(earthOrbitAroundSun);
  }
  
  // Recrear el marcador de posición
  if (earthPositionMarker) {
      scene.remove(earthPositionMarker);
      createEarthPositionMarker();
  }
  
  if (selectedAsteroid?.orbital) {
      if (originalOrbitLine) scene.remove(originalOrbitLine);
      originalOrbitLine = createOrbitLine(selectedAsteroid.orbital, 0x6fb5ff, true);
      scene.add(originalOrbitLine);
      
      const approach = sampleClosestApproach(selectedAsteroid.orbital);
      updateClosestApproachMarkers(approach);
  }
  
  if (currentNewOrbit) {
      if (newOrbitLine) scene.remove(newOrbitLine);
      newOrbitLine = createOrbitLine(currentNewOrbit, 0x00ff88, false);
      scene.add(newOrbitLine);
  }
  
  console.log(`Escala cambiada a: ${SCALE_OPTIONS[scaleKey].label}`);
}

function togglePlayPause() {
  isPaused = !isPaused;
  const btn = document.getElementById('playPauseBtn');
  if (btn) {
    btn.textContent = isPaused ? '▶️ Play' : '⏸️ Pause';
  }
}

function changeTimeSpeed(speed) {
  timeSpeed = speed;
  const indicator = document.getElementById('speedIndicator');
  if (indicator) {
    indicator.textContent = `Velocidad: ${speed}x`;
  }
}

function resetSimulation() {
  simulationTime = 0;
  isPaused = false;
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.textContent = '⏸️ Pause';
}

function changeOrbitSegments(segments) {
  segmentsOrbit = segments;
  console.log(`Segmentos de órbita: ${segments}`);
  
  // Redibujar órbitas con nueva precisión
  if (selectedAsteroid?.orbital) {
    updateOriginalOrbitUnified(selectedAsteroid.orbital);
  }
  if (currentNewOrbit) {
    updateNewOrbitUnified(currentNewOrbit);
  }
}

function changeSamplesPrecision(samples) {
  samplesClosest = samples;
  console.log(`Muestras para análisis: ${samples}`);
}

/* -------------------- INICIALIZACIÓN UI -------------------- */
function bindUnifiedUI() {
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) searchBtn.addEventListener('click', loadNeosHandler);

  const searchQuery = document.getElementById('searchQuery');
  if (searchQuery) {
    searchQuery.addEventListener('keypress', e => {
      if (e.key === 'Enter') loadNeosHandler();
    });
  }

  const loadDetailBtn = document.getElementById('loadDetailBtn');
  if (loadDetailBtn) {
    loadDetailBtn.addEventListener('click', async () => {
      const sel = document.getElementById('neoSelect');
      if (!sel?.value) {
        alert('Selecciona un NEO de la lista');
        return;
      }
      await fetchAndSelectNeo(sel.value);
    });
  }

  const selectElement = document.getElementById('neoSelect');
  if (selectElement) {
    selectElement.addEventListener('dblclick', async e => {
      const val = e.target.value || e.target.options?.[e.target.selectedIndex]?.value;
      if (val) await fetchAndSelectNeo(val);
    });
  }

  const calcBtn = document.getElementById('calcBtn');
  if (calcBtn) calcBtn.addEventListener('click', calculateAllStrategies);

  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      asteroids = [];
      selectedAsteroid = null;
      currentResults = null;
      simulationTime = 0;
      
      const select = document.getElementById('neoSelect');
      if (select) select.innerHTML = '';
      
      const details = document.getElementById('asteroidDetails');
      if (details) details.innerHTML = 'Ninguno';
      
      const grid = document.getElementById('resultsGrid');
      if (grid) grid.innerHTML = '';
      
      const summary = document.getElementById('resultsSummary');
      if (summary) summary.textContent = 'Sin resultados';
      
      if (newOrbitLine && scene) {
        scene.remove(newOrbitLine);
        newOrbitLine = null;
      }
      
      if (originalOrbitLine && scene) {
        scene.remove(originalOrbitLine);
        originalOrbitLine = null;
      }
      
      if (asteroidMarker && scene) {
        scene.remove(asteroidMarker);
        asteroidMarker = null;
      }
      
      if (earthMarker && scene) {
        scene.remove(earthMarker);
        earthMarker = null;
      }
      
      if (encounterLine && scene) {
        scene.remove(encounterLine);
        encounterLine = null;
      }
    });
  }

  const focusBtn = document.getElementById('focusEncounterBtn');
  if (focusBtn) focusBtn.addEventListener('click', focusOnEncounter);

  const centerEarthBtn = document.getElementById('centerEarthBtn');
  if (centerEarthBtn) {
      centerEarthBtn.addEventListener('click', () => {
          if (selectedAsteroid?.orbital) {
              autoFrameScene(); // CAMBIAR: usar la nueva función
          } else {
              // Si no hay asteroide, posición por defecto
              const defaultDist = kmToRenderUnits(500000);
              camera.position.set(defaultDist, defaultDist * 0.5, defaultDist * 0.5);
              controls.target.set(0, 0, 0);
              controls.update();
          }
      });
  }

  const playPauseBtn = document.getElementById('playPauseBtn');
  if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

  const resetBtn = document.getElementById('resetSimBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetSimulation);

  const scaleSelect = document.getElementById('scaleSelect');
  if (scaleSelect) {
    scaleSelect.addEventListener('change', (e) => {
      changeRenderScale(e.target.value);
    });
    
    // Poblar opciones de escala
    Object.entries(SCALE_OPTIONS).forEach(([key, value]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = value.label;
      if (key === '1M') option.selected = true;
      scaleSelect.appendChild(option);
    });
  }

  const speedSelect = document.getElementById('speedSelect');
  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      changeTimeSpeed(parseFloat(e.target.value));
    });
  }

  const segmentsSlider = document.getElementById('segmentsSlider');
  if (segmentsSlider) {
    segmentsSlider.addEventListener('change', (e) => {
      changeOrbitSegments(parseInt(e.target.value));
      const label = document.getElementById('segmentsLabel');
      if (label) label.textContent = `Segmentos: ${e.target.value}`;
    });
  }

  const samplesSlider = document.getElementById('samplesSlider');
  if (samplesSlider) {
    samplesSlider.addEventListener('change', (e) => {
      changeSamplesPrecision(parseInt(e.target.value));
      const label = document.getElementById('samplesLabel');
      if (label) label.textContent = `Muestras: ${e.target.value}`;
    });
  }

  // Botón de modo juego
  const startGameBtn = document.getElementById('startGameBtn');
  if (startGameBtn) {
    startGameBtn.addEventListener('click', startGameMode);
  }
  
  // Hacer las funciones globales para los botones
  window.resetGame = resetGame;
}

/* -------------------- INICIALIZACIÓN -------------------- */
function initUnified() {
  console.log('Inicializando simulador Earth-Centered (escala humana)...');
  console.log(`Escala inicial: 1 unidad = ${(currentRenderScale/1000).toFixed(0)} k km`);
  
  initThreeUnified();
  bindUnifiedUI();

  const initialValues = {
    'resultsSummary': 'Sin resultados',
    'asteroidDetails': 'Ninguno',
    'vizInfo': '',
    'currentDistance': 'Esperando asteroide...',
    'minDistanceInfo': 'N/A',
    'scaleIndicator': `Escala: 1 unidad = ${(currentRenderScale/1000).toFixed(0)} k km`,
    'speedIndicator': 'Velocidad: 1x'
  };
  
  Object.entries(initialValues).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });

  console.log('✅ Sistema listo. Prueba: bennu, apophis, ryugu');
  console.log('🌍 Vista centrada en la Tierra con distancias en km/Mkm');
}

// Auto-iniciar cuando DOM listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUnified);
} else {
  initUnified();
}
