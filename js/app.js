// =====================================================================
//  «СІМ ЧУДЕС ХАРКОВА» — головний сценарій
// =====================================================================
(function () {
  'use strict';
  const T = THREE, W = window.WONDERS, S = window.SITE, Q = window.QUIZ, H = window.MODEL_HELPERS, MODELS = window.MODELS;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------
  //  Рендерер
  // ---------------------------------------------------------------
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  $('#stage').appendChild(renderer.domElement);

  const pmrem = new T.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;

  const camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 700);

  // ---------------------------------------------------------------
  //  Пост-обробка: світіння (bloom) + кінематографічна тонова корекція
  // ---------------------------------------------------------------
  let fx = true;
  const rt = new T.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: T.HalfFloatType });
  const composer = new T.EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(innerWidth, innerHeight);
  const renderPass = new T.RenderPass(new T.Scene(), camera);
  composer.addPass(renderPass);
  const bloom = new T.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.92);
  composer.addPass(bloom);
  const finalPass = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.05 }, vig: { value: 0.9 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure; uniform float vig; varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 aces(vec3 c){
        const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
      }
      void main(){
        vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
        vec2 d = vUv - 0.5; c *= mix(1.0, smoothstep(0.85, 0.2, length(d)), vig * 0.55);
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  composer.addPass(finalPass);

  function setFx(on) {
    fx = on;
    renderer.toneMapping = on ? T.NoToneMapping : T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = on;
    [mapScene, stageScene].forEach((s) => s.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
    }));
    $('#fxBtn').classList.toggle('off', !on);
  }

  // ---------------------------------------------------------------
  //  Анімації-твіни
  // ---------------------------------------------------------------
  let tweens = [];
  function tween(dur, fn, ease, tag) {
    return new Promise((res) => tweens.push({ t: 0, dur, fn, ease: ease || easeInOut, res, tag }));
  }
  function killTweens(tag) { tweens = tweens.filter((tw) => { if (tw.tag === tag) { tw.res(); return false; } return true; }); }
  function runTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease(k), k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  // ---------------------------------------------------------------
  //  Керування камерою (палець / миша / колесо)
  // ---------------------------------------------------------------
  class Orbit {
    constructor(cam, el) {
      Object.assign(this, { cam, el, target: new T.Vector3(), theta: 0, phi: 1, r: 20, vt: 0, vp: 0, minR: 5, maxR: 70, minPhi: 0.25, maxPhi: 1.45, enabled: false, auto: 0.06, last: -1e9, ptr: new Map(), pinch: 0 });
      el.addEventListener('pointerdown', (e) => {
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.last = performance.now();
        if (this.ptr.size === 2) this.pinch = this.pdist();
      });
      el.addEventListener('pointermove', (e) => {
        const p = this.ptr.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        this.last = performance.now();
        if (!this.enabled) return;
        if (this.ptr.size === 1) { this.vt = -dx * 0.0055; this.vp = -dy * 0.0042; }
        else if (this.ptr.size === 2) { const d = this.pdist(); if (this.pinch > 0) this.r = clamp(this.r * this.pinch / d, this.minR, this.maxR); this.pinch = d; }
      });
      const up = (e) => { this.ptr.delete(e.pointerId); this.pinch = this.ptr.size === 2 ? this.pdist() : 0; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', (e) => {
        e.preventDefault(); if (!this.enabled) return;
        this.r = clamp(this.r * (1 + e.deltaY * 0.001), this.minR, this.maxR); this.last = performance.now();
      }, { passive: false });
    }
    pdist() { const a = [...this.ptr.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; }
    sync() {
      const o = this.cam.position.clone().sub(this.target);
      this.r = o.length(); this.phi = Math.acos(clamp(o.y / this.r, -1, 1)); this.theta = Math.atan2(o.x, o.z); this.vt = this.vp = 0;
    }
    update(dt) {
      if (!this.enabled) return;
      if (performance.now() - this.last > 3500) this.theta += this.auto * dt;
      this.theta += this.vt; this.phi = clamp(this.phi + this.vp, this.minPhi, this.maxPhi);
      const k = Math.pow(0.02, dt); this.vt *= k; this.vp *= k;
      this.apply();
    }
    apply() {
      const sp = Math.sin(this.phi);
      this.cam.position.set(this.target.x + this.r * sp * Math.sin(this.theta), this.target.y + this.r * Math.cos(this.phi), this.target.z + this.r * sp * Math.cos(this.theta));
      this.cam.lookAt(this.target);
    }
  }
  const orbit = new Orbit(camera, renderer.domElement);

  function camFly(pos, target, dur, bump) {
    orbit.enabled = false; killTweens('cam');
    const p0 = camera.position.clone(), t0 = orbit.target.clone();
    return tween(dur, (e) => {
      camera.position.lerpVectors(p0, pos, e);
      if (bump) camera.position.y += Math.sin(Math.PI * e) * bump;
      orbit.target.lerpVectors(t0, target, e);
      camera.lookAt(orbit.target);
    }, easeInOut, 'cam').then(() => { orbit.sync(); });
  }

  // =================================================================
  //  СЦЕНА 1: КАРТА МІСТА
  // =================================================================
  const MAPC = new T.Vector3(1.5, 0, -6);
  const mapScene = new T.Scene();
  mapScene.background = new T.Color('#04060d');
  mapScene.fog = new T.FogExp2('#04060d', 0.011);
  mapScene.add(new T.HemisphereLight('#4a5d9a', '#05060a', 0.7));
  const moon = new T.DirectionalLight('#a9bcff', 0.55); moon.position.set(-20, 30, 10); mapScene.add(moon);

  const ground = new T.Mesh(new T.CircleGeometry(90, 96), new T.MeshStandardMaterial({ color: '#0a0e19', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; mapScene.add(ground);
  const grid = new T.GridHelper(180, 180, '#1a2440', '#101729');
  grid.material.transparent = true; grid.material.opacity = 0.3; grid.position.y = 0.01; mapScene.add(grid);

  const curve = (arr, y) => new T.CatmullRomCurve3(arr.map(([x, z]) => new T.Vector3(x, y || 0.05, z)));
  const rivers = [
    curve([[-17, -46], [-12, -28], [-8.5, -15], [-7.2, -4], [-6.6, 3], [-5.4, 9], [-2, 13.5], [1, 24], [5, 44]]),
    curve([[20, -46], [15, -28], [10, -13], [8, -2], [6, 5], [2, 11], [-1.8, 13.4]])
  ];
  const riverMat = new T.MeshStandardMaterial({ color: '#0b2a55', emissive: '#1f74e0', emissiveIntensity: 1.25, roughness: 0.3 });
  rivers.forEach((c) => { const m = new T.Mesh(new T.TubeGeometry(c, 260, 0.6, 8), riverMat); m.scale.y = 0.08; mapScene.add(m); });
  const riverSamples = rivers.flatMap((c) => c.getSpacedPoints(320));
  const near = (pts, x, z, d) => pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d);

  // дороги
  const roads = [
    { c: curve([[0.5, 11], [0.7, 5], [0.6, -1], [0.6, -6], [0.7, -12], [0.5, -19], [0.5, -27], [-0.5, -44]], 0.04), main: true }, // Сумська
    { c: curve([[1, 3], [5, -4], [8.5, -10], [12, -17], [16, -26], [20, -38]], 0.04) },  // Пушкінська
    { c: curve([[2, 8.5], [8, 8], [16, 6], [27, 3.5], [44, 1]], 0.04) },  // пр. Героїв Харкова
    { c: curve([[-4.5, 11], [-11, 12.5], [-21, 14.5], [-33, 17], [-46, 19]], 0.04) },  // Полтавський шлях
    { c: curve([[-6, -2], [-11, -10], [-16, -20], [-22, -32], [-27, -44]], 0.04) },  // Клочківська
    { c: curve([[0.5, 14], [-0.5, 21], [-1.5, 30], [-3, 46]], 0.04) }  // Гагаріна
  ];
  const roadSamples = roads.flatMap((r) => r.c.getSpacedPoints(200));
  roads.forEach((r) => {
    const m = new T.Mesh(new T.TubeGeometry(r.c, 200, r.main ? 0.12 : 0.07, 6),
      new T.MeshBasicMaterial({ color: r.main ? '#ffb347' : '#a46a2a' }));
    m.scale.y = 0.2; mapScene.add(m);
  });
  // «машини» — вогники, що рухаються дорогами
  const CARS = 260, carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3), carData = [];
  for (let i = 0; i < CARS; i++) {
    const r = Math.floor(Math.random() * roads.length);
    carData.push({ r, u: Math.random(), v: rnd(0.008, 0.02) * (Math.random() < 0.5 ? 1 : -1) });
    const c = new T.Color(carData[i].v > 0 ? '#fff0c8' : '#ff4a3a'); c.multiplyScalar(1.6);
    carCol.set([c.r, c.g, c.b], i * 3);
  }
  const carGeo = new T.BufferGeometry();
  carGeo.setAttribute('position', new T.BufferAttribute(carPos, 3));
  carGeo.setAttribute('color', new T.BufferAttribute(carCol, 3));
  mapScene.add(new T.Points(carGeo, new T.PointsMaterial({ size: 0.35, map: H.DOT, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
  const tmpV = new T.Vector3();

  // квартали
  (function buildCity() {
    const f = H.facade(4, 6, { wall: '#1a2030', dark: '#121722', lit: 0.38, pw: 16, ph: 18 });
    const mat = new T.MeshStandardMaterial({ map: f.map, emissiveMap: f.emi, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.9 });
    const geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const items = [];
    for (let gx = -46; gx <= 46; gx += 1.3) for (let gz = -50; gz <= 44; gz += 1.3) {
      const x = gx + rnd(-0.2, 0.2), z = gz + rnd(-0.2, 0.2);
      const d = Math.hypot(x - MAPC.x, z - MAPC.z);
      if (d > 46 || Math.random() > 1.05 - d / 50) continue;
      if (near(riverSamples, x, z, 1.15)) continue;
      if (near(roadSamples, x, z, 0.75)) continue;
      if (W.some((w) => Math.hypot(w.pos[0] - x, w.pos[1] - z) < 2.0)) continue;
      const hgt = rnd(0.25, 0.7) + Math.max(0, 1 - d / 22) * rnd(0, 2.6) + (Math.random() < 0.04 ? rnd(1, 3) : 0);
      items.push([x, z, rnd(0.55, 1.05), hgt, rnd(0.55, 1.05)]);
    }
    const im = new T.InstancedMesh(geo, mat, items.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), col = new T.Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rnd(-0.08, 0.08));
      m4.compose(new T.Vector3(it[0], 0, it[1]), q, new T.Vector3(it[2], it[3], it[4]));
      im.setMatrixAt(i, m4);
      col.setHSL(rnd(0.55, 0.65), 0.2, rnd(0.55, 1)); im.setColorAt(i, col);
    });
    mapScene.add(im);
  })();

  // зорі
  (function stars() {
    const N = 2500, p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = rnd(0, Math.PI * 2), ph = rnd(0.05, 1.35), r = rnd(250, 400);
      p.set([Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: '#cfd8ff', fog: false, transparent: true, opacity: 0.8 }));
    mapScene.add(pts);
    stageSceneStars = pts.clone();
  })();
  var stageSceneStars;

  // маркери чудес
  function beamMat() {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { c: { value: new T.Color('#ffd23f') }, o: { value: 1 } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 c; uniform float o; varying float vY; void main(){ gl_FragColor = vec4(c * 1.6, pow(1.0 - vY, 1.6) * 0.6 * o); }'
    });
  }
  function numSprite(n) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#111522'; x.font = '700 64px Unbounded, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 64, 70);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.1, 1.1, 1); s.renderOrder = 10; return s;
  }
  const markers = [];
  function buildMarkers() {
    W.forEach((w, i) => {
      const g = new T.Group(); g.position.set(w.pos[0], 0, w.pos[1]);
      const rm = new T.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false });
      const ring = new T.Mesh(new T.RingGeometry(0.6, 0.8, 48), rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
      const pulse = new T.Mesh(new T.RingGeometry(0.75, 0.85, 48), rm.clone()); pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.09;
      const beam = new T.Mesh(new T.CylinderGeometry(0.05, 0.55, 8, 24, 1, true), beamMat()); beam.position.y = 4;
      const gem = new T.Mesh(new T.OctahedronGeometry(0.42), new T.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb400', emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.3 }));
      gem.position.y = 1.3;
      const lift = w.labelLift || 0;
      const num = numSprite(i + 1); num.position.y = 2.7 + lift;
      const label = H.textSprite(w.title, { size: 54, h: 0.95, color: '#ffffff', glow: '#000000' });
      label.material.depthTest = false; label.renderOrder = 10; label.position.y = 3.75 + lift;
      const hit = new T.Mesh(new T.SphereGeometry(2.1, 8, 6), new T.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.8; hit.userData.idx = i;
      g.add(ring, pulse, beam, gem, num, hit); // назву не показуємо — сюрприз
      mapScene.add(g);
      markers.push({ g, ring, pulse, beam, gem, num, label, hit, lit: 1, ph: i * 0.7 });
    });
  }

  function updateMap(dt, t) {
    markers.forEach((m) => {
      const k = ((t + m.ph) % 1.8) / 1.8;
      m.pulse.scale.setScalar(1 + k * 2.6);
      m.pulse.material.opacity = (1 - k) * 0.8 * m.lit;
      m.ring.material.opacity = 0.95 * m.lit;
      m.beam.material.uniforms.o.value = m.lit;
      m.gem.rotation.y = t * 1.4; m.gem.position.y = 1.3 + Math.sin(t * 2 + m.ph) * 0.15;
      m.gem.scale.setScalar(0.3 + 0.7 * m.lit);
      m.num.material.opacity = 0.25 + 0.75 * m.lit;
      m.label.material.opacity = mode === 'final' ? 0 : 0.25 + 0.75 * m.lit;
    });
    for (let i = 0; i < CARS; i++) {
      const c = carData[i]; c.u = (c.u + c.v * dt + 1) % 1;
      roads[c.r].c.getPointAt(c.u, tmpV);
      carPos[i * 3] = tmpV.x; carPos[i * 3 + 1] = 0.15; carPos[i * 3 + 2] = tmpV.z;
    }
    carGeo.attributes.position.needsUpdate = true;
  }

  // =================================================================
  //  СЦЕНА 2: ПОДІУМ ДЛЯ 3D-МОДЕЛЕЙ
  // =================================================================
  const stageScene = new T.Scene();
  stageScene.background = new T.Color('#060811');
  stageScene.fog = new T.Fog('#060811', 45, 130);
  stageScene.environment = envTex;
  stageScene.add(new T.HemisphereLight('#8ea2ff', '#20140a', 0.22));
  const key = new T.DirectionalLight('#ffe0b5', 0.85); key.position.set(10, 18, 9);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  stageScene.add(key);
  const rim = new T.DirectionalLight('#4d74ff', 0.6); rim.position.set(-12, 8, -10); stageScene.add(rim);
  (function pedestal() {
    const g = new T.CylinderGeometry(8.2, 8.7, 0.8, 96); g.translate(0, -0.4, 0);
    const p = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#0e111a', metalness: 0.4, roughness: 0.5, envMapIntensity: 0.3 }));
    p.receiveShadow = true; stageScene.add(p);
    const r1 = new T.Mesh(new T.TorusGeometry(8.22, 0.05, 8, 180), new T.MeshBasicMaterial({ color: '#ffd23f' }));
    r1.rotation.x = Math.PI / 2; r1.position.y = 0.01; stageScene.add(r1);
    const r2 = new T.Mesh(new T.TorusGeometry(8.72, 0.045, 8, 180), new T.MeshBasicMaterial({ color: '#2f7fff' }));
    r2.rotation.x = Math.PI / 2; r2.position.y = -0.8; stageScene.add(r2);
    const fl = new T.Mesh(new T.CircleGeometry(160, 64), new T.MeshStandardMaterial({ color: '#05060b', roughness: 1, envMapIntensity: 0 }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = -0.81; stageScene.add(fl);
  })();
  const DUST = 500, dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustPos.set([rnd(-22, 22), rnd(0, 16), rnd(-22, 22)], i * 3);
  const dustGeo = new T.BufferGeometry(); dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
  stageScene.add(new T.Points(dustGeo, new T.PointsMaterial({ size: 0.09, map: H.DOT, color: '#ffd98a', transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending })));
  if (stageSceneStars) stageScene.add(stageSceneStars);

  let model = null, parts = [], stageT = 0, assembled = false, modelH = 6;

  function skipObj(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.noAssemble) return true; return false; }
  function bounds(root) {
    root.updateMatrixWorld(true);
    const b = new T.Box3(), tmp = new T.Box3();
    root.traverse((o) => {
      if (!o.isMesh || skipObj(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); b.union(tmp);
    });
    return b;
  }
  function dispose(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        ['map', 'emissiveMap'].forEach((k) => { if (m[k] && m[k] !== H.DOT) m[k].dispose(); });
        m.dispose();
      });
    });
  }

  function showModel(i) {
    if (model) { stageScene.remove(model); dispose(model); }
    const m = MODELS[W[i].model]();
    m.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => {
        if (mt.isMeshStandardMaterial && mt.envMapIntensity === 1) mt.envMapIntensity = 0.22;
      });
    });
    const b = bounds(m), size = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
    const s = Math.min((m.userData.fit || 12) / Math.max(size.x, size.z), 9.5 / size.y);
    m.scale.setScalar(s);
    m.position.set(-c.x * s, -b.min.y * s + 0.001, -c.z * s);
    modelH = size.y * s;
    stageScene.add(m);
    model = m; stageT = 0; assembled = false;
    parts = m.children.filter((o) => !o.isLight && !(o.userData && o.userData.noAssemble));
    parts.forEach((p) => { p.userData.p0 = p.position.clone(); p.userData.s0 = p.scale.clone(); p.scale.setScalar(0.0001); });
  }

  function updateStage(dt) {
    stageT += dt;
    if (model && !assembled) {
      const n = parts.length, spread = Math.min(2.2, 0.06 * n + 0.6), dur = 0.75;
      let done = true;
      parts.forEach((p, k) => {
        const e = clamp((stageT - 0.15 - (k / n) * spread) / dur, 0, 1);
        if (e < 1) done = false;
        p.position.y = p.userData.p0.y + (1 - easeOut(e)) * 6;
        p.scale.copy(p.userData.s0).multiplyScalar(Math.max(0.0001, e < 1 ? easeOutBack(e) : 1));
      });
      if (done) assembled = true;
    }
    if (model && model.userData.update) model.userData.update(stageT, dt);
    const cap = model && model.userData.caption;
    const capEl = $('#caption');
    if (cap) { if (capEl.textContent !== cap) capEl.textContent = cap; capEl.classList.remove('hidden'); }
    else capEl.classList.add('hidden');
    for (let i = 0; i < DUST; i++) { dustPos[i * 3 + 1] += dt * 0.35; if (dustPos[i * 3 + 1] > 16) dustPos[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function stageCamera() {
    killTweens('cam');
    orbit.enabled = false;
    Object.assign(orbit, { minR: 7, maxR: 36, minPhi: 0.3, maxPhi: 1.5, auto: 0.1 });
    orbit.target.set(0, modelH * 0.4, 0);
    const from = { r: 34, th: 1.3, ph: 0.75 }, to = { r: 19, th: 0.35, ph: 1.15 };
    return tween(2.6, (e) => {
      orbit.r = from.r + (to.r - from.r) * e; orbit.theta = from.th + (to.th - from.th) * e; orbit.phi = from.ph + (to.ph - from.ph) * e;
      orbit.apply();
    }, easeOut, 'cam').then(() => { orbit.vt = orbit.vp = 0; orbit.last = performance.now(); orbit.enabled = true; });
  }

  // =================================================================
  //  ІНТЕРФЕЙС І СЦЕНАРІЙ
  // =================================================================
  let scene = mapScene, mode = 'intro', cur = -1, busy = false;
  const seen = new Set();
  let viewShift = 0, viewTarget = 0;

  function setScene(s) { scene = s; renderPass.scene = s; }
  function show(el, on) { $(el).classList.toggle('hidden', !on); }
  function screen(el, on) { $(el).classList.toggle('show', on); }
  async function fade(on) { $('#fade').classList.toggle('on', on); await sleep(470); }

  function cardShift() {
    if (innerWidth <= 900) return 0;
    const c = $('#card'); return (c.offsetWidth + 40) / 2;
  }
  function applyView() {
    if (Math.abs(viewShift) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(innerWidth, innerHeight, viewShift, 0, innerWidth, innerHeight);
  }

  // точки прогресу
  W.forEach((w, i) => {
    const b = document.createElement('button'); b.textContent = i + 1; b.title = 'Чудо № ' + (i + 1);
    b.onclick = () => goWonder(i); $('#dots').appendChild(b);
  });
  function updateDots() {
    [...$('#dots').children].forEach((b, i) => { b.classList.toggle('active', mode === 'wonder' && i === cur); b.classList.toggle('seen', seen.has(i)); });
  }

  function fillCard(i) {
    const w = W[i];
    $('#cNum').textContent = String(i + 1).padStart(2, '0');
    $('#cTag').textContent = w.tag;
    $('#cTitle').textContent = w.title;
    $('#cTitle').classList.toggle('long', w.title.split(' ').some((word) => word.length > 12));
    $('#cLead').textContent = w.lead;
    const ul = $('#cFacts'); ul.innerHTML = '';
    w.facts.forEach((f, k) => {
      const li = document.createElement('li'); li.textContent = f; ul.appendChild(li);
      setTimeout(() => li.classList.add('in'), 650 + k * 200);
    });
    const q = $('#cQuote'); q.textContent = '«' + w.quote + '»';
    if (w.quoteAuthor) { const c = document.createElement('cite'); c.textContent = '— ' + w.quoteAuthor; q.appendChild(c); }
    const sp = S.speakers[w.speaker];
    $('#cSpeaker').innerHTML = 'Розповідає<b></b>'; $('#cSpeaker b').textContent = sp ? sp.name : '';
    $('#nextBtn').textContent = i === W.length - 1 ? 'До вікторини →' : 'Далі →';
  }

  // ---------------- детальні 3D-сцени (окремі сторінки в iframe) ----------------
  // Працюють лише через сервер (START.bat) або в інтернеті; з file:// — запасні моделі.
  const USE_SCENES = location.protocol !== 'file:';
  // Кожна сцена живе у власному iframe: повернення до чуда — миттєве, без перезавантаження.
  // Тримаємо не більше MAX_SCENES сцен (поточна + наступна, підвантажена заздалегідь на паузі),
  // щоб не перевантажувати відеопам'ять слабкого комп'ютера.
  const MAX_SCENES = 2;
  const pool = new Map(); // scene url → { el, ready, queue, used }
  let sceneOn = false, active = null;
  function sceneUrl(w, paused) {
    return `${w.scene}?embed&view=${w.sceneView || 'drone'}&shift=${Math.round(cardShift())}${paused ? '&paused' : ''}`;
  }
  function postTo(f, msg) { if (f.ready) f.el.contentWindow.postMessage(msg, '*'); else f.queue.push(msg); }
  function post(msg) { if (active) postTo(active, msg); }
  function evict(keep) {
    const extra = [...pool.values()].filter((f) => !keep.includes(f)).sort((a, b) => a.used - b.used);
    while (pool.size > MAX_SCENES && extra.length) {
      const f = extra.shift(); pool.delete(f.url);
      f.el.src = 'about:blank'; f.el.remove(); // звільняє WebGL-контекст
    }
  }
  function getScene(w, paused) {
    let f = pool.get(w.scene);
    if (f) { f.used = performance.now(); return { f, fresh: false }; }
    const el = document.createElement('iframe');
    el.className = 'scene3d'; el.title = '3D-сцена'; el.allow = 'fullscreen';
    f = { url: w.scene, el, ready: false, queue: [], used: performance.now() };
    el.addEventListener('load', () => { f.ready = true; f.queue.forEach((m) => el.contentWindow.postMessage(m, '*')); f.queue = []; });
    el.src = sceneUrl(w, paused);
    $('#scene3d').after(el);
    pool.set(w.scene, f);
    return { f, fresh: true };
  }
  // Фонова підвантажка ВИМКНЕНА: усі сцени працюють в одному потоці браузера, і побудова
  // нової сцени «у фоні» на 1–2 с заморожувала ту, що зараз на екрані (мікрофризи під час розповіді).
  // Тепер сцена вантажиться в момент переходу під власною заставкою; вже відкриті — лишаються в пам'яті.
  const PRELOAD = false;
  function preloadScene(w) {
    if (!PRELOAD || !USE_SCENES || !w || !w.scene || pool.has(w.scene)) return;
    const keep = active ? [active] : [];
    if (pool.size >= MAX_SCENES) { evict(keep); if (pool.size >= MAX_SCENES) return; }
    getScene(w, true);
  }
  function preloadScenes() { preloadScene(W.find((x) => x.scene)); }
  function nextSceneAfter(i) { for (let k = i + 1; k < W.length; k++) if (W[k].scene) return W[k]; return null; }
  function showScene(w, i) {
    const { f, fresh } = getScene(w, false);
    for (const o of pool.values()) if (o !== f && o.el.classList.contains('on')) { o.el.classList.remove('on'); postTo(o, { paused: true }); }
    if (!fresh) postTo(f, { view: w.sceneView || 'drone', shift: Math.round(cardShift()), paused: false });
    f.el.classList.add('on'); sceneOn = true; active = f;
    evict([f]);
    // підвантажуємо наступне чудо, поки розповідають про поточне
    setTimeout(() => { if (active === f) preloadScene(nextSceneAfter(i)); }, 4000);
  }
  function hideScene() {
    if (!sceneOn) return;
    active.el.classList.remove('on'); postTo(active, { paused: true }); sceneOn = false;
  }
  addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.key) onKey(d.key, null);
    if (d.type === 'wonder:pick' && mode === 'map' && !busy) goWonder(d.n - 1);
    if (d.type === 'map:ready' && mapReadyRes) mapReadyRes();
    if (d.type === 'final:boom' && finalBoomRes) finalBoomRes();
  });

  // ---------------- спільний звук для 3D-сцен ----------------
  // Сцени в iframe самі не отримують дотику користувача, тому браузер блокував би їхній звук.
  // Головна сторінка створює AudioContext після першого натискання і віддає його сценам.
  let sharedAC = null;
  window.__sharedAudio = () => {
    try {
      if (!sharedAC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; sharedAC = new C(); }
      if (sharedAC.state === 'suspended') sharedAC.resume().catch(() => {});
    } catch (_) { return null; }
    return sharedAC;
  };
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => window.__sharedAudio(), { capture: true }));

  // ---------------- нова 3D-мапа міста (scenes/map.html в iframe) ----------------
  const USE_MAP = USE_SCENES;
  const mapFrame = $('#map3d');
  let mapOn = false, mapLoaded = false, mapQueue = [], mapReadyRes = null, finalBoomRes = null;
  const mapReady = new Promise((r) => { mapReadyRes = r; });
  if (USE_MAP) document.body.classList.add('newmap');
  mapFrame.addEventListener('load', () => { mapLoaded = true; mapQueue.forEach((m) => mapFrame.contentWindow.postMessage(m, '*')); mapQueue = []; });
  function mapPost(msg) { if (mapLoaded) mapFrame.contentWindow.postMessage(msg, '*'); else mapQueue.push(msg); }
  function seenMsg() {
    const nxt = W.findIndex((_, i) => !seen.has(i));
    return { seen: [...seen].map((i) => i + 1), next: nxt < 0 ? 0 : nxt + 1 };
  }
  function showMap(msg) {
    if (!USE_MAP) return;
    mapFrame.classList.add('on'); mapOn = true;
    mapPost(Object.assign({ paused: false }, seenMsg(), msg || {}));
  }
  function hideMap() {
    if (!mapOn) return;
    mapFrame.classList.remove('on'); mapOn = false; mapPost({ paused: true });
  }

  function hideAllUi() { show('#card', false); show('#mapHint', false); show('#dragHint', false); show('#caption', false); }

  async function goWonder(i) {
    if (busy || i < 0 || i >= W.length) return;
    busy = true;
    hideAllUi(); screen('#quiz', false); screen('#final', false); show('#topbar', true);
    if (scene === mapScene && !sceneOn && !mapOn) {
      const p = markers[i].g.position;
      await camFly(p.clone().add(new T.Vector3(0, 4, 6)), p.clone().add(new T.Vector3(0, 1, 0)), 1.25, 2);
    }
    await fade(true);
    mode = 'wonder'; cur = i; seen.add(i); updateDots();
    fillCard(i);
    viewTarget = cardShift(); viewShift = viewTarget; applyView();
    hideMap();
    if (USE_SCENES && W[i].scene) {
      showScene(W[i], i);
    } else {
      hideScene();
      setScene(stageScene);
      showModel(i);
      stageCamera();
    }
    await fade(false);
    show('#card', true);
    show('#dragHint', true);
    clearTimeout(goWonder.hint); goWonder.hint = setTimeout(() => show('#dragHint', false), 5000);
    busy = false;
  }

  async function goMap(opts) {
    if (busy) return; busy = true;
    hideAllUi(); screen('#quiz', false); screen('#final', false); show('#topbar', true);
    const fromStage = scene !== mapScene || sceneOn;
    if (USE_MAP) {
      if (fromStage) await fade(true);
      hideScene(); setScene(mapScene);
      viewTarget = 0; viewShift = 0; applyView();
      mode = 'map'; updateDots();
      showMap({ mode: 'map', from: fromStage && cur >= 0 ? cur + 1 : 0 });
      if (fromStage) await fade(false);
      show('#mapHint', true);
      $('#firstBtn').textContent = seen.size === 0 ? 'Почати з першого →' : (seen.size >= W.length ? 'До вікторини →' : 'Продовжити →');
      busy = false;
      return;
    }
    if (fromStage) await fade(true);
    hideScene();
    setScene(mapScene);
    mode = 'map'; updateDots();
    viewTarget = 0; viewShift = 0; applyView();
    markers.forEach((m) => { m.lit = 1; });
    Object.assign(orbit, { minR: 12, maxR: 75, minPhi: 0.2, maxPhi: 1.25, auto: 0.04 });
    if (fromStage) {
      const p = markers[Math.max(0, cur)].g.position;
      orbit.target.copy(p); camera.position.copy(p).add(new T.Vector3(0, 4, 6)); camera.lookAt(p);
      await fade(false);
    }
    await camFly(MAPC.clone().add(new T.Vector3(0, 30, 26)), MAPC, (opts && opts.slow) ? 3.2 : 1.6);
    orbit.last = performance.now(); orbit.enabled = true;
    show('#mapHint', true);
    $('#firstBtn').textContent = seen.size === 0 ? 'Почати з першого →' : (seen.size >= W.length ? 'До вікторини →' : 'Продовжити →');
    busy = false;
  }

  function next() {
    if (mode === 'wonder') { if (cur < W.length - 1) goWonder(cur + 1); else goQuiz(); }
    else if (mode === 'map') firstAction();
    else if (mode === 'quiz' && !$('#qNext').disabled) $('#qNext').click();
  }
  function prev() { if (mode === 'wonder') { if (cur > 0) goWonder(cur - 1); else goMap(); } }
  function firstAction() {
    if (seen.size >= W.length) return goQuiz();
    const nxt = W.findIndex((_, i) => !seen.has(i));
    goWonder(nxt < 0 ? 0 : nxt);
  }

  // ---------------- вікторина ----------------
  let qi = 0, score = 0;
  async function goQuiz() {
    if (busy) return; busy = true;
    hideAllUi();
    if (scene !== mapScene || sceneOn || (USE_MAP && !mapOn)) {
      await fade(true);
      hideScene();
      setScene(mapScene); viewTarget = viewShift = 0; applyView();
      orbit.target.copy(MAPC); camera.position.copy(MAPC).add(new T.Vector3(0, 34, 30)); orbit.sync();
      showMap({ mode: 'quiz' });
      await fade(false);
    } else if (USE_MAP) mapPost({ mode: 'quiz' });
    Object.assign(orbit, { minR: 12, maxR: 75, minPhi: 0.2, maxPhi: 1.25, auto: 0.06 });
    orbit.enabled = true; orbit.last = -1e9;
    mode = 'quiz'; updateDots();
    qi = 0; score = 0; renderQ();
    screen('#quiz', true);
    busy = false;
  }
  function renderQ() {
    const q = Q[qi];
    $('#qCounter').textContent = `${qi + 1} / ${Q.length}`;
    $('#qText').textContent = q.q;
    $('#qScore').textContent = `Рахунок: ${score}`;
    const box = $('#qAnswers'); box.innerHTML = '';
    q.a.forEach((a, k) => {
      const b = document.createElement('button'); b.className = 'ans';
      b.innerHTML = `<span class="l">${'АБВГ'[k]}</span><span></span>`; b.lastChild.textContent = a;
      b.onclick = () => answer(k, b);
      box.appendChild(b);
    });
    $('#qNext').disabled = true;
    $('#qNext').textContent = qi === Q.length - 1 ? 'Фінал →' : 'Далі →';
  }
  function answer(k, btn) {
    const q = Q[qi], all = [...$('#qAnswers').children];
    all.forEach((b, j) => { b.disabled = true; if (j === q.correct) b.classList.add('ok'); else if (j !== k) b.classList.add('dim'); });
    if (k === q.correct) {
      score++;
      const r = btn.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, 90);
    } else btn.classList.add('bad');
    $('#qScore').textContent = `Рахунок: ${score}`;
    $('#qNext').disabled = false;
  }
  $('#qNext').onclick = () => { if (qi < Q.length - 1) { qi++; renderQ(); } else goFinal(); };

  // ---------------- фінал ----------------
  async function goFinal() {
    if (busy) return; busy = true;
    screen('#quiz', false); show('#topbar', false);
    mode = 'final'; updateDots();
    if (USE_MAP) showMap({ mode: 'final' });
    markers.forEach((m) => { m.lit = 0; });
    ['#f1', '#f2', '#fScore', '.final-bottom', '.final-actions'].forEach((s) => $(s).classList.remove('in'));
    $('#fScore').textContent = `Вікторина: ${score} з ${Q.length} правильних відповідей`;
    if (USE_MAP) {
      // нова мапа: спершу шоу — 7 променів від чудес сходяться в небі й вибухають;
      // фінальний екран — лише після вибуху (або за 16 с, якщо сигнал не прийшов)
      hideAllUi();
      await Promise.race([new Promise((r) => { finalBoomRes = r; }), sleep(16000)]);
      finalBoomRes = null;
      await sleep(1800);            // даємо роздивитися вибух, а вже тоді — фінальний екран
      screen('#final', true);
      await sleep(900);
    } else {
      screen('#final', true);
      await camFly(MAPC.clone().add(new T.Vector3(0, 46, 34)), MAPC.clone().add(new T.Vector3(0, 0, 2)), 2.4);
      orbit.enabled = true; orbit.auto = 0.05; orbit.last = -1e9;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        tween(0.6, (e) => { m.lit = e; }, easeOutBack);
        await sleep(380);
      }
      await sleep(300);
    }
    $('#f1').classList.add('in'); await sleep(700);
    $('#f2').classList.add('in'); await sleep(900);
    confetti(innerWidth / 2, innerHeight * 0.35, 260);
    $('#fScore').classList.add('in'); await sleep(500);
    $('.final-bottom').classList.add('in'); await sleep(800);
    $('.final-actions').classList.add('in');
    busy = false;
  }

  function buildFinal() {
    const n = $('#fNames');
    S.speakers.forEach((s) => {
      const d = document.createElement('div');
      d.innerHTML = '<div class="n"></div><div class="p"></div>';
      d.querySelector('.n').textContent = s.name; d.querySelector('.p').textContent = s.part;
      n.appendChild(d);
    });
    if (S.school) { const d = document.createElement('div'); d.className = 'school'; d.textContent = S.school; n.appendChild(d); }
    // QR лише на справжню адресу в інтернеті: localhost з телефона не відкриється
    const local = /^(localhost|127\.|192\.168\.|10\.|\[?::1)/.test(location.hostname);
    const url = S.url || (/^https?:/.test(location.protocol) && !local ? location.href.split(/[?#]/)[0] : '');
    if (url && window.qrcode) {
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      $('#fQr').innerHTML = qr.createImgTag(6, 0) + 'Відкрий на телефоні';
    }
  }

  // ---------------- конфеті ----------------
  const cv = $('#confetti'), cx = cv.getContext('2d');
  let conf = [];
  function sizeConf() { cv.width = innerWidth; cv.height = innerHeight; }
  sizeConf();
  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) conf.push({ x, y, vx: rnd(-11, 11), vy: rnd(-17, -4), s: rnd(7, 14), r: rnd(0, 6), vr: rnd(-0.3, 0.3), c: pick(['#ffd23f', '#2f7fff', '#ffffff', '#ffb000', '#5aa0ff']), life: 1 });
  }
  function drawConf() {
    if (!conf.length) return;
    cx.clearRect(0, 0, cv.width, cv.height);
    conf = conf.filter((p) => {
      p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.r += p.vr; p.life -= 0.006;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.max(0, p.life);
      cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore();
      return p.y < cv.height + 30 && p.life > 0;
    });
    if (!conf.length) cx.clearRect(0, 0, cv.width, cv.height);
  }

  // ---------------- натискання на маркер ----------------
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 12 || dt > 700 || mode !== 'map' || busy) return;
    const i = pickMarker(e.clientX, e.clientY);
    if (i >= 0) goWonder(i);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (mode !== 'map') { renderer.domElement.style.cursor = ''; return; }
    renderer.domElement.style.cursor = pickMarker(e.clientX, e.clientY) >= 0 ? 'pointer' : 'grab';
  });
  function pickMarker(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(markers.map((m) => m.hit), false);
    return hits.length ? hits[0].object.userData.idx : -1;
  }

  // ---------------- кнопки ----------------
  $('#startBtn').onclick = start;
  $('#firstBtn').onclick = firstAction;
  $('#nextBtn').onclick = next;
  $('#prevBtn').onclick = prev;
  $('#mapBtn').onclick = () => { if (mode !== 'intro' && mode !== 'map') goMap(); };
  $('#brandBtn').onclick = () => { if (mode !== 'intro' && mode !== 'map') goMap(); };
  $('#fxBtn').onclick = () => setFx(!fx);
  $('#fsBtn').onclick = toggleFs;
  $('#againBtn').onclick = () => location.reload();
  function toggleFs() {
    const d = document;
    if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => {})).call(d.documentElement);
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  }
  function onKey(key, e) {
    const stop = () => { if (e) e.preventDefault(); };
    if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') { stop(); if (mode === 'intro') start(); else next(); }
    else if (key === 'ArrowLeft' || key === 'PageUp') { stop(); prev(); }
    else if (key === 'Escape') { if (mode === 'wonder' || mode === 'quiz') goMap(); }
    else if (key === 'f' || key === 'F' || key === 'а' || key === 'А') toggleFs();
    else if (key >= '1' && key <= '7' && key.length === 1 && mode !== 'intro') goWonder(+key - 1);
  }
  addEventListener('keydown', (e) => onKey(e.key, e));

  async function start() {
    if (mode !== 'intro' || busy) return;
    screen('#intro', false);
    show('#topbar', true);
    mode = 'map-enter';
    perf.reset();
    preloadScenes();
    await goMapFromIntro();
  }
  async function goMapFromIntro() {
    busy = true;
    if (USE_MAP) {
      mode = 'map'; showMap({ mode: 'map' });
      await sleep(900);
      show('#mapHint', true);
      busy = false;
      return;
    }
    Object.assign(orbit, { minR: 12, maxR: 75, minPhi: 0.2, maxPhi: 1.25, auto: 0.04 });
    await camFly(MAPC.clone().add(new T.Vector3(-4, 30, 26)), MAPC, 2.8, 6);
    mode = 'map'; orbit.last = performance.now(); orbit.enabled = true;
    show('#mapHint', true);
    busy = false;
  }

  // ---------------- автоматична якість ----------------
  const perf = {
    frames: 0, time: 0, checked: false,
    reset() { this.frames = 0; this.time = 0; this.checked = false; },
    tick(dt) {
      if (this.checked || mode === 'intro' || DT_MAX === 1) return;
      this.frames++; this.time += dt;
      if (this.time > 3) {
        this.checked = true;
        const fps = this.frames / this.time;
        if (fps < 30 && fx) {
          setFx(false);
          pixelRatio = 1; renderer.setPixelRatio(1); onResize();
          console.info('Слабкий пристрій — ефекти вимкнено (FPS ≈ ' + fps.toFixed(0) + ')');
        }
      }
    }
  };

  function onResize() {
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth * pixelRatio, innerHeight * pixelRatio);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (mode === 'wonder') { viewTarget = viewShift = cardShift(); }
    applyView(); sizeConf();
  }
  addEventListener('resize', onResize);

  // ---------------- головний цикл ----------------
  let last = performance.now(), clock = 0;
  const DT_MAX = location.search.indexOf('debug') >= 0 ? 1 : 0.05;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(DT_MAX, (now - last) / 1000); last = now; clock += dt;
    runTweens(dt);
    orbit.update(dt);
    drawConf();
    if (sceneOn) return; // зараз показується детальна сцена — свою не малюємо
    if (mapOn && scene === mapScene) return; // показується нова 3D-мапа
    if (scene === mapScene) updateMap(dt, clock); else updateStage(dt);
    if (fx) composer.render(); else renderer.render(scene, camera);
    perf.tick(dt);
  }

  // ---------------- запуск ----------------
  async function init() {
    try {
      await Promise.race([
        Promise.all([document.fonts.load('700 56px Unbounded'), document.fonts.load('400 20px Montserrat'), document.fonts.load('600 20px Montserrat')]),
        sleep(2500)
      ]);
    } catch (_) { /* шрифти не критичні */ }
    // анімований заголовок
    ['#t1', '#t2'].forEach((sel, li) => {
      const el = $(sel), txt = el.textContent; el.textContent = '';
      [...txt].forEach((ch, k, arr) => {
        const s = document.createElement('span'); s.className = 'ch';
        if (li === 1) s.style.color = '#' + new T.Color('#4f9bff').lerp(new T.Color('#ffd23f'), k / Math.max(1, arr.length - 1)).getHexString();
        s.textContent = ch === ' ' ? ' ' : ch; s.style.animationDelay = (0.3 + li * 0.5 + k * 0.06) + 's';
        el.appendChild(s);
      });
    });
    $('#introSpeakers').innerHTML = S.speakers.map(() => '<span><b></b></span>').join('');
    [...$('#introSpeakers').children].forEach((el, i) => { el.firstChild.textContent = S.speakers[i].name; });
    buildMarkers();
    buildFinal();
    setFx(true);
    setScene(mapScene);
    orbit.target.copy(MAPC); orbit.r = 56; orbit.phi = 0.95; orbit.theta = 0.6; orbit.auto = 0.07; orbit.enabled = true; orbit.apply();
    requestAnimationFrame(loop);
    const h = location.hash.slice(1);
    if (USE_MAP) {
      mapFrame.src = 'scenes/map.html?embed&mode=' + (h === 'map' ? 'map' : 'intro');
      if (!/^w[1-7]$/.test(h)) { mapFrame.classList.add('on'); mapOn = true; } else mapPost({ paused: true });
      if (mapOn) await Promise.race([mapReady, sleep(12000)]);
    }
    setTimeout(() => $('#loader').classList.add('done'), 300);
    // швидкий перехід за адресою: #map, #w1…#w7, #quiz, #final
    if (h) {
      screen('#intro', false); show('#topbar', true); mode = 'map';
      if (USE_MAP && h === 'map') showMap({ mode: 'map' });
      if (!/^w[12]$/.test(h)) preloadScenes();
      orbit.r = 40; orbit.apply();
      if (/^w[1-7]$/.test(h)) goWonder(+h[1] - 1);
      else if (h === 'quiz') goQuiz();
      else if (h === 'final') goFinal();
      else { mode = 'map'; show('#mapHint', true); }
    }
  }
  init();
})();
