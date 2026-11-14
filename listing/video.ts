// The demo loop's encoder: still frames held for their time and cross-faded into each other, encoded with `ffmpeg`
// (a dev-time requirement of `pnpm listing`) as MP4 and WebM for the landing page and a GIF for the README, then
// read back with `ffprobe`. Every check throws, so a bad export fails the run before it is committed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Shot {
  /** An opaque PNG at the video's size. */
  png: string;
  /** How long it shows, its incoming cross-fade included. */
  seconds: number;
}

export interface DemoFiles {
  mp4: string;
  webm: string;
  gif: string;
}

const FPS = 30;
/** Cross-fade between two shots. */
const FADE = 0.25;
const GIF = { width: 800, fps: 15, maxBytes: 3_000_000 };
/** The loop's target length, and how far an export may land from it. */
const LOOP = { seconds: 8, slack: 1 };

function run(bin: 'ffmpeg' | 'ffprobe', args: string[]): string {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${bin} is not on PATH: pnpm listing needs ffmpeg (see README)`);
    }
    throw error;
  }
}

/**
 * The shots one after another, each cross-fading into the next, and the last fading back into the first so that
 * the loop restarts on the frame it ends on. Lossless, for the three encodes to start from.
 */
function master(shots: Shot[], out: string): void {
  const [first] = shots;
  if (first === undefined) throw new Error('the demo loop has no shots');
  const loop = [...shots, { png: first.png, seconds: 0 }];
  const inputs = loop.flatMap(({ png, seconds }) => [
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-t',
    String(seconds + FADE),
    '-i',
    png,
  ]);
  const filters = loop.map((_, i) => `[${i}:v]format=gbrp,settb=AVTB[s${i}]`);
  let at = 0;
  let last = 's0';
  for (const [i, { seconds }] of shots.entries()) {
    at += seconds;
    const next = `x${i + 1}`;
    filters.push(`[${last}][s${i + 1}]xfade=transition=fade:duration=${FADE}:offset=${at}[${next}]`);
    last = next;
  }
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    `[${last}]`,
    '-c:v',
    'ffv1',
    out,
  ]);
}

interface Probe {
  width: number;
  height: number;
  duration: number;
  audio: boolean;
}

function probe(file: string): Probe {
  const { streams, format } = JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height:format=duration',
      '-of',
      'json',
      file,
    ]),
  ) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration: string } };
  const video = streams.find(({ codec_type }) => codec_type === 'video');
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    duration: Number(format.duration),
    audio: streams.some(({ codec_type }) => codec_type === 'audio'),
  };
}

function check(file: string, size: { width: number; height: number }): void {
  const { width, height, duration, audio } = probe(file);
  const problems = [
    width === size.width && height === size.height ? '' : `is ${width}×${height}, not ${size.width}×${size.height}`,
    Math.abs(duration - LOOP.seconds) <= LOOP.slack ? '' : `runs ${duration.toFixed(2)} s, not about ${LOOP.seconds} s`,
    audio ? 'has an audio track' : '',
  ].filter((problem) => problem !== '');
  if (problems.length > 0) throw new Error(`${file} ${problems.join(' and ')}`);
}

/** Encodes the loop into `files` and checks each export. */
export function encodeDemo(shots: Shot[], size: { width: number; height: number }, files: DemoFiles): void {
  const work = mkdtempSync(join(tmpdir(), 'speedlink-demo-'));
  try {
    const lossless = join(work, 'master.mkv');
    master(shots, lossless);
    const fromLossless = ['-y', '-v', 'error', '-i', lossless, '-an'];

    run('ffmpeg', [
      ...fromLossless,
      ...['-c:v', 'libx264', '-preset', 'veryslow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
      files.mp4,
    ]);
    run('ffmpeg', [
      ...fromLossless,
      ...['-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'],
      files.webm,
    ]);
    run('ffmpeg', [
      ...fromLossless,
      '-vf',
      `fps=${GIF.fps},scale=${GIF.width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];` +
        '[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
      '-loop',
      '0',
      files.gif,
    ]);

    check(files.mp4, size);
    check(files.webm, size);
    check(files.gif, { width: GIF.width, height: Math.round((GIF.width * size.height) / size.width) });
    const { size: gifBytes } = statSync(files.gif);
    if (gifBytes > GIF.maxBytes) throw new Error(`${files.gif} weighs ${gifBytes} bytes, over ${GIF.maxBytes}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
