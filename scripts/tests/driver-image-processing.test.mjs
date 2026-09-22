import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { circuitCardVariants, constructorCarVariants, constructorLogoVariants, driverImageVariants, processCircuitCard, processConstructorCar, processConstructorLogo, processDriverPortrait } from '../lib/driver-image-processing.mjs';

test('портрет преобразуется в три WebP-варианта с альфа-каналом', async () => {
  const source = await sharp({
    create: {
      width: 640,
      height: 800,
      channels: 4,
      background: { r: 20, g: 80, b: 120, alpha: 0.7 },
    },
  }).png().toBuffer();
  const result = await processDriverPortrait(source);
  assert.equal(result.sourceMetadata.format, 'png');
  assert.equal(result.variants.length, driverImageVariants.length);
  for (const [index, variant] of result.variants.entries()) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, driverImageVariants[index].width);
    assert.equal(metadata.height, driverImageVariants[index].height);
    assert.equal(metadata.hasAlpha, true);
  }
});

test('болид преобразуется в широкие WebP-варианты', async () => {
  const source = await sharp({
    create: {
      width: 1600,
      height: 500,
      channels: 4,
      background: { r: 10, g: 90, b: 190, alpha: 0.8 },
    },
  }).png().toBuffer();
  const result = await processConstructorCar(source, { zoom: 1.2, x: -5, y: 3 });
  assert.equal(result.variants.length, constructorCarVariants.length);
  for (const [index, variant] of result.variants.entries()) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, constructorCarVariants[index].width);
    assert.equal(metadata.height, constructorCarVariants[index].height);
  }
});

test('логотип команды преобразуется в квадратные WebP-варианты', async () => {
  const source = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 220, g: 30, b: 50, alpha: 0.8 } } }).png().toBuffer();
  const result = await processConstructorLogo(source);
  assert.equal(result.variants.length, constructorLogoVariants.length);
  for (const [index, variant] of result.variants.entries()) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, constructorLogoVariants[index].width);
    assert.equal(metadata.height, constructorLogoVariants[index].height);
  }
});

test('карточка трассы преобразуется в три широких WebP-варианта', async () => {
  const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 35, g: 85, b: 115 } } }).jpeg().toBuffer();
  const result = await processCircuitCard(source, { zoom: 1.35, x: 8, y: -5 });
  assert.equal(result.variants.length, circuitCardVariants.length);
  for (const [index, variant] of result.variants.entries()) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, circuitCardVariants[index].width);
    assert.equal(metadata.height, circuitCardVariants[index].height);
  }
});

test('вертикальное фото трассы заполняет кадр 16:9 без прозрачных полей', async () => {
  const source = await sharp({ create: { width: 600, height: 1200, channels: 3, background: { r: 205, g: 170, b: 45 } } }).jpeg().toBuffer();
  const result = await processCircuitCard(source);
  for (const variant of result.variants) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.hasAlpha, false);
  }
});

test('кадрирование масштабирует и смещает WebP-портрет без изменения размеров', async () => {
  const source = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 220, g: 30, b: 40, alpha: 1 },
    },
  }).png().toBuffer();
  const centered = await processDriverPortrait(source);
  const cropped = await processDriverPortrait(source, { zoom: 1.8, x: 12, y: -18 });
  assert.notDeepEqual(cropped.variants[1].bytes, centered.variants[1].bytes);
  const metadata = await sharp(cropped.variants[1].bytes).metadata();
  assert.equal(metadata.width, 700);
  assert.equal(metadata.height, 875);
});
