import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateTrackAnnotationPackage, summarizeTrackAnnotationPackage, applyTrackAnnotationPackage } from './import-track-annotations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(root, 'apps/web');
const importerCache = resolve(root, 'tmp/vite-legacy-track-import');
const webRequire = createRequire(resolve(webRoot, 'package.json'));
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const sources = [
  {
    circuitId: 'spa', layoutId: 'be-1925',
    sourceName: 'Spa-Francorchamps of Belgium — Wikimedia Commons (референс, права на контур требуют проверки)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Spa-Francorchamps_of_Belgium.svg',
  },
  {
    circuitId: 'bahrain', layoutId: 'bh-2002',
    sourceName: 'Bahrain Circuit — Total Motorsport (референс, права не подтверждены)',
    sourceUrl: 'https://www.total-motorsport.com/wp-content/uploads/2023/02/Bahrain_Circuit.png',
  },
];

const selected = process.argv.includes('--spa') ? sources.slice(0, 1)
  : process.argv.includes('--bahrain') ? sources.slice(1) : sources;
// This server has a deliberately minimal plugin graph. Sharing the default
// apps/web/node_modules/.vite cache with the running vinext server can replace
// its hashed dependency chunks and break navigation in the open dev session.
const server = await createServer({
  configFile: false,
  root: webRoot,
  cacheDir: importerCache,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { buildLegacyTrackAnnotationPackage } = await server.ssrLoadModule('/app/admin/circuits/[id]/layouts/[layoutId]/annotations/legacy-track-markup.ts');
  for (const source of selected) {
    const data = validateTrackAnnotationPackage(buildLegacyTrackAnnotationPackage(
      source.circuitId, source.layoutId, source.sourceName, source.sourceUrl,
    ));
    console.log(JSON.stringify(summarizeTrackAnnotationPackage(data)));
    if (process.argv.includes('--apply')) {
      const imported = await applyTrackAnnotationPackage(data);
      console.log(`${source.circuitId}: создано кандидатов ${imported}`);
    }
  }
} finally {
  await server.close();
}
