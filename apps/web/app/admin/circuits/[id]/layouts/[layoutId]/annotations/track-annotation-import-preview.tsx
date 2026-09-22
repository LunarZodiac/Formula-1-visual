type AnnotationFeature = {
  id: string;
  annotationType: string;
  label: string | null;
  sequence: number | null;
  validFromYear: number | null;
  validToYear: number | null;
  maximumDistanceToTrackM: number;
};

type TrackAnnotationImportPreview = {
  token: string;
  expiresAt: string | Date;
  summary: {
    features: number;
    byType: Record<string, number>;
  };
  features: AnnotationFeature[];
};

const annotationTypeLabels: Record<string, string> = {
  sector: 'Сектор',
  turn: 'Поворот',
  straight: 'Прямая',
  timing_line: 'Отсечка времени',
  drs_zone: 'Зона DRS',
  drs_detection: 'Детекция DRS',
};

function formatDistance(distanceM: number) {
  return distanceM < 1000
    ? `${Math.round(distanceM)} м`
    : `${(distanceM / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} км`;
}

function formatPeriod(from: number | null, to: number | null) {
  return `${from ?? '…'}–${to ?? 'н.в.'}`;
}

export function TrackAnnotationImportPreview({
  preview,
  circuitId,
  layoutId,
  applyAction,
}: {
  preview: TrackAnnotationImportPreview;
  circuitId: string;
  layoutId: string;
  applyAction: (formData: FormData) => void | Promise<void>;
}) {
  const expiresAt = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(preview.expiresAt));

  return <form action={applyAction} className="admin-editor-form">
    <input type="hidden" name="token" value={preview.token} />
    <input type="hidden" name="circuitId" value={circuitId} />
    <input type="hidden" name="layoutId" value={layoutId} />
    <section className="admin-summary" aria-label="Сводка предпросмотра импорта">
      <div><span>Элементов</span><strong>{preview.summary.features}</strong></div>
      <div><span>Типы</span><strong>{Object.entries(preview.summary.byType).map(([type, count]) => `${annotationTypeLabels[type] ?? type}: ${count}`).join(', ') || '—'}</strong></div>
      <div><span>Предпросмотр действует до</span><strong>{expiresAt}</strong></div>
    </section>
    <div className="admin-table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Тип</th><th>Название</th><th>Номер</th><th>Период</th><th>Расстояние до контура</th></tr></thead>
        <tbody>{preview.features.map((feature) => <tr key={feature.id}>
          <td><code>{feature.id}</code></td>
          <td>{annotationTypeLabels[feature.annotationType] ?? feature.annotationType}</td>
          <td>{feature.label ?? 'Без названия'}</td>
          <td>{feature.sequence ?? '—'}</td>
          <td>{formatPeriod(feature.validFromYear, feature.validToYear)}</td>
          <td>{formatDistance(feature.maximumDistanceToTrackM)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="admin-form-actions">
      <span>Проверьте тип, период и расстояние до контура перед сохранением</span>
      <button type="submit">Подтвердить импорт</button>
    </div>
  </form>;
}
