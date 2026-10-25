import json
import urllib.request
import urllib.error
import ssl

KEY = "1CkgRHkl6ScCYIM9LUTOI2pNJJNQI1v4"
BASE = "https://lax.toklens.ai/v1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def get(path):
    req = urllib.request.Request(
        BASE + path,
        headers={
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            "User-Agent": "probe/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


for p in ["/models", "/model/info", "/v1/models"]:
    if p.startswith("/v1"):
        continue
    code, body = get(p)
    print("=" * 60)
    print("GET", BASE + p, "->", code)
    print(body[:2500])
