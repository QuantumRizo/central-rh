# Central RH

Plataforma interna de Recursos Humanos construida con React, TypeScript, Vite y Supabase.

## Entorno vigente

El backend es **Supabase en la nube** (`Central RH`, ref `ncgbvbpkinrvrzxyttfz`). No hay Docker ni Supabase local. La app puede correr en una computadora para desarrollo, pero se conecta a la base alojada.

```bash
npm install
npm run dev
npm run build
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en un archivo `.env` local. El `.env` no se sube a GitHub. Usa sólo la clave pública de Supabase en el frontend; nunca una clave `service_role`.

## Cambios de base de datos

Las migraciones están en `supabase/migrations/`. El proyecto está vinculado con Supabase CLI. Antes de aplicar cambios, comprueba el proyecto y las migraciones pendientes:

```bash
supabase projects list
supabase db push --dry-run --linked
```

Para aplicar una migración revisada: `supabase db push --linked`. Después, repite el dry run para confirmar que la base remota quedó al día. No uses `supabase start`, `supabase status` ni `supabase db reset`: esos comandos corresponden al antiguo entorno local que ya no existe.

Las reglas de seguridad y acceso a datos se mantienen en las políticas RLS de Supabase. Consulta [AGENTS.md](AGENTS.md) para las instrucciones operativas de agentes.

## Importación de horas

La experiencia principal es el modal **Subir horas con IA**. El colaborador captura periodo, jornada, modalidad, vacaciones, incapacidades o permisos, festivos trabajados, fines de semana trabajados y una descripción compacta de su distribución mensual. Gemini convierte únicamente la distribución en un plan estructurado; `api/generate-timesheets.ts` calcula los días y porcentajes, valida catálogos y muestra una vista previa. La confirmación reutiliza ese plan, sin una segunda llamada a Gemini, y escribe directamente mediante la función batch protegida por RLS.

La generación automática está limitada al 31 de agosto de 2026. Septiembre se captura manualmente para mantener completo el periodo reciente.

## Reclutamiento desde Outlook

El módulo **Reclutamiento** está en desarrollo y todavía no está activo en producción. El prototipo local es exclusivo de administradores y contempla vacantes, lectura de CV adjuntos en PDF o DOCX desde `rh@centrales.com.mx`, resúmenes y comparaciones orientativas. Antes de aplicar su migración se revisará el modelo de perfiles, plazas y requisiciones descrito en [el alcance de reclutamiento](docs/reclutamiento-alcance.md). Las puntuaciones deberán revisarse con el CV original.

El servidor consulta Microsoft Graph con permiso de sólo lectura. TI debe registrar una aplicación en Microsoft Entra y limitar su acceso al buzón `rh@centrales.com.mx` mediante Exchange Online Application RBAC. No se necesitan ni deben compartirse la contraseña del correo ni credenciales en este repositorio. Configurar en Vercel como secretos de servidor:

- `MS_TENANT_ID`: identificador del tenant de Microsoft 365.
- `MS_CLIENT_ID`: identificador de la aplicación registrada.
- `MS_CLIENT_SECRET`: secreto de la aplicación. TI debe entregarlo por un canal seguro y definir su rotación.
- `MS_RECRUITMENT_MAILBOX=rh@centrales.com.mx`.
- `SUPABASE_SERVICE_ROLE_KEY`: clave de servidor del proyecto Central RH, sólo en Vercel.
- `CRON_SECRET`: secreto aleatorio para proteger la sincronización programada.
- `GEMINI_API_KEY`: puede ser la misma clave usada por lead bot, configurada como secreto de Vercel. Nunca usar el prefijo `VITE_`.

La sincronización automática está programada diariamente a las 14:00 UTC. Un admin puede pulsar **Revisar buzón** para adelantarla. El correo permanece sin cambios y los mensajes ya importados se omiten por `Message-ID`. Los CV se guardan en un bucket privado de Supabase. Los nuevos perfiles de puesto se comparan con candidatos existentes de forma gradual al sincronizar.

Antes de activar la integración, aplicar `202609220002_recruitment.sql` con el flujo de migraciones descrito arriba y desplegar la app con las variables configuradas. Sin los permisos de TI, la interfaz puede administrar vacantes pero no leer el buzón.

En Vercel deben existir `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `GEMINI_API_KEY`. La clave de Gemini es exclusivamente server-side y nunca debe usar el prefijo `VITE_`. `GEMINI_MODEL` es opcional; el servidor usa modelos Flash-Lite estables y cambia automáticamente a otro modelo compatible si existe saturación temporal.
