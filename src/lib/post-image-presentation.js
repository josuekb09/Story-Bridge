export function getPostImagePresentation(variant, image = {}) {
  const smallThumbnail = variant === 'thumbnail';
  const width = image.width || 640;
  const height = image.height || 480;

  return {
    aspectRatio: smallThumbnail ? '1 / 1' : `${width} / ${height}`,
    showLoadingLabel: !smallThumbnail,
    showUnavailableText: !smallThumbnail,
  };
}

export function isPostImageLoaded(image) {
  return image?.complete === true && Number.isFinite(image.naturalWidth) && image.naturalWidth > 0;
}
