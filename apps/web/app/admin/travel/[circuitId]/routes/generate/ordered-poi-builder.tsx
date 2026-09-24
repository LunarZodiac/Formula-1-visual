'use client';

import { useId, useState } from 'react';
import styles from './route-generator.module.css';

type PointOption = { id: string; name: string };
type RoutePoint = { key: number; poiId: string };

const maximumPoints = 10;

function pointLabel(index: number, count: number) {
  if (index === 0) return 'Начало';
  if (index === count - 1) return 'Финиш';
  return `Остановка ${index}`;
}

export function OrderedPoiBuilder({ pointOptions }: { pointOptions: PointOption[] }) {
  const fieldId = useId();
  const [nextKey, setNextKey] = useState(2);
  const [points, setPoints] = useState<RoutePoint[]>([
    { key: 0, poiId: '' },
    { key: 1, poiId: '' },
  ]);
  const selectedIds = new Set(points.map((point) => point.poiId).filter(Boolean));

  const update = (key: number, poiId: string) => {
    setPoints((current) => current.map((point) => point.key === key ? { ...point, poiId } : point));
  };
  const move = (index: number, offset: -1 | 1) => {
    setPoints((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const remove = (key: number) => setPoints((current) => current.filter((point) => point.key !== key));
  const add = () => {
    if (points.length >= maximumPoints) return;
    setPoints((current) => [...current, { key: nextKey, poiId: '' }]);
    setNextKey((value) => value + 1);
  };

  return <div className={styles.builder} aria-describedby={`${fieldId}-help`}>
    <p id={`${fieldId}-help`} className={styles.builderHelp}>Выберите от 2 до 10 точек. Порядок в списке станет порядком остановок маршрута</p>
    <ol className={styles.pointList}>
      {points.map((point, index) => <li key={point.key} className={styles.pointRow}>
        <span className={styles.pointNumber} aria-hidden="true">{index + 1}</span>
        <label className={styles.pointSelect} htmlFor={`${fieldId}-${point.key}`}>
          <span>{pointLabel(index, points.length)}</span>
          <select
            id={`${fieldId}-${point.key}`}
            name="orderedPoiId"
            required
            value={point.poiId}
            onChange={(event) => update(point.key, event.target.value)}
          >
            <option value="">Выберите точку</option>
            {pointOptions.map((option) => <option
              key={option.id}
              value={option.id}
              disabled={option.id !== point.poiId && selectedIds.has(option.id)}
            >{option.name}</option>)}
          </select>
        </label>
        <div className={styles.pointActions} aria-label={`Изменить позицию ${index + 1}`}>
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Переместить ${pointLabel(index, points.length).toLocaleLowerCase('ru')} выше`}>↑</button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === points.length - 1} aria-label={`Переместить ${pointLabel(index, points.length).toLocaleLowerCase('ru')} ниже`}>↓</button>
          <button type="button" className={styles.removeButton} onClick={() => remove(point.key)} disabled={points.length <= 2} aria-label={`Удалить ${pointLabel(index, points.length).toLocaleLowerCase('ru')}`}>Убрать</button>
        </div>
      </li>)}
    </ol>
    <div className={styles.addRow}>
      <button type="button" onClick={add} disabled={points.length >= maximumPoints}>+ Добавить остановку</button>
      <span>{points.length} из {maximumPoints}</span>
    </div>
  </div>;
}
