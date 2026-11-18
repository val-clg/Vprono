"""Bump the Vprono build number everywhere it is used (index.html, sw.js, version.json).
Run before every deploy: python3 tools/bump.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
vf = root / "version.json"
v = int(json.loads(vf.read_text())["v"]) + 1 if vf.exists() else 13
vf.write_text(json.dumps({"v": str(v)}) + "\n")
idx = root / "index.html"
s = idx.read_text()
s = re.sub(r'window\.VP_BUILD="\d+"', f'window.VP_BUILD="{v}"', s)
s = re.sub(r'(<script src="(?:js|vendor)/[^"?]+\.js|<script src="config\.js)(?:\?v=\d+)?"', lambda m: f'{m.group(1)}?v={v}"', s)
idx.write_text(s)
sw = root / "sw.js"
t = sw.read_text()
t = re.sub(r'const VERSION = "vprono-v\d+";', f'const VERSION = "vprono-v{v}";', t)
sw.write_text(t)
print("build", v)
