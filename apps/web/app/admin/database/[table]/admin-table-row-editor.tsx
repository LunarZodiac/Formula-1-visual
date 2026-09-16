'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AdminTableColumn } from '../../../lib/admin-database';
import { updateDatabaseRow } from '../../actions';

type TableRow = Record<string, unknown>;

function fieldValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function displayValue(value: unknown) {
  const result = value === null || value === undefined ? 'NULL' : fieldValue(value);
  return result.length > 140 ? `${result.slice(0, 137)}…` : result;
}

function EditorField({ column, value }: { column: AdminTableColumn; value: unknown }) {
  const content = fieldValue(value);
  const isLong = column.dataType === 'text' || column.dataType === 'json' || column.dataType === 'jsonb' || column.dataType === 'ARRAY' || content.length > 100;
  return <label className={isLong ? 'is-wide' : undefined}>
    <span>{column.name}</span>
    {isLong
      ? <textarea name={`field:${column.name}`} rows={column.dataType === 'text' ? 5 : 3} defaultValue={content} />
      : <input name={`field:${column.name}`} defaultValue={content} />}
    <small>{column.dataType}{column.nullable ? ' · допускает NULL' : ' · обязательно'}</small>
  </label>;
}

export function AdminTableRowEditor({ table, page, columns, primaryKey, rows }: {
  table: string;
  page: number;
  columns: AdminTableColumn[];
  primaryKey: string[];
  rows: TableRow[];
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const selectedRow = selectedIndex === null ? null : rows[selectedIndex];

  function closeEditor() {
    setSelectedIndex(null);
  }

  useEffect(() => {
    if (!selectedRow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button');
    firstControl?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, button:not(:disabled)')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [selectedRow]);

  const key = selectedRow ? Object.fromEntries(primaryKey.map((name) => [name, selectedRow[name]])) : null;

  return <>
    <div className="admin-table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.name}>{column.name}<small>{column.dataType}</small></th>)}<th>Действия</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const rowKey = Object.fromEntries(primaryKey.map((name) => [name, row[name]]));
          return <tr key={JSON.stringify(rowKey) || index}>
            {columns.map((column) => <td key={column.name} title={fieldValue(row[column.name])}><span className={row[column.name] == null ? 'is-null' : undefined}>{displayValue(row[column.name])}</span></td>)}
            <td className="admin-row-editor-cell"><button type="button" aria-haspopup="dialog" aria-expanded={selectedIndex === index} onClick={(event) => {
              openerRef.current = event.currentTarget;
              setSelectedIndex(index);
            }}>Редактировать</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {selectedRow && key ? <div className="admin-database-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeEditor();
    }}>
      <div ref={dialogRef} className="admin-database-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><span className="admin-kicker">Редактирование строки</span><h2 id={titleId}>{table}</h2></div><button type="button" aria-label="Закрыть редактор" onClick={closeEditor}>×</button></header>
        <form action={updateDatabaseRow}>
          <input type="hidden" name="table" value={table} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="key" value={JSON.stringify(key)} />
          <div className="admin-generic-editor">{columns.filter((column) => column.editable).map((column) => <EditorField column={column} value={selectedRow[column.name]} key={column.name} />)}</div>
          <div className="admin-form-actions"><span>Введите <code>null</code>, чтобы очистить необязательное поле</span><button className="admin-modal-cancel" type="button" onClick={closeEditor}>Отмена</button><button type="submit">Сохранить строку</button></div>
        </form>
      </div>
    </div> : null}
  </>;
}
