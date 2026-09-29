// One-time, repeatable import of the signed PDFs and original RH workbook.
// The workbook is uploaded as-is; account/password cells are never parsed or logged.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const exec = promisify(execFile);
const dryRun = process.argv.includes('--dry-run');
const downloads = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? join(process.env.HOME, 'Downloads'));
const names = [
  'Rebeca Domínguez García', 'Jesús Manuel Morán Arvizu', 'Jazmín Araceli Cruz Ocampo',
  'Agustín Santiago Valentinez', 'Irais De León Clorio', 'Arturo Pérez Gutiérrez',
  'Alejandro David Méndez López', 'Diego Armando Negrete González', 'Edmundo González Chávez',
  'Diana Ortiz Colín', 'Brenda Gabriela De Viana Cruz', 'Vania Marleth Galeana Ruiz',
  'Karla Daniela Padilla Silva', 'Patricia Ibarra Arenas', 'Martha Patricia Martínez Trujillo',
  'Ely Cristel Hernández Cagal', 'Félix David Rizo Serrano', 'Jorge Luis Rodríguez Mondragón',
  'Luz Fernanda Altamirano Reyes',
];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function cli(...args) {
  const { stdout } = await exec('supabase', args, { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 });
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`Unexpected Supabase response for ${args[0]}`);
  return JSON.parse(stdout.slice(start));
}

async function signatureFiles(folder, kind, expected) {
  const directory = join(downloads, folder);
  const files = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith('.pdf'));
  const indices = files.map((name) => Number(name.match(/^(\d{2})\./)?.[1]));
  if (files.length !== expected.length || indices.some((number) => !expected.includes(number)) || new Set(indices).size !== expected.length)
    throw new Error(`Unexpected PDF inventory in ${folder}`);
  return Promise.all(files.map(async (name) => {
    const source = join(directory, name);
    const hash = createHash('sha256').update(await readFile(source)).digest('hex');
    return { source, name, number: Number(name.slice(0, 2)), kind, hash, size: (await stat(source)).size };
  }));
}

const employeeResult = await cli('db', 'query', '--linked', '--output-format', 'json',
  'select id, full_name from public.employees');
const idByName = new Map(employeeResult.rows.map((person) => [person.full_name, person.id]));
if (names.some((name) => !idByName.has(name))) throw new Error('One or more roster names do not match remote employees');
const documents = [
  ...await signatureFiles('Firmas Arien', 'arien_letter', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]),
  ...await signatureFiles('Firmas CC', 'confidentiality_agreement', Array.from({ length: 19 }, (_, index) => index + 1)),
].map((file) => ({ ...file, employeeId: idByName.get(names[file.number - 1]) }));
for (const file of documents) file.path = `${file.employeeId}/${file.kind}/${file.hash}.pdf`;
const workbookDirectory = join(downloads, 'Firmas CC');
const workbooks = (await readdir(workbookDirectory)).filter((name) => name.toLowerCase().endsWith('.xlsx'));
if (workbooks.length !== 1) throw new Error('Expected exactly one source workbook');
const workbookSource = join(workbookDirectory, workbooks[0]);
const workbookHash = createHash('sha256').update(await readFile(workbookSource)).digest('hex');
const workbookPath = `signature-roster/${workbookHash}.xlsx`;
const workbookSize = (await stat(workbookSource)).size;
if (dryRun) {
  process.stdout.write(`Ready: ${documents.length} PDFs mapped to ${new Set(documents.map((file) => file.employeeId)).size} employees and 1 workbook.\n`);
  process.exit(0);
}

const existing = new Set((await cli('storage', 'ls', '--recursive', '--experimental', '--linked', 'ss:///employee-documents')).paths
  .map((path) => path.replace(/^\/employee-documents\//, '')));
const workbookExisting = new Set((await cli('storage', 'ls', '--recursive', '--experimental', '--linked', 'ss:///rh-private-files')).paths
  .map((path) => path.replace(/^\/rh-private-files\//, '')));
const pending = documents.filter((file) => !existing.has(file.path));
let uploaded = 0;
for (let index = 0; index < pending.length; index += 4) {
  await Promise.all(pending.slice(index, index + 4).map(async (file) => {
    await cli('storage', 'cp', '--experimental', '--linked', '--content-type', 'application/pdf',
      file.source, `ss:///employee-documents/${file.path}`);
    uploaded += 1;
  }));
  process.stdout.write(`Uploaded ${uploaded}/${pending.length} new PDFs.\n`);
}
if (!workbookExisting.has(workbookPath)) {
  await cli('storage', 'cp', '--experimental', '--linked', '--content-type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    workbookSource, `ss:///rh-private-files/${workbookPath}`);
  process.stdout.write('Uploaded original workbook.\n');
}
const documentValues = documents.map((file) => `(${quote(file.employeeId)},${quote(file.kind)},${quote(file.path)},${quote(basename(file.source))},'application/pdf',${file.size},${quote(file.hash)})`).join(',\n');
const sql = `begin;
insert into public.employee_documents (employee_id,kind,storage_path,original_name,mime_type,byte_size,sha256)
values ${documentValues} on conflict do nothing;
insert into public.rh_files (category,storage_path,original_name,mime_type,byte_size,sha256)
values ('signature_roster',${quote(workbookPath)},${quote(basename(workbookSource))},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',${workbookSize},${quote(workbookHash)})
on conflict do nothing;
commit;`;
await cli('db', 'query', '--linked', '--output-format', 'json', sql);
const verified = await cli('db', 'query', '--linked', '--output-format', 'json',
  'select (select count(*) from public.employee_documents) as documents, (select count(*) from public.rh_files) as workbooks');
const counts = verified.rows[0];
if (Number(counts.documents) !== 31 || Number(counts.workbooks) !== 1)
  throw new Error(`Import counts mismatch: ${counts.documents} PDFs, ${counts.workbooks} workbooks`);
process.stdout.write('Verified: 31 PDF metadata records and 1 private workbook record.\n');
