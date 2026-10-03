BEGIN;

ALTER TABLE atlas.track_layout_annotations
  DROP CONSTRAINT track_layout_annotations_annotation_type_check,
  DROP CONSTRAINT track_layout_annotations_check2;

ALTER TABLE atlas.track_layout_annotations
  ADD CONSTRAINT track_layout_annotations_annotation_type_check CHECK (annotation_type IN (
    'sector', 'turn', 'straight', 'timing_line', 'drs_zone', 'drs_detection',
    'straight_mode_zone', 'straight_mode_activation', 'straight_mode_low_grip_activation',
    'overtake_detection', 'overtake_activation'
  )),
  ADD CONSTRAINT track_layout_annotations_geometry_type_check CHECK (
    (annotation_type IN (
      'turn', 'timing_line', 'drs_detection', 'straight_mode_activation',
      'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation'
    ) AND GeometryType(geometry::geometry) = 'POINT')
    OR
    (annotation_type IN ('sector', 'straight', 'drs_zone', 'straight_mode_zone')
      AND GeometryType(geometry::geometry) = 'LINESTRING')
  ),
  ADD CONSTRAINT track_layout_annotations_new_modes_period_check CHECK (
    annotation_type NOT IN (
      'straight_mode_zone', 'straight_mode_activation', 'straight_mode_low_grip_activation',
      'overtake_detection', 'overtake_activation'
    ) OR (valid_from_year IS NOT NULL AND valid_from_year >= 2026)
  );

COMMENT ON TABLE atlas.track_layout_annotations IS
  'Разметка конфигураций по периодам: сектора, повороты, исторические DRS и эксплуатационные точки/участки 2026+';

COMMIT;
