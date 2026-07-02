---
description: "Task list para la Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)"
---

# Tasks: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Input**: Design documents from `specs/001-pharma-inventory-ingest/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUIDOS y OBLIGATORIOS. La constitución (Principio II — Pruebas Primero, NO NEGOCIABLE) exige TDD:
los tests se escriben primero, se confirma que fallan, y luego la implementación los hace pasar.

**Organization**: Las tareas se agrupan por historia de usuario para permitir implementación y prueba
independientes. Prioridades tomadas de spec.md (US1/US2 = P1, US3/US4 = P2, US5/US6 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1..US6)
- Rutas exactas incluidas en cada descripción

## Path Conventions

Aplicación web (monorepo): `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/` (ver plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización del proyecto y estructura base.

- [X] T001 Crear estructura de monorepo con carpetas `backend/` y `frontend/` según plan.md
- [X] T002 Inicializar backend: `backend/package.json`, TypeScript (`backend/tsconfig.json`), Express, Prisma y dependencias de apoyo (`zod`, `exceljs`, `jsonwebtoken`, `bcrypt`, `pino`, `uuid`) según research.md
- [X] T003 [P] Inicializar frontend con Vite + React + TypeScript en `frontend/` (`frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`)
- [X] T004 [P] Configurar linting y formateo (ESLint + Prettier) en `backend/` y `frontend/` con identificadores en inglés (Principio III)
- [X] T005 [P] Configurar Vitest en backend (`backend/vitest.config.ts`) con base de datos de prueba, Supertest y `nock` para el servidor simulado de Red Vidar
- [X] T006 [P] Configurar Vitest en frontend (`frontend/vitest.config.ts`)
- [X] T007 [P] Implementar logger estructurado con **redacción** de encabezados sensibles (evita fugas de `rv_pc_live_`) en `backend/src/lib/logger.ts` (Principio V, D9)
- [X] T008 [P] Implementar cargador y validación de configuración de entorno (`DATABASE_URL`, `JWT_SECRET`, `RED_VIDAR_API_KEY`, `RED_VIDAR_BASE_URL`, `MAX_UPLOAD_BYTES`) en `backend/src/config/index.ts` — la credencial de Red Vidar solo se lee aquí (Principio V, FR-030)
- [X] T009 [P] Andamiaje de i18n es-MX para textos de UI en `frontend/src/i18n/es-MX.ts` (Principio III)

**Checkpoint**: Proyectos inicializados y ejecutables en vacío.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura central que DEBE completarse antes de CUALQUIER historia de usuario.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta terminar esta fase.

- [X] T010 Definir el esquema Prisma con todas las entidades y enums (Chain, Pharmacy, User, ApiKey, Load, LoadRow, DispatchAttempt, RedVidarResult, DispatchJob, RetentionPolicy, AuditLog) en `backend/prisma/schema.prisma` según data-model.md
- [X] T011 Generar la migración inicial y el cliente Prisma (`backend/prisma/migrations/`), incluyendo índices de buzón y de cola (`FOR UPDATE SKIP LOCKED`)
- [X] T012 [P] Middleware de manejo de errores con mensajes en es-MX y forma `{code, message}` en `backend/src/middleware/errorHandler.ts`
- [X] T013 [P] Middleware de logging de peticiones en `backend/src/middleware/requestLogger.ts`
- [X] T014 Servicio de autenticación: hash de contraseñas con bcrypt y emisión/verificación de JWT (claims `role`, `chainId`) en `backend/src/modules/auth/authService.ts` (Principio V)
- [X] T015 Middleware `authJwt` y `requireRole` en `backend/src/middleware/auth.ts`
- [X] T016 Middleware `authApiKey` (verifica hash bcrypt y estado ACTIVE, resuelve la cadena) en `backend/src/middleware/authApiKey.ts` (FR-012)
- [X] T017 Endpoint `POST /api/v1/auth/login` en `backend/src/modules/auth/authRoutes.ts`
- [X] T018 Ensamblar la app Express (rutas + middleware) en `backend/src/app.ts` y el arranque en `backend/src/server.ts` con límite de tamaño de subida (`MAX_UPLOAD_BYTES`, FR-002a)
- [X] T019 [P] Script de datos semilla (1 cadena, farmacias mapeadas, 1 usuario-farmacia, 1 clave de API) en `backend/prisma/seed.ts` para probar US1–US4 de forma independiente
- [X] T020 [P] Cliente de la API de la plataforma y proveedor de sesión/JWT en `frontend/src/services/apiClient.ts` y enrutador base en `frontend/src/router.tsx`

**Checkpoint**: Base lista — puede comenzar el trabajo por historias de usuario.

---

## Phase 3: User Story 1 - Carga por portal con validación previa (Priority: P1) 🎯 MVP

**Goal**: Un usuario-farmacia descarga la plantilla, sube su Excel, y ve el resumen de validación (válidos,
errores por fila con razón, farmacias no mapeadas) antes de confirmar el envío de los válidos.

**Independent Test**: Con datos semilla, subir un Excel mixto y verificar el resumen; la carga queda en
`VALIDATED` con su archivo original almacenado. No requiere despacho a Red Vidar.

### Tests for User Story 1 (escribir primero, confirmar que fallan) ⚠️

- [X] T021 [P] [US1] Test de contrato `GET /api/v1/inventory/template` en `backend/tests/contract/template.get.test.ts`
- [X] T022 [P] [US1] Test de contrato `POST /api/v1/inventory/portal-uploads` (ValidationSummary) en `backend/tests/contract/portalUpload.post.test.ts`
- [X] T023 [P] [US1] Test de contrato `POST /api/v1/loads/{loadId}/confirm` (409 si 0 válidos) en `backend/tests/contract/confirm.post.test.ts`
- [X] T024 [P] [US1] Tests unitarios de reglas de validación (stock entero ≥ 0, EAN ≤ 20, nombre no vacío, requeridos, farmacia no mapeada) en `backend/tests/unit/validation.test.ts`
- [X] T025 [P] [US1] Tests unitarios de traducción código de cadena → pharmacyCode Red Vidar en `backend/tests/unit/translation.test.ts`
- [X] T026 [P] [US1] Test de integración del journey US1 (subir mixto → resumen; archivo sin columnas → 400) en `backend/tests/integration/us1-portal-upload.test.ts`

### Implementation for User Story 1

- [X] T027 [P] [US1] Módulo de validación por renglón (acumula errores por fila y farmacias no mapeadas) en `backend/src/modules/validation/validateRows.ts` (FR-004, Principio VIII)
- [X] T028 [P] [US1] Módulo de traducción (tabla de equivalencias) en `backend/src/modules/translation/translatePharmacyCode.ts` (FR-003)
- [X] T029 [US1] Generador de plantilla Excel (exceljs) y endpoint `GET /api/v1/inventory/template` en `backend/src/modules/uploads/templateRoutes.ts` (FR-001)
- [X] T030 [US1] Parser de Excel en streaming (valida columnas requeridas y límite de tamaño) en `backend/src/modules/uploads/excelParser.ts` (FR-002/002a)
- [X] T031 [US1] Servicio de cargas: crear Load, persistir `originalBlob`/metadatos, crear LoadRow, calcular conteos en `backend/src/modules/loads/loadsService.ts` (FR-021, Principio VII)
- [X] T032 [US1] Endpoint `POST /api/v1/inventory/portal-uploads` (parsea → traduce → valida → estado `VALIDATED`) en `backend/src/modules/uploads/uploadRoutes.ts` (FR-005)
- [X] T033 [US1] Endpoint `POST /api/v1/loads/{loadId}/confirm` (`VALIDATED`→`QUEUED`; rechaza si 0 válidos) en `backend/src/modules/loads/loadsRoutes.ts` (FR-006/007)
- [X] T034 [P] [US1] Página de portal: descargar plantilla, subir archivo y mostrar resumen de validación (es-MX) en `frontend/src/pages/PortalUpload.tsx`
- [X] T035 [P] [US1] Página de historial/estado de las cargas propias del usuario-farmacia en `frontend/src/pages/MyLoads.tsx`

**Checkpoint**: US1 funcional e independientemente probable (validación y confirmación sin despacho).

---

## Phase 4: User Story 2 - Despacho a Red Vidar con cola y control de ritmo (Priority: P1)

**Goal**: Las cargas confirmadas se despachan desde una cola a Red Vidar respetando 10 req/min global, con
idempotencia por carga, reintentos con backoff/jitter y máx 5 intentos; el resultado se guarda y el estado
transiciona a terminal.

**Independent Test**: Encolar una carga y verificar despacho exitoso (`CONFIRMED`), reintentos ante 429/502
(misma clave de idempotencia), no-reintento ante 4xx, y persistencia de resultado/intentos.

### Tests for User Story 2 (escribir primero, confirmar que fallan) ⚠️

- [X] T036 [P] [US2] Tests de contrato del cliente Red Vidar (2xx con result, result=null, errors[], 429+Retry-After, 502×5, 422) contra `nock` en `backend/tests/contract/redvidarClient.test.ts` (según contracts/redvidar-client.md). **Incluir la aserción FR-013a**: una carga con renglones válidos de varias farmacias produce **un solo** POST con **todos** los renglones válidos y **una sola** `X-Idempotency-Key` (nunca un POST por farmacia)
- [X] T037 [P] [US2] Test unitario de backoff exponencial con jitter y prioridad de `Retry-After` en `backend/tests/unit/backoff.test.ts`
- [X] T038 [P] [US2] Test unitario del limitador de ritmo global (≤ 10 solicitudes/60 s agregadas) en `backend/tests/unit/rateLimiter.test.ts` (SC-004)
- [X] T039 [P] [US2] Test de integración US2 (QUEUED→SENT→CONFIRMED / CONFIRMED_WITH_ERRORS / FAILED) en `backend/tests/integration/us2-dispatch.test.ts`

### Implementation for User Story 2

- [X] T040 [US2] Módulo de cola en PostgreSQL: enqueue, `claim` con `FOR UPDATE SKIP LOCKED`, `complete`/`fail`, reprogramación con `availableAt` en `backend/src/modules/queue/dispatchQueue.ts` (D1)
- [X] T041 [US2] Generar y persistir `idempotencyKey` (UUID v4) por carga al encolar, reusada en reintentos, integrado en `backend/src/modules/loads/loadsService.ts` (FR-015, D3)
- [X] T042 [US2] Cliente Red Vidar: envío con `X-Idempotency-Key`, credencial desde env, parseo de la envoltura con `zod` (`result` opcional/nullable) en `backend/src/modules/redvidar/redvidarClient.ts` (FR-016, D5, Principio V)
- [X] T043 [P] [US2] Utilidad de backoff exponencial con full jitter en `backend/src/lib/backoff.ts` (D4)
- [X] T044 [P] [US2] Limitador de ritmo global (concurrencia 1, ≥ 6 s entre envíos) en `backend/src/modules/dispatch/rateLimiter.ts` (D2)
- [X] T045 [US2] Servicio de despacho: ramificación por HTTP (2xx/4xx/429/502), reintentos (máx 5), persistencia de `DispatchAttempt` en `backend/src/modules/dispatch/dispatchService.ts` (FR-017/018)
- [X] T046 [US2] Persistir `RedVidarResult` y derivar el estado terminal de la carga (`CONFIRMED`/`CONFIRMED_WITH_ERRORS`/`FAILED`) en `backend/src/modules/dispatch/dispatchService.ts` (FR-019, SC-001)
- [X] T047 [US2] Proceso worker (loop de reclamo y despacho respetando ritmo) en `backend/src/worker.ts` (FR-013)

**Checkpoint**: US1 + US2 completan el flujo end-to-end del criterio de éxito (llega a Red Vidar o falla con razón).

---

## Phase 5: User Story 3 - Buzón y detalle para coordinación (Priority: P2)

**Goal**: Coordinación/admin ven la bandeja de todas las cargas con filtros y el detalle completo de cada carga
(incluye archivo original, conteos, razones por fila, resultado de Red Vidar e intentos).

**Independent Test**: Con cargas en varios estados, filtrar por cadena/estado y abrir el detalle; responder la
pregunta operativa en < 1 min (SC-002).

### Tests for User Story 3 (escribir primero, confirmar que fallan) ⚠️

- [X] T048 [P] [US3] Test de contrato `GET /api/v1/loads` con filtros (cadena, farmacia, estado, fecha) en `backend/tests/contract/loads.list.test.ts`
- [X] T049 [P] [US3] Test de contrato `GET /api/v1/loads/{loadId}` (LoadDetail) en `backend/tests/contract/loads.detail.test.ts`
- [X] T050 [P] [US3] Test de contrato `GET /api/v1/loads/{loadId}/original` (descarga + 403 fuera de alcance) en `backend/tests/contract/loads.original.test.ts`
- [X] T051 [P] [US3] Test de integración US3 (filtros + detalle + autorización por rol/cadena) en `backend/tests/integration/us3-mailbox.test.ts`

### Implementation for User Story 3

- [X] T052 [US3] Servicio de buzón: listado con filtros y paginación (con alcance por rol) en `backend/src/modules/mailbox/mailboxService.ts` (FR-023, FR-029)
- [X] T053 [US3] Endpoint `GET /api/v1/loads` en `backend/src/modules/mailbox/mailboxRoutes.ts`
- [X] T054 [US3] Endpoint `GET /api/v1/loads/{loadId}` (detalle con resultado e intentos) con autorización por rol/cadena en `backend/src/modules/loads/loadsRoutes.ts` (FR-024, FR-029)
- [X] T055 [US3] Endpoint `GET /api/v1/loads/{loadId}/original` (descarga del archivo/payload original) en `backend/src/modules/loads/loadsRoutes.ts`
- [X] T056 [P] [US3] Página de buzón con filtros y badges de estado (es-MX) en `frontend/src/pages/Mailbox.tsx`
- [X] T057 [P] [US3] Página de detalle de carga con descarga del original en `frontend/src/pages/LoadDetail.tsx`

**Checkpoint**: Visibilidad total operativa (segunda mitad del criterio de éxito).

---

## Phase 6: User Story 4 - Ingesta y consulta por API para integradores (Priority: P2)

**Goal**: Un integrador envía inventario con su clave de API (contrato espejo), obtiene el resumen síncrono con
los válidos ya auto-encolados y consulta el estado por identificador.

**Independent Test**: `POST` con clave válida (válidos+inválidos) → resumen + id; `GET` del id → detalle; clave
revocada → 401 sin crear carga.

### Tests for User Story 4 (escribir primero, confirmar que fallan) ⚠️

- [X] T058 [P] [US4] Test de contrato `POST /api/v1/integration/inventory` (auto-encolado, auth por clave de API) en `backend/tests/contract/integrationInventory.post.test.ts` (FR-010a)
- [X] T059 [P] [US4] Test de contrato `GET /api/v1/loads/{loadId}` vía clave de API (solo cargas propias) en `backend/tests/contract/integrationLoad.get.test.ts`
- [X] T060 [P] [US4] Test de integración US4 (válidos+inválidos → resumen+id; clave revocada → 401) en `backend/tests/integration/us4-api-ingest.test.ts`

### Implementation for User Story 4

- [X] T061 [US4] Endpoint `POST /api/v1/integration/inventory` (reusa validación/traducción; auto-encola los válidos con `authApiKey`) en `backend/src/modules/uploads/integrationRoutes.ts` (FR-008/009/010/010a)
- [X] T062 [US4] Autorización por clave de API en `GET /api/v1/loads/{loadId}` (restringe a cargas de su cadena) en `backend/src/modules/loads/loadsRoutes.ts` (FR-011, FR-029)

**Checkpoint**: Canal de integradores operativo, unificado con el portal en la misma cola.

---

## Phase 7: User Story 5 - Gestión administrativa (Priority: P3)

**Goal**: Admin gestiona cadenas, farmacias (tabla de equivalencias), usuarios y claves de API (generación con
prefijo de plataforma, visibles una sola vez; revocación inmediata).

**Independent Test**: Crear cadena/farmacia/usuario/clave; revocar la clave (deja de autenticar); código Red
Vidar duplicado → 409; alcance por rol correcto.

### Tests for User Story 5 (escribir primero, confirmar que fallan) ⚠️

- [X] T063 [P] [US5] Tests de contrato CRUD de cadenas y farmacias (incluye 409 por código duplicado) en `backend/tests/contract/chainsPharmacies.test.ts`
- [X] T064 [P] [US5] Tests de contrato de usuarios y de claves de API (generar/revocar) en `backend/tests/contract/usersApiKeys.test.ts`. **Incluir**: el alta de usuarios rechaza el rol `API_INTEGRATOR` (solo admin/coordinador/usuario-farmacia — FR-027); y **generar una clave nueva revoca automáticamente la `ACTIVE` previa** de la cadena, dejando a lo sumo una activa y registrando ambas acciones en `AuditLog` (FR-028)
- [X] T065 [P] [US5] Test de integración US5 (alta completa, revocación, unicidad, alcance por rol) en `backend/tests/integration/us5-admin.test.ts`

### Implementation for User Story 5

- [X] T066 [P] [US5] Módulo y endpoints de cadenas (CRUD) en `backend/src/modules/chains/` (FR-026)
- [X] T067 [P] [US5] Módulo y endpoints de farmacias con restricciones de unicidad (`chainId`+`chainInternalCode`, `redVidarPharmacyCode`) en `backend/src/modules/pharmacies/` (FR-026)
- [X] T068 [P] [US5] Módulo y endpoints de usuarios en `backend/src/modules/users/` — el alta admite **solo** los roles con inicio de sesión (`ADMIN`/`COORDINATOR`/`PHARMACY_USER`); NO se crean usuarios `API_INTEGRATOR` (el integrador solo existe como `ApiKey`) (FR-027)
- [X] T069 [US5] Módulo de claves de API: generar (prefijo de plataforma, mostrar una vez, hash bcrypt, `last4`) **revocando automáticamente en la misma transacción la clave `ACTIVE` previa de la cadena** (a lo sumo una activa por cadena), revocación manual, y registro en `AuditLog` de generación y revocación en `backend/src/modules/apikeys/` (FR-028, FR-030, Principio V)
- [X] T070 [P] [US5] Páginas de administración (cadenas, farmacias, usuarios, claves) en `frontend/src/pages/admin/`

**Checkpoint**: Configuración administrable completa; deja de depender solo de datos semilla.

---

## Phase 8: User Story 6 - Actividad por farmacia (Priority: P3)

**Goal**: Coordinación/admin consultan por farmacia la fecha de su última carga exitosa para detectar silencios.

**Independent Test**: Con cargas de distintas fechas, verificar la fecha de última carga exitosa por farmacia y
el caso "sin cargas exitosas".

### Tests for User Story 6 (escribir primero, confirmar que fallan) ⚠️

- [X] T071 [P] [US6] Test de contrato `GET /api/v1/pharmacies/activity` en `backend/tests/contract/pharmaciesActivity.test.ts`
- [X] T072 [P] [US6] Test de integración US6 (última carga exitosa por farmacia; caso sin cargas) en `backend/tests/integration/us6-activity.test.ts`

### Implementation for User Story 6

- [X] T073 [US6] Consulta de actividad por farmacia (última carga en `CONFIRMED`/`CONFIRMED_WITH_ERRORS`) en `backend/src/modules/mailbox/activityService.ts` (FR-025)
- [X] T074 [US6] Endpoint `GET /api/v1/pharmacies/activity` en `backend/src/modules/mailbox/mailboxRoutes.ts`
- [X] T075 [P] [US6] Página de actividad por farmacia en `frontend/src/pages/PharmacyActivity.tsx`

**Checkpoint**: Todas las historias de usuario funcionales de forma independiente.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Mejoras que afectan a varias historias.

- [X] T076 [P] Política de retención configurable y job de archivado/purga **auditable** (registra en `AuditLog`) en `backend/src/modules/loads/retentionService.ts` (FR-022a, SC-005)
- [X] T077 [P] Prueba de seguridad: verificar que `rv_pc_live_` NUNCA aparece en respuestas de la API ni en logs en `backend/tests/integration/security-credential.test.ts` (SC-009, Principio V)
- [X] T078 [P] Prueba de desempeño: validación ≥ ~5,000 renglones/segundo y resumen < 30 s en `backend/tests/integration/perf-validation.test.ts` (SC-008)
- [X] T079 [P] Documentación en es-MX (`README.md`) y ejecución de la validación de `quickstart.md`
- [X] T080 Limpieza de código y refactor de duplicaciones entre módulos (Principio IX)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — inicia de inmediato.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias.
- **User Stories (Phase 3+)**: todas dependen de Foundational.
  - US1 (P1) y US2 (P1) primero; US2 consume cargas producidas por US1 (integración end-to-end), pero su lógica de
    cola/despacho es probable con cargas fabricadas en test.
  - US3 (P2) y US4 (P2) dependen de la existencia de cargas (US1/US2) pero son probables con datos fabricados.
  - US5 (P3) y US6 (P3) son en gran medida independientes; US6 consume el estado de cargas.
- **Polish (Phase 9)**: depende de las historias deseadas completas.

### User Story Dependencies

- **US1 (P1)**: solo Foundational. Base del MVP.
- **US2 (P1)**: Foundational; reusa `loadsService` de US1 para encolar, pero su suite corre con cargas de prueba.
- **US3 (P2)**: Foundational; muestra datos de US1/US2 (probable con datos fabricados).
- **US4 (P2)**: Foundational; **reusa** los módulos `validation`/`translation` (US1) y la cola (US2).
- **US5 (P3)**: Foundational; independiente (crea los datos que en fases previas venían del seed).
- **US6 (P3)**: Foundational; consume el estado terminal de cargas.

### Within Each User Story

- Los tests se escriben y DEBEN fallar antes de la implementación (Principio II).
- Modelos/módulos base → servicios → endpoints → UI.
- Historia completa antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- Todo el Setup marcado [P] puede correr en paralelo tras T001–T002.
- En Foundational, T012/T013/T019/T020 marcados [P] son paralelos.
- Dentro de cada historia, **todos los tests [P]** pueden escribirse en paralelo, igual que módulos en archivos
  distintos (p. ej. T027/T028; T043/T044; T066/T067/T068; páginas de frontend).
- Con equipo, tras Foundational: US1 y US2 en paralelo (con contratos acordados), luego US3/US4, luego US5/US6.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 (escribir juntos, confirmar que fallan):
Task: "Test de contrato GET /inventory/template en backend/tests/contract/template.get.test.ts"
Task: "Test de contrato POST /inventory/portal-uploads en backend/tests/contract/portalUpload.post.test.ts"
Task: "Tests unitarios de validación en backend/tests/unit/validation.test.ts"
Task: "Tests unitarios de traducción en backend/tests/unit/translation.test.ts"

# Módulos base de US1 en paralelo:
Task: "Módulo de validación en backend/src/modules/validation/validateRows.ts"
Task: "Módulo de traducción en backend/src/modules/translation/translatePharmacyCode.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (BLOQUEA todo).
3. Completar Phase 3 (US1) y Phase 4 (US2) → **cumple el criterio de éxito end-to-end**: una carga entra por
   portal, se valida, se despacha a Red Vidar (o se marca fallida con razón) y su resultado queda registrado.
4. **PARAR y VALIDAR** con los escenarios de quickstart.md (US1 + US2).

> Nota de alcance: el MVP mínimo demostrable es US1 sola (validación + confirmación sin envío), pero el criterio de
> éxito del negocio requiere también US2. Por eso el MVP recomendado son ambas P1.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. + US1 + US2 → flujo end-to-end (MVP).
3. + US3 → visibilidad para coordinación.
4. + US4 → canal de integradores.
5. + US5 → gestión administrable.
6. + US6 → vigilancia de silencios.
7. + Polish → retención, seguridad, desempeño, docs.

### Parallel Team Strategy

Tras Foundational: un par de personas en US1+US2 (P1), luego repartir US3/US4 (P2) y US5/US6 (P3) por developer,
manteniendo cada historia independientemente probable.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] mapea cada tarea a su historia para trazabilidad.
- Verificar que los tests fallan antes de implementar (Principio II — NO NEGOCIABLE).
- Commit tras cada tarea o grupo lógico; textos de UI/errores/documentación en es-MX (Principio III).
- La credencial `rv_pc_live_` solo en env del backend, nunca en logs/respuestas/frontend (Principio V, FR-030).
