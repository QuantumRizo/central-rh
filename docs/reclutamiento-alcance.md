# Reclutamiento y estructura organizacional — alcance de trabajo

Estado: propuesta para validación con RH y Dirección. Ningún dato de los archivos fuente se ha importado a producción. Confirmado el 22 de septiembre: en la primera versión sólo RH y Dirección usarán la plataforma, el flujo llegará hasta contratación, y contratos/documentación/onboarding quedarán para después. El alcance del documento de Farmacias Similares debe validarse con RH.

## Fuentes revisadas

- Correo **CN | Desarrollo plataforma de Recursos Humanos** del 27 y 28 de agosto de 2026: solicita seguimiento desde requisición hasta contratación y propone contratos, documentación laboral y onboarding para una segunda etapa.
- `Nueva organizción julio 2026.xlsx`, hoja `Descriopcion de Puesto`: describe Director Servicio a Cliente, Gerente (On/Off), Planner y Ejecutivo Off. Incluye propósito, supervisión recibida/ejercida, reportes directos y responsabilidades. La hoja `Hoja2` contiene personas y datos de evaluaciones; no es un catálogo de puestos.
- `Descripcion_de_Puestos_Farmacias_Similares_AGO_.docx`: describe Directora de Cuenta, Controler/Dirección de Operaciones, Coordinación Senior Farmacias Similares, Coordinador Jr., Planner, Ejecutivo y Asistente/Becario. Varias responsabilidades se refieren explícitamente a la cuenta Farmacias Similares y sus sistemas.
- `Copia de Formato de Requisición de personal.xlsx`: contiene fecha, puesto, jefe inmediato, área, motivo y justificación, tipo de contrato, jornada, horario, salario presupuestado, prestaciones, actividades, equipo, ubicación y autorizaciones de jefe inmediato, Dirección General y RH.

Los títulos de los dos documentos no coinciden uno a uno. RH validará cuáles son perfiles generales de CN y cuáles son variantes o funciones específicas de una cuenta. Tampoco está completo el organigrama de toda la agencia en la hoja recibida.

## Modelo propuesto

| Entidad | Qué representa | Relación principal |
| --- | --- | --- |
| Perfil de puesto | Descripción permanente del rol, competencias, responsabilidades, área y nivel | Un jefe principal opcional; relaciones adicionales registradas aparte |
| Plaza | Un lugar concreto en la estructura, ocupado o vacante | Pertenece a un perfil; puede estar ocupado por una persona |
| Requisición | Solicitud de abrir o cubrir una plaza | La crea un líder; RH y Dirección la revisan según el flujo aprobado |
| Vacante | Búsqueda autorizada con criterios y condiciones vigentes | Nace de una requisición aprobada y apunta a un perfil/plaza |
| Candidato | Persona y expediente, independiente de una vacante | Puede participar en varias vacantes sin duplicar su CV |
| Postulación | Participación del candidato en una vacante concreta | Tiene etapa, primer filtro, evaluaciones, entrevistas y decisión |
| Colaborador | Persona contratada y su cuenta interna | Al contratar, se vincula con la plaza sin borrar el expediente de candidatura |

Esto evita confundir un **perfil permanente** con una **vacante temporal**. El prototipo local iniciado antes de recibir estos archivos usa una sola tabla para ambos conceptos; se revisará antes de aplicar cualquier migración.

## Flujo de la primera versión

1. RH mantiene perfiles y estructura; Dirección consulta y aprueba lo que le corresponda.
2. RH registra la solicitud del área mediante el formulario de requisición, o se habilita un formulario externo si así se decide. El sistema conserva motivo, justificación, condiciones y aprobaciones con fecha y responsable.
3. RH abre la vacante a partir de la requisición aprobada.
4. El buzón `rh@centrales.com.mx` aporta correos y CV. También debe existir alta manual para candidatos que llegan por otros canales. El sistema identifica duplicados y conserva el documento original en almacenamiento privado.
5. Gemini extrae un resumen profesional y compara evidencia del CV con los criterios de cada vacante. La puntuación queda acompañada de razones y datos faltantes; RH realiza el primer filtro y decide si continúa.
6. RH registra pruebas, entrevistas y feedback recibido de entrevistadores fuera de la plataforma. La integración automática con un proveedor de psicometría depende de cuál elija RH.
7. Dirección/RH registran la decisión. Si se contrata, la plaza se vincula con el nuevo colaborador. Contratos, documentación laboral y onboarding quedan fuera de esta primera entrega.

## Acceso de la primera versión

| Rol | Acceso inicial sugerido |
| --- | --- |
| RH | Expedientes completos, vacantes, requisiciones, estructura y seguimiento |
| Dirección | Aprobaciones, panorama de vacantes y candidatos finalistas; salario según autorización |
| Líder de área | Sin cuenta de reclutamiento en esta versión; envía solicitudes y feedback por el canal que se acuerde |
| Entrevistador | Sin cuenta de reclutamiento en esta versión; RH registra su feedback |
| Colaborador | Su perfil actual y módulos ya existentes; sin acceso a expedientes de candidatos |

Central RH hoy sólo distingue `admin` y `collaborator`; se necesitará distinguir RH y Dirección dentro del acceso administrativo.

## Cómo entran las requisiciones de las áreas

La hoja de requisición supone que un área inicia la solicitud, pero se confirmó que líderes de área no tendrán acceso completo a la plataforma en la primera versión. Hay dos caminos compatibles:

1. **RH captura la solicitud:** el área sigue enviando el Excel o correo a RH; RH lo registra en Central RH y Dirección lo aprueba allí. Es el camino más sencillo para iniciar, pero requiere transcripción manual.
2. **Formulario de solicitud limitado:** el área abre un enlace y llena sólo la requisición; RH y Dirección reciben y procesan la solicitud dentro de Central RH. Debe definirse cómo identificar al solicitante y proteger salarios/condiciones. El líder no obtiene acceso al expediente de candidatos ni a los demás módulos.

Recomendación inicial: si las áreas ya usan el Excel y el volumen es bajo, iniciar con captura por RH y pasar al formulario limitado una vez estabilizado el flujo. Si la recepción directa y sin transcripción es requisito de salida, elegir el formulario desde la primera versión.

## Datos y decisiones pendientes

1. RH debe confirmar si el documento de Farmacias Similares define puestos oficiales, variantes de cuenta o sólo responsabilidades de esa operación. Identificar el catálogo vigente y el organigrama completo de CN.
2. Confirmar las personas de RH y Dirección que participarán y quién puede ver salario, psicometría y notas confidenciales. Los líderes y entrevistadores no tendrán cuenta en esta primera versión.
3. Confirmar un jefe directo principal por plaza y qué relaciones secundarias necesita el organigrama.
4. Definir cómo las áreas entregarán requisiciones a RH, quién las aprueba, en qué orden, y qué pasa cuando se rechazan o piden cambios. Aclarar el campo “Persona aprobada” del formato.
5. Alcance confirmado: hasta contratación; contratos, documentación laboral y onboarding se atenderán en la segunda etapa.
6. Solicitar a RH los criterios de selección de al menos una vacante real (indispensables, deseables y pesos), y el proveedor de pruebas psicométricas si ya existe.
7. Solicitar a TI la aplicación de Microsoft 365 con lectura limitada a `rh@centrales.com.mx`, más tenant ID, client ID y secreto por canal seguro. La clave de Gemini puede reutilizarse como secreto de servidor.

## Orden de implementación

1. Validar catálogo y permisos para RH/Dirección; separar perfiles, plazas, requisiciones y vacantes en el esquema.
2. Construir requisición y aprobaciones, catálogo de perfiles y organigrama básico.
3. Completar expediente y postulación del candidato; integrar Outlook/Gemini y el primer filtro.
4. Añadir pruebas, entrevistas, feedback y decisión final.
5. Integrar contratación con el perfil de colaborador; evaluar contratos, documentos y onboarding en una segunda etapa.
