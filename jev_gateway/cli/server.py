"""Background process entry point with an identifiable, home-bound command line."""

from __future__ import annotations

import argparse
import os


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    os.environ["JEV_GATEWAY_HOME"] = args.home
    from jev_gateway.gateway import run_gateway

    run_gateway()


if __name__ == "__main__":
    main()
