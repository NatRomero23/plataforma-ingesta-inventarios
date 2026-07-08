# Especificación de Funcionalidad: Plataforma Intermediaria de Ingesta de Inventarios (Red Vidar)

**Feature Branch**: `001-pharma-inventory-ingest`

**Created**: 2026-07-02

**Status**: Draft

**Input**: Descripción del usuario: "Plataforma web intermediaria de ingesta de inventarios farmacéuticos. Las cadenas de farmacias envían inventarios (por portal web subiendo Excel o por API), la plataforma valida, traduce al contrato de Red Vidar, envía con control de ritmo y registra el resultado detallado de cada carga para dar visibilidad total a coordinadores y farmacias."

## Clarifications

### Session 2026-07-02

- Q: ¿El límite de 10 solicitudes/minuto hacia Red Vidar es un cupo global único de la plataforma o por cadena? → A: Global único — un solo limitador compartido por todas las cadenas (una sola credencial de Red Vidar).
- Q: Cuando una carga incluye varias farmacias, ¿se envía como un solo POST a Red Vidar o se divide en un POST por farmacia? → A: Un solo POST por carga (los items llevan su propio pharmacyCode; una sola clave de idempotencia por carga).
- Q: En la carga por API, ¿los renglones válidos se encolan automáticamente con el mismo POST o requieren un paso de confirmación aparte? → A: Auto-encolar — el POST valida y encola los renglones válidos en una sola llamada (sin paso de confirmación extra; el portal sí conserva su confirmación humana).
- Q: ¿Cuál es el número máximo de renglones que admite una sola carga? → A: Sin tope de renglones; el único límite es el tamaño del archivo/payload (valor por defecto ~10 MB, ajustable en el plan).
- Q: ¿Por cuánto tiempo se conservan los archivos/payloads originales y el detalle de cada carga? → A: Retención configurable por administración; por defecto indefinida (sin borrado automático). Cualquier archivado/purga es una política explícita configurada por admin y queda registrada (auditable), nunca silenciosa (conforme al Principio VII).
- Q: ¿Cómo se representa el integrador-api en el modelo de datos? → A: El integrador NO es una persona usuaria (`User`) del portal; se representa únicamente por su `ApiKey` por cadena. `integrador-api` es un ámbito de autorización que otorga la clave de API, no un rol asignable en el alta de usuarios (que solo admite admin, coordinador y usuario-farmacia).
- Q: Al generar una nueva clave de API para una cadena que ya tiene una activa, ¿qué ocurre? → A: Generar una clave nueva **revoca automáticamente** la clave `ACTIVE` previa de esa cadena (garantiza "una activa por cadena") y ambas acciones quedan registradas en `AuditLog`.

### Session 2026-07-08

- Q: En su vista "Mis cargas", ¿el usuario-farmacia ve todas las cargas de su cadena (incluidas las de origen API) o solo las que él mismo subió por el portal? → A: Solo las que él mismo subió por el portal (`uploaderUserId` = su usuario). Las cargas de origen API de la cadena NO aparecen en "Mis cargas"; siguen visibles solo para administración y coordinación en el Buzón. Motivo: las cargas API no las sube esa persona y mostrarlas confundía. Afecta FR-029 y el alcance por rol de `GET /loads`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Carga de inventario por portal con validación previa (Priority: P1)

Una persona usuaria de farmacia inicia sesión en el portal, descarga la plantilla de Excel definida
por la plataforma, la llena con su inventario y la sube. La plataforma parsea el archivo, traduce el
código de farmacia de la cadena a su código Red Vidar mediante la tabla de equivalencias, y valida
cada renglón. Antes de enviar nada, la persona ve un resumen de validación: cuántos renglones son
válidos, cuáles tienen error (con número de fila y razón) y cuáles pertenecen a farmacias no mapeadas.
La persona confirma el envío de los renglones válidos.

**Why this priority**: Es la vía de entrada principal para cadenas sin capacidad técnica de integración
y el corazón de la propuesta de valor (dar formato y validación consistentes). Sin ella no hay ingesta
por el canal más demandado.

**Independent Test**: Con farmacias y mapeos previamente cargados (datos semilla), subir un Excel con una
mezcla de renglones válidos e inválidos y verificar que el resumen de validación distingue correctamente
válidos, errores por fila con su razón, y farmacias no mapeadas — sin necesidad de que exista el despacho
a Red Vidar todavía. La carga queda registrada con su archivo original y su resultado de validación.

**Acceptance Scenarios**:

1. **Given** una persona usuaria-farmacia autenticada y una plantilla llena con 100 renglones válidos,
   **When** sube el archivo, **Then** la plataforma muestra "100 válidos, 0 con error, 0 en farmacias no
   mapeadas" y ofrece confirmar el envío.
2. **Given** un archivo con un renglón cuyo stock es "-3", **When** se procesa, **Then** ese renglón
   aparece como error con la fila y la razón "stock debe ser entero mayor o igual a 0" y no se cuenta
   como válido.
3. **Given** un archivo con un código de farmacia de la cadena que no existe en la tabla de equivalencias,
   **When** se procesa, **Then** esos renglones aparecen agrupados como "farmacia no mapeada" con el código
   reportado, y no se incluyen en los renglones válidos.
4. **Given** un resumen de validación con 80 válidos y 20 con error, **When** la persona confirma,
   **Then** solo los 80 renglones válidos avanzan y la carga registra los 20 rechazados con su razón.
5. **Given** un archivo que no corresponde a la plantilla (faltan columnas requeridas), **When** se sube,
   **Then** la plataforma rechaza el archivo completo con un mensaje claro en es-MX indicando qué columnas
   faltan, sin crear renglones válidos.

---

### User Story 2 - Despacho a Red Vidar con control de ritmo y registro del resultado (Priority: P1)

Los renglones validados y confirmados se agrupan en una carga y entran a una cola interna. Un proceso de
despacho envía cada carga a la API real de Red Vidar respetando el límite de 10 solicitudes por minuto,
incluyendo una clave de idempotencia por carga, reintentando con backoff exponencial y jitter ante fallos
transitorios (respetando Retry-After), hasta un máximo de intentos. El resultado devuelto por Red Vidar se
guarda asociado a la carga y su estado se actualiza.

**Why this priority**: Sin el despacho confiable la plataforma no cumple su función de intermediaria; es
la mitad del criterio de éxito ("termina reflejada en Red Vidar o marcada como fallida con razón clara").

**Independent Test**: Tomar una carga validada y confirmada y verificar que sale de la cola respetando el
ritmo, que ante una respuesta 429/502 simulada reintenta con espera creciente y que ante un 4xx no
reintenta; que el resultado (identificador del evento y conteos) queda guardado y el estado de la carga
transiciona a confirmada / confirmada con errores / fallida según corresponda.

**Acceptance Scenarios**:

1. **Given** una carga confirmada en la cola, **When** el despachador la procesa con éxito (respuesta 2xx),
   **Then** la carga queda en estado "confirmada", se guarda su identificador de evento y los conteos de
   renglones insertados/actualizados.
2. **Given** que ya se enviaron 10 solicitudes en el minuto en curso, **When** hay más cargas pendientes,
   **Then** el despacho espera hasta que el ritmo lo permita y ninguna solicitud excede el límite.
3. **Given** una respuesta 429 con Retry-After, **When** se recibe, **Then** el despachador espera al menos
   ese tiempo antes de reintentar la misma carga con la misma clave de idempotencia.
4. **Given** una respuesta 502 repetida, **When** se agota el máximo de intentos, **Then** la carga queda
   en estado "fallida" con la razón del último fallo registrada.
5. **Given** una respuesta 400/401/422, **When** se recibe, **Then** la carga se marca como fallida sin
   reintentar y se registra la razón para corrección.
6. **Given** una carga que Red Vidar acepta pero reporta errores por fila o códigos de farmacia
   desconocidos, **When** se recibe la respuesta, **Then** la carga queda en estado "confirmada con
   errores" con el detalle por fila conservado.

---

### User Story 3 - Buzón y detalle de carga para coordinación (Priority: P2)

Una persona coordinadora abre el buzón de cargas y ve la bandeja de todas las cargas de todas las cadenas,
con filtros por cadena, farmacia, estado y fecha. Al abrir una carga ve su detalle completo: origen (portal
o API), quién la subió, el archivo original descargable, los conteos de renglones totales/válidos/rechazados
con la razón por fila, el resultado de Red Vidar con su identificador de evento, y cada intento de envío con
su marca de tiempo.

**Why this priority**: Cumple la otra mitad del criterio de éxito: que cualquier coordinador responda en menos
de un minuto qué llegó, qué falló y por qué. Depende de que existan cargas (US1/US2) pero aporta el valor de
visibilidad de forma independiente.

**Independent Test**: Con cargas en distintos estados ya registradas, verificar que el buzón las lista y filtra
correctamente, y que el detalle de una carga muestra archivo original, conteos, razones por fila, resultado de
Red Vidar e intentos con timestamps.

**Acceptance Scenarios**:

1. **Given** cargas de varias cadenas en distintos estados, **When** la persona coordinadora filtra por cadena
   "X" y estado "fallida", **Then** solo ve las cargas fallidas de la cadena X.
2. **Given** una carga confirmada con errores, **When** abre su detalle, **Then** ve totales/válidos/rechazados,
   la razón de cada renglón rechazado, el identificador del evento de Red Vidar y los intentos de envío con sus
   marcas de tiempo.
3. **Given** una carga hecha por portal, **When** abre su detalle, **Then** puede descargar el archivo Excel
   original tal como se subió.
4. **Given** una pregunta operativa ("¿la carga de ayer de la sucursal X llegó completa?"), **When** filtra por
   farmacia y fecha, **Then** obtiene la respuesta (estado y conteos) en menos de un minuto.

---

### User Story 4 - Ingesta y consulta por API para integradores (Priority: P2)

El sistema de una cadena con capacidad técnica envía su inventario al endpoint de la plataforma usando su clave
de API propia de la plataforma, con un contrato espejo del de Red Vidar. La plataforma aplica la misma
validación y traducción que en el portal y responde de forma síncrona con el resultado de validación y el
identificador de la carga. Más tarde, el sistema consulta el estado y detalle de esa carga por su identificador.

**Why this priority**: Habilita a las cadenas con integración propia y unifica el tratamiento con el portal, pero
la plataforma ya entrega valor con el canal de portal; por eso va después del MVP.

**Independent Test**: Enviar una petición autenticada con clave de API válida y verificar que la respuesta
síncrona trae el resultado de validación y un identificador; luego consultar ese identificador y obtener el
estado y detalle. Verificar además que una clave inválida o revocada es rechazada.

**Acceptance Scenarios**:

1. **Given** una clave de API válida de una cadena, **When** el integrador envía una carga con renglones válidos
   e inválidos, **Then** recibe de forma síncrona el resumen de validación (válidos, errores por índice con razón,
   farmacias no mapeadas) y el identificador de la carga.
2. **Given** un identificador de carga existente, **When** el integrador consulta su estado, **Then** obtiene el
   estado actual y el detalle equivalente al del buzón.
3. **Given** una clave de API revocada o inexistente, **When** se intenta enviar, **Then** la petición se rechaza
   con error de autenticación y no se crea ninguna carga.
4. **Given** una carga por API con renglones válidos, **When** se recibe el POST, **Then** los renglones válidos se
   encolan automáticamente (sin confirmación adicional) en la misma cola de despacho a Red Vidar que las cargas de
   portal.

---

### User Story 5 - Gestión administrativa de catálogos, usuarios y claves (Priority: P3)

Una persona administradora gestiona las cadenas y sus farmacias (incluyendo el código interno de la cadena y el
código Red Vidar de cada farmacia, que forman la tabla de equivalencias), gestiona las personas usuarias con su
rol y cadena asignada, y genera o revoca las claves de API de los integradores (una por cadena, con prefijo propio
de la plataforma).

**Why this priority**: Es el sustrato de configuración que habilita a las demás historias, pero para probar y
demostrar US1–US4 puede partirse de datos semilla; por eso se prioriza como habilitador administrable después del
flujo de valor central.

**Independent Test**: Crear una cadena, sus farmacias con ambos códigos, una persona usuaria-farmacia y una clave
de API; luego revocar la clave y verificar que deja de autenticar. Verificar que un código Red Vidar duplicado o
un mapeo faltante se maneja de forma explícita.

**Acceptance Scenarios**:

1. **Given** una persona administradora, **When** crea una cadena y le agrega farmacias con su código interno y su
   código Red Vidar, **Then** esas farmacias quedan disponibles para traducir cargas.
2. **Given** una cadena existente, **When** genera una clave de API, **Then** la clave se muestra una sola vez con
   el prefijo de la plataforma y queda asociada a esa cadena.
3. **Given** una clave de API activa, **When** la persona administradora la revoca, **Then** deja de autenticar
   inmediatamente.
4. **Given** una persona usuaria, **When** se le asigna rol y cadena, **Then** solo puede ver y hacer lo que su rol
   permite (p. ej. usuaria-farmacia solo ve las cargas de su propia cadena).

---

### User Story 6 - Vista de actividad por farmacia (Priority: P3)

Una persona coordinadora o administradora consulta, por farmacia, la fecha de su última carga exitosa, para
detectar farmacias que llevan días sin reportar inventario.

**Why this priority**: Aporta valor operativo de vigilancia, pero es secundario frente a la ingesta y la
trazabilidad por carga; las notificaciones automáticas quedan explícitamente fuera de alcance en esta versión.

**Independent Test**: Con un conjunto de farmacias y cargas de distintas fechas, verificar que la vista muestra por
farmacia la fecha de su última carga exitosa y permite identificar las que no reportan hace tiempo.

**Acceptance Scenarios**:

1. **Given** varias farmacias con cargas en distintas fechas, **When** se abre la vista por farmacia, **Then** cada
   farmacia muestra la fecha de su última carga exitosa.
2. **Given** una farmacia sin ninguna carga exitosa, **When** se abre la vista, **Then** se indica claramente que no
   tiene cargas exitosas registradas.

---

### Edge Cases

- **Archivo vacío o solo con encabezados**: se rechaza con mensaje claro; no crea una carga con cero renglones
  válidos que llegue a despacharse.
- **Archivo con miles de renglones**: no hay tope de renglones; la validación y el resumen deben completarse dentro
  de los objetivos de desempeño. Un archivo/payload que excede el límite de tamaño (por defecto ~10 MB) se rechaza
  completo indicando el límite.
- **Renglones duplicados dentro del mismo archivo** (misma farmacia + mismo EAN): se conservan tal como llegan; la
  resolución de duplicados es responsabilidad de Red Vidar según su contrato (se documenta como supuesto).
- **Misma persona sube el mismo archivo dos veces**: se crean dos cargas distintas (no hay deduplicación entre
  cargas); la clave de idempotencia protege únicamente contra el doble envío de una misma carga a Red Vidar.
- **Un solo archivo con renglones de varias farmacias de la cadena**: se admite; cada renglón se traduce por su
  propio código de farmacia.
- **Farmacia registrada en la plataforma pero sin código Red Vidar**: sus renglones se tratan como "farmacia no
  mapeada" y no se envían.
- **Pérdida de conexión con Red Vidar durante el despacho**: la carga permanece en cola/estado de reintento sin
  perderse; al restablecerse continúa respetando ritmo y máximo de intentos.
- **Confirmación de una carga sin ningún renglón válido**: no se permite avanzar a la cola; la carga queda
  registrada como validada sin envío.
- **Red Vidar responde con una envoltura donde `result` es nulo**: se maneja sin error; el estado se deriva del
  código HTTP y de los campos presentes.
- **Persona usuaria-farmacia intenta ver cargas de otra cadena**: se le niega el acceso.

## Requirements *(mandatory)*

### Functional Requirements

**Ingesta por portal (US1)**

- **FR-001**: El sistema DEBE permitir a una persona usuaria-farmacia descargar una plantilla de Excel fija con las
  columnas: código de farmacia de la cadena, EAN, nombre del producto y stock.
- **FR-002**: El sistema DEBE aceptar la subida del archivo de inventario y parsearlo contra la estructura de la
  plantilla, rechazando el archivo completo con un mensaje en es-MX si faltan columnas requeridas.
- **FR-002a**: No existe un tope fijo de renglones por carga; el único límite de tamaño es el del archivo/payload
  (valor por defecto ~10 MB, ajustable en el plan). Un archivo/payload que excede ese tamaño se rechaza completo con
  un mensaje en es-MX que indica el límite, sin crear renglones válidos. La misma restricción de tamaño aplica al
  payload de la API (FR-008).
- **FR-003**: El sistema DEBE traducir el código de farmacia de la cadena a su código Red Vidar usando la tabla de
  equivalencias de la cadena a la que pertenece la persona usuaria.
- **FR-004**: El sistema DEBE validar cada renglón según las reglas: campos requeridos presentes, stock entero mayor
  o igual a 0, EAN de máximo 20 caracteres, nombre del producto no vacío, y farmacia mapeada y registrada.
- **FR-005**: El sistema DEBE mostrar, antes de cualquier envío, un resumen de validación con: número de renglones
  válidos, lista de renglones con error (número de fila y razón), y renglones agrupados por farmacia no mapeada.
- **FR-006**: El sistema DEBE requerir la confirmación explícita de la persona usuaria para enviar únicamente los
  renglones válidos, excluyendo los renglones con error y los de farmacias no mapeadas.
- **FR-007**: El sistema NO DEBE permitir confirmar el envío de una carga que no contiene ningún renglón válido.

**Ingesta por API (US4)**

- **FR-008**: El sistema DEBE exponer un endpoint para recibir inventario con un contrato espejo del de Red Vidar
  (etiqueta de origen e ítems con código de farmacia de la cadena, EAN, nombre del producto y stock), autenticado
  con la clave de API propia de la plataforma.
- **FR-009**: El sistema DEBE aplicar a las cargas por API la misma traducción y las mismas reglas de validación que
  a las cargas por portal.
- **FR-010**: El sistema DEBE responder de forma síncrona a la carga por API con el resultado de validación (válidos,
  errores por índice con razón, farmacias no mapeadas) y el identificador de la carga.
- **FR-010a**: En la carga por API, los renglones válidos se DEBEN encolar automáticamente para despacho con el mismo
  POST (sin paso de confirmación aparte); la respuesta síncrona indica cuántos renglones se aceptaron/encolaron y
  cuáles se rechazaron. La confirmación humana explícita (FR-006) aplica únicamente a la carga por portal.
- **FR-011**: El sistema DEBE exponer un endpoint para consultar, por identificador de carga, el estado y el detalle
  de esa carga.
- **FR-012**: El sistema DEBE rechazar toda petición de API con clave inexistente o revocada sin crear ninguna carga.

**Cola y despacho a Red Vidar (US2)**

- **FR-013**: El sistema DEBE agrupar los renglones válidos y confirmados en cargas e ingresarlas a una cola interna;
  los envíos a Red Vidar salen siempre de esa cola, nunca directamente de la petición de la persona usuaria.
- **FR-013a**: Cada carga se DEBE despachar como **un único envío (POST)** a Red Vidar que contiene todos sus
  renglones válidos, incluso si abarcan varias farmacias de la cadena (cada ítem lleva su propio `pharmacyCode`
  traducido). No se divide una carga en múltiples envíos por farmacia.
- **FR-014**: El sistema DEBE despachar las cargas respetando un límite **global único** de 10 solicitudes por minuto hacia Red Vidar, compartido por todas las cadenas (una sola credencial de Red Vidar). El control de ritmo se aplica sobre el flujo agregado de todas las cadenas, no por cadena.
- **FR-015**: Cada envío de una carga a Red Vidar DEBE incluir una clave de idempotencia (UUID v4) única por carga y
  reutilizada idéntica en cada reintento de esa misma carga.
- **FR-016**: El sistema DEBE deserializar la respuesta de Red Vidar contra la envoltura
  `{ webhookEventId, processingStatus, status, result }`, tratando `result` como opcional (puede ser nulo).
- **FR-017**: El sistema DEBE ramificar el manejo por código HTTP: 2xx = éxito; 400/401/422 = fallo sin reintento;
  429 = esperar el Retry-After indicado antes de reintentar; 502 = reintentar con backoff exponencial y jitter.
- **FR-018**: El sistema DEBE limitar los reintentos de una carga a un máximo de 5 intentos; agotados, la carga queda
  en estado "fallida" con la razón del último fallo.
- **FR-019**: El sistema DEBE guardar, asociado a cada carga, el resultado de Red Vidar: identificador del evento,
  conteos de renglones insertados y de medicamentos insertados/actualizados, códigos de farmacia desconocidos y
  errores por fila reportados.

**Estados y trazabilidad (transversal, alimenta US3)**

- **FR-020**: El sistema DEBE modelar el ciclo de vida de una carga con los estados: recibida → validada → en cola →
  enviada → confirmada / confirmada con errores / fallida.
- **FR-021**: El sistema DEBE conservar, por cada carga y sin descartar nada: el archivo o payload original tal como
  se recibió, el resultado de la validación local, cada intento de envío con su identificador de evento y sus marcas
  de tiempo, y los conteos finales.
- **FR-022**: El sistema DEBE registrar el origen de cada carga (portal o API) y la identidad de quién la originó
  (persona usuaria o cadena vía clave de API).
- **FR-022a**: La retención de archivos/payloads originales y del detalle de cargas DEBE ser configurable por
  administración; por defecto es indefinida (sin borrado automático). Todo archivado o purga DEBE responder a una
  política explícita configurada por admin y DEBE quedar registrado de forma auditable (qué se archivó/purgó, cuándo
  y bajo qué política); nunca ocurre de forma silenciosa.

**Buzón y monitoreo (US3, US6)**

- **FR-023**: El sistema DEBE ofrecer a coordinación y administración una bandeja de todas las cargas con filtros por
  cadena, farmacia, estado y fecha.
- **FR-024**: El sistema DEBE mostrar el detalle de una carga con: origen, quién la subió, archivo original
  descargable, conteos totales/válidos/rechazados con la razón por fila, resultado de Red Vidar con su identificador
  de evento, e intentos de envío con marcas de tiempo.
- **FR-025**: El sistema DEBE ofrecer una vista por farmacia con la fecha de su última carga exitosa, indicando
  cuando una farmacia no tiene cargas exitosas.

**Gestión y acceso (US5, transversal)**

- **FR-026**: El sistema DEBE permitir a administración el alta, consulta, modificación y baja de cadenas y de
  farmacias, donde cada farmacia registra su código interno de la cadena y su código Red Vidar.
- **FR-027**: El sistema DEBE permitir a administración el alta, consulta, modificación y baja de personas usuarias
  con un rol (**admin, coordinador, usuario-farmacia**) y una cadena asignada cuando aplique. El acceso de
  `integrador-api` NO es una persona usuaria: no se crea como `User` ni tiene contraseña; se representa únicamente
  por su clave de API por cadena (FR-028) y `integrador-api` es el ámbito de autorización que otorga esa clave.
- **FR-028**: El sistema DEBE permitir a administración generar y revocar claves de API de integradores, con
  prefijo propio de la plataforma, mostrando la clave completa una sola vez al generarla. Debe haber **a lo sumo
  una clave `ACTIVE` por cadena**: generar una clave nueva **revoca automáticamente** la clave activa previa de esa
  cadena, y tanto la generación como la revocación automática quedan registradas de forma auditable.
- **FR-029**: El sistema DEBE restringir el acceso por rol: administración ve y gestiona todo; coordinación monitorea
  y consulta todas las cargas pero no gestiona usuarios; usuario-farmacia solo opera y ve **las cargas que él mismo
  subió por el portal** (no ve las cargas de origen API de su cadena, que solo ven administración y coordinación en
  el Buzón — ver Clarifications 2026-07-08); integrador-api solo usa la API para enviar y consultar cargas de su cadena.
- **FR-030**: El sistema NUNCA DEBE exponer la credencial de Red Vidar (prefijo `rv_pc_live_`) a integradores, al
  frontend, en logs ni en respuestas; los integradores usan exclusivamente su clave de API de la plataforma.

### Key Entities *(include if feature involves data)*

- **Cadena**: agrupador comercial de farmacias. Tiene nombre, sus farmacias, sus personas usuarias y a lo sumo una
  clave de API activa.
- **Farmacia**: sucursal perteneciente a una cadena. Registra su código interno de la cadena y su código Red Vidar
  (`pharmacyCode`); la relación entre ambos es la tabla de equivalencias ("traductor").
- **Persona usuaria**: cuenta con rol (admin, coordinador, usuario-farmacia, integrador-api) y, cuando aplica, una
  cadena asignada. Determina qué puede ver y hacer.
- **Clave de API**: credencial de integrador emitida por la plataforma (con prefijo propio), asociada a una cadena,
  con estado activa/revocada. Nunca se confunde con la credencial de Red Vidar.
- **Carga**: una entrega de inventario (por portal o por API). Conserva origen, autor, archivo/payload original,
  resultado de validación, estado del ciclo de vida, conteos y el resultado de Red Vidar.
- **Renglón de carga**: cada ítem del inventario dentro de una carga, con su fila/índice, código de farmacia de la
  cadena, código Red Vidar traducido, EAN, nombre de producto, stock, y —si aplica— la razón por la que fue
  rechazado.
- **Intento de envío**: cada intento de despachar una carga a Red Vidar, con su marca de tiempo, resultado
  (código HTTP), identificador de evento devuelto y razón de fallo cuando corresponde.
- **Resultado de Red Vidar**: la respuesta asociada a una carga: identificador de evento, conteos de inserción/
  actualización, códigos de farmacia desconocidos y errores por fila.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las cargas confirmadas (por portal o por API) termina en un estado terminal inequívoco —
  confirmada, confirmada con errores o fallida— sin quedar atrapada indefinidamente en estados intermedios.
- **SC-002**: Una persona coordinadora puede responder "¿la carga de ayer de la sucursal X llegó completa, cuántos
  renglones entraron y cuántos no y por qué?" en menos de 1 minuto desde el buzón.
- **SC-003**: El 100% de los renglones rechazados en validación queda registrado con su número de fila y una razón
  legible en es-MX, sin renglones rechazados sin explicación.
- **SC-004**: El flujo agregado de todas las cadenas hacia Red Vidar nunca excede 10 solicitudes por minuto (límite
  global único), medido sobre cualquier ventana de un minuto.
- **SC-005**: El 100% de las cargas conserva su archivo o payload original descargable/recuperable tras alcanzar un
  estado terminal, salvo que una política de retención explícita configurada por administración lo archive/purgue,
  en cuyo caso queda un registro auditable de esa acción (nada se descarta de forma silenciosa).
- **SC-006**: Los renglones que no pasan la validación local no generan ninguna solicitud a Red Vidar (0 llamadas
  externas por renglones inválidos).
- **SC-007**: Ante fallos transitorios de Red Vidar (429/502), una carga se reintenta hasta un máximo de 5 veces con
  espera creciente; ninguna carga se reintenta indefinidamente ni más allá de ese máximo.
- **SC-008**: Una persona usuaria-farmacia obtiene el resumen de validación de un archivo dentro del límite de
  tamaño (por defecto ~10 MB) en menos de 30 segundos tras subirlo, con la validación procesando al menos
  ~5,000 renglones por segundo.
- **SC-009**: La credencial de Red Vidar no aparece en ninguna respuesta de la API, vista del frontend ni entrada de
  log en revisiones de seguridad (0 exposiciones).

## Assumptions

- **Plantilla fija de Excel**: en esta versión la plantilla tiene columnas fijas definidas por la plataforma; el
  mapeo flexible de columnas por cadena queda fuera de alcance (fase 2).
- **Una carga = un envío a Red Vidar**: cada carga confirmada se despacha como una operación con una única clave de
  idempotencia; un archivo puede contener renglones de varias farmacias de la misma cadena dentro de una carga.
- **Sin deduplicación entre cargas**: subir dos veces el mismo archivo produce dos cargas distintas; la idempotencia
  aplica solo a los reintentos de una misma carga hacia Red Vidar.
- **Datos semilla para probar el flujo**: US1–US4 pueden probarse y demostrarse con cadenas, farmacias y mapeos
  precargados; la gestión administrable completa se cubre en US5.
- **Resolución de duplicados de inventario**: la deduplicación o consolidación de renglones idénticos (misma farmacia
  + EAN) es responsabilidad del contrato de Red Vidar, no de la plataforma.
- **Autenticación**: las personas usuarias del portal se autentican con sesión basada en token; los integradores con
  su clave de API de la plataforma. El detalle del mecanismo se define en el plan conforme a la constitución.
- **Idioma**: toda la interfaz, mensajes de error y documentación visibles se presentan en español (es-MX).
- **Alcance de fase 1**: quedan explícitamente fuera el mapeo flexible de columnas, las notificaciones automáticas por
  silencio de farmacia, el registro de farmacias en lote hacia Red Vidar desde la plataforma, los dashboards gráficos
  y el soporte multi-idioma.
