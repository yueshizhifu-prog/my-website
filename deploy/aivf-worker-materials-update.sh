#!/usr/bin/env bash
set -euo pipefail

sudo mkdir -p /opt/aivf/files/outputs /opt/aivf/tmp
sudo chown -R admin:admin /opt/aivf

cat > /tmp/aivf-worker.mjs <<'NODE'
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, readFile, unlink, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';

const root = '/opt/aivf';
const outputsDir = join(root, 'files', 'outputs');
const tmpDir = join(root, 'tmp');
const queuePath = join(root, 'render-queue.json');
const port = Number(process.env.AIVF_WORKER_PORT || 3001);
const renderQueue = [];
let activeRenderTask = null;
let renderQueueRunning = false;
const renderQueueLimit = Math.max(1, Math.min(50, Number(process.env.AIVF_RENDER_QUEUE_LIMIT || 20)));
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

function renderErrorMessage(code) {
  const messages = {
    material_library_not_matched: '没有匹配到对应素材库视频，不能进行剪辑。',
    voice_not_matched: '没有匹配到可用声音，不能进行剪辑。',
    voice_segment_duration_invalid: '配音时长无效，请重新生成配音后再试。',
    material_download_failed: '素材下载失败，请检查素材后重新剪辑。',
    output_storage_failed: '成片保存到云端失败，本次不会扣除剪辑条数。',
    render_worker_failed: '剪辑服务处理失败，请稍后重试。',
  };
  const raw = String(code || '').trim();
  if (messages[raw]) return messages[raw];
  if (/material_(url|download|segment)/i.test(raw)) return '素材读取或画面合成失败，请检查素材后重新剪辑。';
  if (/ffmpeg_(concat|audio_merge)/i.test(raw)) return '视频合成失败，请稍后重新剪辑。';
  if (/output|oss|upload/i.test(raw)) return messages.output_storage_failed;
  return /[\u4e00-\u9fff]/.test(raw) ? raw : messages.render_worker_failed;
}

function isAllowedCallbackUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(?:^|\.)fcapp\.run$/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function writeRenderStatus(task, stage, job, extra = {}) {
  const upload = task?.body?.asyncTask?.statusUpload || {};
  if (!isAllowedOssUrl(upload.url)) return false;
  const payload = {
    ok: stage !== 'failed',
    stage,
    message: extra.message || (
      stage === 'queued' ? '剪辑任务已进入队列。'
        : stage === 'rendering' ? '剪辑服务器正在匹配素材并合成视频。'
          : stage === 'done' ? '成片已生成，可以预览和下载。'
            : renderErrorMessage(job?.error)
    ),
    queuePosition: Number(extra.queuePosition || 0),
    callbackSynced: Boolean(extra.callbackSynced),
    updatedAt: new Date().toISOString(),
    job,
  };
  try {
    const response = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'Content-Type': String(upload.contentType || 'application/json; charset=utf-8') },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function postRenderCallback(task, job) {
  const callback = task?.body?.asyncTask?.callback || {};
  if (!isAllowedCallbackUrl(callback.url) || !callback.token) {
    return { ok: false, error: 'render_callback_not_configured' };
  }
  let lastError = 'render_callback_failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(callback.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${callback.token}`,
        },
        body: JSON.stringify({ jobId: job.id, status: job.status, error: job.error || '', detail: job.detail || '', job }),
      });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}
      if (response.ok && data?.ok && data?.job) return { ok: true, job: data.job };
      lastError = data?.error || `render_callback_http_${response.status}`;
    } catch (error) {
      lastError = String(error?.message || 'render_callback_failed');
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
  }
  return { ok: false, error: lastError };
}

async function persistRenderQueue() {
  const pending = [...(activeRenderTask ? [activeRenderTask] : []), ...renderQueue];
  await writeFile(queuePath, JSON.stringify(pending), 'utf8');
}

async function restoreRenderQueue() {
  try {
    const saved = JSON.parse(await readFile(queuePath, 'utf8'));
    if (Array.isArray(saved)) {
      renderQueue.push(...saved.filter((task) => task?.body?.jobId && task?.body?.asyncTask));
    }
  } catch {}
}

async function processRenderQueue() {
  if (renderQueueRunning) return;
  const task = renderQueue.shift();
  if (!task) return;
  renderQueueRunning = true;
  activeRenderTask = task;
  await persistRenderQueue().catch(() => {});
  const body = task.body || {};
  const jobId = String(body.jobId || crypto.randomUUID()).replace(/[^\w-]/g, '');
  const createdAt = task.createdAt || new Date().toISOString();
  const processingJob = {
    id: jobId,
    ownerId: body?.requestedBy?.id || '',
    type: 'video',
    status: 'processing',
    stage: 'rendering',
    title: cleanText(body.title || 'AI 视频成片'),
    provider: 'aliyun-lightweight-ffmpeg-async',
    createdAt,
  };
  await writeRenderStatus(task, 'rendering', processingJob);

  let finalJob;
  try {
    const result = await renderVideo(body, { headers: { host: task.host || '39.106.109.226' } });
    if (!result?.ok || !result?.job || !result.job.objectKey) {
      const error = result?.error || (result?.job ? 'output_storage_failed' : 'render_worker_failed');
      finalJob = {
        ...processingJob,
        status: 'failed',
        stage: 'failed',
        outputUrl: '',
        objectKey: '',
        error,
        detail: String(result?.detail || '').slice(0, 500),
        message: renderErrorMessage(error),
        finishedAt: new Date().toISOString(),
      };
    } else {
      finalJob = {
        ...result.job,
        id: jobId,
        ownerId: body?.requestedBy?.id || '',
        status: 'done',
        stage: 'done',
        outputUrl: String(body?.asyncTask?.outputDownloadUrl || result.job.outputUrl || ''),
      };
    }
  } catch (error) {
    finalJob = {
      ...processingJob,
      status: 'failed',
      stage: 'failed',
      outputUrl: '',
      objectKey: '',
      error: 'render_worker_failed',
      detail: String(error?.message || error).slice(0, 500),
      message: renderErrorMessage(error?.message),
      finishedAt: new Date().toISOString(),
    };
  }

  const callbackResult = await postRenderCallback(task, finalJob);
  if (callbackResult.ok && callbackResult.job) finalJob = callbackResult.job;
  await writeRenderStatus(
    task,
    finalJob.status === 'done' ? 'done' : 'failed',
    finalJob,
    { callbackSynced: callbackResult.ok, message: finalJob.message || '' },
  );

  await rm(join(tmpDir, jobId), { recursive: true, force: true }).catch(() => {});
  if (finalJob.objectKey) await unlink(join(outputsDir, `${jobId}.mp4`)).catch(() => {});
  activeRenderTask = null;
  renderQueueRunning = false;
  await persistRenderQueue().catch(() => {});
  setImmediate(processRenderQueue);
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

async function mapLimit(items, limit, task) {
  const source = Array.from(items || []);
  const output = new Array(source.length);
  let cursor = 0;
  let failure = null;
  async function worker() {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= source.length) return;
      try {
        output[index] = await task(source[index], index);
      } catch (error) {
        failure = error;
      }
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(Number(limit) || 1, source.length || 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  if (failure) throw failure;
  return output;
}

function cleanText(value, max = 100) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function textUnits(value) {
  const text = cleanText(value, 240);
  try {
    return Array.from(new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text), (item) => item.segment);
  } catch {
    return Array.from(text);
  }
}

function splitCaptionPhrases(value, target = 13, maximum = 18) {
  const text = cleanText(value, 240);
  if (!text) return [];
  const sentences = text.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]*/g) || [text];
  const output = [];
  for (const sentence of sentences) {
    const normalized = sentence.trim();
    if (!normalized) continue;
    if (Array.from(normalized).length <= maximum) {
      output.push(normalized);
      continue;
    }
    let current = '';
    for (const unit of textUnits(normalized)) {
      const next = `${current}${unit}`;
      if (current && Array.from(next).length > maximum) {
        output.push(current.trim());
        current = unit;
      } else {
        current = next;
      }
      if (Array.from(current).length >= target && /[，。！？；：,.!?;:、\s]$/.test(current)) {
        output.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) output.push(current.trim());
  }
  return output.filter(Boolean);
}

function wrapCaption(value, columns = 14, maxLines = 2) {
  const units = textUnits(value);
  const lines = [];
  let current = '';
  for (const unit of units) {
    const next = `${current}${unit}`;
    if (current && Array.from(next).length > columns && lines.length < maxLines - 1) {
      lines.push(current.trim());
      current = unit;
    } else {
      current = next;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, maxLines).join('\n');
}

function wrapBalancedTitle(value, maximumLength = 24) {
  const units = textUnits(value).slice(0, maximumLength);
  if (units.length <= 11) return units.join('');
  const target = units.length / 2;
  const candidates = [];
  for (let index = 6; index <= units.length - 6; index += 1) {
    const previous = units[index - 1] || '';
    const next = units[index] || '';
    const punctuationBreak = /[，。！？；：、,.!?;:]$/.test(previous) || /^[，。！？；：、,.!?;:]/.test(next);
    const longestLine = Math.max(index, units.length - index);
    const score = Math.abs(index - target) + Math.max(0, longestLine - 12) * 4 - (punctuationBreak ? 2.5 : 0);
    candidates.push({ index, score });
  }
  candidates.sort((left, right) => left.score - right.score);
  const splitAt = candidates[0]?.index || Math.ceil(target);
  return `${units.slice(0, splitAt).join('').trim()}\n${units.slice(splitAt).join('').trim()}`;
}

function captionSchedule(value, duration) {
  const phrases = splitCaptionPhrases(value);
  const safePhrases = phrases.length ? phrases : [cleanText(value, 240)];
  const weights = safePhrases.map((phrase) => Math.max(1, Array.from(phrase).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cursor = 0;
  return safePhrases.map((phrase, index) => {
    const start = cursor;
    const end = index === safePhrases.length - 1
      ? duration
      : Math.min(duration, cursor + duration * weights[index] / total);
    cursor = end;
    return { phrase, start, end };
  });
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

function isAllowedOssUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && /(?:^|\.)aliyuncs\.com$/i.test(url.hostname)
      && /(?:^|\.)oss[-.]/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function extractVoiceSample(body) {
  const sourceUrl = String(body?.sourceUrl || '');
  if (!isAllowedOssUrl(sourceUrl)) {
    return { ok: false, error: 'voice_sample_source_not_allowed' };
  }
  await mkdir(tmpDir, { recursive: true });
  const sampleId = crypto.randomUUID();
  const outputPath = join(tmpDir, `${sampleId}-voice-sample.mp3`);
  try {
    const result = await run('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-i', sourceUrl,
      '-t', '45',
      '-vn', '-map', '0:a:0',
      '-ac', '1', '-ar', '24000', '-b:a', '64k',
      '-f', 'mp3', outputPath,
    ], 180000);
    if (result.code !== 0) {
      const detail = result.stderr.slice(-500);
      const error = /matches no streams|stream map.*0:a/i.test(detail)
        ? 'voice_sample_has_no_audio'
        : 'voice_sample_extract_failed';
      return { ok: false, error, detail };
    }
    const duration = await mediaDuration(outputPath);
    if (duration < 10) return { ok: false, error: 'voice_sample_too_short', duration };
    const info = await stat(outputPath);
    if (info.size > 10 * 1024 * 1024) {
      return { ok: false, error: 'voice_sample_too_large', size: info.size };
    }
    const audio = await readFile(outputPath);
    return {
      ok: true,
      contentType: 'audio/mpeg',
      extension: 'mp3',
      duration,
      size: audio.length,
      audioBase64: audio.toString('base64'),
    };
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

async function downloadAsset(asset, directory) {
  if (!asset?.url) throw new Error('material_url_missing');
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`material_download_failed_${response.status}`);
  const path = join(directory, `${asset.id || crypto.randomUUID()}${safeExt(asset)}`);
  if (!response.body) throw new Error('material_download_empty');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  const info = await stat(path);
  if (!info.size) throw new Error('material_download_empty');
  return path;
}

async function mediaDuration(path) {
  const result = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], 30000);
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function prepareVoiceSegment(path, directory, index) {
  const outputPath = join(directory, `voice-trimmed-${String(index).padStart(3, '0')}.wav`);
  const filter = [
    'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-42dB:start_silence=0.02',
    'areverse',
    'silenceremove=start_periods=1:start_duration=0.06:start_threshold=-42dB:start_silence=0.05',
    'areverse',
    'apad=pad_dur=0.04',
  ].join(',');
  const result = await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-i', path,
    '-vn', '-af', filter, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', outputPath,
  ], 120000);
  if (result.code !== 0) throw new Error(`voice_segment_trim_failed:${result.stderr.slice(-300)}`);
  const duration = await mediaDuration(outputPath);
  if (!(duration > 0.2)) throw new Error('voice_segment_duration_invalid');
  return { path: outputPath, duration };
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

async function renderSegment(jobDir, index, shot, sourcePath, sourceAsset, plannedDuration, titlePath = '', showTitle = false, titleFontSize = 42, sourceStart = 0, usageIndex = 0) {
  const duration = Math.max(0.45, Math.min(60, Number(plannedDuration || shot?.duration || 4)));
  const segmentPath = join(jobDir, `segment-${String(index).padStart(3, '0')}.mp4`);
  const font = pickFont();
  const fontArg = font ? `fontfile=${font}:` : '';
  const textFilters = [];
  if (showTitle && titlePath) {
    textFilters.push(`drawtext=${fontArg}textfile='${filterPath(titlePath)}':fontcolor=white@0.98:fontsize=${titleFontSize}:line_spacing=8:text_shaping=1:x=(w-text_w)/2:y=96:borderw=0:shadowcolor=black@0.95:shadowx=4:shadowy=4`);
  }
  const captions = captionSchedule(shot?.text || '', duration);
  for (let captionIndex = 0; captionIndex < captions.length; captionIndex += 1) {
    const caption = captions[captionIndex];
    const subtitlePath = join(jobDir, `subtitle-${String(index).padStart(3, '0')}-${captionIndex}.txt`);
    const wrapped = wrapCaption(caption.phrase, 14, 2);
    await writeFile(subtitlePath, wrapped, 'utf8');
    const longestLine = Math.max(...wrapped.split('\n').map((line) => Array.from(line).length), 1);
    const fontSize = longestLine <= 10 ? 42 : (longestLine <= 14 ? 38 : 34);
    const start = Math.max(0.01, caption.start).toFixed(3);
    const end = Math.max(Number(start) + 0.08, caption.end - 0.015).toFixed(3);
    textFilters.push(`drawtext=${fontArg}textfile='${filterPath(subtitlePath)}':fontcolor=white:fontsize=${fontSize}:line_spacing=8:text_shaping=1:x=(w-text_w)/2:y=h-text_h-185:box=1:boxcolor=black@0.40:boxborderw=12:enable='between(t,${start},${end})'`);
  }
  const zoomed = Number(usageIndex || 0) % 2 === 1;
  const targetWidth = zoomed ? 756 : 720;
  const targetHeight = zoomed ? 1344 : 1280;
  const vf = [
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase`,
    'crop=720:1280:x=(iw-ow)/2:y=(ih-oh)/2',
    'setsar=1',
    ...textFilters,
  ].join(',');
  const inputArgs = isImage(sourceAsset)
    ? ['-loop', '1', '-framerate', '25', '-i', sourcePath]
    : ['-stream_loop', '-1', '-ss', Math.max(0, Number(sourceStart || 0)).toFixed(3), '-i', sourcePath];
  const result = await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', ...inputArgs,
    '-t', String(duration), '-vf', vf, '-an', '-r', '25',
    '-c:v', 'libx264', '-preset', 'superfast', '-crf', '25', '-threads', '1', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', segmentPath,
  ]);
  if (result.code !== 0) throw new Error(`material_segment_failed:${result.stderr.slice(-300)}`);
  return segmentPath;
}

async function renderVideo(body, req) {
  const pipelineStartedAt = Date.now();
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
  const downloadStartedAt = Date.now();
  const downloadConcurrency = Math.max(1, Math.min(4, Number(process.env.AIVF_DOWNLOAD_CONCURRENCY || 3)));
  await mapLimit(assets, downloadConcurrency, async (asset) => {
    downloaded.set(asset.id, await downloadAsset(asset, jobDir));
  });
  const downloadFinishedAt = Date.now();
  const voice = assets.find((asset) => String(asset.type || '').toLowerCase() === 'voiceover');
  const voiceSegments = visualShots.map((entry) => assetsById.get(String(entry.shot?.voiceoverAssetId || '')));
  const useSegmentedVoice = voiceSegments.length === visualShots.length
    && voiceSegments.every((asset) => String(asset?.type || '').toLowerCase() === 'voiceover' && downloaded.get(asset.id));
  if (!useSegmentedVoice && (!voice || !downloaded.get(voice.id))) return { ok: false, error: 'voice_not_matched' };
  const rawSegmentAudioPaths = useSegmentedVoice ? voiceSegments.map((asset) => downloaded.get(asset.id)) : [];
  const preparedVoiceSegments = useSegmentedVoice
    ? await mapLimit(rawSegmentAudioPaths, 3, (path, index) => prepareVoiceSegment(path, jobDir, index))
    : [];
  const segmentAudioPaths = preparedVoiceSegments.map((item) => item.path);
  const segmentAudioDurations = preparedVoiceSegments.map((item) => item.duration);
  if (useSegmentedVoice && segmentAudioDurations.some((duration) => !(duration > 0))) {
    return { ok: false, error: 'voice_segment_duration_invalid' };
  }
  const durations = useSegmentedVoice
    ? segmentAudioDurations
    : buildSegmentDurations(shots, await mediaDuration(downloaded.get(voice.id)));
  const titleSource = Array.from(cleanText(body?.settings?.headline || body.title || '', 80)).slice(0, 24).join('');
  const titleText = wrapBalancedTitle(titleSource, 24);
  const longestTitleLine = Math.max(...titleText.split('\n').map((line) => Array.from(line).length), 1);
  const titleFontSize = longestTitleLine <= 10 ? 46 : (longestTitleLine <= 12 ? 42 : 38);
  const showTitle = Boolean(titleText)
    && body?.settings?.showHeadline !== false
    && String(body?.settings?.titleStyle || '') !== '不要标题';
  const titlePath = join(jobDir, 'headline.txt');
  if (showTitle) await writeFile(titlePath, titleText, 'utf8');

  const encodeStartedAt = Date.now();
  const visualAssetDurations = new Map();
  await mapLimit(Array.from(new Set(visualShots.map((entry) => entry.asset.id))), 3, async (assetId) => {
    const asset = assetsById.get(assetId);
    visualAssetDurations.set(assetId, isImage(asset) ? 0 : await mediaDuration(downloaded.get(assetId)));
  });
  const assetUsage = new Map();
  const renderEntries = visualShots.map((entry) => {
    const usageIndex = assetUsage.get(entry.asset.id) || 0;
    assetUsage.set(entry.asset.id, usageIndex + 1);
    const sourceDuration = Number(visualAssetDurations.get(entry.asset.id) || 0);
    const segmentDuration = Number(durations[entry.index] || 0);
    const available = Math.max(0, sourceDuration - segmentDuration - 0.15);
    const sourceStart = available > 0.2
      ? ((usageIndex * 3.17) + (entry.index * 1.31)) % available
      : 0;
    return { ...entry, usageIndex, sourceStart };
  });
  const renderConcurrency = Math.max(1, Math.min(2, Number(process.env.AIVF_RENDER_CONCURRENCY || 2)));
  const segments = await mapLimit(renderEntries, renderConcurrency, async (entry) => (
    renderSegment(
      jobDir,
      entry.index,
      entry.shot,
      downloaded.get(entry.asset.id),
      entry.asset,
      durations[entry.index],
      titlePath,
      showTitle,
      titleFontSize,
      entry.sourceStart,
      entry.usageIndex,
    )
  ));
  const encodeFinishedAt = Date.now();
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
  const bgmAsset = assetsById.get(String(body?.settings?.bgmAssetId || ''));
  const bgmPath = String(body?.settings?.bgmMode || '') === '不用 BGM'
    ? ''
    : downloaded.get(bgmAsset?.id);
  const totalDuration = durations.reduce((sum, duration) => sum + Number(duration || 0), 0);
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
    audioFilters.push(`${audioLabels.join('')}concat=n=${audioLabels.length}:v=0:a=1[voice]`);
    const bgmInput = bgmPath ? ['-stream_loop', '-1', '-i', bgmPath] : [];
    if (bgmPath) {
      const bgmInputIndex = segmentAudioPaths.length + 1;
      const bgmFadeOut = Math.max(0, totalDuration - 0.5).toFixed(3);
      audioFilters.push(`[voice]asplit=2[voice_main][voice_side]`);
      audioFilters.push(`[${bgmInputIndex}:a]atrim=start=0:end=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.12,afade=t=in:st=0:d=0.35,afade=t=out:st=${bgmFadeOut}:d=0.5[bed]`);
      audioFilters.push(`[bed][voice_side]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=260[ducked]`);
      audioFilters.push(`[voice_main][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`);
    } else {
      audioFilters.push(`[voice]alimiter=limit=0.95[aout]`);
    }
    mergeArgs = [
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', picturePath, ...audioInputs, ...bgmInput,
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
  const mergeFinishedAt = Date.now();
  const host = req.headers.host || '39.106.109.226';
  let outputObjectKey = '';
  let outputStored = false;
  let outputUploadMs = 0;
  const uploadUrl = String(body?.outputUpload?.url || '');
  if (/^https:\/\/.+aliyuncs\.com\//i.test(uploadUrl)) {
    const outputUploadStartedAt = Date.now();
    try {
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': String(body?.outputUpload?.contentType || 'video/mp4') },
        body: await readFile(outPath),
      });
      if (uploadResponse.ok) {
        outputStored = true;
        outputObjectKey = String(body?.outputUpload?.objectKey || '');
      }
    } catch {}
    outputUploadMs = Date.now() - outputUploadStartedAt;
  }
  const finishedAt = Date.now();
  return {
    ok: true,
    job: {
      id: jobId, type: 'video', status: 'done', title: cleanText(body.title || 'AI 视频成片'),
      outputUrl: `http://${host}/files/outputs/${outFile}`,
      objectKey: outputStored ? outputObjectKey : '',
      outputSize: info.size,
      outputContentType: 'video/mp4',
      provider: 'aliyun-lightweight-ffmpeg-materials-segment-sync', size: info.size,
      subtitleMode: useSegmentedVoice ? 'script-phrase-audio-locked' : 'estimated',
      titleEnabled: showTitle,
      bgmEnabled: Boolean(bgmPath),
      timings: {
        downloadMs: downloadFinishedAt - downloadStartedAt,
        encodeMs: encodeFinishedAt - encodeStartedAt,
        mergeMs: mergeFinishedAt - encodeFinishedAt,
        outputUploadMs,
        totalMs: finishedAt - pipelineStartedAt,
        assetCount: assets.length,
        shotCount: visualShots.length,
      },
      createdAt: new Date(pipelineStartedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString(),
      note: '已按镜头匹配素材库视频并合成克隆配音。',
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && (req.url === '/health.json' || req.url === '/api/health' || req.url === '/api/render/health')) {
      return json(res, 200, {
        ok: true,
        name: 'AI Video Factory material render worker',
        mode: 'async-queue-script-phrase-audio-sync',
        version: '2026-08-01-title-flow-v1',
        queue: { running: renderQueueRunning, waiting: renderQueue.length, limit: renderQueueLimit },
        ffmpeg: true,
        font: pickFont(),
        time: new Date().toISOString(),
      });
    }
    if (req.method === 'POST' && req.url === '/api/videos/generate') {
      const body = await readBody(req);
      if (body?.asyncTask) {
        const pendingCount = renderQueue.length + (activeRenderTask ? 1 : 0);
        if (pendingCount >= renderQueueLimit) {
          return json(res, 429, { ok: false, error: 'render_queue_full', message: '当前剪辑任务较多，请稍后再试。' });
        }
        const task = {
          body,
          host: req.headers.host || '39.106.109.226',
          createdAt: new Date().toISOString(),
        };
        renderQueue.push(task);
        await persistRenderQueue();
        const queuePosition = renderQueue.length + (activeRenderTask ? 1 : 0);
        processRenderQueue();
        return json(res, 202, {
          ok: true,
          job: {
            id: String(body.jobId || ''),
            type: 'video',
            status: 'processing',
            stage: 'queued',
            queuePosition,
            title: cleanText(body.title || 'AI 视频成片'),
            createdAt: task.createdAt,
          },
        });
      }
      const result = await renderVideo(body, req);
      return json(res, result.ok ? 200 : 400, result);
    }
    if (req.method === 'POST' && req.url === '/api/voice-samples/extract') {
      const result = await extractVoiceSample(await readBody(req));
      return json(res, result.ok ? 200 : 400, result);
    }
    return json(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'render_worker_failed', detail: String(error?.message || error).slice(0, 500) });
  }
});

server.listen(port, '127.0.0.1', async () => {
  await restoreRenderQueue();
  processRenderQueue();
  console.log(`AI Video Factory material worker listening on ${port}`);
});
NODE

sudo mv /tmp/aivf-worker.mjs /opt/aivf/worker.mjs
sudo chown admin:admin /opt/aivf/worker.mjs
sudo systemctl restart aivf-worker
sleep 2
curl -fsS http://127.0.0.1/health.json
printf '\nAIVF_MATERIAL_WORKER_READY\n'
