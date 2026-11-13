"""Offline acceptance in a preserved copy; never build, repair or activate checkout."""

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from importlib.util import module_from_spec, spec_from_file_location


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_environment(home):
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("WBX_", "TSX_"))
        and not key.lower().startswith("npm_config_")
        and key
        not in {
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "DBUS_SESSION_BUS_ADDRESS",
            "VIMRUNTIME",
            "TMUX",
            "TMUX_PANE",
            "NODE_OPTIONS",
            "NODE_PATH",
            "ESBUILD_BINARY_PATH",
        }
    }
    env.update(
        HOME=str(home),
        XDG_CONFIG_HOME=str(home / "config"),
        XDG_DATA_HOME=str(home / "data"),
        XDG_CACHE_HOME=str(home / "cache"),
        XDG_STATE_HOME=str(home / "state"),
        TMPDIR="/tmp/opencode",
        WBX_STRICT_EDITORS="1",
        WBX_TEST_SOURCE_BACKEND="0",
        npm_config_update_notifier="false",
    )
    for name in ["WBX_VIM", "WBX_NVIM"]:
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--focused",
        action="store_true",
        help="Affected regression tier, not full acceptance",
    )
    args = parser.parse_args()
    root = Path.cwd().resolve()
    out = Path(tempfile.mkdtemp(prefix="wbx-isolated-", dir="/tmp/opencode"))
    project, home = out / "project", out / "home"
    project.mkdir()
    home.mkdir(mode=0o700)
    env = private_environment(home)
    git_before = {
        "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root)
        .decode()
        .strip(),
        "staged": subprocess.check_output(
            ["git", "diff", "--cached", "--binary"], cwd=root
        ).decode(),
    }
    names = sorted(
        set(
            filter(
                None,
                subprocess.check_output(
                    [
                        "git",
                        "ls-files",
                        "--cached",
                        "--others",
                        "--exclude-standard",
                        "-z",
                    ],
                    cwd=root,
                )
                .decode()
                .split("\0"),
            )
        )
    )
    sources = {}
    for name in names:
        source = root / name
        if not source.is_file():
            continue
        if source.is_symlink():
            raise RuntimeError("Unsupported source symlink: " + name)
        sources[name] = digest(source)
        target = project / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for name in ["node_modules", "optional/read-status-sdk/node_modules"]:
        source = root / name
        if source.is_dir():
            (project / name).symlink_to(source, target_is_directory=True)
    artifacts = {}
    backup = out / "checkout-artifacts-before"
    backup.mkdir()
    for source in sorted((root / "dist").iterdir()):
        if not source.is_file() or source.is_symlink():
            raise RuntimeError("Unsupported artifact: " + str(source))
        artifacts[str(source.relative_to(root))] = digest(source)
        shutil.copy2(source, backup / source.name)
    (out / "sources.json").write_text(json.dumps(sources, indent=2) + "\n")
    (out / "checkout-artifacts-before.json").write_text(
        json.dumps(artifacts, indent=2) + "\n"
    )
    results, counts, commands, versions, dimensions, backend_commands = (
        {},
        {},
        {},
        {},
        {},
        {},
    )
    backend_audits = out / "backend-audits"
    backend_audits.mkdir(mode=0o700)
    skips = {}
    print("Isolated verification evidence: " + str(out), flush=True)

    def run(name, command, extra=None):
        commands[name] = command
        audit = backend_audits / (name + ".jsonl")
        dimensions[name] = {**(extra or {}), "WBX_TEST_BACKEND_AUDIT": str(audit)}
        with (out / (name + ".log")).open("w") as log:
            try:
                result = subprocess.run(
                    command,
                    cwd=project,
                    env={**env, **dimensions[name]},
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    timeout=420,
                )
                code = result.returncode
            except subprocess.TimeoutExpired:
                code = 124
            except OSError as error:
                log.write(str(error) + "\n")
                code = 127
        text = (out / (name + ".log")).read_text()
        results[name] = code
        counts[name] = {
            key: int(value)
            for key, value in re.findall(
                r"(?:ℹ|#)\s+(tests|pass|fail|skipped|cancelled)\s+(\d+)", text
            )
        }
        skips[name] = [line.strip() for line in text.splitlines() if "# SKIP" in line]
        print(name, code, counts[name], flush=True)
        if audit.exists():
            records = [json.loads(line) for line in audit.read_text().splitlines()]
            for record in records:
                argv = record["argv"]
                record["mode"] = (
                    "source"
                    if any(Path(arg).name == "editor-main.ts" for arg in argv)
                    else "bundle"
                    if any(
                        (project / arg).resolve() == project / "dist/editor-main.js"
                        for arg in argv
                    )
                    else "foreign-bundle"
                    if any(Path(arg).name == "editor-main.js" for arg in argv)
                    else "fixture"
                )
            backend_commands[name] = records

    for name, command in {
        "node": ["node", "--version"],
        "python": ["python3", "--version"],
        "nvim": [env.get("WBX_NVIM", "nvim"), "--version"],
        "vim": [env.get("WBX_VIM", "vim"), "--version"],
    }.items():
        try:
            result = subprocess.run(
                command, env=env, capture_output=True, text=True, timeout=10
            )
            versions[name] = {
                "code": result.returncode,
                "version": result.stdout.splitlines()[:3],
            }
        except (OSError, subprocess.TimeoutExpired) as error:
            versions[name] = {"error": str(error)}
    spec = spec_from_file_location(
        "wbx_toolchain", project / "scripts/verify-toolchain.py"
    )
    toolchain = module_from_spec(spec)
    spec.loader.exec_module(toolchain)

    def audit_tools():
        try:
            return toolchain.audit(project, env)
        except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
            return {"status": "unavailable", "error": str(error)}

    before_tools = audit_tools()
    (out / "toolchain-before.json").write_text(
        json.dumps(before_tools, indent=2) + "\n"
    )
    results["installed-toolchain"] = int(
        before_tools["status"] != "matched-installed-versions"
    )
    node = ["node", "--import", "tsx", "--test", "--test-timeout=120000"]
    if not any(results.values()):
        run("check", ["npm", "run", "check"])
        run("build", ["node", "--import", "tsx", "scripts/build.ts"])
    if not any(results.values()):
        core = sorted(
            str(path.relative_to(project))
            for path in (project / "test").glob("*.test.ts")
        )
        native = sorted(
            str(path.relative_to(project))
            for path in (project / "test/editor").glob("*.test.ts")
            if path.name not in {"draft-persistence.test.ts", "meeting.test.ts"}
        )
        inventory = json.loads((project / "test/editor/fixtures.json").read_text())
        pattern = "/(setup-owner|setup-workflows|completion|selection-owner|selection-workflows|render-owner|render-workflows|workspace-owner|workspace-workflows|connection|connection-workflows|rpc-channel|rpc-workflows|reactions|reaction-boundaries|reaction-history|reaction-anchors|reaction-retention|reaction-source|reaction-quiet|reaction-status|reaction-unresolved|reaction-text|reaction-return|read-by|unread-provenance|catalogue|native-choosers|native-confirmations|upcoming-meetings|presence-repaint|notifications|notification-visibility|navigation-plan|local-sections|members|attachments|integrations|conversations|mutation-recovery|conversation-recovery|sdk-native-recovery|feature-negotiation|recovery-safety|mention-consent|mention-picker|viewport-work|picker-safety|policy-contracts|saved-drafts|uploads|draft-persistence|delivery-resolution|people-details|people-popup|people-ownership|people-viewport|people-spaces|people-cache|mention-wrapping|ownership|replies|ui|history-timestamps|history-syntax-buckets|history-features|reading|thread-subtrees|ui-review|meeting-workflows|list-boundaries|action-catalogue|message-query-boundaries|conversation-polish|projection-performance|structural-performance):"
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            jobs = [pool.submit(run, "core", node + ["--test-concurrency=4"] + core)]
            for editor in ["Neovim", "Vim"]:
                match = (
                    ["--test-name-pattern=^" + editor + pattern] if args.focused else []
                )
                jobs.append(
                    pool.submit(
                        run,
                        "native-" + editor.lower(),
                        node + match + native,
                        {"WBX_EDITOR_TEST_ONLY": editor},
                    )
                )
            for job in concurrent.futures.as_completed(jobs):
                job.result()
        if not args.focused:
            for editor in ["neovim", "vim"]:
                count = counts["native-" + editor]
                key = "nvim" if editor == "neovim" else "vim"
                expected = sum(
                    key
                    in inventory["editorOverrides"].get(
                        name, inventory["defaultEditors"]
                    )
                    for names in inventory["suites"].values()
                    for name in names
                )
                results["required-native-" + editor] = int(
                    bool(results["native-" + editor])
                    or count.get("tests") != expected
                    or bool(count.get("skipped"))
                )
        run("editor-restarts", node + ["test/editor/draft-persistence.test.ts"])
        run(
            "lazyvim",
            node
            + sorted(
                str(path.relative_to(project))
                for path in (project / "test/lazyvim").glob("*.test.ts")
            ),
        )
        sdk = sorted(
            {
                str(path.relative_to(project))
                for pattern in [
                    "read-status*.test.ts",
                    "people*.test.ts",
                    "spaces-cache*.test.ts",
                    "reactions-sdk.test.ts",
                ]
                for path in (project / "test").glob(pattern)
            }
        )
        run("sdk-cache", node + sdk, {"WBX_READ_STATUS_SDK_TEST": "1"})
        research = sorted(
            str(path.relative_to(project))
            for path in (project / "test/research").glob("*.test.ts")
        )
        run("research-reactions", node + research, {"WBX_REACTIONS_RESEARCH_TEST": "1"})
        run(
            "research-reactions-default",
            node + research,
            {"WBX_REACTIONS_RESEARCH_TEST": "0"},
        )
        # Explicit inventory: five simulations, direct-execution opt-in guard,
        # and three optional SDK/source/transport checks. Skips cannot stand in
        # for executing the pinned SDK candidate.
        for tier, passed, skipped in [
            ("research-reactions", 9, 0),
            ("research-reactions-default", 6, 3),
        ]:
            count = counts[tier]
            results["required-" + tier] = int(
                bool(results[tier])
                or count.get("tests") != 9
                or count.get("pass") != passed
                or count.get("skipped") != skipped
                or bool(count.get("fail"))
                or bool(count.get("cancelled"))
            )
        messaging = sorted(
            {
                str(path.relative_to(project))
                for pattern in ["messaging*.test.ts", "extensions*.test.ts"]
                for path in (project / "test").glob(pattern)
            }
        )
        run("messaging-compatibility", node + messaging, {"WBX_MESSAGING_TEST": "1"})
        run("browser-synthetic", node + ["test/browser/controls-synthetic.test.ts"])
        drawn = sorted(
            name
            for names in inventory["suites"].values()
            for name in names
            if name not in inventory["headlessOnly"]
        )
        if args.focused:
            drawn = [
                name
                for name in drawn
                if name
                in {
                    "native-choosers",
                    "rpc-channel",
                    "rpc-workflows",
                    "connection",
                    "connection-workflows",
                    "workspace-owner",
                    "workspace-workflows",
                    "render-owner",
                    "render-workflows",
                    "selection-owner",
                    "selection-workflows",
                    "setup-owner",
                    "setup-workflows",
                    "completion",
                    "native-confirmations",
                    "upcoming-meetings",
                    "mention-picker",
                    "reactions",
                    "reaction-boundaries",
                    "reaction-history",
                    "reaction-anchors",
                    "reaction-retention",
                    "reaction-source",
                    "reaction-quiet",
                    "reaction-status",
                    "reaction-unresolved",
                    "reaction-text",
                    "reaction-return",
                    "read-by",
                    "unread-provenance",
                    "catalogue",
                    "presence-repaint",
                    "attachments",
                    "local-sections",
                    "mutation-recovery",
                    "conversation-recovery",
                    "recovery-safety",
                    "draft-persistence",
                    "people-viewport",
                    "people-details",
                    "people-popup",
                    "people-ownership",
                    "people-spaces",
                    "people-cache",
                    "notification-visibility",
                    "navigation-plan",
                    "mention-wrapping",
                    "mention-consent",
                    "viewport-work",
                    "ui-review",
                    "ui",
                    "sdk-native-recovery",
                    "history-timestamps",
                    "history-syntax-buckets",
                    "history-features",
                    "reading",
                    "replies",
                    "thread-subtrees",
                    "meeting-workflows",
                    "activity",
                    "list-boundaries",
                    "action-catalogue",
                    "message-query-boundaries",
                    "picker-safety",
                    "saved-drafts",
                }
            ]
        for editor in ["nvim", "vim"]:
            for fixture in drawn:
                if editor not in inventory["editorOverrides"].get(
                    fixture, inventory["defaultEditors"]
                ):
                    continue
                run(
                    "drawn-" + editor + "-" + fixture,
                    ["python3", "test/editor/drawn.py", fixture, "--editor", editor],
                )
            helpdir = out / ("help-" + editor)
            helpdir.mkdir()
            shutil.copy2(project / "doc/wbx-tui.txt", helpdir / "wbx-tui.txt")
            binary = env.get("WBX_NVIM" if editor == "nvim" else "WBX_VIM", editor)
            flags = (
                ["--headless", "-u", "NONE", "-i", "NONE", "-n"]
                if editor == "nvim"
                else ["-Nu", "NONE", "-i", "NONE", "-n", "-es"]
            )
            run(
                "help-" + editor,
                [binary] + flags + ["-c", "helptags " + str(helpdir), "-c", "qa!"],
            )
        run("docs", node + ["test/documentation.test.ts"])
        run(
            "candidate-bundle-integrity",
            ["node", "--import", "tsx", "scripts/verify-bundles.ts", "--json"],
        )
    for name in ["native-neovim", "native-vim", "editor-restarts"]:
        if name in results:
            records = backend_commands.get(name, [])
            results["backend-evidence-" + name] = int(
                not any(
                    record["mode"] == "bundle" and record["started"]
                    for record in records
                )
                or any(
                    record["mode"] in ["source", "foreign-bundle"]
                    or record["started"]
                    and not record["argv"]
                    for record in records
                )
            )
    results["no-source-or-foreign-backend"] = int(
        any(
            record["mode"] in ["source", "foreign-bundle"]
            for records in backend_commands.values()
            for record in records
        )
    )
    results["frozen-copy"] = int(
        any(digest(project / name) != value for name, value in sources.items())
    )
    results["checkout-artifacts-preserved"] = int(
        any(
            not (root / name).is_file() or digest(root / name) != value
            for name, value in artifacts.items()
        )
    )
    changed = [
        name
        for name, value in sources.items()
        if not (root / name).is_file() or digest(root / name) != value
    ]
    results["checkout-source-lineage"] = int(bool(changed))
    current_names = set(
        filter(
            None,
            subprocess.check_output(
                ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
                cwd=root,
            )
            .decode()
            .split("\0"),
        )
    )
    results["checkout-source-inventory"] = int(current_names != set(names))
    git_after = {
        "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root)
        .decode()
        .strip(),
        "staged": subprocess.check_output(
            ["git", "diff", "--cached", "--binary"], cwd=root
        ).decode(),
    }
    results["head-staging-preserved"] = int(git_before != git_after)
    after_tools = audit_tools()
    (out / "toolchain-after.json").write_text(json.dumps(after_tools, indent=2) + "\n")
    results["installed-toolchain-preserved"] = int(before_tools != after_tools)
    report = {
        "scope": "focused" if args.focused else "full-offline",
        "results": results,
        "counts": counts,
        "explicit_skips": skips,
        "command_timeout_seconds": 420,
        "commands": commands,
        "dimensions": dimensions,
        "actual_backend_commands": backend_commands,
        "versions": versions,
        "sources": len(sources),
        "checkout_changes_since_freeze": changed,
        "backend_mode": "bundle",
        "backend_policy": {
            "WBX_TEST_SOURCE_BACKEND": env["WBX_TEST_SOURCE_BACKEND"],
            "built_entrypoint": str(project / "dist/editor-main.js"),
            "synthetic_workers": "Explicit fixture-owned commands; never live Webex",
        },
        "git_before": git_before,
        "checkout_build_or_install_or_activation": False,
        "live_acceptance": "NOT RUN",
        "note": "Candidate proof is separate from actual checkout/source agreement; no checkout artifact is refreshed.",
    }
    (out / "summary.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"evidence": str(out), "results": results}, indent=2), flush=True)
    return int(any(results.values()))


if __name__ == "__main__":
    raise SystemExit(main())
