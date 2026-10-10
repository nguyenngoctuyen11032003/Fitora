// Client-side image compression (camera photos can be 5–12 MB).
// Decodes with createImageBitmap honouring EXIF orientation when supported,
// falls back to <img> (modern browsers apply EXIF orientation to <img> by default).

export interface CompressOptions {
  /** Longest side in px (default 1280). */
  maxSide?: number;
  /** 0–1 (default 0.82). */
  quality?: number;
  /** Output MIME type (default 'image/webp'; falls back to JPEG if unsupported). */
  type?: 'image/webp' | 'image/jpeg' | 'image/png';
}

export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  type: string;
}

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(source: Blob): Promise<{ img: Drawable; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { img: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* older Safari: options unsupported / HEIC etc. → try <img> */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được ảnh. Hãy thử ảnh JPG hoặc PNG khác.'));
      el.src = url;
    });
    return { img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Không đọc được ảnh.'));
    r.readAsDataURL(blob);
  });
}

/** Resize + re-encode an image. Throws a Vietnamese Error on failure. */
export async function compressImage(file: Blob, opts: CompressOptions = {}): Promise<CompressedImage> {
  const { maxSide = 1280, quality = 0.82, type = 'image/webp' } = opts;
  if (!file || !file.size) throw new Error('Ảnh trống hoặc không hợp lệ.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Tệp đã chọn không phải là ảnh.');

  const { img, width, height, close } = await decode(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (type !== 'image/png') {
      ctx.fillStyle = '#ffffff'; // transparent PNG → JPEG would turn black
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    let blob = await canvasToBlob(canvas, type, quality);
    // Safari < 17 silently returns PNG (or null) for webp → use JPEG.
    if (!blob || (type === 'image/webp' && blob.type !== 'image/webp')) {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob) throw new Error('Không nén được ảnh. Hãy thử lại.');
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, width: w, height: h, type: blob.type };
  } finally {
    close();
  }
}

/** Grab the current frame of a <video> (live camera) as a JPEG data URL + blob. */
export async function captureVideoFrame(video: HTMLVideoElement, opts: CompressOptions = {}): Promise<CompressedImage> {
  const { maxSide = 1280, quality = 0.82, type = 'image/jpeg' } = opts;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('Camera chưa sẵn sàng.');
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  let blob = await canvasToBlob(canvas, type, quality);
  if (!blob) blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error('Không chụp được khung hình.');
  return { blob, dataUrl: await blobToDataUrl(blob), width: canvas.width, height: canvas.height, type: blob.type };
}
