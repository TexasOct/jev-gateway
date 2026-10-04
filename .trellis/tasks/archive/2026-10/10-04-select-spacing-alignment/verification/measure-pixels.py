"""Measure rendered select arrows from synthetic Chromium PNG evidence."""
import json
import math
import pathlib
import re
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent


def read_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    offset = 8
    compressed = bytearray()
    while offset < len(data):
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            assert depth == 8 and color in (2, 6) and interlace == 0
            channels = 3 if color == 2 else 4
        elif kind == b"IDAT":
            compressed.extend(chunk)
        offset += 12 + size
    raw = zlib.decompress(compressed)
    stride = width * channels
    rows = []
    previous = bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        mode = raw[start]
        row = bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            above = previous[x]
            upper_left = previous[x - channels] if x >= channels else 0
            if mode == 0:
                predictor = 0
            elif mode == 1:
                predictor = left
            elif mode == 2:
                predictor = above
            elif mode == 3:
                predictor = (left + above) // 2
            else:
                assert mode == 4
                base = left + above - upper_left
                distances = [abs(base - left), abs(base - above), abs(base - upper_left)]
                predictor = [left, above, upper_left][distances.index(min(distances))]
            row[x] = (row[x] + predictor) & 255
        rows.append(row)
        previous = row
    return lambda x, y: tuple(rows[y][x * channels:x * channels + 3])


results = []
for sample in json.loads((ROOT / "after-geometry.json").read_text()):
    if sample["width"] < 1280:
        continue
    directory = ROOT / "after" / f"select-controls-native-select-geometry-{sample['width']}px-{sample['locale']}-{sample['scheme']}"
    for measurement in sample["measurements"]:
        box = measurement["selected"]
        image = directory / f"{measurement['kind']}.png"
        pixel = read_png(image)
        background = tuple(map(int, re.findall(r"\d+", box["backgroundColor"])))
        right = box["x"] + box["width"]
        center = box["y"] + box["height"] / 2
        points = []
        for y in range(math.floor(center - 9), math.ceil(center + 9)):
            for x in range(math.floor(right - 30), math.ceil(right - 3)):
                if max(abs(a - b) for a, b in zip(pixel(x, y), background)) >= 40:
                    points.append((x, y))
        assert points, image
        bounds = [min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points) + 1, max(y for _, y in points) + 1]
        inset = right - bounds[2]
        center_difference = (bounds[1] + bounds[3]) / 2 - center
        assert inset >= 12 and abs(center_difference) <= 1, (image, inset, center_difference)
        results.append({"image": str(image.relative_to(ROOT)), "arrow_bounds": bounds, "right_inset": inset, "vertical_center_difference": center_difference, "contrast_pixel_count": len(points)})
(ROOT / "pixel-measurements.json").write_text(json.dumps(results, indent=2) + "\n")
print(f"{len(results)} rendered arrow measurements; minimum right inset {min(r['right_inset'] for r in results)}px; maximum center difference {max(abs(r['vertical_center_difference']) for r in results)}px")
