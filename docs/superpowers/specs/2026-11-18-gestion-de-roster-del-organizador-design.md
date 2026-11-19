# Gestión de roster del organizador

**Fecha:** 2026-11-18
**Estado:** diseño, pendiente de aprobación
**Tamaño:** cambio pequeño

## Intención

Hoy el organizador de un partido no puede tocar a nadie más que a los
`+1`. Puede editar el partido, borrarlo y quitar invitados, pero la lista
de jugadores solo la mueven los jugadores mismos: cada uno entra y sale
por su cuenta, y el organizador mira.

Eso deja al organizador sin respuesta para lo que pasa de verdad antes de
un partido. Alguien confirmó y ya no va. Alguien entró por link y no
corresponde. Hay doce anotados para diez lugares y quiere decidir él
quién juega, no que lo decida el orden de llegada.

Este cambio le da tres acciones sobre cualquier jugador del partido:
bajarlo a la lista de espera, subirlo de la lista de espera al roster, y
sacarlo del partido.

## Objetivos

- El organizador baja a un jugador del roster a la lista de espera.
- El organizador sube a alguien de la lista de espera al roster, si hay
  lugar.
- El organizador saca a un jugador del partido por completo.
- Las tres acciones viven sobre el roster que ya se ve, sin pantalla nueva.
- Las tres acciones son del dueño del partido (y del super admin con el
  modo prendido), nunca de un jugador cualquiera.

## No objetivos

- **Bloquear a quien fue sacado.** Queda decidido: sacar revoca el acceso
  y nada impide volver a entrar por el mismo link después. Es un empujón,
  no una expulsión.
- **Avisarle a quien fue movido o sacado.** No hay notificaciones en la
  app y este cambio no las trae.
- **Reordenar la lista de espera.** El orden sigue siendo el de llegada;
  el organizador sube a quien quiera, pero no arrastra posiciones.
- **Quitar la promoción automática que ya existe.** Se queda, acotada a
  los lugares que libera una baja (ver Restricciones).
- **Mover `+1` ajenos entre listas.** Un `+1` no tiene lugar propio en la
  lista de espera; se sigue quitando como hoy.

## Anti objetivos

Cosas que harían fracasar el cambio aunque funcione:

- Que una acción del organizador promueva a alguien que él no eligió. El
  sentido del cambio es que el organizador decida; si al sacar a alguien
  la app sube sola al primero de la espera, el organizador tiene que
  deshacer eso también.
- Que el roster y `matchPreviews.occupiedCount` queden desincronizados.
  Eso es exactamente la falla que se arregló en el PR #7: con el contador
  corrido, **ningún** join por link puede entrar al roster. Toda escritura
  nueva de este cambio tiene que pasar por `commitRosterChange`, que
  escribe los dos documentos en un batch con un conteo absoluto.
- Que un jugador descubra que puede mover a otros.

## Restricciones

**Las reglas no cambian.** `allow update` en `matches/{matchId}` es
`isMatchOwner() || (onlyRosterChanged() && withinCapacity())`, y
`isMatchOwner()` es un bypass completo de `onlyRosterChanged()`. El dueño
ya puede escribir cualquier forma de roster, incluido sacar a otro. Esto
es solo cliente.

**La promoción automática se queda, pero solo llena lo que se liberó.**
Antes `promoteFromWaitlist` llenaba todos los lugares libres. Mientras
una espera con gente casi siempre significaba roster lleno, daba igual:
"llenar todo" era "llenar uno". Ahora el organizador puede retener
jugadores y dejar lugares abiertos a propósito, y con "llenar todo" una
sola baja vaciaba la espera entera en esos lugares. La regla queda así:
una baja llena solo los lugares que ella liberó, con el siguiente de la
fila. `promoteFromWaitlist` recibe cuántos, sin valor por defecto, para
que ningún llamador futuro vuelva a llenar todo sin darse cuenta.

- `buildLeavePatch`: cuando un jugador se va por su cuenta, libera su
  lugar más uno por cada `+1` suyo que se va con él, y suben a lo sumo
  esos.
- `buildGuestListPatch`: quitar un `+1` libera un lugar por cada `+1`
  quitado, y sube a lo sumo esos.

Los lugares que ya estaban abiertos siguen abiertos. Las acciones del
organizador no promueven nunca, y eso incluye que el organizador quite
un `+1`, suyo o de cualquiera: su decisión no es una vacante. Un miembro
que quita su propio `+1` sí cede ese lugar al siguiente.

La consecuencia se aceptó a sabiendas: si el jugador retenido es el
siguiente de la fila, recibe el lugar liberado igual. Evitarlo exigiría
recordar a quién retuvo el organizador — estado nuevo guardado — y eso
no se eligió.

**`memberIds` es el gate de lectura.** Sacar a alguien lo borra de
`memberIds`, y ahí pierde el permiso de leer el partido: desaparece de su
lista sin aviso. Bajarlo a la espera lo deja en `memberIds`, así que sigue
viendo el partido. Esa es la diferencia real entre las dos acciones.

**El `+1` sigue a su dueño.** `buildLeavePatch` ya se lleva el `+1` del
que sale del roster. Bajar a alguien a la espera hace lo mismo: un
jugador en espera no puede tener un `+1` ocupando un lugar en la cancha.

## Enfoques considerados

**1. Sobre los chips del roster — elegido.** El roster ya se dibuja como
una fila de chips, y los chips de `+1` ya son botones que abren un modal
de confirmación (`openRemoveGuest` / `confirmRemoveGuest`). Se extiende
ese patrón a los chips de jugador y de espera: tocar abre una hoja de
acciones según dónde está la persona.

**2. Un modal "Gestionar roster".** Una lista vertical con acciones por
fila. Se lee mejor con doce jugadores y subir a alguien se siente más
deliberado que un toque en una fila horizontal.

**Elegido: 1.** La app es mobile first y el patrón ya existe, así que el
diff es un componente y nada nuevo que mantener. La razón de fondo es el
anti objetivo de la desincronización: el enfoque 2 agrega un segundo
lugar que dibuja el estado del roster, y la duplicación de estado derivado
es justo lo que dejó que el contador del preview se corriera. Un solo
renderizador.

## Diseño

### Payloads

En `matchPayloads.ts`, que es puro y está cubierto por
`matchWrites.check.ts`:

**`buildLeavePatch(match, uid, options?)`** gana una opción
`{ promote?: boolean }`, por defecto `true`. Los llamadores de hoy no se
tocan. El organizador sacando a alguien pasa `{ promote: false }`: misma
salida (fuera de las dos listas, se lleva su `+1`, recalcula `memberIds`
y `occupiedCount`), sin el paso de promoción.

**`buildRosterMovePatch(match, uid, to)`** es nuevo. Mueve un uid entre
las dos listas sin promover a nadie:

- `to: 'waitlist'` — lo saca de `joinedPlayerIds`, lo agrega al final de
  `waitlistPlayerIds` si no estaba, y se lleva su `+1`. El lugar queda
  abierto.
- `to: 'roster'` — lo saca de `waitlistPlayerIds` y lo agrega a
  `joinedPlayerIds`. Solo tiene sentido si hay lugar; ver Guardas.

Las dos direcciones terminan en `rosterFields(...)` y `occupied(...)`,
los helpers que ya usan los demás builders, así que `memberIds` y el
contador salen derivados de las listas nuevas y no de un conteo relativo.

### Escrituras

En `matchWrites.ts`, dos funciones delgadas, las dos sobre
`commitRosterChange` (batch de `matches` + `matchPreviews` con conteo
absoluto):

- `removeFromMatch(match, uid)` → `buildLeavePatch(match, uid, { promote: false })`
- `moveRosterMember(match, uid, to)` → `buildRosterMovePatch(match, uid, to)`

### Guardas

En el hook (`useMatchActions`), no solo en la UI, porque la UI puede
dibujarse con un snapshot viejo:

- Las tres acciones piden `canManageMatch(match, profile, superAdminMode)`.
- Subir al roster pide `!isMatchFull(match)`; si está lleno, el mismo
  `alert` que ya usa el resto del hook.
- Bajar a la espera pide `!isWaitlistFull(match)`.
- El organizador no se mueve a sí mismo: ya tiene LEAVE MATCH, y sacarse
  del propio partido es otra cosa (el partido quedaría sin dueño en el
  roster).

### UI

`MatchDetailView` ya decide por chip si dibuja un `<button>` o un `<div>`
según `canManageGuest`. Se agrega el caso del jugador: con `canManage` y
si el chip no es el del propio organizador, es un botón que abre la hoja.

Las acciones cambian según dónde está la persona:

```
Chip del roster                  Chip de la espera
┌──────────────────────────┐     ┌──────────────────────────┐
│  (avatar)  Leo           │     │  (avatar)  Ana           │
│  En el roster            │     │  En espera               │
│                          │     │                          │
│  [ Bajar a espera    ]   │     │  [ Subir al roster   ]   │
│  [ Sacar del partido ]   │     │  [ Sacar del partido ]   │
│  [ Cancelar          ]   │     │  [ Cancelar          ]   │
└──────────────────────────┘     └──────────────────────────┘
```

"Sacar del partido" dice en la hoja que la persona pierde el acceso al
partido y que puede volver a entrar por el link. "Subir al roster" no se
dibuja si no hay lugar.

### i18n

Claves nuevas en `en.ts` y `es.ts`, bajo `matches`, en la forma de las que
ya están (`cannotRemoveGuest`, `oneGuestOnly`).

### Checks

`matchWrites.check.ts` crece con:

- `buildLeavePatch` con `{ promote: false }`: el lugar queda abierto y la
  espera intacta — y el caso de hoy, sin opción, sigue promoviendo.
- `buildRosterMovePatch` en las dos direcciones: `memberIds` y
  `occupiedCount` derivados, el `+1` del que baja se va, nadie promovido.
- Bajar al único de la espera con un lugar libre: no vuelve al roster. Es
  el caso que un builder con promoción rompería en silencio.

Las reglas no cambian, así que `rules.check.ts` no se toca.

## Anexo: tres cambios sueltos

No tienen relación con la gestión de roster, van en el mismo PR a pedido
del dueño del repo, y cada uno es su propio commit.

### 1. Nombre al agregar un `+1`

Hoy un `+1` no tiene nombre: `MatchGuest` es `{ id, addedBy, createdAt }` y
`resolveRoster` lo dibuja con la etiqueta genérica `t('matches.guest')`.
En un roster con tres `+1` no se distingue a nadie.

`MatchGuest` gana `name?: string`. `AddPlusOneModal` gana un campo de
texto con la misma forma que el del invitado (requerido, `maxLength`
60, se recorta). El chip muestra ese nombre; los `+1` que ya existen no lo
tienen, así que el fallback sigue siendo `t('matches.guest')`.

Opcional en el tipo, requerido en el formulario: el tipo describe
documentos viejos que no van a migrarse, el formulario describe lo que se
escribe de ahora en adelante.

### 2. El organizador agrega `+1` sin límite

`addGuestPlusOne` corta con `oneGuestOnly` si el que pide ya tiene un `+1`
en el partido. Ese tope no aplica al organizador: él arma el partido y
puede necesitar anotar a varios que no usan la app.

El tope por persona se saltea solo para `canManageMatch`. **La capacidad
sigue siendo el techo para todos**, con el chequeo
`getOccupiedCount(match) >= match.capacity` que ya está. Vale decirlo
porque las reglas no lo frenarían: `isMatchOwner()` es un bypass de
`withinCapacity()`, así que el único freno es el cliente. "Sin límite"
quiere decir sin tope por persona, no sin tope.

El `id` del `+1` ya es `guest_${uid}_${Date.now()}`, único por invocación,
así que varios `+1` del mismo uid no chocan.

### 3. Botón de registro para el invitado anónimo

El chip del roster es avatar / nombre / posición, y la posición sale de
`t('roles.short.${entry.role}')`. `resolveRoster` arma el rol como
`found?.role || 'Striker'`, y un invitado anónimo nunca pasó por
onboarding, así que no tiene rol: hoy aparece como delantero sin haberlo
elegido nunca.

En el chip **del propio invitado**, cuando está viendo el partido sin
cuenta, esa línea de posición pasa a ser un botón de registro. Tocarlo
abre la pantalla que ya existe (`UpgradeAccountScreen`, la misma a la que
llegan `onCreateAccount` en `MyMatchesScreen` y `onUpgrade` en ajustes),
así que es una entrada nueva a un camino que ya está hecho, no una
pantalla nueva. `MatchDetailView` recibe un prop para eso; `App` ya tiene
`setShowUpgrade`.

```
Chip de hoy (miente)        Chip del invitado anónimo
┌──────────────┐            ┌──────────────┐
│   (avatar)   │            │   (avatar)   │
│     Vic      │            │     Vic      │
│   STRIKER    │            │ [ CREAR CUENTA ] │
└──────────────┘            └──────────────┘
```

Reemplaza la posición, no la acompaña: el chip mide 72px y la línea es de
9px, no entran las dos cosas al lado.

**Solo el chip propio.** Los chips de otros invitados anónimos se quedan
como están. Marcar en el roster quién no tiene cuenta expone algo que no
es de nadie más, y nadie puede registrarse en nombre de otro.

**Lo que no se arregla acá:** los demás jugadores sin rol siguen
mostrándose como `Striker`. Es cosmético y anterior a este cambio.

## Lo que queda al builder

- Cómo se dibuja la hoja de acciones: reusar el modal de `+1` o un
  componente propio, lo que salga más corto sin duplicar estilos.
- El texto exacto de las claves nuevas, en los dos idiomas.
- Si `buildRosterMovePatch` son una función con `to` o dos funciones; la
  forma de arriba es una preferencia, no un requisito.
- Dónde entra el campo de nombre dentro de `AddPlusOneModal` y cómo se
  dibuja el botón de registro en el chip, sin romper el ancho de 72px.
