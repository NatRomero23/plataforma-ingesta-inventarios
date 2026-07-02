# Contrato del cliente hacia Red Vidar (consumido)

**Feature**: `001-pharma-inventory-ingest` | **Date**: 2026-07-02

Este documento define el contrato **externo obligatorio** que la plataforma consume al despachar cargas a la API
real de Red Vidar. Es la fuente de verdad para las pruebas de contrato del módulo `redvidar` (Principio VI). La
plataforma es el **consumer**; Red Vidar es el **producer**.

> ⚠️ La credencial `rv_pc_live_...` se lee solo de la variable de entorno `RED_VIDAR_API_KEY` en el backend y se
> usa solo en este módulo. NUNCA se registra en logs (redacción en el logger), ni se expone en respuestas de la
> plataforma, ni se envía al frontend (Principio V, FR-030, SC-009).

## Envío de inventario (POST)

- **Método/estructura**: `POST` al endpoint de ingesta de Red Vidar.
- **Autenticación**: encabezado con la credencial `rv_pc_live_...` (formato según Red Vidar).
- **Encabezado obligatorio**: `X-Idempotency-Key: <UUID v4>` — **uno por carga**, generado al encolar y
  **reusado idéntico en cada reintento** de esa misma carga (FR-015, D3).
- **Ritmo**: emitido desde la cola por el worker respetando el **límite global único de 10 solicitudes/minuto**
  (D2). Nunca directo de la petición del usuario (FR-013).
- **Cuerpo** (una carga = un POST, puede abarcar varias farmacias — clarificación Q2):

```json
{
  "sourceLabel": "string",
  "items": [
    { "pharmacyCode": "<codigo Red Vidar traducido>", "ean": "string(<=20)", "productName": "string", "stock": 0 }
  ]
}
```

Nota: `pharmacyCode` enviado a Red Vidar es el **código Red Vidar** (`redVidarPharmacyCode`), NO el código interno
de la cadena. La traducción ocurre en el módulo `translation` antes de encolar.

## Respuesta (envoltura obligatoria)

Toda respuesta se deserializa contra esta envoltura; `result` es **opcional y puede ser `null`** (FR-016, D5):

```json
{
  "webhookEventId": "string",
  "processingStatus": "string",
  "status": "string",
  "result": {
    "entriesInserted": 0,
    "medicationsInserted": 0,
    "medicationsUpdated": 0,
    "unknownPharmacyCodes": ["string"],
    "errors": [ { "row": 0, "reason": "string" } ]
  }
}
```

El parseo nunca asume la presencia de `result`. El estado terminal de la carga se deriva del **código HTTP** y de
los campos presentes (ver abajo).

## Ramificación por código HTTP (FR-017/018, D4)

| Código HTTP | Acción | Estado resultante de la carga |
|-------------|--------|-------------------------------|
| `2xx` sin `errors[]`/`unknownPharmacyCodes[]` | Éxito | `CONFIRMED` |
| `2xx` con `errors[]` o `unknownPharmacyCodes[]` | Éxito con observaciones | `CONFIRMED_WITH_ERRORS` |
| `400` / `401` / `422` | **No reintentar**; corregir | `FAILED` (con razón) |
| `429` | Esperar ≥ `Retry-After`, reintentar (cuenta como intento) | reintento (sigue en curso) |
| `502` (y errores de red/timeout) | Backoff exponencial con jitter, reintentar | reintento (sigue en curso) |
| Cualquier reintento cuando `attempts == 5` | Agotado | `FAILED` (razón del último fallo) |

- **Máximo de intentos**: 5 (FR-018).
- **Backoff**: `base * 2^(attempt-1)` con full jitter, acotado por un techo. Si la respuesta trae `Retry-After`,
  ese valor **tiene prioridad** sobre el backoff calculado.
- Cada intento persiste un `DispatchAttempt` (número, timestamps, httpStatus, webhookEventId, outcome, razón).

## Persistencia del resultado (FR-019, Principio VII)

Tras un envío 2xx se guarda un `RedVidarResult` con `webhookEventId`, `processingStatus`, `status`, los conteos
(`entriesInserted`, `medicationsInserted`, `medicationsUpdated`), `unknownPharmacyCodes`, `rowErrors` y la
`rawResponse` completa. Nada se descarta.

## Casos de contrato a cubrir con pruebas (dobles/servidor simulado)

1. 2xx con `result` completo → `CONFIRMED`, conteos guardados.
2. 2xx con `result: null` → `CONFIRMED`, sin conteos, sin error de parseo.
3. 2xx con `errors[]` → `CONFIRMED_WITH_ERRORS`, detalle por fila guardado.
4. 429 con `Retry-After` → espera ≥ ese tiempo, misma `X-Idempotency-Key`, reintento.
5. 502 repetido hasta agotar 5 intentos → `FAILED` con razón del último fallo.
6. 400/401/422 → `FAILED` sin reintento.
7. Verificar que la misma carga reusa idéntica `X-Idempotency-Key` en todos sus intentos.
8. Verificar que el flujo agregado no excede 10 solicitudes en cualquier ventana de 60 s (SC-004).
9. **Un POST por carga (FR-013a)**: para una carga con renglones válidos de **varias farmacias**, verificar que se
   emite **una sola** solicitud POST que contiene **todos** los renglones válidos (cada `item` con su
   `pharmacyCode` traducido) y **una sola** `X-Idempotency-Key`; nunca un POST por farmacia.
