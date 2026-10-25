"""Own the Next process tree (including on Windows), with file-backed logs.
Usage: python scripts/check_browser.py [--production] [--port 3100]
"""
import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--production", action="store_true")
parser.add_argument("--port", default=3100, type=int)
parser.add_argument("--live-ai", action="store_true", help="allow real provider calls (default: deterministic offline demo)")
parser.add_argument("--suite", choices=["smoke", "immersive", "all"], default="smoke", help="browser suites to run; default preserves the existing smoke suite")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
os.chdir(root)
with socket.socket() as probe:
    if probe.connect_ex(("127.0.0.1", args.port)) == 0:
        raise SystemExit(f"Port {args.port} is already occupied; choose another port.")
(root / "test-results").mkdir(exist_ok=True)
log_path = root / "test-results" / ("production-server.log" if args.production else "dev-server.log")
command = ["node", "node_modules/next/dist/bin/next", "start" if args.production else "dev", "--hostname", "127.0.0.1", "--port", str(args.port)]
env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1", "PYTHONIOENCODING": "utf-8"}
# Browser acceptance is deterministic: no provider calls and no API spend unless asked.
if not args.live_ai:
    env["MORPHSITE_AI"] = "off"
with log_path.open("w", encoding="utf-8") as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=os.name != "nt")
    try:
        base = f"http://127.0.0.1:{args.port}"
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        ready = False
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError(f"Next exited early; see {log_path}")
            try:
                with opener.open(base, timeout=3) as response:
                    ready = response.status == 200
                if ready:
                    break
            except Exception:
                time.sleep(.6)
        if not ready:
            raise RuntimeError(f"Server did not serve HTTP 200; see {log_path}")
        print(f"SERVER READY {base}", flush=True)
        suites = ["browser_smoke.py", "browser_immersive.py"] if args.suite == "all" else ["browser_immersive.py" if args.suite == "immersive" else "browser_smoke.py"]
        for suite in suites:
            result = subprocess.run([sys.executable, "-u", f"tests/{suite}", "--base-url", base], env=env, timeout=240)
            if result.returncode:
                sys.exit(result.returncode)
        sys.exit(0)
    finally:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=15)
