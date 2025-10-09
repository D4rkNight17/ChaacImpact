// ========================
// Configuración del mapa
// ========================

Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NmY5ZDA2Yi0zMzliLTRkOTEtYTYyYS05YTQ0NjQxYzMxNmMiLCJpZCI6MzQ4MzgxLCJpYXQiOjE3NTk5MzI3NDB9.RAB3s6EwdShkIYv8LKHz7SjfB_THmMtcmIvwDC_g3IA";

const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  animation: false,
  baseLayerPicker: false,
  timeline: false,
  homeButton: false,
  navigationHelpButton: false,
  fullscreenButton: false,
});

// 🌎 Iluminación y atmósfera
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.4;

// 🎥 Posición inicial
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(0.0, 0.0, 20000000.0),
});

// 🌍 Rotación automática
let autoRotate = true;
viewer.scene.postRender.addEventListener(() => {
  if (autoRotate) viewer.camera.rotateRight(0.0002);
});

// 🖱️ Detener rotación al interactuar
const stopRotation = () => (autoRotate = false);
viewer.screenSpaceEventHandler.setInputAction(stopRotation, Cesium.ScreenSpaceEventType.LEFT_DOWN);
viewer.screenSpaceEventHandler.setInputAction(stopRotation, Cesium.ScreenSpaceEventType.WHEEL);

// ========================
// Panel lateral
// ========================

const panel = document.getElementById("panel");
const burgerBtn = document.getElementById("burgerBtn");
burgerBtn.onclick = () => panel.classList.toggle("hidden");

// Mostrar coordenadas cuando se hace clic
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((event) => {
  const cartesian = viewer.scene.pickPosition(event.position);
  if (cartesian) {
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(2);
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(2);
    document.getElementById("coords").textContent = `${lat}, ${lon}`;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

console.log("✅ ChaacImpact 3D visualizador inicializado correctamente.");
