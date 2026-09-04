'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SearchIndexItem } from './site-search';

const groupOrder: SearchIndexItem['type'][] = ['circuit', 'driver', 'team', 'season', 'race', 'layout', 'location'];
const groupLabels: Record<SearchIndexItem['type'], string> = {
  circuit: 'Трассы', driver: 'Пилоты', team: 'Команды', season: 'Сезоны',
  race: 'Этапы', layout: 'Конфигурации', location: 'География',
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
}

export function HeaderSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const lockedScrollPositionRef = useRef<number | null>(null);
  const [items, setItems] = useState<SearchIndexItem[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    fetch('/data/search-index.json').then((response) => response.ok ? response.json() : Promise.reject()).then((index: { items: SearchIndexItem[] }) => setItems(index.items)).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) { lockedScrollPositionRef.current = null; setOpen(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const groups = useMemo(() => {
    const needle = normalize(query);
    if (needle.length < 2) return [];
    const matches = items.flatMap((item) => {
      const title = normalize(item.title);
      const haystack = normalize([item.title, item.subtitle, ...item.tokens].join(' '));
      if (!haystack.includes(needle)) return [];
      return [{ item, score: title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : 3 }];
    }).sort((left, right) => left.score - right.score || left.item.title.localeCompare(right.item.title, 'ru'));
    return groupOrder.map((type) => ({ type, items: matches.filter((match) => match.item.type === type).slice(0, 3).map((match) => match.item) })).filter((group) => group.items.length > 0);
  }, [items, query]);
  const actionable = groups.flatMap((group) => group.items).filter((item) => item.href);

  function restoreScrollPosition(top: number) {
    const restore = () => {
      if (Math.abs(window.scrollY - top) < 1) return;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo({ top, left: window.scrollX });
      root.style.scrollBehavior = previousBehavior;
    };
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
      window.setTimeout(restore, 80);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); event.currentTarget.blur(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setActiveIndex((current) => event.key === 'ArrowDown' ? Math.min(current + 1, actionable.length - 1) : Math.max(current - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = activeIndex >= 0 ? actionable[activeIndex]?.href : null;
      router.push(target ?? `/search?q=${encodeURIComponent(query.trim())}`);
      setOpen(false);
    }
  }

  let actionableIndex = -1;
  return (
    <div className="header-search" ref={rootRef} onPointerDownCapture={() => { lockedScrollPositionRef.current = window.scrollY; }}>
      <span aria-hidden="true">⌕</span><input type="search" role="combobox" aria-autocomplete="list" value={query} onFocus={() => { const top = lockedScrollPositionRef.current ?? window.scrollY; lockedScrollPositionRef.current = top; setOpen(true); restoreScrollPosition(top); }} onChange={(event) => { const top = lockedScrollPositionRef.current ?? window.scrollY; setQuery(event.target.value); setOpen(true); setActiveIndex(-1); restoreScrollPosition(top); }} onKeyDown={handleKeyDown} placeholder="Поиск по атласу" aria-label="Поиск по сайту" aria-expanded={open && query.trim().length >= 2} aria-controls="header-search-suggestions" />
      {open && query.trim().length >= 2 && <div className="header-search-panel" id="header-search-suggestions">
        {groups.length > 0 ? groups.map((group) => <section key={group.type}><header><strong>{groupLabels[group.type]}</strong><span>{group.items.length}</span></header>{group.items.map((item) => {
          if (item.href) actionableIndex += 1;
          const content = <><strong>{item.title}</strong><small>{item.subtitle}</small></>;
          return item.href ? <Link className={actionableIndex === activeIndex ? 'is-active' : ''} href={item.href} key={item.id} onClick={() => setOpen(false)}>{content}</Link> : <div key={item.id}>{content}</div>;
        })}</section>) : <p>Совпадений не найдено</p>}
        <Link className="header-search-all" href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={() => setOpen(false)}>Все результаты →</Link>
      </div>}
    </div>
  );
}
