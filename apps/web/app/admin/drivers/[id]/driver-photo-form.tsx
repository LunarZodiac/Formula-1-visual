'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from 'react';
import { previewDriverPhoto, uploadDriverPhoto } from '../../actions';

type DriverPhoto = {
  url: string;
  altTextRu: string;
  author: string;
  licence: string;
  sourceUrl: string;
};

type Position = { x: number; y: number };
const clamp = (value: number) => Math.min(50, Math.max(-50, value));

export function DriverPhotoForm({ driverId, driverName, currentPhoto }: {
  driverId: string;
  driverName: string;
  currentPhoto: DriverPhoto | null;
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

  useEffect(() => () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
  }, [sourcePreview]);

  function resetCrop() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }

  function resetProcessedPreview(resetPosition = false) {
    setProcessedPreview(null);
    setPreviewToken('');
    setPreviewError('');
    if (resetPosition) resetCrop();
  }

  function selectFile(file: File | null) {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFileName(file?.name ?? '');
    setSourcePreview(file ? URL.createObjectURL(file) : null);
    resetProcessedPreview(true);
  }

  function createPreview() {
    const form = formRef.current;
    if (!form) return;
    startPreview(async () => {
      setPreviewError('');
      const result = await previewDriverPhoto(new FormData(form));
      if (!result.ok) {
        setProcessedPreview(null);
        setPreviewToken('');
        setPreviewError(result.error);
        return;
      }
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

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
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

  return <form ref={formRef} action={uploadDriverPhoto} className="admin-editor-form admin-photo-form">
    <input type="hidden" name="id" value={driverId} />
    <input type="hidden" name="previewToken" value={previewToken} />
    <input type="hidden" name="cropZoom" value={zoom} />
    <input type="hidden" name="cropX" value={position.x} />
    <input type="hidden" name="cropY" value={position.y} />
    <fieldset id="photo">
      <legend>Фотография пилота</legend>
      {currentPhoto ? <div className="admin-current-photo">
        <img src={currentPhoto.url} alt={currentPhoto.altTextRu} />
        <div><strong>Текущая фотография</strong><span>{currentPhoto.author}</span><span>{currentPhoto.licence}</span><a href={currentPhoto.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a></div>
      </div> : <p className="admin-field-note">Фотография пока не загружена</p>}
      <div className="admin-form-grid">
        <label className="is-wide admin-file-picker"><span>Файл фотографии</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)} /><span className="admin-file-picker-control"><strong>{fileName ? 'Заменить' : 'Выбрать файл'}</strong><em>{fileName || 'Файл не выбран'}</em></span><small>JPG, PNG или WebP, не больше 8 МБ. Исходник сохраняется, а сайт получает WebP-версии 1200×1500, 700×875 и 320×400</small></label>
        <label className="is-wide admin-rights-confirmation"><input name="removeBackground" type="checkbox" value="yes" defaultChecked onChange={() => resetProcessedPreview(true)} /><span><strong>Удалить фон локально с помощью ISNet</strong><small>Первый предпросмотр после запуска занимает больше времени; следующие используют уже загруженную модель</small></span></label>
        {sourcePreview ? <div className="admin-photo-preview is-wide" aria-live="polite">
          <figure><figcaption>Исходник</figcaption><div className="admin-photo-crop-viewport is-source"><img src={sourcePreview} alt="Предпросмотр исходной фотографии" /></div></figure>
          <figure><figcaption>Результат для сайта</figcaption>{processedPreview ? <div className="admin-photo-crop-viewport is-editable" tabIndex={0} role="group" aria-label="Кадрирование фотографии. Перетаскивайте изображение или используйте клавиши со стрелками" onPointerDown={startDragging} onPointerMove={moveImage} onPointerUp={stopDragging} onPointerCancel={stopDragging} onKeyDown={moveWithKeyboard}><img src={processedPreview} alt="Предпросмотр обработанной фотографии" draggable={false} style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${zoom})` }} /></div> : <div className="admin-photo-preview-placeholder">Создайте предпросмотр</div>}</figure>
        </div> : null}
        {processedPreview ? <div className="admin-crop-controls is-wide">
          <label><span>Масштаб: {zoom.toFixed(2)}×</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} /></label>
          <button type="button" onClick={resetCrop}>Сбросить кадрирование</button>
          <span>Перетащите фотографию в окне результата или используйте клавиши со стрелками</span>
        </div> : null}
        {previewError ? <div className="admin-alert is-error is-wide" role="alert">{previewError}</div> : null}
        <div className="admin-preview-actions is-wide"><button type="button" onClick={createPreview} disabled={!sourcePreview || isPreviewing}>{isPreviewing ? 'Обработка…' : processedPreview ? 'Обновить предпросмотр' : 'Создать предпросмотр'}</button><span>Предпросмотр хранится 15 минут и не записывается в базу</span></div>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" defaultValue={`${driverName}, фотография пилота`} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" required placeholder="Имя фотографа или организация" /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" required placeholder="Например: CC BY 4.0" /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="photoSourceUrl" type="url" required placeholder="https://…" /><small>Укажите страницу, где опубликована фотография и описаны условия использования</small></label>
        <label className="is-wide admin-rights-confirmation"><input name="rightsConfirmed" type="checkbox" value="yes" required /><span>Я проверил право использовать эту фотографию на сайте и корректно указал автора и лицензию</span></label>
      </div>
    </fieldset>
    <div className="admin-form-actions"><span>Исходник сохраняется без изменений. В базу попадёт выбранное кадрирование</span><button type="submit" disabled={!previewToken || isPreviewing}>Сохранить фотографию</button></div>
  </form>;
}
