export function preloadImage({ src, srcset, sizes = '100vw' }, ImageConstructor = globalThis.Image) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('Image source is required.'));
    if (typeof ImageConstructor !== 'function') return reject(new Error('Image preloading is unavailable.'));

    const image = new ImageConstructor();
    let settled = false;
    const loaded = async () => {
      if (settled) return;
      settled = true;
      try { await image.decode?.(); } catch { /* The load event still means the browser has image data. */ }
      resolve();
    };
    image.onload = loaded;
    image.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Image failed to load.'));
    };
    if (srcset) image.srcset = srcset;
    if (sizes) image.sizes = sizes;
    image.src = src;
    if (image.complete && image.naturalWidth > 0) loaded();
  });
}
