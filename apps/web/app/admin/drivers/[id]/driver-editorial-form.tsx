'use client';

import { useState } from 'react';
import { updateDriverEditorial } from '../../actions';

type Nickname = { key: string; nameRu: string; nameOriginal: string; contextRu: string; sourceUrl: string };
type Quote = { key: string; quoteRu: string; quoteOriginal: string; attributionRu: string; contextRu: string; quoteDate: string; sourceUrl: string };

const emptyNickname = (): Nickname => ({ key: crypto.randomUUID(), nameRu: '', nameOriginal: '', contextRu: '', sourceUrl: '' });
const emptyQuote = (): Quote => ({ key: crypto.randomUUID(), quoteRu: '', quoteOriginal: '', attributionRu: '', contextRu: '', quoteDate: '', sourceUrl: '' });

export function DriverEditorialForm({ driverId, expectedRevision, initialNicknames, initialQuotes }: {
  driverId: string;
  expectedRevision: string;
  initialNicknames: Omit<Nickname, 'key'>[];
  initialQuotes: Omit<Quote, 'key'>[];
}) {
  const [nicknames, setNicknames] = useState<Nickname[]>(initialNicknames.map((row, index) => ({ ...row, key: `nickname-${index}` })));
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes.map((row, index) => ({ ...row, key: `quote-${index}` })));
  const payload = JSON.stringify({
    nicknames: nicknames.map((row) => ({ nameRu: row.nameRu, nameOriginal: row.nameOriginal, contextRu: row.contextRu, sourceUrl: row.sourceUrl })),
    quotes: quotes.map((row) => ({ quoteRu: row.quoteRu, quoteOriginal: row.quoteOriginal, attributionRu: row.attributionRu, contextRu: row.contextRu, quoteDate: row.quoteDate, sourceUrl: row.sourceUrl })),
  });

  const updateNickname = (key: string, field: keyof Omit<Nickname, 'key'>, value: string) => setNicknames((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const updateQuote = (key: string, field: keyof Omit<Quote, 'key'>, value: string) => setQuotes((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value } : row));

  return <form action={updateDriverEditorial} className="admin-editor-form admin-driver-editorial-form">
    <input type="hidden" name="id" value={driverId} />
    <input type="hidden" name="expectedRevision" value={expectedRevision} />
    <input type="hidden" name="editorialJson" value={payload} />
    <fieldset>
      <legend>Прозвища</legend>
      <p className="admin-field-note">Можно добавить несколько прозвищ. Для каждого укажите проверяемый источник</p>
      <div className="admin-editorial-list">
        {nicknames.map((nickname, index) => <article className="admin-editorial-card" key={nickname.key}>
          <header><strong>Прозвище {index + 1}</strong><button type="button" onClick={() => setNicknames((rows) => rows.filter((row) => row.key !== nickname.key))}>Удалить</button></header>
          <div className="admin-form-grid">
            <label><span>На русском</span><input value={nickname.nameRu} onChange={(event) => updateNickname(nickname.key, 'nameRu', event.target.value)} required /></label>
            <label><span>В оригинале</span><input value={nickname.nameOriginal} onChange={(event) => updateNickname(nickname.key, 'nameOriginal', event.target.value)} /></label>
            <label className="is-wide"><span>Происхождение или контекст</span><textarea rows={3} value={nickname.contextRu} onChange={(event) => updateNickname(nickname.key, 'contextRu', event.target.value)} /></label>
            <label className="is-wide"><span>URL источника</span><input type="url" value={nickname.sourceUrl} onChange={(event) => updateNickname(nickname.key, 'sourceUrl', event.target.value)} required placeholder="https://…" /></label>
          </div>
        </article>)}
        {!nicknames.length ? <p className="admin-editorial-empty">Прозвища пока не добавлены</p> : null}
      </div>
      <button className="admin-secondary-action" type="button" onClick={() => setNicknames((rows) => [...rows, emptyNickname()])}>+ Добавить прозвище</button>
    </fieldset>
    <fieldset>
      <legend>Цитаты</legend>
      <p className="admin-field-note">Русский текст и автор обязательны. Оригинал, дата и контекст помогают проверить перевод</p>
      <div className="admin-editorial-list">
        {quotes.map((quote, index) => <article className="admin-editorial-card" key={quote.key}>
          <header><strong>Цитата {index + 1}</strong><button type="button" onClick={() => setQuotes((rows) => rows.filter((row) => row.key !== quote.key))}>Удалить</button></header>
          <div className="admin-form-grid">
            <label className="is-wide"><span>Цитата на русском</span><textarea rows={4} value={quote.quoteRu} onChange={(event) => updateQuote(quote.key, 'quoteRu', event.target.value)} required /></label>
            <label className="is-wide"><span>Оригинальный текст</span><textarea rows={3} value={quote.quoteOriginal} onChange={(event) => updateQuote(quote.key, 'quoteOriginal', event.target.value)} /></label>
            <label><span>Автор или источник высказывания</span><input value={quote.attributionRu} onChange={(event) => updateQuote(quote.key, 'attributionRu', event.target.value)} required /></label>
            <label><span>Дата</span><input type="date" value={quote.quoteDate} onChange={(event) => updateQuote(quote.key, 'quoteDate', event.target.value)} /></label>
            <label className="is-wide"><span>Контекст</span><textarea rows={3} value={quote.contextRu} onChange={(event) => updateQuote(quote.key, 'contextRu', event.target.value)} /></label>
            <label className="is-wide"><span>URL источника</span><input type="url" value={quote.sourceUrl} onChange={(event) => updateQuote(quote.key, 'sourceUrl', event.target.value)} required placeholder="https://…" /></label>
          </div>
        </article>)}
        {!quotes.length ? <p className="admin-editorial-empty">Цитаты пока не добавлены</p> : null}
      </div>
      <button className="admin-secondary-action" type="button" onClick={() => setQuotes((rows) => [...rows, emptyQuote()])}>+ Добавить цитату</button>
    </fieldset>
    <div className="admin-form-actions"><span>Материалы получат статус «Проверено редактором»</span><button type="submit">Сохранить прозвища и цитаты</button></div>
  </form>;
}
