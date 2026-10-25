"""Run backend suites with temporary files inside the writable workspace."""
import argparse
import os
import runpy
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "integrations/hackathon-mvp/backend"
TEMP = (ROOT / "test-results" / "backend-temp").resolve()
TEMP.mkdir(parents=True, exist_ok=True)

# Python on Windows applies a user-only DACL for mkdir(mode=0o700).
# Use inherited workspace ACLs for disposable, non-secret test fixtures.
def workspace_temp(suffix=None, prefix=None, dir=None):
    directory = Path(dir or TEMP).resolve()
    if not directory.is_relative_to(TEMP):
        directory = TEMP
    target = directory / ((prefix or "tmp") + uuid.uuid4().hex + (suffix or ""))
    target.mkdir(mode=0o777)
    return str(target)
tempfile.tempdir = str(TEMP)
tempfile.mkdtemp = workspace_temp
os.environ["TEMP"] = os.environ["TMP"] = str(TEMP)
os.environ["PYTHONIOENCODING"] = "utf-8"
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))
parser = argparse.ArgumentParser()
parser.add_argument("--suite", default="test_*.py")
parser.add_argument("--acceptance", action="store_true")
args = parser.parse_args()
if args.acceptance:
    runpy.run_path(str(BACKEND / "tests/void_coffee_acceptance.py"), run_name="__main__")
else:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(BACKEND / "tests"), pattern=args.suite))
    raise SystemExit(0 if result.wasSuccessful() else 1)
