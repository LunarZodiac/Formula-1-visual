#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps


source_path = Path(sys.argv[1])
output_directory = Path(sys.argv[2])
asset_id = sys.argv[3]
output_directory.mkdir(parents=True, exist_ok=True)

results = []
with Image.open(source_path) as source:
    source = ImageOps.exif_transpose(source).convert("RGB")
    for width in (640, 1280, 1920):
        image = source.copy()
        image.thumbnail((width, width * 2), Image.Resampling.LANCZOS)
        output_path = output_directory / f"{asset_id}-{width}.webp"
        image.save(output_path, "WEBP", quality=84, method=6)
        results.append({
            "variant": f"{width}w",
            "path": str(output_path),
            "width": image.width,
            "height": image.height,
            "size": output_path.stat().st_size,
        })

print(json.dumps(results))
