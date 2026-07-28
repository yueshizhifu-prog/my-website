#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y fonts-noto-cjk fontconfig
sudo fc-cache -fv >/tmp/aivf-font-cache.log 2>&1 || true

sudo python3 - <<'PY'
from pathlib import Path

worker = Path("/opt/aivf/worker.mjs")
text = worker.read_text(encoding="utf-8")

old = """const fontCandidates = [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];"""

new = """const fontCandidates = [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];"""

if old in text:
    text = text.replace(old, new)

old_health = """return json(res, 200, { ok: true, name: 'AI Video Factory render worker', ffmpeg: true, time: new Date().toISOString() });"""
new_health = """return json(res, 200, { ok: true, name: 'AI Video Factory render worker', ffmpeg: true, font: pickFont(), time: new Date().toISOString() });"""
if old_health in text:
    text = text.replace(old_health, new_health)

old_vf = """const vf = `drawtext=${fontArg}textfile=${textPath}:fontcolor=white:fontsize=42:line_spacing=16:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=28`;"""
new_vf = """const vf = `drawtext=${fontArg}textfile=${textPath}:fontcolor=white:fontsize=42:line_spacing=16:text_shaping=1:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=28`;"""
if old_vf in text:
    text = text.replace(old_vf, new_vf)

worker.write_text(text, encoding="utf-8")
PY

sudo systemctl restart aivf-worker
sleep 1
curl -sS http://127.0.0.1/health.json
printf '\nAIVF_FONT_FIX_DONE\n'
