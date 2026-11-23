// =====================================================================
//  Автоматична якість для детальних 3D-сцен.
//  На потужному комп'ютері нічого не змінює (MSAA 4×, повна роздільність).
//  Якщо кадрів замало — крок 1: MSAA → FXAA (майже так само гарно, але значно швидше);
//  крок 2 (лише якщо все ще ривками): трохи зменшує внутрішню роздільність.
// =====================================================================
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FXAA = {
  uniforms: { tDiffuse: { value: null }, rcp: { value: new THREE.Vector2(1 / 1024, 1 / 768) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 rcp; varying vec2 vUv;
  float L(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main(){
    vec4 m4 = texture2D(tDiffuse, vUv); vec3 M = m4.rgb;
    vec3 NW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * rcp).rgb, NE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * rcp).rgb;
    vec3 SW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * rcp).rgb, SE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * rcp).rgb;
    float lNW = L(NW), lNE = L(NE), lSW = L(SW), lSE = L(SE), lM = L(M);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = m4; return; } // плоска ділянка — нічого не робимо
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * rcp;
    vec3 A = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 B = A * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
    float lB = L(B);
    gl_FragColor = vec4((lB < lMin || lB > lMax) ? A : B, m4.a);
  }`
};

export function autoQuality({ renderer, composer, onResize, name = 'scene' }) {
  const q = (location.search.match(/[?&]q=(\d)/) || [])[1]; // ?q=0/1/2 — примусовий рівень для тестів
  const fx = new ShaderPass(FXAA); fx.enabled = false;
  composer.insertPass(fx, composer.passes.length - 1); // після OutputPass, перед фінальною корекцією
  const st = { level: 0, fps: 0 };
  window.__quality = st;
  const msaa0 = composer.renderTarget2.samples;

  function setLevel(l) {
    st.level = l;
    if (l >= 1 && msaa0) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = 0; t.dispose(); }
    }
    fx.enabled = l >= 1;
    if (l >= 2) {
      const pr = Math.max(0.75, Math.min(renderer.getPixelRatio(), 1) * 0.8);
      renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
      onResize && onResize();
    }
    console.info(`[якість ${name}] рівень ${l}${st.fps ? `, FPS ≈ ${st.fps.toFixed(0)}` : ''}`);
  }
  if (q) setLevel(+q);

  // Прогрів: сцену підвантажено заздалегідь на паузі — один раз малюємо кадр «у фоні»,
  // щоб важка підготовка графіки (компіляція шейдерів) сталася ДО показу, а не під час.
  if (/[?&]paused/.test(location.search)) {
    setTimeout(() => {
      const t = window.__three; if (!t) return;
      try {
        renderer.compile(t.scene, t.camera); render(0.0001);
        const L = document.querySelector('.loader, #loader'); if (L) L.hidden = true; // кадр готовий — заставка завантаження не потрібна
      } catch (e) { /* не критично */ }
    }, 400);
  }

  // рахуємо лише реально намальовані кадри (сцена може стояти на паузі)
  let frames = 0, time = 0, last = 0, warm = 0, low = 0;
  const render = composer.render.bind(composer);
  let fxWarm = false;
  composer.render = (dt) => {
    const now = performance.now();
    // перший кадр — разом із FXAA, щоб його шейдер скомпілювався заздалегідь (без ривка при перемиканні якості)
    const warmFx = !fxWarm && !fx.enabled; if (warmFx) { fx.enabled = true; fxWarm = true; }
    if (fx.enabled) { const b = composer.readBuffer; fx.uniforms.rcp.value.set(1 / b.width, 1 / b.height); }
    render(dt);
    if (warmFx) fx.enabled = false;
    if (q || st.level >= 2) return;
    const gap = last ? (now - last) / 1000 : 0; last = now;
    if (!gap || gap > 0.25) return;           // після паузи — не рахуємо
    if ((warm += gap) < 2.5) return;           // перші секунди (завантаження) пропускаємо
    frames++; time += gap;
    if (time >= 3) {
      st.fps = frames / time; frames = 0; time = 0;
      if (st.level === 0 && st.fps < 45) setLevel(1);
      else if (st.level === 1) { low = st.fps < 28 ? low + 1 : 0; if (low >= 2) setLevel(2); } // лише якщо стабільно ривками
    }
  };
  return st;
}
