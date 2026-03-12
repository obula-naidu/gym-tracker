#!/usr/bin/env python3
"""Generate PWA icons from fit-pulse-logo.png.

Creates:
- icon-192.png
- icon-512.png

Usage:
    /root/OBUL_AI/obul_g/.venv/bin/python icons/generate_icons.py
"""

from pathlib import Path
from PIL import Image


def generate_icons() -> None:
    icons_dir = Path(__file__).resolve().parent
    source = icons_dir / "fit-pulse-logo.png"

    if not source.exists():
        raise FileNotFoundError(f"Source logo not found: {source}")

    targets = {
        192: icons_dir / "icon-192.png",
        512: icons_dir / "icon-512.png",
    }

    with Image.open(source) as img:
        base = img.convert("RGBA")
        for size, output in targets.items():
            resized = base.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(output, format="PNG")
            print(f"Created {output.name} ({size}x{size})")


if __name__ == "__main__":
    generate_icons()
