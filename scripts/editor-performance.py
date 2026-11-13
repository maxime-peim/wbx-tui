"""Optional v1 benchmark: copied native runtime, private PTYs, no backend or account."""

import argparse
import errno
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import statistics
import struct
import subprocess
import tempfile
import termios
import time

VERSION = 1
GUARDS = [
    "projection-performance",
    "structural-performance",
    "paging-performance",
    "status-performance",
]


def bounded(low, high):
    def parse(value):
        number = int(value)
        if not low <= number <= high:
            raise argparse.ArgumentTypeError(f"expected {low}..{high}")
        return number

    return parse


def environment(home, root, result):
    # Allowlist, not a denylist: no inherited WBX opt-ins, OAuth, NODE_OPTIONS,
    # VIMINIT, plugins, display server, tmux or real-terminal graphics routing.
    env = {
        key: value
        for key, value in os.environ.items()
        if key in ["PATH", "LANG", "LC_ALL", "TZ"]
    }
    home.mkdir()
    config = home / "config.json"
    config.write_text("{}\n")
    config.chmod(0o600)
    env.update(
        HOME=str(home),
        XDG_CONFIG_HOME=str(home / "config"),
        XDG_DATA_HOME=str(home / "data"),
        XDG_CACHE_HOME=str(home / "cache"),
        XDG_STATE_HOME=str(home / "state"),
        TMPDIR=str(home),
        WBX_CONFIG=str(config),
        WBX_EDITOR_ROOT=str(root),
        WBX_EDITOR_RESULT=str(result),
        TERM="xterm-256color",
    )
    return env


def private_editor(binary, editor, root, fixture, env):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 60, 160, 960, 1280))

    def claim_tty():
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    command = [
        binary,
        "-u" if editor == "nvim" else "-Nu",
        "NONE",
        "-i",
        "NONE",
        "-n",
        "-S",
        str(root / "test/editor" / (fixture + ".vim")),
    ]
    start = time.monotonic()
    process = None
    output_bytes = 0
    try:
        process = subprocess.Popen(
            command,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            cwd=root,
            env=env,
            preexec_fn=claim_tty,
        )
        os.close(slave)
        slave = -1
        pending = b""
        replies = {
            b"\x1b[6n": b"\x1b[1;1R",
            b"\x1b[c": b"\x1b[?1;2c",
            b"\x1b[>c": b"\x1b[>0;0;0c",
            b"\x1b[14t": b"\x1b[4;960;1280t",
            b"\x1b[16t": b"\x1b[6;16;8t",
            b"\x1b[18t": b"\x1b[8;60;160t",
        }
        while True:
            if time.monotonic() - start > 180:
                raise RuntimeError("private editor deadline exceeded")
            if not select.select([master], [], [], 0.05)[0]:
                if process.poll() is not None:
                    break
                continue
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            output_bytes += len(data)
            pending += data
            for query, answer in replies.items():
                while query in pending:
                    pending = pending.replace(query, b"", 1)
                    os.write(master, answer)
            pending = pending[-128:]
        code = process.wait(timeout=2)
        result = json.loads(Path(env["WBX_EDITOR_RESULT"]).read_text())
        if code or result.get("errors"):
            # Only synthetic fixture diagnostics, never retain a terminal capture.
            raise RuntimeError(f"{editor}/{fixture} failed: {result.get('errors', [])}")
        return result, {
            "wall_ms": (time.monotonic() - start) * 1000,
            "terminal_bytes": output_bytes,
        }
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=2)
        if slave >= 0:
            os.close(slave)
        os.close(master)


def distribution(values):
    if not values or not all(
        isinstance(value, (int, float)) and math.isfinite(value) and value >= 0
        for value in values
    ):
        raise ValueError("invalid timing samples")
    ordered = sorted(values)
    return {
        "n": len(values),
        "min": min(values),
        "median": statistics.median(values),
        "p95": ordered[math.ceil(0.95 * len(values)) - 1],
        "max": max(values),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--editor", choices=["nvim", "vim", "both"], default="both")
    parser.add_argument(
        "--messages",
        type=int,
        nargs="+",
        choices=[50, 200, 500],
        default=[50, 200, 500],
    )
    parser.add_argument("--samples", type=bounded(3, 31), default=7)
    parser.add_argument("--repeats", type=bounded(1, 4), default=2)
    parser.add_argument(
        "--attachments",
        action="store_true",
        help="also measure five synthetic maximum-original opens per inline/chunk mode; requires installed Node dependencies",
    )
    parser.add_argument(
        "--output", type=Path, help="new evidence directory (never overwrite)"
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    editors = ["nvim", "vim"] if args.editor == "both" else [args.editor]
    binaries = {editor: shutil.which(editor) for editor in editors}
    if not all(binaries.values()):
        parser.error("a requested editor is unavailable; no missing-editor pass")
    if args.attachments and (
        not shutil.which("node") or not (root / "node_modules/tsx").is_dir()
    ):
        parser.error(
            "--attachments requires existing Node/tsx dependencies; nothing is installed automatically"
        )
    if args.output:
        stage = args.output.resolve()
        stage.mkdir(parents=True, exist_ok=False)
    else:
        Path("/tmp/opencode").mkdir(exist_ok=True)
        stage = Path(
            tempfile.mkdtemp(prefix="wbx-editor-performance-v1-", dir="/tmp/opencode")
        )
    print(f"Evidence: {stage}", flush=True)
    project = stage / "project"
    names = (
        subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root,
        )
        .decode()
        .strip("\0")
        .split("\0")
    )
    # Snapshot the native runtime + synthetic fixtures only. No compiled backend,
    # dependency install, user config or source-controller/mixed-bundle execution.
    prefixes = (
        "autoload/",
        "plugin/",
        "lua/",
        "syntax/",
        "ftplugin/",
        "after/",
        "test/editor/",
    )
    if args.attachments:
        prefixes += ("src/", "scripts/", "test/")
    files = sorted(
        {
            name
            for name in names
            if name.startswith(prefixes) and (root / name).is_file()
        }
    )
    files.append("scripts/editor-performance.py")
    if args.attachments:
        files.extend(["package.json", "tsconfig.json"])
    manifest = {}
    for name in files:
        data = (root / name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        target = project / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    if args.attachments:
        (project / "node_modules").symlink_to(
            root / "node_modules", target_is_directory=True
        )
    (stage / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    results = {
        "version": VERSION,
        "units": "milliseconds",
        "rooms": 435,
        "samples": args.samples,
        "repeats": args.repeats,
        "editors": {},
        "guards": [],
        "runs": [],
        "transfers": [],
    }
    for editor, binary in binaries.items():
        version_env = environment(
            stage / (editor + "-version-home"), project, stage / "unused"
        )
        version = subprocess.check_output(
            [binary, "--version"], env=version_env, text=True, timeout=5
        ).splitlines()[0]
        results["editors"][editor] = version
        for fixture in GUARDS:
            result_file = stage / f"{editor}-{fixture}.json"
            env = environment(stage / f"{editor}-{fixture}-home", project, result_file)
            _, process = private_editor(binary, editor, project, fixture, env)
            results["guards"].append(
                {"editor": editor, "fixture": fixture, "passed": True, **process}
            )
        for repeat in range(args.repeats):
            # Reverse workload order on alternate runs, retain per-process values.
            sizes = args.messages if repeat % 2 == 0 else list(reversed(args.messages))
            for messages in sizes:
                label = f"{editor}-{messages}-{repeat + 1}"
                result_file = stage / (label + ".json")
                env = environment(stage / (label + "-home"), project, result_file)
                env.update(
                    WBX_PERF_MESSAGES=str(messages), WBX_PERF_SAMPLES=str(args.samples)
                )
                data, process = private_editor(
                    binary, editor, project, "performance", env
                )
                if (
                    data["version"] != VERSION
                    or data["messages"] != messages
                    or data["rooms"] != 435
                ):
                    raise ValueError("unexpected benchmark schema/workload")
                if any(
                    len(samples) != args.samples for samples in data["samples"].values()
                ):
                    raise ValueError("missing benchmark samples")
                row = {
                    "editor": editor,
                    "messages": messages,
                    "repeat": repeat + 1,
                    "startup_runtime_layout_ms": data["startup_runtime_layout_ms"],
                    "initial_publish_redraw_ms": data["initial_publish_redraw_ms"],
                    "distributions": {
                        name: distribution(values)
                        for name, values in data["samples"].items()
                    },
                    "work": data["work"],
                    **process,
                }
                results["runs"].append(row)
                print(f"{label}: PASS", flush=True)
        if args.attachments:
            for mode in ["inline", "chunks"]:
                label = f"{editor}-transfer-{mode}"
                result_file = stage / (label + ".json")
                env = environment(stage / (label + "-home"), project, result_file)
                audit = stage / (label + "-audit.jsonl")
                audit.write_text("")
                env.update(
                    WBX_NODE=shutil.which("node"),
                    WBX_EDITOR_AUDIT=str(audit),
                    WBX_CHUNK_BENCH="1",
                    WBX_CHUNK_INLINE="1" if mode == "inline" else "0",
                )
                data, process = private_editor(
                    binary, editor, project, "chunked-attachments", env
                )
                rows = [json.loads(line) for line in audit.read_text().splitlines()]
                gets = sum(
                    row.get("path", "").startswith("/v1/contents/") for row in rows
                )
                pulls = sum(
                    row.get("rpc") == "messages.attachmentChunk" for row in rows
                )
                if (
                    gets != 5
                    or pulls != (615 if mode == "chunks" else 0)
                    or len(data["work"]) != 5
                ):
                    raise ValueError("unexpected synthetic transfer work counts")
                expected = {
                    "bytes": 6_000_000,
                    "sha256": hashlib.sha256(bytes([255]) * 6_000_000).hexdigest(),
                }
                for iteration in range(1, 6):
                    if (
                        json.loads(
                            Path(str(result_file) + f".bench-{iteration}").read_text()
                        )
                        != expected
                    ):
                        raise ValueError("synthetic handler received incorrect bytes")
                results["transfers"].append(
                    {
                        "editor": editor,
                        "mode": mode,
                        "gets": gets,
                        "pulls": pulls,
                        "distributions": {
                            key.replace("_us", "_ms"): distribution(
                                [row[key] / 1000 for row in data["work"]]
                            )
                            for key in ["total_us", "maximum_timer_gap_us"]
                        },
                        **process,
                    }
                )
                print(f"{label}: PASS", flush=True)
    results["source_unchanged"] = all(
        hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
        for name, digest in manifest.items()
    )
    results["copy_unchanged"] = all(
        hashlib.sha256((project / name).read_bytes()).hexdigest() == digest
        for name, digest in manifest.items()
    )
    (stage / "summary.json").write_text(json.dumps(results, indent=2) + "\n")
    if not results["source_unchanged"] or not results["copy_unchanged"]:
        raise RuntimeError("source changed during measurement")
    print(
        "PASS: synthetic guards and distributions; no live/provider/graphics latency claim."
    )


if __name__ == "__main__":
    main()
