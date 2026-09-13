# Central RH — Timesheets local

## Estado actual

Supabase local está configurado con el proyecto `Central_RH`. Las migraciones crean el modelo de colaboradores, clientes, actividades, roles y timesheets con RLS. El seed carga 42 colaboradores y 18 actividades.

Usuarios de prueba locales:

- `felix@centraldenegociosmx.com` / `123456` — administrador y colaborador
- `carolina@centraldenegociosmx.com` / `123456` — colaboradora

## Comandos

```bash
supabase start
supabase status
supabase db reset

# Provisionar las cuentas de prueba sin cambiar contraseñas existentes
SUPABASE_SERVICE_ROLE_KEY="$(supabase status --output env | sed -n 's/^SERVICE_ROLE_KEY=//p' | tr -d '"')" node scripts/provision-local-users.mjs
```

`db reset` recrea la base local y vuelve a cargar catálogos, pero no recrea automáticamente las cuentas de Auth. Si se reinicia la base desde cero, hay que volver a crear las cuentas de prueba y vincularlas a `employees`.

URLs locales:

- API: http://127.0.0.1:54321
- Studio: http://127.0.0.1:54323
- Mailpit: http://127.0.0.1:54324

## Alcance de esta base

La interfaz local está en `http://127.0.0.1:5175/` mientras el proceso Vite siga activo. Se verificó login de ambas cuentas, captura 100%, rechazo de porcentajes incorrectos, limpieza al marcar ausencia, aislamiento RLS y reporte administrativo con filtro/CSV.

## Despliegue (Vercel + Supabase alojado)

El backend alojado es `https://ncgbvbpkinrvrzxyttfz.supabase.co` (migraciones y catálogos ya aplicados).

En Vercel definir estas variables (ver `.env.example`):

- `VITE_SUPABASE_URL` = `https://ncgbvbpkinrvrzxyttfz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_mG6DsF6355IRpy9TJ2ziBw_DSoVyQqE`

Usar solo la clave pública/publishable en el frontend; la service role key nunca debe ir a Vercel ni al repo. Los usuarios de Auth del proyecto alojado se provisionan por separado (repetir el flujo de `scripts/provision-local-users.mjs` contra el proyecto alojado con su service role key).
