import { createHash } from 'node:crypto';
import { env } from 'cloudflare:workers';
import {
  getDirectAdminDashboard,
  getDirectAdminSeasons,
  isAdminSupabaseConfigured,
  saveDirectAdminSeason,
} from './supabase-admin';

export type AdminDriver = {
  id: string;
  givenName: string;
  familyName: string;
  abbreviation: string | null;
  permanentNumber: number | null;
  nationality: string | null;
  driverSourceId: string | null;
  driverUpdatedAt: string;
  nameRu: string | null;
  birthDate: string | null;
  birthPlaceRu: string | null;
  deathDate: string | null;
  heightCm: string | null;
  weightKg: string | null;
  biographyRu: string | null;
  nicknames: Array<{ id: string; nameRu: string; nameOriginal: string | null; contextRu: string | null; sourceUrl: string; reviewStatus: string }>;
  quotes: Array<{ id: string; quoteRu: string; quoteOriginal: string | null; attributionRu: string; contextRu: string | null; quoteDate: string | null; sourceUrl: string; reviewStatus: string }>;
  reviewStatus: string;
  profileSourceId: string | null;
  profileUpdatedAt: string | null;
  nameRuReviewStatus: string | null;
  nameRuSourceId: string | null;
  nameRuSourceUrl: string | null;
  nameRuSourceNote: string | null;
  photo: {
    url: string;
    altTextRu: string;
    author: string;
    licence: string;
    sourceUrl: string;
    rightsStatus: string;
    reviewStatus: string;
  } | null;
};

export type AdminDriverInput = Pick<AdminDriver,
  'id' | 'nameRu' | 'birthDate' | 'birthPlaceRu' | 'deathDate' | 'heightCm' | 'weightKg' | 'biographyRu'
> & { sourceUrl: string };

export type AdminDriverPhotoInput = {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  altTextRu: string;
  author: string;
  licence: string;
  sourceUrl: string;
  removeBackground: boolean;
  previewToken: string;
  cropZoom: number;
  cropX: number;
  cropY: number;
};

export type AdminDriverPhotoPreviewInput = Pick<AdminDriverPhotoInput,
  'id' | 'fileName' | 'mimeType' | 'bytes' | 'removeBackground'
>;

export type AdminConstructorEntry = {
  season: number;
  constructorId: string;
  displayName: string;
  engineName: string | null;
  teamColour: string | null;
  carModel: string | null;
  carImageUrl: string | null;
  logoImageUrl: string | null;
  editorialSourceUrl: string | null;
  carMedia: {
    altTextRu: string;
    author: string;
    licence: string;
    sourceUrl: string;
    rightsStatus: string;
    reviewStatus: string;
  } | null;
  logoMedia: {
    altTextRu: string;
    author: string;
    licence: string;
    sourceUrl: string;
    rightsStatus: string;
    reviewStatus: string;
  } | null;
};

export type AdminConstructorCarInput = {
  season: number;
  constructorId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  altTextRu: string;
  author: string;
  licence: string;
  sourceUrl: string;
  removeBackground: boolean;
  previewToken: string;
  cropZoom: number;
  cropX: number;
  cropY: number;
};

export type AdminConstructorEntryInput = Pick<AdminConstructorEntry,
  'season' | 'constructorId' | 'displayName' | 'engineName' | 'teamColour' | 'carModel'
> & { sourceUrl: string };

export type AdminConstructorLineage = {
  id: number;
  predecessorConstructorId: string;
  predecessorName: string;
  successorConstructorId: string;
  successorName: string;
  relationshipType: 'rename' | 'ownership_change' | 'factory_takeover' | 'licence_transfer' | 'continuation' | 'other';
  validFromYear: number | null;
  validToYear: number | null;
  descriptionRu: string | null;
  reviewStatus: 'candidate' | 'reviewed' | 'published' | 'rejected';
  sourceUrl: string;
  verifiedAt: string | null;
};

export type AdminConstructorLineageInput = Omit<AdminConstructorLineage,
  'id' | 'predecessorName' | 'successorName' | 'verifiedAt'
>;

export type AdminConstructorIdentity = {
  id: string;
  name: string;
  firstSeason: number | null;
  latestSeason: number | null;
};

export type AdminHistoryEraStatus = 'draft' | 'review' | 'published';
export type AdminHistoryEraBlockType = 'text' | 'media' | 'quote' | 'timeline' | 'entities';
export type AdminHistoryEraMediaPosition = 'left' | 'right' | 'wide';

export type AdminHistoryEraSummary = {
  slug: string;
  startYear: number;
  endYear: number | null;
  yearsLabel: string;
  titleRu: string;
  summaryRu: string;
  editorialStatus: AdminHistoryEraStatus;
  heroMediaAssetId: string | null;
  blockCount: number;
  publishedBlockCount: number;
  updatedAt: string;
};

export type AdminHistoryEraBlock = {
  id: number;
  eraSlug: string;
  sortOrder: number;
  blockType: AdminHistoryEraBlockType;
  eyebrowRu: string | null;
  titleRu: string | null;
  bodyRu: string | null;
  mediaAssetId: string | null;
  mediaPosition: AdminHistoryEraMediaPosition;
  sourceUrl: string | null;
  editorialStatus: AdminHistoryEraStatus;
  updatedAt: string;
};

export type AdminHistoryEraDetail = {
  era: AdminHistoryEraSummary;
  blocks: AdminHistoryEraBlock[];
};

export type AdminHistoryEraInput = Pick<AdminHistoryEraSummary,
  'yearsLabel' | 'titleRu' | 'summaryRu' | 'editorialStatus' | 'heroMediaAssetId'
>;

export type AdminHistoryEraBlockInput = Omit<AdminHistoryEraBlock, 'id' | 'eraSlug' | 'updatedAt'>;
export type AdminHistoryEraBlockContentInput = Omit<AdminHistoryEraBlockInput, 'sortOrder'>;

export type AdminDriverListItem = {
  id: string;
  nameRu: string;
  birthDate: string | null;
  birthPlaceRu: string | null;
  deathDate: string | null;
  heightCm: string | null;
  weightKg: string | null;
  sourceUrl: string | null;
  firstSeason: number;
  latestSeason: number;
  seasonCount: number;
  latestTeam: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
};

export type AdminDatabaseSummary = {
  catalogDrivers: number;
  databaseDrivers: number;
  birthPlaces: number;
  deathDates: number;
  driverPhotos: number;
  unresolvedLifeData: number;
};

export type AdminSeason = {
  year: number; status: 'planned' | 'active' | 'completed' | 'cancelled';
  roundsPlanned: number | null; racesAvailable: number; sourceId: string | null;
  sourceUrl: string | null; updatedAt: string;
};

export type AdminEvent = {
  id: string; seasonYear: number; round: number; name: string;
  raceDate: string | null; startTimeUtc: string | null;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';
  circuitId: string; circuitName: string; layoutId: string | null; layoutName: string | null;
  sourceUrl: string | null; sessionCount: number; completedSessionCount: number; resultCount: number;
  winner: { id: string; name: string } | null; updatedAt: string;
};

export type AdminEventRegistry = {
  rows: AdminEvent[]; filteredCount: number; page: number; limit: number;
  seasons: number[]; circuits: Array<{ id: string; name: string }>;
};

export type AdminEventEditorOptions = {
  seasons: number[];
  circuits: Array<{ id: string; name: string; layouts: Array<{
    id: string; name: string; validFromYear: number | null; validToYear: number | null; reviewStatus: string;
  }> }>;
};

export type AdminEventInput = {
  id: string; seasonYear: number; round: number; name: string;
  raceDate: string | null; startTimeUtc: string | null;
  status: AdminEvent['status']; circuitId: string; layoutId: string | null;
  sourceUrl: string; sourceVerified: boolean;
};

export type AdminEventSession = {
  id: string; raceId: string;
  sessionType: 'practice_1' | 'practice_2' | 'practice_3' | 'qualifying' | 'sprint_shootout' | 'sprint' | 'race';
  name: string; startsAt: string | null; endsAt: string | null;
  status: AdminEvent['status']; sourceUrl: string | null; resultCount: number; updatedAt: string;
};

export type AdminSessionResult = {
  driverId: string; driverName: string; positionOrder: number; positionText: string;
  constructorEntryId: number | null; constructorName: string | null;
  gridPosition: number | null; laps: number | null; status: string | null; points: number;
  elapsedMs: number | null; gapMs: number | null; gapText: string | null; sourceUrl: string | null;
  fastestLapRank: number | null; fastestLapNumber: number | null; fastestLapMs: number | null;
  q1Ms: number | null; q2Ms: number | null; q3Ms: number | null; penaltyNote: string | null;
};

export type AdminEventSessionBundle = {
  event: Pick<AdminEvent, 'id' | 'seasonYear' | 'round' | 'name'>;
  session: AdminEventSession;
  results: AdminSessionResult[];
  drivers: Array<{ id: string; name: string }>;
  constructors: Array<{ id: number; name: string }>;
};

export type AdminEventSessionInput = Pick<AdminEventSession, 'id' | 'raceId' | 'sessionType' | 'name' | 'startsAt' | 'endsAt' | 'status'> & {
  sourceUrl: string; sourceVerified: boolean;
};

export type AdminSessionResultInput = Omit<AdminSessionResult, 'driverName' | 'constructorName' | 'sourceUrl'> & {
  sessionId: string; raceId: string; originalDriverId: string | null; sourceUrl: string; sourceVerified: boolean;
};

export type AdminCircuitSummary = {
  id: string; officialName: string; shortName: string | null; nameRu: string | null;
  cityRu: string | null; countryRu: string | null; countryCode: string; circuitType: string;
  profileStatus: 'draft' | 'review' | 'published' | null; slug: string | null;
  firstSeason: number | null; lastSeason: number | null; races: number;
  layoutCount: number; reviewedLayouts: number; verifiedLayouts: number; unresolvedLayouts: number;
  unassignedRaces: number; statsCount: number; historyCount: number; mediaCount: number; annotationCount: number;
  coreReady: boolean; completenessPercent: number; missingAreas: string[];
};

export type AdminCircuitLayout = {
  id: string; name: string; validFromYear: number | null; validToYear: number | null;
  lengthM: number | null; turns: number | null; direction: string | null;
  elevationMinM: number | null; elevationMaxM: number | null; hasGeometry: boolean;
  centerlineGeoJson: { type: 'LineString'; coordinates: number[][] } | null;
  provenanceType: string; reviewStatus: string; verifiedAt: string | null;
  sourceUrl: string | null; raceCount: number;
};

export type AdminTrackLayoutInput = {
  id: string; circuitId: string; name: string; validFromYear: number | null; validToYear: number | null;
  lengthM: number | null; turns: number | null; direction: string | null;
  elevationMinM: number | null; elevationMaxM: number | null;
  provenanceType: 'unknown' | 'official' | 'open_data' | 'user_digitized';
  reviewStatus: 'candidate' | 'reviewed' | 'published' | 'rejected';
  sourceUrl: string; sourceName: string | null; sourceNotes: string | null; sourceVerified: boolean;
};

export type AdminTrackGeometryInspection = {
  geometry: { type: 'LineString'; coordinates: number[][] };
  direction: 'clockwise' | 'counterclockwise';
  pointCount: number; measuredLengthM: number; maximumDistanceM: number;
  expectedLengthM: number | null; lengthDeviationPercent: number | null; warnings: string[];
  layout: { id: string; name: string; provenanceType: string; reviewStatus: string; sourceUrl: string | null };
};

export type AdminTrackAnnotation = {
  id:string;annotationType:'sector'|'turn'|'straight'|'timing_line'|'drs_zone'|'drs_detection'|'straight_mode_zone'|'straight_mode_activation'|'straight_mode_low_grip_activation'|'overtake_detection'|'overtake_activation';
  labelRu:string|null;labelOriginal:string|null;sequence:number|null;descriptionRu:string|null;
  geometryGeoJson:{type:'Point';coordinates:number[]}|{type:'LineString';coordinates:number[][]};
  calloutPoint:number[]|null;
  validFromYear:number|null;validToYear:number|null;reviewStatus:'candidate'|'reviewed'|'published'|'hidden';
  verifiedAt:string|null;revision:string;sourceName:string|null;sourceUrl:string|null;sourceNotes:string|null;
};

export type AdminTrackAnnotationRegistry = {
  circuit:{id:string;name:string};layout:{id:string;name:string;validFromYear:number|null;validToYear:number|null;
    centerlineGeoJson:{type:'LineString';coordinates:number[][]}|null};annotations:AdminTrackAnnotation[];
};

export type AdminTrackAnnotationImportPreview = {
  token:string;expiresAt:number;
  circuit:{id:string;name:string};layout:{id:string;name:string};
  summary:{circuitId:string;layoutId:string;features:number;byType:Record<string,number>};
  features:Array<{id:string;annotationType:AdminTrackAnnotation['annotationType'];label:string|null;sequence:number|null;
    validFromYear:number|null;validToYear:number|null;maximumDistanceToTrackM:number;
    geometry:{type:'Point';coordinates:number[]}|{type:'LineString';coordinates:number[][]}}>;
};

export type AdminCircuit = {
  id: string; officialName: string; shortName: string | null; locality: string | null;
  countryCode: string; circuitType: string; longitude: number; latitude: number;
  openedYear: number | null; websiteUrl: string | null; circuitSourceId: string | null;
  updatedAt: string;
  cardImage: null | {
    id: string; url: string; altTextRu: string; author: string; licence: string; sourceUrl: string;
    rightsStatus: string; reviewStatus: string;
  };
  profile: null | {
    slug: string; geometryId: string | null; nameRu: string; cityRu: string; countryRu: string;
    summaryRu: string | null; circuitTypeRu: string | null;
    editorialStatus: 'draft' | 'review' | 'published'; sourceId: string | null; sourceUrl: string | null;
  };
  layouts: AdminCircuitLayout[];
};

export type AdminCircuitCardImageInput = {
  id: string; fileName: string; mimeType: string; bytes: ArrayBuffer;
  altTextRu: string; author: string; licence: string; sourceUrl: string;
  previewToken: string; cropZoom: number; cropX: number; cropY: number;
};

export type AdminGameLogoInput = {
  gameId: 'outline' | 'map' | 'driver-geography' | 'calendar-optimizer'; fileName: string; mimeType: string; bytes: ArrayBuffer;
  altTextRu: string; author: string; licence: string; sourceUrl: string;
  previewToken: string; cropZoom: number; cropX: number; cropY: number;
};

export type AdminCircuitRegistry = {
  rows: AdminCircuitSummary[]; filteredCount: number; page: number; limit: number; countries: string[];
  summary: {
    circuits: number; publishedProfiles: number; coreReady: number; verifiedGeometry: number;
    assignedCalendars: number; withStats: number; withHistory: number; withMedia: number; withAnnotations: number;
  };
};

export type AdminCircuitInput = {
  id: string; officialName: string; shortName: string | null; locality: string | null;
  countryCode: string; circuitType: string; longitude: number; latitude: number;
  openedYear: number | null; websiteUrl: string | null; slug: string; geometryId: string | null;
  nameRu: string; cityRu: string; countryRu: string; summaryRu: string | null;
  circuitTypeRu: string | null; editorialStatus: 'draft' | 'review' | 'published';
  sourceUrl: string; sourceName: string | null; sourceNotes: string | null; sourceVerified: boolean;
};

export type AdminTravelRegistry = {
  rows: Array<{
    id: string; name: string; slug: string | null; editorialStatus: string | null;
    pointCount: number; publishedPointCount: number; candidatePointCount: number;
    stayPointCount: number; zoneCount: number; routeCount: number; publishedRouteCount: number;
  }>;
  filteredCount: number; page: number; limit: number;
  summary: { circuits: number; points: number; publishedPoints: number; zones: number; routes: number };
  categoryGroups: Array<{
    id: string; name: string; colour: string;
    categories: Array<{ id: string; name: string; icon: string | null; minZoom: number; clustered: boolean }>;
  }>;
  recentImports: Array<{
    id: string; circuitId: string; circuitName: string; provider: string; status: string;
    discoveredCount: number; importedCount: number; failedGroups: string[];
    createdAt: string; expiresAt: string | null; appliedAt: string | null; errorMessage: string | null;
  }>;
};

export type AdminTravelImportPreview = {
  token: string; expiresAt: string;
  circuit: { id: string; name: string; latitude: number; longitude: number };
  groups: string[];
  radii: { airport: number; regionalTransport: number; stay: number; explore: number; essential: number };
  failedGroups: string[];
  candidates: Array<{
    id: string; name: string; nameRu: string | null; categoryId: string; role: string;
    latitude: number; longitude: number; distanceToCircuitM: number; importance: number;
    websiteUrl: string | null; openingHours: string | null; address: string | null;
  }>;
};

export type AdminTravelPoint = {
  id: string; circuitId: string; circuitName: string; categoryId: string; categoryName: string;
  role: 'transport' | 'stay' | 'explore' | 'essential' | 'circuit';
  name: string; nameRu: string | null; descriptionRu: string | null;
  latitude: number; longitude: number; address: string | null; websiteUrl: string | null;
  openingHours: string | null; importance: number; distanceToCircuitM: number; reviewStatus: 'candidate' | 'reviewed' | 'published' | 'hidden';
  priority: number; isFeatured: boolean; editorialNoteRu: string | null;
  sourceName: string | null; sourceUrl: string | null;
  photo: null | { id: string; url: string; altTextRu: string | null; author: string | null; licence: string | null;
    sourceUrl: string | null; reviewStatus: string; rightsStatus: string };
};

export type AdminTravelPointRegistry = {
  circuit: { id: string; name: string; latitude: number; longitude: number };
  rows: Array<Pick<AdminTravelPoint, 'id' | 'name' | 'nameRu' | 'categoryId' | 'categoryName' | 'role' | 'importance' | 'distanceToCircuitM' | 'reviewStatus' | 'isFeatured' | 'photo'>>;
  mapPoints: Array<{ id: string; name: string; nameRu: string | null; originalName: string; categoryId: string; categoryIcon: string; role: string; latitude: number; longitude: number; distanceToCircuitM: number; reviewStatus: string }>;
  mapPointsTruncated: boolean; mapPointLimit: number;
  categories: Array<{ id: string; name: string; groupId: string }>;
  filteredCount: number; page: number; limit: number;
};

export type AdminTravelPointInput = Pick<AdminTravelPoint,
  'id' | 'circuitId' | 'categoryId' | 'role' | 'name' | 'nameRu' | 'descriptionRu' | 'latitude' | 'longitude'
  | 'address' | 'websiteUrl' | 'openingHours' | 'importance' | 'reviewStatus' | 'priority' | 'isFeatured' | 'editorialNoteRu'>;

export type AdminTravelPointPhotoInput = {
  circuitId: string; pointId: string; fileName: string; mimeType: string; bytes: ArrayBuffer;
  altTextRu: string; author: string; licence: string; sourceUrl: string;
  previewToken: string; cropZoom: number; cropX: number; cropY: number;
};

export type AdminTravelZoneRegistry = {
  circuit: { id: string; name: string };
  rows: Array<{ id: string; zoneType: string; nameRu: string; priority: number; priceBand: number | null;
    reviewStatus: string; hasGeometry: boolean; pointCount: number; exampleCount: number }>;
};

export type AdminTravelZoneDetail = {
  zone: { id: string; circuitId: string; zoneType: string; name: string; nameRu: string; descriptionRu: string | null;
    geometryGeoJson: string | null; priority: number; priceBand: number | null; bestFor: string[]; advantagesRu: string[];
    disadvantagesRu: string[]; eventOnly: boolean; reviewStatus: string; sortOrder: number; characterRu: string;
    travelTimeRu: string; tone: string; sourceName: string | null; sourceUrl: string | null };
  points: Array<{ id: string; name: string; categoryName: string; selected: boolean; isExample: boolean; sortOrder: number }>;
};

export type AdminTravelRouteRegistry = { circuit:{id:string;name:string}; rows:Array<{id:string;nameRu:string;routeType:string;travelMode:string;distanceM:number;durationMinutes:number;reviewStatus:string;hasGeometry:boolean;stopCount:number;visibleByDefault:boolean;routeVariantKind:string;lifecycle:string;displayPriority:number}> };
export type AdminTravelRouteDetail = { mapCenter:[number,number]|null; route:{id:string;circuitId:string;routeType:string;travelMode:string;name:string;nameRu:string;summaryRu:string;geometryGeoJson:string|null;distanceM:number;durationMinutes:number;difficulty:string;eventOnly:boolean;bookingRequired:boolean;accessibilityNotesRu:string;scheduleNotesRu:string;routeEngine:string;routeEngineProfile:string;reviewStatus:string;sourceUrl:string;routeGroup:string;sortOrder:number;lineOffsetPx:number;lineColour:string;minZoom:number;maxZoom:number;visibleByDefault:boolean;notesRu:string;rationaleRu:string;highlightsRu:string[];practicalNotesRu:string;terminalAccessAnchorId:string|null;routeVariantKind:string;displayPriority:number;geometryMode:string;lifecycle:string;optimizeWaypointOrder:boolean;updatedAtToken:string}; stops:Array<{sequence:number;poiId:string|null;poiName:string|null;nameRu:string|null;dwellMinutes:number|null;instructionRu:string|null;longitude:number|null;latitude:number|null;resolvedLongitude:number|null;resolvedLatitude:number|null}>; pointOptions:Array<{id:string;name:string}>; mapPoints:Array<{id:string;name:string;reviewStatus:string;longitude:number;latitude:number}>; existingRoutes:Array<{id:string;nameRu:string;reviewStatus:string;lifecycle:string;geometryGeoJson:string}>; accessAnchorOptions:Array<{id:string;poiId:string;poiName:string;accessKind:string;eventScope:string;verificationStatus:string;confidence:number}> };
export type AdminTravelRouteGenerationPreview = { token:string;expiresAt:string;circuit:{id:string;name:string;longitude:number;latitude:number};suggestions:Array<{id:string;routeType:string;travelMode:string;nameRu:string;summaryRu:string;geometryGeoJson:string;distanceM:number;durationMinutes:number;stops:Array<{poiId:string;nameRu:string}>;highlightsRu:string[]}>;blockers:string[] };
export type AdminTravelRouteTailPreview = { token:string;expiresAt:string;circuitId:string;routeId:string;anchor:{id:string;poiName:string};replacedSide:'start'|'end';metrics:{originalDistanceM:number;keptDistanceM:number;replacedOldDistanceM:number;replacedNewDistanceM:number;seamGapM:number;endpointDistanceM:number};proposed:{distanceM:number;durationMinutes:number;geometryGeoJson:string} };

export type AdminTravelAccessAnchorRegistry = {
  circuit: { id: string; name: string };
  rows: Array<{
    id: string; poiId: string; poiName: string; accessKind: string; travelModes: string[];
    eventScope: string; validFromYear: number | null; validToYear: number | null;
    verificationStatus: string; confidence: number; sourceUrl: string | null;
    evidenceNoteRu: string | null; verifiedAt: string | null;
  }>;
  pointOptions: Array<{ id: string; name: string; categoryName: string; reviewStatus: string }>;
};

export type AdminSchemaTable = {
  name: string;
  columnCount: number;
  estimatedRows: number;
};

export type AdminTableColumn = {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  primaryKey: boolean;
  editable: boolean;
  filterable: boolean;
  sortable: boolean;
};

export type AdminTableFilterOperator = 'contains' | 'equal' | 'is-null' | 'is-not-null';

export type AdminTableQuery = {
  filterColumn?: string;
  filterOperator?: AdminTableFilterOperator | string;
  filterValue?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc' | string;
};

export type AdminTableData = {
  name: string;
  primaryKey: string[];
  columns: AdminTableColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  limit: number;
  filterColumn: string | null;
  filterOperator: AdminTableFilterOperator | null;
  filterValue: string;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
};

export type AdminMediaAsset = {
  id: string;
  entityType: string;
  entityId: string;
  mediaType: string;
  usageRole: string;
  url: string;
  altTextRu: string | null;
  author: string | null;
  licence: string | null;
  sourceUrl: string | null;
  season: number | null;
  isPrimary: boolean;
  provenanceType: string;
  rightsStatus: string;
  reviewStatus: string;
  verifiedAt: string | null;
  derivativeCount: number;
};

export type AdminMediaRegistry = {
  rows: AdminMediaAsset[];
  filteredCount: number;
  summary: { total: number; unresolved_rights: number; candidates: number; published: number; primary_assets: number };
  options: { entityTypes: string[]; usageRoles: string[] };
  page: number;
  limit: number;
};

export type AdminMediaAssetDetail = AdminMediaAsset & {
  sourceId: string | null;
  dataSourceName: string | null;
  usageScope: string[];
  derivatives: Array<{ variant: string; url: string; mimeType: string; width: number | null; height: number | null; fileSize: number | null }>;
};

export type AdminCircuitMediaOrderItem = {
  id: string;
  sortOrder: number;
  yearLabel: string | null;
  titleRu: string | null;
  descriptionRu: string | null;
  mediaAssetId: string | null;
  url: string | null;
  altTextRu: string | null;
  rightsStatus: string | null;
  reviewStatus: string | null;
};

export type AdminCircuitMediaOrder = {
  circuit: { id: string; slug: string; nameRu: string; editorialStatus: string };
  history: AdminCircuitMediaOrderItem[];
  gallery: AdminCircuitMediaOrderItem[];
};

type AdminDashboard = {
  rows: AdminDriverListItem[];
  summary: AdminDatabaseSummary;
  filteredCount: number;
};

function binding(name: string) {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name];
  return typeof value === 'string' ? value : process.env[name];
}

function apiConfiguration() {
  const secret = binding('ADMIN_SESSION_SECRET')?.trim();
  const explicitUrl = binding('ADMIN_DATABASE_API_URL')?.trim();
  const localDatabaseConfigured = Boolean(binding('PGHOST') && binding('PGDATABASE') && binding('PGUSER'));
  const baseUrl = explicitUrl || (localDatabaseConfigured ? 'http://127.0.0.1:3102' : null);
  return secret && baseUrl ? {
    token: createHash('sha256').update(secret).digest('hex'),
    baseUrl: baseUrl.replace(/\/$/, ''),
  } : null;
}
export function isAdminDatabaseConfigured() {
  return isAdminSupabaseConfigured() || apiConfiguration() !== null;
}

export async function getAdminMapUiSettings() {
  return (await apiRequest<{ detailedAttribution: boolean }>('/settings/map')) ?? { detailedAttribution: false };
}

export async function updateAdminMapUiSettings(detailedAttribution: boolean) {
  const result = await apiRequest<{ detailedAttribution: boolean }>('/settings/map', {
    method: 'PATCH', body: JSON.stringify({ detailedAttribution }),
  });
  if (!result) throw new Error('Не удалось обновить настройки карты');
  return result;
}

export type AdminSeasonSyncResult = {
  season: number;
  completedAt: string;
  snapshot: { fileName: string; fetchedAt: string; sha256: string; bytes: number };
  summary: string[];
  warnings: string[];
};

export async function syncAdminSeasonFromJolpica(season: number) {
  const result = await apiRequest<AdminSeasonSyncResult>('/data-sync/jolpica', {
    method: 'POST', body: JSON.stringify({ season }),
  }, 2 * 60 * 60 * 1000);
  if (!result) throw new Error('Не удалось обновить сезон через Jolpica');
  return result;
}

async function apiRequest<T>(path: string, init?: RequestInit, timeoutMs = 4_000): Promise<T | null> {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      authorization: `Bearer ${config.token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(detail?.message || `Локальный API базы данных ответил ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getAdminDriver(id: string) {
  return apiRequest<AdminDriver>(`/drivers/${encodeURIComponent(id)}`);
}

export async function getAdminDashboard({
  limit = 50,
  page = 1,
  query = '',
  filter = '',
  availablePhotoIds = [],
}: {
  limit?: number;
  page?: number;
  query?: string;
  filter?: 'unresolved-life-data' | 'missing-photo' | '';
  availablePhotoIds?: string[];
} = {}) {
  void availablePhotoIds;

  if (isAdminSupabaseConfigured()) {
    return getDirectAdminDashboard({
      limit,
      page,
      query,
      filter,
    });
  }

  const search = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    q: query,
    filter,
  });

  if (availablePhotoIds.length) {
    search.set('availablePhotoIds', availablePhotoIds.join(','));
  }

  const dashboard = await apiRequest<AdminDashboard>(
    `/drivers?${search}`,
  );

  if (!dashboard) {
    throw new Error('Каталог пилотов не найден');
  }

  return dashboard;
}

export async function getAdminSeasons() {
  if (isAdminSupabaseConfigured()) {
    return getDirectAdminSeasons();
  }

  const result = await apiRequest<{ rows: AdminSeason[] }>('/seasons');

  if (!result) {
    throw new Error('Сезоны не найдены');
  }

  return result.rows;
}

export async function saveAdminSeason(
  input: {
    year: number;
    status: AdminSeason['status'];
    roundsPlanned: number | null;
    sourceUrl: string;
  },
  create = false,
) {
  if (isAdminSupabaseConfigured()) {
    return saveDirectAdminSeason(input, create);
  }

  const result = await apiRequest<{
    year: number;
    publicDataSynced: boolean;
  }>(
    create
      ? '/seasons'
      : `/seasons/${input.year}`,
    {
      method: create ? 'POST' : 'PATCH',
      body: JSON.stringify(input),
    },
  );

  if (!result) {
    throw new Error('Сезон не найден');
  }

  return result;
}

export async function getAdminEvents(filters: { page?: number; limit?: number; season?: number; query?: string; status?: string; circuit?: string } = {}) {
  const search = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 30) });
  if (filters.season) search.set('season', String(filters.season));
  if (filters.query) search.set('q', filters.query);
  if (filters.status) search.set('status', filters.status);
  if (filters.circuit) search.set('circuit', filters.circuit);
  const result = await apiRequest<AdminEventRegistry>(`/events?${search}`);
  if (!result) throw new Error('Каталог этапов не найден');
  return result;
}

export function getAdminEvent(id: string) {
  return apiRequest<AdminEvent>(`/events/${encodeURIComponent(id)}`);
}

export async function getAdminEventEditorOptions() {
  const result = await apiRequest<AdminEventEditorOptions>('/event-options');
  if (!result) throw new Error('Справочники этапов не найдены');
  return result;
}

export async function saveAdminEvent(input: AdminEventInput, create = false) {
  const path = create ? '/events' : `/events/${encodeURIComponent(input.id)}`;
  const result = await apiRequest<{ id: string; seasonYear: number; publicDataSynced: boolean }>(path, {
    method: create ? 'POST' : 'PATCH', body: JSON.stringify(input),
  }, 120_000);
  if (!result) throw new Error('Этап не найден');
  return result;
}

export async function getAdminEventSessions(eventId: string) {
  const result = await apiRequest<{ rows: AdminEventSession[] }>(`/events/${encodeURIComponent(eventId)}/sessions`);
  if (!result) throw new Error('Этап не найден');
  return result.rows;
}

export async function getAdminEventSession(eventId: string, sessionId: string) {
  return apiRequest<AdminEventSessionBundle>(`/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);
}

export async function saveAdminEventSession(input: AdminEventSessionInput, create = false) {
  const result = await apiRequest<{ id: string; publicDataSynced: boolean }>(
    create ? `/events/${encodeURIComponent(input.raceId)}/sessions` : `/events/${encodeURIComponent(input.raceId)}/sessions/${encodeURIComponent(input.id)}`,
    { method: create ? 'POST' : 'PATCH', body: JSON.stringify(input) }, 120_000,
  );
  if (!result) throw new Error('Сессия или этап не найдены');
  return result;
}

export async function saveAdminSessionResult(input: AdminSessionResultInput) {
  const result = await apiRequest<{ driverId: string; publicDataSynced: boolean }>(
    `/events/${encodeURIComponent(input.raceId)}/sessions/${encodeURIComponent(input.sessionId)}/results`,
    { method: 'POST', body: JSON.stringify(input) }, 120_000,
  );
  if (!result) throw new Error('Сессия или этап не найдены');
  return result;
}

export async function saveAdminSessionResults(input: { raceId: string; sessionId: string; rows: AdminSessionResultInput[] }) {
  const result = await apiRequest<{ saved: number; publicDataSynced: boolean }>(
    `/events/${encodeURIComponent(input.raceId)}/sessions/${encodeURIComponent(input.sessionId)}/results`,
    { method: 'PUT', body: JSON.stringify({ rows: input.rows }) }, 120_000,
  );
  if (!result) throw new Error('Сессия или этап не найдены');
  return result;
}

export async function deleteAdminSessionResult(raceId: string, sessionId: string, driverId: string) {
  const result = await apiRequest<{ deleted: boolean; publicDataSynced: boolean }>(
    `/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}/results/${encodeURIComponent(driverId)}`,
    { method: 'DELETE' }, 120_000,
  );
  if (!result) throw new Error('Результат не найден');
  return result;
}

export async function getAdminCircuits(filters: {
  page?: number; limit?: number; query?: string; country?: string; type?: string;
  status?: string; layout?: string; gap?: string;
} = {}) {
  const search = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 30) });
  if (filters.query) search.set('q', filters.query);
  if (filters.country) search.set('country', filters.country);
  if (filters.type) search.set('type', filters.type);
  if (filters.status) search.set('status', filters.status);
  if (filters.layout) search.set('layout', filters.layout);
  if (filters.gap) search.set('gap', filters.gap);
  const result = await apiRequest<AdminCircuitRegistry>(`/circuits?${search}`);
  if (!result) throw new Error('Каталог трасс не найден');
  return result;
}

export async function getAdminTravelRegistry(filters: { page?: number; limit?: number; query?: string } = {}) {
  const search = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 30) });
  if (filters.query) search.set('q', filters.query);
  const result = await apiRequest<AdminTravelRegistry>(`/travel?${search}`);
  if (!result) throw new Error('Туристический каталог не найден');
  return result;
}

export async function createAdminTravelImportPreview(input: {
  circuitId: string; groups: string[];
  radii: { airport: number; regionalTransport: number; stay: number; explore: number; essential: number };
}) {
  const result = await apiRequest<AdminTravelImportPreview>('/travel/import-previews', {
    method: 'POST', body: JSON.stringify(input),
  }, 180_000);
  if (!result) throw new Error('Не удалось создать предпросмотр');
  return result;
}

export function getAdminTravelImportPreview(token: string) {
  return apiRequest<AdminTravelImportPreview>(`/travel/import-previews/${encodeURIComponent(token)}`);
}

export async function applyAdminTravelImportPreview(token: string, selectedIds: string[]) {
  const result = await apiRequest<{ circuitId: string; imported: number }>(
    `/travel/import-previews/${encodeURIComponent(token)}/apply`,
    { method: 'POST', body: JSON.stringify({ selectedIds }) },
    60_000,
  );
  if (!result) throw new Error('Предпросмотр устарел');
  return result;
}

export async function getAdminTravelPoints(circuitId: string, filters: {
  page?: number; limit?: number; query?: string; status?: string; category?: string; role?: string;
  photo?: string; featured?: string; translation?: string; distanceMin?: string; distanceMax?: string;
  importanceMin?: string; importanceMax?: string;
} = {}) {
  const search = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 30) });
  if (filters.query) search.set('q', filters.query);
  if (filters.status) search.set('status', filters.status);
  if (filters.category) search.set('category', filters.category);
  if (filters.role) search.set('role', filters.role);
  if (filters.photo) search.set('photo', filters.photo);
  if (filters.featured) search.set('featured', filters.featured);
  if (filters.translation) search.set('translation', filters.translation);
  if (filters.distanceMin) search.set('distanceMin', filters.distanceMin);
  if (filters.distanceMax) search.set('distanceMax', filters.distanceMax);
  if (filters.importanceMin) search.set('importanceMin', filters.importanceMin);
  if (filters.importanceMax) search.set('importanceMax', filters.importanceMax);
  const result = await apiRequest<AdminTravelPointRegistry>(`/travel/circuits/${encodeURIComponent(circuitId)}/points?${search}`);
  return result;
}

export async function updateAdminTravelCategoryIcon(id: string, icon: string) {
  const result = await apiRequest<{ id: string; name: string; icon: string }>(`/travel/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ icon }),
  });
  if (!result) throw new Error('Категория не найдена');
  return result;
}

export async function uploadAdminTravelCategoryIcon(id: string, fileName: string, mimeType: string, bytes: ArrayBuffer) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify({ fileName, mimeType }), 'utf8').toString('base64url');
  const response = await fetch(`${config.baseUrl}/travel/categories/${encodeURIComponent(id)}/icon`, {
    method: 'POST', body: bytes, cache: 'no-store', signal: AbortSignal.timeout(35_000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': mimeType, 'x-upload-metadata': metadata },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось загрузить значок: ${response.status}`);
  }
  return response.json() as Promise<{ id: string; icon: string }>;
}

export function getAdminTravelPoint(circuitId: string, pointId: string) {
  return apiRequest<{ point: AdminTravelPoint; categories: Array<{ id: string; name: string; groupId: string }> }>(
    `/travel/circuits/${encodeURIComponent(circuitId)}/points/${encodeURIComponent(pointId)}`,
  );
}

export async function updateAdminTravelPoint(input: AdminTravelPointInput) {
  const result = await apiRequest<{ id: string; circuitId: string; publicDataSynced: boolean }>(
    `/travel/circuits/${encodeURIComponent(input.circuitId)}/points/${encodeURIComponent(input.id)}`,
    { method: 'PATCH', body: JSON.stringify(input) }, 35_000,
  );
  if (!result) throw new Error('Туристическая точка не найдена');
  return result;
}

export async function updateAdminTravelPointsBulk(input: {
  circuitId: string;
  pointIds: string[];
  reviewStatus?: 'candidate' | 'reviewed' | 'published' | 'hidden';
  isFeatured?: boolean;
}) {
  const result = await apiRequest<{ circuitId: string; updated: number; publicDataSynced: boolean }>(
    `/travel/circuits/${encodeURIComponent(input.circuitId)}/points-bulk`,
    { method: 'PATCH', body: JSON.stringify(input) }, 60_000,
  );
  if (!result) throw new Error('Трасса или туристические точки не найдены');
  return result;
}

export async function applyAdminTravelPointOsmTranslations(circuitId: string) {
  const result = await apiRequest<{ circuitId: string; updated: number; publicDataSynced: boolean }>(
    `/travel/circuits/${encodeURIComponent(circuitId)}/translations/osm`,
    { method: 'POST' }, 60_000,
  );
  if (!result) throw new Error('Трасса не найдена');
  return result;
}

async function travelPointPhotoRequest(input: AdminTravelPointPhotoInput, preview: boolean) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify(preview ? {
    fileName: input.fileName, mimeType: input.mimeType,
  } : {
    fileName: input.fileName, mimeType: input.mimeType, altTextRu: input.altTextRu,
    author: input.author, licence: input.licence, sourceUrl: input.sourceUrl,
    previewToken: input.previewToken,
    cropZoom: input.cropZoom, cropX: input.cropX, cropY: input.cropY,
  }), 'utf8').toString('base64url');
  const suffix = preview ? '/preview' : '';
  const response = await fetch(`${config.baseUrl}/travel/circuits/${encodeURIComponent(input.circuitId)}/points/${encodeURIComponent(input.pointId)}/photo${suffix}`, {
    method: 'POST', body: input.bytes, cache: 'no-store', signal: AbortSignal.timeout(120_000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': input.mimeType, 'x-upload-metadata': metadata },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось загрузить фотографию: ${response.status}`);
  }
  return response.json() as Promise<{ token?: string; imageDataUrl?: string; expiresInMinutes?: number;
    id?: string; url?: string; circuitId?: string; pointId?: string; publicDataSynced?: boolean; variants?: Record<string, string> }>;
}

export function previewAdminTravelPointPhoto(input: AdminTravelPointPhotoInput) {
  return travelPointPhotoRequest(input, true);
}

export function uploadAdminTravelPointPhoto(input: AdminTravelPointPhotoInput) {
  return travelPointPhotoRequest(input, false);
}

export function getAdminTravelZones(circuitId: string) {
  return apiRequest<AdminTravelZoneRegistry>(`/travel/circuits/${encodeURIComponent(circuitId)}/zones`);
}

export function getAdminTravelZone(circuitId: string, zoneId: string) {
  return apiRequest<AdminTravelZoneDetail>(`/travel/circuits/${encodeURIComponent(circuitId)}/zones/${encodeURIComponent(zoneId)}`);
}

export function updateAdminTravelZone(circuitId: string, zoneId: string, input: Record<string, unknown>) {
  return apiRequest<{ id: string; circuitId: string; publicDataSynced: boolean }>(
    `/travel/circuits/${encodeURIComponent(circuitId)}/zones/${encodeURIComponent(zoneId)}`,
    { method: 'PUT', body: JSON.stringify(input) }, 120_000,
  );
}

export function getAdminTravelRoutes(circuitId:string){return apiRequest<AdminTravelRouteRegistry>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes`);}
export function getAdminTravelRoute(circuitId:string,routeId:string){return apiRequest<AdminTravelRouteDetail>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`);}
export function updateAdminTravelRoute(circuitId:string,routeId:string,input:Record<string,unknown>){return apiRequest<{id:string;circuitId:string;publicDataSynced:boolean}>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`,{method:'PUT',body:JSON.stringify(input)},120_000);}
export function createAdminTravelRouteGeometryPreview(circuitId:string,routeId:string,input:{travelMode:'car';points:number[][]}){return apiRequest<{geometryGeoJson:string;distanceM:number;durationMinutes:number}>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}/geometry-previews`,{method:'POST',body:JSON.stringify(input)},120_000);}
export function changeAdminTravelRouteLifecycle(circuitId:string,routeId:string,input:{operation:'archive'|'restore';expectedUpdatedAt:string}){return apiRequest<{id:string;circuitId:string;publicDataSynced:boolean}>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}/lifecycle`,{method:'POST',body:JSON.stringify(input)},120_000);}
export function deleteAdminArchivedTravelRoute(circuitId:string,routeId:string,input:{confirmRouteId:string;expectedUpdatedAt:string}){return apiRequest<{id:string;circuitId:string;publicDataSynced:boolean}>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`,{method:'DELETE',body:JSON.stringify(input)},120_000);}
export function createAdminTravelRouteGenerationPreview(circuitId:string,input:Record<string,unknown>={}){return apiRequest<AdminTravelRouteGenerationPreview>(`/travel/circuits/${encodeURIComponent(circuitId)}/route-generation-previews`,{method:'POST',body:JSON.stringify(input)},180_000);}
export function getAdminTravelRouteGenerationPreview(token:string){return apiRequest<AdminTravelRouteGenerationPreview>(`/travel/route-generation-previews/${encodeURIComponent(token)}`);}
export function applyAdminTravelRouteGenerationPreview(token:string,circuitId:string,routeIds:string[]){return apiRequest<{circuitId:string;created:number;skipped:number;publicDataSynced:boolean}>(`/travel/route-generation-previews/${encodeURIComponent(token)}/apply`,{method:'POST',body:JSON.stringify({circuitId,routeIds})},180_000);}
export function createAdminTravelRouteTailPreview(circuitId:string,routeId:string){return apiRequest<AdminTravelRouteTailPreview>(`/travel/circuits/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}/tail-previews`,{method:'POST',body:'{}'},120_000);}
export function getAdminTravelRouteTailPreview(token:string){return apiRequest<AdminTravelRouteTailPreview>(`/travel/route-tail-previews/${encodeURIComponent(token)}`);}
export function applyAdminTravelRouteTailPreview(token:string,circuitId:string,routeId:string){return apiRequest<{circuitId:string;routeId:string;publicDataSynced:boolean}>(`/travel/route-tail-previews/${encodeURIComponent(token)}/apply`,{method:'POST',body:JSON.stringify({circuitId,routeId})},120_000);}
export function getAdminTravelAccessAnchors(circuitId:string){return apiRequest<AdminTravelAccessAnchorRegistry>(`/travel/circuits/${encodeURIComponent(circuitId)}/access-anchors`);}
export function updateAdminTravelAccessAnchor(circuitId:string,anchorId:string,input:Record<string,unknown>){return apiRequest<{id:string;circuitId:string}>(`/travel/circuits/${encodeURIComponent(circuitId)}/access-anchors/${encodeURIComponent(anchorId)}`,{method:'PUT',body:JSON.stringify(input)});}

export function getAdminCircuit(id: string, includeGeometry = false) {
  return apiRequest<AdminCircuit>(`/circuits/${encodeURIComponent(id)}${includeGeometry ? '?includeGeometry=1' : ''}`);
}

export async function updateAdminCircuit(input: AdminCircuitInput) {
  const result = await apiRequest<{ id: string; publicDataSynced: boolean }>(`/circuits/${encodeURIComponent(input.id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }, 120_000);
  if (!result) throw new Error('Трасса не найдена');
  return result;
}

async function circuitCardImageRequest(input: AdminCircuitCardImageInput, preview: boolean) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify(preview ? {
    fileName: input.fileName, mimeType: input.mimeType, removeBackground: false,
  } : {
    fileName: input.fileName, mimeType: input.mimeType, altTextRu: input.altTextRu,
    author: input.author, licence: input.licence, sourceUrl: input.sourceUrl,
    removeBackground: false, previewToken: input.previewToken,
    cropZoom: input.cropZoom, cropX: input.cropX, cropY: input.cropY,
  }), 'utf8').toString('base64url');
  const suffix = preview ? '/preview' : '';
  const response = await fetch(`${config.baseUrl}/circuits/${encodeURIComponent(input.id)}/card-image${suffix}`, {
    method: 'POST', body: input.bytes, cache: 'no-store', signal: AbortSignal.timeout(120_000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': input.mimeType, 'x-upload-metadata': metadata },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось обработать изображение: ${response.status}`);
  }
  return response.json() as Promise<{ token?: string; imageDataUrl?: string; expiresInMinutes?: number;
    url?: string; publicDataSynced?: boolean; format?: 'image/webp'; variants?: Record<string, string> }>;
}

export function previewAdminCircuitCardImage(input: AdminCircuitCardImageInput) {
  return circuitCardImageRequest(input, true);
}

export function uploadAdminCircuitCardImage(input: AdminCircuitCardImageInput) {
  return circuitCardImageRequest(input, false);
}

export async function saveAdminTrackLayout(input: AdminTrackLayoutInput, create = false) {
  const path = create
    ? `/circuits/${encodeURIComponent(input.circuitId)}/layouts`
    : `/circuits/${encodeURIComponent(input.circuitId)}/layouts/${encodeURIComponent(input.id)}`;
  const result = await apiRequest<{ id: string; circuitId: string; publicDataSynced: boolean }>(path, {
    method: create ? 'POST' : 'PATCH', body: JSON.stringify(input),
  }, 35_000);
  if (!result) throw new Error('Конфигурация или трасса не найдена');
  return result;
}

export async function inspectAdminTrackGeometry(circuitId: string, layoutId: string, geoJson: unknown) {
  const result = await apiRequest<AdminTrackGeometryInspection>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/geometry`, {
    method: 'POST', body: JSON.stringify({ geoJson }),
  }, 35_000);
  if (!result) throw new Error('Конфигурация не найдена');
  return result;
}

export async function importAdminTrackGeometry(circuitId: string, layoutId: string, geoJson: unknown) {
  const result = await apiRequest<{ circuitId: string; layoutId: string; preview: AdminTrackGeometryInspection; publicDataSynced: boolean }>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/geometry`, {
    method: 'PUT', body: JSON.stringify({ geoJson, confirmed: true }),
  }, 60_000);
  if (!result) throw new Error('Конфигурация не найдена');
  return result;
}

export function getAdminTrackAnnotations(circuitId:string,layoutId:string){return apiRequest<AdminTrackAnnotationRegistry>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`);}
export function createAdminTrackSectorSegmentation(circuitId:string,layoutId:string,input:Record<string,unknown>){return apiRequest<{circuitId:string;layoutId:string;created:number}>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/sectors`,{method:'POST',body:JSON.stringify(input)},60_000);}
export function updateAdminTrackAnnotation(circuitId:string,layoutId:string,annotationId:string,input:Record<string,unknown>){return apiRequest<{id:string;circuitId:string;layoutId:string;publicDataSynced:boolean}>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations/${encodeURIComponent(annotationId)}`,{method:'PUT',body:JSON.stringify(input)},120_000);}
export function deleteAdminTrackAnnotation(circuitId:string,layoutId:string,annotationId:string,revision:string){return apiRequest<{id:string;circuitId:string;layoutId:string;publicDataSynced:boolean}>(`/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations/${encodeURIComponent(annotationId)}`,{method:'DELETE',body:JSON.stringify({revision})},120_000);}
export function createAdminTrackAnnotationImportPreview(packageData:unknown){return apiRequest<AdminTrackAnnotationImportPreview>('/track-annotation-import-previews',{method:'POST',body:JSON.stringify(packageData)},60_000);}
export function getAdminTrackAnnotationImportPreview(token:string){return apiRequest<AdminTrackAnnotationImportPreview>(`/track-annotation-import-previews/${encodeURIComponent(token)}`,{},35_000);}
export function applyAdminTrackAnnotationImportPreview(token:string){return apiRequest<{imported:number;circuitId:string;layoutId:string}>(`/track-annotation-import-previews/${encodeURIComponent(token)}/apply`,{method:'POST',body:'{}'},120_000);}

export async function updateAdminDriver(input: AdminDriverInput) {
  const result = await apiRequest<{ fields: string[]; publicDataSynced: boolean }>(`/drivers/${encodeURIComponent(input.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!result) throw new Error('Пилот не найден');
  return result;
}

export async function updateAdminDriverEditorial(input: {
  id: string;
  nicknames: Array<{ nameRu: string; nameOriginal: string | null; contextRu: string | null; sourceUrl: string }>;
  quotes: Array<{ quoteRu: string; quoteOriginal: string | null; attributionRu: string; contextRu: string | null; quoteDate: string | null; sourceUrl: string }>;
}) {
  const result = await apiRequest<{ nicknames: number; quotes: number; publicDataSynced: boolean }>(`/drivers/${encodeURIComponent(input.id)}/editorial`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
  if (!result) throw new Error('Пилот не найден');
  return result;
}

export async function uploadAdminDriverPhoto(input: AdminDriverPhotoInput) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify({
    fileName: input.fileName,
    mimeType: input.mimeType,
    altTextRu: input.altTextRu,
    author: input.author,
    licence: input.licence,
    sourceUrl: input.sourceUrl,
    removeBackground: input.removeBackground,
    previewToken: input.previewToken,
    cropZoom: input.cropZoom,
    cropX: input.cropX,
    cropY: input.cropY,
  }), 'utf8').toString('base64url');
  const response = await fetch(`${config.baseUrl}/drivers/${encodeURIComponent(input.id)}/photo`, {
    method: 'POST',
    body: input.bytes,
    cache: 'no-store',
    signal: AbortSignal.timeout(190_000),
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': input.mimeType,
      'x-upload-metadata': metadata,
    },
  });
  if (response.status === 404) throw new Error('Пилот не найден');
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось загрузить фотографию: ${response.status}`);
  }
  return response.json() as Promise<{
    url: string;
    publicDataSynced: boolean;
    format: 'image/webp';
    backgroundRemoved: boolean;
    variants: Record<string, string>;
  }>;
}

export async function previewAdminDriverPhoto(input: AdminDriverPhotoPreviewInput) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify({
    fileName: input.fileName,
    mimeType: input.mimeType,
    removeBackground: input.removeBackground,
  }), 'utf8').toString('base64url');
  const response = await fetch(`${config.baseUrl}/drivers/${encodeURIComponent(input.id)}/photo/preview`, {
    method: 'POST',
    body: input.bytes,
    cache: 'no-store',
    signal: AbortSignal.timeout(190_000),
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': input.mimeType,
      'x-upload-metadata': metadata,
    },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось создать предпросмотр: ${response.status}`);
  }
  return response.json() as Promise<{
    token: string;
    imageDataUrl: string;
    backgroundRemoved: boolean;
    expiresInMinutes: number;
  }>;
}

export async function getAdminConstructorEntries(season: number, query = '') {
  const search = new URLSearchParams({ season: String(season), q: query });
  const result = await apiRequest<{ season: number; rows: AdminConstructorEntry[] }>(`/constructor-entries?${search}`);
  if (!result) throw new Error('Каталог команд не найден');
  return result;
}

export function getAdminConstructorEntry(season: number, constructorId: string) {
  return apiRequest<AdminConstructorEntry>(`/constructor-entries/${season}/${encodeURIComponent(constructorId)}`);
}

export async function updateAdminConstructorEntry(input: AdminConstructorEntryInput) {
  const result = await apiRequest<{ fields: string[]; publicDataSynced: boolean }>(`/constructor-entries/${input.season}/${encodeURIComponent(input.constructorId)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
  if (!result) throw new Error('Команда не найдена');
  return result;
}

export async function getAdminConstructorLineages(query = '', status = '') {
  const search = new URLSearchParams();
  if (query) search.set('q', query);
  if (status) search.set('status', status);
  const result = await apiRequest<{ rows: AdminConstructorLineage[]; constructors: AdminConstructorIdentity[] }>(`/constructor-lineages?${search}`);
  if (!result) throw new Error('Реестр преемственности команд не найден');
  return result;
}

export function createAdminConstructorLineage(input: AdminConstructorLineageInput) {
  return apiRequest<{ id: number }>('/constructor-lineages', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminConstructorLineage(id: number, input: AdminConstructorLineageInput) {
  return apiRequest<{ id: number }>(`/constructor-lineages/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAdminConstructorLineage(id: number) {
  return apiRequest<{ id: number }>(`/constructor-lineages/${id}`, { method: 'DELETE' });
}

export async function getAdminHistoryEras() {
  const result = await apiRequest<{ rows: AdminHistoryEraSummary[] }>('/history-eras');
  if (!result) throw new Error('Редакционный реестр эпох не найден');
  return result;
}

export function getAdminHistoryEra(slug: string) {
  return apiRequest<AdminHistoryEraDetail>(`/history-eras/${encodeURIComponent(slug)}`);
}

export function updateAdminHistoryEra(slug: string, input: AdminHistoryEraInput) {
  return apiRequest<{ slug: string; publicDataSynced: boolean }>(`/history-eras/${encodeURIComponent(slug)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export function createAdminHistoryEraBlock(eraSlug: string, input: AdminHistoryEraBlockInput) {
  return apiRequest<{ id: number; publicDataSynced: boolean }>(`/history-eras/${encodeURIComponent(eraSlug)}/blocks`, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function updateAdminHistoryEraBlock(id: number, input: AdminHistoryEraBlockContentInput) {
  return apiRequest<{ id: number; publicDataSynced: boolean }>(`/history-era-blocks/${id}`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export function deleteAdminHistoryEraBlock(id: number) {
  return apiRequest<{ id: number; publicDataSynced: boolean }>(`/history-era-blocks/${id}`, { method: 'DELETE' });
}

export function updateAdminHistoryEraBlockOrder(eraSlug: string, orderedIds: number[], expectedOrderedIds: number[]) {
  return apiRequest<{ eraSlug: string; orderedIds: number[]; publicDataSynced: boolean }>(
    `/history-eras/${encodeURIComponent(eraSlug)}/blocks/order`,
    { method: 'PATCH', body: JSON.stringify({ orderedIds, expectedOrderedIds }) },
  );
}

async function constructorMediaRequest(input: AdminConstructorCarInput, kind: 'car' | 'logo', preview: boolean) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify(preview ? {
    fileName: input.fileName, mimeType: input.mimeType, removeBackground: input.removeBackground,
  } : {
    fileName: input.fileName, mimeType: input.mimeType, altTextRu: input.altTextRu,
    author: input.author, licence: input.licence, sourceUrl: input.sourceUrl,
    removeBackground: input.removeBackground, previewToken: input.previewToken,
    cropZoom: input.cropZoom, cropX: input.cropX, cropY: input.cropY,
  }), 'utf8').toString('base64url');
  const suffix = preview ? '/preview' : '';
  const response = await fetch(`${config.baseUrl}/constructor-entries/${input.season}/${encodeURIComponent(input.constructorId)}/${kind}${suffix}`, {
    method: 'POST', body: input.bytes, cache: 'no-store', signal: AbortSignal.timeout(190_000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': input.mimeType, 'x-upload-metadata': metadata },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось обработать изображение болида: ${response.status}`);
  }
  return response.json() as Promise<{
    token?: string; imageDataUrl?: string; expiresInMinutes?: number; url?: string;
    publicDataSynced?: boolean; format?: 'image/webp'; backgroundRemoved: boolean;
    variants?: Record<string, string>;
  }>;
}

export function previewAdminConstructorCar(input: AdminConstructorCarInput) {
  return constructorMediaRequest(input, 'car', true);
}

export function uploadAdminConstructorCar(input: AdminConstructorCarInput) {
  return constructorMediaRequest(input, 'car', false);
}

export function previewAdminConstructorLogo(input: AdminConstructorCarInput) {
  return constructorMediaRequest(input, 'logo', true);
}

export function uploadAdminConstructorLogo(input: AdminConstructorCarInput) {
  return constructorMediaRequest(input, 'logo', false);
}

async function gameLogoRequest(input: AdminGameLogoInput, preview: boolean) {
  const config = apiConfiguration();
  if (!config) throw new Error('Локальный API базы данных для админки не настроен');
  const metadata = Buffer.from(JSON.stringify(preview ? {
    fileName: input.fileName, mimeType: input.mimeType, removeBackground: false,
  } : {
    fileName: input.fileName, mimeType: input.mimeType, altTextRu: input.altTextRu,
    author: input.author, licence: input.licence, sourceUrl: input.sourceUrl,
    removeBackground: false, previewToken: input.previewToken,
    cropZoom: input.cropZoom, cropX: input.cropX, cropY: input.cropY,
  }), 'utf8').toString('base64url');
  const response = await fetch(`${config.baseUrl}/games/${input.gameId}/logo${preview ? '/preview' : ''}`, {
    method: 'POST', body: input.bytes, cache: 'no-store', signal: AbortSignal.timeout(190_000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': input.mimeType, 'x-upload-metadata': metadata },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Не удалось обработать логотип игры: ${response.status}`);
  }
  return response.json() as Promise<{ token?: string; imageDataUrl?: string; expiresInMinutes?: number; url?: string }>;
}

export function previewAdminGameLogo(input: AdminGameLogoInput) {
  return gameLogoRequest(input, true);
}

export function uploadAdminGameLogo(input: AdminGameLogoInput) {
  return gameLogoRequest(input, false);
}

export async function getAdminSchemaTables() {
  const result = await apiRequest<{ schema: 'atlas'; tables: AdminSchemaTable[] }>('/schema/tables');
  if (!result) throw new Error('Схема базы данных не найдена');
  return result;
}

export async function getAdminMediaRegistry(filters: {
  page?: number; limit?: number; query?: string; entityType?: string; usageRole?: string;
  season?: number | null; rights?: string; review?: string;
} = {}) {
  const search = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 40) });
  if (filters.query) search.set('q', filters.query);
  if (filters.entityType) search.set('entityType', filters.entityType);
  if (filters.usageRole) search.set('usageRole', filters.usageRole);
  if (filters.season) search.set('season', String(filters.season));
  if (filters.rights) search.set('rights', filters.rights);
  if (filters.review) search.set('review', filters.review);
  const result = await apiRequest<AdminMediaRegistry>(`/media-assets?${search}`);
  if (!result) throw new Error('Медиареестр не найден');
  return result;
}

export function getAdminMediaAsset(id: string) {
  return apiRequest<AdminMediaAssetDetail>(`/media-assets/${encodeURIComponent(id)}`);
}

export async function updateAdminMediaAsset(input: {
  id: string; usageRole: string; altTextRu: string; author: string; licence: string;
  sourceUrl: string; rightsStatus: string; reviewStatus: string;
}) {
  const result = await apiRequest<{ asset: AdminMediaAssetDetail; publicDataSynced: boolean }>(`/media-assets/${encodeURIComponent(input.id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
  if (!result) throw new Error('Медиаматериал не найден');
  return result;
}

export function getAdminCircuitMediaOrder(circuitId: string) {
  return apiRequest<AdminCircuitMediaOrder>(`/circuits/${encodeURIComponent(circuitId)}/media-order`);
}

export async function updateAdminCircuitMediaOrder(circuitId: string, section: 'history' | 'gallery', orderedIds: string[]) {
  const result = await apiRequest<{ section: 'history' | 'gallery'; slug: string; publicDataSynced: boolean }>(`/circuits/${encodeURIComponent(circuitId)}/media-order`, {
    method: 'PATCH', body: JSON.stringify({ section, orderedIds }),
  }, 35_000);
  if (!result) throw new Error('Трасса не найдена');
  return result;
}

export async function getAdminTableData(table: string, page = 1, limit = 25, query: AdminTableQuery = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (query.filterColumn) search.set('filterColumn', query.filterColumn);
  if (query.filterOperator) search.set('filterOperator', query.filterOperator);
  if (query.filterValue) search.set('filterValue', query.filterValue);
  if (query.sortColumn) search.set('sortColumn', query.sortColumn);
  if (query.sortDirection) search.set('sortDirection', query.sortDirection);
  const result = await apiRequest<AdminTableData>(`/schema/tables/${encodeURIComponent(table)}?${search}`);
  if (!result) throw new Error('Таблица не найдена');
  return result;
}

export async function updateAdminTableRow(
  table: string,
  key: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  const result = await apiRequest<Record<string, unknown>>(`/schema/tables/${encodeURIComponent(table)}`, {
    method: 'PATCH',
    body: JSON.stringify({ key, values }),
  });
  if (!result) throw new Error('Строка таблицы не найдена');
  return result;
}
