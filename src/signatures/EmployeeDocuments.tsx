import { useEffect, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { listEmployeeDocuments, signedFileUrl, uploadEmployeeDocument } from './repository';
import { DOCUMENT_LABELS, type DocumentKind, type EmployeeDocument } from './types';

export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [kind, setKind] = useState<DocumentKind>('confidentiality_agreement');
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setBusy(true);
    listEmployeeDocuments(employeeId)
      .then((rows) => { if (live) setDocuments(rows); })
      .catch((cause) => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [employeeId]);
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      await uploadEmployeeDocument(employeeId, kind, file);
      setDocuments(await listEmployeeDocuments(employeeId));
    } catch (cause) { setError((cause as Error).message); }
    finally { setUploading(false); }
  };
  const open = async (item: EmployeeDocument) => {
    setError('');
    try {
      const url = await signedFileUrl('employee-documents', item.storage_path);
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
    } catch (cause) { setError((cause as Error).message); }
  };
  return <section className="profile-card employee-documents">
    <div className="profile-card-title"><FileText size={19} /><h2>Documentos firmados</h2></div>
    <p>Archivos privados para administración de RH.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {busy ? <p>Cargando documentos…</p> : documents.length ? <ul className="signature-document-list">{documents.map((item) =>
      <li key={item.id}><div><strong>{DOCUMENT_LABELS[item.kind]}</strong><span>{item.original_name}</span></div><button className="secondary" type="button" onClick={() => void open(item)}>Abrir PDF</button></li>
    )}</ul> : <p className="profile-empty">Sin documentos cargados.</p>}
    <div className="signature-upload-row"><label>Tipo de documento<select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}><option value="confidentiality_agreement">Convenio de confidencialidad</option><option value="arien_letter">Carta Arien</option></select></label><label className="secondary signature-upload-button"><Upload size={16} /> {uploading ? 'Subiendo…' : 'Subir PDF'}<input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
  </section>;
}
