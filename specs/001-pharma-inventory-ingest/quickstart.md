# Quickstart: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Feature**: `001-pharma-inventory-ingest` | **Date**: 2026-07-02

Guía de validación end-to-end. Prueba que la funcionalidad funciona de punta a punta; los detalles de
implementación viven en `tasks.md` y en el código. Los contratos están en [`contracts/`](./contracts/) y el
modelo en [`data-model.md`](./data-model.md).

## Prerrequisitos

- Node.js 20 LTS y PostgreSQL 15+ disponibles.
- Variables de entorno del backend (nunca en frontend ni en el repo — Principio V):
  - `DATABASE_URL` — cadena de conexión a PostgreSQL.
  - `JWT_SECRET` — secreto para firmar JWT.
  - `RED_VIDAR_API_KEY` — credencial `rv_pc_live_...` (solo aquí; redactada en logs).
  - `RED_VIDAR_BASE_URL` — URL base de la API de Red Vidar (o del servidor simulado en pruebas).
  - `MAX_UPLOAD_BYTES` — límite de tamaño de carga (default ~10 MB).

## Setup

```bash
# Backend
cd backend
npm install
npx prisma migrate dev          # crea el esquema (ver data-model.md)
npm run seed                    # datos semilla: 1 cadena, farmacias mapeadas, 1 usuario-farmacia, 1 clave de API

# Frontend
cd ../frontend
npm install
```

## Arranque

```bash
# En terminales separadas:
cd backend && npm run dev        # API Express (puerto por env)
cd backend && npm run worker     # worker de despacho a Red Vidar (cola en PostgreSQL)
cd frontend && npm run dev        # portal (Vite)
```

## Comandos de prueba

```bash
cd backend && npm test            # Vitest: unit + contrato + integración
cd frontend && npm test           # Vitest: unit + integración de UI
```

Las pruebas de contrato del cliente Red Vidar corren contra un servidor simulado (nock) siguiendo los casos de
[`contracts/redvidar-client.md`](./contracts/redvidar-client.md). Ninguna prueba usa la credencial real.

---

## Escenarios de validación (mapeados a historias de usuario)

### US1 — Carga por portal con validación previa
1. Inicia sesión como usuario-farmacia; descarga la plantilla desde el portal.
2. Sube un Excel con renglones válidos, uno con `stock = -3`, y uno de una farmacia no mapeada.
3. **Esperado**: el resumen muestra el conteo de válidos, el renglón con error con su fila y razón en es-MX, y la
   farmacia no mapeada agrupada. La carga queda en estado `VALIDATED` y su archivo original queda almacenado.
4. Sube un archivo sin las columnas requeridas → **Esperado**: rechazo completo (400) con mensaje en es-MX.

### US2 — Despacho a Red Vidar con ritmo, idempotencia y reintentos
1. Confirma la carga válida de US1 → transiciona a `QUEUED` y aparece un `DispatchJob`.
2. Con el servidor simulado devolviendo `2xx`, el worker despacha → **Esperado**: `CONFIRMED`, `RedVidarResult`
   con `webhookEventId` y conteos; `DispatchJob` → `DONE`.
3. Simula `429` con `Retry-After` → **Esperado**: espera ≥ ese tiempo, reintenta con la **misma**
   `X-Idempotency-Key`.
4. Simula `502` repetido → **Esperado**: `FAILED` tras 5 intentos, con la razón del último fallo.
5. Simula `422` → **Esperado**: `FAILED` sin reintento.
6. Encola muchas cargas → **Esperado**: el flujo agregado nunca excede 10 solicitudes en 60 s (SC-004).

### US3 — Buzón y detalle para coordinación
1. Inicia sesión como coordinación; abre el buzón y filtra por cadena + estado `FAILED`.
2. **Esperado**: solo cargas fallidas de esa cadena. Abre el detalle → totales/válidos/rechazados, razón por fila,
   `webhookEventId`, intentos con timestamps, y descarga del archivo original.
3. Responde "¿la carga de ayer de la sucursal X llegó completa?" filtrando por farmacia + fecha en < 1 min (SC-002).

### US4 — Ingesta y consulta por API
1. `POST /api/v1/integration/inventory` con `X-API-Key` válida y un payload espejo (válidos + inválidos).
2. **Esperado**: respuesta síncrona con el resumen (válidos ya **auto-encolados**) y `loadId` (FR-010a).
3. `GET /api/v1/loads/{loadId}` con la clave → **Esperado**: estado y detalle equivalentes al buzón.
4. Repite con una clave **revocada** → **Esperado**: `401`, sin crear carga.

### US5 — Gestión administrativa
1. Como admin: crea una cadena, agrega farmacias con código interno + código Red Vidar, crea usuario-farmacia,
   genera una clave de API (visible **una sola vez**, con prefijo de plataforma).
2. Revoca la clave → **Esperado**: deja de autenticar de inmediato.
3. **Esperado**: un usuario-farmacia solo ve las cargas de su propia cadena; un código Red Vidar duplicado → `409`.

### US6 — Actividad por farmacia
1. `GET /api/v1/pharmacies/activity` → **Esperado**: por farmacia, la fecha de su última carga exitosa; las
   farmacias sin cargas exitosas se indican claramente.

## Verificación constitucional (rápida)

- **Principio V/SC-009**: buscar `rv_pc_live_` en respuestas de la API y en logs → 0 apariciones.
- **Principio VIII/SC-006**: los renglones inválidos no generan ninguna llamada al servidor simulado de Red Vidar.
- **Principio VII/SC-005**: toda carga en estado terminal conserva su archivo original recuperable.
