/* ============================================================
   CLOUDINARY UPLOAD MODULE
   Unsigned upload via Upload API. No SDK needed.
   ============================================================ */

const CLOUD_NAME    = 'dgbkvo1wk';
const UPLOAD_PRESET = 'portfolio_uploads';
const UPLOAD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/* ── Folder mapping ── */
const FOLDERS = {
  cover:   'portfolio/covers',
  gallery: 'portfolio/gallery',
  photo:   'portfolio/profile',
  journey: 'portfolio/journey',
};

/**
 * Upload a single File to Cloudinary.
 *
 * @param {File}     file      - Browser File object
 * @param {string}   target    - 'cover' | 'gallery' | 'photo' | 'journey'
 * @param {Function} [onProgress] - called with 0–100 percentage
 * @returns {Promise<string>}  - secure_url
 */
export async function uploadToCloudinary(file, target = 'gallery', onProgress = null) {
  const folder = FOLDERS[target] ?? 'portfolio/misc';

  const fd = new FormData();
  fd.append('file',         file);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder',        folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL);

    if (onProgress) {
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } catch {
          reject(new Error('Invalid Cloudinary response'));
        }
      } else {
        let msg = `Cloudinary upload failed (${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err?.error?.message) msg = err.error.message;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error',  () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort',  () => reject(new Error('Upload aborted')));

    xhr.send(fd);
  });
}

/**
 * Upload multiple files and return an array of secure_urls.
 * Uploads run in parallel.
 *
 * @param {File[]}   files
 * @param {string}   target
 * @param {Function} [onProgress]  - called with overall 0–100
 * @returns {Promise<string[]>}
 */
export async function uploadManyToCloudinary(files, target = 'gallery', onProgress = null) {
  if (!files.length) return [];

  const progress = new Array(files.length).fill(0);

  const notify = onProgress
    ? (i, pct) => {
        progress[i] = pct;
        const overall = Math.round(progress.reduce((a, b) => a + b, 0) / files.length);
        onProgress(overall);
      }
    : null;

  return Promise.all(
    files.map((file, i) =>
      uploadToCloudinary(file, target, notify ? pct => notify(i, pct) : null)
    )
  );
}
