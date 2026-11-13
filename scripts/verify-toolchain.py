"""Read-only installed-tool audit. Version agreement is NOT clean-install integrity."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit(root, env=None):
    root = Path(root).resolve()
    env = dict(os.environ if env is None else env)
    for key in list(env):
        if key.startswith("TSX_") or key in {
            "NODE_OPTIONS",
            "NODE_PATH",
            "ESBUILD_BINARY_PATH",
        }:
            del env[key]
    lock = json.loads((root / "package-lock.json").read_text())
    probe = r"""
      import {createRequire} from 'node:module';
      import {pathToFileURL} from 'node:url';
      import {dirname, join} from 'node:path';
      const req=createRequire(pathToFileURL(join(process.cwd(),'package.json')));
      const tsx=req.resolve('tsx'), esbuild=req.resolve('esbuild');
      const nested=createRequire(tsx).resolve('esbuild');
      const binary=entry=>createRequire(entry).resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`);
      console.log(JSON.stringify({node:process.execPath,version:process.version,platform:process.platform,arch:process.arch,
        tools:{esbuild,tsx,typescript:req.resolve('typescript'),'tsx-esbuild':nested},
        binaries:{esbuild:binary(esbuild),'tsx-esbuild':binary(nested)}}));
    """
    result = subprocess.run(
        ["node", "--input-type=module", "-e", probe],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode:
        raise RuntimeError("Cannot resolve installed build tools: " + result.stderr)
    resolved = json.loads(result.stdout)
    records, mismatches = {}, []

    def record(label, entry):
        entry = Path(entry).resolve()
        directory = entry.parent
        while not (directory / "package.json").is_file():
            if directory == directory.parent:
                raise RuntimeError("Tool has no package identity: " + str(entry))
            directory = directory.parent
        manifest = json.loads((directory / "package.json").read_text())
        # node_modules in the preserved copy is a symlink to the unchanged
        # checkout installation. Compare its relative package path, not /tmp.
        modules = (root / "node_modules").resolve()
        key = "node_modules/" + directory.relative_to(modules).as_posix()
        expected = lock.get("packages", {}).get(key)
        fields = ["version", "dependencies", "optionalDependencies", "engines", "bin"]
        differences = [
            field
            for field in fields
            if expected is None or manifest.get(field) != expected.get(field)
        ]
        if expected and "bin" in differences:
            # npm lock normalizes a single string bin into a package-name map.
            actual = manifest.get("bin")
            if isinstance(actual, str) and expected.get("bin") == {
                manifest["name"].split("/")[-1]: actual.removeprefix("./")
            }:
                differences.remove("bin")
            elif isinstance(actual, dict) and {
                key: value.removeprefix("./") for key, value in actual.items()
            } == expected.get("bin"):
                differences.remove("bin")
        files = {}
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(directory)
            if "node_modules" not in relative.parts and path.is_file():
                files[str(relative)] = digest(path)
        tree_hash = hashlib.sha256(
            json.dumps(files, sort_keys=True).encode()
        ).hexdigest()
        records[label] = {
            "name": manifest.get("name"),
            "installed": manifest.get("version"),
            "expected": expected.get("version") if expected else None,
            "lock_key": key,
            "entry": str(entry),
            "package": str(directory),
            "entry_sha256": digest(entry),
            "tree_sha256": tree_hash,
            "files": files,
            "lock_integrity": expected.get("integrity") if expected else None,
            "mismatched_fields": differences,
        }
        if differences:
            mismatches.append({"tool": label, "fields": differences})
        return directory, manifest

    for label, entry in resolved["tools"].items():
        directory, manifest = record(label, entry)
        if label in {"esbuild", "tsx", "typescript"}:
            command = "tsc" if label == "typescript" else label
            binary = manifest["bin"]
            relative = binary if isinstance(binary, str) else binary[command]
            if (root / "node_modules/.bin" / command).resolve() != (
                directory / relative
            ).resolve():
                mismatches.append({"tool": label, "fields": ["cli-target"]})
    for label, binary in resolved["binaries"].items():
        record(label + "-native", binary)
        version = subprocess.run(
            [binary, "--version"], env=env, capture_output=True, text=True, timeout=10
        )
        if version.returncode or version.stdout.strip() != records[label]["installed"]:
            mismatches.append(
                {"tool": label + "-native", "fields": ["executable-version"]}
            )
    return {
        "status": "mismatch" if mismatches else "matched-installed-versions",
        "mismatches": mismatches,
        "tools": records,
        "node": {key: resolved[key] for key in ["node", "version", "platform", "arch"]},
        "node_sha256": digest(Path(resolved["node"])),
        "lock_sha256": digest(root / "package-lock.json"),
        "scope": "Lockfile version/dependency metadata and resolved CLI/native identity; installed contents pinned by local hashes.",
        "not_proven": "Registry tarball integrity, clean-install reproducibility, or external runtime/SDK dependency integrity. No install/repair performed.",
    }


if __name__ == "__main__":
    report = audit(Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd())
    print(json.dumps(report, indent=2))
    raise SystemExit(report["status"] != "matched-installed-versions")
