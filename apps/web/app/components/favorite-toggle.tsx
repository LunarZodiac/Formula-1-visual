'use client';

import { useEffect, useState } from 'react';

const keys = {
  circuit: 'f1-atlas-favorite-circuits',
  driver: 'f1-atlas-favorite-drivers',
  team: 'f1-atlas-favorite-teams',
} as const;

export function FavoriteToggle({ type, id, label }: { type: keyof typeof keys; id: string; label: string }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(keys[type]) ?? '[]');
        setFavorite(Array.isArray(stored) && stored.includes(id));
      } catch { setFavorite(false); }
    });
  }, [id, type]);

  const toggle = () => {
    let stored: string[] = [];
    try { const value = JSON.parse(window.localStorage.getItem(keys[type]) ?? '[]'); if (Array.isArray(value)) stored = value.filter((item): item is string => typeof item === 'string'); } catch { /* Начинаем с пустого корректного значения. */ }
    const next = favorite ? stored.filter((item) => item !== id) : [id, ...stored.filter((item) => item !== id)];
    window.localStorage.setItem(keys[type], JSON.stringify(next));
    setFavorite(!favorite);
    window.dispatchEvent(new Event('f1-favorites-changed'));
  };

  return <button className={`profile-favorite-toggle${favorite ? ' is-active' : ''}`} type="button" aria-pressed={favorite} onClick={toggle}><span aria-hidden="true">{favorite ? '★' : '☆'}</span>{favorite ? 'В избранном' : `Сохранить ${label}`}</button>;
}
