/* ================== SIMULADOR NEO EARTH-CENTERED - OPTIMIZADO ================== */

/* -------------------- CONSTANTES -------------------- */
const AU = 1.495978707e11;
const MU_SUN = 1.32712440018e20;
const NASA_API_KEY = 'Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B';
const NASA_BASE = 'https://api.nasa.gov/neo/rest/v1';
const EARTH_RADIUS = 6.371e6;
const EARTH_RADIUS_KM = 6371;
const EARTH_ROTATION_PERIOD = 86400; // 24 horas en segundos
const MOON_ORBITAL_PERIOD = 27.3 * 86400; // 27.3 días
const MOON_DISTANCE = 384400; // km desde la Tierra

const SCALE_OPTIONS = {
  '1k': { km: 1e3, label: '1,000 km/unidad' },
  '10k': { km: 1e4, label: '10,000 km/unidad' },
  '100k': { km: 1e5, label: '100,000 km/unidad' },
  '1M': { km: 1e6, label: '1,000,000 km/unidad (1 Mkm)' },
  '10M': { km: 1e7, label: '10,000,000 km/unidad (10 Mkm)' }
};

const materialProperties = {
  "silicato": { ablationEfficiency: 0.10, ionEfficiency: 0.15, exhaustVelocity: 30000 },
  "condrita": { ablationEfficiency: 0.12, ionEfficiency: 0.18, exhaustVelocity: 32000 },
  "carbonáceo": { ablationEfficiency: 0.08, ionEfficiency: 0.12, exhaustVelocity: 28000 },
  "metálico": { ablationEfficiency: 0.15, ionEfficiency: 0.22, exhaustVelocity: 35000 }
};

const earthOrbit = {
  a_au: 1.000001018, e: 0.0167086, i_deg: 0.00005,
  Omega_deg: -11.26064, omega_deg: 102.94719, M_deg: 100.46435,
  mean_motion_rad_s: Math.sqrt(MU_SUN / Math.pow(1.000001018 * AU, 3))
};

/* -------------------- ESTADO GLOBAL -------------------- */
let currentRenderScale = 1e6, segmentsOrbit = 256, samplesClosest = 1500;
let timeStep = 86400 * 2 / 50, isPaused = false, timeSpeed = 1.0, simulationTime = 0;
let asteroids = [], selectedAsteroid = null, currentResults = null, selectedStrategyIndex = 0;
let scene, camera, renderer, controls, animationId, earth, asteroidMesh;
let originalOrbitLine, newOrbitLine, currentNewOrbit, sunSprite, sunGlow;
let asteroidMarker, earthMarker, earthOrbitAroundSun, earthPositionMarker;

// Modo juego
let gameMode = false, gameTimeLimit = 0, gameTimeRemaining = 0, gameOver = false, gameWon = false, originalAsteroidOrbit = null;

/* -------------------- UTILIDADES -------------------- */
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;
const metersToRenderUnits = m => (m / 1000) / currentRenderScale;
const kmToRenderUnits = km => km / currentRenderScale;

const formatDistance = m => {
  const km = m / 1000;
  return km >= 1e6 ? `${(km/1e6).toFixed(2)} Mkm` : km >= 1e3 ? `${(km/1e3).toFixed(1)} k km` : `${km.toFixed(0)} km`;
};

const computeMassFromDiameter = (d, density = 2000) => d > 0 ? (4/3) * Math.PI * Math.pow(d/2, 3) * density : null;

const fmt = (value, unit = '', decimals = 2) => {
  if (!isFinite(value)) return String(value) + (unit ? ' ' + unit : '');
  if (Math.abs(value) < 1e-12) value = 0;
  const abs = Math.abs(value);
  const options = { maximumFractionDigits: abs >= 1000 ? 2 : abs < 0.01 && abs > 0 ? 6 : decimals };
  return value.toLocaleString('es-ES', options) + (unit ? ' ' + unit : '');
};

const fmtSmart = (value, unit) => {
  if (unit === 'm') return Math.abs(value) >= 1000 ? fmt(value/1000, 'km', 2) : fmt(value, 'm', 0);
  if (unit === 'kg') {
    if (Math.abs(value) >= 1e9) return fmt(value/1e9, 'mil millones t', 2);
    if (Math.abs(value) >= 1e6) return fmt(value/1e6, 'millones t', 2);
    if (Math.abs(value) >= 1000) return fmt(value/1000, 't', 2);
    return fmt(value, 'kg', 0);
  }
  return fmt(value, unit, 2);
};

/* -------------------- API NASA -------------------- */
async function fetchFromNASA(pathOrId) {
  try {
    const url = /^\d+$/.test(String(pathOrId)) || !String(pathOrId).startsWith('/')
      ? `${NASA_BASE}/neo/${encodeURIComponent(pathOrId)}?api_key=${NASA_API_KEY}`
      : `${NASA_BASE}${pathOrId}${pathOrId.includes('?') ? '&' : '?'}api_key=${NASA_API_KEY}`;
    
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    const resp = await fetch(proxyUrl); // Cambiar fetch(url) por fetch(proxyUrl)
    return resp.ok ? await resp.json() : null;
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
  
  const q = query.trim().toLowerCase();
  const results = [];

  try {
    // Mapeo de nombres famosos a SPK-ID completos
    const famousAsteroids = {
      'apophis': '2099942',
      'bennu': '2101955',
      'ryugu': '2162173',
      'didymos': '2065803',
      'eros': '2000433',
      'itokawa': '2025143',
      'geographos': '2001620',
      'toutatis': '2004179',
      'phaethon': '2003200'
    };

    // Si es un número puro, intentar como SPK-ID directo
    if (/^\d+$/.test(q)) {
      // Primero intentar el ID tal cual
      let data = await fetchFromNASA(q);
      
      // Si falla y no tiene prefijo de siglo, intentar con prefijo 20
      if (!data && q.length <= 6) {
        data = await fetchFromNASA('20' + q);
      }
      
      if (data) {
        const diameter = data.estimated_diameter?.meters
          ? (data.estimated_diameter.meters.estimated_diameter_min + data.estimated_diameter.meters.estimated_diameter_max) / 2
          : null;
        results.push({ id: data.neo_reference_id || data.id, name: data.name, diameter_m: diameter });
      }
    }
    
    // Si es un nombre y coincide con asteroides famosos
    if (famousAsteroids[q]) {
      const data = await fetchFromNASA(famousAsteroids[q]);
      if (data) {
        const diameter = data.estimated_diameter?.meters
          ? (data.estimated_diameter.meters.estimated_diameter_min + data.estimated_diameter.meters.estimated_diameter_max) / 2
          : null;
        results.push({ id: data.neo_reference_id || data.id, name: data.name, diameter_m: diameter });
      }
    }
    
    // Búsqueda en el catálogo browse
    if (results.length === 0 || q.length === 0) {
      const pagesToSearch = q.length >= 3 ? 5 : 2;
      
      for (let page = 0; page < pagesToSearch; page++) {
        const resp = await fetchFromNASA(`/neo/browse?page=${page}&size=20`);
        if (resp?.near_earth_objects) {
          resp.near_earth_objects
            .filter(n => {
              if (!q) return true;
              const name = (n.name || '').toLowerCase();
              const designation = (n.designation || '').toLowerCase();
              return name.includes(q) || designation.includes(q);
            })
            .forEach(n => {
              if (!results.find(r => r.id === n.neo_reference_id)) {
                const diameter = n.estimated_diameter?.meters
                  ? (n.estimated_diameter.meters.estimated_diameter_min + n.estimated_diameter.meters.estimated_diameter_max) / 2
                  : null;
                results.push({ 
                  id: n.neo_reference_id || n.id, 
                  name: n.name, 
                  diameter_m: diameter 
                });
              }
            });
        }
        
        if (results.length >= 20) break;
      }
    }

    results.sort((a, b) => a.name.length - b.name.length);

    asteroids = results;
    select.innerHTML = asteroids.length === 0 
      ? '<option disabled>No se encontraron resultados. Intenta: Apophis, 433, Bennu</option>'
      : asteroids.map(n => `<option value="${n.id}">${n.name}${n.diameter_m ? ` • ${Math.round(n.diameter_m)} m` : ''}</option>`).join('');
    
    if (asteroids.length > 0) {
      console.log(`✅ Encontrados ${asteroids.length} asteroides`);
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
      a_au: parseFloat(od.semi_major_axis), e: parseFloat(od.eccentricity || 0),
      i_deg: parseFloat(od.inclination || 0), Omega_deg: parseFloat(od.ascending_node_longitude || 0),
      omega_deg: parseFloat(od.perihelion_argument || 0), M_deg: parseFloat(od.mean_anomaly || 0),
      epoch: od.epoch_osculation
    } : null;

    const diameter = data.estimated_diameter?.meters
      ? (data.estimated_diameter.meters.estimated_diameter_min + data.estimated_diameter.meters.estimated_diameter_max) / 2
      : 500;

    const mass = computeMassFromDiameter(diameter, 2000);

    const asteroid = {
      id: data.neo_reference_id || data.id || id, name: data.name, fullName: data.name,
      diameter, mass, density: 2000, material: 'silicato', orbital
    };

    if (orbital?.a_au) {
      const st = orbitalElementsToStateVectors(orbital.a_au, orbital.e, orbital.i_deg, orbital.Omega_deg, orbital.omega_deg, orbital.M_deg);
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

/* -------------------- CÁLCULOS ORBITALES -------------------- */
function solveKeplerMeanToE(M_rad, e, tol = 1e-12, maxIter = 100) {
  let E = e < 0.8 ? M_rad : Math.PI;
  for (let k = 0; k < maxIter; k++) {
    const f = E - e * Math.sin(E) - M_rad;
    const dE = -f / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function orbitalElementsToStateVectors(a_au, e, i_deg, Omega_deg, omega_deg, M_deg, mu = MU_SUN) {
  const a = a_au * AU;
  const [i, Omega, omega, M] = [i_deg, Omega_deg, omega_deg, M_deg].map(toRad);

  const E = solveKeplerMeanToE(M, e);
  const [cosE, sinE] = [Math.cos(E), Math.sin(E)];
  const sqrt1me2 = Math.sqrt(Math.max(0, 1 - e * e));
  const nu = Math.atan2(sqrt1me2 * sinE, cosE - e);

  const r_mag = a * (1 - e * cosE);
  const [x_pf, y_pf] = [r_mag * Math.cos(nu), r_mag * Math.sin(nu)];

  const h = Math.sqrt(mu * a * (1 - e * e));
  const [vx_pf, vy_pf] = [-(mu / h) * Math.sin(nu), (mu / h) * (e + Math.cos(nu))];

  const rotate = ([x, y, z]) => {
    const [c1, s1, c2, s2, c3, s3] = [Math.cos(omega), Math.sin(omega), Math.cos(i), Math.sin(i), Math.cos(Omega), Math.sin(Omega)];
    let [x1, y1] = [c1*x - s1*y, s1*x + c1*y];
    let [x2, y2, z2] = [x1, c2*y1 - s2*z, s2*y1 + c2*z];
    return [c3*x2 - s3*y2, s3*x2 + c3*y2, z2];
  };

  return { r: rotate([x_pf, y_pf, 0]), v: rotate([vx_pf, vy_pf, 0]), nu, r_mag };
}

function stateVectorsToOrbitalElements(r_vec, v_vec, mu = MU_SUN) {
  const [r_mag, v_mag] = [Math.hypot(...r_vec), Math.hypot(...v_vec)];

  const h_vec = [
    r_vec[1] * v_vec[2] - r_vec[2] * v_vec[1],
    r_vec[2] * v_vec[0] - r_vec[0] * v_vec[2],
    r_vec[0] * v_vec[1] - r_vec[1] * v_vec[0]
  ];
  const h_mag = Math.hypot(...h_vec);

  const i = Math.acos(h_vec[2] / h_mag);
  let Omega = Math.atan2(h_vec[0], -h_vec[1]);
  if (Omega < 0) Omega += 2 * Math.PI;

  const a = -mu / (v_mag * v_mag - 2 * mu / r_mag);

  const e_vec_term1 = v_mag * v_mag - mu / r_mag;
  const e_vec_term2 = r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2];
  const e_vec = [(e_vec_term1 * r_vec[0] - e_vec_term2 * v_vec[0]) / mu,
                 (e_vec_term1 * r_vec[1] - e_vec_term2 * v_vec[1]) / mu,
                 (e_vec_term1 * r_vec[2] - e_vec_term2 * v_vec[2]) / mu];
  const e = Math.hypot(...e_vec);

  let omega = 0;
  if (e > 1e-9) {
    const n_vec = [-h_vec[1], h_vec[0], 0];
    const n_mag = Math.hypot(...n_vec);
    omega = Math.acos((n_vec[0]*e_vec[0] + n_vec[1]*e_vec[1]) / (n_mag * e));
    if (e_vec[2] < 0) omega = 2 * Math.PI - omega;
  }

  let nu = 0;
  if (e > 1e-9) {
    nu = Math.acos((r_vec[0]*e_vec[0] + r_vec[1]*e_vec[1] + r_vec[2]*e_vec[2]) / (r_mag * e));
    if (r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2] < 0) nu = 2 * Math.PI - nu;
  }
  
  return { a_au: a / AU, e, i_deg: toDeg(i), Omega_deg: toDeg(Omega), omega_deg: toDeg(omega), nu_deg: toDeg(nu) };
}

/* -------------------- ANÁLISIS DE ACERCAMIENTO -------------------- */
function sampleClosestApproach(orbit, samples = samplesClosest) {
  let [minDist, minM, stateAtMin, earthStateAtMin, timeAtMin] = [Infinity, 0, null, null, 0];

  const a_m = orbit.a_au * AU;
  const period = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
  const n_earth = earthOrbit.mean_motion_rad_s;
  const M0 = orbit.M_deg || 0;

  for (let k = 0; k <= samples; k++) {
    const frac = k / samples;
    const M_deg = (M0 + frac * 360) % 360;
    const t = frac * period;

    const M_earth_deg = ((toDeg(toRad(earthOrbit.M_deg) + n_earth * t) % 360) + 360) % 360;

    const st_ne = orbitalElementsToStateVectors(orbit.a_au, orbit.e || 0, orbit.i_deg || 0, orbit.Omega_deg || 0, orbit.omega_deg || 0, M_deg);
    const st_earth = orbitalElementsToStateVectors(earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_deg);

    const dist = Math.hypot(st_ne.r[0] - st_earth.r[0], st_ne.r[1] - st_earth.r[1], (st_ne.r[2] || 0) - (st_earth.r[2] || 0));

    if (dist < minDist) {
      [minDist, minM, stateAtMin, earthStateAtMin, timeAtMin] = [dist, M_deg, st_ne, st_earth, t];
    }
  }

  return { minDist, minDist_km: minDist / 1000, minM, stateAtMin, earthStateAtMin, timeAtMin };
}

function updateOrbitAfterDeltaV(initialOrbit, dv_ms) {
  const st0 = orbitalElementsToStateVectors(initialOrbit.a_au, initialOrbit.e, initialOrbit.i_deg, initialOrbit.Omega_deg, initialOrbit.omega_deg, initialOrbit.M_deg);
  const v0_mag = Math.hypot(...st0.v);
  const v_new_vec = st0.v.map(c => c + (c / v0_mag) * dv_ms);
  return stateVectorsToOrbitalElements(st0.r, v_new_vec);
}

/* -------------------- ESTRATEGIAS DE MITIGACIÓN (CONSOLIDADAS) -------------------- */
function calculateStrategyDeviation(asteroid, deltaV, timeSeconds) {
  if (!asteroid.orbital?.a_au) {
    const deviation = deltaV * timeSeconds;
    return { deviation, earthRadii: deviation / EARTH_RADIUS };
  }

  const yearsBeforeEncounter = Math.min(timeSeconds / (365.25 * 24 * 3600), 10);
  const encounterApproach = sampleClosestApproach(asteroid.orbital);
  const a_m = asteroid.orbital.a_au * AU;
  const period_s = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
  const timeBeforeEncounter = yearsBeforeEncounter * 365.25 * 24 * 3600;
  const n = 2 * Math.PI / period_s;
  
  const M_application_deg = ((toDeg(toRad(encounterApproach.minM) - n * timeBeforeEncounter) % 360) + 360) % 360;
  const orbitAtApplication = { ...asteroid.orbital, M_deg: M_application_deg };
  const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, deltaV);
  
  const M_new_encounter_deg = ((toDeg(toRad(newOrbit.M_deg || M_application_deg) + n * timeBeforeEncounter) % 360) + 360) % 360;
  const newOrbitAtEncounter = { ...newOrbit, M_deg: M_new_encounter_deg };
  const newApproach = sampleClosestApproach(newOrbitAtEncounter);
  
  const deviation = newApproach.minDist - encounterApproach.minDist;
  return { deviation, earthRadii: deviation / EARTH_RADIUS };
}

const strategyCalculators = {
  kinetic: (asteroid, timeSeconds) => {
    const [impactorMass, impactorVelocity, beta] = [500, 1000000, 1.9];
    const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
    const deltaV = (beta * impactorMass * impactorVelocity) / mass;
    const { deviation, earthRadii } = calculateStrategyDeviation(asteroid, deltaV, timeSeconds);

    return {
      method: "Impacto Cinético", formula: "Δv = (β × m_impactor × v_impactor) / m_asteroide",
      parameters: { "Masa impactor": `${impactorMass} kg`, "Vel. impactor": `${impactorVelocity} m/s`, "β": beta, 
                   "Masa asteroide": fmtSmart(mass, 'kg'), "Tiempo anticipación": `${(timeSeconds/(365.25*24*3600)).toFixed(1)} años` },
      deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
    };
  },
  
  gravitational: (asteroid, timeSeconds) => {
    const [spacecraftMass, operationDistance, G] = [20000, 100, 6.674e-11];
    const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
    const force = (G * spacecraftMass * mass) / (operationDistance * operationDistance);
    const deltaV = (force / mass) * timeSeconds;
    const { deviation, earthRadii } = calculateStrategyDeviation(asteroid, deltaV, timeSeconds);

    return {
      method: "Tractor Gravitacional", formula: "F = G × m_nave × m_asteroide / r²; Δv = (F/m) × t",
      parameters: { "Masa nave": `${spacecraftMass} kg`, "Distancia operación": `${operationDistance} m`, "G": `${G.toExponential(3)}` },
      deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
    };
  },
  
  laser: (asteroid, timeSeconds) => {
    const laserPower = 1e6;
    const mat = materialProperties[asteroid.material] || materialProperties['silicato'];
    const ablationVelocity = 1000;
    const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
    const massFlow = (laserPower * mat.ablationEfficiency) / (0.5 * ablationVelocity * ablationVelocity);
    const deltaV = (massFlow * ablationVelocity * timeSeconds) / mass;
    const { deviation, earthRadii } = calculateStrategyDeviation(asteroid, deltaV, timeSeconds);

    return {
      method: "Ablación Láser", formula: "Δv = (ṁ × v_ablation × t) / m_asteroide",
      parameters: { "Potencia láser": `${(laserPower/1e6).toFixed(1)} MW`, "Material": asteroid.material, 
                   "Eficiencia": `${(mat.ablationEfficiency*100).toFixed(1)}%`, "v_abla": `${ablationVelocity} m/s`, "ṁ": massFlow.toExponential(2) },
      deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
    };
  },
  
  ion: (asteroid, timeSeconds) => {
    const beamPower = 5e5;
    const mat = materialProperties[asteroid.material] || materialProperties['silicato'];
    const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
    const thrust = (2 * beamPower * mat.ionEfficiency) / mat.exhaustVelocity;
    const deltaV = (thrust / mass) * timeSeconds;
    const { deviation, earthRadii } = calculateStrategyDeviation(asteroid, deltaV, timeSeconds);

    return {
      method: "Haz de Iones", formula: "F = (2 × P × η) / v_exhaust; Δv = (F/m) × t",
      parameters: { "Potencia": `${(beamPower/1e3).toFixed(0)} kW`, "Eficiencia": `${(mat.ionEfficiency*100).toFixed(1)}%`, 
                   "v_exhaust": `${mat.exhaustVelocity} m/s`, "Empuje": thrust.toExponential(2) },
      deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
    };
  },
  
  nuclear: (asteroid, timeSeconds) => {
    const [yieldMegatons, efficiency] = [1, 0.05];
    const yieldJ = yieldMegatons * 4.184e15;
    const mass = asteroid.mass || Math.max(1, computeMassFromDiameter(asteroid.diameter || 10, asteroid.density || 2000));
    const deltaV = Math.sqrt((2 * yieldJ * efficiency) / mass);
    const { deviation, earthRadii } = calculateStrategyDeviation(asteroid, deltaV, timeSeconds);

    return {
      method: "Explosión Nuclear", formula: "Δv = √(2 × E_transferred / m_asteroide)",
      parameters: { "Yield": `${yieldMegatons} Mt`, "E_total": `${yieldJ.toExponential(2)} J`, "Eficiencia": `${(efficiency*100)}%` },
      deltaV, deviation, deviation_km: deviation / 1000, earthRadii, timeSecondsUsed: timeSeconds
    };
  }
};

/* -------------------- MODO JUEGO -------------------- */
function makeOrbitCollide(asteroid, daysUntilImpact = 180) {
  if (!asteroid?.orbital) return null;
  
  originalAsteroidOrbit = JSON.parse(JSON.stringify(asteroid.orbital));
  const timeToImpact = daysUntilImpact * 86400;
  
  const a_e_m = earthOrbit.a_au * AU;
  const n_earth = Math.sqrt(MU_SUN / Math.pow(a_e_m, 3));
  const M_earth_future_deg = ((toDeg(toRad(earthOrbit.M_deg) + n_earth * timeToImpact) % 360) + 360) % 360;
  
  const earthFutureState = orbitalElementsToStateVectors(earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_future_deg);
  const r_earth_target = Math.hypot(...earthFutureState.r);
  
  const [q_perihelio, Q_afelio] = [0.85, 1.15];
  const [a_collision, e_collision] = [(q_perihelio + Q_afelio) / 2, (Q_afelio - q_perihelio) / (Q_afelio + q_perihelio)];
  
  const a_collision_m = a_collision * AU;
  const period_collision = 2 * Math.PI * Math.sqrt(Math.pow(a_collision_m, 3) / MU_SUN);
  const n_collision = 2 * Math.PI / period_collision;
  
  const r_target_au = r_earth_target / AU;
  const cos_nu_target = ((a_collision * (1 - e_collision * e_collision) / r_target_au) - 1) / e_collision;
  
  if (Math.abs(cos_nu_target) > 1) {
    asteroid.orbital = { a_au: 0.999, e: 0.003, i_deg: 0.0, Omega_deg: M_earth_future_deg, omega_deg: 0,
                        M_deg: M_earth_future_deg - (toDeg(n_collision * timeToImpact) % 360), epoch: asteroid.orbital.epoch,
                        mean_motion_rad_s: Math.sqrt(MU_SUN / Math.pow(0.999 * AU, 3)) };
  } else {
    const nu_target = Math.acos(cos_nu_target);
    const E_target = 2 * Math.atan(Math.sqrt((1 - e_collision) / (1 + e_collision)) * Math.tan(nu_target / 2));
    const M_target_deg = ((toDeg(E_target - e_collision * Math.sin(E_target)) % 360) + 360) % 360;
    const M_initial_deg = ((M_target_deg - toDeg(n_collision * timeToImpact)) % 360 + 360) % 360;
    
    const lon_earth_deg = ((toDeg(Math.atan2(earthFutureState.r[1], earthFutureState.r[0])) % 360) + 360) % 360;
    const omega_deg = ((lon_earth_deg - toDeg(nu_target)) % 360 + 360) % 360;
    
    asteroid.orbital = { a_au: a_collision, e: e_collision, i_deg: 0.0, Omega_deg: 0, omega_deg: omega_deg,
                        M_deg: M_initial_deg, epoch: asteroid.orbital.epoch, mean_motion_rad_s: n_collision };
  }
  
  return asteroid;
}

function startGameMode() {
  if (!selectedAsteroid?.orbital) return alert('Primero selecciona un asteroide');
  
  const days = parseInt(document.getElementById('gameDaysInput')?.value) || 180;
  makeOrbitCollide(selectedAsteroid, days);
  
  [gameMode, gameStartTime, gameTimeLimit, gameTimeRemaining, gameOver, gameWon, simulationTime, isPaused] = 
    [true, Date.now(), days * 86400, days * 86400, false, false, 0, false];
  
  updateOriginalOrbitUnified(selectedAsteroid.orbital);
  const approach = sampleClosestApproach(selectedAsteroid.orbital);
  updateClosestApproachMarkers(approach);
  
  const minDistEl = document.getElementById('minDistanceInfo');
  if (minDistEl) {
    const earthRadii = approach.minDist / EARTH_RADIUS;
    minDistEl.innerHTML = `<span style="color: ${earthRadii < 1 ? '#ff4444' : '#ffaa00'}">⚠️ IMPACTO: ${formatDistance(approach.minDist)} (${earthRadii.toFixed(2)} R⊕)</span>`;
  }
  
  const vizInfo = document.getElementById('vizInfo');
  if (vizInfo) {
    vizInfo.innerHTML = `<div style="background: rgba(255,50,50,0.8); padding: 12px; border-radius: 6px; border: 2px solid #ff4444;">
      <div style="font-size: 1.2rem; font-weight: bold; color: white; margin-bottom: 8px;">🚨 ALERTA DE IMPACTO INMINENTE</div>
      <div style="font-size: 0.95rem; color: #ffeeee;">Tiempo disponible: <strong>${days} días</strong><br>Calcula estrategias y aplica una deflexión</div>
    </div>`;
  }
  
  updateEncounterGraph();
  autoFrameScene();
  console.log(`🎮 Modo juego iniciado: ${days} días para evitar impacto`);
}

function checkGameStatus() {
  if (!gameMode || gameOver) return;
  
  gameTimeRemaining = gameTimeLimit - simulationTime;
  
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) {
    const daysRemaining = gameTimeRemaining / 86400;
    const hoursRemaining = (gameTimeRemaining % 86400) / 3600;
    const timerColor = daysRemaining < 30 ? (daysRemaining < 10 ? '#ff4444' : '#ffaa00') : '#00ff88';
    timerEl.innerHTML = `<div style="font-size: 1.1rem; font-weight: bold; color: ${timerColor};">⏱️ ${Math.floor(daysRemaining)}d ${Math.floor(hoursRemaining)}h restantes</div>`;
  }
  
  if (simulationTime >= gameTimeLimit) {
    const orbitToCheck = currentNewOrbit || selectedAsteroid.orbital;
    const finalApproach = sampleClosestApproach(orbitToCheck, 5000);
    const SUCCESS_THRESHOLD = EARTH_RADIUS * 2;
    
    [gameWon, gameOver] = [finalApproach.minDist >= SUCCESS_THRESHOLD, true];
    showGameResult(gameWon, finalApproach.minDist, currentNewOrbit ? (gameWon ? 'Estrategia exitosa' : 'La estrategia fue insuficiente') : 'No se aplicó ninguna estrategia');
    isPaused = true;
  }
}

function showGameResult(won, finalDistance, reason = '') {
  const vizInfo = document.getElementById('vizInfo');
  if (!vizInfo) return;
  
  const color = won ? 'rgba(0,255,100,0.95), rgba(0,200,150,0.95)' : 'rgba(255,50,50,0.95), rgba(200,0,0,0.95)';
  const border = won ? '#00ff88' : '#ff4444';
  const title = won ? '🎉 ¡MISIÓN EXITOSA!' : '💥 GAME OVER';
  const subtitle = won ? 'Has salvado la Tierra' : (finalDistance < EARTH_RADIUS * 0.5 ? 'IMPACTO DIRECTO' : 'PASO PELIGROSO');
  const icon = won ? '✅' : '⚠️';
  
  vizInfo.innerHTML = `<div style="background: linear-gradient(135deg, ${color}); padding: 25px; border-radius: 12px; text-align: center; border: 3px solid ${border};">
    <h2 style="margin: 0 0 15px 0; color: white; font-size: 2rem;">${title}</h2>
    <div style="font-size: 1.3rem; margin-bottom: 15px; color: white; font-weight: 600;">${subtitle}</div>
    <div style="font-size: 1.1rem; color: ${won ? '#eeffee' : '#ffeeee'}; background: rgba(0,0,0,${won ? 0.2 : 0.3}); padding: 12px; border-radius: 6px; margin-bottom: 15px;">
      <strong>${won ? 'Distancia final' : 'Distancia mínima'}:</strong><br>${formatDistance(finalDistance)}<br><span style="font-size: 1.3rem;">(${(finalDistance/EARTH_RADIUS).toFixed(2)} R⊕)</span>
    </div>
    ${reason ? `<div style="font-size: 0.95rem; color: ${won ? '#ccffdd' : '#ffdddd'}; margin-bottom: 15px;">${icon} ${reason}</div>` : ''}
    ${!won ? '<div style="font-size: 0.9rem; color: #ffcccc; margin-bottom: 15px;">Necesitas > 2 R⊕ para tener éxito</div>' : ''}
    <button onclick="resetGame()" style="margin-top: 10px; padding: 14px 28px; font-size: 1.15rem; cursor: pointer; background: linear-gradient(135deg, ${won ? '#3b82f6 0%, #2563eb' : '#ef4444 0%, #dc2626'} 100%); border: none; border-radius: 8px; color: white; font-weight: 700;">
      🔄 ${won ? 'Nueva Misión' : 'Reintentar'}
    </button>
  </div>`;
  
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) timerEl.innerHTML = '<div style="color: #888;">Simulación completada</div>';
}

function resetGame() {
  [gameMode, gameOver, gameWon, simulationTime, gameTimeRemaining] = [false, false, false, 0, 0];
  
  if (originalAsteroidOrbit && selectedAsteroid) {
    selectedAsteroid.orbital = JSON.parse(JSON.stringify(originalAsteroidOrbit));
    selectedAsteroid.orbital.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(selectedAsteroid.orbital.a_au * AU, 3));
    updateOriginalOrbitUnified(selectedAsteroid.orbital);
  }
  
  if (newOrbitLine && scene) { scene.remove(newOrbitLine); newOrbitLine = null; }
  currentNewOrbit = null;
  
  const timerEl = document.getElementById('gameTimer');
  if (timerEl) timerEl.innerHTML = '';
  
  const vizInfo = document.getElementById('vizInfo');
  if (vizInfo) vizInfo.innerHTML = 'Selecciona un asteroide y calcula estrategias para visualizar la deflexión';
  
  const minDistEl = document.getElementById('minDistanceInfo');
  if (minDistEl && selectedAsteroid?.orbital) {
    const approach = sampleClosestApproach(selectedAsteroid.orbital);
    minDistEl.textContent = `Mín: ${formatDistance(approach.minDist)} (${(approach.minDist/EARTH_RADIUS).toFixed(2)} R⊕)`;
  }
  
  console.log('🔄 Juego reseteado');
}

/* -------------------- THREE.JS VISUALIZACIÓN -------------------- */
function initThreeUnified() {
  const canvas = document.getElementById('canvas3d');
  if (!canvas) return console.warn('No canvas3d encontrado.');

  const { clientWidth: width, clientHeight: height } = canvas;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030515);

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000);
  camera.position.set(kmToRenderUnits(500000), kmToRenderUnits(250000), kmToRenderUnits(250000));

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  controls.minDistance = kmToRenderUnits(10000);
  controls.maxDistance = kmToRenderUnits(10000000);

  // Iluminación mejorada
  scene.add(new THREE.AmbientLight(0x222222, 0.3)); // Luz ambiental muy tenue
  
  // Luz principal del Sol (direccional)
  const sunLight = new THREE.DirectionalLight(0xffffee, 2.5);
  sunLight.position.set(0, 0, 0); // En el origen donde está el Sol
  sunLight.castShadow = false; // Para rendimiento
  scene.add(sunLight);
  
  // Guardar referencia para actualizar posición después
  window.sunLight = sunLight;
  
  // Tierra con textura
  const earthGeometry = new THREE.SphereGeometry(kmToRenderUnits(EARTH_RADIUS_KM), 64, 64);
  const earthTexture = createEarthTexture();

  const earthMaterial = new THREE.MeshStandardMaterial({ 
    map: earthTexture,
    emissive: 0x112244,
    emissiveIntensity: 0.1,
    roughness: 0.9,
    metalness: 0.1
  });

  earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.position.set(0, 0, 0);
  const earthTilt = new THREE.Object3D();
  earthTilt.rotation.x = toRad(23.5); // inclinación realista del eje terrestre (~23.5°)
  earthTilt.add(earth);

  // Agregar el grupo inclinado a la escena
  scene.add(earthTilt);

  // Guardar referencia global si la necesitas después
  window.earthTilt = earthTilt;

  scene.traverse(obj => {
    if (
      obj.isMesh &&
      obj.material &&
      obj.material.map &&
      obj.material.map.image instanceof HTMLCanvasElement
    ) {
      try {
        earth.attach(obj); // reparent conservando transform global
        console.log('Attached canvas overlay ->', obj.uuid);
      } catch (e) {
        console.warn('Attach failed for', obj.uuid, e);
      }
    }
  });

  // Luna
  const moonGeometry = new THREE.SphereGeometry(kmToRenderUnits(1737), 16, 16);
  const moonTexture = createMoonTexture();
  const moonMaterial = new THREE.MeshStandardMaterial({ 
    map: moonTexture,
    emissive: 0x222222,
    emissiveIntensity: 0.1,
    roughness: 1.0,
    metalness: 0.0
  });
  window.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(window.moonMesh);

  // NUEVA SECCIÓN: Etiqueta 2D para la Luna
  const moonLabelCanvas = document.createElement('canvas');
  moonLabelCanvas.width = 256;
  moonLabelCanvas.height = 64;
  const ctx = moonLabelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Luna', 128, 32);
  
  const moonLabelTexture = new THREE.CanvasTexture(moonLabelCanvas);
  const moonLabelMaterial = new THREE.SpriteMaterial({ 
    map: moonLabelTexture, 
    transparent: true,
    depthTest: false
  });
  window.moonLabel = new THREE.Sprite(moonLabelMaterial);
  const labelScale = kmToRenderUnits(EARTH_RADIUS_KM) * 2;
  window.moonLabel.scale.set(labelScale * 4, labelScale, 1);
  scene.add(window.moonLabel);

  // Asteroide
  asteroidMesh = new THREE.Mesh(
    new THREE.SphereGeometry(kmToRenderUnits(EARTH_RADIUS_KM) * 0.2, 12, 12),
    new THREE.MeshStandardMaterial({ 
      color: 0xff9500, 
      emissive: 0xff6600, 
      emissiveIntensity: 0.4,
      roughness: 0.9,
      metalness: 0.1
    })
  );
  scene.add(asteroidMesh);

  // Sol mejorado
  createSunSprite();
  
  // Órbita de la Tierra
  earthOrbitAroundSun = createEarthOrbitAroundSun();
  scene.add(earthOrbitAroundSun);

  // Grid
  const gridSize = kmToRenderUnits(1000000);
  const gridHelper = new THREE.GridHelper(gridSize, 20, 0x444444, 0x222222);
  gridHelper.rotation.x = Math.PI / 2;
  scene.add(gridHelper);

  window.addEventListener('resize', onWindowResizeUnified);
  animateUnified();
}

function createEarthTexture() {
  const textureLoader = new THREE.TextureLoader();

  const earthTexture = textureLoader.load(
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    function (texture) {
      console.log('✅ Textura de la Tierra cargada correctamente');
      if (typeof earth !== 'undefined' && earth && earth.material) {
        earth.material.needsUpdate = true;
      }
    },
    undefined,
    function (err) {
      console.error('❌ Error al cargar textura:', err);
    }
  );

  earthTexture.wrapS = THREE.RepeatWrapping;
  earthTexture.wrapT = THREE.ClampToEdgeWrapping;
  earthTexture.minFilter = THREE.LinearFilter;
  earthTexture.magFilter = THREE.LinearFilter;

  earthTexture.rotation = Math.PI; // 90 grados
  earthTexture.center.set(0.5, 0.5); // Centro de rotación en el medio de la textura

  return earthTexture;
}

// Crear textura de la Luna
function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // Base gris
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, 256, 128);
  
  // Cráteres
  ctx.fillStyle = '#6a6a6a';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 128;
    const r = 5 + Math.random() * 15;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  return new THREE.CanvasTexture(canvas);
}

function createSunSprite() {
  // Sol principal (núcleo brillante)
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Gradiente radial más intenso
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.1, 'rgba(255, 255, 240, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 240, 200, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 220, 150, 0.9)');
  gradient.addColorStop(0.7, 'rgba(255, 180, 80, 0.6)');
  gradient.addColorStop(0.85, 'rgba(255, 140, 40, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  
  const material = new THREE.SpriteMaterial({ 
    map: new THREE.CanvasTexture(canvas), 
    transparent: true, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false,
    opacity: 1.0 // Más opaco para más brillo
  });
  
  sunSprite = new THREE.Sprite(material);
  
  // Tamaño visual más grande (simula brillo intenso)
  const sunVisualSize = kmToRenderUnits(3000000); // 3x más grande
  sunSprite.scale.set(sunVisualSize, sunVisualSize, 1);
  scene.add(sunSprite);
  
  // Halo externo (corona solar)
  const canvasGlow = document.createElement('canvas');
  canvasGlow.width = canvasGlow.height = 512;
  const ctxGlow = canvasGlow.getContext('2d');
  
  const gradientGlow = ctxGlow.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradientGlow.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
  gradientGlow.addColorStop(0.3, 'rgba(255, 220, 150, 0.3)');
  gradientGlow.addColorStop(0.6, 'rgba(255, 180, 100, 0.15)');
  gradientGlow.addColorStop(1, 'rgba(255, 140, 50, 0)');
  ctxGlow.fillStyle = gradientGlow;
  ctxGlow.fillRect(0, 0, 512, 512);
  
  const materialGlow = new THREE.SpriteMaterial({ 
    map: new THREE.CanvasTexture(canvasGlow), 
    transparent: true, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false,
    opacity: 0.8
  });
  
  sunGlow = new THREE.Sprite(materialGlow);
  sunGlow.scale.set(sunVisualSize * 3.5, sunVisualSize * 3.5, 1); // Halo más grande
  scene.add(sunGlow);
  
  // Destellos de lente (lens flare efecto)
  const canvasFlare = document.createElement('canvas');
  canvasFlare.width = canvasFlare.height = 256;
  const ctxFlare = canvasFlare.getContext('2d');
  
  const gradientFlare = ctxFlare.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradientFlare.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  gradientFlare.addColorStop(0.5, 'rgba(255, 200, 100, 0.3)');
  gradientFlare.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctxFlare.fillStyle = gradientFlare;
  ctxFlare.fillRect(0, 0, 256, 256);
  
  const materialFlare = new THREE.SpriteMaterial({ 
    map: new THREE.CanvasTexture(canvasFlare), 
    transparent: true, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false,
    opacity: 0.6
  });
  
  window.sunFlare = new THREE.Sprite(materialFlare);
  window.sunFlare.scale.set(sunVisualSize * 1.5, sunVisualSize * 1.5, 1);
  scene.add(window.sunFlare);
}

function createEarthOrbitAroundSun() {
  const points = [];
  for (let i = 0; i <= 720; i++) {
    const state = orbitalElementsToStateVectors(earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, earthOrbit.Omega_deg, earthOrbit.omega_deg, (i / 720) * 360);
    points.push(new THREE.Vector3(metersToRenderUnits(state.r[0]), metersToRenderUnits(state.r[1]), metersToRenderUnits(state.r[2])));
  }
  
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.5, linewidth: 2 });
  return new THREE.Line(geometry, material);
}

function createOrbitLine(orbit, color, dashed = false) {
  const points = [];
  for (let i = 0; i <= segmentsOrbit; i++) {
    const state = orbitalElementsToStateVectors(orbit.a_au, orbit.e || 0, orbit.i_deg || 0, orbit.Omega_deg || 0, orbit.omega_deg || 0, (i / segmentsOrbit) * 360);
    points.push(new THREE.Vector3(metersToRenderUnits(state.r[0]), metersToRenderUnits(state.r[1]), metersToRenderUnits(state.r[2])));
  }
  
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: kmToRenderUnits(5e6), gapSize: kmToRenderUnits(3e6), linewidth: 2 })
    : new THREE.LineBasicMaterial({ color, linewidth: 2 });
  
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function updateOriginalOrbitUnified(orbitalData) {
  if (!scene) return;
  if (originalOrbitLine) scene.remove(originalOrbitLine);
  originalOrbitLine = createOrbitLine(orbitalData, 0x6fb5ff, true);
  scene.add(originalOrbitLine);
}

function updateNewOrbitUnified(orbitData) {
  if (!scene) return;
  currentNewOrbit = orbitData;
  if (newOrbitLine) scene.remove(newOrbitLine);
  newOrbitLine = createOrbitLine(orbitData, 0x00ff88, false);
  scene.add(newOrbitLine);
  updateEncounterGraph();
}

/* ==================== LABELS DE Ã"RBITAS 3D ==================== */

let originalOrbitLabel = null;
let modifiedOrbitLabel = null;

function createOrbitLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // Fondo semi-transparente
  ctx.fillStyle = color === 0x6fb5ff ? 'rgba(111, 181, 255, 0.25)' : 'rgba(0, 255, 136, 0.25)';
  ctx.fillRect(0, 0, 512, 128);
  
  // Borde
  ctx.strokeStyle = color === 0x6fb5ff ? '#6fb5ff' : '#00ff88';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 124);
  
  // Texto
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });
  
  const sprite = new THREE.Sprite(material);
  const scale = kmToRenderUnits(EARTH_RADIUS_KM) * 8;
  sprite.scale.set(scale * 4, scale, 1);
  
  return sprite;
}

function updateOrbitLabels() {
  if (!scene) return;
  
  // Label de Ã³rbita original
  if (originalOrbitLine && selectedAsteroid?.orbital) {
    if (originalOrbitLabel) scene.remove(originalOrbitLabel);
    
    originalOrbitLabel = createOrbitLabel('Ã"rbita Original', 0x6fb5ff);
    
    // Posicionar en el apoastro (punto mÃ¡s lejano)
    const apoastroState = orbitalElementsToStateVectors(
      selectedAsteroid.orbital.a_au,
      selectedAsteroid.orbital.e || 0,
      selectedAsteroid.orbital.i_deg || 0,
      selectedAsteroid.orbital.Omega_deg || 0,
      selectedAsteroid.orbital.omega_deg || 0,
      180 // AngulaciÃ³n verdadera en el apoastro
    );
    
    originalOrbitLabel.position.set(
      metersToRenderUnits(apoastroState.r[0]),
      metersToRenderUnits(apoastroState.r[1]),
      metersToRenderUnits(apoastroState.r[2]) + kmToRenderUnits(EARTH_RADIUS_KM) * 5
    );
    
    scene.add(originalOrbitLabel);
  }
  
  // Label de Ã³rbita modificada
  if (newOrbitLine && currentNewOrbit) {
    if (modifiedOrbitLabel) scene.remove(modifiedOrbitLabel);
    
    modifiedOrbitLabel = createOrbitLabel('Ã"rbita Desviada', 0x00ff88);
    
    // Posicionar en el apoastro de la nueva Ã³rbita
    const apoastroStateNew = orbitalElementsToStateVectors(
      currentNewOrbit.a_au,
      currentNewOrbit.e || 0,
      currentNewOrbit.i_deg || 0,
      currentNewOrbit.Omega_deg || 0,
      currentNewOrbit.omega_deg || 0,
      180
    );
    
    modifiedOrbitLabel.position.set(
      metersToRenderUnits(apoastroStateNew.r[0]),
      metersToRenderUnits(apoastroStateNew.r[1]),
      metersToRenderUnits(apoastroStateNew.r[2]) + kmToRenderUnits(EARTH_RADIUS_KM) * 5
    );
    
    scene.add(modifiedOrbitLabel);
  }
}

// Modificar updateOriginalOrbitUnified para incluir labels
const originalUpdateOriginalOrbitUnified = updateOriginalOrbitUnified;
updateOriginalOrbitUnified = function(orbitalData) {
  originalUpdateOriginalOrbitUnified(orbitalData);
  updateOrbitLabels();
};

// Modificar updateNewOrbitUnified para incluir labels
const originalUpdateNewOrbitUnified = updateNewOrbitUnified;
updateNewOrbitUnified = function(orbitData) {
  originalUpdateNewOrbitUnified(orbitData);
  updateOrbitLabels();
};

// Actualizar posiciÃ³n de labels en el loop de animaciÃ³n
// AÃ±adir esto dentro de animateUnified(), justo antes de renderer.render():
function updateOrbitLabelsPosition() {
  if (originalOrbitLabel && earthHeliocentricPos_m) {
    const offset = [
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.x) * 1e6) / 1e6,
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.y) * 1e6) / 1e6,
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.z) * 1e6) / 1e6
    ];
    
    if (originalOrbitLabel.userData.originalPosition) {
      originalOrbitLabel.position.set(
        originalOrbitLabel.userData.originalPosition.x + offset[0],
        originalOrbitLabel.userData.originalPosition.y + offset[1],
        originalOrbitLabel.userData.originalPosition.z + offset[2]
      );
    } else {
      originalOrbitLabel.userData.originalPosition = {
        x: originalOrbitLabel.position.x - offset[0],
        y: originalOrbitLabel.position.y - offset[1],
        z: originalOrbitLabel.position.z - offset[2]
      };
    }
  }
  
  if (modifiedOrbitLabel && earthHeliocentricPos_m) {
    const offset = [
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.x) * 1e6) / 1e6,
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.y) * 1e6) / 1e6,
      Math.round(-metersToRenderUnits(earthHeliocentricPos_m.z) * 1e6) / 1e6
    ];
    
    if (modifiedOrbitLabel.userData.originalPosition) {
      modifiedOrbitLabel.position.set(
        modifiedOrbitLabel.userData.originalPosition.x + offset[0],
        modifiedOrbitLabel.userData.originalPosition.y + offset[1],
        modifiedOrbitLabel.userData.originalPosition.z + offset[2]
      );
    } else {
      modifiedOrbitLabel.userData.originalPosition = {
        x: modifiedOrbitLabel.position.x - offset[0],
        y: modifiedOrbitLabel.position.y - offset[1],
        z: modifiedOrbitLabel.position.z - offset[2]
      };
    }
  }
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

  if (!isPaused) simulationTime += timeStep * timeSpeed;

  // Tierra: traslación y rotación
  const M_e_current_rad = toRad(earthOrbit.M_deg) + earthOrbit.mean_motion_rad_s * simulationTime;
  const earthState = orbitalElementsToStateVectors(earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, earthOrbit.Omega_deg, earthOrbit.omega_deg, toDeg(M_e_current_rad));
  earthHeliocentricPos_m.set(earthState.r[0], earthState.r[1], earthState.r[2]);

  earth.position.set(0, 0, 0);
  
  // Rotación de la Tierra sobre su propio eje
  const earthRotationAngle = (simulationTime / EARTH_ROTATION_PERIOD) * Math.PI * 2;
  
  // Resetear rotación
  earth.rotation.set(0, 0, 0);

  earth.rotation.x = toRad(-90);
  //earth.rotation.z = toRad(23.5);
  earth.rotation.y = -earthRotationAngle;

  // Luna orbitando la Tierra con inclinación correcta respecto a la eclíptica
  if (window.moonMesh) {
    const moonAngle = (simulationTime / MOON_ORBITAL_PERIOD) * Math.PI * 2;
    const moonDist = kmToRenderUnits(MOON_DISTANCE);
    
    // La Luna orbita en el plano eclíptico (XY) con 5.145° de inclinación
    const moonInclination = toRad(5.145);
    
    // Posición en órbita inclinada respecto a la eclíptica
    // La inclinación rota el plano orbital alrededor del eje X
    const moonX = Math.cos(moonAngle) * moonDist;
    const moonY = Math.sin(moonAngle) * moonDist * Math.cos(moonInclination);
    const moonZ = Math.sin(moonAngle) * moonDist * Math.sin(moonInclination);
    
    window.moonMesh.position.set(moonX, moonY, moonZ);
    
    // Rotación sincrónica (siempre muestra la misma cara a la Tierra)
    window.moonMesh.rotation.y = moonAngle;
    
    // Actualizar etiqueta de la Luna
    if (window.moonLabel) {
      const labelOffset = kmToRenderUnits(EARTH_RADIUS_KM) * 3;
      window.moonLabel.position.set(moonX, moonY, moonZ + labelOffset);
    }
  }

  // Offset heliocéntrico
  const [earthOffsetX, earthOffsetY, earthOffsetZ] = [
    Math.round(-metersToRenderUnits(earthHeliocentricPos_m.x) * 1e6) / 1e6,
    Math.round(-metersToRenderUnits(earthHeliocentricPos_m.y) * 1e6) / 1e6,
    Math.round(-metersToRenderUnits(earthHeliocentricPos_m.z) * 1e6) / 1e6
  ];

  if (sunSprite) {
    sunSprite.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
    if (sunGlow) sunGlow.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
    if (window.sunFlare) window.sunFlare.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
  }
  
  if (earthOrbitAroundSun) earthOrbitAroundSun.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
  if (earthPositionMarker) earthPositionMarker.position.set(0, 0, 0);

  if (selectedAsteroid?.orbital) {
    const orb = selectedAsteroid.orbital;
    if (!orb.mean_motion_rad_s) orb.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(orb.a_au * AU, 3));
    
    const M_current_rad = toRad(orb.M_deg || 0) + orb.mean_motion_rad_s * simulationTime;
    const asteroidState = orbitalElementsToStateVectors(orb.a_au, orb.e, orb.i_deg, orb.Omega_deg, orb.omega_deg, toDeg(M_current_rad));
    
    const [relX, relY, relZ] = [
      asteroidState.r[0] - earthHeliocentricPos_m.x,
      asteroidState.r[1] - earthHeliocentricPos_m.y,
      asteroidState.r[2] - earthHeliocentricPos_m.z
    ];

    asteroidMesh.position.set(metersToRenderUnits(relX), metersToRenderUnits(relY), metersToRenderUnits(relZ));
    
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

  if (window.sunLight) {
    window.sunLight.position.set(earthOffsetX, earthOffsetY, earthOffsetZ);
  }

  if (gameMode && !gameOver) checkGameStatus();

  updateOrbitLabelsPosition();

  renderer.render(scene, camera);
}

function autoFrameScene() {
  if (!selectedAsteroid?.orbital || !camera || !controls) return;
  
  const a_render = selectedAsteroid.orbital.a_au * AU / 1000 / currentRenderScale;
  const earthRadius_render = kmToRenderUnits(EARTH_RADIUS_KM);
  const maxDimension = Math.max(a_render * 2, earthRadius_render * 10);
  const distance = maxDimension * 1.5;
  
  camera.position.set(distance, distance * 0.7, distance * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();
}

function updateDistanceDisplay(distance_m) {
  const distEl = document.getElementById('currentDistance');
  if (distEl) {
    const earthRadii = distance_m / EARTH_RADIUS;
    distEl.innerHTML = `Distancia actual: <strong>${formatDistance(distance_m)}</strong> (<strong>${earthRadii.toFixed(2)} R⊕</strong>)`;
  }
}

function updateClosestApproachMarkers(approachData) {
  if (!scene || !approachData.stateAtMin || !approachData.earthStateAtMin) return;

  if (!asteroidMarker) {
    asteroidMarker = new THREE.Mesh(new THREE.SphereGeometry(kmToRenderUnits(5000), 16, 16), new THREE.MeshBasicMaterial({ color: 0xff4747 }));
    scene.add(asteroidMarker);
  }

  if (!earthMarker) {
    earthMarker = new THREE.Mesh(new THREE.SphereGeometry(kmToRenderUnits(5000), 16, 16), new THREE.MeshBasicMaterial({ color: 0x47d1ff }));
    scene.add(earthMarker);
  }

  const asteroidPos = approachData.stateAtMin.r;
  asteroidMarker.position.set(
    metersToRenderUnits(asteroidPos[0] - approachData.earthStateAtMin.r[0]),
    metersToRenderUnits(asteroidPos[1] - approachData.earthStateAtMin.r[1]),
    metersToRenderUnits(asteroidPos[2] - approachData.earthStateAtMin.r[2])
  );

  earthMarker.position.set(0, 0, 0);
}

function updateScaleIndicator() {
  const indicator = document.getElementById('scaleIndicator');
  if (indicator) indicator.textContent = `Escala: 1 unidad = ${(currentRenderScale/1000).toFixed(0)} k km`;
}

function focusOnEncounter() {
  if (!selectedAsteroid?.orbital || !controls) return;
  
  const approach = sampleClosestApproach(selectedAsteroid.orbital);
  const [r_rel_x, r_rel_y, r_rel_z] = [
    approach.stateAtMin.r[0] - approach.earthStateAtMin.r[0],
    approach.stateAtMin.r[1] - approach.earthStateAtMin.r[1],
    (approach.stateAtMin.r[2] || 0) - (approach.earthStateAtMin.r[2] || 0)
  ];
  
  const distance = metersToRenderUnits(Math.hypot(r_rel_x, r_rel_y, r_rel_z)) * 2;
  
  camera.position.set(
    metersToRenderUnits(r_rel_x) + distance * 0.5,
    metersToRenderUnits(r_rel_y) + distance * 0.3,
    metersToRenderUnits(r_rel_z) + distance * 0.3
  );
  
  controls.target.set(metersToRenderUnits(r_rel_x) * 0.5, metersToRenderUnits(r_rel_y) * 0.5, metersToRenderUnits(r_rel_z) * 0.5);
  controls.update();
}

/* -------------------- GRÁFICO DE ENCUENTRO -------------------- */
function updateEncounterGraph() {
  const canvas = document.getElementById('encounterGraph');
  if (!canvas || !selectedAsteroid?.orbital) return;
  
  const ctx = canvas.getContext('2d');
  const [width, height] = [canvas.width, canvas.height];
  
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, width, height);
  
  const daysRange = 60, samples = 200;
  const baseApproach = sampleClosestApproach(selectedAsteroid.orbital);
  const encounterTime = baseApproach.timeAtMin;
  
  const originalData = [], modifiedData = [];
  
  const a_m = selectedAsteroid.orbital.a_au * AU;
  const period = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / MU_SUN);
  const n_earth = earthOrbit.mean_motion_rad_s;

  for (let i = 0; i <= samples; i++) {
    const frac = i / samples;
    const t = encounterTime + (frac - 0.5) * daysRange * 86400;
    const M_deg = ((selectedAsteroid.orbital.M_deg + (2 * Math.PI / period) * t * 180 / Math.PI) % 360 + 360) % 360;
    const M_earth_deg = ((toDeg(toRad(earthOrbit.M_deg) + n_earth * t) % 360) + 360) % 360;
    
    const stateAst = orbitalElementsToStateVectors(selectedAsteroid.orbital.a_au, selectedAsteroid.orbital.e, selectedAsteroid.orbital.i_deg, 
                                                    selectedAsteroid.orbital.Omega_deg, selectedAsteroid.orbital.omega_deg, M_deg);
    const stateEarth = orbitalElementsToStateVectors(earthOrbit.a_au, earthOrbit.e, earthOrbit.i_deg, earthOrbit.Omega_deg, earthOrbit.omega_deg, M_earth_deg);
    
    const dist = Math.hypot(stateAst.r[0] - stateEarth.r[0], stateAst.r[1] - stateEarth.r[1], stateAst.r[2] - stateEarth.r[2]);
    originalData.push({ t: (frac - 0.5) * daysRange, dist });
    
    if (currentNewOrbit) {
      const stateNew = orbitalElementsToStateVectors(currentNewOrbit.a_au, currentNewOrbit.e, currentNewOrbit.i_deg || 0, 
                                                      currentNewOrbit.Omega_deg || 0, currentNewOrbit.omega_deg || 0, M_deg);
      const distNew = Math.hypot(stateNew.r[0] - stateEarth.r[0], stateNew.r[1] - stateEarth.r[1], stateNew.r[2] - stateEarth.r[2]);
      modifiedData.push({ t: (frac - 0.5) * daysRange, dist: distNew });
    }
  }
  
  const allDists = [...originalData.map(d => d.dist), ...modifiedData.map(d => d.dist)];
  const [minDist, maxDist] = [Math.min(...allDists), Math.max(...allDists)];
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
    const [x, y] = [mapX(point.t), mapY(point.dist)];
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Curva modificada
  if (modifiedData.length > 0) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    modifiedData.forEach((point, i) => {
      const [x, y] = [mapX(point.t), mapY(point.dist)];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
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
  await loadNeos(document.getElementById('searchQuery')?.value?.trim() || '');
}

async function fetchAndSelectNeo(id) {
  try {
    const neo = await fetchNeoById(id);
    if (!neo) return alert('No se pudo cargar el asteroide desde NASA');

    selectedAsteroid = neo;
    simulationTime = 0;
    
    if (neo.orbital?.a_au) neo.orbital.mean_motion_rad_s = Math.sqrt(MU_SUN / Math.pow(neo.orbital.a_au * AU, 3));

    const detailsEl = document.getElementById('asteroidDetails');
    if (detailsEl) {
      detailsEl.innerHTML = `<strong>${neo.fullName || neo.name}</strong>
        <div style="margin-top:8px; line-height:1.6;">
          <div>📏 Diámetro: ${fmtSmart(neo.diameter || 0, 'm')}</div>
          <div>⚖️ Masa: ${fmtSmart(neo.mass || 0, 'kg')}</div>
          <div>🚀 Velocidad: ${fmtSmart(neo.velocity || 0, 'm/s')}</div>
          ${neo.orbital ? `<div style="margin-top:6px; color:#9fc8ff;">a: ${neo.orbital.a_au.toFixed(3)} AU • e: ${neo.orbital.e.toFixed(3)}</div>` : ''}
        </div>`;
    }

    [originalOrbitLine, newOrbitLine, asteroidMarker, earthMarker].forEach(obj => obj && scene.remove(obj));
    [originalOrbitLine, newOrbitLine, asteroidMarker, earthMarker] = [null, null, null, null];

    if (neo.orbital?.a_au) {
      originalOrbitLine = createOrbitLine(neo.orbital, 0x6fb5ff, true);
      scene.add(originalOrbitLine);

      const initialApproach = sampleClosestApproach(neo.orbital);
      updateClosestApproachMarkers(initialApproach);
      
      const minDistEl = document.getElementById('minDistanceInfo');
      if (minDistEl) minDistEl.textContent = `Mín: ${formatDistance(initialApproach.minDist)} (${(initialApproach.minDist/EARTH_RADIUS).toFixed(2)} R⊕)`;
      
      updateEncounterGraph();
      setTimeout(() => autoFrameScene(), 100);
    }
  } catch (err) {
    console.error('Error fetchAndSelectNeo:', err);
    alert('Error al cargar NEO: ' + err.message);
  }
}

function calculateAllStrategies() {
  if (!selectedAsteroid) return alert('Selecciona un asteroide primero');

  const warningYears = parseFloat(document.getElementById('warningTime')?.value) || 5;
  const distanceAU = parseFloat(document.getElementById('distance')?.value) || 1.5;
  const distanceMeters = distanceAU * AU;

  const v = selectedAsteroid.velocity || 25000;
  const timeByDistance = v > 0 ? (distanceMeters / v) : (warningYears * 365.25 * 24 * 3600);
  const timeSecondsUsed = Math.min(timeByDistance, warningYears * 365.25 * 24 * 3600) || warningYears * 365.25 * 24 * 3600;

  const desiredMissMeters = EARTH_RADIUS;
  const deltaV_required = selectedAsteroid.orbital 
    ? estimateRequiredDeltaV(selectedAsteroid.orbital, desiredMissMeters).requiredDV
    : desiredMissMeters / timeSecondsUsed;

  currentResults = [
    strategyCalculators.kinetic(selectedAsteroid, timeSecondsUsed),
    strategyCalculators.gravitational(selectedAsteroid, timeSecondsUsed),
    strategyCalculators.laser(selectedAsteroid, timeSecondsUsed),
    strategyCalculators.ion(selectedAsteroid, timeSecondsUsed),
    strategyCalculators.nuclear(selectedAsteroid, timeSecondsUsed)
  ];

  currentResults.forEach(r => {
    r.success = isFinite(deltaV_required) ? (r.deltaV >= deltaV_required) : false;
    r.timeSecondsUsed = timeSecondsUsed;
  });

  displayResultsUnified(currentResults, deltaV_required, timeSecondsUsed);

  const best = currentResults.reduce((acc, cur, idx) => 
    (cur.success && (cur.earthRadii || -Infinity) > acc.earthRadii) ? { ...cur, idx } : acc
  , { earthRadii: -1, idx: -1 });

  selectStrategyUnified(best.idx >= 0 ? best.idx : 0);
}

function estimateRequiredDeltaV(orbit, desiredMissMeters) {
  const base = sampleClosestApproach(orbit);
  const requiredExtra = Math.max(0, desiredMissMeters - base.minDist);

  if (requiredExtra <= 0) return { requiredDV: 0, direction: null, baseDist: base.minDist };

  const directions = ['tangential', 'radial', 'normal'];
  const dv_test = 0.5;

  const results = directions.map(dir => {
    const orbitAtApplication = { ...orbit, M_deg: base.minM };
    const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, dv_test);
    const changed = sampleClosestApproach(newOrbit);
    const deltaMiss = changed.minDist - base.minDist;
    const sens = deltaMiss / dv_test;
    const requiredDV = (sens > 1e-12) ? Math.abs(requiredExtra / sens) : Infinity;
    return { dir, sens, requiredDV, baseDist: base.minDist };
  });

  results.sort((a, b) => a.requiredDV - b.requiredDV);
  return { requiredDV: results[0].requiredDV, direction: results[0].dir, baseDist: base.minDist };
}

function displayResultsUnified(results, deltaV_required, timeSecondsUsed) {
  const grid = document.getElementById('resultsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Descripciones de cada estrategia
  const strategyDescriptions = {
    "Impacto Cinético": "Consiste en lanzar una nave espacial a alta velocidad contra el asteroide para transferir momento lineal y cambiar su trayectoria mediante colisión. Es la técnica más probada (misión DART de NASA).",
    "Tractor Gravitacional": "Una nave espacial masiva se posiciona cerca del asteroide durante años, usando su propia gravedad para 'remolcarlo' gradualmente. Método lento pero muy preciso y seguro.",
    "Ablación Láser": "Usa láseres de alta potencia para evaporar material de la superficie del asteroide, creando un chorro de gas que actúa como propulsor natural y lo empuja en dirección opuesta.",
    "Haz de Iones": "Bombardea el asteroide con iones acelerados que ablacionan su superficie, generando empuje similar a un motor iónico. Requiere menos energía que el láser pero es más lento.",
    "Explosión Nuclear": "Detona un dispositivo nuclear cerca (no sobre) el asteroide para vaporizarlo parcialmente. La expansión rápida del material actúa como propulsor. Último recurso para amenazas inminentes."
  };

  results.forEach((res, index) => {
    const card = document.createElement('div');
    card.className = 'strategy-card';
    card.onclick = () => selectStrategyUnified(index);

    const paramsHTML = Object.entries(res.parameters || {})
      .map(([k, v]) => `<div class="result-item"><span class="result-label">${k}:</span> <span class="small">${v}</span></div>`)
      .join('');

    const successClass = res.success ? '#00ff88' : '#ff6b35';
    const successText = res.success ? '✅ MISIÓN EXITOSA' : '⚠ INSUFICIENTE';

    card.innerHTML = `
      <div class="strategy-title">${res.method}</div>
      <div class="strategy-description">
        <strong>🔬 Cómo funciona:</strong> ${strategyDescriptions[res.method] || 'Técnica de deflexión avanzada'}
      </div>
      <div class="formula">${res.formula || ''}</div>
      ${paramsHTML}
      <div class="result-item"><span class="result-label">Δv obtenido:</span> ${fmt(res.deltaV, 'm/s', 6)}</div>
      <div class="result-item"><span class="result-label">Δv requerido (estim.):</span> ${fmt(deltaV_required, 'm/s', 6)}</div>
      <div class="result-item" style="color:${successClass}; font-weight:bold; margin-top: 8px;">${successText}</div>
      <div class="result-item"><span class="result-label">Desviación total:</span> ${formatDistance(res.deviation)}</div>
      <div class="result-item"><span class="result-label">Radios terrestres:</span> ${fmt(res.earthRadii, 'R⊕', 3)}</div>
      <div class="result-item"><span class="result-label">Tiempo usado:</span> ${fmt(timeSecondsUsed / (365.25 * 24 * 3600), 'años', 2)}</div>
    `;
    grid.appendChild(card);
  });

  const summaryEl = document.getElementById('resultsSummary');
  if (summaryEl) summaryEl.textContent = `${results.length} estrategias • Δv requerido (estim.): ${fmt(deltaV_required, 'm/s')}`;
}

function selectStrategyUnified(index) {
  selectedStrategyIndex = index;
  document.querySelectorAll('.card-game-enhanced').forEach((c, i) => c.classList.toggle('selected-strategy', i === index));

  if (!currentResults?.[index] || !selectedAsteroid?.orbital) return;

  const result = currentResults[index];
  const baseApproach = sampleClosestApproach(selectedAsteroid.orbital);
  const orbitAtApplication = { ...selectedAsteroid.orbital, M_deg: baseApproach.minM };
  const newOrbit = updateOrbitAfterDeltaV(orbitAtApplication, result.deltaV);

  if (newOrbit && newOrbit.a_au > 0) {
    updateNewOrbitUnified(newOrbit);
    
    if (gameMode && !gameOver) {
      const newApproach = sampleClosestApproach(newOrbit, 5000);
      const newMiss = newApproach.minDist;
      
      const vizInfo = document.getElementById('vizInfo');
      if (vizInfo) {
        if (newMiss > EARTH_RADIUS * 2) {
          vizInfo.innerHTML = `<div style="background: rgba(0,200,100,0.9); padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #00ff88;">
            <h3 style="margin: 0 0 10px 0; color: white;">✅ ESTRATEGIA APLICADA</h3>
            <div style="font-size: 16px; color: white;">
              <strong>${result.method}</strong><br>Nueva distancia: <strong>${formatDistance(newMiss)}</strong><br>(<strong>${(newMiss/EARTH_RADIUS).toFixed(2)} R⊕</strong>)
            </div>
            <div style="font-size: 14px; color: #eeffee; margin-top: 10px;">✅ Suficiente para evitar el impacto</div>
          </div>`;
        } else {
          vizInfo.innerHTML = `<div style="background: rgba(255,150,0,0.9); padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #ffaa00;">
            <h3 style="margin: 0 0 10px 0; color: white;">⚠️ INSUFICIENTE</h3>
            <div style="font-size: 16px; color: white;">
              <strong>${result.method}</strong><br>Distancia resultante: <strong>${formatDistance(newMiss)}</strong><br>(<strong>${(newMiss/EARTH_RADIUS).toFixed(2)} R⊕</strong>)
            </div>
            <div style="font-size: 14px; color: #ffeeee; margin-top: 10px;">❌ Aún hay riesgo de impacto - Prueba otra estrategia</div>
          </div>`;
        }
      }
    }
  } else {
    if (newOrbitLine) scene.remove(newOrbitLine);
    [newOrbitLine, currentNewOrbit] = [null, null];
  }

  if (!gameMode) {
    const vizInfo = document.getElementById('vizInfo');
    if (vizInfo) {
      const successIcon = result.success ? '✅' : '⚠️';
      vizInfo.innerHTML = `${successIcon} <strong>${result.method}</strong><br>Desviación: ${formatDistance(result.deviation)} (${fmt(result.earthRadii, 'R⊕', 3)})`;
    }
  }
}

/* -------------------- CONTROLES -------------------- */
function togglePlayPause() {
  isPaused = !isPaused;
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.textContent = isPaused ? '▶️ Play' : '⏸️ Pause';
}

function resetSimulation() {
  simulationTime = 0;
  isPaused = false;
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.textContent = '⏸️ Pause';
}

/* -------------------- INICIALIZACIÓN UI -------------------- */
function bindUnifiedUI() {
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) searchBtn.addEventListener('click', loadNeosHandler);

  const searchQuery = document.getElementById('searchQuery');
  if (searchQuery) searchQuery.addEventListener('keypress', e => e.key === 'Enter' && loadNeosHandler());

  const loadDetailBtn = document.getElementById('loadDetailBtn');
  if (loadDetailBtn) {
    loadDetailBtn.addEventListener('click', async () => {
      const sel = document.getElementById('neoSelect');
      if (!sel?.value) return alert('Selecciona un NEO de la lista');
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
      [asteroids, selectedAsteroid, currentResults, simulationTime] = [[], null, null, 0];
      
      const updates = {
        'neoSelect': '', 'asteroidDetails': 'Ninguno', 'resultsGrid': '',
        'resultsSummary': 'Sin resultados'
      };
      Object.entries(updates).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val;
      });
      
      [newOrbitLine, originalOrbitLine, asteroidMarker, earthMarker].forEach(obj => obj && scene.remove(obj));
      [newOrbitLine, originalOrbitLine, asteroidMarker, earthMarker] = [null, null, null, null];
    });
  }

  const focusBtn = document.getElementById('focusEncounterBtn');
  if (focusBtn) focusBtn.addEventListener('click', focusOnEncounter);

  const centerEarthBtn = document.getElementById('centerEarthBtn');
  if (centerEarthBtn) {
    centerEarthBtn.addEventListener('click', () => {
      if (selectedAsteroid?.orbital) {
        autoFrameScene();
      } else {
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
    scaleSelect.addEventListener('change', e => changeRenderScale(e.target.value));
    Object.entries(SCALE_OPTIONS).forEach(([key, value]) => {
      const option = document.createElement('option');
      [option.value, option.textContent] = [key, value.label];
      if (key === '1M') option.selected = true;
      scaleSelect.appendChild(option);
    });
  }

  const speedSelect = document.getElementById('speedSelect');
  if (speedSelect) speedSelect.addEventListener('change', e => changeTimeSpeed(parseFloat(e.target.value)));

  const segmentsSlider = document.getElementById('segmentsSlider');
  if (segmentsSlider) {
    segmentsSlider.addEventListener('change', e => {
      changeOrbitSegments(parseInt(e.target.value));
      const label = document.getElementById('segmentsLabel');
      if (label) label.textContent = `Segmentos: ${e.target.value}`;
    });
  }

  const samplesSlider = document.getElementById('samplesSlider');
  if (samplesSlider) {
    samplesSlider.addEventListener('change', e => {
      changeSamplesPrecision(parseInt(e.target.value));
      const label = document.getElementById('samplesLabel');
      if (label) label.textContent = `Muestras: ${e.target.value}`;
    });
  }

  const startGameBtn = document.getElementById('startGameBtn');
  if (startGameBtn) startGameBtn.addEventListener('click', startGameMode);
  
  window.resetGame = resetGame;
}

/* ==================== SISTEMA DE TUTORIAL ==================== */

const tutorialSteps = [
  {
    target: '.app-header',
    title: '¡Bienvenido, defensor planetario!',
    content: 'Soy Chaac, tu guía en esta misión. Esta es la Calculadora de Mitigación de Asteroides NEO, donde aprenderás a salvar la Tierra de impactos cósmicos.',
    icon: '👋',
    position: 'center',
    blockInteraction: true
  },
  {
    target: '#searchQuery',
    title: 'Busca asteroides reales',
    content: 'Aquí puedes buscar asteroides del catálogo de la NASA. Prueba con nombres famosos como "Apophis", "Bennu", o simplemente un número como "433".',
    icon: '🔍',
    position: 'left',
    blockInteraction: false
  },
  {
    target: '#neoSelect',
    title: 'Selecciona tu objetivo',
    content: 'Los resultados aparecerán aquí. Haz doble clic en cualquier asteroide para cargarlo, o usa el botón "Cargar Detalle" debajo.',
    icon: '📋',
    position: 'left',
    blockInteraction: false
  },
  {
    target: '#asteroidDetails',
    title: 'Conoce a tu enemigo',
    content: 'Aquí verás toda la información del asteroide: diámetro, masa, velocidad y parámetros orbitales. ¡Datos cruciales para planear tu defensa!',
    icon: '📊',
    position: 'left',
    blockInteraction: false
  },
  {
    target: '#canvas3d',
    title: 'Visualización 3D en tiempo real',
    content: 'Este es tu centro de comando. Verás las órbitas del asteroide (línea azul punteada) y la Tierra. Usa el ratón para rotar, zoom y explorar el espacio.',
    icon: '🌌',
    position: 'center',
    blockInteraction: false
  },
  {
    target: '#warningTime',
    title: 'Configura tu misión',
    content: 'Define cuántos años de anticipación tienes. Más tiempo = más opciones de deflexión. Luego haz clic en "Calcular Estrategias".',
    icon: '⚙️',
    position: 'right',
    blockInteraction: false
  },
  {
    target: '.results-section',
    title: 'Estrategias de mitigación',
    content: 'Aquí aparecerán 5 estrategias diferentes: Impacto Cinético, Tractor Gravitacional, Ablación Láser, Haz de Iones y Explosión Nuclear. ¡Cada una con su efectividad!',
    icon: '🛡️',
    position: 'bottom',
    blockInteraction: false
  },
  {
    target: '.card-game',
    title: 'Modo Defensa Planetaria',
    content: '¿Listo para el desafío? Este modo simula un asteroide en curso de colisión. Tienes tiempo limitado para aplicar una estrategia y salvarnos a todos. ¡Buena suerte, defensor!',
    icon: '🎮',
    position: 'left',
    blockInteraction: false
  }
];

let currentTutorialStep = 0;
let tutorialActive = false;
let currentHighlightedElement = null;
let spotlightUpdateInterval = null;

function startTutorial() {
  console.log('🎓 Iniciando tutorial...');
  tutorialActive = true;
  currentTutorialStep = 0;
  
  const character = document.getElementById('tutorialCharacter');
  const dialog = document.getElementById('tutorialDialog');
  
  if (!character || !dialog) {
    console.error('❌ Elementos del tutorial no encontrados');
    console.log('Character:', character);
    console.log('Dialog:', dialog);
    return;
  }
  
  character.style.display = 'block';
  dialog.style.display = 'block';
  
  showTutorialStep(currentTutorialStep);
  
  // Actualizar posición del spotlight cada 100ms mientras el tutorial está activo
  spotlightUpdateInterval = setInterval(() => {
    if (tutorialActive && currentHighlightedElement) {
      updateSpotlightPosition(currentHighlightedElement);
    }
  }, 100);
}

function updateSpotlightPosition(element) {
  const spotlight = document.getElementById('tutorialSpotlight');
  if (!spotlight || !element) return;
  
  const rect = element.getBoundingClientRect();
  const padding = 12;
  
  spotlight.style.top = `${rect.top - padding}px`;
  spotlight.style.left = `${rect.left - padding}px`;
  spotlight.style.width = `${rect.width + padding * 2}px`;
  spotlight.style.height = `${rect.height + padding * 2}px`;
}

function showTutorialStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= tutorialSteps.length) {
    endTutorial();
    return;
  }
  
  console.log(`📖 Mostrando paso ${stepIndex + 1}/${tutorialSteps.length}`);
  
  const step = tutorialSteps[stepIndex];
  const spotlight = document.getElementById('tutorialSpotlight');
  const character = document.getElementById('tutorialCharacter');
  
  // Remover highlight del elemento anterior
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('tutorial-spotlight-target');
  }
  
  // Actualizar contenido del diálogo
  const titleText = document.getElementById('tutorialTitleText');
  const contentText = document.getElementById('tutorialContentText');
  const icon = document.getElementById('tutorialIcon');
  const progress = document.getElementById('tutorialProgress');
  
  if (titleText) titleText.textContent = step.title;
  if (contentText) contentText.textContent = step.content;
  if (icon) icon.textContent = step.icon;
  if (progress) progress.textContent = `${stepIndex + 1} / ${tutorialSteps.length}`;
  
  // Controles de navegación
  const prevBtn = document.getElementById('tutorialPrev');
  const nextBtn = document.getElementById('tutorialNext');
  
  if (prevBtn) prevBtn.style.display = stepIndex > 0 ? 'block' : 'none';
  if (nextBtn) nextBtn.textContent = stepIndex === tutorialSteps.length - 1 ? '¡Entendido! ✓' : 'Siguiente →';
  
  // Animar personaje
  if (character) {
    character.classList.add('talking');
    setTimeout(() => character.classList.remove('talking'), 800);
  }
  
  // Posicionar spotlight
  if (spotlight) {
    const targetElement = document.querySelector(step.target);
    if (targetElement) {
      currentHighlightedElement = targetElement;
      targetElement.classList.add('tutorial-spotlight-target');
      
      spotlight.style.display = 'block';
      updateSpotlightPosition(targetElement);
      
      // Scroll suave al elemento
      setTimeout(() => {
        const rect = targetElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const elementTop = rect.top + scrollTop;
        const windowHeight = window.innerHeight;
        const scrollToPosition = elementTop - (windowHeight / 2) + (rect.height / 2);
        
        window.scrollTo({
          top: scrollToPosition,
          behavior: 'smooth'
        });
      }, 100);
    } else {
      spotlight.style.display = 'none';
      currentHighlightedElement = null;
    }
  }
}

function nextTutorialStep() {
  console.log('➡️ Siguiente paso');
  currentTutorialStep++;
  if (currentTutorialStep >= tutorialSteps.length) {
    endTutorial();
  } else {
    showTutorialStep(currentTutorialStep);
  }
}

function prevTutorialStep() {
  console.log('⬅️ Paso anterior');
  if (currentTutorialStep > 0) {
    currentTutorialStep--;
    showTutorialStep(currentTutorialStep);
  }
}

function endTutorial() {
  console.log('✅ Tutorial completado');
  tutorialActive = false;
  
  // Limpiar interval
  if (spotlightUpdateInterval) {
    clearInterval(spotlightUpdateInterval);
    spotlightUpdateInterval = null;
  }
  
  // Remover highlight del elemento actual
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('tutorial-spotlight-target');
    currentHighlightedElement = null;
  }
  
  const character = document.getElementById('tutorialCharacter');
  const dialog = document.getElementById('tutorialDialog');
  const spotlight = document.getElementById('tutorialSpotlight');
  
  if (character) character.style.display = 'none';
  if (dialog) dialog.style.display = 'none';
  if (spotlight) spotlight.style.display = 'none';
  
  // Guardar en localStorage que ya vio el tutorial
  localStorage.setItem('neoTutorialCompleted', 'true');
}

// Función para inicializar los event listeners del tutorial
function initTutorialListeners() {
  console.log('🔧 Inicializando listeners del tutorial...');
  
  const nextBtn = document.getElementById('tutorialNext');
  const prevBtn = document.getElementById('tutorialPrev');
  const skipBtn = document.getElementById('tutorialSkip');
  
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      nextTutorialStep();
    });
    console.log('✓ Listener "Siguiente" añadido');
  } else {
    console.error('❌ Botón "Siguiente" no encontrado');
  }
  
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      prevTutorialStep();
    });
    console.log('✓ Listener "Anterior" añadido');
  } else {
    console.error('❌ Botón "Anterior" no encontrado');
  }
  
  if (skipBtn) {
    skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      endTutorial();
    });
    console.log('✓ Listener "Saltar" añadido');
  } else {
    console.error('❌ Botón "Saltar" no encontrado');
  }
  
  // Cerrar tutorial con ESC
  document.addEventListener('keydown', (e) => {
    if (tutorialActive && e.key === 'Escape') {
      endTutorial();
    }
  });
  console.log('✓ Listener ESC añadido');
  
  // Actualizar spotlight en resize
  window.addEventListener('resize', () => {
    if (tutorialActive && currentHighlightedElement) {
      updateSpotlightPosition(currentHighlightedElement);
    }
  });
}

// Exportar función para reiniciar tutorial manualmente
window.restartTutorial = () => {
  console.log('🔄 Reiniciando tutorial manualmente...');
  localStorage.removeItem('neoTutorialCompleted');
  startTutorial();
};

// Auto-iniciar tutorial en primera visita
function checkAndStartTutorial() {
  const hasSeenTutorial = localStorage.getItem('neoTutorialCompleted');
  console.log('🔍 Verificando tutorial:', hasSeenTutorial ? 'Ya visto ✓' : 'Primera vez - Iniciando...');
  
  if (!hasSeenTutorial) {
    setTimeout(() => {
      console.log('🚀 Iniciando tutorial automático...');
      startTutorial();
    }, 1500);
  } else {
    console.log('ℹ️ Para ver el tutorial de nuevo, ejecuta: restartTutorial()');
  }
}

/* -------------------- INICIALIZACIÓN -------------------- */
function initUnified() {
  console.log('Inicializando simulador Earth-Centered (optimizado)...');
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

  // ⭐ ESTAS DOS LÍNEAS SON CRÍTICAS ⭐
  initTutorialListeners();
  checkAndStartTutorial();

  console.log('✅ Sistema listo');
}

// Auto-iniciar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUnified);
} else {
  initUnified();
}

// Auto-iniciar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUnified);
} else {
  initUnified();
}

/* ==================== SISTEMA DE PANELES INFORMATIVOS ==================== */

const infoPanelContent = {
  game: {
    title: "🚨 Modo Defensa Planetaria",
    text: "Este modo simula un escenario de emergencia real: un asteroide en curso de colisión con la Tierra. Tu misión es calcular y aplicar una estrategia de mitigación antes de que se acabe el tiempo. El asteroide se reposicionará en una órbita de impacto y deberás lograr desviarlo más de 2 radios terrestres para ganar."
  },
  days: {
    title: "⏱️ Días hasta impacto",
    text: "Define cuánto tiempo tienes antes del impacto (30-365 días). Menos tiempo = mayor desafío. Durante la simulación, verás un cronómetro en tiempo real. Debes calcular estrategias y seleccionar una efectiva antes de que el tiempo se agote."
  },
  mission: {
    title: "🎯 Parámetros de Misión",
    text: "Esta sección te permite configurar los parámetros clave para calcular las estrategias de deflexión. El tiempo de advertencia y la distancia determinan qué tan efectivas serán las diferentes técnicas de mitigación."
  },
  warning: {
    title: "⏱️ Tiempo de Advertencia",
    text: "El tiempo (en años) que tienes para preparar y ejecutar la misión de deflexión. Más tiempo = mayor efectividad de todas las estrategias. Con más anticipación, incluso pequeños cambios de velocidad producen grandes desviaciones orbitales. Valores típicos: 5-20 años."
  },
  calculate: {
    title: "🚀 Calcular Estrategias",
    text: "Este botón ejecuta los cálculos para las 5 estrategias de mitigación disponibles: Impacto Cinético, Tractor Gravitacional, Ablación Láser, Haz de Iones y Explosión Nuclear. Cada una se evalúa según los parámetros actuales y el asteroide seleccionado. Los resultados muestran el cambio de velocidad (Δv) y la desviación lograda."
  },
  rendering: {
    title: "🎨 Opción de Renderizado",
    text: "Controla la calidad visual y precisión de los cálculos. Valores más altos = mayor detalle pero más carga computacional. Ajusta según el rendimiento de tu dispositivo."
  },
  segments: {
    title: "🔄 Segmentos de Órbita",
    text: "Número de puntos usados para dibujar las órbitas (64-512). Más segmentos = órbitas más suaves y precisas visualmente, pero requieren más procesamiento. Recomendado: 256 para equilibrio entre calidad y rendimiento."
  },
  samples: {
    title: "🔬 Muestras de Precisión",
    text: "Número de puntos analizados para calcular el acercamiento más cercano a la Tierra (500-3000). Más muestras = cálculos más precisos del punto de encuentro, especialmente importante para órbitas muy elípticas. Valores altos aumentan el tiempo de cálculo. Recomendado: 1500."
  }
};

function showInfoPanel(infoType) {
  const panel = document.getElementById('infoPanel');
  const overlay = document.getElementById('infoPanelOverlay');
  const title = document.getElementById('infoPanelTitle');
  const text = document.getElementById('infoPanelText');
  
  if (!panel || !overlay || !title || !text) {
    console.error('Elementos del panel de info no encontrados');
    return;
  }
  
  const content = infoPanelContent[infoType];
  if (!content) {
    console.error('Contenido no encontrado para:', infoType);
    return;
  }
  
  title.textContent = content.title;
  text.textContent = content.text;
  
  overlay.style.display = 'block';
  panel.style.display = 'block';
  
  // Prevenir cierre accidental durante tutorial
  if (tutorialActive) {
    overlay.onclick = null;
  }
}

function closeInfoPanel() {
  const panel = document.getElementById('infoPanel');
  const overlay = document.getElementById('infoPanelOverlay');
  
  if (panel) panel.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

// Cerrar con ESC (ya existe uno arriba en el tutorial, pero no hace daño tener este también)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !tutorialActive) {
    closeInfoPanel();
  }
});

// Exportar para uso global
window.showInfoPanel = showInfoPanel;
window.closeInfoPanel = closeInfoPanel;
