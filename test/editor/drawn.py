"""Draw only explicitly allowlisted synthetic fixtures in a private editor PTY."""

import argparse
import base64
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time
import zlib

inventory = json.loads(Path(__file__).with_name("fixtures.json").read_text())
required_drawn = sorted(
    name
    for names in inventory["suites"].values()
    for name in names
    if name not in inventory["headlessOnly"]
)
parser = argparse.ArgumentParser()
parser.add_argument(
    "fixture",
    choices=required_drawn,
    help="Required drawn fixture from fixtures.json",
)
parser.add_argument("--editor", choices=["nvim", "vim"], default="nvim")
args = parser.parse_args()
if args.editor not in inventory["editorOverrides"].get(
    args.fixture, inventory["defaultEditors"]
):
    parser.error(args.fixture + " is not an accepted " + args.editor + " fixture")
binary = os.environ.get("WBX_NVIM" if args.editor == "nvim" else "WBX_VIM", args.editor)
root = Path.cwd()
with tempfile.TemporaryDirectory(prefix="wbx-drawn-", dir="/tmp/opencode") as directory:
    result = Path(directory) / "result.json"
    config = Path(directory) / "config.json"
    config.write_text("{}\n")
    audit = Path(directory) / "audit"
    audit.write_text("")
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("WBX_") and key.endswith("_TEST"):
            env[key] = "0"
    env.update(
        HOME=directory,
        XDG_CONFIG_HOME=directory,
        XDG_DATA_HOME=str(Path(directory) / "data"),
        XDG_CACHE_HOME=str(Path(directory) / "cache"),
        XDG_STATE_HOME=str(Path(directory) / "state"),
        WBX_CONFIG=str(config),
        WBX_EDITOR_ROOT=str(root),
        WBX_EDITOR_RESULT=str(result),
        WBX_EDITOR_AUDIT=str(audit),
        WBX_EDITOR_SCREEN="1",
        WBX_TEST_FIXTURE=args.fixture,
        WBX_NODE=shutil.which("node") or "node",
        TERM="xterm-256color",
    )
    env.pop("DISPLAY", None)
    env.pop("WAYLAND_DISPLAY", None)
    if args.fixture in ["image-renderer", "image-opening"]:
        env.update(TERM="xterm-kitty", TERM_PROGRAM="kitty")
        for key in ["TMUX", "TMUX_PANE", "ZELLIJ", "KITTY_WINDOW_ID"]:
            env.pop(key, None)
    if args.editor == "nvim":
        env.pop("VIMRUNTIME", None)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 60, 160, 960, 1280))
    command = [
        binary,
        "-u" if args.editor == "nvim" else "-Nu",
        "NONE",
        "-i",
        "NONE",
        "-n",
        "-S",
        str(root / "test/editor" / (args.fixture + ".vim")),
    ]

    def claim_private_tty():
        # /dev/tty in the child MUST be this synthetic PTY, never the agent's
        # real terminal. setsid alone does not establish a controlling TTY.
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    process = subprocess.Popen(
        command,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        env=env,
        cwd=root,
        preexec_fn=claim_private_tty,
    )
    os.close(slave)
    output = bytearray()
    deadline = time.monotonic() + 35
    replies = {
        b"\x1b[6n": b"\x1b[1;1R",
        b"\x1b[c": b"\x1b[?1;2c",
        b"\x1b[>c": b"\x1b[>0;0;0c",
        b"\x1b[14t": b"\x1b[4;960;1280t",
        b"\x1b[16t": b"\x1b[6;16;8t",
        b"\x1b[18t": b"\x1b[8;60;160t",
    }
    pending = b""
    dialog_pending = b""
    dialog_keys = 0
    confirmation_inputs = []
    confirmation_serial = 0
    confirmation_step = 0
    try:
        while process.poll() is None:
            if time.monotonic() >= deadline:
                with tempfile.NamedTemporaryFile(
                    prefix="wbx-drawn-" + args.fixture + "-failure-",
                    suffix=".log",
                    dir="/tmp/opencode",
                    delete=False,
                ) as failure:
                    failure.write(output)
                raise TimeoutError(
                    "Synthetic drawn editor fixture timed out; private PTY capture: "
                    + failure.name
                )
            if not select.select([master], [], [], 0.1)[0]:
                continue
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            output.extend(data)
            if len(output) > 2_000_000:
                del output[:-2_000_000]
            pending += data
            if args.fixture in ["native-confirmations", "send-workflows"]:
                # Only these isolated inert fixtures may request keyboard input.
                # Do not replace confirm(), its helper, or its boolean result.
                # Require the actual native prompt and default-Cancel buttons
                # on the child's PRIVATE controlling PTY before sending a key.
                dialog_pending += data
                plan_path = Path(str(result) + ".dialogs.json")
                if plan_path.exists():
                    plan = json.loads(plan_path.read_text())
                    if plan["serial"] > confirmation_serial:
                        assert plan["serial"] == confirmation_serial + 1
                        confirmation_serial = plan["serial"]
                        confirmation_step = 0
                    if confirmation_step < len(plan["steps"]):
                        step = plan["steps"][confirmation_step]
                        plain = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", dialog_pending)
                        buttons = re.search(
                            rb"\[C\]ancel, \((Y|D)\)(?:es, continue|etach|iscard text): ",
                            plain,
                        )
                        if step["match"].encode() in plain and buttons:
                            keys = {
                                "enter": b"\r",
                                "escape": b"\x1b",
                                "cancel": b"c",
                                "accept": buttons[1].lower(),
                            }
                            os.write(master, keys[step["key"]])
                            confirmation_inputs.append(
                                {
                                    "case": plan["case"],
                                    "key": step["key"],
                                    "prompt": step["match"],
                                    "default": "Cancel",
                                    "native_buttons": buttons[0].decode(),
                                }
                            )
                            assert len(confirmation_inputs) <= 64
                            confirmation_step += 1
                            dialog_pending = b""
                dialog_pending = dialog_pending[-16384:]
            if args.fixture == "mention-picker" and args.editor == "vim":
                # Vim's confirm() reads its private controlling TTY, not
                # feedkeys(). Only this inert fixture's exact synthetic prompts
                # may receive these explicit test accelerators.
                dialog_pending += data
                while match := re.search(
                    rb"Synthetic (cancel|continue|default): no service is contacted\."
                    rb".*?\[C\]ancel, \(Y\)es, continue: ",
                    dialog_pending,
                    re.S,
                ):
                    os.write(
                        master,
                        {b"cancel": b"c", b"continue": b"y", b"default": b"\r"}[
                            match[1]
                        ],
                    )
                    dialog_keys += 1
                    dialog_pending = dialog_pending[match.end() :]
                dialog_pending = dialog_pending[-4096:]
            for query, answer in replies.items():
                while query in pending:
                    pending = pending.replace(query, b"", 1)
                    os.write(master, answer)
            pending = pending[-128:]
        code = process.wait(timeout=2)
        data = json.loads(result.read_text())
        if args.fixture in ["native-confirmations", "send-workflows"] and not data.get(
            "errors"
        ):
            assert (
                len(confirmation_inputs)
                == data["expectedNativeDialogs"]
                == (42 if args.fixture == "native-confirmations" else 2)
            )
            if args.fixture == "native-confirmations":
                assert data["positiveHelperControls"] == 7
            data["native_confirmation_keyboard"] = {
                "responses": confirmation_inputs,
                "input": "actual keys on isolated private controlling PTY",
                "operator_observed_assistive_readout": "NOT RUN",
            }
        if (
            args.fixture == "mention-picker"
            and args.editor == "vim"
            and not data.get("errors")
        ):
            assert dialog_keys == 12, (
                "all four native owners must exercise C, Y and default Cancel"
            )
        if (
            args.fixture == "image-renderer"
            and args.editor == "nvim"
            and not data.get("errors")
        ):
            packets = re.findall(rb"\x1b_G([^\x1b]*?)\x1b\\", output)
            encoded = bytearray()
            for packet in packets:
                if b";" in packet:
                    controls, payload = packet.split(b";", 1)
                    assert b"q=2" in controls, (
                        "all image transfers must suppress terminal replies"
                    )
                    encoded.extend(payload)
            image = base64.b64decode(encoded, validate=True)
            assert image.startswith(b"\x89PNG\r\n\x1a\n"), (
                "normal writer did not emit a PNG"
            )
            assert struct.unpack(">II", image[16:24]) == (240, 144)
            compressed = bytearray()
            at = 8
            while at < len(image):
                size = struct.unpack(">I", image[at : at + 4])[0]
                kind = image[at + 4 : at + 8]
                payload = image[at + 8 : at + 8 + size]
                crc = struct.unpack(">I", image[at + 8 + size : at + 12 + size])[0]
                assert zlib.crc32(kind + payload) == crc, "invalid normalized PNG CRC"
                if kind == b"IDAT":
                    compressed.extend(payload)
                at += 12 + size
            pixels = zlib.decompress(compressed)
            assert len(pixels) == (240 * 3 + 1) * 144
            assert pixels[1:4] == bytes([0, 0, 32])
            assert pixels[-3:] == bytes([255, 255, 224]), (
                "transferred image lost its actual non-uniform pixels"
            )
            assert any(b"a=p,U=1" in packet for packet in packets), (
                "missing Kitty virtual placement"
            )
            assert "\U0010eeee".encode() in output, (
                "Neovim never drew the Kitty placeholder cells"
            )
            data["normal_kitty_transfer"] = (
                "PNG + placement + TUI placeholders captured in isolated PTY"
            )
        if (
            args.fixture == "image-opening"
            and args.editor == "nvim"
            and not data.get("errors")
        ):
            packets = re.findall(rb"\x1b_G([^\x1b]*?)\x1b\\", output)
            transfers = []
            encoded = bytearray()
            for packet in packets:
                if b";" not in packet:
                    continue
                controls, payload = packet.split(b";", 1)
                if b"a=t," in controls:
                    encoded = bytearray()
                assert b"q=2" in controls
                encoded.extend(payload)
                if b"m=0" in controls:
                    transfers.append(base64.b64decode(encoded, validate=True))
            full = [
                png
                for png in transfers
                if png.startswith(b"\x89PNG\r\n\x1a\n")
                and struct.unpack(">II", png[16:24]) == (960, 600)
            ]
            assert full, (
                "viewer writer only transmitted a thumbnail, not the higher-resolution PNG"
            )
            compressed = bytearray()
            at = 8
            while at < len(full[0]):
                size = struct.unpack(">I", full[0][at : at + 4])[0]
                kind, payload = (
                    full[0][at + 4 : at + 8],
                    full[0][at + 8 : at + 8 + size],
                )
                assert (
                    zlib.crc32(kind + payload)
                    == struct.unpack(">I", full[0][at + 8 + size : at + 12 + size])[0]
                )
                if kind == b"IDAT":
                    compressed.extend(payload)
                at += size + 12
            pixels = zlib.decompress(compressed)
            assert len(pixels) == (960 * 3 + 1) * 600
            assert pixels[1:7] == bytes([0, 0, 0, 255, 0, 255]), (
                "single-pixel detail was lost"
            )
            sizes = [
                tuple(map(int, size))
                for packet in packets
                for size in re.findall(rb"c=(\d+),r=(\d+)", packet)
            ]
            assert any(columns > 40 and rows > 12 for columns, rows in sizes), (
                "viewer kept thumbnail-sized placement"
            )
            data["higher_resolution_transfer"] = (
                "960x600 PNG with source single-pixel detail + larger fitted placement"
            )
        print(
            json.dumps(
                {
                    "editor": args.editor,
                    "fixture": args.fixture,
                    "exit": code,
                    "result": data,
                }
            )
        )
        if code or data.get("errors") or data.get("skip"):
            raise SystemExit(1)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=2)
        os.close(master)
