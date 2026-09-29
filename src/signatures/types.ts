export type SignatureStatus = 'signed' | 'pending' | 'not_applicable';
export type DocumentKind = 'arien_letter' | 'confidentiality_agreement';

export type SignatureRegistry = {
  employee_id: string;
  arien_status: SignatureStatus;
  cc_status: SignatureStatus;
  cc_fanny_status: SignatureStatus;
  note: string | null;
  source_date: string | null;
  updated_at: string;
};

export type EmployeeDocument = {
  id: string;
  employee_id: string;
  kind: DocumentKind;
  storage_path: string;
  original_name: string;
  byte_size: number;
  created_at: string;
};

export type RhFile = {
  id: string;
  category: 'signature_roster';
  storage_path: string;
  original_name: string;
  byte_size: number;
  created_at: string;
};

export type EmployeeSummary = { id: string; full_name: string; status: string };

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  arien_letter: 'Carta Arien',
  confidentiality_agreement: 'Convenio de confidencialidad',
};

export const STATUS_LABELS: Record<SignatureStatus, string> = {
  signed: 'Firmado',
  pending: 'Pendiente',
  not_applicable: 'No aplica',
};
