// Client-side photo compression: center-cropped square JPEG, max 256px.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // Respects EXIF orientation from phone cameras.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall back to <img> */ }
  }
  return loadImage(file);
}

/**
 * Compress an image File to a JPEG data URL.
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export async function compressImage(file, { maxSize = 256, quality = 0.8 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
  const src = await decode(file);
  const w = src.width;
  const h = src.height;
  if (!w || !h) throw new Error('Could not read that image.');

  // Center-crop to a square — best for identity photos shown as avatars.
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  const out = Math.min(maxSize, side);

  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, out, out);
  if (typeof src.close === 'function') src.close();

  return canvas.toDataURL('image/jpeg', quality);
}

/** Load a data URL / src into an HTMLImageElement (for drawing onto canvas). */
export function loadSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
