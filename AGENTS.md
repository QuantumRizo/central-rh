# Instrucciones para agentes — Central RH

## Infraestructura vigente

- Este proyecto usa **Supabase en la nube exclusivamente**. El proyecto de producción es `Central RH`, ref `ncgbvbpkinrvrzxyttfz`, URL `https://ncgbvbpkinrvrzxyttfz.supabase.co`.
- **No hay Docker ni una instancia local de Supabase** disponible. No intentes `supabase start`, `supabase status`, `supabase db reset`, ni pruebas que requieran contenedores locales.
- La app React/Vite puede ejecutarse en local con `npm run dev`, pero se conecta al Supabase alojado mediante las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del `.env` local. Trátala como una conexión a datos reales; no uses datos de prueba o escrituras de diagnóstico sin necesidad.
- El proyecto está vinculado con Supabase CLI. Para cambios de esquema, crea una migración SQL en `supabase/migrations/`, revisa el destino con `supabase projects list` y valida lo pendiente con `supabase db push --dry-run --linked`. Aplica migraciones aprobadas con `supabase db push --linked` y vuelve a comprobar con el dry run. El CLI puede intentar usar Docker después de aplicar una migración; en ese caso verifica el estado remoto antes de reintentar.
- Nunca pongas claves `service_role`, contraseñas ni tokens en el repositorio o en el frontend. La clave pública de Supabase sí es apta para `VITE_SUPABASE_ANON_KEY`.

## Desarrollo

- Frontend: React, TypeScript y Vite; código en `src/`.
- Backend y permisos: Supabase alojado; migraciones y políticas RLS en `supabase/migrations/`.
- Verificación mínima de cambios de frontend: `npm run build` y `git diff --check`.
- Estilos: sigue `docs/design-system.md`. Usa los tokens de `src/styles/tokens.css` (nada de colores, tamaños ni sombras a mano), el encabezado `.page-header` y el ancho único de `.content`. Cada módulo tiene su archivo en `src/styles/`.
- El `README.md` describe la configuración vigente. Los documentos de planes históricos pueden mencionar el antiguo entorno local; no son instrucciones operativas actuales.
