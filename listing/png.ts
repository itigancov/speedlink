// Just enough PNG for the Store's rules: read a file's size and alpha, and flatten an RGBA screenshot to an opaque RGB
// one. The Store rejects screenshots and tiles with an alpha channel; icons keep theirs.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const RGB = 2;
const RGBA = 6;
const WHITE = 255;

interface Chunk {
  type: string;
  data: Buffer;
}

export interface PngInfo {
  width: number;
  height: number;
  /** An alpha channel, as a colour type or as a `tRNS` chunk. */
  hasAlpha: boolean;
}

function chunksOf(png: Buffer): Chunk[] {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks: Chunk[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    chunks.push({ type: png.toString('latin1', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

function chunk({ type, data }: Chunk): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function header(chunks: Chunk[]): Buffer {
  const ihdr = chunks.find(({ type }) => type === 'IHDR');
  if (ihdr === undefined) throw new Error('PNG without IHDR');
  return ihdr.data;
}

export function inspect(png: Buffer): PngInfo {
  const chunks = chunksOf(png);
  const ihdr = header(chunks);
  const colorType = ihdr.readUInt8(9);
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    hasAlpha: colorType === 4 || colorType === RGBA || chunks.some(({ type }) => type === 'tRNS'),
  };
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Undoes the per-row filters of 8-bit, non-interlaced image data, in place of a library. */
function unfilter(raw: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const value = raw.readUInt8(y * (stride + 1) + 1 + x);
      const left = x >= bytesPerPixel ? out.readUInt8(y * stride + x - bytesPerPixel) : 0;
      const up = y > 0 ? out.readUInt8((y - 1) * stride + x) : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out.readUInt8((y - 1) * stride + x - bytesPerPixel) : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (predictor === undefined) throw new Error(`PNG row filter ${filter}`);
      out.writeUInt8((value + predictor) & 0xff, y * stride + x);
    }
  }
  return out;
}

/** The same picture as an opaque RGB PNG, laid over white where it was not opaque. An opaque one comes back as it is. */
export function flatten(png: Buffer): Buffer {
  const chunks = chunksOf(png);
  const ihdr = header(chunks);
  const [width, height] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)];
  // Chromium writes a page screenshot as RGB when it is opaque all over: nothing to flatten.
  if (!inspect(png).hasAlpha) return png;
  if (ihdr.readUInt8(8) !== 8 || ihdr.readUInt8(9) !== RGBA || ihdr.readUInt8(12) !== 0) {
    throw new Error('flatten takes an 8-bit, non-interlaced RGBA PNG');
  }
  const idat = Buffer.concat(chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data));
  const rgba = unfilter(inflateSync(idat), width, height, 4);

  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const alpha = rgba.readUInt8(from + 3) / 255;
      for (let channel = 0; channel < 3; channel++) {
        const over = Math.round(rgba.readUInt8(from + channel) * alpha + WHITE * (1 - alpha));
        rows.writeUInt8(over, y * (1 + width * 3) + 1 + x * 3 + channel);
      }
    }
  }

  const next = Buffer.from(ihdr);
  next.writeUInt8(RGB, 9);
  return Buffer.concat([
    SIGNATURE,
    chunk({ type: 'IHDR', data: next }),
    chunk({ type: 'IDAT', data: deflateSync(rows) }),
    chunk({ type: 'IEND', data: Buffer.alloc(0) }),
  ]);
}
