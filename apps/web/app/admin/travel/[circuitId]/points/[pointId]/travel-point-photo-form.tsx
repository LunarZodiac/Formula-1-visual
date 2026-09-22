'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from 'react';
import { previewTravelPointPhoto, uploadTravelPointPhoto } from '../../../../actions';

type Position = { x: number; y: number };
type CurrentPhoto = {
  id: string;
  url: string;
  altTextRu: string | null;
  author: string | null;
  licence: string | null;
  sourceUrl: string | null;
} | null;

const clamp = (value: number) => Math.min(50, Math.max(-50, value));

export function TravelPointPhotoForm({ circuitId, pointId, pointName, currentPhoto }: {
  circuitId: string;
  pointId: string;
  pointName: string;
  currentPhoto: CurrentPhoto;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; position: Position } | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isPreviewing, startPreview] = useTransition();

  useEffect(() => () => { if (sourcePreview) URL.revokeObjectURL(sourcePreview); }, [sourcePreview]);

  function resetCrop() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }

  function selectFile(file: File | null) {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFileName(file?.name ?? '');
    setSourcePreview(file ? URL.createObjectURL(file) : null);
    setProcessedPreview(null);
    setPreviewToken('');
    setPreviewError('');
    resetCrop();
  }

  function createPreview() {
    if (!formRef.current) return;
    startPreview(async () => {
      const result = await previewTravelPointPhoto(new FormData(formRef.current!));
      if (!result.ok) {
        setProcessedPreview(null);
        setPreviewToken('');
        setPreviewError(result.error);
        return;
      }
      setPreviewError('');
      setProcessedPreview(result.imageDataUrl);
      setPreviewToken(result.token);
    });
  }

  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (!processedPreview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position };
  }

  function moveImage(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: clamp(drag.position.x + (event.clientX - drag.x) / bounds.width * 100),
      y: clamp(drag.position.y + (event.clientY - drag.y) / bounds.height * 100),
    });
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const movement: Record<string, Position> = {
      ArrowLeft: { x: -2, y: 0 }, ArrowRight: { x: 2, y: 0 },
      ArrowUp: { x: 0, y: -2 }, ArrowDown: { x: 0, y: 2 },
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    setPosition((current) => ({ x: clamp(current.x + delta.x), y: clamp(current.y + delta.y) }));
  }

  return <form ref={formRef} id="photo-upload" action={uploadTravelPointPhoto} className="admin-editor-form admin-photo-form admin-travel-photo-upload">
    <input type="hidden" name="circuitId" value={circuitId} />
    <input type="hidden" name="pointId" value={pointId} />
    <input type="hidden" name="previewToken" value={previewToken} />
    <input type="hidden" name="cropZoom" value={zoom} />
    <input type="hidden" name="cropX" value={position.x} />
    <input type="hidden" name="cropY" value={position.y} />
    <fieldset><legend>{currentPhoto ? 'Заменить фотографию' : 'Добавить фотографию'}</legend>
      {currentPhoto ? <div className="admin-current-photo is-travel"><img src={currentPhoto.url} alt={currentPhoto.altTextRu ?? ''} /><div><strong>Текущая фотография</strong>{currentPhoto.author ? <span>{currentPhoto.author}</span> : null}{currentPhoto.licence ? <span>{currentPhoto.licence}</span> : null}{currentPhoto.sourceUrl ? <a href={currentPhoto.sourceUrl} target="_blank" rel="noreferrer">Открыть источник ↗</a> : null}<a href={`/admin/media/${encodeURIComponent(currentPhoto.id)}`}>Открыть материал в медиатеке →</a></div></div> : <p className="admin-field-note">Фотография пока не загружена. Публичная карточка сохранит аккуратное состояние без пустой рамки</p>}
      <div className="admin-form-grid">
        <label className="is-wide admin-file-picker"><span>Файл фотографии</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)} /><span className="admin-file-picker-control"><strong>{fileName ? 'Заменить' : 'Выбрать файл'}</strong><em>{fileName || 'Файл не выбран'}</em></span><small>JPG, PNG или WebP до 8 МБ. Итоговые версии: 1280×720, 640×360 и 320×180</small></label>
        {sourcePreview ? <div className="admin-photo-preview is-travel is-wide" aria-live="polite"><figure><figcaption>Исходник</figcaption><div className="admin-photo-crop-viewport is-source"><img src={sourcePreview} alt="Исходная фотография туристической точки" /></div></figure><figure><figcaption>Карточка и окно карты</figcaption>{processedPreview ? <div className="admin-photo-crop-viewport is-editable" tabIndex={0} role="group" aria-label="Кадрирование фотографии туристической точки" onPointerDown={startDragging} onPointerMove={moveImage} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onKeyDown={moveWithKeyboard}><img src={processedPreview} alt="Предпросмотр фотографии туристической точки" draggable={false} style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${zoom})` }} /></div> : <div className="admin-photo-preview-placeholder">Создайте предпросмотр</div>}</figure></div> : null}
        {processedPreview ? <div className="admin-crop-controls is-wide"><label><span>Масштаб: {zoom.toFixed(2)}×</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} /></label><button type="button" onClick={resetCrop}>Сбросить кадрирование</button><span>Перетаскивайте изображение или используйте клавиши со стрелками</span></div> : null}
        {previewError ? <div className="admin-alert is-error is-wide" role="alert">{previewError}</div> : null}
        <div className="admin-preview-actions is-wide"><button type="button" onClick={createPreview} disabled={!sourcePreview || isPreviewing}>{isPreviewing ? 'Обработка…' : processedPreview ? 'Обновить предпросмотр' : 'Создать предпросмотр'}</button><span>Предпросмотр хранится 15 минут и не изменяет опубликованные данные</span></div>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" defaultValue={currentPhoto?.altTextRu || `${pointName} — туристическая точка рядом с трассой`} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" defaultValue={currentPhoto?.author || ''} required placeholder="Имя фотографа или организация" /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" defaultValue={currentPhoto?.licence || ''} required placeholder="Например: CC BY-SA 4.0" /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="photoSourceUrl" type="url" defaultValue={currentPhoto?.sourceUrl || ''} placeholder="https://…" required /><small>Укажите страницу публикации фотографии и условий её использования</small></label>
        <label className="is-wide admin-rights-confirmation"><input type="checkbox" name="rightsConfirmed" value="yes" required /><span><strong>Права и источник проверены</strong><small>Материал будет зарегистрирован для карточки точки и окна на карте</small></span></label>
      </div>
    </fieldset>
    <div className="admin-form-actions"><span>Исходник сохраняется отдельно. В базу попадёт выбранное кадрирование</span><button type="submit" disabled={!previewToken || isPreviewing}>{currentPhoto ? 'Заменить фотографию' : 'Сохранить фотографию'}</button></div>
  </form>;
}
