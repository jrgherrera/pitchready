# Partidos privados por link

**Fecha:** 2026-11-16
**Estado:** diseño, pendiente de aprobación

## Intención

PitchReady hoy es un directorio compartido. Cualquier usuario firmado ve
todos los partidos de la base de datos y todos los usuarios registrados:
`useMatches` consulta la colección `matches` completa, `usePlayers`
consulta `users` completa, y las reglas lo permiten con
`allow read: if isSignedIn()` en ambas colecciones.

Eso tiene que cambiar en dos direcciones a la vez:

**Hacia dentro — privacidad.** Un partido pertenece a quien lo organiza y
a quien juega. Nadie debería ver partidos ajenos ni los jugadores de
partidos ajenos. La app deja de ser un directorio y pasa a ser privada
por pertenencia: ves lo que creaste, lo que juegas, y lo que alguien te
compartió explícitamente.

**Hacia fuera — fricción.** Hoy un link compartido manda al login. Eso
pierde jugadores: alguien que solo quiere confirmar que juega el jueves no
va a crear una cuenta, verificar un correo y pasar por onboarding. Un
invitado debe poder entrar al partido escribiendo su nombre, volver al
link después sin repetir nada, y registrarse más tarde si quiere.

Lo que las dos direcciones tienen en común es que redefinen quién es
alguien en PitchReady y qué le toca ver. Por eso van juntas.

## Objetivos

1. Quien recibe un link puede unirse a ese partido sin registrarse,
   identificándose solo con un nombre.
2. Ese invitado puede volver al link más tarde — mismo dispositivo — y
   seguir siendo reconocido, sin volver a identificarse.
3. Ese invitado puede registrarse después y conservar su historial.
4. Ningún usuario puede ver partidos ni jugadores fuera de los suyos.
5. Cualquier usuario registrado puede crear partidos, con un tope de **2
   partidos activos por semana**, contando la semana de la fecha del
   partido.
6. Un usuario ve los partidos que creó y en los que participó, futuros y
   pasados, con los pasados limitados.

## No objetivos

- **Descubrimiento público.** No hay feed, ni búsqueda, ni partidos
  abiertos al que pase por ahí. Entrar requiere un link.
- **Revocar un link ya compartido.** La estructura que elegimos lo haría
  posible más adelante, pero no construimos la UI ni el flujo.
- **Identidad del invitado entre dispositivos.** Si limpia el navegador o
  cambia de teléfono, el invitado vuelve a identificarse. Es inherente a
  no tener cuenta.
- **Fusionar cuentas.** Si un invitado intenta registrarse con un correo
  que ya tiene cuenta, lo mandamos a entrar con esa cuenta; su historial
  anónimo queda donde está. No migramos nada.
- **Subir una cuenta anónima por magic link.** El invitado se sube por
  Google o por correo con contraseña. El magic link sigue funcionando
  para registrarse desde cero; ver *Identidad* para el porqué.
- **Directorio global de jugadores.** La pestaña Players desaparece y no
  se reemplaza.

## Anti objetivos

Cosas que harían esto un fracaso aunque funcione:

- Que alguien con el link, **sin haberse unido**, pueda ver quién juega.
- Que una URL de partido sea adivinable.
- Que un invitado anónimo pueda crear partidos.
- Que un invitado pierda su historial justo al registrarse — el momento
  en que más le dolería.

## Restricciones

Cuatro restricciones de Firestore moldean casi todo lo que sigue. No son
preferencias:

1. **No existe seguridad por campo.** Un documento se lee entero o no se
   lee. "Con el link ves el partido pero no el roster" es imposible
   dentro de un solo documento. Por eso el partido se parte en dos.
2. **Las reglas no pueden contar documentos ni garantizar atomicidad
   entre documentos.** Un tope real de 2 por semana no es expresable en
   reglas: un contador en el doc del usuario es burlable porque el
   cliente puede crear el partido sin tocarlo. El tope vive en el
   cliente; ver *Tope semanal*.
3. **`allow read` cubre `get` y `list` a la vez.** Hoy eso es la fuga
   principal: cualquier usuario firmado puede consultar la colección
   entera. Hay que separarlas.
4. **`array-contains` compara elementos completos.** No puede buscar
   dentro de un objeto del array. Por eso la lista de ids consultable se
   mantiene aparte de los nombres del roster.

Además, decisiones de contexto:

- **El proyecto se queda sin backend.** No hay `functions/` hoy y no lo
  agregamos. Es una restricción elegida, no técnica.
- **Firebase Anonymous Auth hay que habilitarlo en la consola de
  Firebase.** No es código; es un paso manual previo.

## Enfoques considerados

**1. El link es la llave.** Id de partido aleatorio e inadivinable,
`allow get: if isSignedIn()` para que quien tiene el link lea el partido,
y `allow list` restringido a pertenencia. Un solo documento, roster
incluido. Lo más barato: nada de colecciones nuevas ni sincronización.
Concede que quien tenga el link ve el roster completo aunque no se haya
unido, y que un link reenviado da lectura permanente sin forma de
revocarla.

**2. Invitación explícita — elegido.** El partido se parte en dos
documentos: uno privado solo para miembros, y un preview público con lo
mínimo para decidir si vas, sin nombres. El link abre el preview; al
unirte entras al roster y recién entonces ves quién juega. Da privacidad
real sobre un link filtrado y deja la puerta abierta a revocar. Cuesta
mantener dos documentos sincronizados en cada join, leave, +1 y cambio de
estado.

**3. Backend autoritativo.** Crear, unirse y salir pasan por Cloud
Functions; las reglas niegan escritura directa. El tope semanal y la
privacidad se vuelven código normal en lugar de reglas, y el tope pasa a
ser real. Cuesta un deployment que el proyecto no tiene, cold starts,
costo, y bastante más código para lo mismo.

**Elegido: 2.** La razón es el anti objetivo de que quien tiene el link,
sin unirse, no vea el roster. Con el enfoque 1 eso es imposible de
cumplir por la restricción de seguridad por campo. El 3 lo cumple
también, pero paga un backend entero por un tope semanal que a esta
escala no lo justifica — y si algún día lo justifica, el enfoque 2 no
estorba para llegar ahí.

## Diseño

### Modelo de datos

**`matches/{matchId}` — privado, solo miembros.**

El id pasa a ser aleatorio. Hoy es `match_${Date.now()}`, un timestamp:
cualquiera recorre timestamps y cae en partidos ajenos. Con el preview
público eso sería una fuga directa, así que el id inadivinable es
requisito, no mejora.

Campos que se mantienen tal cual: `title`, `date`, `location`,
`capacity`, `duration`, `price`, `status`, `joinedPlayerIds`,
`waitlistPlayerIds`, `guests`, `teams`, `creatorId`, `createdAt`,
`updatedAt`.

Campos nuevos:

- `roster: { [uid]: { name, role?, photoURL? } }` — los nombres
  denormalizados dentro del partido. Esto es lo que permite borrar
  `usePlayers`: hoy `resolveRoster` cruza `joinedPlayerIds` contra la
  lista global de usuarios, y sin esa lista los nombres no se resuelven
  desde fuera. Un mapa por uid cubre roster principal y lista de espera
  con una sola estructura.
- `creatorName` — el nombre del anfitrión, para mostrarlo sin leer su
  doc de usuario.
- `memberIds: string[]` — creador, roster principal y lista de espera en
  un solo array. Es lo que se consulta y lo que las reglas verifican.

`joinedPlayerIds` se queda como está porque sigue siendo la fuente de
verdad de quién ocupa cupo, separada de quién espera. No es duplicación
accidental con `memberIds`: son dos preguntas distintas, y la
restricción 4 obliga a que la consultable sea un array plano de ids.

**Por qué `memberIds` y no una disyunción.** La alternativa era consultar
`or(creatorId == uid, joinedPlayerIds array-contains uid)`, y agregar una
tercera rama para la lista de espera. Pero quien espera un cupo tiene que
ver el partido en su lista — está esperando justamente para enterarse de
que entró — y tres ramas con dos `array-contains` en una disyunción choca
con los límites de Firestore. Un solo array colapsa las tres condiciones
en una, y simplifica la consulta **y** la regla de `list` al mismo
tiempo. El costo es un array más que mantener en el batch, en el mismo
sitio donde ya se mantiene el preview.

**`matchPreviews/{matchId}` — público por id.**

Lo mínimo para que alguien decida si va: `title`, `date`, `duration`,
`location`, `price`, `capacity`, `occupiedCount`, `status`,
`creatorName`.

Lo que **no** lleva, y es el punto entero del enfoque: `roster`,
`joinedPlayerIds`, `guests`, `teams`, `waitlistPlayerIds`.

Colección de primer nivel, no subcolección de `matches`. Firestore no
borra subcolecciones al borrar el padre, así que por ese lado da igual —
los dos casos exigen borrado explícito. Primer nivel mantiene el
`writeBatch` simétrico y las reglas más legibles.

**Sincronización.** Cada mutación que toca un campo del preview escribe
los dos documentos en un `writeBatch`: crear, editar detalles, borrar,
unirse, salir, agregar o quitar +1, cambiar estado, y promover desde la
lista de espera. Este es el costo que aceptamos al elegir el enfoque 2 y
conviene concentrarlo en un solo módulo para que no se olvide en un
camino.

**`users/{uid}` — forma igual, lectura cerrada.**

Misma estructura. Lo que cambia es la regla: se lee solo el propio
documento. Eso es lo que cierra "no ver jugadores de otros partidos" en
la raíz, porque hoy cualquiera lista `users` completa.

**Los invitados anónimos no tienen documento de usuario.** Su nombre vive
en el `roster` de cada partido al que entran. Eso evita tocar el gate de
onboarding para ellos, evita cuentas a medio hacer, y tiene un efecto
secundario que me parece bueno: un invitado puede llamarse distinto en
partidos distintos sin que eso sea un bug.

### Identidad

**Firebase Anonymous Auth**, no un token propio en localStorage.

`signInAnonymously(auth)` crea un usuario real con `uid`, lo persiste en
el navegador por su cuenta, y `onAuthStateChanged` — el efecto que
`useAuth` ya tiene — lo recupera al volver. Gana sobre un token propio por
dos razones concretas:

- **Las reglas lo verifican.** Un anónimo tiene `request.auth.uid`, así
  que las reglas funcionan igual que con cualquiera. Un token propio en
  localStorage no es verificable en reglas; habría que abrir la escritura
  o montar Cloud Functions.
- **Registrarse después sale casi gratis.** `linkWithCredential` o
  `linkWithPopup` convierten la cuenta anónima en registrada
  **conservando el uid**. El historial lo sigue sin migración, que es
  exactamente el anti objetivo que más importaba.

**Cuándo se firma.** Solo cuando el visitante **actúa**, no cuando mira.
El preview se lee sin estar firmado, así que alguien que solo abre el
link para ver la hora no genera una cuenta anónima. La firma anónima
ocurre al pulsar "entrar al partido".

**localStorage** se queda, pero reducido a lo que es: un caché del nombre
para mostrarlo antes de abrir un partido. La identidad es el uid anónimo;
el localStorage es cosmético. Si se borra, el usuario sigue siendo el
mismo y su nombre se recupera del roster del partido que abra.

**El gate de `useAuth`** tiene que dejar pasar al anónimo directo a
`ready`: sin carga de perfil, sin `verify-email`, sin onboarding, con un
perfil sintetizado localmente desde el uid y el nombre guardado. Hoy el
gate asume que todo usuario firmado tiene o tendrá un doc en `users`.

**Al registrarse**, se sube la cuenta anónima sobre `auth.currentUser`, y
después el onboarding normal crea `users/{uid}`.

La app tiene hoy tres caminos de registro, y **solo dos se ofrecen al
invitado que se sube**:

- **Google** — `linkWithPopup`, con `linkWithRedirect` más
  `getRedirectResult` para el caso de popup bloqueado, espejando la
  lógica de `POPUP_FALLBACK_CODES` que `signInWithGoogle` ya tiene.
- **Correo con contraseña** — `linkWithCredential` con
  `EmailAuthProvider.credential(...)`, más `sendEmailVerification`.

**El magic link queda fuera como camino de subida.** No es un olvido:
`completeMagicLinkIfPresent` corre al cargar la página en frío y llama a
`signInWithEmailLink`, que firma a un usuario distinto y **descarta el
uid anónimo**. Eso ejecuta el anti objetivo — perder el historial justo
al registrarse — y además en silencio. Conservarlo exigiría
`EmailAuthProvider.credentialWithLink` y garantizar que la sesión anónima
ya se restauró antes de que ese efecto corra, lo cual el orden de efectos
actual de `useAuth` no asegura. Ofrecer un camino que destruye el
historial sin avisar es peor que no ofrecerlo, así que el invitado ve dos
botones y no tres.

El magic link **sigue disponible tal cual** en la pantalla de login
normal, para quien se registra desde cero. Lo que no hace es aparecer en
la pantalla de "crear cuenta" del invitado.

**Consecuencia de subir por correo con contraseña:** `allow create`
exige correo verificado, así que el recién subido no puede crear
partidos hasta verificar — mientras que quien sube por Google sí, porque
Google ya cuenta como verificado. Es el mismo trato que reciben hoy los
registrados, así que lo dejo consistente en lugar de hacerle una
excepción.

Si el correo ya tiene cuenta, Firebase devuelve
`auth/credential-already-in-use`: mostramos un mensaje que lo manda a
entrar con esa cuenta. Decisión mía, y está en los no objetivos: no
fusionamos.

### Reglas de Firestore

Helper nuevo, porque `isSignedIn()` ahora incluye anónimos y eso antes
equivalía a "registrado":

```
function isRegistered() {
  return isSignedIn()
    && request.auth.token.firebase.sign_in_provider != 'anonymous';
}
```

Esto hay que revisarlo en **todas** las reglas existentes que usan
`isSignedIn()`. Cada una tiene que decidir si admite anónimos o no; el
cambio no es solo agregar reglas nuevas.

**`matches/{matchId}`**

- `allow get`: `request.auth.uid in resource.data.memberIds`, o super
  admin. Quien espera un cupo está en `memberIds`, así que ve el partido
  — está esperando justamente para enterarse de que entró.
- `allow list`: el mismo predicado. Firestore evalúa la regla contra cada
  documento devuelto, así que una consulta que no esté acotada a
  pertenencia falla entera. Eso es lo que queremos.
- `allow create`: `isRegistered()` con correo verificado, `creatorId ==
  request.auth.uid`, e `isValidId(matchId)`. El flag `admin` deja de ser
  requisito para crear.
- `allow update`: dueño del partido, o `onlyRosterChanged()`, con el tope
  de capacidad. Ver abajo: el helper de hoy no sirve tal cual.
- `allow delete`: dueño del partido, igual que hoy.

**`onlyRosterChanged()` hay que ampliarlo, y acotarlo.** Hoy es
`affectedKeys().hasOnly(['joinedPlayerIds','waitlistPlayerIds','guests','updatedAt'])`.
No incluye `roster` ni `memberIds`, y unirse escribe los dos — así que
tal cual está, **toda entrada de un no dueño sería denegada**. Hay que
agregarlos.

Pero agregar `roster` entero deja que cualquier miembro reescriba o borre
el nombre y la foto de **todos los demás**. Los nombres son precisamente
lo que acabamos de volver privado, y un desconocido con el link
renombrando el roster queda demasiado cerca de los anti objetivos.

**Decisión mía: la escritura de `roster` se acota a la clave propia.**

```
request.resource.data.roster.diff(resource.data.roster)
  .affectedKeys().hasOnly([request.auth.uid])
```

Eso tiene una consecuencia que no es solo de reglas: el camino de unirse
**debe** escribir por ruta punteada `roster.<uid>`, nunca el mapa
completo. Y encaja con que quien se une está ciego — no puede leer el
documento, así que no podría reconstruir el mapa entero ni queriendo. El
módulo del batch tiene que exponerlo así.

**Decisión mía: al salir o ser promovido, la entrada en `roster` se
queda.** Es más barato, mantiene el nombre disponible para el historial
de `teams`, y no obliga a ensanchar la regla por clave para permitir
borrados ajenos.

**El tope de capacidad es una comprobación de no empeorar, no un `<=`
absoluto.** Un partido heredado, o uno al que el anfitrión le bajó la
capacidad, puede estar ya por encima del tope; con un `<=` duro nadie
podría salirse de él. La regla tiene que permitir cualquier cambio que no
aumente la ocupación, y exigir el tope solo cuando aumenta.

**Detalle que importa:** quien se une escribe en un documento que todavía
no puede leer. Firestore lo permite — las reglas corren en el servidor
con acceso completo a `resource.data`, así que capacidad y diff de roster
se siguen verificando aunque el cliente esté ciego. El cliente decide
roster vs lista de espera leyendo `occupiedCount` del preview, que puede
estar levemente desactualizado; la regla de capacidad es la que manda.

**`matchPreviews/{matchId}`**

- `allow get: if true` — el link funciona sin cuenta.
- `allow list: if false` — nadie enumera la colección.
- `allow create, delete`: dueño del partido.
- `allow update`: dueño del partido, o cualquier firmado cambiando solo
  `occupiedCount`, `status` y `updatedAt`.

Esa última concesión es consciente: alguien firmado que conozca el id
podría falsear el contador del preview. El daño es cosmético — un número
de cupos equivocado en la pantalla de invitación — porque el tope real
vive en la regla de capacidad del documento privado, y ahí no se puede
mentir.

**`users/{userId}`**

- `allow get`: solo el propio documento. Cambia desde `isSignedIn()`.
- `allow list: if false`.
- `create`, `update`: como hoy, más `isRegistered()`.

El super admin (`SUPER_ADMIN_EMAIL`, hoy espejado entre
`src/utils/matches.ts` y `firestore.rules`) conserva escritura sobre
todos los partidos y `get` de cualquiera por id. Ese espejo sigue
necesitando mantenerse a mano en los dos lados.

**No hay vista de todos los partidos, y el permiso de `list` no lleva
rama de super admin.** La única consulta que existe es por pertenencia,
así que una rama para el super admin sería un permiso que nada ejercita.
Para ver un partido en el que no estás: abrirlo por su link, o la consola
de Firebase. Si algún día hace falta la vista, se agrega la consulta sin
filtrar y la rama de reglas juntas — es aditivo, no un rediseño.

**El flag `admin` se borra, decisión mía.** Existía para una sola cosa —
"only admins can host matches", como dice el comentario en
`UserProfile` — y abrir la creación a cualquier registrado lo deja sin
trabajo. Tus privilegios no dependen de él: vienen de
`SUPER_ADMIN_EMAIL`, que es independiente y se queda, junto con
`superAdminMode`. Se va el campo `admin` de `UserProfile`, el helper
`isAdmin()` de las reglas, y la condición `profile?.admin` de
`createMatch`.

### Consultas

`usePlayers` se borra. `useMatches` se reemplaza por dos consultas sobre
`memberIds`:

- **Futuros:** `memberIds array-contains uid` con `date >= now`, orden
  ascendente.
- **Pasados:** lo mismo con `date < now`, orden descendente, `limit(10)`.

Un solo `array-contains` cubre creador, roster y lista de espera, así que
no hace falta disyunción. El creador se queda en `memberIds` aunque se
salga de su propio partido, que es el caso que antes obligaba a la rama
`creatorId`.

Diez pasados es mi propuesta para el límite que pediste. Es una pantalla
de scroll razonable y se cambia en una línea.

Estas consultas necesitan índices compuestos en Firestore. Hay que
crearlos; el error de consola trae el link que los genera.

### Nombres que envejecen

`roster[uid].name`, `roster[uid].photoURL` y `creatorName` son copias de
`users/{uid}`, y Ajustes deja cambiar nombre y foto. Sin lista global de
usuarios no hay de dónde refrescarlos, así que un cambio de nombre
dejaría el nombre viejo en todos los partidos del usuario — incluidos los
futuros, donde sí importa.

**Refresco oportunista, decisión mía.** Al abrir un partido del que eres
miembro, si tu entrada en `roster` no coincide con tu perfil, se
reescribe tu propia clave. Una escritura chica, sin batch multi
documento, y usa exactamente el permiso que la regla ya te da sobre tu
clave. Los partidos que no abras quedan con el nombre viejo, y eso me
parece aceptable: nadie los está mirando.

Descarté reescribir todas tus entradas al guardar el perfil. Necesita la
consulta de pertenencia más un batch sobre partidos que no son tuyos, y
paga mucho por un caso que el refresco oportunista cubre cuando de verdad
se nota.

### Tope semanal

**2 partidos activos en la semana de la fecha del partido.** Activo es
`status` en `needs_players` o `confirmed` — el filtro que
`countLiveMatches` ya hace. Borrar o cancelar libera el cupo solo, porque
es una pregunta sobre el estado actual y no un historial acumulado: no
hay contador que llevar.

Por semana de la fecha del partido, no global. Puedes tener dos activos
esta semana y dos la próxima; lo que no puedes es un tercero en la misma
semana. Un anfitrión que organiza el mes completo no se queda atascado.

**Cuentan solo los partidos que yo creé**, no los que juego. El tope
existe para frenar abuso de la creación, que es lo que estamos abriendo.
Si contara cualquier partido activo en el que estoy, alguien que se une a
dos partidos de amigos el jueves no podría organizar el suyo el sábado —
castigar al que juega mucho es justo lo contrario de lo que queremos.

**La semana va de lunes a domingo, en la zona del navegador.** Es la
semana futbolística normal, y la app ya construye las fechas en hora
local (`new Date(\`${day}T${time}\`)`).

**Se verifica en el cliente, con su propia consulta.** Por la restricción
2, las reglas no pueden contar.

Y no puede reutilizar la consulta de "mis partidos", aunque sea tentador:
un partido del lunes pasado ya es "pasado", y los pasados vienen con
`limit(10)`. Si el usuario tiene diez pasados más recientes que esa
semana, el conteo sale corto y el tope no topa. Así que el chequeo lleva
su propia consulta, acotada a la semana de la fecha elegida:
`creatorId == uid`, `date` dentro de esa semana, estado activo.

Frena el abuso accidental; no frena a alguien que abra la consola y use
el SDK directo. El daño máximo son documentos basura en una base que es
tuya y que vas a ver. Cuando eso pase de verdad, se sube a una Cloud
Function — y es mejor tenerla cuando exista el problema.

**Dónde aparece.** El tope depende de la fecha elegida, así que el aviso
vive en el campo de fecha del formulario: al elegir un día con dos
partidos ya activos, el campo explica por qué. No un botón muerto antes
de abrir el formulario, que no diría nada útil.

### Interfaz

**Navegación — opción C, sin pestañas.** `BottomNav` se borra y con él la
máquina de `AppTab`. Ajustes se queda detrás del avatar del header, que
es donde ya entra: `AppHeader` ya recibe `onOpenSettings`. Con solo dos
destinos y siendo uno de ellos Ajustes, una barra inferior de dos
botones es andamio.

Queda una pantalla de scroll: botón de crear arriba (solo registrados),
sección Próximos, sección Pasados atenuada y limitada.

**Lo que se borra:** `PlayersTab`, `usePlayers`, `MatchesTab`,
`BottomNav`, y el contador "Total players" del Dashboard, que sin lista
global de usuarios no tiene de dónde salir. `DashboardTab` se absorbe en
la pantalla única.

**Pantalla de invitación.** Lo que ve quien abre el link sin ser miembro:
título, fecha y hora, lugar, cupos ocupados sobre capacidad, nombre del
anfitrión, un campo de nombre, y un botón para entrar. **Sin roster.**
Ese es el anti objetivo hecho pantalla.

Si el preview viene lleno, el botón ofrece **entrar a la lista de
espera** en lugar de decir solo "completo" — `WAITLIST_SLOTS` ya existe y
el preview ya trae el conteo, así que negarlo sería perder al jugador por
nada. Y como el cliente decide a ciegas con un contador que puede venir
desactualizado, cuando la regla de capacidad rechace una entrada el
camino reintenta como lista de espera en vez de fallar.

**El invitado anónimo** ve la misma pantalla única, sin botón de crear, y
con una invitación a crear cuenta. Los partidos pasados funcionan igual
para él. Puede agregar y quitar su +1 como cualquier asistente: lo único
que se le niega es crear partidos.

## Lo que queda al constructor

- **Cómo generar el id aleatorio.** Mi sugerencia:
  `doc(collection(db, 'matches'))` y usar su `.id`. Son 20 caracteres
  aleatorios, es gratis, y ya pasa el `isValidId` de las reglas sin
  tocarlo. `crypto.randomUUID()` también sirve.
- Las claves de i18n nuevas en `en.ts` y `es.ts`.
- La forma exacta del módulo que concentra el `writeBatch` partido +
  preview.
- Las definiciones de los índices compuestos.
- El orden de implementación y cómo se migran los partidos que ya
  existen en la base — incluido si vale la pena migrarlos o si se
  descartan.
