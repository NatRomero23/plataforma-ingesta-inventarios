# Research: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Feature**: `001-pharma-inventory-ingest` | **Date**: 2026-07-02

Resolución de decisiones técnicas de la Fase 0. Todas las decisiones respetan el stack fijo (Principio IV) y los
principios de la constitución v1.1.0. No quedan marcadores NEEDS CLARIFICATION.

---

## D1. Mecanismo de la cola de despacho

- **Decision**: Cola respaldada en **PostgreSQL** con una tabla `dispatch_job` y reclamo mediante
  `SELECT ... FOR UPDATE SKIP LOCKED` desde el proceso worker.
- **Rationale**: El Principio IV exige justificar cualquier infraestructura nueva. PostgreSQL ya es parte del
  stack; `FOR UPDATE SKIP LOCKED` es un patrón maduro y transaccional para colas de trabajo que da atomicidad,
  reintentos y visibilidad (los trabajos son filas consultables, alineado con la trazabilidad del Principio VII).
  Es la alternativa más simple que satisface el Principio VI (Principio IX, YAGNI).
- **Alternatives considered**:
  - *Redis + BullMQ*: robusto y con reintentos integrados, pero agrega un componente de infraestructura y una
    dependencia mayor no justificada dado el bajo volumen (acotado a 10 req/min). Rechazado por Principio IV/IX.
  - *Cola en memoria del proceso*: se pierde ante reinicios; viola la trazabilidad y la durabilidad. Rechazado.

## D2. Control de ritmo global (10 req/min, una sola credencial)

- **Decision**: **Un único proceso worker** de despacho con un **limitador de ritmo global** tipo *leaky bucket*
  persistido/verificado contra una marca de tiempo en la tabla de estado del despachador; la concurrencia de
  envío a Red Vidar es 1 y el intervalo mínimo entre envíos es ≥ 6 s (10/min).
- **Rationale**: La clarificación Q1 fijó el límite como **global único** (una credencial de Red Vidar). Un solo
  worker con concurrencia 1 hace trivial garantizar el límite agregado y respetar `Retry-After` sin coordinación
  distribuida. Mantiene el diseño simple (Principio IX) y el cumplimiento estricto del Principio VI.
- **Alternatives considered**:
  - *Varios workers con limitador distribuido (token bucket en PG/Redis)*: necesario solo si el límite fuera por
    cadena o el volumen alto; innecesario aquí. Rechazado por complejidad.
  - *Rate limiting por cadena*: contradice Q1. Rechazado.

## D3. Idempotencia hacia Red Vidar

- **Decision**: Generar un **UUID v4** como `X-Idempotency-Key` **por carga** al momento de encolarla, guardarlo
  en la carga y **reusarlo idéntico** en cada reintento de esa carga.
- **Rationale**: Principio VI/FR-015. Persistir la clave en la carga (no regenerarla por intento) garantiza que
  los reintentos ante 429/502 no dupliquen inventario en Red Vidar. Una carga = un POST (clarificación Q2), así
  que una sola clave por carga es suficiente.
- **Alternatives considered**: Clave por intento (rompe la idempotencia); clave por farmacia (no aplica, un POST
  por carga). Rechazadas.

## D4. Reintentos, backoff y ramificación por estado HTTP

- **Decision**: Ramificación exacta del Principio VI/FR-017–018:
  - `2xx` → éxito (deserializar envoltura, derivar estado).
  - `400/401/422` → fallo **sin** reintento; carga a `fallida` con razón.
  - `429` → esperar al menos `Retry-After` y reintentar (cuenta como intento).
  - `502` (y errores de red/timeout transitorios) → **backoff exponencial con jitter**, reintentar.
  - Máx **5 intentos**; agotados → `fallida` con la razón del último fallo.
  - Backoff: `base * 2^(intento-1)` acotado por un techo, con jitter aleatorio (full jitter). `Retry-After`, si
    está presente, tiene prioridad sobre el backoff calculado.
- **Rationale**: Cumplimiento literal del contrato externo; el full jitter evita sincronización de reintentos.
- **Alternatives considered**: Reintentar 4xx (contradice el contrato); backoff sin jitter (riesgo de
  thundering herd, aunque bajo con un solo worker). Rechazados.

## D5. Deserialización de la envoltura de Red Vidar

- **Decision**: Esquema `zod` para `{ webhookEventId, processingStatus, status, result }` con `result` **opcional
  y nullable**. El estado terminal de la carga se deriva del código HTTP **y** de los campos presentes:
  `2xx` sin errores por fila → `confirmada`; `2xx` con `errors[]`/`unknownPharmacyCodes[]` → `confirmada con
  errores`; no-2xx no recuperable o intentos agotados → `fallida`.
- **Rationale**: Principio VI/FR-016. El parseo nunca asume `result`; deriva el estado defensivamente.
- **Alternatives considered**: Confiar solo en el código HTTP (pierde el detalle por fila); confiar solo en
  `status` del cuerpo (puede faltar). Rechazados; se combinan ambos.

## D6. Almacenamiento del archivo/payload original

- **Decision**: Guardar el original en una columna `bytea` en PostgreSQL (`load.original_blob`) junto con
  `original_filename`, `content_type` y `byte_size`; para API, guardar el JSON crudo recibido.
- **Rationale**: Simplicidad y transaccionalidad (Principio IX): el original vive con la carga, respaldos y
  retención se gestionan en un solo lugar (Principio VII). Con límite de ~10 MB por carga el tamaño es manejable.
  La retención configurable (FR-022a) se implementa con metadatos y un job de archivado explícito y auditable.
- **Alternatives considered**: Almacenamiento de objetos (S3/minio) — mejor para archivos grandes o alto volumen,
  pero agrega infraestructura no justificada ahora (Principio IV); se deja como evolución futura documentada.

## D7. Parseo y generación de Excel

- **Decision**: `exceljs` en modo *streaming* para parsear la subida y para generar la plantilla descargable con
  columnas fijas: código de farmacia de la cadena, EAN, nombre del producto, stock.
- **Rationale**: Biblioteca de apoyo (no reemplaza el stack). Streaming permite validar archivos grandes (sin
  tope de renglones, límite por tamaño) dentro del objetivo de ~5,000 renglones/s (SC-008) sin cargar todo en
  memoria.
- **Alternatives considered**: `xlsx` (SheetJS) — válido, pero `exceljs` tiene mejor API de streaming y
  generación. Empate técnico; se elige `exceljs`.

## D8. Autenticación y autorización

- **Decision**: JWT (con `jsonwebtoken`) para sesiones del portal, con `role` y `chainId` en el claim; middleware
  `requireRole`. Contraseñas con `bcrypt`. Claves de API de integrador: cadena aleatoria con **prefijo propio de
  la plataforma** (p. ej. `emp_live_`), mostrada **una sola vez**, almacenada **solo como hash bcrypt** más un
  identificador/últimos dígitos para referencia; middleware `authApiKey` verifica el hash y el estado (activa/
  revocada).
- **Rationale**: Principio V. Los secretos (JWT secret, credencial Red Vidar) viven en env del backend; las claves
  de API nunca se guardan en claro. El prefijo de plataforma distingue inequívocamente de la clave `rv_pc_live_`
  de Red Vidar (FR-030).
- **Alternatives considered**: Sesiones server-side con cookie de sesión (válido; JWT elegido por simplicidad de
  API stateless y consumo por integradores). API keys en claro (viola Principio V). Rechazadas.

## D9. Aislamiento de la credencial de Red Vidar

- **Decision**: `RED_VIDAR_API_KEY` (`rv_pc_live_...`) se lee solo en `config/` del backend y se usa solo dentro
  del módulo `redvidar`. Un logger (`pino`) con **redacción** de encabezados sensibles evita que la credencial
  aparezca en logs. Ninguna respuesta de la API de la plataforma incluye la credencial ni la reexpone.
- **Rationale**: Principio V/FR-030/SC-009. Redacción en el logger + límite de módulo minimizan el radio de fuga.
- **Alternatives considered**: Gestor de secretos externo (Vault) — compatible a futuro; env var es suficiente y
  simple para esta fase.

## D10. Estrategia de validación local

- **Decision**: Validación por renglón con reglas explícitas (campos requeridos, `stock` entero ≥ 0, `ean` ≤ 20
  caracteres, `productName` no vacío, farmacia mapeada y registrada), acumulando errores por número de fila y
  agrupando farmacias no mapeadas. Se ejecuta **antes** de cualquier interacción con Red Vidar y **antes** de
  encolar (Principio VIII/FR-004–006, SC-006). Reglas compartidas entre portal y API (misma función).
- **Rationale**: Un solo módulo `validation` reutilizado por ambos canales garantiza consistencia (Principio IX) y
  que nada inválido consuma cupo de Red Vidar (Principio VIII).
- **Alternatives considered**: Validación distinta por canal (riesgo de divergencia). Rechazada.

---

## Resumen de dependencias añadidas (todas de apoyo, Principio IV)

| Dependencia | Uso | Justificación |
|-------------|-----|---------------|
| `zod` | Validación de payloads y de la envoltura de Red Vidar | Esquemas declarativos, no reemplaza el stack |
| `exceljs` | Parseo/generación de Excel | Requisito funcional del portal |
| `jsonwebtoken` | Emisión/verificación de JWT | Principio V |
| `bcrypt` | Hash de contraseñas y claves de API | Principio V |
| `pino` | Logs estructurados con redacción | Principio IX/V (observabilidad) |
| `uuid` | Claves de idempotencia v4 | Principio VI |

Ninguna introduce un framework, ORM, lenguaje ni motor de base de datos alterno. La cola vive en PostgreSQL; no se
agrega Redis ni un broker externo.
