# Renders the in-app BrandMark (src/components/ui/surfaces.tsx, viewBox 64) to the app's PNG assets.
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
BRAND = (0x2A, 0x4B, 0xB0)
MARGIN = (0xF4, 0xA7, 0x9D)
SS = 4  # supersampling


def mark(draw, s, ox, oy, *, bg=True, rules=True, margin=True, tick=True, rounded=True, rule_extend=None):
    X = lambda v: ox + v * s
    Y = lambda v: oy + v * s
    if bg:
        if rounded:
            draw.rounded_rectangle([X(0), Y(0), X(64), Y(64)], radius=17 * s, fill=BRAND + (255,))
        else:
            draw.rectangle([X(0), Y(0), X(64), Y(64)], fill=BRAND + (255,))
    x0, x1 = (X(0), X(64)) if rule_extend is None else (0, rule_extend)
    if rules:
        for y in (22, 34, 46):
            w = 1.5 * s
            draw.rectangle([x0, Y(y) - w / 2, x1, Y(y) + w / 2], fill=(255, 255, 255, int(255 * 0.16)))
    if margin:
        w = 2 * s
        y0, y1 = (Y(0), Y(64)) if rule_extend is None else (0, rule_extend)
        draw.rectangle([X(15) - w / 2, y0, X(15) + w / 2, y1], fill=MARGIN + (int(255 * 0.9),))
    if tick:
        white = (255, 255, 255, 255)
        pts = [(X(23), Y(33.5)), (X(30.5), Y(41)), (X(46), Y(24.5))]
        w = 6 * s
        draw.line(pts, fill=white, width=int(round(w)), joint='curve')
        for (px, py) in pts:
            draw.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=white)


def render(name, size, mode, fn, clip=False):
    big = size * SS
    base = (0, 0, 0, 0) if mode == 'RGBA' else BRAND + (255,)
    im = Image.new('RGBA', (big, big), base)
    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    fn(ImageDraw.Draw(layer, 'RGBA'), big)
    im = Image.alpha_composite(im, layer)
    if clip:  # keep the rules and the margin line inside the rounded square
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=17 * big / 64, fill=255)
        im.putalpha(Image.composite(im.getchannel('A'), mask, mask))
    im = im.resize((size, size), Image.LANCZOS)
    if mode == 'RGB':
        im = im.convert('RGB')
    im.save(f'{OUT}/{name}', optimize=True)


def adaptive(B):
    # Android adaptive icon: 108dp canvas, the middle 72dp is visible: the 64-unit mark maps onto it
    return B * (72 / 108) / 64, B * (18 / 108)


# iOS / store icon: full bleed (the system rounds the corners)
render('icon.png', 1024, 'RGB', lambda d, B: mark(d, B / 64, 0, 0, rounded=False))
render('android-icon-background.png', 1024, 'RGB', lambda d, B: mark(d, adaptive(B)[0], adaptive(B)[1], adaptive(B)[1], bg=False, tick=False, rule_extend=B))
render('android-icon-foreground.png', 1024, 'RGBA', lambda d, B: mark(d, adaptive(B)[0], adaptive(B)[1], adaptive(B)[1], bg=False, rules=False, margin=False))
render('android-icon-monochrome.png', 1024, 'RGBA', lambda d, B: mark(d, adaptive(B)[0], adaptive(B)[1], adaptive(B)[1], bg=False, rules=False, margin=False))
# splash (120 pt on the brand-blue splash background) and the web favicon: the whole rounded mark
render('splash-icon.png', 512, 'RGBA', lambda d, B: mark(d, B / 64, 0, 0), clip=True)
render('favicon.png', 48, 'RGBA', lambda d, B: mark(d, B / 64, 0, 0), clip=True)
# Android status-bar icon: white silhouette only (the system tints it); the tick enlarged to read at 24dp
render('notification-icon.png', 96, 'RGBA', lambda d, B: mark(d, B / 64 * 1.3, -B * 0.19, -B * 0.16, bg=False, rules=False, margin=False))
print('ok')
