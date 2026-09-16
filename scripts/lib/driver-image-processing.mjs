import sharp from 'sharp';

export const driverImageVariants = [
  { name: 'portrait', width: 1200, height: 1500 },
  { name: 'card', width: 700, height: 875 },
  { name: 'thumbnail', width: 320, height: 400 },
];

export const constructorCarVariants = [
  { name: 'hero', width: 1800, height: 600 },
  { name: 'card', width: 1000, height: 400 },
  { name: 'thumbnail', width: 480, height: 192 },
];

export const constructorLogoVariants = [
  { name: 'large', width: 512, height: 512 },
  { name: 'card', width: 256, height: 256 },
  { name: 'thumbnail', width: 128, height: 128 },
];

export const circuitCardVariants = [
  { name: 'hero', width: 1600, height: 900 },
  { name: 'card', width: 960, height: 540 },
  { name: 'thumbnail', width: 480, height: 270 },
];

export const travelPointPhotoVariants = [
  { name: '1280w', width: 1280, height: 720 },
  { name: '640w', width: 640, height: 360 },
  { name: '320w', width: 320, height: 180 },
];

export async function processTravelCategoryIcon(buffer) {
  return sharp(buffer, { density: 96, limitInputPixels: 64_000_000 })
    .resize(96, 96, { fit: 'contain', withoutEnlargement: false })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
}

function normalizedCrop(crop = {}) {
  const number = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
  };
  return {
    zoom: number(crop.zoom, 1, 3, 1),
    x: number(crop.x, -50, 50, 0),
    y: number(crop.y, -50, 50, 0),
  };
}

async function processImageVariants(buffer, variantsDefinition, crop = {}) {
  const inputOptions = { limitInputPixels: 40_000_000, failOn: 'error' };
  const sourceMetadata = await sharp(buffer, inputOptions).metadata();
  const transform = normalizedCrop(crop);
  const variants = [];
  for (const variant of variantsDefinition) {
    const fitted = await sharp(buffer, inputOptions)
      .rotate()
      .resize({
        width: variant.width,
        height: variant.height,
        fit: 'contain',
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const scaledWidth = Math.round(variant.width * transform.zoom);
    const scaledHeight = Math.round(variant.height * transform.zoom);
    const left = Math.round((variant.width - scaledWidth) / 2 + variant.width * transform.x / 100);
    const top = Math.round((variant.height - scaledHeight) / 2 + variant.height * transform.y / 100);
    const positioned = transform.zoom === 1 && transform.x === 0 && transform.y === 0
      ? fitted
      : await sharp(fitted)
        .resize(scaledWidth, scaledHeight, { fit: 'fill' })
        .extend({
          left: Math.max(left, 0),
          top: Math.max(top, 0),
          right: Math.max(variant.width - left - scaledWidth, 0),
          bottom: Math.max(variant.height - top - scaledHeight, 0),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extract({
          left: Math.max(-left, 0),
          top: Math.max(-top, 0),
          width: variant.width,
          height: variant.height,
        })
        .png()
        .toBuffer();
    const bytes = await sharp(positioned)
      .webp({ quality: 84, alphaQuality: 92, smartSubsample: true })
      .toBuffer();
    variants.push({ ...variant, bytes });
  }
  return { sourceMetadata, variants };
}

export function processDriverPortrait(buffer, crop = {}) {
  return processImageVariants(buffer, driverImageVariants, crop);
}

export function processConstructorCar(buffer, crop = {}) {
  return processImageVariants(buffer, constructorCarVariants, crop);
}

export function processConstructorLogo(buffer, crop = {}) {
  return processImageVariants(buffer, constructorLogoVariants, crop);
}

export function processCircuitCard(buffer, crop = {}) {
  return processImageVariants(buffer, circuitCardVariants, crop);
}

export function processTravelPointPhoto(buffer, crop = {}) {
  return processImageVariants(buffer, travelPointPhotoVariants, crop);
}
