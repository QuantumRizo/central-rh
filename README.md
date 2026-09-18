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
