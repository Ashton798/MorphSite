"""Continue querying the existing paid task; never creates a new task."""
import json, time, urllib.request
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'test-results/flower-live/video-result.json'
for _ in range(120):
    try:
        with urllib.request.urlopen('http://localhost:3000/api/brand/video?task=a6598a6bde91441986b0070a8d38c49a', timeout=30) as response:
            task = json.load(response)
        out.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding='utf-8')
        if task.get('url') or task.get('status') in ('failed', 'canceled'):
            break
    except Exception:
        pass
    time.sleep(15)
