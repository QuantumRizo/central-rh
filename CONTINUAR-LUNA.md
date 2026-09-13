# Continuación del MVP

Leer este archivo y `PLAN-MVP-LUNES.md`. Implementar el MVP local completo y verificarlo; no volver a planear ni detenerse para confirmar decisiones ya acordadas. No publicar hasta disponer del destino remoto. Trabajar en esta carpeta y preservar los otros proyectos Docker.

## Estado real

- Supabase `Central_RH` inicializado; último arranque correcto. API 54321, DB 54322, Studio 54323. Frontend Vite funcional en 5175 (el puerto puede cambiar si está ocupado). No existe repositorio Git inicializado.
- Migraciones `202609130001_timesheets.sql` y `202609130002_save_timesheet_rpc.sql`: tablas, RLS, grants y RPC atómico con total exacto 100%; se revocaron escrituras directas. Validado con 60/40, rechazo de 90%, ausencia sin detalles.
- Seed: 42 empleados (34 activos/8 bajas), 18 actividades. Tres clientes provisionales: Farmacias Similares, Cliente de prueba, Tiempo interno. No son un catálogo confirmado; identificarlos como datos de prueba.
- Auth local provisionado con `scripts/provision-local-users.mjs`: Félix admin y colaborador; Carolina colaboradora. El script es idempotente para estas cuentas y exige `SUPABASE_SERVICE_ROLE_KEY`.
- Verificado: ambos inician sesión; Félix lee 42 empleados y Carolina solo el suyo. La interfaz permite fecha, modalidad, horario, filas cliente/actividad/porcentaje, ausencia, guardado y reporte administrativo con fechas y CSV. La app se verificó en navegador en 5175.
- `db reset` perdería las cuentas. El seed de empleados tampoco es idempotente al ejecutarlo dos veces sobre la misma base: `on conflict` no evita duplicados de nombre sin restricción única.

## Orden de trabajo

1. Provisionamiento: implementado para las dos cuentas de prueba en `scripts/provision-local-users.mjs`. Extender la lista solo cuando se reciban correos autorizados; no inventarlos. Usar clave privilegiada solo en script, nunca frontend.
2. Agregar nueva migración con procedimiento de guardado atómico del día y detalle. Validar usuario activo y propietario, fecha, horario, catálogos, porcentajes positivos y total exacto 100% con decimal, sin duplicar pares cliente/actividad. Para vacaciones/falta eliminar detalle y horario en la misma transacción. Preservar puesto histórico al editar. Serializar guardados de la misma persona/fecha. Revocar escrituras directas de authenticated para impedir eludir validaciones; si se usa SECURITY DEFINER, validar auth.uid(), fijar search_path y restringir EXECUTE. Administrador consulta reportes globales y captura su propia hoja; no necesita editar hojas ajenas.
3. Frontend React/Vite/TypeScript, Tailwind, componentes shadcn, Lucide y React Router. Inicio de sesión, sesión persistente, salir, captura/edición por fecha, varias filas cliente/actividad/%, total visible y errores claros. Vacaciones/falta deshabilitan actividades. Un día sin captura no es falta. Interfaz sencilla en español, adaptable a móvil, con estados de carga/error/guardado. Usar cliente Supabase en capa de datos separada; solo URL y clave pública en variables frontend. No necesita Sites ni otra plataforma de hosting para desarrollo local.
4. Reportes para administrador por cliente, persona y puesto; filtro de fechas y CSV. Aplicar denominadores del plan, contar personas distintas y mostrar días capturados. Evitar truncamiento silencioso de 1000 filas: agregación servidor o paginación completa. Colaborador solo consulta lo propio. CSV debe escapar celdas y neutralizar fórmulas. No implementar costos salariales. Implementado en `Reports`; ampliar agregación por puesto si el piloto lo requiere.
5. Verificación funcional contra Supabase local: guardar/recargar 60+40, rechazar 90/110, editar sin duplicado, cambiar a ausencia eliminando detalles, impedir lectura/escritura ajena y escalamiento de rol. Verificar reportes con fixture de dos personas/días/clientes y limpiar solo datos del fixture. Probar login, captura y reportes en navegador; ejecutar build y comprobación TypeScript. Guardar evidencia breve y limitaciones en README.
6. Dejar app local ejecutándose, abrirla en Codex y entregar URL y credenciales de prueba. Actualizar plan/README con lo realmente completado. No prometer publicación ni acceso remoto todavía.

## Decisiones para avanzar sin bloquearse

- Proyecto independiente de Evaluación CN; desarrollo con backend local real.
- Permitir selector de fecha histórica; no imponer enero, días hábiles, festivos o exclusividad de Farmacias Similares sin confirmación. Son afirmaciones del resumen del audio, no verificadas en el correo.
- Mantener Comida como actividad; asignación de tiempo interno y catálogo final quedan por confirmar, pero no bloquean pruebas con clientes provisionales.
- No inventar correos para los demás. Solo las dos cuentas autorizadas por ahora.
- Fuera del MVP: reclutamiento, organigrama, nómina, sueldos, aprobaciones y notificaciones.
- Despliegue futuro: proyecto Supabase independiente, migraciones, catálogos y usuarios se provisionan por separado. No publicar Docker local como backend de producción.
