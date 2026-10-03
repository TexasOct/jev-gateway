#!/usr/bin/env python3
"""Record verified local wheel input, then forward the original uv invocation."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import uuid

from acceptance_common import digest, require, write_json


def main() -> int:
    arguments = sys.argv[1:]
    real_uv = Path(os.environ["JEV_ACCEPTANCE_REAL_UV"])
    require(real_uv.is_absolute() and real_uv.is_file(), "real uv executable unavailable")
    if arguments[:2] == ["tool", "install"]:
        wheel = Path(arguments[-1]).resolve(strict=True)
        require(wheel.is_file() and wheel.name == os.environ["JEV_ACCEPTANCE_WHEEL_NAME"],
                "installer uv input is not the expected local release wheel")
        sha256 = digest(wheel)
        require(sha256 == os.environ["JEV_ACCEPTANCE_WHEEL_SHA256"],
                "installer uv input SHA256 differs from the verified public wheel")
        evidence = Path(os.environ["JEV_ACCEPTANCE_UV_INPUT_DIR"])
        write_json(evidence / ("wheel-input-" + uuid.uuid4().hex + ".json"), {
            "input_path": str(wheel), "filename": wheel.name,
            "sha256": sha256, "size_bytes": wheel.stat().st_size,
        })
    os.execv(str(real_uv), [str(real_uv), *arguments])
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print("installer wheel input observer failed: " + type(error).__name__, file=sys.stderr)
        raise SystemExit(1)
