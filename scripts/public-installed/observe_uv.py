#!/usr/bin/env python3
"""Observe verified installer wheel inputs, then forward unchanged uv arguments."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.parse
import uuid


def main() -> int:
    argv = sys.argv[1:]
    product = argv[:2] == ["tool", "install"]
    receipt = None
    wheel: Path | None = None
    output = Path(os.environ["PUBLIC_ACCEPT_EVIDENCE"])
    stem = "install-" + uuid.uuid4().hex
    if product:
        assert "--editable" not in argv and "-e" not in argv
        wheel = Path(argv[-1]).absolute()
        data = wheel.read_bytes()
        assert wheel.name == "jev_gateway-0.1.3-py3-none-any.whl"
        assert len(data) == 459987
        assert hashlib.sha256(data).hexdigest() == "135f91895bd726622b752aed75734d8eba985b12f0345ea63f0013b86a07dff0"
        receipt = {"argv": argv, "wheel_input": str(wheel), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
    result = subprocess.run([os.environ["PUBLIC_ACCEPT_REAL_UV"], *argv], check=False)
    if product and result.returncode == 0:
        assert wheel is not None and receipt is not None
        prefix = Path(os.environ["UV_TOOL_DIR"]) / "jev-gateway"
        proof = output / (stem + "-origin.json")
        command = [str(prefix / "bin/python"), "-I", os.environ["PUBLIC_ACCEPT_PROBE"],
                   "--wheel", str(wheel), "--prefix", str(prefix), "--output", str(proof)]
        for forbidden in json.loads(os.environ["PUBLIC_ACCEPT_FORBIDDEN"]):
            command.extend(["--forbid", forbidden])
        checked = subprocess.run(command, check=False)
        if checked.returncode:
            return checked.returncode
        origin = json.loads(proof.read_text())
        direct_path = Path(urllib.parse.unquote(urllib.parse.urlsplit(origin["direct_url"]["url"]).path)).absolute()
        assert direct_path == wheel, (direct_path, wheel)
        receipt["origin_receipt"] = str(proof)
    if receipt is not None:
        receipt["native_exit"] = result.returncode
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
