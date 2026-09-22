'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition } from 'react';
import { previewConstructorLogo, uploadConstructorLogo } from '../../../actions';

export function ConstructorLogoForm({ season, constructorId, teamName, currentImage, currentMedia }: {
  season: number;
  constructorId: string;
  teamName: string;
  currentImage: string | null;
  currentMedia: { altTextRu: string; author: string; licence: string; sourceUrl: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState('');
  const [error, setError] = useState('');
  const [isPreviewing, startPreview] = useTransition();
  useEffect(() => () => { if (sourcePreview) URL.revokeObjectURL(sourcePreview); }, [sourcePreview]);

  function selectFile(file: File | null) {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFileName(file?.name ?? ''); setSourcePreview(file ? URL.createObjectURL(file) : null);
    setProcessedPreview(null); setPreviewToken(''); setError('');
  }
  function createPreview() {
    if (!formRef.current) return;
    startPreview(async () => {
      const result = await previewConstructorLogo(new FormData(formRef.current!));
      if (!result.ok) { setProcessedPreview(null); setPreviewToken(''); setError(result.error); return; }
      setError(''); setProcessedPreview(result.imageDataUrl); setPreviewToken(result.token);
    });
  }

  return <form ref={formRef} action={uploadConstructorLogo} className="admin-editor-form admin-photo-form">
    <input type="hidden" name="season" value={season} /><input type="hidden" name="constructorId" value={constructorId} />
    <input type="hidden" name="previewToken" value={previewToken} /><input type="hidden" name="cropZoom" value="1" />
    <input type="hidden" name="cropX" value="0" /><input type="hidden" name="cropY" value="0" />
    <fieldset><legend>Логотип команды</legend>
      {currentImage ? <div className="admin-current-logo"><img src={currentImage} alt={currentMedia?.altTextRu || `Логотип ${teamName}, сезон ${season}`} /><div><strong>Текущий логотип</strong><span>Привязан только к сезону {season}</span>{currentMedia ? <a href={currentMedia.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a> : null}</div></div> : <p className="admin-field-note">Логотип для этого сезона пока не загружен</p>}
      <div className="admin-form-grid">
        <label className="is-wide admin-file-picker"><span>Файл логотипа</span><input name="car" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)} /><span className="admin-file-picker-control"><strong>{fileName ? 'Заменить' : 'Выбрать файл'}</strong><em>{fileName || 'Файл не выбран'}</em></span><small>Предпочтителен PNG или WebP с прозрачностью. Будут созданы квадратные WebP 512, 256 и 128 пикселей</small></label>
        {sourcePreview ? <div className="admin-photo-preview is-logo is-wide"><figure><figcaption>Исходник</figcaption><div className="admin-photo-crop-viewport"><img src={sourcePreview} alt="Исходный логотип" /></div></figure><figure><figcaption>Результат для сайта</figcaption>{processedPreview ? <div className="admin-photo-crop-viewport"><img src={processedPreview} alt="Обработанный логотип" /></div> : <div className="admin-photo-preview-placeholder">Создайте предпросмотр</div>}</figure></div> : null}
        {error ? <div className="admin-alert is-error is-wide" role="alert">{error}</div> : null}
        <div className="admin-preview-actions is-wide"><button type="button" onClick={createPreview} disabled={!sourcePreview || isPreviewing}>{isPreviewing ? 'Обработка…' : processedPreview ? 'Обновить предпросмотр' : 'Создать предпросмотр'}</button><span>Фон логотипа не удаляется автоматически</span></div>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" defaultValue={currentMedia?.altTextRu || `Логотип команды ${teamName} в сезоне ${season}`} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" defaultValue={currentMedia?.author || ''} required /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" defaultValue={currentMedia?.licence || ''} required /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="photoSourceUrl" type="url" defaultValue={currentMedia?.sourceUrl || ''} required placeholder="https://…" /></label>
        <label className="is-wide admin-rights-confirmation"><input name="rightsConfirmed" type="checkbox" value="yes" required /><span>Я проверил право использовать логотип и корректно указал источник</span></label>
      </div>
    </fieldset>
    <div className="admin-form-actions"><span>Исходник сохраняется без изменений</span><button type="submit" disabled={!previewToken || isPreviewing}>Сохранить логотип</button></div>
  </form>;
}
