export const MAX_BYTES = 10 * 1024 * 1024 - 1;
const OK_TYPES = ['image/jpeg', 'image/png'];

/** Friendly message if the file can't be used, otherwise null. */
export function validateImageFile(file) {
  if (!file) return 'Please choose a photo.';
  if (!OK_TYPES.includes(file.type)) return 'Please use a JPEG or PNG photo.';
  if (file.size === 0) return 'That file is empty. Please choose another photo.';
  return null; // oversize files are shrunk by prepareForUpload; only unshrinkable ones are rejected by the server
}

/**
 * Phone photos are big and rural connections are slow. Shrink to <= maxEdge px JPEG before upload.
 * The AI model only looks at 224 px, so nothing useful is lost. Falls back to the original on any failure.
 */
export async function prepareForUpload(file, { maxEdge = 1600, quality = 0.9, minBytes = 1_500_000 } = {}) {
  try {
    if (typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= minBytes) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // flatten transparent PNGs on white (same as the AI service does)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
