import { useEffect, useMemo, useState } from 'react';
import { FileSignature, FileSpreadsheet, Upload } from 'lucide-react';
import { loadSignatureOverview, signedFileUrl, updateSignatureStatus, uploadRhWorkbook } from './repository';
import { DOCUMENT_LABELS, STATUS_LABELS, type EmployeeDocument, type EmployeeSummary, type RhFile, type SignatureRegistry, type SignatureStatus } from './types';

type StatusField = 'arien_status' | 'cc_status' | 'cc_fanny_status';
const fields: { key: StatusField; label: string }[] = [
  { key: 'arien_status', label: 'Carta Arien' },
  { key: 'cc_status', label: 'Convenio CC' },
  { key: 'cc_fanny_status', label: 'Firma CC-Fanny' },
];

export function SignaturesModule() {
  const [registry, setRegistry] = useState<SignatureRegistry[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [files, setFiles] = useState<RhFile[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const load = async () => {
    const result = await loadSignatureOverview();
    setRegistry(result.registry); setDocuments(result.documents);
    setFiles(result.files); setEmployees(result.employees);
  };
  useEffect(() => {
    let live = true;
    loadSignatureOverview().then((result) => {
      if (!live) return;
      setRegistry(result.registry); setDocuments(result.documents);
      setFiles(result.files); setEmployees(result.employees);
    }).catch((cause) => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);
  const employeeById = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);
  const visible = registry.filter((row) => employeeById.get(row.employee_id)?.full_name.toLocaleLowerCase('es-MX').includes(query.toLocaleLowerCase('es-MX')))
    .sort((a, b) => (employeeById.get(a.employee_id)?.full_name ?? '').localeCompare(employeeById.get(b.employee_id)?.full_name ?? '', 'es-MX'));
  const changeStatus = async (row: SignatureRegistry, field: StatusField, value: SignatureStatus) => {
    setSaving(`${row.employee_id}:${field}`); setError('');
    try {
      await updateSignatureStatus(row.employee_id, field, value);
      setRegistry((current) => current.map((item) => item.employee_id === row.employee_id ? { ...item, [field]: value } : item));
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  };
  const open = async (bucket: 'employee-documents' | 'rh-private-files', path: string) => {
    setError('');
    try {
      const url = await signedFileUrl(bucket, path);
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
    } catch (cause) { setError((cause as Error).message); }
  };
  const uploadWorkbook = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError(''); setMessage('');
    try {
      await uploadRhWorkbook(file);
      await load();
      setMessage('Excel original guardado en el archivo privado de RH.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setUploading(false); }
  };
  return <div className="signatures-module">
    <div className="page-header"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Firmas y convenios</h1><p>Consulta el listado de RH y los documentos firmados de cada colaborador.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    <section className="admin-card"><div className="card-heading"><div><h2><FileSpreadsheet size={19} /> Listado original de Arien</h2><p>El archivo original incluye credenciales. Descárgalo sólo cuando sea necesario. Subir una nueva versión no cambia los estados de la tabla.</p></div></div>
      {files.length ? <ul className="signature-file-list">{files.map((file) => <li key={file.id}><span>{file.original_name}</span><button className="secondary" type="button" onClick={() => void open('rh-private-files', file.storage_path)}>Descargar original</button></li>)}</ul> : <p>Sin archivo Excel cargado.</p>}
      <label className="secondary signature-upload-button"><Upload size={16} /> {uploading ? 'Subiendo…' : 'Agregar versión .xlsx'}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={uploading} onChange={(event) => { void uploadWorkbook(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </section>
    <section className="admin-card"><div className="card-heading"><div><h2><FileSignature size={19} /> Control de firmas</h2><p>{registry.length} colaboradores del listado del 28 de septiembre de 2026.</p></div></div>
      <label className="signature-search">Buscar colaborador<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre" /></label>
      {busy ? <p>Cargando firmas…</p> : <div className="signature-table-wrap"><table className="signature-table"><thead><tr><th>Colaborador</th>{fields.map((field) => <th key={field.key}>{field.label}</th>)}<th>Documentos</th><th>Nota</th></tr></thead><tbody>{visible.map((row) => {
        const own = documents.filter((item) => item.employee_id === row.employee_id);
        return <tr key={row.employee_id}><td><strong>{employeeById.get(row.employee_id)?.full_name ?? 'Colaborador'}</strong></td>{fields.map((field) => <td key={field.key}><select aria-label={`${field.label} de ${employeeById.get(row.employee_id)?.full_name ?? 'colaborador'}`} className={`signature-status ${row[field.key]}`} value={row[field.key]} disabled={saving === `${row.employee_id}:${field.key}`} onChange={(event) => void changeStatus(row, field.key, event.target.value as SignatureStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>)}<td><div className="signature-document-links">{own.map((item) => <button key={item.id} type="button" className="secondary" onClick={() => void open('employee-documents', item.storage_path)} title={item.original_name}>{DOCUMENT_LABELS[item.kind]}</button>)}</div></td><td>{row.note || '—'}</td></tr>;
      })}</tbody></table>{!visible.length && <p>Sin colaboradores para mostrar.</p>}</div>}
    </section>
  </div>;
}
