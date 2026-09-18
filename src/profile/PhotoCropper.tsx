import { useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { LoaderCircle, X } from 'lucide-react';

export async function cropProfilePhoto(sourceUrl: string, area: Area): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('No se pudo abrir la imagen seleccionada.'));
    image.src = sourceUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no pudo procesar la imagen.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 512, 512);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo comprimir la foto.')), 'image/jpeg', 0.82);
  });
  if (blob.size > 2 * 1024 * 1024) throw new Error('La foto procesada excede el límite de 2 MB.');
  return blob;
}

export function PhotoCropper({ imageUrl, busy, error, onCancel, onSave }: {
  imageUrl: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (area: Area) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return <div className="photo-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div ref={dialogRef} className="photo-editor" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title" tabIndex={-1}>
      <div className="photo-editor-header"><div><h2 id="photo-editor-title">Ajustar foto de perfil</h2><p>Arrastra la foto para centrarla. Usa el control para acercar.</p></div><button type="button" className="icon" aria-label="Cerrar editor" disabled={busy} onClick={onCancel}><X size={20} /></button></div>
      <div className="photo-editor-canvas"><Cropper image={imageUrl} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropAreaChange={(_, pixels) => setArea(pixels)} /></div>
      <label className="photo-editor-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={busy} aria-label="Zoom de la foto" /></label>
      <p className="photo-editor-hint">Se guardará una imagen cuadrada de 512 × 512 píxeles.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="photo-editor-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" disabled={busy || !area} onClick={() => { if (area) onSave(area); }}>{busy ? <><LoaderCircle className="spin" size={17} /> Guardando…</> : 'Guardar foto'}</button></div>
    </div>
  </div>;
}
