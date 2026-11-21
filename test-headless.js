// headless 冒烟测试：跑 mouse-flock.html 里的仿真，检查数值稳定 + 是否真的奔向鼠标
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'mouse-flock.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 script'); process.exit(1); }

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
function fakeEl(id) {
  return { value: DEFAULTS[id] || '1', textContent: '', style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    clientWidth: W, clientHeight: H, width: 0, height: 0,
    addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0 }; },
    getContext() { return ctxStub; } };
}

const sandbox = {
  document: { getElementById(id) { return els[id] || (els[id] = fakeEl(id)); },
              createElement() { return fakeEl('div'); } },
  Math, console, Float32Array, Int32Array, Set,
  Path2D: function () { this.moveTo = () => {}; this.lineTo = () => {}; },
  requestAnimationFrame() { return 0; },
  devicePixelRatio: 1,
  addEventListener() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.innerWidth = W;
sandbox.window.innerHeight = H;

vm.createContext(sandbox);
vm.runInContext(m[1], sandbox, { filename: 'flock.js' });

const F = sandbox.window.FLOCK;
if (!F) { console.error('FLOCK 未挂到 window'); process.exit(1); }

const N = F.n;
const target = { x: W * 0.78, y: H * 0.24 };   // 右上角

function centroid() {
  const { px, py } = F.pos;
  let sx = 0, sy = 0;
  for (let i = 0; i < N; i++) { sx += px[i]; sy += py[i]; }
  return { x: sx / N, y: sy / N };
}
function meanDistToTarget() {
  const { px, py } = F.pos;
  let s = 0;
  for (let i = 0; i < N; i++) s += Math.hypot(px[i] - target.x, py[i] - target.y);
  return s / N;
}
function integrity() {
  const { px, py, vx, vy } = F.pos;
  let bad = 0, out = 0;
  const sp = [];
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(px[i]) || !Number.isFinite(py[i]) ||
        !Number.isFinite(vx[i]) || !Number.isFinite(vy[i])) bad++;
    if (px[i] < -32 || px[i] > W + 32 || py[i] < -32 || py[i] > H + 32) out++;
    sp.push(Math.hypot(vx[i], vy[i]));
  }
  return { bad, out, spMin: Math.min(...sp), spMax: Math.max(...sp) };
}

console.log('个体数:', N);
const c0 = centroid();
const d0 = meanDistToTarget();
console.log(`初始质心 (${c0.x.toFixed(0)}, ${c0.y.toFixed(0)})，到目标平均距离 ${d0.toFixed(1)}`);

// 把指针放到目标点
F.pointer.x = target.x;
F.pointer.y = target.y;
F.pointer.inside = true;

const STEPS = 600;
const t0 = Date.now();
// 群体一直在绕着指针盘旋，任一时刻的快照都会波动，
// 所以取整段时间的统计量：最近贴过多少次、平均距指针多远
let everMin = Infinity, sumCenD = 0;
const ccen = centroid();
for (let t = 0; t < STEPS; t++) {
  F.step();
  everMin = Math.min(everMin, minDistToTarget());
  const c = centroid();
  sumCenD += Math.hypot(c.x - target.x, c.y - target.y);
}
const meanCenD = sumCenD / STEPS;
const ms = Date.now() - t0;

const c1 = centroid();
const d1 = meanDistToTarget();
const ig = integrity();

const { vx, vy } = F.pos;
let svx = 0, svy = 0, sv = 0;
for (let i = 0; i < N; i++) { svx += vx[i]; svy += vy[i]; sv += Math.hypot(vx[i], vy[i]); }
const phi = Math.hypot(svx, svy) / sv;

console.log(`跑 ${STEPS} 帧耗时 ${ms}ms  (${(ms / STEPS).toFixed(2)} ms/帧)`);
console.log(`末质心 (${c1.x.toFixed(0)}, ${c1.y.toFixed(0)})，到目标平均距离 ${d1.toFixed(1)}`);
console.log('质心到鼠标距离:', Math.hypot(c1.x - target.x, c1.y - target.y).toFixed(1), 'px');
console.log('NaN/Inf:', ig.bad, ' 越界:', ig.out);
console.log('速度范围:', ig.spMin.toFixed(2), '~', ig.spMax.toFixed(2), '(应落在 1.60~5.40 内)');
console.log('极化度 φ:', phi.toFixed(3));

// 惊飞模式：按住左键
F.pointer.down = true;
const dBefore = meanDistToTarget();
for (let t = 0; t < 120; t++) F.step();
const dAfter = meanDistToTarget();
F.pointer.down = false;
console.log('惊飞 120 帧：平均距离', dBefore.toFixed(1), '->', dAfter.toFixed(1));

function minDistToTarget() {
  const { px, py } = F.pos;
  let m = Infinity;
  for (let i = 0; i < N; i++) m = Math.min(m, Math.hypot(px[i] - target.x, py[i] - target.y));
  return m;
}

const ok = ig.bad === 0 && ig.out === 0 &&
           ig.spMin >= 1.6 - 0.02 && ig.spMax <= 5.4 + 0.02 &&
           d1 < d0 * 0.7 &&              // 整体确实收拢到鼠标附近
           everMin < 80 &&               // 整段时间里确实有鸟贴身掠过指针
           meanCenD < 300 &&             // 质心全程都待在指针周围
           dAfter > dBefore;             // 惊飞方向相反
console.log('全程最近个体到鼠标:', everMin.toFixed(1), 'px');
console.log('全程质心距鼠标均值:', meanCenD.toFixed(1), 'px');
console.log(ok ? 'PASS: 数值稳定、贴身跟住鼠标、惊飞模式反向' : 'FAIL');
