# -*- coding: utf-8 -*-
"""把三规则消融实验的末态画成对照图（Pillow，无需 matplotlib）"""
import colorsys
import os

from PIL import Image, ImageDraw, ImageFont

from boids import CONFIGS, run

CELL, PAD, TOP = 340, 14, 46
STEPS = 900
COLS, ROWS = 3, 2

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def out_dir():
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
    os.makedirs(d, exist_ok=True)
    return d


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_panel(draw, b, ox, oy, title, font, subfont):
    draw.rectangle([ox, oy, ox + CELL, oy + CELL], fill=(12, 14, 20),
                   outline=(48, 54, 68))
    sx, sy = CELL / b.box[0], CELL / b.box[1]
    for (x, y), (vx, vy) in zip(b.pos, b.vel):
        px, py = ox + x * sx, oy + y * sy
        h = (__import__("math").atan2(vy, vx) / (2 * 3.141592653589793)) % 1.0
        r, g, bl = colorsys.hsv_to_rgb(h, 0.75, 1.0)
        col = (int(r * 255), int(g * 255), int(bl * 255))
        # 朝向短线（长度 ~ 速度）
        draw.line([px, py, px + vx * 5.0, py + vy * 5.0], fill=col, width=1)
        draw.ellipse([px - 1.6, py - 1.6, px + 1.6, py + 1.6], fill=col)
    draw.text((ox + 8, oy + 6), title, font=font, fill=(232, 236, 245))
    draw.text((ox + 8, oy + CELL - 20), f"φ={b.order_parameter():.2f}  邻居≈{b.neighbor_stats():.0f}",
              font=subfont, fill=(150, 200, 255))


def main():
    W = PAD + COLS * (CELL + PAD)
    H = TOP + ROWS * (CELL + PAD) + PAD
    img = Image.new("RGB", (W, H), (8, 9, 13))
    draw = ImageDraw.Draw(img)
    font, subfont = load_font(19), load_font(15)
    draw.text((PAD, 14), "Boids 三规则消融 · 900 步后的末态", font=load_font(22),
              fill=(240, 244, 250))

    items = list(CONFIGS.items())
    for i, (name, kw) in enumerate(items):
        _, phi, b = run(name, kw, steps=STEPS)
        r, c = divmod(i, COLS)
        ox = PAD + c * (CELL + PAD)
        oy = TOP + r * (CELL + PAD)
        draw_panel(draw, b, ox, oy, name, font, subfont)

    out = os.path.join(out_dir(), "boids_ablation.png")
    img.save(out)
    print("saved:", out, img.size)


if __name__ == "__main__":
    main()
