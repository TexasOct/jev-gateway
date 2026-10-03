#!/usr/bin/env python3
"""Inspect native gateway ownership privately without signaling a process."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import socket
import sys

import psutil


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    home = args.home.resolve()
    evidence: dict = {"home": str(home), "state": "unverified"}
    try:
        port = int(json.loads((home / "models.json").read_text()).get("gateway", {}).get("port", 8000))
        pid_file = home / "run/gateway.pid"
        if pid_file.exists():
            record = json.loads(pid_file.read_text())
            pid, token = record["pid"], record["token"]
            if type(pid) is not int or pid <= 0 or not isinstance(token, str) or not token:
                raise RuntimeError("invalid PID ownership record")
            evidence["pid_record"] = record
            try:
                process = psutil.Process(pid)
                arguments = process.cmdline()
                evidence.update(argv=arguments, executable=process.exe(), created=process.create_time(), status=process.status())
                if process.status() in (psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD):
                    raise RuntimeError("recorded process is zombie or dead; ownership is unverified")
                if len(arguments) != 7 or arguments[1:] != ["-m", "jev_gateway.cli.server", "--home", str(home), "--token", token]:
                    raise RuntimeError("live PID does not match exact module home and token")
                evidence["state"] = "running"
                evidence["fingerprint"] = hashlib.sha256(json.dumps(
                    [pid, process.create_time(), arguments], separators=(",", ":")).encode()).hexdigest()
            except psutil.NoSuchProcess:
                evidence["state"] = "stopped"
        else:
            evidence["state"] = "stopped"
        if evidence["state"] == "stopped":
            # Missing CLI or stale PID is insufficient when a listener remains.
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", port))
        summary = {"state": evidence["state"], "pid": evidence.get("pid_record", {}).get("pid"),
                   "fingerprint": evidence.get("fingerprint")}
        print(json.dumps(summary))
        return 0
    except Exception as error:
        evidence["error_type"] = type(error).__name__
        print(json.dumps({"state": "unverified", "error_type": type(error).__name__}))
        return 1
    finally:
        args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
        args.evidence.chmod(0o600)


if __name__ == "__main__":
    sys.exit(main())
