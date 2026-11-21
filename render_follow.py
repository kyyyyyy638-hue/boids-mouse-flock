# -*- coding: utf-8 -*-
"""把 headless 导出的快照画成四连拍，检查「跟着鼠标走」的形态（Pillow）"""
import colorsys
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CELL_W, CELL_H = 520, 293          # 16:9
PAD, TOP = 12, 44
COLS = 2
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def out_dir():
    d = os.path.join(HERE, "docs")
    os.makedirs(d, exist_ok=True)
    return d


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_shot(draw, shot, ox, oy, label, f_title, f_sub):
    w, h = shot["W"], shot["H"]
    sx, sy = CELL_W / w, CELL_H / h
    draw.rectangle([ox, oy, ox + CELL_W, oy + CELL_H], fill=(9, 11, 17), outline=(44, 52, 66))

    for bx, by, vx, vy in shot["boids"]:
        sp = math.hypot(vx, vy) or 1e-6
        ang = math.atan2(vy, vx)
        # 与 mouse-flock.html 的 draw() 保持同一套映射：
        # 色相主体跟着速度，方向只做 sin 微调制（sin 跨 ±π 连续，不会跳色）
        norm = min(1.0, max(0.0, (sp - 1.6) / (5.4 - 1.6)))
        hue = (195 + 70 * norm + 18 * math.sin(ang)) / 360.0 % 1.0
        light = 0.50 + 0.20 * norm
        r, g, b = colorsys.hls_to_rgb(hue, light, 0.88)
        col = (int(r * 255), int(g * 255), int(b * 255))
        x, y = ox + bx * sx, oy + by * sy
        ix, iy = vx / sp, vy / sp
        ln = (2.0 + 4.5 * norm) * (CELL_W / w)
        draw.line([x, y, x - ix * ln, y - iy * ln], fill=col, width=1)
        draw.point([x, y], fill=col)

    mx, my = ox + shot["mouse"]["x"] * sx, oy + shot["mouse"]["y"] * sy
    draw.ellipse([mx - 11, my - 11, mx + 11, my + 11], outline=(150, 205, 255))
    draw.line([mx - 18, my, mx + 18, my], fill=(90, 140, 190))
    draw.line([mx, my - 18, mx, my + 18], fill=(90, 140, 190))

    draw.text((ox + 8, oy + 6), label, font=f_title, fill=(230, 238, 250))

    cx = sum(b[0] for b in shot["boids"]) / len(shot["boids"])
    cy = sum(b[1] for b in shot["boids"]) / len(shot["boids"])
    d = math.hypot(cx - shot["mouse"]["x"], cy - shot["mouse"]["y"])
    vx = sum(b[2] for b in shot["boids"]) / len(shot["boids"])
    vy = sum(b[3] for b in shot["boids"]) / len(shot["boids"])
    draw.text((ox + 8, oy + CELL_H - 21),
              f"质心距鼠标 {d:5.0f}px   群体速度 ({vx:+.2f}, {vy:+.2f})",
              font=f_sub, fill=(140, 195, 250))


def main():
    shots = json.load(open(os.path.join(HERE, "snapshot.json"), encoding="utf-8"))
    rows = (len(shots) + COLS - 1) // COLS
    W = PAD + COLS * (CELL_W + PAD)
    H = TOP + rows * (CELL_H + PAD) + PAD
    img = Image.new("RGB", (W, H), (7, 8, 12))
    d = ImageDraw.Draw(img)
    d.text((PAD, 13), "鼠标跟随模式 · headless 四连拍（鼠标沿椭圆轨迹扫动）",
           font=font(21), fill=(240, 244, 250))
    ft, fs = font(17), font(14)
    for i, s in enumerate(shots):
        r, c = divmod(i, COLS)
        ox = PAD + c * (CELL_W + PAD)
        oy = TOP + r * (CELL_H + PAD)
        draw_shot(d, s, ox, oy, f"t = {s['t']:>3} 帧", ft, fs)
    out = os.path.join(out_dir(), "mouse-follow.png")
    img.save(out)
    print("saved:", out, img.size)


if __name__ == "__main__":
    main()
