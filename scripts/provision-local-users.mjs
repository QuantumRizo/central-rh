const base = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Define SUPABASE_SERVICE_ROLE_KEY desde supabase status antes de ejecutar');
const users = [
  { email: 'felix@centraldenegociosmx.com', password: '123456', full_name: 'Rizo Serrano Félix David', role: 'admin' },
  { email: 'carolina@centraldenegociosmx.com', password: '123456', full_name: 'Anaya García Carolina Sofía', role: 'collaborator' },
  { email: 'maricela@centraldenegociosmx.com', password: '123456', full_name: 'García Herrera Maricela', role: 'collaborator' },
  { email: 'fanny@centraldenegociosmx.com', password: '123456', full_name: 'García Domínguez Fanny', role: 'admin' },
  { email: 'patricia@centraldenegociosmx.com', password: '123456', full_name: 'Martínez Trujillo Martha Patricia', role: 'admin' },
  { email: 'rh@centrales.com.mx', password: '123456', full_name: 'Troncoso Fuentes Jessica Alejandra', role: 'collaborator' },
  { email: 'alberto@centraldenegociosmx.com', password: '123456', full_name: 'Hernández García Alberto Emmanuel', role: 'collaborator' },
  { email: 'juan@centraldenegociosmx.com', password: '123456', full_name: 'Millán Latapí Juan Pablo', role: 'collaborator' },
  { email: 'agustin@centraldenegociosmx.com', password: '123456', full_name: 'Santiago Valentinez Agustín', role: 'collaborator' },
  { email: 'arturop@centraldenegociosmx.com', password: '123456', full_name: 'Pérez Gutiérrez Arturo', role: 'collaborator' },
  { email: 'manuel@centraldenegociosmx.com', password: '123456', full_name: 'Morán Arvizu Jesús Manuel', role: 'collaborator' },
  { email: 'martha@centraldenegociosmx.com', password: '123456', full_name: 'Velasco Magaña Martha Graciela', role: 'collaborator' },
  { email: 'jorge@centraldenegociosmx.com', password: '123456', full_name: 'Rodríguez Mondragón Jorge Luis', role: 'collaborator' },
  { email: 'jazmin@centraldenegociosmx.com', password: '123456', full_name: 'Cruz Ocampo Jazmín Araceli', role: 'collaborator' },
  { email: 'ipatricia@centraldenegociosmx.com', password: '123456', full_name: 'Ibarra Arenas Patricia', role: 'collaborator' },
  { email: 'diana@centraldenegociosmx.com', password: '123456', full_name: 'Ortiz Colín Diana', role: 'collaborator' },
  { email: 'karla@centraldenegociosmx.com', password: '123456', full_name: 'Padilla Silva Karla Daniela', role: 'collaborator' },
  { email: 'irais@centraldenegociosmx.com', password: '123456', full_name: 'De León Clorio Irais', role: 'collaborator' },
  { email: 'rebeca@centraldenegociosmx.com', password: '123456', full_name: 'Domínguez García Rebeca', role: 'collaborator' },
  { email: 'vania@centraldenegociosmx.com', password: '123456', full_name: 'Galeana Ruiz Vania Marleth', role: 'collaborator' },
  { email: 'alejandro@centraldenegociosmx.com', password: '123456', full_name: 'Méndez López Alejandro David', role: 'collaborator' },
  { email: 'becariomedios@centraldenegociosmx.com', password: '123456', full_name: 'Altamirano Reyes Luz Fernanda', role: 'collaborator' },
  { email: 'becariomarcas@centraldenegociosmx.com', password: '123456', full_name: 'Hernández Cagal Ely Cristel', role: 'collaborator' },
  { email: 'diego@centraldenegociosmx.com', password: '123456', full_name: 'Negrete González Diego Armando', role: 'collaborator' },
  { email: 'edmundo@centraldenegociosmx.com', password: '123456', full_name: 'González Chávez Edmundo', role: 'collaborator' },
  { email: 'brenda@centraldenegociosmx.com', password: '123456', full_name: 'De Viana Cruz Brenda Gabriela', role: 'collaborator' },
  { email: 'jose@centrales.com.mx', password: '123456', full_name: 'González Guarneros José Antonio', role: 'collaborator' },
  { email: 'sofy@centrales.com.mx', password: '123456', full_name: 'Guerrero Portillo Dana Sofía', role: 'collaborator' },
];
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
for (const input of users) {
  const listed = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!listed.ok) throw new Error(`No se pudieron listar usuarios (${listed.status})`);
  const existing = (await listed.json()).users?.find((u) => u.email?.toLowerCase() === input.email);
  let user = existing;
  if (!user) {
    const created = await fetch(`${base}/auth/v1/admin/users`, { method: 'POST', headers, body: JSON.stringify({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name } }) });
    if (!created.ok) throw new Error(`No se pudo crear ${input.email}: ${await created.text()}`);
    user = await created.json();
  }
  const employee = await fetch(`${base}/rest/v1/employees?select=id&full_name=eq.${encodeURIComponent(input.full_name)}`, { headers });
  const matches = await employee.json();
  if (!matches[0]) throw new Error(`No existe empleado para ${input.email}`);
  const update = await fetch(`${base}/rest/v1/employees?id=eq.${matches[0].id}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ auth_user_id: user.id }) });
  if (!update.ok) throw new Error(`No se pudo vincular ${input.email}: ${await update.text()}`);
  const role = await fetch(`${base}/rest/v1/user_roles`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: user.id, role: input.role }) });
  if (!role.ok) throw new Error(`No se pudo asignar rol a ${input.email}: ${await role.text()}`);
  console.log(`OK ${input.email} (${input.role})`);
}
