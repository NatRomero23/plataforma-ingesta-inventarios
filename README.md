# Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

Plataforma web intermediaria que recibe inventarios de cadenas de farmacias (por portal subiendo Excel o por
API), los valida localmente, traduce los códigos de farmacia al contrato de Red Vidar, los despacha con control
de ritmo, y da visibilidad total del estado y detalle de cada carga.

> Documentación de diseño: [`specs/001-pharma-inventory-ingest/`](specs/001-pharma-inventory-ingest/) ·
> Constitución del proyecto: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)

## Arquitectura

Monorepo con:

- **`backend/`** — API Node.js + Express + Prisma (PostgreSQL) y un proceso **worker** de despacho.
- **`frontend/`** — Portal React + Vite (es-MX).

La cola de despacho vive en PostgreSQL (`FOR UPDATE SKIP LOCKED`); el worker despacha a Red Vidar respetando un
límite **global** de 10 solicitudes/minuto, con idempotencia por carga, reintentos con backoff+jitter (máx. 5) y
trazabilidad completa.

## Requisitos

- Node.js 20+ y PostgreSQL 15+.

## Configuración y ejecución

```bash
# Backend
cd backend
cp .env.example .env          # completar DATABASE_URL, JWT_SECRET, RED_VIDAR_API_KEY, RED_VIDAR_BASE_URL
npm install
npm run prisma:migrate        # crea el esquema en PostgreSQL
npm run seed                  # datos de demo (usuario: farmacia@demo.mx / demo1234; admin@demo.mx / demo1234)
npm run dev                   # API en http://localhost:3001
npm run worker                # worker de despacho (otra terminal)

# Frontend
cd ../frontend
npm install
npm run dev                   # portal en http://localhost:5173
```

## Pruebas

```bash
cd backend
npm test                      # unitarias + contrato (sin BD)
RUN_DB_TESTS=1 npm test       # incluye integración/contrato con PostgreSQL (requiere DATABASE_URL de prueba migrada)
```

- **Sin BD** (corren siempre): validación, traducción, backoff, limitador de ritmo, contrato del cliente Red
  Vidar (`nock`), retención (decisión), seguridad de credencial (SC-009) y desempeño de validación (SC-008).
- **Con BD** (`RUN_DB_TESTS=1`): journeys de US1–US6 vía Supertest.

## Seguridad (Principio V)

La credencial de Red Vidar (`rv_pc_live_…`) vive **solo** en `RED_VIDAR_API_KEY` del backend. Nunca se expone en
el frontend, en respuestas de la API ni en logs (el logger redacta encabezados sensibles). Los integradores usan
una clave de API **propia de la plataforma** (prefijo `emp_live_`), almacenada solo como hash bcrypt.

## Estado

Feature `001-pharma-inventory-ingest`: 6 historias de usuario implementadas (US1–US6) + fase de calidad. Ver el
avance detallado en [`specs/001-pharma-inventory-ingest/tasks.md`](specs/001-pharma-inventory-ingest/tasks.md).
