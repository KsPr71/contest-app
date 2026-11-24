"""Regenerate local demo variants. Requires Pillow: python -m pip install Pillow."""
from io import BytesIO
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
THUMBNAIL_MAX_BYTES = 20_000


def encode(source, max_side, initial_quality, target_bytes):
    image = source.copy()
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    for attempt in range(16):
        output = BytesIO()
        image.save(output, format="WEBP", quality=max(45, initial_quality - min(attempt, 3) * 10))
        data = output.getvalue()
        if len(data) <= target_bytes:
            return data, image.size
        if attempt >= 3:
            image = image.resize(
                (max(1, round(image.width * 0.8)), max(1, round(image.height * 0.8))),
                Image.Resampling.LANCZOS,
            )
    raise ValueError(f"Unable to meet {target_bytes}-byte image budget")


def main():
    records = []
    for path in sorted((ROOT / "public/photos").glob("*.jpg")):
        with Image.open(path) as original:
            source = ImageOps.exif_transpose(original).convert("RGB")
            record = {"id": path.stem, "originalBytes": path.stat().st_size}
            for variant, side, quality, budget in [
                ("thumb", 480, 75, THUMBNAIL_MAX_BYTES),
                ("full", 1600, 82, 500 * 1024),
            ]:
                data, (width, height) = encode(source, side, quality, budget)
                target = path.with_name(f"{path.stem}-{variant}.webp")
                target.write_bytes(data)
                record[variant] = {"width": width, "height": height, "bytes": len(data)}
            records.append(record)
    (ROOT / "src/data/sample-images.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    for record in records:
        print(f"{record['id']}: {record['thumb']['bytes']} bytes")


if __name__ == "__main__":
    main()
