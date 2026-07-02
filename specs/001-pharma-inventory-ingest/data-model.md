# Data Model: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Feature**: `001-pharma-inventory-ingest` | **Date**: 2026-07-02

Modelo de datos derivado de la spec (Key Entities + FRs). Los **identificadores están en inglés** (Principio III);
los textos de dominio visibles al usuario van en es-MX en la capa de aplicación. Persistencia en PostgreSQL vía
Prisma. Este documento describe entidades, campos, relaciones, reglas de validación y transiciones de estado; los
tipos exactos de Prisma se materializan en `backend/prisma/schema.prisma` durante la implementación.

---

## Enumeraciones

- **UserRole** (roles asignables a un `User` con inicio de sesión): `ADMIN` | `COORDINATOR` | `PHARMACY_USER`.
  El ámbito `API_INTEGRATOR` **no** es un `UserRole`: es un *scope* de autorización que otorga una `ApiKey` al
  autenticarse; no existe un `User` de integrador (ver `ApiKey`).
- **LoadOrigin**: `PORTAL` | `API`
- **LoadStatus**: `RECEIVED` → `VALIDATED` → `QUEUED` → `SENT` → (`CONFIRMED` | `CONFIRMED_WITH_ERRORS` | `FAILED`)
- **LoadRowStatus**: `VALID` | `REJECTED`
- **ApiKeyStatus**: `ACTIVE` | `REVOKED`
- **DispatchJobStatus**: `QUEUED` | `CLAIMED` | `DONE` | `FAILED`

Etiquetas es-MX (capa UI): recibida, validada, en cola, enviada, confirmada, confirmada con errores, fallida.

---

## Entidades

### Chain (Cadena)
Agrupador comercial de farmacias.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `name` | string | requerido, único |
| `createdAt` / `updatedAt` | timestamp | |

Relaciones: 1—N `Pharmacy`, 1—N `User`, 1—N `ApiKey` (a lo sumo una `ACTIVE`), 1—N `Load`.

### Pharmacy (Farmacia) — tabla de equivalencias ("traductor")
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `chainId` | UUID (FK→Chain) | requerido |
| `chainInternalCode` | string | requerido; **único por cadena** (`@@unique([chainId, chainInternalCode])`) |
| `redVidarPharmacyCode` | string \| null | `pharmacyCode` del contrato; una farmacia sin este código se trata como **no mapeada** |
| `name` | string | requerido |
| `isActive` | boolean | default true |
| `createdAt` / `updatedAt` | timestamp | |

Regla de identidad: el par (`chainId`, `chainInternalCode`) identifica de forma única una farmacia dentro de su
cadena. `redVidarPharmacyCode` es único donde no es nulo (`@@unique` parcial) para evitar colisiones de traducción.

### User (Persona usuaria)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `email` | string | requerido, único |
| `passwordHash` | string | **bcrypt** (Principio V); nunca en claro |
| `role` | UserRole | requerido; solo `ADMIN` \| `COORDINATOR` \| `PHARMACY_USER` |
| `chainId` | UUID (FK→Chain) \| null | requerido si `role` = `PHARMACY_USER`; opcional/null para `ADMIN`/`COORDINATOR` |
| `isActive` | boolean | default true |
| `createdAt` / `updatedAt` | timestamp | |

Nota: **no existe un `User` de integrador**. El acceso `integrador-api` se representa únicamente con una `ApiKey`
por cadena y no tiene contraseña; el middleware `authApiKey` establece el *scope* `API_INTEGRATOR` en el contexto
de la petición a partir de la clave. El alta de usuarios (FR-027) solo admite los tres roles con inicio de sesión.

### ApiKey (Clave de API de integrador)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `chainId` | UUID (FK→Chain) | requerido; **una `ACTIVE` por cadena** |
| `prefix` | string | prefijo propio de la plataforma (p. ej. `emp_live_`); NUNCA `rv_pc_live_` |
| `keyHash` | string | **bcrypt** del secreto; el secreto en claro se muestra **una sola vez** al generarla |
| `last4` | string | últimos 4 caracteres para referencia en UI |
| `status` | ApiKeyStatus | `ACTIVE`/`REVOKED` |
| `createdAt` / `revokedAt` | timestamp | |

Reglas:
- La revocación es inmediata (FR-028); una clave `REVOKED` no autentica (FR-012).
- **A lo sumo una clave `ACTIVE` por cadena** (invariante). Generar una clave nueva revoca automáticamente la
  `ACTIVE` previa de esa cadena dentro de la **misma transacción**, y registra en `AuditLog` tanto la generación
  como la revocación automática (FR-028). Se recomienda un índice único parcial sobre (`chainId`) donde
  `status = ACTIVE` para hacer cumplir el invariante a nivel de base de datos.

### Load (Carga)
Una entrega de inventario por portal o API. Es el agregado central de trazabilidad (Principio VII).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | identificador consultable por API/buzón |
| `chainId` | UUID (FK→Chain) | requerido |
| `origin` | LoadOrigin | `PORTAL`/`API` (FR-022) |
| `uploaderUserId` | UUID (FK→User) \| null | quién la subió (portal) |
| `apiKeyId` | UUID (FK→ApiKey) \| null | clave usada (API) |
| `sourceLabel` | string \| null | etiqueta de origen del contrato (API) |
| `status` | LoadStatus | ver transiciones abajo |
| `idempotencyKey` | UUID | v4; generada al encolar; **reusada** en reintentos (FR-015) |
| `originalBlob` | bytes (`bytea`) | archivo Excel o JSON crudo tal como se recibió (FR-021) |
| `originalFilename` | string \| null | nombre del archivo (portal) |
| `contentType` | string | p. ej. `application/vnd.openxmlformats...` o `application/json` |
| `byteSize` | int | tamaño; validado contra el límite (~10 MB, FR-002a) |
| `totalRows` | int | total de renglones parseados |
| `validRows` | int | renglones válidos |
| `rejectedRows` | int | renglones rechazados |
| `unmappedPharmacyCount` | int | renglones de farmacias no mapeadas |
| `retentionPolicyId` | UUID (FK) \| null | política de retención aplicada (FR-022a) |
| `archivedAt` | timestamp \| null | si fue archivada/purgada por política explícita |
| `createdAt` / `updatedAt` | timestamp | |

Relaciones: 1—N `LoadRow`, 1—N `DispatchAttempt`, 0/1 `RedVidarResult`, 0/1 `DispatchJob`.

### LoadRow (Renglón de carga)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `loadId` | UUID (FK→Load) | requerido |
| `rowNumber` | int | número de fila del archivo/índice del ítem (para reporte de errores) |
| `chainPharmacyCode` | string | código de farmacia de la cadena (crudo) |
| `redVidarPharmacyCode` | string \| null | traducido; null si la farmacia no está mapeada |
| `ean` | string | ≤ 20 caracteres |
| `productName` | string | no vacío |
| `stock` | int | entero ≥ 0 |
| `status` | LoadRowStatus | `VALID`/`REJECTED` |
| `rejectionReason` | string \| null | razón en es-MX si `REJECTED` (FR-005, SC-003) |

### DispatchAttempt (Intento de envío)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `loadId` | UUID (FK→Load) | requerido |
| `attemptNumber` | int | 1..5 (FR-018) |
| `startedAt` / `finishedAt` | timestamp | marcas de tiempo (FR-024) |
| `httpStatus` | int \| null | código devuelto por Red Vidar |
| `webhookEventId` | string \| null | de la envoltura de respuesta |
| `outcome` | string | `SUCCESS` \| `RETRYABLE` \| `NON_RETRYABLE` \| `NETWORK_ERROR` |
| `retryAfterMs` | int \| null | si Red Vidar devolvió `Retry-After` |
| `errorReason` | string \| null | razón de fallo (es-MX en UI) |

### RedVidarResult (Resultado de Red Vidar)
Asociado a la carga tras un envío exitoso (2xx). Refleja el `result` de la envoltura (opcional/nullable).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `loadId` | UUID (FK→Load, único) | requerido |
| `webhookEventId` | string | de la envoltura |
| `processingStatus` | string | de la envoltura |
| `status` | string | de la envoltura |
| `entriesInserted` | int \| null | |
| `medicationsInserted` | int \| null | |
| `medicationsUpdated` | int \| null | |
| `unknownPharmacyCodes` | string[] | códigos que Red Vidar no reconoció |
| `rowErrors` | JSON | errores por fila reportados por Red Vidar |
| `rawResponse` | JSON | envoltura completa cruda (trazabilidad) |
| `receivedAt` | timestamp | |

### DispatchJob (Trabajo de la cola — cola en PostgreSQL)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `loadId` | UUID (FK→Load, único) | requerido |
| `status` | DispatchJobStatus | `QUEUED`/`CLAIMED`/`DONE`/`FAILED` |
| `attempts` | int | contador de intentos consumidos |
| `availableAt` | timestamp | no reclamar antes de esta hora (backoff / Retry-After) |
| `lockedAt` | timestamp \| null | reclamo por el worker (`FOR UPDATE SKIP LOCKED`) |
| `lastError` | string \| null | |
| `createdAt` / `updatedAt` | timestamp | |

### RetentionPolicy (Política de retención — configurable por admin, FR-022a)
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | UUID (PK) | |
| `name` | string | |
| `mode` | string | `INDEFINITE` (default) \| `ARCHIVE_AFTER` \| `PURGE_AFTER` |
| `afterDays` | int \| null | requerido si `mode` ≠ `INDEFINITE` |
| `isDefault` | boolean | el default es `INDEFINITE` |
| `createdAt` / `updatedAt` | timestamp | |

### AuditLog (Registro auditable)
Para acciones sensibles no silenciosas: revocación de claves, archivado/purga por retención (FR-022a), cambios de
rol. Campos: `id`, `actorUserId`, `action`, `entityType`, `entityId`, `detail` (JSON), `createdAt`.

---

## Transiciones de estado de `Load`

```text
RECEIVED ──(validación local completa)──► VALIDATED
VALIDATED ──(confirmación portal FR-006 / auto-encolado API FR-010a)──► QUEUED
   │            (si 0 renglones válidos: permanece VALIDATED, sin envío — FR-007/edge case)
QUEUED ──(worker reclama y envía)──► SENT
SENT ──(2xx, sin errores por fila)──────────────────► CONFIRMED
SENT ──(2xx, con errors[]/unknownPharmacyCodes)─────► CONFIRMED_WITH_ERRORS
SENT ──(4xx no recuperable | 5 intentos agotados)──► FAILED
```

Reglas de transición:
- **RECEIVED→VALIDATED**: siempre tras parsear y validar; nunca se salta la validación (Principio VIII).
- **VALIDATED→QUEUED**: solo con ≥ 1 renglón válido. Portal requiere confirmación humana (FR-006); API auto-encola
  (FR-010a). Al encolar se genera `idempotencyKey` y se crea el `DispatchJob`.
- **QUEUED→SENT**: el worker reclama el job respetando `availableAt` y el límite global de ritmo (D2). Cada envío
  crea un `DispatchAttempt`.
- **429/502/red**: el `DispatchJob` vuelve a `QUEUED` con `availableAt` futuro (Retry-After o backoff+jitter) e
  incrementa `attempts`, hasta 5 (FR-017/018). No es un estado terminal de `Load` (sigue en `SENT`/reintento).
- **Terminal**: `CONFIRMED` / `CONFIRMED_WITH_ERRORS` / `FAILED`. Al alcanzarlo, `DispatchJob`→`DONE`/`FAILED`
  (SC-001: nunca queda atrapada).

## Reglas de validación local (por renglón — FR-004, Principio VIII)

1. Campos requeridos presentes: `chainPharmacyCode`, `ean`, `productName`, `stock`.
2. `stock` es entero y ≥ 0 → si no, `REJECTED` con razón "stock debe ser entero mayor o igual a 0".
3. `ean` ≤ 20 caracteres → si no, `REJECTED` con razón correspondiente.
4. `productName` no vacío → si no, `REJECTED`.
5. Farmacia **registrada y mapeada**: existe `Pharmacy` con (`chainId`, `chainInternalCode`) y con
   `redVidarPharmacyCode` no nulo → si no existe o no tiene código Red Vidar, se cuenta como **farmacia no
   mapeada** (no `VALID`, no consume envío).
6. Solo los renglones `VALID` avanzan al encolado (FR-006); los demás se conservan con su razón (Principio VII).

## Notas de índices y desempeño

- `Load`: índices por (`chainId`, `createdAt`) y por `status` para el buzón con filtros (FR-023).
- Vista por farmacia (FR-025): última carga exitosa = `max(createdAt)` de `Load` en estado `CONFIRMED`/
  `CONFIRMED_WITH_ERRORS` unida por `LoadRow.redVidarPharmacyCode`/farmacia.
- `DispatchJob`: índice por (`status`, `availableAt`) para el reclamo eficiente con `SKIP LOCKED`.
