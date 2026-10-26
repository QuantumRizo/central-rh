# Tools: cómo agregar un dashboard o herramienta

La plataforma RH es la entrada única de Central MX. La barra lateral tiene **RH** (los módulos de Recursos Humanos), **Herramientas** y **Configuración**. Herramientas tiene dos entradas, **Herramientas CN** (Central de Negocios) y **Herramientas Clientes** (dashboards organizados por cliente, como Sika y Farmacias Similares); cada una abre una página con tarjetas de sus herramientas (`src/tools/ToolsHub.tsx`). Cada persona ve sólo las herramientas que tiene en `public.tool_access`; el super admin (permiso `superadmin`, hoy Félix) las ve todas y asigna los accesos en **Configuración → Accesos** (`/configuracion/accesos`). Una herramienta nueva aparece ahí sola en cuanto se agrega al catálogo.

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

- **Quién abre qué:** `public.tool_access (user_id, tool_id, level)`, con el mismo `id` que el catálogo y nivel `ver` o `cargar` (sólo dashboards de Simi: subir su Excel en el `/admin`; `public.user_can_load`). Los servidores de cada herramienta lo comprueban con `public.user_has_tool(user_id, tool_id)` (el super admin pasa siempre). El navegador usa `my_tools()`; la pantalla de Accesos, `tool_access_matrix()` y `set_tool_access()`, que exigen super admin.
- El permiso `toolmaster` ya no existe; lo reemplazó el nivel `cargar`.
- **Módulos de RH:** `public.module_access (user_id, module_id, level)` — timesheets (reportes/admin), evaluaciones (admin), perfiles (ver/admin), reclutamiento (admin), firmas (admin). Las políticas usan `public.has_module(módulo, nivel)` y los servidores `public.user_has_module(usuario, módulo, nivel)`. `user_roles` ya no da permisos (se conserva como antecedente) e `is_admin()` sólo responde por el super admin. El super admin los asigna en Accesos, con plantillas para llenar una fila. Cada cambio de rol o de nivel queda en `public.access_log` y se ve en el historial de la misma pantalla; el perfil de cada persona muestra su tarjeta "Accesos" (`employee_access`).

- Los dashboards de Tools **no piden login**, por decisión de Félix (oct 2026): se abren en otra pestaña con un link público. La sección Tools oculta los links, no protege los datos. No agregues login a un dashboard si no te lo piden.
- Lo que sí escribe datos (cargas de Excel, administración) exige el permiso `toolmaster`, comprobado en el servidor: `select exists (select 1 from public.user_permissions where user_id = $1 and permission = 'toolmaster')` con el usuario de la sesión de Supabase Auth (ver `src/lib/admin.ts` de street-planner-simi). En Storage, las políticas usan `public.is_toolmaster()`.
- Las cuentas son las de RH. Un permiso nuevo (por ejemplo para un dashboard concreto) se agrega con una migración: amplía el `check` de `public.user_permissions.permission` y crea su función `is_<permiso>()` como `is_toolmaster()`.

## Inicio de sesión único

Las herramientas no tienen login propio: la Plataforma es la única entrada.

1. La barra lateral abre la herramienta directo en otra pestaña (`href` en `src/modules.tsx`).
2. Si la herramienta no tiene sesión, manda a `<Plataforma>/sso?to=<su URL>`.
3. La Plataforma (`src/sso.ts`, `App.tsx`) pide login si hace falta y regresa a esa URL con el access token en el fragmento `#sso=` (no viaja al servidor). Sólo lo entrega a los orígenes de `TOOL_ORIGINS` (`src/tools/catalog.ts`, los sitios de `SITES`) y por https.
4. Las herramientas guardan sólo ese token (~1 h) y, al vencer, repiten el paso 2 sin que la persona escriba nada. No guardan refresh tokens, así que nunca rotan la sesión de la Plataforma.

Un sitio nuevo de herramientas debe agregarse a `SITES` para recibir el pase, y usar la franja "← Plataforma Central" (ver `platform-bar` en cn-tools y en los dashboards de Simi).

## Agregar un dashboard

**¿Es de Farmacias Similares?** Va en street-planner-simi como un dashboard más: su README explica la estructura por `slug` (página, API, schema, importador). Luego agrega su enlace aquí.

**¿Es otra herramienta?** Puede ir en `cn-tools` (alcance-app) o en un proyecto nuevo de Vercel. En cualquier caso usa el Supabase de Central RH con su propio schema.

**Para que aparezca como tarjeta:** agrega una entrada en `TOOLS` de `src/tools/catalog.ts` (id, nombre, sección `Simi`, `Clientes` o `CN Tools`, grupo con el nombre del cliente, descripción, ícono de `lucide-react` y URL). Simi y Clientes se presentan agrupados por cliente en **Herramientas Clientes**; CN Tools tiene su propia página. Una sección nueva necesita su página (`ToolsHub`) y su entrada en `MODULES` de `src/modules.tsx`. La URL se arma con la base de su sitio (`SITES`); si es un sitio nuevo, agrega su variable `VITE_…_URL` con valor por defecto y documéntala en el README. Con eso aparece en la página de su sección, con su ruta `/tools/<id>` y el botón que lo abre en otra pestaña.

## Agregar un módulo de RH (no un tool)

Ver `docs/architecture.md`: carpeta propia en `src/`, una entrada en `MODULES` de `src/modules.tsx` (ruta, sección, quién lo ve, pantalla) y su archivo de estilos en `src/styles/`.
