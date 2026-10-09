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
        receipt = {"argv": argv, "wheel_input": str(wheel), "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                   "wheel_ctime_ns": wheel.stat().st_ctime_ns, "uv_native_exit": None, "overall_exit": None}
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
        version_command = [os.environ["PUBLIC_ACCEPT_REAL_UV"], "--version"]
        version = subprocess.run(version_command, capture_output=True, text=True, check=False)
        receipt["uv_version"] = {"command": version_command, "native_exit": version.returncode,
                                 "stdout": version.stdout, "stderr": version.stderr}
        if version.returncode != 0 or version.stdout.split()[:2] != ["uv", "0.13.0"]:
            receipt["overall_exit"] = 1
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
        assert version.returncode == 0 and version.stdout.split()[:2] == ["uv", "0.13.0"], receipt["uv_version"]
    return forward(argv, receipt, wheel, output, stem)


def forward(argv: list[str], receipt: dict | None, wheel: Path | None, output: Path, stem: str, run=None) -> int:
    run = subprocess.run if run is None else run
    product = receipt is not None
    result = run([os.environ["PUBLIC_ACCEPT_REAL_UV"], *argv], check=False)
    if receipt is not None:
        receipt["native_exit"] = receipt["uv_native_exit"] = result.returncode
        receipt["overall_exit"] = result.returncode
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
    if product and result.returncode == 0:
        assert wheel is not None and receipt is not None
        prefix = Path(os.environ["UV_TOOL_DIR"]) / "jev-gateway"
        proof = output / (stem + "-probe.json")
        command = [str(prefix / "bin/python"), "-I", os.environ["PUBLIC_ACCEPT_PROBE"],
                   "--wheel", str(wheel), "--prefix", str(prefix), "--output", str(proof),
                   "--wheel-ctime-ns", str(receipt["wheel_ctime_ns"])]
        for forbidden in json.loads(os.environ["PUBLIC_ACCEPT_FORBIDDEN"]):
            command.extend(["--forbid", forbidden])
        receipt["attestation"] = {"command": command, "native_exit": None,
            "partial_diagnostics": str(proof.with_name(proof.stem + "-partial"))}
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
        try:
            checked = run(command, check=False)
        except Exception as error:
            receipt["attestation"]["launch_error"] = {"type": type(error).__name__, "message": str(error)}
            receipt["overall_exit"] = 1
            (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
            raise
        receipt["attestation"] = {"command": command, "native_exit": checked.returncode,
            "partial_diagnostics": str(proof.with_name(proof.stem + "-partial"))}
        receipt["overall_exit"] = 1 if checked.returncode else result.returncode
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
        if checked.returncode:
            assert not proof.exists(), "failed probe left an origin receipt"
            return 1
        try:
            origin = json.loads(proof.read_text())
            direct_path = Path(urllib.parse.unquote(urllib.parse.urlsplit(origin["direct_url"]["url"]).path)).absolute()
            assert direct_path == wheel, (direct_path, wheel)
        except Exception as error:
            receipt["join_error"] = {"type": type(error).__name__, "message": str(error), "probe_receipt": str(proof)}
            receipt["overall_exit"] = 1
            (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
            print(f"attestation join failed: {error}", file=sys.stderr)
            return 1
        complete = output / (stem + "-origin.json")
        proof.rename(complete)
        receipt["origin_receipt"] = str(complete)
    if receipt is not None:
        receipt["native_exit"] = result.returncode
        (output / (stem + "-input.json")).write_text(json.dumps(receipt, indent=2) + "\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
