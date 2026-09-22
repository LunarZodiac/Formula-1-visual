'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition } from 'react';
import { previewGameLogo, uploadGameLogo } from '../actions';

type GameId = 'outline' | 'map' | 'driver-geography' | 'calendar-optimizer';

export function GameLogoForm({ gameId, title }: { gameId: GameId; title: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState('');
  const [error, setError] = useState('');
  const [isPreviewing, startPreview] = useTransition();
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({ altTextRu: `Логотип игры «${title}»`, author: '', licence: '', sourceUrl: '' });
  useEffect(() => () => { if (sourcePreview) URL.revokeObjectURL(sourcePreview); }, [sourcePreview]);
  useEffect(() => {
    fetch('/data/games-media.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        setCurrentImage(typeof value?.logos?.[gameId] === 'string' ? value.logos[gameId] : null);
        const credit = value?.credits?.[gameId];
        if (credit && typeof credit === 'object') {
          setMetadata({
            altTextRu: typeof credit.altTextRu === 'string' && credit.altTextRu ? credit.altTextRu : `Логотип игры «${title}»`,
            author: typeof credit.author === 'string' ? credit.author : '',
            licence: typeof credit.licence === 'string' ? credit.licence : '',
            sourceUrl: typeof credit.sourceUrl === 'string' ? credit.sourceUrl : '',
          });
        }
      })
      .catch(() => {});
  }, [gameId]);

  function selectFile(file: File | null) {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFileName(file?.name ?? ''); setSourcePreview(file ? URL.createObjectURL(file) : null);
    setProcessedPreview(null); setPreviewToken(''); setError('');
  }
  function createPreview() {
    if (!formRef.current) return;
    startPreview(async () => {
      const result = await previewGameLogo(new FormData(formRef.current!));
      if (!result.ok) { setProcessedPreview(null); setPreviewToken(''); setError(result.error); return; }
      setError(''); setProcessedPreview(result.imageDataUrl); setPreviewToken(result.token);
    });
  }

  return <form ref={formRef} action={uploadGameLogo} className="admin-editor-form admin-photo-form">
    <input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="previewToken" value={previewToken} />
    <input type="hidden" name="cropZoom" value="1" /><input type="hidden" name="cropX" value="0" /><input type="hidden" name="cropY" value="0" />
    <fieldset><legend>{title}</legend>
      {currentImage ? <div className="admin-current-logo"><img src={currentImage} alt={metadata.altTextRu} /><div><strong>Текущий логотип</strong><span>Отображается на карточке игры</span>{metadata.sourceUrl ? <a href={metadata.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a> : null}</div></div> : <p className="admin-field-note">Логотип пока не загружен</p>}
      <div className="admin-form-grid">
        <label className="is-wide admin-file-picker"><span>Файл логотипа</span><input name="gameLogo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)} /><span className="admin-file-picker-control"><strong>{fileName ? 'Заменить' : 'Выбрать файл'}</strong><em>{fileName || 'Файл не выбран'}</em></span><small>PNG или WebP с прозрачностью предпочтительнее. Будут подготовлены версии 512, 256 и 128 пикселей</small></label>
        {sourcePreview ? <div className="admin-photo-preview is-logo is-wide"><figure><figcaption>Исходник</figcaption><div className="admin-photo-crop-viewport"><img src={sourcePreview} alt="Исходный логотип" /></div></figure><figure><figcaption>Результат для сайта</figcaption>{processedPreview ? <div className="admin-photo-crop-viewport"><img src={processedPreview} alt="Обработанный логотип" /></div> : <div className="admin-photo-preview-placeholder">Создайте предпросмотр</div>}</figure></div> : null}
        {error ? <div className="admin-alert is-error is-wide" role="alert">{error}</div> : null}
        <div className="admin-preview-actions is-wide"><button type="button" onClick={createPreview} disabled={!sourcePreview || isPreviewing}>{isPreviewing ? 'Обработка…' : processedPreview ? 'Обновить предпросмотр' : 'Создать предпросмотр'}</button><span>Фон не удаляется автоматически</span></div>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" value={metadata.altTextRu} onChange={(event) => setMetadata((current) => ({ ...current, altTextRu: event.currentTarget.value }))} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" value={metadata.author} onChange={(event) => setMetadata((current) => ({ ...current, author: event.currentTarget.value }))} required /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" value={metadata.licence} onChange={(event) => setMetadata((current) => ({ ...current, licence: event.currentTarget.value }))} required /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="photoSourceUrl" type="url" value={metadata.sourceUrl} onChange={(event) => setMetadata((current) => ({ ...current, sourceUrl: event.currentTarget.value }))} required placeholder="https://…" /></label>
        <label className="is-wide admin-rights-confirmation"><input name="rightsConfirmed" type="checkbox" value="yes" required /><span>Я проверил право использовать логотип и корректно указал источник</span></label>
      </div>
    </fieldset>
    <div className="admin-form-actions"><span>Исходник сохраняется без изменений</span><button type="submit" disabled={!previewToken || isPreviewing}>Сохранить логотип</button></div>
  </form>;
}
