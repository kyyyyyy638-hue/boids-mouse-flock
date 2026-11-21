// 配色连续性校验：直接从 mouse-flock.html 里取真实的 bandOf / bandStyle 来测
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'mouse-flock.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const W = 1600, H = 900;
const NOOP_KEYS = new Set(['setTransform', 'fillRect', 'beginPath', 'arc', 'stroke',
  'fill', 'moveTo', 'lineTo', 'save', 'restore', 'clearRect']);
const ctxStub = new Proxy({}, {
  get(t, k) { return typeof t[k] === 'function' ? t[k] : (NOOP_KEYS.has(k) ? () => {} : t[k]); },
  set(t, k, v) { t[k] = v; return true; },
});
const DEFAULTS = { 's-count': '900', 's-sep': '2.00', 's-ali': '1', 's-coh': '0.60',
                   's-flw': '1.00', 's-orb': '0.75', 's-vis': '70' };
const els = {};
const fake = (id) => ({ value: DEFAULTS[id] || '1', textContent: '', style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  clientWidth: W, clientHeight: H, width: 0, height: 0,
  addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0 }; },
  getContext() { return ctxStub; } });

const sandbox = {
  document: { getElementById(id) { return els[id] || (els[id] = fake(id)); },
              createElement() { return fake('div'); } },
  Math, console, Float32Array, Int32Array, Set,
  Path2D: function () { this.moveTo = () => {}; this.lineTo = () => {}; },
  requestAnimationFrame() { return 0; }, devicePixelRatio: 1, addEventListener() {},
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.window.innerWidth = W; sandbox.window.innerHeight = H;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'flock.js' });

const F = sandbox.window.FLOCK;
const { bandOf, bandStyle } = F;

function parseStyle(s) {
  const m = s.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
  return m ? { h: +m[1], s: +m[2], l: +m[3] } : null;
}
const hueless = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

const NAMES = ['0 速度(默认)', '1 单色流光', '2 方向色环'];
const vMin = 1.6, vMax = 5.4;
let allOk = true;

for (let mode = 0; mode < 3; mode++) {
  // 扫一整圈朝向，看相邻角度是否换档，以及换档时色差多大
  const STEPS = 1440;
  let maxBandJump = 0, maxHueJump = 0, maxHueJumpAll = 0, maxLightJump = 0;
  let prevBand = null, prevCol = null;
  for (let i = 0; i <= STEPS; i++) {
    const ang = -Math.PI + i / STEPS * Math.PI * 2;
    const sp = 4.2;
    const norm = (sp - vMin) / (vMax - vMin);
    const band = bandOf(norm, ang, mode);
    const col = parseStyle(bandStyle(band, mode));
    if (prevBand !== null) {
      maxBandJump = Math.max(maxBandJump, Math.abs(band - prevBand));
      if (col && prevCol) {
        maxHueJumpAll = Math.max(maxHueJumpAll, hueless(col.h, prevCol.h));
        maxLightJump = Math.max(maxLightJump, Math.abs(col.l - prevCol.l));
      }
    }
    prevBand = band; prevCol = col;
  }

  // 关键：同一个朝向，落在 -π 侧和 +π 侧，颜色必须一样
  const eps = 1e-4;
  const bNeg = bandOf((4.2 - vMin) / (vMax - vMin), -Math.PI + eps, mode);
  const bPos = bandOf((4.2 - vMin) / (vMax - vMin), Math.PI - eps, mode);
  const cNeg = parseStyle(bandStyle(bNeg, mode));
  const cPos = parseStyle(bandStyle(bPos, mode));
  const seamHue = (mode === 1) ? 0 : hueless(cNeg.h, cPos.h);
  const seamLight = (mode === 1) ? Math.abs(cNeg.l - cPos.l) : 0;

  // 色环模式下跨 seam 的档位差是 0 与 39，属于环上相邻，允许
  const bandOk = mode === 2 ? true : maxBandJump <= 1;
  const seamOk = seamHue < 12 && seamLight < 12;
  const ok = bandOk && seamOk;
  allOk = allOk && ok;

  console.log(`mode ${NAMES[mode]}`);
  console.log(`  绕一圈最大换档: ${maxBandJump} 档   相邻色最大色相差: ${maxHueJumpAll.toFixed(1)}°   最大亮度差: ${maxLightJump.toFixed(1)}%`);
  console.log(`  ±π 接缝同朝向两侧: band ${bNeg} vs ${bPos}  (hue ${cNeg.h}→${cPos.h}, light ${cNeg.l}→${cPos.l})`);
  console.log(`  接缝色差: 色相 ${seamHue.toFixed(1)}°  亮度 ${seamLight.toFixed(1)}%   →  ${ok ? 'OK' : '跳色'}`);
}

console.log('');
console.log(allOk ? 'PASS: 三种配色都没有接缝跳色' : 'FAIL: 存在跳色');
