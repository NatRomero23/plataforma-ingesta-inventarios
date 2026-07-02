<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Se añaden seis principios específicos del proyecto y se
  expande materialmente la guía de calidad, seguridad y flujo de trabajo. No se
  elimina ni se redefine de forma incompatible ningún principio previo; los
  principios genéricos compatibles se conservan (traducidos a es-MX conforme al
  nuevo principio de idioma). No hay cambios de gobernanza incompatibles.

Modified principles:
  - I. Specification-First Development → I. Desarrollo Guiado por Especificación
    (traducido; sin cambio de fondo)
  - II. Test-First (NON-NEGOTIABLE) → II. Pruebas Primero (NO NEGOCIABLE)
    (traducido; sin cambio de fondo)
  - III. Modular, Self-Contained Design + V. Simplicity & Observability
    → IX. Diseño Modular, Simplicidad y Observabilidad (fusionados)
  - IV. Integration & Contract Testing → integrado en VI. Contrato de Integración
    con Red Vidar y en Estándares de Calidad y Seguridad

Added principles:
  - III. Idioma y Convenciones de Nomenclatura
  - IV. Stack Tecnológico Fijo
  - V. Seguridad y Custodia de Credenciales
  - VI. Contrato de Integración con Red Vidar
  - VII. Trazabilidad Total de Cargas
  - VIII. Validación Local Primero

Added sections: none (se conservan Estándares de Calidad y Seguridad, Flujo de
  Desarrollo y Gobernanza; se expanden con detalles del proyecto).

Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ revisado — el gate "Constitution Check"
    se deriva de este archivo; no hay nombres de principios embebidos.
  - .specify/templates/spec-template.md ✅ revisado — sin acoplamiento a principios.
  - .specify/templates/tasks-template.md ✅ revisado — sin categorías de tareas
    atadas a principios específicos.

Follow-up TODOs: none — todos los placeholders resueltos. Fecha de ratificación
  original conservada (2026-07-02); última enmienda 2026-07-02.
-->

# Constitución de mi-proyecto

Plataforma intermediaria de ingesta de inventarios farmacéuticos para Red Vidar.

## Principios Fundamentales

### I. Desarrollo Guiado por Especificación

Toda funcionalidad DEBE comenzar con una especificación aprobada antes de escribir
código de producción. La especificación describe el comportamiento visible para el
usuario, los requisitos y criterios de éxito medibles en términos independientes de la
tecnología; los planes de implementación y las tareas se derivan de la especificación,
nunca al revés. Las ambigüedades DEBEN resolverse (o marcarse explícitamente como
`NEEDS CLARIFICATION`) antes de aceptar un plan.

**Justificación**: Una intención escrita y compartida evita la deriva de alcance, hace
objetiva la revisión y mantiene planes y tareas trazables al valor real del usuario.

### II. Pruebas Primero (NO NEGOCIABLE)

TDD es obligatorio. Para cada unidad de comportamiento: las pruebas se escriben primero,
se confirma que fallan y luego la implementación las hace pasar (Rojo → Verde →
Refactor). Ningún código de producción se integra sin pruebas que ejerciten su
comportamiento, y ninguna prueba se debilita ni se elimina solo para que compile o pase
la suite.

**Justificación**: Las pruebas escritas después codifican lo que el código hace por
accidente; las pruebas escritas antes codifican el comportamiento pretendido y atrapan
regresiones temprano.

### III. Idioma y Convenciones de Nomenclatura

Todo texto dirigido a personas DEBE estar en español de México (es-MX): comentarios,
mensajes de la interfaz de usuario, mensajes de error y documentación. Los identificadores
de código —nombres de variables, funciones, clases, tablas y columnas— DEBEN estar en
inglés por convención técnica. Los mensajes de error orientados al usuario DEBEN ser
accionables y en es-MX; los detalles técnicos para diagnóstico pueden registrarse aparte.

**Justificación**: El equipo y los usuarios operan en español; separar el idioma de la
interfaz del idioma del código mantiene la experiencia local sin sacrificar la
interoperabilidad con herramientas y bibliotecas del ecosistema.

### IV. Stack Tecnológico Fijo

El stack es fijo: frontend en React con Vite, backend en Node.js con Express, y
PostgreSQL accedido mediante Prisma. NO se introducen otros frameworks, ORMs, lenguajes
ni motores de base de datos sin una justificación registrada en la sección Complexity
Tracking del plan, que documente la alternativa más simple rechazada. Las bibliotecas de
apoyo (utilidades, validación, pruebas) son admisibles siempre que no reemplacen ni
dupliquen los pilares del stack.

**Justificación**: Un stack acotado reduce la carga cognitiva, simplifica el despliegue y
mantenimiento, y evita fragmentación tecnológica en una plataforma con equipo reducido.

### V. Seguridad y Custodia de Credenciales

La autenticación DEBE usar JWT con los roles `admin`, `coordinador`, `usuario-farmacia`
e `integrador-api`; toda ruta protegida verifica rol y permiso. Los integradores externos
DEBEN autenticarse con una clave de API propia de esta plataforma y NUNCA con la clave de
Red Vidar. La clave `rv_pc_live_` de Red Vidar vive EXCLUSIVAMENTE en variables de entorno
del backend: está PROHIBIDO exponerla en el frontend, en el código fuente, en logs, en
mensajes de error o en cualquier respuesta de la API. Las contraseñas DEBEN almacenarse
con bcrypt (nunca en texto plano ni con hash reversible). Ningún secreto se comitea al
repositorio.

**Justificación**: La plataforma es intermediaria; filtrar la credencial de Red Vidar o
confundir identidades comprometería a un tercero. Aislar secretos en el backend y separar
las claves por origen contiene el radio de impacto de cualquier fuga.

### VI. Contrato de Integración con Red Vidar

La integración con Red Vidar es un contrato externo de cumplimiento obligatorio:

- **Idempotencia**: Todo `POST` DEBE incluir el encabezado `X-Idempotency-Key` con un
  UUID v4 único por operación lógica y REUSADO idéntico en cada reintento de esa misma
  operación.
- **Envoltura de respuesta**: Toda respuesta DEBE deserializarse contra la envoltura
  `{ webhookEventId, processingStatus, status, result }`, donde `result` es opcional y
  puede ser `null`. El código nunca asume la presencia de `result`.
- **Ramificación por estado HTTP**: `2xx` = éxito; `400`, `401`, `422` = corregir el
  problema SIN reintentar; `429` = respetar `Retry-After`; `502` = backoff exponencial
  con jitter, máximo 5 intentos. Cualquier otro estado se trata como fallo trazable.
- **Ritmo**: El límite de 10 solicitudes por minuto DEBE respetarse. Los envíos salen
  SIEMPRE de una cola interna con control de ritmo (throttling); NUNCA se disparan
  directamente desde la petición del usuario.
- **Pruebas de contrato**: Todo cambio que cruce esta frontera DEBE estar cubierto por
  pruebas de contrato/integración que validen encabezados, envoltura y ramificación.

**Justificación**: El contrato de un tercero es donde se esconden los cambios que rompen;
codificar idempotencia, forma de respuesta, política de reintentos y ritmo evita datos
duplicados, bloqueos por exceso de tráfico y fallos silenciosos.

### VII. Trazabilidad Total de Cargas

Nada se descarta. Toda carga DEBE conservar: el archivo o payload original tal como se
recibió, el resultado de la validación local, cada intento de envío con su
`webhookEventId`, y los conteos finales (aceptados, rechazados, pendientes). El historial
DEBE ser suficiente para reconstruir qué se envió, cuándo, con qué resultado y por qué.

**Justificación**: En una plataforma intermediaria de inventarios, la capacidad de
auditar y reprocesar depende de conservar la evidencia completa; descartar el original o
los intentos vuelve irreproducibles los incidentes.

### VIII. Validación Local Primero

Las reglas del contrato se validan localmente ANTES de consumir cualquier llamada a Red
Vidar. Lo que no pasa la validación local NO consume una solicitud a Red Vidar: se
rechaza, se registra su resultado de validación (Principio VII) y no entra a la cola de
envío (Principio VI).

**Justificación**: Validar primero protege el presupuesto de 10 solicitudes por minuto,
reduce el ruido de errores `4xx` remotos y da retroalimentación inmediata al usuario sin
depender de un tercero.

### IX. Diseño Modular, Simplicidad y Observabilidad

La funcionalidad DEBE organizarse en módulos con un propósito único y claro, interfaces
explícitas y sin acoplamiento oculto entre módulos; cada módulo DEBE ser probable en
aislamiento. Se comienza con el diseño más simple que satisface la especificación (YAGNI);
toda complejidad añadida DEBE justificarse frente a una alternativa más simple rechazada.
El comportamiento DEBE ser observable: logs estructurados para eventos significativos,
mensajes de error accionables y estados de fallo diagnosticables.

**Justificación**: Los límites claros permiten razonar, probar y evolucionar sin efectos
en cadena; los sistemas simples y observables son más baratos de cambiar y depurables en
producción, no solo en teoría.

## Estándares de Calidad y Seguridad

- Todo el código DEBE pasar linters, formateadores y la suite de pruebas completa antes de
  integrarse; una rama principal rota se trata como incidente de detener-la-línea.
- Secretos, credenciales y datos personales NO DEBEN comitearse ni escribirse en logs; en
  particular, la clave `rv_pc_live_` de Red Vidar solo existe en variables de entorno del
  backend (Principio V). La configuración y los secretos se proveen por entorno o gestor de
  secretos, nunca embebidos.
- Toda entrada que cruza una frontera de confianza DEBE validarse (Principio VIII); las
  dependencias DEBEN estar fijadas (pinned) y revisadas por vulnerabilidades conocidas
  antes de adoptarse.
- Las contraseñas se almacenan con bcrypt; los tokens JWT llevan expiración y se validan
  por rol en cada ruta protegida.
- Las interfaces públicas y las decisiones no obvias DEBEN documentarse junto al código, en
  es-MX (Principio III).

## Flujo de Desarrollo

- El trabajo fluye por el ciclo de Spec Kit: specify → clarify (según se necesite) → plan →
  tasks → implement, con el gate "Constitution Check" del plan haciendo cumplir estos
  principios antes de avanzar al diseño.
- Todo cambio se revisa antes de integrarse. Los revisores DEBEN verificar el cumplimiento
  constitucional (pruebas primero, fronteras cubiertas por pruebas de contrato, complejidad
  justificada, secretos protegidos, idioma correcto) además de la corrección funcional.
- Toda violación del Constitution Check DEBE registrarse en la tabla Complexity Tracking del
  plan con su justificación y la alternativa más simple rechazada, o bien el diseño DEBE
  revisarse para cumplir.

## Gobernanza

Esta constitución prevalece sobre otras prácticas de desarrollo cuando entren en conflicto.
Aplica a todas las personas contribuyentes y a todos los cambios de este repositorio.

- **Enmiendas**: Se proponen mediante un pull request que edita este documento, expone la
  justificación y actualiza la versión y las fechas de abajo. Las enmiendas requieren
  aprobación de revisión antes de integrarse. Romper o eliminar un principio requiere,
  además, una nota de migración que describa el impacto en el trabajo en curso.
- **Política de versionado** (semántico): MAJOR para cambios de gobernanza o eliminación/
  redefinición de principios incompatibles hacia atrás; MINOR para un principio o sección
  nuevos o una guía materialmente expandida; PATCH para aclaraciones y refinamientos no
  semánticos.
- **Revisión de cumplimiento**: El cumplimiento constitucional se verifica en la
  planeación (gate Constitution Check) y en la revisión de código. Las violaciones
  recurrentes del mismo principio DEBERÍAN disparar una revisión de si el principio o el
  proceso necesitan enmienda.

**Versión**: 1.1.0 | **Ratificada**: 2026-07-02 | **Última Enmienda**: 2026-07-02
