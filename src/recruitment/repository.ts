import { sb } from "../lib/supabase";
import type { Candidate, Match, Position } from "./types";

export async function loadRecruitment(): Promise<{ positions: Position[]; candidates: Candidate[]; matches: Match[] }> {
  const [positionResult, candidateResult, matchResult] = await Promise.all([
    sb.from('recruitment_positions').select('*').order('created_at', { ascending: false }),
    sb.from('recruitment_candidates').select('*').order('received_at', { ascending: false }).limit(200),
    sb.from('recruitment_matches').select('*'),
  ]);
  for (const result of [positionResult, candidateResult, matchResult]) if (result.error) throw result.error;
  return {
    positions: positionResult.data || [],
    candidates: candidateResult.data || [],
    matches: matchResult.data || [],
  };
}

export async function createPositionRecord(form: Pick<Position, 'title' | 'description' | 'required_criteria' | 'preferred_criteria'>) {
  const { error } = await sb.from('recruitment_positions').insert(form);
  if (error) throw error;
}

export async function updatePositionStatus(id: string, status: string) {
  const { error } = await sb.from('recruitment_positions').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function updateCandidateRecord(id: string, patch: Partial<Candidate>) {
  const { error } = await sb.from('recruitment_candidates').update(patch).eq('id', id);
  if (error) throw error;
}

export async function getCvUrl(path: string) {
  const { data, error } = await sb.storage.from('recruitment-cvs').createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function syncRecruitment(): Promise<{ processed: number; review: number }> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw Error('Tu sesión expiró');
  const response = await fetch('/api/recruitment-sync', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'No se pudo revisar el buzón');
  return result;
}
