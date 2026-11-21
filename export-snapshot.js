// 导出鼠标跟随的四帧快照，供 Pillow 出图检查形态
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
function fakeEl(id) {
  return { value: DEFAULTS[id] || '1', textContent: '', style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    clientWidth: W, clientHeight: H, width: 0, height: 0,
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    getContext() { return ctxStub; } };
}
const sandbox = {
  document: { getElementById(id) { return els[id] || (els[id] = fakeEl(id)); },
              createElement() { return fakeEl('div'); } },
  Math, console, Float32Array, Int32Array, Set,
  Path2D: function () { this.moveTo = () => {}; this.lineTo = () => {}; },
  requestAnimationFrame() { return 0; }, devicePixelRatio: 1, addEventListener() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.innerWidth = W;
sandbox.window.innerHeight = H;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'flock.js' });

const F = sandbox.window.FLOCK;
const camW = 1600, camH = 900;

// 模拟鼠标轨迹：沿椭圆来回扫，接近真人甩鼠标
const track = [];
for (let t = 0; t < 900; t++) {
  const a = t / 900 * Math.PI * 2;
  track.push({ x: camW * 0.5 + Math.cos(a) * camW * 0.30 + Math.sin(a * 3) * 70,
               y: camH * 0.5 + Math.sin(a * 1.7) * camH * 0.30 });
}

const shots = [];
F.pointer.inside = true;
for (let t = 0; t < 900; t++) {
  F.pointer.x = track[t].x;
  F.pointer.y = track[t].y;
  F.step();
  if (t === 0 || t === 90 || t === 240 || t === 899) {
    const { px, py, vx, vy } = F.pos;
    const snap = { t: t, W: camW, H: camH, mouse: { x: F.pointer.x, y: F.pointer.y }, boids: [] };
    for (let i = 0; i < F.n; i++) {
      snap.boids.push([+px[i].toFixed(2), +py[i].toFixed(2),
                       +vx[i].toFixed(3), +vy[i].toFixed(3)]);
    }
    shots.push(snap);
  }
}

fs.writeFileSync(path.join(__dirname, 'snapshot.json'), JSON.stringify(shots));
console.log('saved snapshot.json  帧组=', shots.length, ' n=', F.n);
