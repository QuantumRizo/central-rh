# Tools: cómo agregar un dashboard o herramienta

La plataforma RH es la entrada única de Central MX. La barra lateral tiene tres secciones: **RH** (los módulos de Recursos Humanos), **Simi** (dashboards de Farmacias Similares) y **CN Tools** (herramientas de Central de Negocios). Simi y CN Tools sólo las ven las cuentas con el permiso `toolmaster` (hoy, Félix).

## Base de datos compartida

Todo vive en un solo proyecto de Supabase: **Central RH** (ref `ncgbvbpkinrvrzxyttfz`, región `us-west-2`, plan Pro, compute Micro). Ya no se crean proyectos de Supabase nuevos por herramienta.

| Schema | Dueño (repositorio) | Contenido |
| --- | --- | --- |
| `public` | Central RH | Colaboradores, roles, permisos y módulos de RH. Ninguna herramienta escribe aquí. |
| `street_planner`, `inversion`, `competencia`, `simi_admin` | `~/Projects/street-planner-simi` (Vercel `dashboards-farmacias`) | Dashboards de Farmacias Similares. |
| `planeador_radio` | `~/Projects/street-planner-simi` | Planeador de radio (herramienta de CN que vive en el sitio de Simi; paleta azul del Flow). |
| `alcance`, `flow` | `~/Projects/alcance-app` (Vercel `cn-tools`) | Curvas de alcance y Flow comercial. |

Reglas:

1. **Un schema propio por herramienta**, con nombre de la herramienta. Nada nuevo en `public`.
2. Las tablas de una herramienta **no se exponen** por la API REST de Supabase: se leen desde su servidor (conexión a Postgres) o desde una Edge Function. Si la función toca la base, usa un rol propio que sólo ve su schema (ver `alcance_app` y `flow_app` en alcance-app).
3. La definición del schema vive en el repositorio de la herramienta (`sql/<slug>.sql` o `db/*.sql`). Las migraciones de este repositorio sólo cubren `public` y lo que comparte la plataforma (buckets, permisos).
4. Los buckets de Storage llevan el prefijo de la herramienta (`simi-imports`, `alcance-excel`).
5. Para regiones: las funciones de Vercel que consultan la base van en `pdx1` (Portland), junto a Supabase.
6. Es la base de producción, con datos de RH en uso diario (evaluaciones, timesheets). Nunca `supabase db reset`, ni cambios a `public` fuera del flujo de migraciones del `AGENTS.md`.

## Acceso

- Los dashboards de Tools **no piden login**, por decisión de Félix (oct 2026): se abren en otra pestaña con un link público. La sección Tools oculta los links, no protege los datos. No agregues login a un dashboard si no te lo piden.
- Lo que sí escribe datos (cargas de Excel, administración) exige el permiso `toolmaster`, comprobado en el servidor: `select exists (select 1 from public.user_permissions where user_id = $1 and permission = 'toolmaster')` con el usuario de la sesión de Supabase Auth (ver `src/lib/admin.ts` de street-planner-simi). En Storage, las políticas usan `public.is_toolmaster()`.
- Las cuentas son las de RH. Un permiso nuevo (por ejemplo para un dashboard concreto) se agrega con una migración: amplía el `check` de `public.user_permissions.permission` y crea su función `is_<permiso>()` como `is_toolmaster()`.

## Agregar un dashboard

**¿Es de Farmacias Similares?** Va en street-planner-simi como un dashboard más: su README explica la estructura por `slug` (página, API, schema, importador). Luego agrega su enlace aquí.

**¿Es otra herramienta?** Puede ir en `cn-tools` (alcance-app) o en un proyecto nuevo de Vercel. En cualquier caso usa el Supabase de Central RH con su propio schema.

**Para que aparezca en la barra lateral:** agrega una entrada en `TOOLS` de `src/tools/catalog.ts` (id, nombre, sección `Simi` o `CN Tools`, grupo, descripción, ícono de `lucide-react` y URL). Una sección nueva se agrega en `SECTIONS` de `src/modules.tsx`. La URL se arma con la base de su sitio (`SITES`); si es un sitio nuevo, agrega su variable `VITE_…_URL` con valor por defecto y documéntala en el README. Con eso aparece en Tools, con su ruta `/tools/<id>` y el botón que lo abre en otra pestaña.

## Agregar un módulo de RH (no un tool)

Ver `docs/architecture.md`: carpeta propia en `src/`, una entrada en `MODULES` de `src/modules.tsx` (ruta, sección, quién lo ve, pantalla) y su archivo de estilos en `src/styles/`.
