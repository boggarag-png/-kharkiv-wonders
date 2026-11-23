// =====================================================================
//  ПРОЦЕДУРНІ 3D-МОДЕЛІ СЕМИ ЧУДЕС
//  Кожна функція повертає THREE.Group. Діти групи — «деталі»,
//  які красиво злітаються під час появи моделі.
// =====================================================================
(function () {
  const T = THREE;
  T.ColorManagement.legacyMode = false; // правильні (насичені) кольори
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const WARM = ['#ffd27a', '#ffc46b', '#ffe3a3', '#ffb85c', '#fff1c9'];

  // ---------- базові помічники ----------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function ctex(c) { const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  function std(color, o) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.05 }, o || {})); }
  // «Світні» матеріали трохи яскравіші за 1.0 — щоб їх підхоплював ефект світіння
  function basic(color, o) { const m = new T.MeshBasicMaterial(Object.assign({ color }, o || {})); m.color.multiplyScalar(1.8); return m; }

  const GOLD = () => std('#e0ad45', { metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  const BRONZE = () => std('#7a5c38', { metalness: 0.75, roughness: 0.38, envMapIntensity: 1.1 });

  function shadow(m) { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; }

  // Коробка, основа якої стоїть на y = 0
  function box(w, h, d, mat) {
    const g = new T.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    return shadow(new T.Mesh(g, mat));
  }
  function cyl(rt, rb, h, mat, seg) {
    const g = new T.CylinderGeometry(rt, rb, h, seg || 24); g.translate(0, h / 2, 0);
    return shadow(new T.Mesh(g, mat));
  }
  function at(m, x, y, z) { m.position.set(x || 0, y || 0, z || 0); return m; }

  // Стрижень між двома точками
  const UP = new T.Vector3(0, 1, 0);
  function rod(a, b, r, mat, seg) {
    const len = a.distanceTo(b);
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    m.castShadow = true;
    return m;
  }
  const V = (x, y, z) => new T.Vector3(x, y, z);

  // Текстура фасаду з вікнами (map + emissiveMap)
  function facade(cols, rows, o) {
    o = Object.assign({ wall: '#cfc8b8', dark: '#28313d', lit: 0.45, pw: 18, ph: 22, ribbon: false, arch: false }, o);
    const pw = o.pw, ph = o.ph, W = cols * pw, H = rows * ph;
    const c1 = canvas(W, H), c2 = canvas(W, H);
    const a = c1.getContext('2d'), b = c2.getContext('2d');
    a.fillStyle = o.wall; a.fillRect(0, 0, W, H);
    b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
    if (o.stripes) {
      for (let y = 0, i = 0; y < H; y += o.stripes, i++) { a.fillStyle = i % 2 ? o.stripeB : o.stripeA; a.fillRect(0, y, W, o.stripes); }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = Math.random() < o.lit;
      const x = o.ribbon ? c * pw + 1.5 : c * pw + pw * 0.22;
      const w = o.ribbon ? pw - 3 : pw * 0.56;
      const y = r * ph + ph * 0.25, h = ph * 0.55;
      const col = lit ? pick(WARM) : o.dark;
      [[a, col], [b, lit ? col : '#000']].forEach(([ctx, cc]) => {
        ctx.fillStyle = cc;
        if (o.arch) {
          ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2);
          ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
        } else ctx.fillRect(x, y, w, h);
      });
    }
    return { map: ctex(c1), emi: ctex(c2) };
  }
  function facadeMat(f, o) {
    return new T.MeshStandardMaterial({ map: f.map, emissiveMap: f.emi, emissive: 0xffffff, emissiveIntensity: (o && o.ei) || 1.6, roughness: 0.85 });
  }

  // Будівля з вікнами на всіх чотирьох фасадах
  function building(w, h, d, o) {
    o = o || {};
    const floors = o.floors || Math.max(1, Math.round(h / 0.45));
    const cw = o.cw || 0.42;
    const front = facadeMat(facade(Math.max(1, Math.round(w / cw)), floors, o), o);
    const side = facadeMat(facade(Math.max(1, Math.round(d / cw)), floors, o), o);
    const roof = std(o.roof || '#6f6b64', { roughness: 0.95 });
    const g = new T.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    return shadow(new T.Mesh(g, [side, side, roof, roof, front, front]));
  }

  function tree(h, color) {
    const g = new T.Group();
    const trunk = cyl(0.05 * h, 0.08 * h, 0.45 * h, std('#4a3424'));
    const crown = new T.Mesh(new T.IcosahedronGeometry(0.38 * h, 0), std(color, { flatShading: true, roughness: 0.9 }));
    crown.position.y = 0.72 * h; crown.scale.y = 1.15; crown.rotation.y = Math.random() * 3;
    crown.castShadow = true;
    g.add(trunk, crown);
    return g;
  }
  const AUTUMN = ['#c9792b', '#e0a530', '#a8461f', '#3f6b2f', '#b9542a', '#d8b13a', '#55803a'];

  function lamp(h, color) {
    const g = new T.Group();
    g.add(cyl(0.03, 0.04, h, std('#2b2b2e', { metalness: 0.6, roughness: 0.4 })));
    const bulb = new T.Mesh(new T.SphereGeometry(0.11, 12, 8), basic(color || '#ffe0a0'));
    bulb.position.y = h + 0.05; g.add(bulb);
    return g;
  }

  // Людська фігура (висота ≈ 1 * s)
  function figure(s, mat, pose) {
    const g = new T.Group();
    const legs = new T.CylinderGeometry(0.045, 0.04, 0.45, 8);
    [-0.065, 0.065].forEach((x) => { const l = new T.Mesh(legs, mat); l.position.set(x, 0.225, 0); g.add(l); });
    const torso = new T.Mesh(new T.CylinderGeometry(0.13, 0.1, 0.38, 10), mat); torso.position.y = 0.63; g.add(torso);
    if (pose === 'coat') { const coat = new T.Mesh(new T.ConeGeometry(0.2, 0.55, 12, 1, true), mat); coat.position.y = 0.5; g.add(coat); }
    const head = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), mat); head.position.y = 0.92; g.add(head);
    const armG = new T.CylinderGeometry(0.03, 0.028, 0.36, 6); armG.translate(0, -0.18, 0);
    [-1, 1].forEach((side, i) => {
      const arm = new T.Mesh(armG, mat); arm.position.set(side * 0.15, 0.8, 0);
      if (pose === 'up' && i === 1) arm.rotation.z = side * 2.6;
      else if (pose === 'forward' && i === 1) arm.rotation.x = -1.3;
      else if (pose === 'both') arm.rotation.z = side * 2.3;
      else arm.rotation.z = side * 0.12;
      g.add(arm);
    });
    g.scale.setScalar(s);
    shadow(g);
    return g;
  }

  // Текстовий спрайт
  function textSprite(text, o) {
    o = Object.assign({ size: 64, color: '#fff3d1', font: 'Unbounded, Montserrat, sans-serif', weight: 700, glow: '#ffb347', h: 0.6 }, o);
    const c = canvas(10, 10), ctx = c.getContext('2d');
    ctx.font = `${o.weight} ${o.size}px ${o.font}`;
    const w = Math.ceil(ctx.measureText(text).width) + o.size;
    c.width = w; c.height = Math.ceil(o.size * 1.6);
    ctx.font = `${o.weight} ${o.size}px ${o.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = o.glow; ctx.shadowBlur = o.size * 0.35;
    ctx.fillStyle = o.color; ctx.fillText(text, w / 2, c.height / 2);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: ctex(c), transparent: true, depthWrite: false }));
    sp.scale.set(o.h * w / c.height, o.h, 1);
    return sp;
  }

  function dotTexture() {
    const c = canvas(64, 64), ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  const DOT = dotTexture();

  const M = {};

  // =================================================================
  // 1. ДЕРЖПРОМ
  // =================================================================
  M.derzhprom = function (opt) {
    opt = opt || {};
    const g = new T.Group();
    const FH = 0.45;
    const o = { wall: '#ddd6c6', dark: '#2d3a4a', lit: 0.42, ribbon: true, cw: 0.5, ei: 1.7, roof: '#8a857b' };
    if (!opt.noPlaza) g.add(at(box(30, 0.12, 10, std('#55575c', { roughness: 0.95 })), 0, 0, 3));

    // три блоки, кожен — набір веж різної висоти
    const parts = [[0, 0, 2.6, 13, 2.6], [-2.2, 0, 1.8, 11, 2.2], [2.2, 0, 1.8, 11, 2.2], [-3.7, 0.1, 1.2, 8, 2.0], [3.7, 0.1, 1.2, 8, 2.0], [0, -2.4, 2.2, 9, 2.2]];
    [[0, 0], [-10, 1.3], [10, 1.3]].forEach(([cx, cz], bi) => {
      parts.forEach((p) => {
        const fl = bi === 0 ? p[3] : p[3] - 1;
        g.add(at(building(p[2], fl * FH, p[4], Object.assign({ floors: fl }, o)), cx + p[0], 0, cz + p[1]));
      });
    });
    // повітряні переходи між блоками
    [-1, 1].forEach((s) => {
      [1.7, 2.7].forEach((y) => {
        const b = building(1.7, 0.5, 1.0, Object.assign({ floors: 1 }, o));
        b.rotation.y = s * -0.12;
        g.add(at(b, s * 5, y, 0.65));
      });
    });
    // телевежа на центральній вежі
    const tw = new T.Group();
    const steel = std('#9aa0a8', { metalness: 0.8, roughness: 0.35 });
    const top = V(0, 4.6, 0), base = 13 * FH;
    const legs = [V(0.75, 0, 0.75), V(-0.75, 0, 0.75), V(-0.75, 0, -0.75), V(0.75, 0, -0.75)];
    legs.forEach((l) => tw.add(rod(l, top, 0.035, steel)));
    [0.2, 0.42, 0.62, 0.8].forEach((f) => {
      const pts = legs.map((l) => l.clone().lerp(top, f));
      for (let i = 0; i < 4; i++) tw.add(rod(pts[i], pts[(i + 1) % 4], 0.02, steel));
    });
    const beacon = new T.Mesh(new T.SphereGeometry(0.12, 12, 8), basic('#ff3b30'));
    beacon.position.copy(top).add(V(0, 0.15, 0)); tw.add(beacon);
    tw.position.y = base;
    g.add(tw);

    g.userData.update = (t) => { beacon.material.color.setScalar(0); beacon.material.color.setRGB(Math.sin(t * 4) > 0 ? 1.6 : 0.25, 0.1, 0.08); };
    g.userData.fit = 13;
    return g;
  };

  // =================================================================
  // 2. ПІВДЕННИЙ ВОКЗАЛ (спрощена модель — коли сайт відкрито без сервера)
  // =================================================================
  M.vokzal = function () {
    const g = new T.Group();
    const so = { wall: '#e6d6b0', dark: '#2a2f38', lit: 0.55, arch: true, cw: 0.55, pw: 18, ph: 26, ei: 1.6, roof: '#56636b' };
    const white = std('#f5efe2', { roughness: 0.6 }), gold = GOLD();
    g.add(at(box(30, 0.12, 16, std('#55575c', { roughness: 0.95 })), 0, 0, -1));
    // центральний корпус з великою аркою
    g.add(building(6.4, 6.2, 4.6, Object.assign({ floors: 4 }, so)));
    const sh = new T.Shape(); sh.moveTo(-1.7, 0); sh.lineTo(-1.7, 3.0); sh.absarc(0, 3.0, 1.7, Math.PI, 0, true); sh.lineTo(1.7, 0); sh.closePath();
    const glass = new T.Mesh(new T.ShapeGeometry(sh, 24), std('#ffcf80', { emissive: '#ffb257', emissiveIntensity: 1.3 }));
    glass.position.set(0, 0.4, 2.32); g.add(glass);
    const arc = new T.Mesh(new T.TorusGeometry(1.85, 0.16, 8, 32, Math.PI), white); arc.position.set(0, 3.4, 2.36); g.add(arc);
    [-1, 1].forEach((s) => { g.add(at(box(0.32, 3.0, 0.32, white), s * 1.85, 0.4, 2.36)); [2.5, 3.0].forEach((x) => g.add(at(cyl(0.16, 0.18, 5.2, white, 14), s * x, 0, 2.55))); });
    g.add(at(box(7, 0.5, 5, white), 0, 5.2, 0.2)); g.add(at(box(6.8, 0.3, 4.8, white), 0, 6.2, 0));
    // вежа з годинником і шпилем
    g.add(at(building(3.6, 2.2, 3.6, Object.assign({ floors: 1 }, so)), 0, 6.5, 0));
    g.add(at(box(3.9, 0.25, 3.9, white), 0, 8.7, 0));
    const face = new T.Mesh(new T.CircleGeometry(0.75, 40), basic('#fff4d6')); face.position.set(0, 7.6, 1.82); g.add(face);
    const hand = (len, w) => { const m = new T.Mesh(new T.BoxGeometry(w, len, 0.04).translate(0, len / 2, 0), std('#1a1a1a')); m.position.set(0, 7.6, 1.86); g.add(m); return m; };
    const hh = hand(0.42, 0.07), mh = hand(0.62, 0.045);
    const oct = cyl(1.15, 1.3, 1.6, std('#e6d6b0'), 8); g.add(at(oct, 0, 8.95, 0));
    g.add(at(cyl(0.05, 0.45, 4.2, gold, 12), 0, 10.55, 0));
    const ball = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), gold); ball.position.y = 14.9; g.add(ball);
    // крила та торцеві павільйони
    [-1, 1].forEach((s) => {
      g.add(at(building(8, 4.2, 3.8, Object.assign({ floors: 3 }, so)), s * 7.2, 0, -0.2));
      g.add(at(box(8.2, 0.3, 4.0, white), s * 7.2, 4.2, -0.2));
      g.add(at(building(3.2, 5.4, 4.6, Object.assign({ floors: 4 }, so)), s * 12.6, 0, 0));
      g.add(at(box(3.4, 0.3, 4.8, white), s * 12.6, 5.4, 0));
      g.add(at(box(1.6, 1.2, 1.6, std('#e6d6b0')), s * 12.6, 5.7, 0));
      g.add(at(cyl(0.03, 0.35, 2.2, gold, 10), s * 12.6, 6.9, 0));
    });
    // площа: ліхтарі, дерева, таксі
    for (let x = -11; x <= 11; x += 2.75) { g.add(at(lamp(1.4), x, 0.1, 5.2)); if (Math.abs(x) > 2) g.add(at(tree(1.5, pick(AUTUMN)), x + 1.3, 0.1, 6.2)); }
    for (let i = 0; i < 5; i++) g.add(at(box(0.5, 0.4, 1.0, std('#f2c230', { roughness: 0.5 })), -6 + i * 3 + rnd(-0.4, 0.4), 0.1, 3.6));
    // перон і потяг позаду
    g.add(at(box(26, 0.3, 1.4, std('#6d6c69')), 0, 0, -3.6));
    g.add(at(box(26, 0.1, 1.8, std('#3b4248', { metalness: 0.4 })), 0, 2.2, -3.6));
    for (let x = -12; x <= 12; x += 3) g.add(at(cyl(0.06, 0.06, 2.2, std('#3b4248')), x, 0.3, -3.6));
    const train = new T.Group(), body = std('#1f4fa8', { roughness: 0.4, metalness: 0.3 }), stripe = std('#f2c230'), win = basic('#ffd890');
    for (let i = 0; i < 6; i++) {
      const x = i * 3.15;
      train.add(at(box(3.0, 1.1, 1.0, body), x, 0.25, 0), at(box(3.02, 0.12, 1.02, stripe), x, 0.55, 0), at(box(2.7, 0.3, 1.04, win), x, 0.85, 0));
    }
    train.position.set(-9, 0, -5.2); train.userData.noAssemble = true; g.add(train);
    g.add(at(box(28, 0.06, 1.3, std('#2e2b28')), 0, 0, -5.2));
    const l1 = new T.PointLight('#ffb35c', 2.4, 14); l1.position.set(0, 2, 6); g.add(l1);
    g.userData.update = (t) => {
      const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
      mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2;
      train.position.x = -9 + Math.sin(t * 0.25) * 2.5;
    };
    g.userData.fit = 13;
    return g;
  };

  // =================================================================
  // (стара модель Площі Свободи — більше не використовується)
  // =================================================================
  M.svobody = function () {
    const g = new T.Group();
    const pave = std('#8d8a83', { roughness: 0.95 });
    g.add(at(box(8, 0.12, 13, pave), 0, 0, 4.5));
    const circ = cyl(6.5, 6.5, 0.12, pave, 72); g.add(at(circ, 0, 0, -5));
    // візерунок бруківки
    const lineMat = std('#b9b4aa');
    for (let i = 0; i < 6; i++) g.add(at(box(8, 0.13, 0.08, lineMat), 0, 0, -1 + i * 2.2));
    const ring = new T.Mesh(new T.RingGeometry(3.2, 3.35, 64), lineMat); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.135, -5); g.add(ring);
    // газони та дерева
    const lawn = std('#2f5530', { roughness: 1 });
    [-1, 1].forEach((s) => {
      g.add(at(box(1.3, 0.18, 11, lawn), s * 4.8, 0, 4.5));
      for (let z = -0.5; z <= 9.5; z += 1.4) g.add(at(tree(1.4, pick(AUTUMN)), s * 4.8, 0.1, z));
      for (let z = 0; z <= 10; z += 2.5) g.add(at(lamp(1.3), s * 3.6, 0.1, z));
    });
    const lawnRing = new T.Mesh(new T.RingGeometry(5.2, 6.3, 64, 1, 0.5, Math.PI * 2 - 1.0), lawn);
    lawnRing.rotation.x = -Math.PI / 2; lawnRing.rotation.z = Math.PI / 2 + 0.5; lawnRing.position.set(0, 0.14, -5); g.add(lawnRing);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.sin(a / 2)) < 0.3) continue;
      g.add(at(tree(1.3, pick(AUTUMN)), Math.sin(a) * 5.8, 0.1, -5 + Math.cos(a) * 5.8));
    }
    // новорічна ялинка
    const yal = new T.Group();
    const fir = std('#1f5a33', { flatShading: true, roughness: 0.9 });
    [[1.6, 1.8, 0.4], [1.25, 1.6, 1.4], [0.85, 1.4, 2.3]].forEach(([r, h, y]) => { const c = new T.Mesh(new T.ConeGeometry(r, h, 10), fir); c.position.y = y + h / 2; c.castShadow = true; yal.add(c); });
    yal.add(cyl(0.12, 0.15, 0.4, std('#4a3424')));
    const bulbs = [];
    const cols = ['#ffd23f', '#3fa9ff', '#ff4d6d', '#ffffff', '#7CFF6B'];
    for (let i = 0; i < 90; i++) {
      const y = rnd(0.5, 3.6), r = 1.65 * (1 - (y - 0.3) / 3.6) + 0.05, a = rnd(0, Math.PI * 2);
      const b = new T.Mesh(new T.SphereGeometry(0.05, 6, 4), basic(pick(cols)));
      b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); b.userData.ph = rnd(0, 6); yal.add(b); bulbs.push(b);
    }
    const star = new T.Mesh(new T.OctahedronGeometry(0.25), basic('#ffe066')); star.position.y = 3.95; yal.add(star);
    g.add(at(yal, 0, 0.1, -5));
    // Держпром у кінці площі
    const dp = M.derzhprom({ noPlaza: true }); dp.scale.setScalar(0.5);
    g.add(at(dp, 0, 0, -14));
    // люди на площі
    for (let i = 0; i < 60; i++) {
      const p = figure(0.32, std(pick(['#2b4c7e', '#a33b3b', '#e0c341', '#3a3a3a', '#6b8f71', '#d8d2c4'])), 'down');
      const inCircle = Math.random() < 0.5;
      if (inCircle) { const a = rnd(0, 6.28), r = rnd(2.2, 4.8); p.position.set(Math.cos(a) * r, 0.12, -5 + Math.sin(a) * r); }
      else p.position.set(rnd(-3, 3), 0.12, rnd(1, 10.5));
      p.rotation.y = rnd(0, 6.28); g.add(p);
    }
    // сніг
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-12, 12); pos[i * 3 + 1] = rnd(0, 14); pos[i * 3 + 2] = rnd(-16, 12); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const snow = new T.Points(sg, new T.PointsMaterial({ size: 0.12, map: DOT, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.9 }));
    snow.userData.noAssemble = true; g.add(snow);

    g.userData.update = (t, dt) => {
      bulbs.forEach((b) => { const k = 0.4 + 0.8 * (0.5 + 0.5 * Math.sin(t * 3 + b.userData.ph)); b.scale.setScalar(k); });
      star.rotation.y = t;
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] -= dt * 1.2; pos[i * 3] += Math.sin(t + i) * dt * 0.2;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 14;
      }
      sg.attributes.position.needsUpdate = true;
    };
    g.userData.fit = 15;
    return g;
  };

  // =================================================================
  // 3. БЛАГОВІЩЕНСЬКИЙ СОБОР
  // =================================================================
  M.sobor = function () {
    const g = new T.Group();
    const so = { wall: '#efe3d0', stripes: 7, stripeA: '#b5432f', stripeB: '#efe3d0', dark: '#2b2622', lit: 0.4, arch: true, cw: 0.6, pw: 18, ph: 34, ei: 1.5, roof: '#3d5a4c' };
    const sMat = (cols, rows) => facadeMat(facade(cols, rows, so), so);
    const gold = GOLD();
    const roofM = std('#3d5a4c', { roughness: 0.6, metalness: 0.3 });
    g.add(at(box(17, 0.12, 19, std('#4f4c47', { roughness: 0.95 })), 0, 0, 1.5));

    function cross(y, s) {
      const c = new T.Group();
      c.add(at(box(0.06 * s, 0.6 * s, 0.06 * s, gold), 0, 0, 0));
      c.add(at(box(0.32 * s, 0.06 * s, 0.06 * s, gold), 0, 0.38 * s, 0));
      c.position.y = y; return c;
    }
    function drum(r, h, y, cols) {
      const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 24), [sMat(cols, 2), roofM, roofM]);
      m.geometry.translate(0, h / 2, 0); m.position.y = y; return shadow(m);
    }
    function dome(r, y, scaleY) {
      const m = new T.Mesh(new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold);
      m.position.y = y; m.scale.y = scaleY || 1; m.castShadow = true; return m;
    }

    // основний об’єм у формі хреста
    g.add(building(5, 3.6, 5, Object.assign({ floors: 3 }, so)));
    g.add(at(building(1.4, 3.1, 2.8, Object.assign({ floors: 3 }, so)), 3.2, 0, 0));
    g.add(at(building(1.4, 3.1, 2.8, Object.assign({ floors: 3 }, so)), -3.2, 0, 0));
    const apse = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 3.0, 24, 1, false, 0, Math.PI), [sMat(6, 3), roofM, roofM]);
    apse.geometry.translate(0, 1.5, 0); apse.rotation.y = Math.PI / 2; apse.position.set(0, 0, -2.5); g.add(shadow(apse));
    // центральний барабан і купол
    const central = new T.Group();
    central.add(drum(1.25, 1.8, 3.6, 12));
    central.add(dome(1.32, 5.4, 0.95));
    central.add(at(cyl(0.22, 0.22, 0.55, gold), 0, 6.6, 0));
    central.add(dome(0.33, 7.1, 1.3));
    central.add(cross(7.5, 1.1));
    g.add(central);
    // чотири малі куполи
    [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]].forEach(([x, z]) => {
      const sm = new T.Group();
      sm.add(drum(0.5, 0.9, 3.6, 6)); sm.add(dome(0.55, 4.5, 1.2)); sm.add(cross(5.1, 0.7));
      sm.position.set(x, 0, z); g.add(sm);
    });
    // притвор
    g.add(at(building(2.4, 3.0, 1.8, Object.assign({ floors: 3 }, so)), 0, 0, 3.4));
    // дзвіниця
    const bell = new T.Group();
    bell.add(building(2.5, 4.4, 2.5, Object.assign({ floors: 4 }, so)));
    bell.add(at(building(2.0, 2.6, 2.0, Object.assign({ floors: 2 }, so)), 0, 4.4, 0));
    const oct = new T.Mesh(new T.CylinderGeometry(0.95, 1.0, 2.0, 8), [sMat(8, 2), roofM, roofM]);
    oct.geometry.translate(0, 1, 0); oct.position.y = 7.0; bell.add(shadow(oct));
    bell.add(dome(0.98, 9.0, 0.9));
    bell.add(at(cyl(0.2, 0.25, 0.9, gold), 0, 9.8, 0));
    bell.add(dome(0.34, 10.75, 1.35));
    bell.add(cross(11.15, 1.1));
    bell.position.set(0, 0, 5.4);
    g.add(bell);
    // підсвітка
    const l1 = new T.PointLight('#ffb35c', 2.2, 12); l1.position.set(4, 1, 7); g.add(l1);
    const l2 = new T.PointLight('#ffb35c', 1.6, 12); l2.position.set(-4, 1, 4); g.add(l2);
    for (let i = 0; i < 10; i++) g.add(at(tree(1.3, pick(AUTUMN)), rnd(-8, 8) || 6, 0.1, pick([-7, -8, 9, 10])));
    g.userData.fit = 11;
    return g;
  };

  // =================================================================
  // 4. ДЗЕРКАЛЬНИЙ СТРУМІНЬ
  // =================================================================
  M.strumin = function () {
    const g = new T.Group();
    const white = std('#f3efe6', { roughness: 0.55 });
    const granite = std('#7a756e', { roughness: 0.9 });
    g.add(cyl(10, 10, 0.12, std('#4d4a45', { roughness: 0.95 }), 64));
    // басейн
    const pz = 5.2;
    const pool = new T.Group();
    pool.add(cyl(4.5, 4.5, 0.55, granite, 64));
    const water = new T.Mesh(new T.CircleGeometry(4.15, 64), std('#0c2c44', { metalness: 0.95, roughness: 0.04, envMapIntensity: 1.2 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.56; pool.add(water);
    pool.position.z = pz; g.add(pool);
    const pl = new T.PointLight('#62c8ff', 3, 9); pl.position.set(0, 1, pz); g.add(pl);
    // пагорб зі сходами
    g.add(at(cyl(3.4, 3.7, 0.7, granite, 48), 0, 0, -3.6));
    g.add(at(cyl(2.8, 3.1, 0.7, granite, 48), 0, 0.7, -3.6));
    for (let i = 0; i < 5; i++) g.add(at(box(2.4, 0.28, 0.5, granite), 0, i * 0.28, 0.25 - i * 0.33));
    // ротонда
    const rot = new T.Group();
    rot.add(cyl(2.3, 2.4, 0.3, white, 48));
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const col = cyl(0.13, 0.15, 2.5, white, 12); col.position.set(Math.cos(a) * 1.85, 0.3, Math.sin(a) * 1.85); rot.add(col);
      const cap = box(0.38, 0.14, 0.38, white); cap.position.set(Math.cos(a) * 1.85, 2.8, Math.sin(a) * 1.85); cap.rotation.y = -a; rot.add(cap);
    }
    rot.add(at(cyl(2.25, 2.2, 0.42, white, 48), 0, 2.92, 0));
    const roof = new T.Mesh(new T.SphereGeometry(2.1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
    roof.scale.y = 0.35; roof.position.y = 3.34; roof.castShadow = true; rot.add(roof);
    rot.add(at(cyl(0.12, 0.2, 0.5, white, 12), 0, 4.0, 0));
    const inner = new T.PointLight('#ffe8c0', 0.7, 5); inner.position.y = 1.8; rot.add(inner);
    rot.position.set(0, 1.4, -3.6); g.add(rot);
    // дерева й ліхтарі
    for (let i = 0; i < 18; i++) { const a = rnd(Math.PI * 0.75, Math.PI * 2.25); g.add(at(tree(rnd(1.5, 2.2), pick(AUTUMN)), Math.cos(a) * rnd(6.5, 9), 0.1, -3 + Math.sin(a) * rnd(5, 7))); }
    [-1, 1].forEach((s) => { for (let k = 0; k < 3; k++) g.add(at(lamp(1.4), s * 5.6, 0.1, 0.5 + k * 2.4)); });
    // струмінь води (частинки)
    const P = 900, pos = new Float32Array(P * 3), vel = new Float32Array(P * 3);
    const spawn = (i) => {
      pos[i * 3] = rnd(-0.05, 0.05); pos[i * 3 + 1] = 0.6; pos[i * 3 + 2] = pz + rnd(-0.05, 0.05);
      vel[i * 3] = rnd(-0.35, 0.35); vel[i * 3 + 1] = rnd(6.2, 7.4); vel[i * 3 + 2] = rnd(-0.35, 0.35);
    };
    for (let i = 0; i < P; i++) { spawn(i); const k = Math.random() * 1.4; pos[i * 3] += vel[i * 3] * k; pos[i * 3 + 1] += vel[i * 3 + 1] * k - 4.9 * k * k; pos[i * 3 + 2] += vel[i * 3 + 2] * k; vel[i * 3 + 1] -= 9.8 * k; if (pos[i * 3 + 1] < 0.6) spawn(i); }
    const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const jet = new T.Points(wg, new T.PointsMaterial({ size: 0.16, map: DOT, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: '#bfe6ff', opacity: 0.85 }));
    jet.userData.noAssemble = true; g.add(jet);
    g.userData.update = (t, dt) => {
      dt = Math.min(dt, 0.05);
      for (let i = 0; i < P; i++) {
        vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.58 && vel[i * 3 + 1] < 0) spawn(i);
      }
      wg.attributes.position.needsUpdate = true;
      water.rotation.z = t * 0.05;
    };
    g.userData.fit = 13;
    return g;
  };

  // =================================================================
  // 5. САД ШЕВЧЕНКА І ПАМ’ЯТНИК КОБЗАРЕВІ
  // =================================================================
  M.shevchenko = function () {
    const g = new T.Group();
    g.add(cyl(9.5, 9.5, 0.12, std('#2c4a29', { roughness: 1 }), 64));
    const path = std('#a39b8b', { roughness: 0.95 });
    const ring = new T.Mesh(new T.RingGeometry(5.3, 6.1, 64), path); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.13; g.add(ring);
    g.add(at(box(1.1, 0.13, 19, path), 0, 0, 0));
    g.add(at(box(19, 0.13, 1.1, path), 0, 0, 0));
    g.add(cyl(3.2, 3.2, 0.16, path, 48));
    // дерева
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rnd(-0.05, 0.05);
      if (Math.abs(Math.sin(a)) < 0.12 || Math.abs(Math.cos(a)) < 0.12) continue;
      const r = rnd(6.8, 9);
      g.add(at(tree(rnd(1.6, 2.4), pick(AUTUMN)), Math.cos(a) * r, 0.1, Math.sin(a) * r));
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.add(at(lamp(1.4), Math.cos(a) * 4.2, 0.1, Math.sin(a) * 4.2)); }
    // квіти
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, 6.28), r = rnd(2.1, 2.9);
      const f = new T.Mesh(new T.SphereGeometry(0.08, 6, 4), std(pick(['#d6283b', '#ffcf33', '#ff7a1a', '#f2f2f2'])));
      f.position.set(Math.cos(a) * r, 0.22, Math.sin(a) * r); g.add(f);
    }
    // пам’ятник
    const granite = std('#3a3838', { roughness: 0.7, metalness: 0.1 });
    const bronze = BRONZE();
    const mon = new T.Group();
    mon.add(box(3.0, 0.5, 3.0, granite));
    mon.add(at(cyl(0.6, 0.75, 4.4, granite, 24), 0, 0.5, 0));
    mon.add(at(box(1.0, 0.25, 1.0, granite), 0, 4.9, 0));
    g.add(mon);
    const poses = ['down', 'forward', 'down', 'coat', 'forward', 'down', 'forward', 'coat', 'up', 'down', 'forward', 'up', 'both', 'up', 'both', 'up'];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 * 1.25 + 0.8;
      const y = 0.55 + i * 0.25;
      const x = Math.sin(a) * 1.05, z = Math.cos(a) * 1.05;
      const step = box(0.9, 0.16, 0.75, granite); step.position.set(x * 0.95, y - 0.16, z * 0.95); step.rotation.y = a; g.add(step);
      const f = figure(0.78, bronze, poses[i]); f.position.set(x * 1.05, y, z * 1.05); f.rotation.y = a; g.add(f);
    }
    const kobzar = figure(1.35, bronze, 'coat'); kobzar.position.y = 5.15; kobzar.rotation.y = 0.2;
    kobzar.children[kobzar.children.length - 3].rotation.x = 0.25; // голова трохи схилена
    g.add(kobzar);
    const spot = new T.SpotLight('#ffd9a0', 4, 16, 0.5, 0.5); spot.position.set(3, 9, 6); spot.target = kobzar; g.add(spot);
    g.userData.fit = 12;
    return g;
  };

  // =================================================================
  // 6. БУДИНОК «СЛОВО»
  // =================================================================
  M.slovo = function () {
    const g = new T.Group();
    g.add(at(box(14, 0.12, 14, std('#45443f', { roughness: 0.95 })), 0, 0, 0));
    const FH = 0.55, floors = 5, H = FH * floors, R = 4.3, D = 1.9;
    const opening = 0.75, segs = 12;
    const step = (Math.PI * 2 - opening * 2) / segs;
    const wo = { wall: '#b9b0a0', dark: '#1d232c', lit: 0, cw: 0.42, ph: 22, pw: 18, roof: '#5c574f' };
    const litMat = basic('#ffcf7a');
    const allWins = [];
    for (let s = 0; s < segs; s++) {
      const ac = opening + step * (s + 0.5);
      const w = 2 * (R + D / 2) * Math.sin(step / 2) + 0.06;
      const cols = Math.max(1, Math.round(w / wo.cw));
      const seg = building(w, H, D, Object.assign({ floors }, wo));
      seg.position.set(Math.sin(ac) * R, 0, Math.cos(ac) * R);
      seg.rotation.y = ac;
      // вікна-«квартири» на зовнішньому фасаді
      for (let r = 0; r < floors; r++) for (let c = 0; c < cols; c++) {
        const x = -w / 2 + (c + 0.5) * (w / cols);
        const y = H - (r + 0.525) * FH;
        allWins.push({ seg, x, y, w: 0.56 * (w / cols), h: 0.55 * FH });
      }
      g.add(seg);
    }
    // 66 освітлених квартир
    allWins.sort(() => Math.random() - 0.5);
    const wins = allWins.slice(0, 66).map((p) => {
      const m = new T.Mesh(new T.PlaneGeometry(p.w, p.h), litMat);
      // вікна дивляться у двір — саме його видно з камери
      m.position.set(-p.x, p.y, -D / 2 - 0.012); m.rotation.y = Math.PI; p.seg.add(m);
      return m;
    });
    const doomed = wins.slice().sort(() => Math.random() - 0.5).slice(0, 40);
    const darkMat = basic('#1a1f27');
    // дерева у дворі
    for (let i = 0; i < 6; i++) g.add(at(tree(rnd(1.4, 2), pick(AUTUMN)), rnd(-1.8, 1.8), 0.1, rnd(-1.5, 2)));
    for (let i = 0; i < 4; i++) g.add(at(lamp(1.3), -2 + i * 1.3, 0.1, 6.2));
    // імена письменників, що кружляють
    const names = ['Микола Хвильовий', 'Павло Тичина', 'Остап Вишня', 'Лесь Курбас', 'Микола Куліш', 'Микола Бажан', 'Майк Йогансен', 'Михайль Семенко', 'Юрій Яновський'];
    const halo = new T.Group();
    names.forEach((n, i) => {
      const sp = textSprite(n, { size: 56, h: 0.55, color: '#fff1d0', glow: '#ffae42' });
      const a = (i / names.length) * Math.PI * 2;
      sp.position.set(Math.sin(a) * 6.2, 4.4 + (i % 2) * 0.55, Math.cos(a) * 6.2);
      halo.add(sp);
    });
    halo.userData.noAssemble = true; g.add(halo);
    const title = textSprite('СЛОВО', { size: 120, h: 1.1, color: '#ffe7b0', glow: '#ff9d2e' });
    title.position.set(0, 6.6, 0); title.userData.noAssemble = true; g.add(title);

    const START = 3.2, EVERY = 0.22;
    g.userData.caption = '';
    g.userData.update = (t) => {
      halo.rotation.y = t * 0.12;
      let off = 0;
      doomed.forEach((m, i) => {
        const tt = t - START - i * EVERY;
        if (tt < 0) { m.material = litMat; return; }
        if (tt < 0.35) { m.material = Math.floor(tt * 20) % 2 ? darkMat : litMat; return; }
        m.material = darkMat; off++;
      });
      g.userData.caption = t < START ? '' :
        (off < 40 ? `Згасло вікон: ${off}` : 'Із 66 квартир мешканців 40 були репресовані');
    };
    g.userData.fit = 12;
    return g;
  };

  // =================================================================
  // 7. ПАРК ГОРЬКОГО
  // =================================================================
  M.gorky = function () {
    const g = new T.Group();
    g.add(cyl(11, 11, 0.12, std('#2a4427', { roughness: 1 }), 64));
    const path = std('#a8a091', { roughness: 0.95 });
    g.add(at(box(1.6, 0.13, 10, path), 0, 0, 5.5));
    const pr = new T.Mesh(new T.RingGeometry(1.8, 2.7, 48), path); pr.rotation.x = -Math.PI / 2; pr.position.set(0, 0.13, 1); g.add(pr);
    const white = std('#f1ede4', { roughness: 0.5 });
    const steel = std('#cfd5dc', { metalness: 0.8, roughness: 0.3 });

    // вхідна арка
    const arch = new T.Group();
    arch.add(at(box(0.6, 2.6, 0.6, white), -1.8, 0, 0)); arch.add(at(box(0.6, 2.6, 0.6, white), 1.8, 0, 0));
    const ar = new T.Mesh(new T.TorusGeometry(1.8, 0.2, 10, 32, Math.PI), white); ar.position.y = 2.6; arch.add(shadow(ar));
    const sign = textSprite('ПАРК', { size: 90, h: 0.55, color: '#fff4c4', glow: '#ffcc33' }); sign.position.set(0, 3.0, 0.1); arch.add(sign);
    g.add(at(arch, 0, 0, 10));

    // колесо огляду
    const fw = new T.Group();
    const R = 3.5, HUB = 4.4;
    [-1, 1].forEach((s) => {
      fw.add(rod(V(-1.7, 0, s * 0.9), V(0, HUB, s * 0.36), 0.07, steel));
      fw.add(rod(V(1.7, 0, s * 0.9), V(0, HUB, s * 0.36), 0.07, steel));
    });
    const wheel = new T.Group(); wheel.position.y = HUB;
    [-0.32, 0.32].forEach((z) => { const t = new T.Mesh(new T.TorusGeometry(R, 0.05, 6, 80), steel); t.position.z = z; wheel.add(t); });
    wheel.add(new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.8, 16).rotateX(Math.PI / 2), steel));
    const NC = 16, cabins = [];
    const lightCols = ['#ffd23f', '#3fa9ff', '#ff4d9a', '#ffffff'];
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * Math.PI * 2;
      [-0.32, 0.32].forEach((z) => wheel.add(rod(V(0, 0, z), V(Math.cos(a) * R, Math.sin(a) * R, z), 0.02, steel)));
      const piv = new T.Group(); piv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      const cab = new T.Group();
      cab.add(at(box(0.5, 0.45, 0.45, std(pick(['#e94b3c', '#2f7fd8', '#f4c430', '#36b37e', '#9b59b6']))), 0, -0.6, 0));
      cab.add(at(box(0.56, 0.06, 0.5, white), 0, -0.15, 0));
      cab.add(rod(V(0, 0, 0), V(0, -0.15, 0), 0.02, steel));
      piv.add(cab); wheel.add(piv); cabins.push(piv);
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const b = new T.Mesh(new T.SphereGeometry(0.06, 6, 4), basic(lightCols[i % 4]));
      b.position.set(Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05), 0.4); wheel.add(b);
    }
    fw.add(wheel);
    fw.rotation.y = 0.45;
    g.add(at(fw, -4, 0, -3));

    // карусель
    const car = new T.Group();
    car.add(cyl(1.7, 1.8, 0.3, white, 32));
    car.add(at(cyl(0.12, 0.12, 2.2, steel), 0, 0.3, 0));
    const roofC = new T.Mesh(new T.ConeGeometry(2.0, 1.0, 16), std('#d9343f', { roughness: 0.5 })); roofC.position.y = 3.0; roofC.castShadow = true; car.add(roofC);
    const spin = new T.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spin.add(rod(V(Math.cos(a) * 1.3, 0.3, Math.sin(a) * 1.3), V(Math.cos(a) * 1.3, 2.5, Math.sin(a) * 1.3), 0.03, steel));
      const horse = box(0.5, 0.3, 0.18, std(pick(['#ffffff', '#f4c430', '#2f7fd8', '#e94b3c'])));
      horse.position.set(Math.cos(a) * 1.3, 1.0, Math.sin(a) * 1.3); horse.rotation.y = -a; horse.userData.ph = i; spin.add(horse);
    }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const b = new T.Mesh(new T.SphereGeometry(0.06, 6, 4), basic(lightCols[i % 4])); b.position.set(Math.cos(a) * 2.0, 2.5, Math.sin(a) * 2.0); spin.add(b); }
    car.add(spin);
    g.add(at(car, 5, 0, 1));

    // канатна дорога
    const cab = new T.Group();
    const A = V(-8, 3.6, 5), B = V(8, 3.6, -6);
    const dir = B.clone().sub(A); const side = V(-dir.z, 0, dir.x).normalize().multiplyScalar(0.35);
    [0, 0.5, 1].forEach((f) => {
      const p = A.clone().lerp(B, f);
      cab.add(rod(V(p.x, 0, p.z), V(p.x, p.y + 0.3, p.z), 0.08, steel));
      cab.add(rod(p.clone().add(side).add(V(0, 0.3, 0)), p.clone().sub(side).add(V(0, 0.3, 0)), 0.05, steel));
    });
    const lineA = [A.clone().add(side).add(V(0, 0.3, 0)), B.clone().add(side).add(V(0, 0.3, 0))];
    const lineB = [A.clone().sub(side).add(V(0, 0.3, 0)), B.clone().sub(side).add(V(0, 0.3, 0))];
    cab.add(rod(lineA[0], lineA[1], 0.015, steel)); cab.add(rod(lineB[0], lineB[1], 0.015, steel));
    const chairs = [];
    for (let i = 0; i < 12; i++) {
      const c = new T.Group();
      c.add(at(box(0.36, 0.3, 0.3, std(pick(['#f4c430', '#2f7fd8', '#e94b3c', '#36b37e']))), 0, -0.55, 0));
      c.add(rod(V(0, 0, 0), V(0, -0.25, 0), 0.015, steel));
      c.userData.u = i / 12; c.userData.back = i % 2 === 1;
      cab.add(c); chairs.push(c);
    }
    g.add(cab);

    // дерева й гірлянди
    for (let i = 0; i < 46; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(6.5, 10.5);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 1.6 && z > 4) continue;
      g.add(at(tree(rnd(1.4, 2.4), pick(AUTUMN)), x, 0.1, z));
    }
    [-1, 1].forEach((s) => { for (let k = 0; k < 4; k++) g.add(at(lamp(1.3, '#ffe9b0'), s * 1.3, 0.1, 2.8 + k * 2)); });
    // фонтан у центрі
    g.add(at(cyl(1.5, 1.6, 0.35, std('#8e8880'), 32), 0, 0, 1));
    const fwat = new T.Mesh(new T.CircleGeometry(1.35, 32), std('#0f3550', { metalness: 0.9, roughness: 0.05 }));
    fwat.rotation.x = -Math.PI / 2; fwat.position.set(0, 0.36, 1); g.add(fwat);

    g.userData.update = (t) => {
      wheel.rotation.z = t * 0.12;
      cabins.forEach((c) => { c.rotation.z = -wheel.rotation.z; });
      spin.rotation.y = t * 0.6;
      spin.children.forEach((h) => { if (h.userData.ph !== undefined) h.position.y = 1.0 + Math.sin(t * 3 + h.userData.ph) * 0.18; });
      chairs.forEach((c) => {
        let u = (c.userData.u + t * 0.03) % 1;
        const line = c.userData.back ? lineB : lineA;
        if (c.userData.back) u = 1 - u;
        c.position.copy(line[0]).lerp(line[1], u);
      });
    };
    g.userData.fit = 13;
    return g;
  };

  window.MODELS = M;
  window.MODEL_HELPERS = { textSprite, DOT, tree, box, std, basic, facade, facadeMat, AUTUMN };
})();
