#!/usr/bin/env bash
set -euo pipefail

sudo mkdir -p /opt/aivf/files/outputs /opt/aivf/tmp
sudo chown -R admin:admin /opt/aivf

cat > /tmp/aivf-worker.mjs <<'NODE'
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import crypto from 'node:crypto';

const root = '/opt/aivf';
const outputsDir = join(root, 'files', 'outputs');
const tmpDir = join(root, 'tmp');
const port = Number(process.env.AIVF_WORKER_PORT || 3001);
const fontCandidates = [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
];

function json(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function run(cmd, args, timeoutMs = 600000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr, stdout }); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: -1, stderr: error.message, stdout }); });
  });
}

function cleanText(value, max = 100) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wrapCaption(value, columns = 18) {
  const chars = Array.from(cleanText(value, 120));
  const lines = [];
  while (chars.length) lines.push(chars.splice(0, columns).join(''));
  return lines.join('\n');
}

function pickFont() {
  return fontCandidates.find((file) => existsSync(file)) || '';
}

function filterPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function isImage(asset) {
  return /\.(jpg|jpeg|png|webp)(?:$|\?)/i.test(`${asset?.name || ''} ${asset?.url || ''}`);
}

function safeExt(asset) {
  const fromUrl = String(asset?.url || '').split('?')[0];
  const ext = extname(fromUrl || String(asset?.name || '')).toLowerCase();
  return /^\.(mp4|mov|m4v|webm|avi|mkv|mp3|wav|m4a|aac|jpg|jpeg|png|webp)$/.test(ext) ? ext : '.bin';
}

async function downloadAsset(asset, directory) {
  if (!asset?.url) throw new Error('material_url_missing');
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`material_download_failed_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('material_download_empty');
  const path = join(directory, `${asset.id || crypto.randomUUID()}${safeExt(asset)}`);
  await writeFile(path, buffer);
  return path;
}

async function mediaDuration(path) {
  const result = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], 30000);
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function buildSegmentDurations(shots, voiceSeconds) {
  if (!(voiceSeconds > 0)) {
    return shots.map((shot) => Math.max(2, Math.min(12, Number(shot?.duration || 4))));
  }
  const weights = shots.map((shot) => Math.max(1, Array.from(cleanText(shot?.text || shot?.visual || '', 120)).length));
  const minimum = 2;
  const target = Math.max(voiceSeconds + 0.15, minimum * shots.length);
  const remaining = Math.max(0, target - minimum * shots.length);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => minimum + (remaining * weight / weightTotal));
}

async function renderSegment(jobDir, index, shot, sourcePath, sourceAsset, plannedDuration, titlePath = '', showTitle = false) {
  const duration = Math.max(0.45, Math.min(60, Number(plannedDuration || shot?.duration || 4)));
  const segmentPath = join(jobDir, `segment-${String(index).padStart(3, '0')}.mp4`);
  const subtitlePath = join(jobDir, `subtitle-${String(index).padStart(3, '0')}.txt`);
  await writeFile(subtitlePath, wrapCaption(shot?.text || shot?.visual || '', 16), 'utf8');
  const font = pickFont();
  const fontArg = font ? `fontfile=${font}:` : '';
  const textFilters = [];
  if (showTitle && titlePath) {
    textFilters.push(`drawtext=${fontArg}textfile='${filterPath(titlePath)}':fontcolor=white@0.98:fontsize=46:line_spacing=8:text_shaping=1:x=(w-text_w)/2:y=118:borderw=0:shadowcolor=black@0.95:shadowx=4:shadowy=4`);
  }
  textFilters.push(`drawtext=${fontArg}textfile='${filterPath(subtitlePath)}':fontcolor=white:fontsize=36:line_spacing=10:text_shaping=1:x=(w-text_w)/2:y=h-text_h-250:box=1:boxcolor=black@0.52:boxborderw=16:enable='between(t,0.02,${Math.max(0.22, duration - 0.04).toFixed(2)})'`);
  const vf = [
    'scale=720:1280:force_original_aspect_ratio=increase',
    'crop=720:1280',
    'setsar=1',
    ...textFilters,
  ].join(',');
  const inputArgs = isImage(sourceAsset)
    ? ['-loop', '1', '-framerate', '25', '-i', sourcePath]
    : ['-stream_loop', '-1', '-i', sourcePath];
  const result = await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', ...inputArgs,
    '-t', String(duration), '-vf', vf, '-an', '-r', '25',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', segmentPath,
  ]);
  if (result.code !== 0) throw new Error(`material_segment_failed:${result.stderr.slice(-300)}`);
  return segmentPath;
}

async function renderVideo(body, req) {
  const jobId = String(body.jobId || crypto.randomUUID()).replace(/[^\w-]/g, '');
  const jobDir = join(tmpDir, jobId);
  await mkdir(jobDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const shots = Array.isArray(body.shots) ? body.shots : [];
  if (!shots.length) return { ok: false, error: 'material_library_not_matched' };
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const visualShots = shots.map((shot, index) => ({ index, shot, asset: assetsById.get(shot.assetId) }));
  if (visualShots.some((entry) => !entry.asset)) return { ok: false, error: 'material_library_not_matched' };

  const downloaded = new Map();
  for (const asset of assets) downloaded.set(asset.id, await downloadAsset(asset, jobDir));
  const voice = assets.find((asset) => String(asset.type || '').toLowerCase() === 'voiceover');
  const voiceSegments = visualShots.map((entry) => assetsById.get(String(entry.shot?.voiceoverAssetId || '')));
  const useSegmentedVoice = voiceSegments.length === visualShots.length
    && voiceSegments.every((asset) => String(asset?.type || '').toLowerCase() === 'voiceover' && downloaded.get(asset.id));
  if (!useSegmentedVoice && (!voice || !downloaded.get(voice.id))) return { ok: false, error: 'voice_not_matched' };
  const segmentAudioPaths = useSegmentedVoice ? voiceSegments.map((asset) => downloaded.get(asset.id)) : [];
  const segmentAudioDurations = useSegmentedVoice
    ? await Promise.all(segmentAudioPaths.map((path) => mediaDuration(path)))
    : [];
  if (useSegmentedVoice && segmentAudioDurations.some((duration) => !(duration > 0))) {
    return { ok: false, error: 'voice_segment_duration_invalid' };
  }
  const durations = useSegmentedVoice
    ? segmentAudioDurations
    : buildSegmentDurations(shots, await mediaDuration(downloaded.get(voice.id)));
  const titleText = wrapCaption(body?.settings?.headline || body.title || '', 12);
  const showTitle = Boolean(titleText)
    && body?.settings?.showHeadline !== false
    && String(body?.settings?.titleStyle || '') !== '不要标题';
  const titlePath = join(jobDir, 'headline.txt');
  if (showTitle) await writeFile(titlePath, titleText, 'utf8');

  const segments = [];
  for (const entry of visualShots) {
    segments.push(await renderSegment(
      jobDir,
      entry.index,
      entry.shot,
      downloaded.get(entry.asset.id),
      entry.asset,
      durations[entry.index],
      titlePath,
      showTitle,
    ));
  }
  const concatPath = join(jobDir, 'segments.txt');
  await writeFile(concatPath, segments.map((path) => `file '${path.replace(/'/g, "'\\\\''")}'`).join('\n'), 'utf8');
  const picturePath = join(jobDir, 'picture.mp4');
  const concat = await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-c', 'copy', '-movflags', '+faststart', picturePath,
  ]);
  if (concat.code !== 0) return { ok: false, error: 'ffmpeg_concat_failed', detail: concat.stderr.slice(-500) };

  const outFile = `${jobId}.mp4`;
  const outPath = join(outputsDir, outFile);
  let mergeArgs;
  if (useSegmentedVoice) {
    const audioInputs = segmentAudioPaths.flatMap((path) => ['-i', path]);
    const audioLabels = [];
    const audioFilters = segmentAudioDurations.map((duration, index) => {
      const safeDuration = Math.max(0.45, Number(duration || 0));
      const fadeOutStart = Math.max(0, safeDuration - 0.03).toFixed(3);
      audioLabels.push(`[a${index}]`);
      return `[${index + 1}:a]atrim=start=0:end=${safeDuration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.03,afade=t=out:st=${fadeOutStart}:d=0.03[a${index}]`;
    });
    audioFilters.push(`${audioLabels.join('')}concat=n=${audioLabels.length}:v=0:a=1[aout]`);
    mergeArgs = [
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', picturePath, ...audioInputs,
      '-filter_complex', audioFilters.join(';'),
      '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      '-movflags', '+faststart', outPath,
    ];
  } else {
    mergeArgs = [
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', picturePath, '-i', downloaded.get(voice.id),
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      '-movflags', '+faststart', outPath,
    ];
  }
  const merged = await run('ffmpeg', mergeArgs);
  if (merged.code !== 0) return { ok: false, error: 'ffmpeg_audio_merge_failed', detail: merged.stderr.slice(-500) };
  const info = await stat(outPath);
  const host = req.headers.host || '39.106.109.226';
  return {
    ok: true,
    job: {
      id: jobId, type: 'video', status: 'done', title: cleanText(body.title || 'AI 视频成片'),
      outputUrl: `http://${host}/files/outputs/${outFile}`,
      provider: 'aliyun-lightweight-ffmpeg-materials-segment-sync', size: info.size,
      subtitleMode: useSegmentedVoice ? 'segment-audio-locked' : 'estimated',
      titleEnabled: showTitle,
      createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      note: '已按镜头匹配素材库视频并合成克隆配音。',
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && (req.url === '/health.json' || req.url === '/api/health' || req.url === '/api/render/health')) {
      return json(res, 200, { ok: true, name: 'AI Video Factory material render worker', mode: 'materials-segment-sync', version: '2026-07-29-subtitle-sync-v2', ffmpeg: true, font: pickFont(), time: new Date().toISOString() });
    }
    if (req.method === 'POST' && req.url === '/api/videos/generate') {
      const result = await renderVideo(await readBody(req), req);
      return json(res, result.ok ? 200 : 400, result);
    }
    return json(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'render_worker_failed', detail: String(error?.message || error).slice(0, 500) });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`AI Video Factory material worker listening on ${port}`));
NODE

sudo mv /tmp/aivf-worker.mjs /opt/aivf/worker.mjs
sudo chown admin:admin /opt/aivf/worker.mjs
sudo systemctl restart aivf-worker
sleep 2
curl -fsS http://127.0.0.1/health.json
printf '\nAIVF_MATERIAL_WORKER_READY\n'
