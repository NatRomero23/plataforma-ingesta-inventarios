# Implementation Plan: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Branch**: `001-pharma-inventory-ingest` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-pharma-inventory-ingest/spec.md`

## Summary

Plataforma web intermediaria que recibe inventarios de cadenas de farmacias (por portal subiendo Excel o por
API), los valida localmente, traduce los códigos de farmacia de la cadena a `pharmacyCode` de Red Vidar, y los
despacha a la API de Red Vidar desde una cola interna con control de ritmo global (10 req/min), idempotencia,
reintentos con backoff y trazabilidad total de cada carga. Coordinación y farmacias obtienen visibilidad completa
del estado y detalle de cada carga desde un buzón.

**Enfoque técnico**: aplicación web de dos partes (frontend React+Vite, backend Node.js+Express) sobre PostgreSQL
con Prisma, conforme al stack fijo de la constitución. La cola de despacho se implementa **respaldada en
PostgreSQL** (patrón `FOR UPDATE SKIP LOCKED`) para evitar introducir infraestructura nueva (Redis) sin
justificación. Un proceso worker despacha las cargas hacia Red Vidar aplicando un limitador de ritmo **global
único** (una sola credencial de Red Vidar). La validación local ocurre antes de cualquier llamada externa.

## Technical Context

**Language/Version**: TypeScript en Node.js 20 LTS (backend) y React 18 + TypeScript (frontend con Vite).

**Primary Dependencies**:
- Backend: Express, Prisma (ORM), `zod` (validación de esquemas), `exceljs` (parseo/generación de Excel),
  `jsonwebtoken` (JWT), `bcrypt` (hash de contraseñas y de claves de API), `undici`/`fetch` nativo (cliente HTTP
  hacia Red Vidar), `pino` (logs estructurados), `uuid` (claves de idempotencia).
- Frontend: React, Vite, React Router, cliente HTTP (`fetch`), biblioteca de tabla/componentes ligera.
- Todas son bibliotecas de apoyo; NO reemplazan los pilares del stack fijo (React+Vite / Express / PostgreSQL+
  Prisma). Ver justificación en Constitution Check y en `research.md`.

**Storage**: PostgreSQL (una base). Incluye tablas de dominio, tabla de trabajos de la cola de despacho y
almacenamiento del archivo/payload original (columna `bytea`; decisión y alternativas en `research.md`).

**Testing**: Vitest (unit) en backend y frontend; Supertest sobre la app Express para pruebas de contrato/
integración de la API; contrato del cliente Red Vidar probado contra un doble/servidor simulado (nock). TDD
obligatorio (Rojo → Verde → Refactor) conforme al Principio II.

**Target Platform**: Servidor Linux (backend + worker); navegadores modernos para el portal.

**Project Type**: Web application (frontend + backend) con un proceso worker de despacho.

**Performance Goals**:
- Validación local ≥ ~5,000 renglones/segundo; resumen de un archivo dentro del límite de tamaño (~10 MB) en
  < 30 s (SC-008).
- Despacho hacia Red Vidar: nunca exceder 10 solicitudes/min agregadas (límite global único, SC-004).

**Constraints**:
- Límite de tamaño de archivo/payload por defecto ~10 MB (sin tope de renglones) — configurable.
- La credencial `rv_pc_live_` vive solo en variables de entorno del backend; nunca en frontend, código, logs ni
  respuestas (Principio V, FR-030).
- Ritmo hacia Red Vidar: 10 req/min global; idempotencia por carga; máx 5 intentos; backoff exponencial con jitter;
  respetar `Retry-After` (Principio VI).
- Retención configurable por admin; default indefinido; purga solo explícita y auditable (FR-022a).

**Scale/Scope**: Decenas de cadenas, cientos de farmacias, cargas de hasta ~10 MB; volumen de despacho acotado por
el límite de 10 req/min de Red Vidar. 6 historias de usuario, 4 roles, ~35 requisitos funcionales.

## Constitution Check

*GATE: Debe pasar antes de la investigación de Fase 0. Re-verificar tras el diseño de Fase 1.*

Evaluación contra los 9 principios de la constitución v1.1.0:

| Principio | Gate | Estado |
|-----------|------|--------|
| I. Especificación primero | Existe spec aprobada y clarificada; el plan deriva de ella | ✅ PASA |
| II. Pruebas primero (NO NEGOCIABLE) | El plan y tasks imponen TDD (tests antes de impl., contract + integration) | ✅ PASA |
| III. Idioma y nomenclatura | UI/errores/docs en es-MX; identificadores en inglés | ✅ PASA |
| IV. Stack tecnológico fijo | React+Vite / Express / PostgreSQL+Prisma; cola en PG (no Redis); libs solo de apoyo | ✅ PASA |
| V. Seguridad y credenciales | JWT+roles; `rv_pc_live_` solo en env del backend; API keys y contraseñas con bcrypt | ✅ PASA |
| VI. Contrato Red Vidar | Idempotencia, envoltura, ramificación HTTP, ritmo desde cola, pruebas de contrato | ✅ PASA |
| VII. Trazabilidad total | Se conserva original, validación, cada intento con webhookEventId y conteos | ✅ PASA |
| VIII. Validación local primero | Ningún renglón inválido consume llamadas a Red Vidar | ✅ PASA |
| IX. Modular/simple/observable | Módulos con interfaces claras; logs estructurados; diseño más simple (cola en PG) | ✅ PASA |

**Resultado inicial**: PASA sin violaciones. La sección Complexity Tracking queda vacía.

**Notas de decisión que evitan violaciones**:
- **Cola en PostgreSQL, no Redis**: el Principio IV exige justificar infraestructura nueva. Redis sería un
  componente adicional; una cola respaldada en PostgreSQL con `FOR UPDATE SKIP LOCKED` satisface el requisito
  (Principio VI) con el stack existente y es la alternativa más simple (Principio IX). Detalle en `research.md`.
- **Proceso worker separado**: el Principio VI prohíbe despachar directo desde la petición del usuario; un worker
  que consume la cola es requisito del contrato, no complejidad injustificada.

### Re-evaluación post-diseño (Fase 1)

Tras generar `data-model.md`, `contracts/` y `quickstart.md`: el diseño mantiene el cumplimiento — el modelo de
datos conserva original/validación/intentos/conteos (VII), el contrato de la API de la plataforma no expone la
credencial de Red Vidar (V), y el flujo valida localmente antes de encolar (VIII). **Sin nuevas violaciones.**

## Project Structure

### Documentation (this feature)

```text
specs/001-pharma-inventory-ingest/
├── plan.md              # Este archivo (/speckit-plan)
├── spec.md              # Especificación (con Clarifications)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/           # Fase 1 (/speckit-plan)
│   ├── platform-api.openapi.yaml   # API que expone la plataforma (portal + integradores)
│   └── redvidar-client.md          # Contrato del cliente hacia Red Vidar (consumido)
├── checklists/
│   └── requirements.md  # Checklist de calidad de la spec
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Aplicación web con backend + worker + frontend en un monorepo:

```text
backend/
├── prisma/
│   ├── schema.prisma            # Modelo de datos (ver data-model.md)
│   └── migrations/
├── src/
│   ├── app.ts                   # Ensamblado de Express (rutas, middleware)
│   ├── server.ts                # Arranque del servidor HTTP
│   ├── worker.ts                # Proceso worker de despacho a Red Vidar
│   ├── config/                  # Carga de env (incluye RED_VIDAR_API_KEY), validación de config
│   ├── middleware/              # authJwt, authApiKey, requireRole, errorHandler, requestLogger
│   ├── modules/
│   │   ├── auth/                # login, emisión/verificación de JWT
│   │   ├── chains/              # CRUD cadenas
│   │   ├── pharmacies/          # CRUD farmacias + tabla de equivalencias (traductor)
│   │   ├── users/               # CRUD usuarios y roles
│   │   ├── apikeys/             # generación/revocación de claves de API (prefijo plataforma)
│   │   ├── uploads/             # ingesta portal (Excel) y API; plantilla descargable
│   │   ├── validation/          # reglas de validación local por renglón
│   │   ├── translation/         # traducción código cadena → pharmacyCode Red Vidar
│   │   ├── loads/               # ciclo de vida de cargas, estados, detalle
│   │   ├── queue/               # cola en PostgreSQL (enqueue, claim, complete/fail)
│   │   ├── dispatch/            # limitador de ritmo global, reintentos/backoff
│   │   ├── redvidar/            # cliente HTTP hacia Red Vidar (envoltura, idempotencia)
│   │   └── mailbox/             # buzón: listado con filtros, vista por farmacia
│   └── lib/                     # utilidades compartidas (uuid, backoff, logger)
└── tests/
    ├── contract/                # contrato de la API de la plataforma y del cliente Red Vidar
    ├── integration/             # journeys por historia de usuario (US1..US6)
    └── unit/                    # validación, traducción, backoff, rate limiter

frontend/
├── src/
│   ├── main.tsx
│   ├── router.tsx
│   ├── components/              # tablas, formularios, badges de estado (textos es-MX)
│   ├── pages/                   # Login, Portal (subir/plantilla/historial), Buzón, Detalle, Admin
│   ├── services/                # cliente de la API de la plataforma
│   └── i18n/                    # cadenas de UI en es-MX
└── tests/
    ├── integration/
    └── unit/
```

**Structure Decision**: Se adopta la estructura de **aplicación web** (Opción 2) con un proceso **worker**
adicional para el despacho. El backend expone la API de la plataforma (portal + integradores) y el worker consume
la cola en PostgreSQL. El frontend es el portal para admin, coordinación y usuario-farmacia. Los integradores solo
consumen la API. Esta separación respeta el Principio IX (módulos con propósito único) y el Principio VI (despacho
desde cola, no desde la petición).

## Complexity Tracking

> Sin violaciones al Constitution Check. No se requiere justificar complejidad adicional.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (ninguna) | — | — |
