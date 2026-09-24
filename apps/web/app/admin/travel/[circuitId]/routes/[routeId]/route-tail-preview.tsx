import { applyTravelRouteTailPreview, previewTravelRouteTail } from '../../../../actions';
import type { AdminTravelRouteTailPreview } from '../../../../../lib/admin-database';

const kilometres = (metres: number) => `${(metres / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} км`;

export function RouteTailPreview({ circuitId, routeId, anchorId, travelMode, preview }: {
  circuitId: string;
  routeId: string;
  anchorId: string | null;
  travelMode: string;
  preview: AdminTravelRouteTailPreview | null;
}) {
  const supported = travelMode === 'car';
  return <section className="admin-editor-form"><fieldset><legend>Предпросмотр конечного участка</legend>
    {!anchorId ? <p className="admin-field-note">Сначала выберите конечную точку доступа и сохраните маршрут</p> : <>
      <p className="admin-field-note">Расчёт заменяет только ближайший к точке доступа конец линии. До отдельного подтверждения маршрут в базе не изменяется</p>
      {!supported ? <p className="admin-field-note">Автоматический предпросмотр сейчас доступен только для автомобильного профиля. Пешеходный и велосипедный маршрутизаторы будут подключены отдельно</p> : <form action={previewTravelRouteTail} className="admin-form-actions">
        <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="routeId" value={routeId} />
        <span>Текущая линия останется без изменений</span><button type="submit">Рассчитать новый хвост</button>
      </form>}
    </>}
    {preview ? <div className="admin-table-wrap"><table><thead><tr><th>Точка доступа</th><th>Сохранено</th><th>Старый участок</th><th>Новый участок</th><th>Разрыв</th><th>До точки</th></tr></thead><tbody><tr>
      <td><strong>{preview.anchor.poiName}</strong><small>{preview.replacedSide === 'start' ? 'Заменяется начало' : 'Заменяется конец'}</small></td>
      <td>{kilometres(preview.metrics.keptDistanceM)}</td><td>{kilometres(preview.metrics.replacedOldDistanceM)}</td><td>{kilometres(preview.metrics.replacedNewDistanceM)}</td>
      <td>{preview.metrics.seamGapM} м</td><td>{preview.metrics.endpointDistanceM} м</td>
    </tr></tbody></table><div className="admin-form-actions"><span>После применения маршрут станет черновиком и потребует повторной проверки</span><form action={applyTravelRouteTailPreview}>
      <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="routeId" value={routeId} /><input type="hidden" name="token" value={preview.token} />
      <button type="submit">Применить новую линию</button>
    </form></div></div> : null}
  </fieldset></section>;
}
