# Arquitectura del frontend

`src/App.tsx` inicia la sesión. `src/Workspace.tsx` carga el colaborador, su rol, sus permisos y los catálogos necesarios para la captura, y dibuja la barra lateral. `src/modules.tsx` es el registro de módulos: cada entrada define su ruta (`/evaluaciones`, `/tools/flow`…), su sección de la barra lateral, quién la ve y qué pantalla muestra. `src/lib/router.ts` sincroniza la ruta con el navegador, así que cada módulo tiene un enlace propio y los botones atrás/adelante funcionan. Una ruta desconocida o sin permiso lleva a `/timesheets`.

Para agregar un módulo: crea su carpeta y agrega una entrada en `MODULES`. Las subpantallas sin opción en el menú (como `/timesheets/reportes`) usan `parent` para marcar activa la opción correspondiente.

| Carpeta | Responsabilidad |
| --- | --- |
| `auth/` | Acceso, registro y recuperación de contraseña. |
| `timesheets/` | Captura diaria, calendario, importación con IA y estado de la hoja. |
| `timesheets/admin/` | Consultas, cálculos, detalles y exportación de reportes. |
| `evaluaciones/` | Tareas, formularios, ciclos y reportes de evaluación. |
| `profile/` | Perfil propio, directorio y edición de perfiles. |
| `recruitment/` | Vacantes y candidatos; `repository.ts` concentra el acceso a datos. |
| `signatures/` | Control de firmas, PDFs por colaborador y archivo Excel original de RH. |
| `bug-reporter/` | Envío de reportes de errores. |
| `tools/` | Sección Tools: catálogo de herramientas (`catalog.ts`) y su página. Sólo la ven usuarios con el permiso `toolmaster`. |
| `components/` | Componentes visuales compartidos sin reglas de negocio. |
| `lib/` | Cliente compartido de Supabase. |

Al ampliar un módulo, coloca sus componentes, tipos y funciones de datos en su carpeta. Mantén `App.tsx` y `Workspace.tsx` centrados en sesión y navegación. Las reglas de autorización y escritura siguen en Supabase (RLS y funciones); la separación del frontend no reemplaza esos controles.

## Propiedad de datos en Supabase

Las migraciones son cronológicas; cada módulo mantiene sus tablas y políticas RLS en el esquema `public`. No se crean tablas vacías para funciones que sólo envían mensajes.

| Módulo | Datos y archivos | Proceso de servidor |
| --- | --- | --- |
| Acceso y perfiles | `employees`, `user_roles`, bucket privado `profile-photos` | Triggers de vinculación de cuentas y funciones de permisos. |
| Hojas de tiempo | `clients`, `activities`, `timesheets`, `timesheet_entries`, `timesheet_history` | RPC de guardado, eliminación y lote; `/api/generate-timesheets`. |
| Evaluaciones | `evaluation_cycles`, `evaluation_questions`, `evaluation_assignments`, `evaluation_responses`, `evaluation_comments`, `evaluation_final_reports` | Edge Function `send-assignment-email`. |
| Reclutamiento | `recruitment_positions`, `recruitment_candidates`, `recruitment_matches`, bucket privado `recruitment-cvs` | `/api/recruitment-sync`; la integración con Outlook sigue sujeta a la configuración de TI. |
| Reporte de errores | Sin tabla de datos propia | Edge Function `send-bug-report`. |
| Permisos adicionales | `user_permissions` (hoy sólo `toolmaster`) | Función `is_toolmaster()`; se asignan por migración y se suman al rol de `user_roles`. |
| Firmas y convenios | `employee_signature_registry`, `employee_documents`, `rh_files`, buckets privados `employee-documents` y `rh-private-files` | Importador `scripts/import-signature-files.mjs`. |

## Firmas y documentos de RH

El módulo “Firmas y convenios” es exclusivo de usuarios con rol `admin`. Usa `public.employee_signature_registry` para los estados del listado, `public.employee_documents` para asociar PDFs a colaboradores y `public.rh_files` para las versiones originales del Excel. Los archivos viven en los buckets privados `employee-documents` y `rh-private-files`; las tablas y los objetos de Storage tienen políticas RLS de administrador.

El Excel original contiene credenciales en texto claro. Se conserva sin cambios sólo en Storage privado; no se incluye en el repositorio y sus columnas de contraseñas no se copian a las tablas ni se muestran en la vista web. El listado inicial importa únicamente nombre, estados y nota. Las futuras versiones del Excel pueden subirse desde el módulo, pero los estados se actualizan por separado en la tabla. Para repetir la carga inicial de los archivos locales, usa `node scripts/import-signature-files.mjs --dry-run` y luego el mismo comando sin `--dry-run`.
