import { sb } from '../lib/supabase';
import type { DocumentKind, EmployeeDocument, EmployeeSummary, RhFile, SignatureRegistry, SignatureStatus } from './types';

const PDF_BUCKET = 'employee-documents';
const RH_BUCKET = 'rh-private-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadSignatureOverview() {
  const [registry, documents, files, employees] = await Promise.all([
    sb.from('employee_signature_registry').select('*').order('source_date', { ascending: false }),
    sb.from('employee_documents').select('id,employee_id,kind,storage_path,original_name,byte_size,created_at').order('created_at', { ascending: false }),
    sb.from('rh_files').select('id,category,storage_path,original_name,byte_size,created_at').order('created_at', { ascending: false }),
    sb.from('employees').select('id,full_name,status').order('full_name'),
  ]);
  for (const result of [registry, documents, files, employees]) if (result.error) throw result.error;
  return {
    registry: (registry.data ?? []) as SignatureRegistry[],
    documents: (documents.data ?? []) as EmployeeDocument[],
    files: (files.data ?? []) as RhFile[],
    employees: (employees.data ?? []) as EmployeeSummary[],
  };
}

export async function listEmployeeDocuments(employeeId: string) {
  const { data, error } = await sb.from('employee_documents')
    .select('id,employee_id,kind,storage_path,original_name,byte_size,created_at')
    .eq('employee_id', employeeId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeDocument[];
}

export async function updateSignatureStatus(employeeId: string, field: 'arien_status' | 'cc_status' | 'cc_fanny_status', status: SignatureStatus) {
  const { error } = await sb.from('employee_signature_registry')
    .update({ [field]: status, updated_at: new Date().toISOString() }).eq('employee_id', employeeId);
  if (error) throw error;
}

export async function signedFileUrl(bucket: 'employee-documents' | 'rh-private-files', path: string) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

async function currentUserId() {
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Tu sesión expiró.');
  return data.user.id;
}

export async function uploadEmployeeDocument(employeeId: string, kind: DocumentKind, file: File) {
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('El PDF debe pesar entre 1 byte y 10 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) throw new Error('Selecciona un archivo PDF.');
  const uploader = await currentUserId();
  const hash = await sha256(file);
  const path = `${employeeId}/${kind}/${hash}.pdf`;
  const { error: uploadError } = await sb.storage.from(PDF_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await sb.from('employee_documents').insert({
    employee_id: employeeId, kind, storage_path: path, original_name: file.name,
    mime_type: 'application/pdf', byte_size: file.size, sha256: hash, uploaded_by: uploader,
  });
  if (error) {
    await sb.storage.from(PDF_BUCKET).remove([path]);
    throw error;
  }
}

export async function uploadRhWorkbook(file: File) {
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('El Excel debe pesar entre 1 byte y 10 MB.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Selecciona un archivo .xlsx.');
  const uploader = await currentUserId();
  const hash = await sha256(file);
  const path = `signature-roster/${hash}.xlsx`;
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const { error: uploadError } = await sb.storage.from(RH_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await sb.from('rh_files').insert({
    category: 'signature_roster', storage_path: path, original_name: file.name,
    mime_type: mime, byte_size: file.size, sha256: hash, uploaded_by: uploader,
  });
  if (error) {
    await sb.storage.from(RH_BUCKET).remove([path]);
    throw error;
  }
}
