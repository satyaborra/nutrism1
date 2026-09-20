#!/usr/bin/env python3
"""
Generate all NutriSLM logo assets from the uploaded brand image.

Outputs (from the uploaded master):
  public/images/logo-full.png      — complete logo (emblem + wordmark + tagline)
  public/images/logo-emblem.png    — square emblem crop (bowl + leaves), white bg
  public/icons/icon-512.png        — PWA icon, emblem on white, purpose any
  public/icons/icon-192.png        — PWA icon, emblem on white, purpose any
  public/icons/icon-maskable-512.png — emblem centered in the 80% safe zone, white bg
  public/icons/apple-touch-icon.png  — 180x180, white bg (iOS home screen)
  public/favicon.png               — 48x48 browser tab icon, white bg

The emblem keeps its white background (no fake transparency), so every surface
renders it inside a white rounded tile where the background disappears cleanly
in both light and dark mode.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "upload" / "ChatGPT Image Sep 18, 2026, 04_11_19 PM.png"

WHITE = (255, 255, 255)


def content_rows(img: Image.Image, threshold: int = 238) -> list[bool]:
    """Rows containing any pixel visibly darker than the white page."""
    gray = img.convert("L")
    px = gray.load()
    w, h = gray.size
    rows = []
    for y in range(h):
        found = False
        for x in range(0, w, 2):  # stride 2 is plenty
            if px[x, y] < threshold:
                found = True
                break
        rows.append(found)
    return rows


def bands(rows: list[bool], min_gap: int = 6) -> list[tuple[int, int]]:
    """Consecutive content-row bands, separated by >= min_gap blank rows."""
    out: list[tuple[int, int]] = []
    start = None
    gap = 0
    for y, hit in enumerate(rows + [False] * min_gap):
        if hit:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                out.append((start, y - gap + 1))
                start = None
                gap = 0
    return out


def bbox_cols(img: Image.Image, y0: int, y1: int, threshold: int = 238) -> tuple[int, int]:
    gray = img.convert("L")
    px = gray.load()
    w = gray.size[0]
    left, right = w, 0
    for y in range(y0, y1):
        for x in range(w):
            if px[x, y] < threshold:
                left = min(left, x)
                break
        for x in range(w - 1, -1, -1):
            if px[x, y] < threshold:
                right = max(right, x)
                break
    return left, right


def square_pad(img: Image.Image, fill=WHITE) -> Image.Image:
    """Pad to square with fill, centered."""
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), fill)
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def paste_center(bg: Image.Image, fg: Image.Image, scale: float) -> Image.Image:
    """Paste fg centered onto bg at `scale` * bg side."""
    side = bg.size[0]
    inner = int(side * scale)
    icon = fg.resize((inner, inner), Image.LANCZOS)
    off = (side - inner) // 2
    bg.paste(icon, (off, off))
    return bg


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    print(f"source: {w}x{h}")

    # 1) Full logo, trimmed of outer white margins, saved as the brand master.
    rows = content_rows(src)
    top = rows.index(True)
    bottom = len(rows) - rows[::-1].index(True)
    l, r = bbox_cols(src, top, bottom)
    pad = int((r - l) * 0.02)
    full = src.crop((max(0, l - pad), max(0, top - pad), min(w, r + pad), min(h, bottom + pad)))
    full.thumbnail((1200, 1200), Image.LANCZOS)
    full.save(ROOT / "public/images/logo-full.png", optimize=True)

    # 2) Emblem = first content band (bowl + leaves), above the wordmark gap.
    bs = bands(rows)
    print("bands:", bs)
    y0, y1 = bs[0]
    el, er = bbox_cols(src, y0, y1)
    epad = int((er - el) * 0.03)
    emblem = src.crop((max(0, el - epad), max(0, y0 - epad), min(w, er + epad), min(h, y1 + epad)))
    emblem_sq = square_pad(emblem)
    emblem_sq.save(ROOT / "public/images/logo-emblem.png", optimize=True)

    # 3) PWA icons.
    icons = ROOT / "public/icons"
    e512 = emblem_sq.resize((512, 512), Image.LANCZOS)
    icons.joinpath("icon-512.png").unlink(missing_ok=True)
    paste_center(Image.new("RGB", (512, 512), WHITE), emblem_sq, 0.86).save(icons / "icon-512.png", optimize=True)
    paste_center(Image.new("RGB", (192, 192), WHITE), emblem_sq, 0.86).save(icons / "icon-192.png", optimize=True)
    # Maskable: content must stay inside the inner 80% safe zone.
    paste_center(Image.new("RGB", (512, 512), WHITE), emblem_sq, 0.62).save(
        icons / "icon-maskable-512.png", optimize=True
    )
    paste_center(Image.new("RGB", (180, 180), WHITE), emblem_sq, 0.82).save(
        icons / "apple-touch-icon.png", optimize=True
    )
    paste_center(Image.new("RGB", (48, 48), WHITE), emblem_sq, 0.88).save(ROOT / "public/favicon.png", optimize=True)

    # quick report
    for p in [
        "public/images/logo-full.png",
        "public/images/logo-emblem.png",
        "public/icons/icon-512.png",
        "public/icons/icon-192.png",
        "public/icons/icon-maskable-512.png",
        "public/icons/apple-touch-icon.png",
        "public/favicon.png",
    ]:
        f = ROOT / p
        print(f"{p}: {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
