'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from 'react';
import { previewCircuitCardImage, uploadCircuitCardImage } from '../../actions';

type Position = { x: number; y: number };
type CurrentImage = { url: string; altTextRu: string; author: string; licence: string; sourceUrl: string } | null;
const clamp = (value: number) => Math.min(50, Math.max(-50, value));

export function CircuitCardImageForm({ circuitId, circuitName, currentImage }: {
  circuitId: string; circuitName: string; currentImage: CurrentImage;
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
  const resetCrop = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };
  function selectFile(file: File | null) {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFileName(file?.name ?? ''); setSourcePreview(file ? URL.createObjectURL(file) : null);
    setProcessedPreview(null); setPreviewToken(''); setPreviewError(''); resetCrop();
  }
  function createPreview() {
    if (!formRef.current) return;
    startPreview(async () => {
      const result = await previewCircuitCardImage(new FormData(formRef.current!));
      if (!result.ok) { setProcessedPreview(null); setPreviewToken(''); setPreviewError(result.error); return; }
      setPreviewError(''); setProcessedPreview(result.imageDataUrl); setPreviewToken(result.token);
    });
  }
  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (!processedPreview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position };
  }
  function moveImage(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPosition({ x: clamp(drag.position.x + (event.clientX - drag.x) / bounds.width * 100), y: clamp(drag.position.y + (event.clientY - drag.y) / bounds.height * 100) });
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const movement: Record<string, Position> = { ArrowLeft: { x: -2, y: 0 }, ArrowRight: { x: 2, y: 0 }, ArrowUp: { x: 0, y: -2 }, ArrowDown: { x: 0, y: 2 } };
    const delta = movement[event.key]; if (!delta) return; event.preventDefault();
    setPosition((current) => ({ x: clamp(current.x + delta.x), y: clamp(current.y + delta.y) }));
  }
  return <form ref={formRef} action={uploadCircuitCardImage} className="admin-editor-form admin-photo-form admin-circuit-card-image-form" id="card-image">
    <input type="hidden" name="id" value={circuitId} /><input type="hidden" name="previewToken" value={previewToken} />
    <input type="hidden" name="cropZoom" value={zoom} /><input type="hidden" name="cropX" value={position.x} /><input type="hidden" name="cropY" value={position.y} />
    <fieldset><legend>Изображение карточки трассы</legend>
      {currentImage ? <div className="admin-current-photo is-circuit"><img src={currentImage.url} alt={currentImage.altTextRu} /><div><strong>Текущее изображение</strong><span>{currentImage.author}</span><span>{currentImage.licence}</span><a href={currentImage.sourceUrl} target="_blank" rel="noreferrer">Открыть источник ↗</a></div></div> : <p className="admin-field-note">Изображение ещё не загружено — каталог показывает контур трассы</p>}
      <div className="admin-form-grid">
        <label className="is-wide admin-file-picker"><span>Файл изображения</span><input name="cardImage" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)} /><span className="admin-file-picker-control"><strong>{fileName ? 'Заменить' : 'Выбрать файл'}</strong><em>{fileName || 'Файл не выбран'}</em></span><small>JPG, PNG или WebP до 8 МБ. Будут созданы WebP 1600×900, 960×540 и 480×270</small></label>
        {sourcePreview ? <div className="admin-photo-preview is-car is-wide" aria-live="polite"><figure><figcaption>Исходник</figcaption><div className="admin-photo-crop-viewport is-source"><img src={sourcePreview} alt="Исходное изображение трассы" /></div></figure><figure><figcaption>Кадр карточки</figcaption>{processedPreview ? <div className="admin-photo-crop-viewport is-editable" tabIndex={0} role="group" aria-label="Кадрирование изображения трассы" onPointerDown={startDragging} onPointerMove={moveImage} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onKeyDown={moveWithKeyboard}><img src={processedPreview} alt="Предпросмотр карточки трассы" draggable={false} style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${zoom})` }} /></div> : <div className="admin-photo-preview-placeholder">Создайте предпросмотр</div>}</figure></div> : null}
        {processedPreview ? <div className="admin-crop-controls is-wide"><label><span>Масштаб: {zoom.toFixed(2)}×</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} /></label><button type="button" onClick={resetCrop}>Сбросить кадрирование</button><span>Перетаскивайте изображение или используйте клавиши со стрелками</span></div> : null}
        {previewError ? <div className="admin-alert is-error is-wide" role="alert">{previewError}</div> : null}
        <div className="admin-preview-actions is-wide"><button type="button" onClick={createPreview} disabled={!sourcePreview || isPreviewing}>{isPreviewing ? 'Обработка…' : processedPreview ? 'Обновить предпросмотр' : 'Создать предпросмотр'}</button><span>Предпросмотр хранится 15 минут и не записывается в базу</span></div>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" defaultValue={currentImage?.altTextRu || `${circuitName}, трасса Formula 1`} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" defaultValue={currentImage?.author || ''} required /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" defaultValue={currentImage?.licence || ''} required /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="photoSourceUrl" type="url" defaultValue={currentImage?.sourceUrl || ''} required placeholder="https://…" /></label>
        <label className="is-wide admin-rights-confirmation"><input name="rightsConfirmed" type="checkbox" value="yes" required /><span>Я проверил право использовать изображение и корректно указал автора и лицензию</span></label>
      </div>
    </fieldset><div className="admin-form-actions"><span>После сохранения карточка каталога обновится автоматически</span><button type="submit" disabled={!previewToken || isPreviewing}>Сохранить изображение</button></div>
  </form>;
}
