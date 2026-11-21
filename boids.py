# -*- coding: utf-8 -*-
"""
Boids —— 鸟群效应（Craig Reynolds, 1986）三规则最小实现

三条规则，全部只依赖「本个体 + 视野内邻居」，没有任何中心指挥：
    1. 分离 Separation : 离最近的那几只太近 → 往反方向推
    2. 对齐 Alignment  : 跟视野内邻居的平均朝向趋同
    3. 聚合 Cohesion   : 往视野内邻居的质心靠

可选补充规则：边界转向（margin）、速度钳制、最大转向力。

用法：
    python boids.py            # 跑实验，打印极化度曲线
"""
import numpy as np


class Boids:
    def __init__(self,
                 n=400,
                 box=(100.0, 100.0),
                 seed=1,
                 # --- 三条规则的半径 ---
                 r_sep=2.5,        # 分离半径（小）
                 r_align=7.0,      # 对齐半径（大）
                 r_coh=7.0,        # 聚合半径（大）
                 # --- 三条规则的权重 ---
                 w_sep=1.8,
                 w_align=1.0,
                 w_coh=0.9,
                 # --- 运动学约束 ---
                 v0=0.9,           # 巡航速度
                 v_min=0.6,
                 v_max=1.5,
                 max_force=0.05,   # 每步最大转向量
                 # --- 边界 ---
                 margin=10.0,
                 w_margin=2.0,
                 wrap=True):
        self.n = n
        self.box = np.asarray(box, dtype=float)
        self.r_sep, self.r_align, self.r_coh = r_sep, r_align, r_coh
        self.w_sep, self.w_align, self.w_coh = w_sep, w_align, w_coh
        self.v0, self.v_min, self.v_max = v0, v_min, v_max
        self.max_force = max_force
        self.margin, self.w_margin = margin, w_margin
        self.wrap = wrap

        rng = np.random.default_rng(seed)
        self.pos = rng.uniform(0.0, 1.0, (n, 2)) * self.box
        ang = rng.uniform(0.0, 2.0 * np.pi, n)
        self.vel = np.c_[np.cos(ang), np.sin(ang)] * v0

        self._eye = ~np.eye(n, dtype=bool)

    # ---------- 工具 ----------
    @staticmethod
    def _unit(v):
        n = np.linalg.norm(v, axis=-1, keepdims=True)
        return v / np.maximum(n, 1e-12)

    def order_parameter(self):
        """极化度 φ = |Σv| / Σ|v|，0=乱飞，1=全体同向"""
        return float(np.linalg.norm(self.vel.sum(0)) /
                     max(np.linalg.norm(self.vel, axis=1).sum(), 1e-12))

    def neighbor_stats(self):
        """平均邻居数（视野内，不含自己），用来对照真实鸟群的经验值"""
        d = self._min_image_delta()
        dist = np.linalg.norm(d, axis=2)
        m = (dist < self.r_align) & self._eye
        return float(m.sum(1).mean())

    def _min_image_delta(self):
        """p_i - p_j，周期性边界取最短镜像"""
        d = self.pos[:, None, :] - self.pos[None, :, :]
        if self.wrap:
            d -= np.round(d / self.box) * self.box
        return d

    # ---------- 单步 ----------
    def step(self, dt=1.0):
        d = self._min_image_delta()                     # (n,n,2)  p_i - p_j
        dist = np.linalg.norm(d, axis=2)                # (n,n)
        dist = np.maximum(dist, 1e-9)

        m_sep = (dist < self.r_sep) & self._eye
        m_ali = (dist < self.r_align) & self._eye
        m_coh = (dist < self.r_coh) & self._eye

        # 1) 分离：反比距离地往外推（d 指向 i，所以乘正号就是远离 j）
        w = np.where(m_sep, 1.0 / (dist ** 2), 0.0)
        sep = self._unit((d * w[..., None]).sum(1))

        # 2) 对齐：邻居平均速度 - 自己速度
        c_ali = m_ali.sum(1, keepdims=True)
        v_mean = (self.vel[None, :, :] * m_ali[..., None]).sum(1) / np.maximum(c_ali, 1)
        ali = self._unit(v_mean - self.vel)

        # 3) 聚合：邻居质心 - 自己位置
        c_coh = m_coh.sum(1, keepdims=True)
        p_mean = (self.pos[None, :, :] * m_coh[..., None]).sum(1) / np.maximum(c_coh, 1)
        coh = self._unit(p_mean - self.pos)

        # 4) 边界：贴近墙就往里拐（wrap=True 时只是备用）
        f = np.zeros_like(self.pos)
        lo, hi = self.margin, self.box - self.margin
        f[self.pos < lo] = 1.0
        f[self.pos > hi] = -1.0
        wall = self._unit(f)

        acc = (self.w_sep * sep
               + self.w_align * ali
               + self.w_coh * coh
               + self.w_margin * wall)

        # 转向力上限
        mag = np.linalg.norm(acc, axis=1, keepdims=True)
        acc *= np.where(mag > self.max_force, self.max_force / np.maximum(mag, 1e-12), 1.0)

        self.vel += acc * dt

        # 速度钳制（下界保证不会停下来挤成一团）
        sp = np.linalg.norm(self.vel, axis=1, keepdims=True)
        sp = np.maximum(sp, 1e-12)
        self.vel *= (np.clip(sp, self.v_min, self.v_max) / sp)

        self.pos += self.vel * dt
        if self.wrap:
            self.pos %= self.box
        else:
            self.pos = np.clip(self.pos, 0, self.box)
        return self


# ---------------- 实验：三规则消融 ----------------
CONFIGS = {
    "全开 (s+a+c)":      dict(),
    "去分离 (a+c)":      dict(w_sep=0.0),
    "去对齐 (s+c)":      dict(w_align=0.0),
    "去聚合 (s+a)":      dict(w_coh=0.0),
    "只剩分离":          dict(w_align=0.0, w_coh=0.0),
    "只剩聚合":          dict(w_sep=0.0, w_align=0.0),
}


def run(name, kw, steps=900, n=400, seed=7):
    b = Boids(n=n, seed=seed, **kw)
    phi = [b.order_parameter()]
    for t in range(steps):
        b.step()
        phi.append(b.order_parameter())
    return name, phi, b


if __name__ == "__main__":
    import sys
    steps = 900
    print(f"n=400  box=100x100  steps={steps}")
    print(f"{'配置':<18}{'φ@0':>7}{'φ@300':>8}{'φ@600':>8}{'φ@900':>8}{'邻居数':>8}")
    print("-" * 58)
    for name, kw in CONFIGS.items():
        _, phi, b = run(name, kw, steps=steps)
        print(f"{name:<18}{phi[0]:>7.3f}{phi[300]:>8.3f}{phi[600]:>8.3f}{phi[900]:>8.3f}"
              f"{b.neighbor_stats():>8.1f}")
    sys.exit(0)
