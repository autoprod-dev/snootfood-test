// Client-side image handling: decode with the right EXIF orientation, resize the long edge
// (never upscale), and encode as a good-quality JPEG under a byte budget.

export const FRIDGE_EDGE = 1600;        // long edge sent to the AI for Fridge Chef (keeps label detail)
export const FRIDGE_QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // the relay rejects images over 2 MB

// Browsers that support `image-orientation: from-image` also apply EXIF orientation when
// decoding/drawing images. Older ones (iOS < 13.4) need us to rotate by hand.
const autoOrients = () => typeof CSS !== 'undefined' && !!CSS.supports?.('image-orientation', 'from-image');

// Reads the EXIF Orientation tag (1–8) from JPEG bytes. Returns 1 when absent or not a JPEG.
export function readExifOrientation(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return 1;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
    const size = v.getUint16(off + 2);
    if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      const t = off + 10;
      const little = v.getUint16(t) === 0x4949;
      const g16 = (o) => v.getUint16(o, little), g32 = (o) => v.getUint32(o, little);
      if (g16(t + 2) !== 42) return 1;
      const ifd = t + g32(t + 4);
      if (ifd + 2 > v.byteLength) return 1;
      const n = g16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > v.byteLength) break;
        if (g16(e) === 0x0112) { const o = g16(e + 8); return o >= 1 && o <= 8 ? o : 1; }
      }
      return 1;
    }
    off += 2 + size;
  }
  return 1;
}

// Draws `src` onto a new canvas with the given EXIF orientation applied.
export function drawOriented(src, o) {
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const c = document.createElement('canvas');
  const swap = o >= 5;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const x = c.getContext('2d');
  const T = { 2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, h, 0], 7: [0, -1, -1, 0, h, w], 8: [0, -1, 1, 0, 0, w] }[o];
  if (T) x.setTransform(...T);
  x.drawImage(src, 0, 0);
  return c;
}

// Long-edge fit, never upscaling.
export function fitLongEdge(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

export function resizeTo(src, max) {
  const [w, h] = fitLongEdge(src.width || src.naturalWidth, src.height || src.naturalHeight, max);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  return c;
}

export function dataUrlBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  return Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

// JPEG at `quality`; only steps quality down (gently) if it would blow the byte budget.
export function toJpeg(canvas, quality = FRIDGE_QUALITY, maxBytes = MAX_UPLOAD_BYTES) {
  let c = canvas, q = quality, url = c.toDataURL('image/jpeg', q);
  while (dataUrlBytes(url) > maxBytes && q > 0.7) { q = Math.round((q - 0.05) * 100) / 100; url = c.toDataURL('image/jpeg', q); }
  while (dataUrlBytes(url) > maxBytes && c.width > 640) { c = resizeTo(c, Math.round(Math.max(c.width, c.height) * 0.85)); url = c.toDataURL('image/jpeg', q); }
  return { dataUrl: url, quality: q, bytes: dataUrlBytes(url), width: c.width, height: c.height };
}

// Quick local sanity check so we don't send an all-black or blank photo to the AI.
export function photoCheck(canvas) {
  const s = 64, c = document.createElement('canvas');
  c.width = s; c.height = s;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, s, s);
  const d = x.getImageData(0, 0, s, s).data;
  let sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += l; sq += l * l; }
  const n = d.length / 4, mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return { mean, sd, blank: sd < 6, dark: mean < 18 };
}

// Decodes a File/Blob or URL into something drawable, upright.
export async function decodeImage(fileOrUrl) {
  if (typeof fileOrUrl === 'string') {
    const img = new Image(); img.src = fileOrUrl; await img.decode(); return img;
  }
  if (autoOrients() && 'createImageBitmap' in window) {
    try { return await createImageBitmap(fileOrUrl, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(fileOrUrl);
  let img;
  try { img = new Image(); img.src = url; await img.decode(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  if (autoOrients()) return img;
  const o = readExifOrientation(await fileOrUrl.slice(0, 256 * 1024).arrayBuffer());
  return o > 1 ? drawOriented(img, o) : img;
}
