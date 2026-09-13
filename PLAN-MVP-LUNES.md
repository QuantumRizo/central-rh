# Timesheets Central de Negocios — plan mínimo

Fecha de revisión: 13 de septiembre de 2026. Entrega objetivo: lunes 14 de septiembre de 2026.

## Decisión propuesta

Crear una aplicación independiente de Timesheets con React, Vite y TypeScript y Supabase local para desarrollo. Usar migraciones SQL desde el inicio para reproducir el esquema en un proyecto Supabase alojado cuando esté disponible. Mantener separado de Evaluación CN, conforme a la corrección del usuario en la conversación.

Actualización de ejecución: Supabase `Central_RH` ya fue inicializado y arrancado, con migración, catálogos y cuentas locales. La interfaz aún no existe. Para continuar, seguir `CONTINUAR-LUNA.md`; las secciones de inventario siguientes describen la revisión inicial.

## Entorno verificado

| Componente | Resultado |
| --- | --- |
| Carpeta Central RH | Vacía antes de crear este plan; sin aplicación ni configuración Supabase |
| Docker cliente y servidor | 29.5.3; servidor responde |
| Contexto Docker | desktop-linux |
| Supabase CLI | 2.111.0 |
| Node / npm | v26.3.0 / 11.16.0 |
| Otras herramientas | pnpm y Git disponibles |
| Supabase previo | 12 contenedores de SchedulingProject, todos detenidos |
| Imagen de base existente | Supabase Postgres 17.6.1.156 |

No se ha comprobado el arranque de una nueva instancia ni compatibilidad de dependencias de frontend. Crear identificador, volúmenes y puertos propios para Central RH al implementar.

## Evidencia y límites

Fuente principal: correo del cliente reproducido en la conversación “Resumen plataforma RH”, ID 6a90c30a-08ac-83e8-bb11-67b88b24e0cc. Pide trabajo sí/no, modalidad y horario, vacaciones/falta sin actividades, distribución por cliente y actividad, reportes porcentuales por cliente y persona, y análisis por puesto.

Archivos originales revisados en modo lectura:

- `Colaboradores CN Base de datos 2026.xlsx`, Hoja1, B3:D45: 42 registros, 34 activos y 8 bajas; nombre, puesto y estatus. No contiene correos ni fechas de alta/baja. Hay 24 etiquetas distintas de puesto después de quitar espacios externos; falta normalizarlas.
- `Time Sheet actividades.xlsx`, Hoja de tiempo, A6:A23: 18 actividades. Incluye Comida, Tiempo Empresarial y Gestión de equipo. A24 es Total y no debe importarse como actividad.

La captura retroactiva desde enero y la restricción exclusiva a Farmacias Similares aparecen en el resumen del asistente sobre el audio, no en el correo. El audio no se transcribió en esta revisión: tratar ambas como puntos pendientes de confirmar. El mismo resumen contenía una afirmación sobre integrar Evaluación CN que el usuario corrigió. No tomar sus demás afirmaciones como requisitos verificados.

## Alcance para el lunes

1. **Acceso individual:** cuenta vinculada a colaborador. Dos permisos mínimos propuestos: colaborador captura y consulta lo propio; administrador consulta reportes generales y configura catálogos. Sin registro público libre.
2. **Mi timesheet:** elegir fecha, ver si ya tiene captura y editarla. Un registro por colaborador y fecha. Ofrecer selector de fecha para permitir captura histórica sin construir un calendario anual complejo.
3. **Captura diaria:** trabajó sí/no; presencial, home office o permiso de horario; entrada y salida. Si no trabajó, vacaciones o falta, sin detalle de actividades.
4. **Distribución:** varias filas de cliente + actividad + porcentaje. Total de día trabajado exactamente 100%, propuesta coherente con porcentajes diarios, aunque no expresada literalmente en el correo. Validación en interfaz y base de datos; guardado transaccional del día completo.
5. **Reportes:** una pantalla con rango de fechas y vistas por cliente, colaborador y puesto. Cliente: personas distintas con captura en el período y distribución de actividades. Persona: distribución entre clientes y actividades. Puesto: misma distribución agrupada. Exportación CSV sencilla incluida como prioridad posterior a reportes funcionales.
6. **Datos iniciales:** cargar colaboradores y actividades del Excel mediante script repetible y validar conteos. Conservar bajas para históricos; no habilitarles acceso automáticamente. Carga inicial de clientes y cuentas por script para evitar construir un importador genérico.

## Reglas de reporte propuestas

- Diferenciar día sin capturar de vacaciones, falta o día trabajado. Nunca convertir ausencia de captura en falta automáticamente.
- Usar solo días trabajados completos para distribución de tiempo; mostrar el número de días incluidos.
- Para una persona, dividir la suma de porcentajes de una categoría por el número de días trabajados capturados. Ejemplo: 50% y 100% en dos días = 75% promedio diario.
- Para distribución de actividades dentro de un cliente, dividir la suma de porcentajes de la actividad por la suma de porcentajes de ese cliente en el período. Contar personas distintas, no filas.
- Por puesto, agregar sobre los días-persona capturados. Mostrar que se trata de distribución diaria, no de horas ponderadas ni costo salarial. Si requieren ponderación por duración real, acordar tratamiento de comida y descansos primero.
- Guardar el puesto asociado al día como referencia histórica para que un cambio futuro no reescriba reportes pasados. Los Excel no permiten reconstruir cambios anteriores: cualquier carga histórica requiere validación.
- Conservar Comida en el catálogo porque está en el archivo. Definir su cliente aplicable y su inclusión en el 100% antes del piloto; no excluirla silenciosamente.

## Modelo mínimo

- `employees`: nombre, puesto, estatus, vínculo opcional a usuario de Auth.
- `clients`: catálogo de clientes activos.
- `activities`: catálogo de las 18 actividades.
- `user_roles`: autorización administrada en servidor.
- `timesheets`: colaborador, fecha, asistencia, modalidad, entrada/salida, puesto del día y fechas de creación/actualización; unicidad colaborador-fecha.
- `timesheet_entries`: hoja, cliente, actividad, porcentaje decimal exacto.
- `employee_clients`: solo si se confirma restricción por cuenta; aplicar también en servidor.

Supabase Auth y políticas RLS deben impedir lectura/escritura de hojas ajenas para colaboradores. No colocar credenciales privilegiadas en el frontend. Un procedimiento transaccional validará porcentajes y consistencia del día y reemplazará el detalle sin guardar estados parciales. Si se cambia a vacaciones/falta, retirar detalles previos en la misma operación.

## Orden de implementación y aceptación

| Bloque | Trabajo | Evidencia para darlo por terminado |
| --- | --- | --- |
| 1 | Inicializar app y Supabase aislado, migraciones, catálogos y usuarios de prueba | Servicios arrancan, esquema reproducible y conteos de carga correctos |
| 2 | Acceso y captura completa | Guardar y recargar un día 60/40; rechazar 90% y 110%; editar sin duplicar |
| 3 | Ausencias y permisos | Vacaciones/falta sin detalles; horario requerido y válido; acceso ajeno rechazado por backend |
| 4 | Reportes y CSV | Totales comprobados con dos personas, dos días y dos clientes; conteo de personas sin duplicados |
| 5 | Publicación y piloto | Dos cuentas reales completan captura y administrador verifica reporte desde otro equipo |

Primero cerrar el flujo de captura de punta a punta, después reportes y finalmente pulido visual. La viabilidad del lunes depende de cerrar datos de acceso, reglas pendientes y alojamiento; no es una garantía de entrega por el solo hecho de tener Docker instalado.

## Pendientes para uso real

- Correos/identificadores de acceso de los 34 activos y quién será administrador.
- Catálogo real de clientes; determinar cómo registrar tiempo interno y Comida.
- Confirmar retroactividad, período permitido, tratamiento de fines de semana/festivos y asignaciones exclusivas a Farmacias Similares. No bloquear fechas ni inventar festivos por defecto.
- Definir si el lunes es piloto o apertura para los 34 activos, y hora objetivo.
- Proyecto alojado independiente disponible. Publicar frontend y backend con variables y redirecciones de Auth, cargar catálogos y provisionar usuarios de producción por separado. Aplicar migraciones no transfiere automáticamente usuarios ni datos locales.

Si el pago sigue bloqueado, se puede demostrar y probar todo localmente. Para operación compartida se necesitará un servidor desplegado; publicar únicamente el frontend no basta para acceder al Supabase local de la Mac. No usar el stack local de desarrollo como despliegue público improvisado.

## Fuera de esta entrega

Reclutamiento, requisiciones, vacantes, candidatos, psicométricos, entrevistas, organigrama, nómina, sueldos/costos, aprobaciones de timesheets, notificaciones e integración con Evaluación CN. El correo menciona sueldos para análisis financiero; propongo posponerlo explícitamente porque no viene en los datos entregados y ampliaría el alcance.

## Referencias técnicas

- Desarrollo local: https://supabase.com/docs/guides/local-development
- Migraciones: https://supabase.com/docs/guides/local-development/database-migrations

La documentación respalda desarrollar localmente y versionar el esquema para aplicarlo posteriormente al proyecto remoto.
