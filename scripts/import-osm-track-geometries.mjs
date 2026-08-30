import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'apps/web/app/data/circuits-openstreetmap.json');
const coreGeometryPath = path.join(repositoryRoot, 'apps/web/app/data/circuits.json');
const overpassUrls = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const osmApiUrls = [
  'https://www.openstreetmap.org/api/0.6',
  'https://api.openstreetmap.org/api/0.6',
];
const historicalOverpassUrl = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

const trackDefinitions = [
  {
    id: 'bh-2020-outer',
    circuitId: 'bahrain',
    name: 'Bahrain International Circuit — Outer Circuit',
    location: 'Sakhir',
    opened: 2004,
    firstGrandPrix: 2020,
    expectedLength: 3543,
    lengthTolerance: 180,
    wayIds: [881756725, 881756731],
    source: 'OpenStreetMap contributors — Outer Circuit',
    sourceUrl: 'https://www.openstreetmap.org/way/881756725',
    license: 'ODbL-1.0',
    build(ways, _historicalRelations, _historicalWays, coreGeometries) {
      const shortcut = stitchWays(this.wayIds.map((id) => ways.get(id)));
      return spliceClosedLoop(coreGeometries.get('bh-2002'), shortcut, this.expectedLength);
    },
  },
  {
    id: 'in-2011',
    circuitId: 'buddh',
    name: 'Buddh International Circuit',
    location: 'Greater Noida',
    opened: 2011,
    firstGrandPrix: 2011,
    expectedLength: 5125,
    wayIds: [188020619, 169886195, 188020614, 188020617, 188020613, 188020620],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'us-1909-indianapolis-oval',
    circuitId: 'indianapolis',
    name: 'Indianapolis Motor Speedway — Oval',
    location: 'Speedway, Indiana',
    opened: 1909,
    firstGrandPrix: 1950,
    expectedLength: 4023,
    lengthTolerance: 100,
    wayIds: [
      588780351, 588780349, 51308226, 588780333, 588780334,
      588780335, 588780332, 588780343, 588780345, 588780347,
    ],
    source: 'OpenStreetMap contributors — Indianapolis Motor Speedway Oval',
    sourceUrl: 'https://www.openstreetmap.org/way/588780351',
    license: 'ODbL-1.0',
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'kr-2010',
    circuitId: 'yeongam',
    name: 'Korean International Circuit',
    location: 'Yeongam',
    opened: 2010,
    firstGrandPrix: 2010,
    expectedLength: 5615,
    wayIds: [234764328, 234764539],
    build(ways) {
      const permanent = ways.get(234764328);
      const grandPrixExtension = ways.get(234764539);
      const startIndex = nearestPointIndex(permanent, grandPrixExtension[0]);
      const endIndex = nearestPointIndex(permanent, grandPrixExtension.at(-1));
      const returnArc = permanent.slice(endIndex).concat(permanent.slice(1, startIndex + 1));
      return joinSegments([grandPrixExtension, returnArc]);
    },
  },
  {
    id: 'jp-1990',
    circuitId: 'okayama',
    name: 'Okayama International Circuit',
    location: 'Mimasaka',
    opened: 1990,
    firstGrandPrix: 1994,
    expectedLength: 3703,
    wayIds: [177330893],
    build(ways) {
      return ways.get(177330893);
    },
  },
  {
    id: 'gb-1931-donington',
    circuitId: 'donington',
    name: 'Donington Park Grand Prix Circuit',
    location: 'Castle Donington',
    opened: 1931,
    firstGrandPrix: 1993,
    expectedLength: 4020,
    relationId: 51165,
    wayIds: [
      841515320,
      841515321,
      841515324,
      28381201,
      842454048,
      841515326,
      841515325,
      841515314,
      242867013,
      841515315,
      842454041,
      842454046,
      841515305,
      841515306,
      841515342,
      841515343,
      841515319,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'es-1985-jerez',
    circuitId: 'jerez',
    name: 'Circuito de Jerez Grand Prix Circuit',
    location: 'Jerez de la Frontera',
    opened: 1985,
    firstGrandPrix: 1986,
    expectedLength: 4428,
    wayIds: [
      80864063,
      80804175,
      773658465,
      773658466,
      773658467,
      773658468,
      2497139,
      773658469,
      773658470,
      773658471,
      773658472,
      773658473,
      773658474,
      773658475,
      773658476,
      773658477,
      2497152,
      773658479,
      773658480,
      773658481,
      773658482,
      773658483,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'us-1989-phoenix',
    circuitId: 'phoenix',
    name: 'Phoenix Street Circuit',
    location: 'Phoenix, Arizona',
    opened: 1989,
    firstGrandPrix: 1989,
    expectedLength: 3798,
    source: 'Wikimedia Commons — Phoenix Grand Prix Route 1989–1990',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Phoenix_Grand_Prix_Route_-_1989,_1990.svg',
    license: 'Public domain',
    coordinates: [
      [-112.07978, 33.44755],
      [-112.07203, 33.44755],
      [-112.07203, 33.44548],
      [-112.07082, 33.44548],
      [-112.07082, 33.44755],
      [-112.06734, 33.44755],
      [-112.06734, 33.45088],
      [-112.06962, 33.45088],
      [-112.06962, 33.44868],
      [-112.07748, 33.44868],
      [-112.07748, 33.44979],
      [-112.07978, 33.44979],
      [-112.07978, 33.44755],
    ],
    build() {
      return this.coordinates;
    },
  },
  {
    id: 'us-1957-riverside-long',
    circuitId: 'riverside',
    name: 'Riverside International Raceway — Long Course',
    location: 'Moreno Valley, California',
    opened: 1957,
    firstGrandPrix: 1960,
    expectedLength: 5271,
    historicalRelationId: 2660779,
    source: 'OpenHistoricalMap contributors — Riverside International Raceway Long Course',
    sourceUrl: 'https://www.openhistoricalmap.org/relation/2660779',
    license: 'CC0-1.0',
    build(_ways, historicalRelations) {
      return stitchWays(historicalRelations.get(this.historicalRelationId));
    },
  },
  {
    id: 'ch-1931-bremgarten',
    circuitId: 'bremgarten',
    name: 'Circuit Bremgarten',
    location: 'Bern',
    opened: 1931,
    firstGrandPrix: 1950,
    expectedLength: 7280,
    historicalWayIds: [199996607],
    source: 'OpenHistoricalMap contributors — Bremgarten-Rundstrecke',
    sourceUrl: 'https://www.openhistoricalmap.org/way/199996607',
    license: 'CC0-1.0',
    build(_ways, _historicalRelations, historicalWays) {
      return historicalWays.get(this.historicalWayIds[0]);
    },
  },
  {
    id: 'fr-1953-reims',
    circuitId: 'reims',
    name: 'Reims-Gueux — Grand Prix Circuit 1953',
    location: 'Gueux',
    opened: 1953,
    firstGrandPrix: 1953,
    expectedLength: 8347,
    historicalWayIds: [
      198754435,
      198754437,
      198754438,
      199998805,
      199998806,
      199998807,
      199998808,
    ],
    source: 'OpenHistoricalMap contributors — Reims-Gueux 1953',
    sourceUrl: 'https://www.openhistoricalmap.org/#map=14/49.26/3.93',
    license: 'CC0-1.0',
    build(_ways, _historicalRelations, historicalWays) {
      return stitchWays(this.historicalWayIds.map((id) => historicalWays.get(id)));
    },
  },
  {
    id: 'fr-1954-reims',
    circuitId: 'reims',
    name: 'Reims-Gueux — Grand Prix Circuit 1954–1972',
    location: 'Gueux',
    opened: 1954,
    firstGrandPrix: 1954,
    expectedLength: 8302,
    lengthTolerance: 320,
    historicalWayIds: [
      198754435,
      198754438,
      199998805,
      199998806,
      199998807,
      199998809,
      199998810,
    ],
    source: 'OpenHistoricalMap contributors — Reims-Gueux 1954–1972',
    sourceUrl: 'https://www.openhistoricalmap.org/#map=14/49.26/3.93',
    license: 'CC0-1.0',
    build(_ways, _historicalRelations, historicalWays) {
      return stitchWays(this.historicalWayIds.map((id) => historicalWays.get(id)));
    },
  },
  {
    id: 'us-1952-sebring',
    circuitId: 'sebring',
    name: 'Sebring International Raceway — Second Circuit',
    location: 'Sebring, Florida',
    opened: 1952,
    firstGrandPrix: 1959,
    expectedLength: 8356,
    historicalRelationId: 2687146,
    source: 'OpenHistoricalMap contributors — Sebring Second Circuit',
    sourceUrl: 'https://www.openhistoricalmap.org/relation/2687146',
    license: 'CC0-1.0',
    build(_ways, historicalRelations) {
      return stitchWays(historicalRelations.get(this.historicalRelationId));
    },
  },
  {
    id: 'za-1934-prince-george',
    circuitId: 'george',
    name: 'Prince George Circuit',
    location: 'East London',
    opened: 1934,
    firstGrandPrix: 1962,
    expectedLength: 3920,
    lengthTolerance: 180,
    relationId: 2579523,
    wayIds: [777288030, 123210653, 1260448825, 776766332],
    source: 'OpenStreetMap contributors — Prince George Circuit',
    sourceUrl: 'https://www.openstreetmap.org/relation/2579523',
    license: 'ODbL-1.0',
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'es-2008-valencia',
    circuitId: 'valencia',
    name: 'Valencia Street Circuit',
    location: 'Valencia',
    opened: 2008,
    firstGrandPrix: 2008,
    expectedLength: 5419,
    relationId: 280461,
    wayIds: [
      653270170,
      41975746,
      186940565,
      41975466,
      186940563,
      23524460,
      677297844,
      119179536,
      119179532,
      464103236,
      1325526830,
      715880704,
      157386399,
      119179509,
      1264457288,
      1325526829,
      23509415,
      168839121,
      582629828,
      1325526834,
    ],
    build(ways) {
      return closeLoop(stitchWays(this.wayIds.map((id) => ways.get(id)), 220), 250);
    },
  },
  {
    id: 'gb-1950-brands-hatch-gp',
    circuitId: 'brands_hatch',
    name: 'Brands Hatch Grand Prix Circuit',
    location: 'West Kingsdown',
    opened: 1950,
    firstGrandPrix: 1964,
    expectedLength: 3908,
    relationId: 7218462,
    wayIds: [
      25804999,
      25805047,
      171570163,
      25805049,
      171570165,
      25805072,
      171570251,
      171570252,
      820329315,
      25804641,
      171570166,
      25805012,
      25804653,
      171570161,
      25804669,
      171570167,
      25804846,
      25804824,
      25804875,
      820329314,
      171570164,
      25804935,
      171570162,
      4906929,
      25804993,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'jp-2005-fuji',
    circuitId: 'fuji',
    name: 'Fuji Speedway',
    location: 'Oyama',
    opened: 1965,
    firstGrandPrix: 1976,
    expectedLength: 4563,
    wayIds: [148622740],
    build(ways) {
      return ways.get(148622740);
    },
  },
  {
    id: 'es-1967-jarama',
    circuitId: 'jarama',
    name: 'Circuito del Jarama',
    location: 'San Sebastián de los Reyes',
    opened: 1967,
    firstGrandPrix: 1968,
    expectedLength: 3850,
    wayIds: [15732824],
    build(ways) {
      return ways.get(15732824);
    },
  },
  {
    id: 'be-1963-zolder',
    circuitId: 'zolder',
    name: 'Circuit Zolder',
    location: 'Heusden-Zolder',
    opened: 1963,
    firstGrandPrix: 1973,
    expectedLength: 4011,
    relationId: 6006460,
    wayIds: [
      399996026, 399996027, 399996028, 399996029, 399996030, 399996031,
      400001988, 444633116, 399996032, 400001987, 43014732, 444633113,
      444633112, 400001985, 400001986, 399996022, 399996023, 399996024,
      444633115, 399996025, 399996021, 444633114,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'fr-1972-dijon',
    circuitId: 'dijon',
    name: 'Circuit Dijon-Prenois',
    location: 'Prenois',
    opened: 1972,
    firstGrandPrix: 1974,
    expectedLength: 3801,
    relationId: 14474019,
    wayIds: [
      242987764, 1272266642, 1272266643, 242987767, 242987765,
      242987768, 29699123, 242987766, 242987763, 242987769,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'se-1968-anderstorp',
    circuitId: 'anderstorp',
    name: 'Anderstorp Raceway',
    location: 'Anderstorp',
    opened: 1968,
    firstGrandPrix: 1973,
    expectedLength: 4025,
    wayIds: [
      167798646, 172893761, 172893765, 172893770, 172893772,
      172893775, 172893776, 172893778, 172893779, 172893780,
      172893781, 172893782, 172893784, 438310724, 438314326,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'ca-1961-mosport',
    circuitId: 'mosport',
    name: 'Mosport International Raceway',
    location: 'Bowmanville',
    opened: 1961,
    firstGrandPrix: 1967,
    expectedLength: 3957,
    wayIds: [
      1315971774, 1315971775, 1315971776, 1315971777,
      1315971778, 1315971779, 1315971780, 1315971781, 37059242,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'es-1933-montjuic',
    circuitId: 'montjuic',
    name: 'Circuit de Montjuïc',
    location: 'Barcelona',
    opened: 1933,
    firstGrandPrix: 1969,
    expectedLength: 3791,
    relationId: 1147249,
    wayIds: [
      547955844, 547959096, 51444047, 280408879, 478449384,
      237529467, 246548947, 16365469, 1550484407, 76168862,
      1545997753, 1545997754, 1545997751, 76168861, 861187867,
      76168867, 4750715, 74441348, 908679097, 1185225902,
      1185225904, 76168865, 309197857, 908679098, 76168866,
      309197858, 237529466, 28461046, 557145480, 294123484,
      28461045,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)), 30);
    },
  },
  {
    id: 'ca-1964-mont-tremblant',
    circuitId: 'tremblant',
    name: 'Circuit Mont-Tremblant Full Course',
    location: 'Mont-Tremblant',
    opened: 1964,
    firstGrandPrix: 1968,
    expectedLength: 4265,
    relationId: 17620722,
    wayIds: [
      1285316409, 1285316410, 1285316411, 1285316414,
      176774725, 1285316413, 1285316412,
    ],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
];

function samePoint(a, b, tolerance = 1e-7) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function joinSegments(segments) {
  const result = [];
  for (const segment of segments) {
    if (!segment?.length) throw new Error('OSM вернул пустой участок трассы');
    if (result.length === 0) {
      result.push(...segment);
      continue;
    }
    if (samePoint(result.at(-1), segment[0])) result.push(...segment.slice(1));
    else result.push(...segment);
  }
  return result;
}

function stitchWays(segments, toleranceMeters = 1) {
  const remaining = segments.map((segment) => [...segment]);
  const result = remaining.shift();
  while (remaining.length > 0) {
    const tail = result.at(-1);
    const candidates = remaining.map((segment, index) => {
      const startDistance = haversineDistance(tail, segment[0]);
      const endDistance = haversineDistance(tail, segment.at(-1));
      return {
        index,
        distance: Math.min(startDistance, endDistance),
        reverse: endDistance < startDistance,
      };
    });
    const nearest = candidates.reduce((best, candidate) => (
      candidate.distance < best.distance ? candidate : best
    ));
    if (nearest.distance > toleranceMeters) {
      throw new Error(`Не удалось соединить OSM-участки: разрыв ${Math.round(nearest.distance)} м`);
    }
    const index = nearest.index;
    const [next] = remaining.splice(index, 1);
    if (nearest.reverse) next.reverse();
    if (samePoint(tail, next[0])) result.push(...next.slice(1));
    else result.push(...next);
  }
  return result;
}

function nearestPointIndex(coordinates, target) {
  return coordinates.reduce(
    (best, coordinate, index) => {
      const distance = haversineDistance(coordinate, target);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY },
  ).index;
}

function spliceClosedLoop(baseCoordinates, detourCoordinates, expectedLength) {
  const base = samePoint(baseCoordinates[0], baseCoordinates.at(-1))
    ? baseCoordinates.slice(0, -1)
    : baseCoordinates;
  const startIndex = nearestPointIndex(base, detourCoordinates[0]);
  const endIndex = nearestPointIndex(base, detourCoordinates.at(-1));
  const arc = (from, to) => from <= to
    ? base.slice(from, to + 1)
    : base.slice(from).concat(base.slice(0, to + 1));
  const forward = joinSegments([
    detourCoordinates,
    arc(endIndex, startIndex),
  ]);
  const reverseDetour = [...detourCoordinates].reverse();
  const reverse = joinSegments([
    reverseDetour,
    arc(startIndex, endIndex),
  ]);
  const candidates = [forward, reverse].map((coordinates) => closeLoop(coordinates, 200));
  return candidates.reduce((best, candidate) => (
    Math.abs(lineLength(candidate) - expectedLength) < Math.abs(lineLength(best) - expectedLength)
      ? candidate
      : best
  ));
}

function closeLoop(coordinates, maxGapMeters) {
  if (samePoint(coordinates[0], coordinates.at(-1))) return coordinates;
  const gap = haversineDistance(coordinates.at(-1), coordinates[0]);
  if (gap > maxGapMeters) {
    throw new Error(`Не удалось замкнуть контур: разрыв ${Math.round(gap)} м`);
  }
  return coordinates.concat([coordinates[0]]);
}

function haversineDistance(a, b) {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeDelta = (b[1] - a[1]) * radians;
  const longitudeDelta = (b[0] - a[0]) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function lineLength(coordinates) {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + haversineDistance(coordinates[index], coordinate),
    0,
  );
}

function boundingBox(coordinates) {
  return coordinates.reduce(
    ([west, south, east, north], [longitude, latitude]) => [
      Math.min(west, longitude),
      Math.min(south, latitude),
      Math.max(east, longitude),
      Math.max(north, latitude),
    ],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  );
}

async function fetchWays(ids, batchSize = 20) {
  const ways = new Map();
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    const query = `[out:json][timeout:45];way(id:${batch.join(',')});out tags geom;`;
    let payload;
    for (const overpassUrl of overpassUrls) {
      try {
        const response = await fetch(`${overpassUrl}?data=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (track geometry import)' },
        });
        if (!response.ok) continue;
        payload = await response.json();
        break;
      } catch {
        // Пробуем следующее зеркало Overpass.
      }
    }
    if (payload) {
      for (const way of payload.elements) {
        ways.set(way.id, way.geometry.map(({ lon, lat }) => [lon, lat]));
      }
      continue;
    }

    const fallbackWays = [];
    for (const id of batch) {
      let fallbackPayload;
      for (const osmApiUrl of osmApiUrls) {
        try {
          const response = await fetch(`${osmApiUrl}/way/${id}/full.json`, {
            headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (track geometry import)' },
          });
          if (!response.ok) continue;
          fallbackPayload = await response.json();
          break;
        } catch {
          // Пробуем второй официальный адрес API.
        }
      }
      if (!fallbackPayload) throw new Error(`OSM API не вернул way/${id}`);
      const nodes = new Map(
        fallbackPayload.elements
          .filter((element) => element.type === 'node')
          .map((node) => [node.id, [node.lon, node.lat]]),
      );
      const way = fallbackPayload.elements.find((element) => element.type === 'way' && element.id === id);
      if (!way) throw new Error(`OSM API не вернул way/${id}`);
      fallbackWays.push([id, way.nodes.map((nodeId) => nodes.get(nodeId))]);
    }
    for (const [id, coordinates] of fallbackWays) {
      ways.set(id, coordinates);
    }
  }
  return ways;
}

async function fetchRelationWays(relationId, requiredWayIds) {
  for (const osmApiUrl of osmApiUrls) {
    try {
      const response = await fetch(`${osmApiUrl}/relation/${relationId}/full.json`, {
        headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (track geometry import)' },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const nodes = new Map(
        payload.elements
          .filter((element) => element.type === 'node')
          .map((node) => [node.id, [node.lon, node.lat]]),
      );
      const requiredIds = new Set(requiredWayIds);
      return new Map(
        payload.elements
          .filter((element) => element.type === 'way' && requiredIds.has(element.id))
          .map((way) => [way.id, way.nodes.map((nodeId) => nodes.get(nodeId))]),
      );
    } catch {
      // Пробуем второй официальный адрес API.
    }
  }
  return new Map();
}

async function fetchHistoricalPayload(query, description) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${historicalOverpassUrl}?data=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (historical track geometry import)' },
      });
      if (response.ok) return response.json();
      lastError = new Error(`${description}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${description}: OpenHistoricalMap недоступен`, { cause: lastError });
}

async function fetchHistoricalRelation(relationId) {
  const query = `[out:json][timeout:45];relation(${relationId});out body geom;`;
  const payload = await fetchHistoricalPayload(query, `relation/${relationId}`);
  const relation = payload.elements.find(
    (element) => element.type === 'relation' && element.id === relationId,
  );
  if (!relation) throw new Error(`OpenHistoricalMap не вернул relation/${relationId}`);

  return relation.members
    .filter((member) => member.type === 'way' && member.geometry?.length)
    .map((member) => {
      const coordinates = member.geometry.map(({ lon, lat }) => [lon, lat]);
      return member.role === 'backward' ? coordinates.reverse() : coordinates;
    });
}

async function fetchHistoricalWays(ids) {
  if (ids.length === 0) return new Map();
  const query = `[out:json][timeout:45];way(id:${ids.join(',')});out tags geom;`;
  const payload = await fetchHistoricalPayload(query, 'Исторические участки');
  return new Map(
    payload.elements
      .filter((element) => element.type === 'way' && element.geometry?.length)
      .map((way) => [way.id, way.geometry.map(({ lon, lat }) => [lon, lat])]),
  );
}

const coreCollection = JSON.parse(await readFile(coreGeometryPath, 'utf8'));
const coreGeometries = new Map(
  coreCollection.features.map((feature) => [feature.properties.id, feature.geometry.coordinates]),
);

let cachedFeatures = new Map();
if (!process.argv.includes('--refresh')) {
  try {
    const cachedCollection = JSON.parse(await readFile(outputPath, 'utf8'));
    cachedFeatures = new Map(
      cachedCollection.features.map((feature) => [feature.properties.id, feature]),
    );
  } catch {
    // Первый импорт выполняется без кэша.
  }
}

const tracksToBuild = trackDefinitions.filter((track) => !cachedFeatures.has(track.id));
const ways = new Map();
const historicalRelations = new Map();
const historicalWayIds = [...new Set(
  tracksToBuild.flatMap((track) => track.historicalWayIds ?? []),
)];
const historicalWays = await fetchHistoricalWays(historicalWayIds);
for (const track of tracksToBuild.filter((definition) => definition.relationId)) {
  const relationWays = await fetchRelationWays(track.relationId, track.wayIds ?? []);
  for (const [id, coordinates] of relationWays) ways.set(id, coordinates);
}
for (const track of tracksToBuild.filter((definition) => definition.historicalRelationId)) {
  historicalRelations.set(
    track.historicalRelationId,
    await fetchHistoricalRelation(track.historicalRelationId),
  );
}
const missingWayIds = [...new Set(
  tracksToBuild.flatMap((track) => track.wayIds ?? []).filter((id) => !ways.has(id)),
)];
const fetchedWays = await fetchWays(missingWayIds);
for (const [id, coordinates] of fetchedWays) ways.set(id, coordinates);
const features = trackDefinitions.map((track) => {
  const cachedFeature = cachedFeatures.get(track.id);
  if (cachedFeature) return cachedFeature;
  const coordinates = track.build(ways, historicalRelations, historicalWays, coreGeometries);
  if (!samePoint(coordinates[0], coordinates.at(-1), 2e-5)) {
    throw new Error(`${track.name}: контур не замкнут`);
  }
  const measuredLength = Math.round(lineLength(coordinates));
  if (Math.abs(measuredLength - track.expectedLength) > (track.lengthTolerance ?? 180)) {
    throw new Error(`${track.name}: длина ${measuredLength} м не совпадает с ожидаемой ${track.expectedLength} м`);
  }
  return {
    type: 'Feature',
    properties: {
      id: track.id,
      circuitId: track.circuitId,
      Location: track.location,
      Name: track.name,
      opened: track.opened,
      firstgp: track.firstGrandPrix,
      length: measuredLength,
      source: track.source ?? 'OpenStreetMap contributors',
      sourceUrl: track.sourceUrl ?? 'https://www.openstreetmap.org/copyright',
      sourceRelationId: track.relationId,
      sourceHistoricalRelationId: track.historicalRelationId,
      sourceHistoricalWayIds: track.historicalWayIds,
      license: track.license ?? 'ODbL-1.0',
      checkedAt: '2026-08-26',
    },
    bbox: boundingBox(coordinates),
    geometry: { type: 'LineString', coordinates },
  };
});

const collection = {
  type: 'FeatureCollection',
  name: 'f1-circuits-openstreetmap',
  bbox: boundingBox(features.flatMap((feature) => feature.geometry.coordinates)),
  features,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Записано трасс: ${features.length}`);
for (const feature of features) {
  console.log(`${feature.properties.circuitId}: ${feature.properties.length} м`);
}
