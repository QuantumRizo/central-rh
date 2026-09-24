import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChevronRight, Search, Users } from 'lucide-react';
import { sb } from './lib/supabase';
import { Profile } from './Profile';

type Person = {
  id: string;
  full_name: string;
  position: string;
  department: string | null;
  status: string;
  avatar_path: string | null;
};
type Order = 'surname' | 'position' | 'name';

const avatarUrlCache = new Map<string, { url: string; expiresAt: number }>();
const avatarUrlLifetime = 55 * 60 * 1000;

const compare = (a: string, b: string) => a.localeCompare(b, 'es-MX', { sensitivity: 'base' });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
// Los nombres se guardan como "Nombre(s) Primer apellido Segundo apellido".
// Conservamos una excepción para apellidos compuestos frecuentes.
const firstSurname = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return parts.at(-1) || name;
  const surname = parts.at(-2) || parts.at(-1) || name;
  const prefix = parts.at(-3)?.toLocaleLowerCase('es-MX');
  return prefix === 'de' || prefix === 'del' ? `${parts.at(-3)} ${surname}` : surname;
};
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export function ProfilesDirectory({ session, viewerEmployeeId, isAdmin, onEvaluations, onChangePassword }: {
  session: Session;
  viewerEmployeeId: string;
  isAdmin: boolean;
  onEvaluations: () => void;
  onChangePassword: () => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState<Order>('surname');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: loadError } = await sb.from('employees').select('id,full_name,position,department,status,avatar_path').order('full_name');
      if (!live) return;
      if (loadError) { setError(loadError.message); setBusy(false); return; }
      const loadedPeople = (data ?? []) as Person[];
      setPeople(loadedPeople);
      setBusy(false);
      const paths = [...new Set(loadedPeople.map((person) => person.avatar_path).filter((path): path is string => Boolean(path)))];
      const now = Date.now();
      const urls: Record<string, string> = {};
      const missingPaths = paths.filter((path) => {
        const cached = avatarUrlCache.get(path);
        if (cached && cached.expiresAt > now) { urls[path] = cached.url; return false; }
        return true;
      });
      if (missingPaths.length) {
        const { data: signedUrls, error: signingError } = await sb.storage.from('profile-photos').createSignedUrls(missingPaths, 60 * 60);
        if (!live) return;
        if (!signingError) for (const signed of signedUrls ?? []) {
          if (signed.path && signed.signedUrl) {
            urls[signed.path] = signed.signedUrl;
            avatarUrlCache.set(signed.path, { url: signed.signedUrl, expiresAt: now + avatarUrlLifetime });
          }
        }
      }
      if (live) setAvatarUrls(urls);
    })();
    return () => { live = false; };
  }, []);

  const positions = useMemo(() => [...new Set(people.map((person) => person.position || 'Por asignar'))].sort(compare), [people]);
  const departments = useMemo(() => [...new Set(people.map((person) => person.department || 'Sin área'))].sort(compare), [people]);

  const groups = useMemo(() => {
    const text = normalize(query.trim());
    const filtered = people.filter((person) =>
      (!text || normalize(`${person.full_name} ${person.position} ${person.department || ''}`).includes(text)) &&
      (!position || (person.position || 'Por asignar') === position) &&
      (!department || (person.department || 'Sin área') === department) &&
      (!status || person.status === status),
    );
    filtered.sort((a, b) => {
      const primary = order === 'surname' ? compare(firstSurname(a.full_name), firstSurname(b.full_name)) : order === 'position' ? compare(a.position, b.position) : compare(a.full_name, b.full_name);
      return primary || compare(a.full_name, b.full_name);
    });
    const grouped = new Map<string, Person[]>();
    for (const person of filtered) {
      const heading = order === 'position' ? person.position || 'Por asignar' : (order === 'surname' ? firstSurname(person.full_name) : person.full_name).charAt(0).toLocaleUpperCase('es-MX') || '#';
      grouped.set(heading, [...(grouped.get(heading) || []), person]);
    }
    return { count: filtered.length, sections: [...grouped.entries()] };
  }, [people, query, position, department, status, order]);

  if (selectedId) return <Profile key={selectedId} session={session} employeeId={selectedId} viewerEmployeeId={viewerEmployeeId} isAdmin={isAdmin} onBack={() => setSelectedId(null)} onEvaluations={onEvaluations} onChangePassword={onChangePassword} />;

  return <div className="profiles-directory">
    <div className="page-header"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Perfiles</h1><p>Consulta la información de los colaboradores y abre su perfil.</p></div><span className="profiles-total"><Users size={18} /> {people.length} colaboradores</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="profiles-filters" aria-label="Buscar y ordenar perfiles">
      <label className="profiles-search"><span>Buscar</span><span><Search size={17} /><input type="search" placeholder="Nombre, puesto o área" value={query} onChange={(event) => setQuery(event.target.value)} /></span></label>
      <label>Ordenar por<select value={order} onChange={(event) => setOrder(event.target.value as Order)}><option value="surname">Primer apellido</option><option value="position">Puesto</option><option value="name">Nombre</option></select></label>
      <label>Puesto<select value={position} onChange={(event) => setPosition(event.target.value)}><option value="">Todos los puestos</option>{positions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Área<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Todas las áreas</option>{departments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="Activo">Activo</option><option value="Baja">Baja</option></select></label>
    </section>
    <div className="profiles-results"><p>{busy ? 'Cargando perfiles…' : `${groups.count} ${groups.count === 1 ? 'perfil' : 'perfiles'} ${query || position || department || status ? 'encontrados' : 'disponibles'}`}</p>{(query || position || department || status) && <button type="button" className="profiles-clear" onClick={() => { setQuery(''); setPosition(''); setDepartment(''); setStatus(''); }}>Limpiar filtros</button>}</div>
    {!busy && !error && !groups.count && <div className="profiles-empty">No hay perfiles que coincidan con los filtros.</div>}
    {groups.sections.map(([heading, members]) => <section className="profiles-group" key={heading}><h2>{heading} <span>{members.length}</span></h2><div className="profiles-grid">{members.map((person) => { const avatarUrl = person.avatar_path ? avatarUrls[person.avatar_path] : null; const showPhoto = Boolean(avatarUrl && person.avatar_path && !failedAvatars.has(person.avatar_path)); return <button key={person.id} type="button" className="profiles-person" onClick={() => setSelectedId(person.id)}><span className="profiles-avatar">{showPhoto ? <img src={avatarUrl || ''} alt="" loading="lazy" decoding="async" onError={() => { if (person.avatar_path) setFailedAvatars((current) => new Set(current).add(person.avatar_path!)); }} /> : initials(person.full_name)}</span><span className="profiles-person-copy"><strong>{person.full_name}</strong><small>{person.position || 'Por asignar'}</small><small>{person.department || 'Sin área'}</small></span><span className={`profiles-status ${person.status === 'Activo' ? 'active' : ''}`}>{person.status}</span><ChevronRight size={18} className="profiles-arrow" /></button>; })}</div></section>)}
  </div>;
}
