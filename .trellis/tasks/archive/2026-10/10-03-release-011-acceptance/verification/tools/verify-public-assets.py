#!/usr/bin/env python3
"""Download the pinned public release and verify its source and CI identity."""
from __future__ import annotations

import argparse
import configparser
from email.parser import BytesParser
import json
from pathlib import Path
import re
import subprocess
import urllib.request
import zipfile

from acceptance_common import digest, private_directory, require, write_json


def command(argv: list[str], cwd: Path | None = None) -> bytes:
    result = subprocess.run(argv, cwd=cwd, capture_output=True, timeout=90)
    require(result.returncode == 0, "read-only release identity command failed")
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="0.1.1")
    parser.add_argument("--repo", default="TexasOct/jev-gateway")
    parser.add_argument("--source-repo", type=Path, required=True)
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    parser.add_argument("--reference-wheel", type=Path,
                        help="CI build wheel, or independently validated candidate wheel; compare all package files")
    args = parser.parse_args()
    require(bool(re.fullmatch(r"\d+\.\d+\.\d+", args.version)), "stable version required")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", args.expected_commit)), "full expected commit required")
    require(bool(re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo)), "invalid repository")
    require(args.run_id.isdigit(), "numeric workflow run ID required")
    root = private_directory(args.evidence_dir)
    assets = private_directory(root / "public-assets")
    require(not any(assets.iterdir()), "use a fresh public asset evidence directory")
    result = {"success": False, "version": args.version, "assets_dir": str(assets)}
    try:
        def api(path: str) -> dict:
            return json.loads(command(["gh", "api", path]))

        tag = "v" + args.version
        release = api(f"repos/{args.repo}/releases/tags/{tag}")
        latest = api(f"repos/{args.repo}/releases/latest")
        run = json.loads(command(["gh", "run", "view", args.run_id, "--repo", args.repo,
                                  "--json", "headSha,conclusion,jobs,url,event,workflowName"]))
        require(run["headSha"] == args.expected_commit and run["conclusion"] == "success", "CI source and success")
        require(run["workflowName"] == "Publish release" and run["event"] == "push", "tag-triggered release workflow")
        require(len(run["jobs"]) == 4 and all(job["conclusion"] == "success" for job in run["jobs"]),
                "all four release CI jobs succeeded")
        require(release["tag_name"] == tag and not release["draft"] and not release["prerelease"], "stable public release")
        require(release["id"] == latest["id"], "release is latest stable")
        refs = command(["git", "ls-remote", f"https://github.com/{args.repo}.git",
                        f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"], args.source_repo).decode().splitlines()
        refmap = {line.split()[1]: line.split()[0] for line in refs}
        require(refmap.get(f"refs/tags/{tag}^{{}}", refmap.get(f"refs/tags/{tag}")) == args.expected_commit,
                "public tag points to expected commit")
        wheel_name = f"jev_gateway-{args.version}-py3-none-any.whl"
        names = {"install.sh", "install.sh.sha256", wheel_name, wheel_name + ".sha256"}
        require(len(release["assets"]) == 4 and {item["name"] for item in release["assets"]} == names,
                "exact four public assets")
        base = f"https://github.com/{args.repo}/releases/download/{tag}/"
        opener = urllib.request.build_opener()

        def download(url: str, path: Path) -> None:
            require(url.startswith("https://"), "HTTPS download required")
            with opener.open(url, timeout=90) as response:
                require(response.status == 200 and response.url.startswith("https://"), "public download HTTP success")
                with path.open("xb") as target:
                    while block := response.read(1024 * 1024):
                        target.write(block)
            path.chmod(0o600)

        for item in release["assets"]:
            require(item["browser_download_url"] == base + item["name"], "pinned public asset URL")
            download(item["browser_download_url"], assets / item["name"])
            require(item.get("digest") == "sha256:" + digest(assets / item["name"]),
                    "GitHub digest matches each of the four public assets")
        hashes = {}
        for name in ("install.sh", wheel_name):
            hashes[name] = digest(assets / name)
            require((assets / (name + ".sha256")).read_bytes() == f"{hashes[name]}  {name}\n".encode(),
                    "exact SHA256 sidecar")
            declared = next(item.get("digest") for item in release["assets"] if item["name"] == name)
            require(declared == "sha256:" + hashes[name], "GitHub asset digest")
        download(f"https://github.com/{args.repo}/releases/latest/download/install.sh", assets / "latest-install.sh")
        require((assets / "latest-install.sh").read_bytes() == (assets / "install.sh").read_bytes(), "latest installer equals pinned")
        template = command(["git", "show", f"{args.expected_commit}:scripts/install.sh"], args.source_repo)
        require(template.count(b"__JEV_RELEASE_TAG__") == 1, "single installer identity placeholder")
        require((assets / "install.sh").read_bytes() == template.replace(b"__JEV_RELEASE_TAG__", tag.encode()),
                "public installer equals stamped tagged source")
        command(["sh", "-n", str(assets / "install.sh")])
        with zipfile.ZipFile(assets / wheel_name) as archive:
            entries = archive.namelist()
            require(len(entries) == len(set(entries)), "no duplicate wheel entries")
            prefix = f"jev_gateway-{args.version}.dist-info/"
            metadata_paths = [name for name in entries if name.endswith("/METADATA")]
            require(metadata_paths == [prefix + "METADATA"], "single versioned wheel metadata")
            metadata = BytesParser().parsebytes(archive.read(metadata_paths[0]))
            for key, expected in {"Name": "jev-gateway", "Version": args.version, "Requires-Python": ">=3.12",
                                  "License-Expression": "AGPL-3.0-or-later"}.items():
                require(metadata.get_all(key) == [expected], "wheel " + key)
            require("psutil>=6.0" in metadata.get_all("Requires-Dist", []), "wheel ownership dependency")
            console = configparser.ConfigParser()
            console.read_string(archive.read(prefix + "entry_points.txt").decode())
            require(dict(console["console_scripts"]) == {"jev": "jev_gateway.cli.main:main",
                    "jev-gateway": "jev_gateway.gateway:run_gateway"}, "wheel entry points")
            require(archive.read(prefix + "licenses/LICENSE") == command(
                ["git", "show", f"{args.expected_commit}:LICENSE"], args.source_repo), "packaged license bytes")
            source_files = command(["git", "ls-tree", "-r", "--name-only", args.expected_commit, "jev_gateway"],
                                   args.source_repo).decode().splitlines()
            source_files = {name for name in source_files if name.endswith(".py") or name.startswith("jev_gateway/templates/")}
            packaged = {name for name in entries if name.startswith("jev_gateway/") and not name.endswith("/")}
            require({name for name in packaged if not name.startswith("jev_gateway/static/")} == source_files,
                    "complete Python and template file set")
            for name in sorted(source_files):
                require(archive.read(name) == command(["git", "show", f"{args.expected_commit}:{name}"], args.source_repo),
                        "Python or template differs from tagged source")
            shell = archive.read("jev_gateway/static/index.html").decode()
            links = re.findall(r'(?:src|href)=["\'](/dashboard/assets/[^"\']+)["\']', shell)
            require(any(link.endswith(".js") for link in links) and any(link.endswith(".css") for link in links),
                    "bundled dashboard JS and CSS")
            require(all(re.fullmatch(r"/dashboard/assets/[A-Za-z0-9_-]+\.(?:js|css)", link)
                        and bool(archive.read("jev_gateway/static/" + link.removeprefix("/dashboard/"))) for link in links),
                    "bundled dashboard references resolve")
            static_reference = False
            if args.reference_wheel:
                with zipfile.ZipFile(args.reference_wheel.resolve(strict=True)) as reference:
                    reference_files = {name for name in reference.namelist() if name.startswith("jev_gateway/") and not name.endswith("/")}
                    require(reference_files == packaged, "public and reference package file sets")
                    require(all(reference.read(name) == archive.read(name) for name in packaged), "all public package bytes equal reference")
                static_reference = True
        result.update(success=True, tag=tag, commit=args.expected_commit, release_id=release["id"],
                      url=release["html_url"], run_url=run["url"], sha256=hashes,
                      jobs=[{"name": job["name"], "conclusion": job["conclusion"]} for job in run["jobs"]],
                      source_files_compared=len(source_files), full_package_reference_compared=static_reference)
        write_json(root / "release.json", release)
        write_json(root / "workflow.json", run)
        print("PASS public assets verified; " + str(len(source_files)) + " tagged source files compared")
        return 0
    except Exception as error:
        result["error_type"] = type(error).__name__
        if isinstance(error, RuntimeError):
            result["failed_check"] = str(error)
        print("FAIL public asset verification; inspect private evidence", flush=True)
        return 1
    finally:
        write_json(root / "public-assets-result.json", result)


if __name__ == "__main__":
    raise SystemExit(main())
