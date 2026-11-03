// The globe, inside its own page (globe.html). The app sends it a place, a token and the radar frames; it draws them and
// reports back. It never fetches anything the app did not name, and the app never lets it reach the bridge.
(function () {
  "use strict";
  var viewer = null;
  var layers = [];
  var home = null;
  var camDots = [];
  var warnShapes = [];
  var warnOn = true;
  var up = function (m) { parent.postMessage(m, "*"); };

  function fail(message) { up({ type: "error", message: String(message || "The globe stopped") }); }
  window.addEventListener("error", function (e) { fail(e.message); });
  window.addEventListener("unhandledrejection", function (e) { fail(e.reason && e.reason.message || e.reason); });

  function start(m) {
    if (!window.Cesium) { fail("The 3D globe library did not load"); return; }
    var C = window.Cesium;
    var hasToken = !!m.token;
    if (hasToken) C.Ion.defaultAccessToken = m.token;
    var opts = {
      animation: false, timeline: false, baseLayerPicker: false, homeButton: false, navigationHelpButton: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false, geocoder: hasToken, sceneModePicker: true, requestRenderMode: true, maximumRenderTimeChange: Infinity,
      baseLayer: hasToken
        ? C.ImageryLayer.fromWorldImagery()
        : new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", maximumLevel: 18, credit: "© OpenStreetMap contributors © CARTO" })),
    };
    if (hasToken) opts.terrain = C.Terrain.fromWorldTerrain();
    viewer = new C.Viewer("map", opts);
    viewer.entities.add({
      position: C.Cartesian3.fromDegrees(m.lon, m.lat),
      point: { pixelSize: 11, color: C.Color.fromCssColorString("#e8b86d"), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: String(m.place || ""), font: "600 14px sans-serif", fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    home = { destination: C.Cartesian3.fromDegrees(m.lon, m.lat, 1800000) };
    viewer.camera.setView(home);
    var radar = m.radar;
    if (radar && /^https:\/\/[a-z0-9.-]+$/i.test(radar.host || "")) {
      layers = (radar.frames || []).filter(function (f) { return /^\/[A-Za-z0-9\/_-]+$/.test(f.path || ""); }).map(function (f) {
        var layer = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({ url: radar.host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", maximumLevel: 7, credit: "Radar: RainViewer" }));
        layer.alpha = 0;
        return layer;
      });
    }
    var click = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    click.setInputAction(function (e) {
      var hit = viewer.scene.pick(e.position);
      var cam = hit && hit.id && hit.id.camera;
      if (cam) up({ type: "camera", id: cam.id, name: cam.name });
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    up({ type: "started", frames: layers.length });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var m = e.data || {};
    try {
      if (m.type === "init" && !viewer) start(m);
      else if (m.type === "frame" && viewer) {
        for (var i = 0; i < layers.length; i++) layers[i].alpha = m.on && i === m.index ? 0.7 : 0;
        viewer.scene.requestRender();
      } else if (m.type === "cameras" && viewer) {
        var C = window.Cesium;
        (m.cameras || []).forEach(function (c) {
          var dot = viewer.entities.add({ position: C.Cartesian3.fromDegrees(c.lon, c.lat), point: { pixelSize: 9, color: C.Color.fromCssColorString("#4ea3ff"), outlineColor: C.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
          dot.camera = { id: c.id, name: c.name };
          camDots.push(dot);
        });
        viewer.scene.requestRender();
      } else if (m.type === "warnings" && viewer) {
        var Cz = window.Cesium;
        warnShapes.forEach(function (e) { viewer.entities.remove(e); });
        warnShapes = (m.shapes || []).map(function (s) {
          var flat = [];
          s.ring.forEach(function (p) { flat.push(p[0], p[1]); });
          return viewer.entities.add({ show: warnOn, polygon: { hierarchy: Cz.Cartesian3.fromDegreesArray(flat), material: Cz.Color.RED.withAlpha(0.3), outline: false } });
        });
        viewer.scene.requestRender();
      } else if (m.type === "layer" && viewer) {
        if (m.name === "warnings") warnOn = !!m.on;
        (m.name === "cameras" ? camDots : warnShapes).forEach(function (e) { e.show = !!m.on; });
        viewer.scene.requestRender();
      } else if (m.type === "focus" && viewer) {
        viewer.camera.flyTo({ destination: window.Cesium.Cartesian3.fromDegrees(m.lon, m.lat, 70000), duration: 1.2 });
      } else if (m.type === "home" && viewer && home) viewer.camera.flyTo({ destination: home.destination, duration: 1.2 });
    } catch (err) { fail(err && err.message); }
  });
  up({ type: "ready" });
})();
