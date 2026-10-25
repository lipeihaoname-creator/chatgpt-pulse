#!/usr/bin/env python3
"""Install this app for the current user; optional, reversible GPT launch watcher."""
import argparse
import datetime
import json
import plistlib
import sqlite3
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--enable-watch", action="store_true")
parser.add_argument("--automatic-monitoring", action="store_true", help="启用 Work 自动监测，保留外观与隐私设置")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
source = root / "release/ChatGPT Pulse.app"
info = plistlib.loads((source / "Contents/Info.plist").read_bytes())
assert info["CFBundleIdentifier"] == "io.github.chatgptpulse.desktop"
executable = info["CFBundleExecutable"]
subprocess.run(["codesign", "--verify", "--deep", "--strict", str(source)], check=True)
status = subprocess.run([str(source / "Contents/MacOS" / executable), "--watch-status"], check=True, capture_output=True, text=True)
if json.loads(status.stdout)["pulse_running"]:
    raise SystemExit("请先退出 Pulse，再安装更新；不会关闭 GPT。")
folder = Path.home() / "Applications"
folder.mkdir(exist_ok=True)
target = folder / "ChatGPT Pulse.app"
staging = folder / ".ChatGPT Pulse.installing.app"
if staging.exists():
    raise SystemExit("已有待处理的 Pulse 安装目录，请先检查，未覆盖。")
subprocess.run(["ditto", str(source), str(staging)], check=True)
subprocess.run(["codesign", "--verify", "--deep", "--strict", str(staging)], check=True)
if target.exists():
    previous = plistlib.loads((target / "Contents/Info.plist").read_bytes())
    if previous["CFBundleIdentifier"] != info["CFBundleIdentifier"]:
        raise SystemExit("目标位置是其他应用，未覆盖。")
    backup = folder / ".Pulse-backups"
    backup.mkdir(exist_ok=True)
    target.rename(backup / ("ChatGPT Pulse " + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".app"))
staging.rename(target)
result = {"app": str(target), "version": info["CFBundleShortVersionString"]}
if args.automatic_monitoring:
    prefs = Path.home() / "Library/Application Support/io.github.chatgptpulse.desktop/pulse.sqlite"
    if prefs.exists():
        with sqlite3.connect(prefs) as connection:
            row = connection.execute("SELECT value FROM settings WHERE id=1").fetchone()
            if row:
                settings = json.loads(row[0])
                settings.pop("monitor_scope",None)
                settings.update(auto_monitor=True, follow_latest=True,
                                revision=settings.get("revision", 0) + 1)
                connection.execute("UPDATE settings SET value=? WHERE id=1", (json.dumps(settings),))
                result["auto_monitor"] = True

if args.enable_watch:
    # launchd can take a brief moment to finish unloading the previous worker.
    for attempt in range(5):
        enabled = subprocess.run([str(target / "Contents/MacOS" / executable), "--enable-client-watch"], capture_output=True, text=True)
        if enabled.returncode == 0:
            result["startup"] = json.loads(enabled.stdout)
            break
        time.sleep(0.25 * (attempt + 1))
    else:
        raise SystemExit(enabled.stderr.strip() or "应用已安装，但启动联动未加载；可在偏好设置重新开启。")
print(json.dumps(result, ensure_ascii=False))
