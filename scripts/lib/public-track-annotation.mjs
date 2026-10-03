import { normalizeTrackCalloutPoint } from './track-callout-point.mjs';

// Publication status is enforced by the export query; expose only approved presentation fields.
export function serializePublicTrackAnnotation(annotation) {
  const calloutPoint = normalizeTrackCalloutPoint(annotation.callout_point, annotation.annotation_type);
  return {
    id: annotation.id,
    type: annotation.annotation_type,
    ...(annotation.label_ru ? { labelRu: annotation.label_ru } : {}),
    ...(annotation.label_original ? { labelOriginal: annotation.label_original } : {}),
    ...(annotation.sequence ? { sequence: Number(annotation.sequence) } : {}),
    ...(annotation.description_ru ? { descriptionRu: annotation.description_ru } : {}),
    ...(annotation.valid_from_year ? { validFromYear: Number(annotation.valid_from_year) } : {}),
    ...(annotation.valid_to_year ? { validToYear: Number(annotation.valid_to_year) } : {}),
    ...(calloutPoint ? { calloutPoint } : {}),
    geometry: annotation.geometry,
    source: {
      name: annotation.source_name,
      ...(annotation.source_url ? { url: annotation.source_url } : {}),
    },
  };
}
