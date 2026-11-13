# Instrucciones para agentes — Central RH

## Infraestructura vigente

- Este proyecto usa **Supabase en la nube exclusivamente**. La misma base aloja también los schemas de los dashboards de la sección Tools (Simi, Curvas de alcance, Flow); no los toques desde aquí. Para agregar un dashboard o herramienta sigue `docs/tools.md`. El proyecto de producción es `Central RH`, ref `ncgbvbpkinrvrzxyttfz`, URL `https://ncgbvbpkinrvrzxyttfz.supabase.co`.
- **No hay Docker ni una instancia local de Supabase** disponible. No intentes `supabase start`, `supabase status`, `supabase db reset`, ni pruebas que requieran contenedores locales.
- La app React/Vite puede ejecutarse en local con `npm run dev`, pero se conecta al Supabase alojado mediante las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del `.env` local. Trátala como una conexión a datos reales; no uses datos de prueba o escrituras de diagnóstico sin necesidad.
- El proyecto está vinculado con Supabase CLI. Para cambios de esquema, crea una migración SQL en `supabase/migrations/`, revisa el destino con `supabase projects list` y valida lo pendiente con `supabase db push --dry-run --linked`. Aplica migraciones aprobadas con `supabase db push --linked` y vuelve a comprobar con el dry run. El CLI puede intentar usar Docker después de aplicar una migración; en ese caso verifica el estado remoto antes de reintentar.
- **Si `db push` falla con `LegacyDbPushMissingLocalError`** es porque el historial remoto incluye migraciones de los repositorios de Tools (p. ej. `20261029215804` de `flow`, `20261111171101` de `alcance`). No son de este repo: **nunca** las marques como `reverted` con `migration repair` ni las copies a `supabase/migrations/`. Aplica la migración nueva en una sola transacción y registra sólo esa versión:
  ```sh
  { echo 'begin;'; cat supabase/migrations/<versión>_<nombre>.sql; echo 'commit;'; } > /tmp/apply.sql
  supabase db query --linked -f /tmp/apply.sql
  supabase migration repair --status applied <versión> --linked
  ```
  `supabase migration list --linked` puede mostrar las versiones de 12 dígitos en dos filas (sólo local / sólo remota); es un detalle del CLI, no una migración pendiente.
- Los reportes de error y las alertas automáticas (5xx de la API) se guardan en `public.error_reports` (sólo lectura para el super admin), además del correo de `send-bug-report`.
- Nunca pongas claves `service_role`, contraseñas ni tokens en el repositorio o en el frontend. La clave pública de Supabase sí es apta para `VITE_SUPABASE_ANON_KEY`.

## Desarrollo

- Frontend: React, TypeScript y Vite; código en `src/`.
- Backend y permisos: Supabase alojado; migraciones y políticas RLS en `supabase/migrations/`.
- Verificación mínima de cambios de frontend: `npm run build` y `git diff --check`.
- Estilos: sigue `docs/design-system.md`. Usa los tokens de `src/styles/tokens.css` (nada de colores, tamaños ni sombras a mano), el encabezado `.page-header` y el ancho único de `.content`. Cada módulo tiene su archivo en `src/styles/`.
- El `README.md` describe la configuración vigente. Los documentos de planes históricos pueden mencionar el antiguo entorno local; no son instrucciones operativas actuales.
