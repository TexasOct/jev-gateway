"""Seed real credential records while retaining the original listing/socket guard."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys


def main() -> int:
    helper = Path(os.environ["PUBLIC_ACCEPT_HELPER"])
    assert not (helper / "jev_gateway").exists()
    sys.path.insert(0, str(helper))
    path = helper / "tests/fixtures/real-gateway/server.py"
    spec = importlib.util.spec_from_file_location("captured_listing_server", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original_document = module.build_document
    original_guard = module.install_socket_guard
    values = {"REAL_GATEWAY_KEY": "real-gateway-synthetic", "TEST_PROVIDER_KEY": "real-provider-synthetic",
              "PUBLIC_AWS_ID": "synthetic-existing-id", "PUBLIC_AWS_SECRET": "synthetic-existing-secret",
              "PUBLIC_AWS_TOKEN": "synthetic-existing-token",
              "PUBLIC_VERTEX_JSON": '{"type":"service_account","private_key":"synthetic-existing-vertex"}'}
    scratch_holder: list[Path] = []

    def document(scratch: Path) -> dict:
        scratch_holder.append(scratch)
        data = original_document(scratch)
        data["providers"].extend([
            {"id": "installed-aws", "display_name": "Installed AWS", "type": "bedrock", "api_base": None,
             "params": {"aws_region_name": "us-east-1"}, "param_env": {
                 "aws_access_key_id": "PUBLIC_AWS_ID", "aws_secret_access_key": "PUBLIC_AWS_SECRET", "aws_session_token": "PUBLIC_AWS_TOKEN"}},
            {"id": "installed-vertex", "display_name": "Installed Vertex", "type": "vertex_ai", "api_base": None,
             "params": {"vertex_project": "synthetic-project", "vertex_location": "us-central1"},
             "param_env": {"vertex_credentials": "PUBLIC_VERTEX_JSON"}},
        ])
        return data

    def guard(port: int) -> list[str]:
        store = scratch_holder[0] / "credentials.json"
        store.write_text(json.dumps({"version": 1, "values": values}) + "\n")
        store.chmod(0o600)
        return original_guard(port)

    module.build_document = document
    module.install_socket_guard = guard
    return module.main()


if __name__ == "__main__":
    raise SystemExit(main())
