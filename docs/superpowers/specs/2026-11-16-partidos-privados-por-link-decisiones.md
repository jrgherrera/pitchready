# Decisiones tomadas durante la ejecución

Acompaña a `2026-11-16-partidos-privados-por-link-design.md` (el diseño) y
`../plans/2026-11-16-partidos-privados-por-link.md` (el plan).

Este documento existe porque el plan se ejecutó con subagentes y, a lo largo de
doce tareas, hubo decisiones que no estaban en el diseño y que tomé yo. El
proceso pide que lleguen al dueño en lugar de morir con el directorio de
trabajo. Cada una lleva **qué cuesta si está mal**, porque eso es lo que
permite rehacerla sin reconstruir el razonamiento.

Están en el orden en que se tomaron, agrupadas por tarea.

---

## Lo primero que deberías leer: siete premisas mías resultaron falsas

De todas las decisiones de abajo, estas son las que más importan, porque
afirmé cada una con seguridad y cada una fue refutada midiéndola. Las cuatro
primeras son sobre el mismo mecanismo.

1. **Cómo Firestore valida una consulta de lista.** Decidí que una consulta por
   `creatorId == uid` pasaría una regla de `list` basada en pertenencia, porque
   "Firestore evalúa documento por documento". No es así: valida contra **lo que
   los filtros de la consulta demuestran** — *rules are not filters*. Mi versión
   habría **roto crear partidos para todos**, porque el tope semanal corre antes
   de cada creación. Lo encontró un implementador probándolo en el emulador.
2. **Que el creador siempre es miembro.** Afirmé que la rama del creador no
   concede documentos extra "porque la restricción derivada lo garantiza". Esa
   invariante solo aplica a escrituras que tocan `memberIds`; `create` no la
   constriñe y el camino del dueño la esquiva. **Esa afirmación falsa llegó a
   escribirse como comentario de seguridad en las reglas** antes de que un
   revisor la desmontara. La regla es correcta, pero por una razón más fuerte
   que la que yo di.
3. **Que una lista denegada devuelve cero documentos.** Reinstalé un permiso de
   super admin argumentando que sin él una denegación "parecería una migración
   terminada". Una lista denegada devuelve `permission-denied`, no un conjunto
   vacío. El permiso se quitó.
4. **Que un error en cualquier rama de un `||` deniega.** De ahí saqué que el
   orden de los operandos era obligatorio y que ciertos `.get(..., default)`
   eran portantes. Medido: `error || true` **permite**, `error || false`
   deniega. Ninguna de las dos cosas era cierta. El comentario de las reglas
   ahora registra la medición *y que una revisión anterior de sí mismo afirmaba
   lo contrario*.
5. **Que la precedencia de `&&` sobre `||` bastaba** para proteger una rama.
   No bastaba: `isSignedIn() && A || B` deja `B` sin guardia, y `B` también
   desreferencia `request.auth`.
6. **Que un doble envío es inofensivo** porque las reglas lo rechazan. La mitad
   correcta: el rechazo ocurre. La mitad que importaba: ese rechazo dispara un
   reintento que **sí** pasa, dejando al usuario en las dos listas a la vez.
7. **Que mis dos restricciones acopladas cubrían la integridad del roster.**
   Son restricciones **de conjunto**: la derivada comprueba que `memberIds` sea
   la unión de creador + roster + lista de espera, y la de diferencia simétrica
   comprueba cuánto cambió esa unión. Las dos son **ciegas, por construcción**, a
   cualquier escritura que mueva un uid *entre* las listas que alimentan la
   unión, porque la unión no cambia. Llevaba toda la rama tratándolas como si
   cubrieran el roster; cubren la pertenencia, que es estrictamente menos. El
   reintento de la última ola pasaba las tres restricciones dejando a un jugador
   en el roster **y** en la lista de espera a la vez. Lo encontró la
   re-revisión, con un sondeo contra el emulador.

El patrón, que vale más que las siete: **todas eran afirmaciones sobre
mecanismos que no probé, con un emulador disponible.** Las que llegaron al
código fueron las que afirmé con más firmeza. La única que se atrapó antes de
llegar a ninguna parte fue la sexta, y solo porque la mandé a verificar por
sospechar de ella — halagaba una decisión anterior mía.

La séptima es la más instructiva de todas, porque no era un hecho que no
verifiqué sino **un razonamiento que nunca hice**: supuse el alcance de mis
propias reglas en lugar de derivarlo. Y la misma forma de error — el doble
envío — mordió **tres veces** en esta rama por tres puertas distintas. Si
alguna vez una escritura futura reordena `joinedPlayerIds` contra
`waitlistPlayerIds`, las reglas no la van a parar: hay que guardarla en el
cliente, o escribir una regla que compare las listas y no su unión.

---

## Tarea 1 — helpers puros

- **`PAST_MATCH_LIMIT` vive en `utils/matches.ts`, no en `weeks.ts`.** Es un
  límite de longitud de lista, sin relación con semanas, y `WAITLIST_SLOTS` —
  la misma clase de constante — ya estaba ahí. *Si está mal:* se mueve un
  import.
- **Los checks que importan i18n corren con `NODE_NO_WARNINGS=1`.**
  `i18n/locale.ts` lee el global `localStorage` y Node 26 responde con un
  `ExperimentalWarning`. El ruido es de Node, no del código. *Si está mal:* se
  silencia un aviso que importaba; bajo, porque es el único observado.

## Tarea 2 — arnés de reglas

- **`@firebase/rules-unit-testing` queda en `^5`, no en la última.** La v6 exige
  `firebase ^13` y el repo está en `^12`. El `npm install` pelado del plan falla
  con ERESOLVE. **No actualizar sin mover `firebase` primero.** *Si está mal:*
  nada, la alternativa no instala.
- **Las tres aserciones que afirman que tus fugas de hoy *funcionan* son
  deliberadas.** Fijan el comportamiento previo para que cerrarlo quede
  demostrado y no supuesto. La tarea 6 las invierte.

## Tarea 3 — módulo de escritura

- **`saveTeams` se queda donde está.** Llegó con el merge de `team-draft` y el
  plan no la lista. Escribe `teams`, que nunca es campo del preview, así que no
  necesita batch. *Si está mal:* necesitaría el mismo trato, cambio aditivo.
- **La escritura de `roster` se acota a la clave propia, por ruta punteada.**
  Sin eso, cualquier miembro reescribe el nombre de todos los demás — y los
  nombres son justo lo que el proyecto vuelve privado.
- **Al salir de un partido, tu entrada en `roster` se queda.** Más barato y
  mantiene el nombre para el historial de equipos.
- **El tope de capacidad permite cualquier cambio que no empeore la ocupación.**
  Un partido heredado puede ya estar por encima; con un `<=` duro nadie podría
  salirse de él.
- **La promoción desde la lista de espera al agregar un +1 se revirtió.** Un
  revisor demostró que era alcanzable: cupo 12, 9 jugadores, 3 en espera, y
  pulsar "+1" promovía a dos personas ajenas en silencio. *Si está mal:* subir
  el cupo deja la espera quieta hasta que alguien salga, que es el
  comportamiento de siempre.
- **`handleFirestoreError` se anotó `: never`.** Siempre lanza, pero nada en los
  tipos lo decía, y un camino caía a `return matchId` después de llamarlo —
  habría reportado un partido creado que no existe. Esa anotación resultó útil
  dos veces más adelante.

## Tarea 3b — ampliar las reglas de escritura (insertada durante la ejecución)

- **El plan estaba mal ordenado y lo partí.** Decía que la tarea 3 "se despliega
  detrás de las reglas permisivas y nada se rompe". Tus reglas eran permisivas
  para **lectura**, no para escritura: `matchPreviews` no tenía bloque, y
  Firestore deniega lo que ningún `allow` concede. Ese commit solo habría roto
  crear, editar, unirse, salir, +1 y borrar. La corrección: ampliar escrituras
  primero (tarea 3b), cerrar lecturas después (tarea 6).
- **`memberIds` se **deriva** del roster además de acotarse.** Acotar la
  diferencia simétrica impedía borrar a los demás pero **no** auto-admitirse:
  `arrayUnion(miUid)` pasaba, fuera del cupo e invisible en tu UI. Las dos
  restricciones conviven porque cubren ataques distintos y cada una parece
  redundante al lado de la otra.
- **La regla de capacidad lee el cupo del documento guardado, no del enviado.**
- **El contador del preview se valida contra el partido real.** Dejó de ser un
  número libre. Resultó proteger más de lo previsto: también hace imposible un
  contador duplicado.
- **El `create` del preview se queda solo-dueño.** Abrirlo a cualquier miembro
  dejaría a cualquiera crear `matchPreviews/<id>` con contenido inventado, y un
  preview público falso es peor que la ventana que cierra.

## Tarea 4 — backfill

- **El backfill normaliza fechas string a `Timestamp`.** El plan no lo pedía.
  Firestore ordena por tipo antes que por valor, así que una fecha string no
  satisface **ningún** rango — el partido sería invisible en la lista de
  próximos *y* en la de pasados. (Tu base no tenía ninguna; el trabajo salió de
  más, y lo haría igual.)
- **Los partidos viejos conservan sus ids adivinables.** No se puede cambiar el
  id de un documento, y recrearlos rompería links guardados y vaciaría rosters.
  Envejecen al volverse pasados.
- **Un partido que el script no puede arreglar se reporta `NEEDS ATTENTION` con
  código de salida distinto de cero.** Antes salía como "ya estaba listo", con
  resumen limpio y exit 0, para siempre. Un script que miente sobre haber
  terminado es peor que uno que falla.
- **Cero partidos encontrados es su propio error ruidoso.** Si el listado se
  deniega, `getDocs` devuelve cero documentos y no un error: una denegación
  sería indistinguible de una migración terminada.
- **El índice compuesto se declara en `firestore.indexes.json`.** El plan decía
  "sigue el link del error en la consola", que funciona una vez y se pierde.
- **El script pasó al Admin SDK con service account.** Se autenticaba con
  contraseña, y yo no manejo contraseñas — aparte de que tu cuenta podía no
  tener una.
- **`scripts/` entró al typecheck.** Estaba fuera del `tsconfig`, así que un
  script de migración a punto de correr contra datos reales nunca pasaba por
  `tsc`.

## Tarea 5 — consultas por pertenencia

- **El `email` desapareció del roster, y es el diseño.** Los miembros ven
  nombre, rol y quién trae +1 — el correo nunca estuvo en esa lista y
  identifica más de lo que el feature necesita. Antes salía de la lista global
  de usuarios, que se borró.
- **Un `permission-denied` se silencia solo en un listener que ya había
  entregado datos.** Al salirte de un partido te quitas el acceso a ti mismo y
  el listener protesta: eso es esperado. El implementador lo acotó más de lo que
  pedí, a "ya había entregado un snapshot **del servidor**", porque la caché
  persistente de Firestore hacía que la versión anterior entrara en un **bucle
  infinito silencioso** sirviendo datos viejos — y funcionaba bien en pruebas,
  fallando solo en producción con caché poblada.
- **Un servidor que alterna permitir y denegar reintenta sin tope, y se acepta.**
  Cada ciclo necesita una ida y vuelta real al servidor y entrega datos frescos,
  y un tope absoluto también se dispararía con entradas y salidas legítimas
  repetidas.

## Tarea 6 — cerrar las lecturas

- **El permiso de super admin para *enumerar* partidos se quitó.** Lo había
  defendido con un argumento inexistente (ver premisa 3 arriba). El argumento
  decisivo en contra: la consola está protegida por IAM de Google, mientras esa
  cláusula hacía la misma enumeración alcanzable **desde cualquier sesión de
  navegador con un token de ese correo** — un XSS, una sesión robada, un portátil
  prestado. Se conserva para leer **un** partido por id, que es otra clase de
  costo.
- **`list` conserva una rama por `creatorId`.** El tope semanal consulta así, y
  sin esa rama la consulta se deniega y **crear partidos se rompe para todos**.
- **Se fuerza un refresco de token tras subir de cuenta un invitado.**
  `isRegistered()` lee `sign_in_provider`, y si un token linkeado conserva
  `anonymous`, el onboarding y el primer partido del usuario recién registrado
  quedan denegados — el flujo estelar del feature. Nadie puede verificarlo fuera
  de producción; forzar el refresco es inofensivo si el token ya rotaba.
- **El flag `admin` se retiró.** Tus privilegios vienen de `SUPER_ADMIN_EMAIL`,
  que es independiente y se queda.

## Tareas 7 a 11 — identidad, invitación, creación, pantalla única

- **El magic link no sube cuentas anónimas.** `completeMagicLinkIfPresent` corre
  al cargar en frío y firma a un usuario distinto, **descartando el uid anónimo**
  — es decir, borrando el historial en silencio justo al registrarse. Sigue
  funcionando para registrarse desde cero; solo no se ofrece al invitado.
- **El nombre de invitado se limpia después del onboarding, no al subir de
  cuenta.** El sitio obvio vaciaría la caché antes de que el onboarding la lea.
- **El tope semanal cuenta solo partidos que creaste**, no los que juegas.
  Contar los que juegas castigaría al que juega mucho.
- **El tope es del cliente y se puede saltar desde la consola.** Las reglas de
  Firestore no pueden contar documentos; forzarlo de verdad necesitaría una
  Cloud Function, que este proyecto no tiene. El daño máximo son documentos
  basura en una base que es tuya y que vas a ver.
- **Si la consulta del tope falla, falla abierto pero ruidoso.** Antes se tragaba
  el error, así que el tope podía dejar de topar aparentando funcionar.
- **El tope de la lista de espera no se hace cumplir, y se acepta.** Siempre fue
  un límite blando del cliente que las reglas nunca impusieron; que una quinta
  persona espere no daña a nadie, y forzarlo pediría un campo nuevo en el
  preview más una regla.
- **Un usuario registrado sin verificar sí llega a la pantalla de invitación.**
  Unirse no necesita correo verificado — solo crear lo necesita.
- **Un reintento no se dispara si quien entra ya es miembro.** La regla de
  lectura sirve como oráculo de pertenencia gratis; sin eso, un doble envío
  dejaba el mismo uid en las dos listas.
- **El retroceso del reintento se guarda en el cliente, no en las reglas.** Un
  reintento como lista de espera sobre alguien que ya está en el roster deja al
  uid en las dos listas, y **ninguna regla puede verlo** (premisa 7). Se cortó
  con dos guardias en `joinMatch`. *Si está mal:* vuelve el roster corrupto del
  párrafo anterior; el check que lo acompaña fija el comportamiento de
  `buildJoinPatch` que las guardias compensan, y dice por escrito que seguirá
  pasando si alguien borra las guardias.
- **Una `capacity` ausente vale 10, y se resuelve en `toMatch`.** Las reglas ya
  la leían como 10, pero el backfill no la escribe, así que un documento
  reconstruido lleva `memberIds` sin `capacity`. Sin el valor por defecto
  `isMatchFull` siempre da falso y `getCapacityPercent` y `getSpotsLeft`
  devuelven **NaN**, que se renderiza. Va en el embudo donde el documento se
  vuelve `MatchData`, no en cada consumidor. *Si está mal:* una línea.
- **El fallo de los dos listeners se marca por consulta, no con una bandera
  compartida.** Usan índices compuestos distintos, así que uno puede fallar solo,
  y una bandera única escondía los partidos ya cargados detrás de un error de la
  otra consulta. *Si está mal:* se vuelve a una bandera.
- **La sección de pasados se atenúa con color, no con `opacity`.** Un
  `opacity-60` sobre todo el bloque caía bajo el contraste mínimo de WCAG. El
  texto más apagado quedó en ≈7.7:1, sobre AA y sobre AAA.

---

## Lo que no está verificado, y no puede estarlo aquí

Este proyecto no tiene framework de tests y no se le añadió, por decisión del
dueño. Las funciones puras llevan `*.check.ts`; las reglas se prueban con el
emulador. Lo que queda sin cobertura automática, por imposibilidad y no por
descuido:

- Todas las pantallas, hooks y listeners de Firestore.
- **Las llaves de los placeholders de i18n**, y solo esas. Aquí me corrigió la
  re-revisión: `es.ts` está tipado contra el catálogo inglés, así que `tsc` **sí**
  detecta una clave que falte — lo demostró borrando una y corriendo el lint. Lo
  que nada atrapa es una llave simple: `{count}` compila perfecto y se renderiza
  literal. El agujero es más estrecho de lo que yo había registrado, pero existe.
- Los caminos de linkeo de cuenta, el refresco de token y el estado atascado.
- Si el token de una subida de cuenta conserva `sign_in_provider: 'anonymous'`.
  El emulador usa tokens falsos; solo se observa en producción.

La lista de comprobaciones manuales que quedan pendientes vive en el reporte de
cada tarea, y la más importante es: **subir un invitado a cuenta real por Google
y por contraseña, completar el onboarding y crear un partido.**
