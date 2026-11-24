# Enfoque · Concurso de fotografía

React + TypeScript + Vite, react-photo-album y Supabase.

## Ejecutar

    npm install
    npm run dev

Configura `.env.local` a partir de `.env.example`. El cliente solo admite la clave publicable. Las claves de servidor no deben entrar en ninguna variable `VITE_*`.

## Estado de esta implementación

La galería consulta fotos publicadas en páginas de 24 registros. Conserva páginas en memoria, usa miniaturas y pide la ampliación al abrir el diálogo. La prueba local sigue disponible desde «Ver fotografías de muestra» y no envía archivos al servidor. El panel independiente `/admin` permite gestionar fotos y el período de votación; requiere aplicar la nueva migración y autorizar una cuenta en `admins`.

La base de datos tiene `admins`, `photos`, `votes`, `vote_totals` y una cola privada de cambios. Los totales se actualizan mediante un trigger transaccional: insertar suma un voto, cambiarlo aplica la diferencia y eliminarlo descuenta el voto. Los clientes no pueden modificar los totales ni ejecutar la operación de publicación.

La Edge `publish-vote-totals` está desplegada. Un job de pg_cron revisa pendientes cada 10 segundos y la invoca solo cuando hay cambios. La Edge llama una RPC que bloquea hasta 100 fotos pendientes, publica un lote privado y elimina los pendientes en una sola transacción. Un fallo revierte la operación y deja los cambios para reintento. El token del worker está en Edge Secrets y Supabase Vault, nunca en el frontend.

El cliente crea una sesión anónima al primer voto o al activar expresamente los resultados en vivo. Un canal privado permite recibir totales, pero no publicarlos. Las versiones evitan aplicar eventos duplicados o antiguos. La aplicación consulta una instantánea al conectar y reconectar, pausa el canal al ocultar la pestaña y no recarga fotos por cambios de votos.

**Verificado:** la migración `*_broadcast_payload_object.sql` está aplicada y el historial remoto está sincronizado. La prueba entre dos sesiones pasó con el worker programado: altas y ediciones de votos actualizan el otro navegador sin nuevas descargas de imágenes. También se verificaron persistencia tras recarga y ampliación bajo demanda.

**Limpieza completada:** se retiraron la fotografía temporal y las cuentas anónimas generadas por las pruebas. La consulta final confirmó cero fotos y cero cuentas de prueba. El job `contest-publish-totals` está activo y su última ejecución terminó correctamente. La prueba verificó también que el navegador observador no hizo nuevas consultas de totales al recibir los cambios.

## Imágenes y transferencia

- Miniaturas WebP: máximo 480 px y **20 000 bytes**.
- Ampliaciones WebP: máximo 1600 px y 500 KiB.
- Entradas locales: JPEG/PNG/WebP, máximo 15 MiB y 30 MP decodificados.
- El navegador reduce calidad y luego dimensiones en intentos limitados, respeta EXIF, evita ampliar y verifica el MIME.
- Las cuatro miniaturas de muestra suman 51 418 bytes. Metadatos en `src/data/sample-images.json`.
- Regenerar muestras: `python scripts/generate_sample_images.py` (requiere Pillow).

La subida del administrador envía solo las variantes, conserva rutas UUID estables y usa `cacheControl: '31536000'` y `upsert: false`. No añade marcas de tiempo a las URL ni precarga ampliaciones. El CDN sigue consumiendo cached egress; la caché del navegador evita transferencias repetidas mientras conserva el recurso. La cuota depende del tráfico total.

## Verificación

    npm run build
    npm run lint
    npm test
    npm run test:ui

`test:ui` usa Playwright con Microsoft Edge y comprueba las miniaturas, la carga de ampliaciones, el retorno del foco, la compresión real en navegador y el ancho móvil.

Pruebas SQL con fixtures en una transacción que revierte al finalizar:

    npx supabase db query --remote --file supabase/tests/permissions.sql --yes
    npx supabase db query --remote --file supabase/tests/totals.sql --yes
    npx supabase db query --remote --file supabase/tests/voting-period.sql --yes
    npx supabase db advisors --remote --type all --level warn

La prueba de integración `tests/contest.spec.ts` es optativa (`RUN_SUPABASE_E2E=1`). Requiere la foto temporal indicada en el test. Usa dos cuentas anónimas reales y registra sus UUID en `.temp` para retirarlas al terminar. Las imágenes remotas del fixture se responden localmente; los votos, Auth y Broadcast usan Supabase real. No ejecutarla sin preparar y limpiar sus fixtures.

## Despliegue del worker

    npx supabase secrets set --env-file <archivo-privado-del-worker> --yes
    npx supabase functions deploy publish-vote-totals --use-api --yes

El archivo privado contiene `WORKER_TOKEN`. El mismo valor debe guardarse en Vault como `contest_totals_worker_token` antes de programar la función. El endpoint rechaza llamadas sin ese token aunque `verify_jwt` esté desactivado; no es un endpoint público de votación. En otro proyecto, adaptar la URL del job.

Las advertencias del asesor sobre acceso anónimo deben revisarse según su propósito: lectura pública, votos propios y recepción de totales son intencionales. La pertenencia a `admins` sigue siendo el requisito de autorización para fotografías y Storage.

## Caché persistente en el dispositivo

`public/image-cache.js` aplica una estrategia cache-first a variantes públicas de fotografía. El worker se registra antes de mostrar la galería, funciona en HTTPS y localhost y conserva las imágenes entre visitas. Una coincidencia en Cache Storage no genera revalidaciones ni peticiones de red.

- Miniaturas: hasta 200 entradas de un máximo de 20 000 bytes cada una.
- Ampliaciones: hasta 24 entradas de un máximo de 500 KiB cada una.
- Al superar el límite se retiran las entradas guardadas más antiguas. Si falta espacio o el almacenamiento no está disponible, la galería sigue cargando normalmente.
- Solo se guardan respuestas correctas WebP/AVIF de las fotos de muestra y de las rutas UUID públicas del bucket `concurso-fotos` del proyecto configurado.
- No se almacenan HTML, scripts, API, votos, totales, autenticación, URLs firmadas, archivos temporales de memoria ni URLs con parámetros.
- Las imágenes remotas usan CORS anónimo. Los archivos publicados deben conservar rutas inmutables: para cambiar una foto hay que usar un UUID/URL nuevo.
- El navegador puede liberar Cache Storage por falta de espacio o si el usuario borra sus datos. La caché reduce descargas repetidas mientras se conserve; no convierte la aplicación completa en una aplicación sin conexión.

`tests/cache.spec.ts` verifica persistencia tras recargar, una sola descarga de una miniatura que simula Storage, imágenes servidas sin conexión con la caché HTTP deshabilitada y ausencia de datos dinámicos en las cachés. El worker deja intacta la actualización de totales por Broadcast.

## Panel independiente y fechas de votación

`/admin` se carga en un módulo separado. Inicia sesión por correo y contraseña y comprueba la pertenencia a `public.admins`. Usa otra clave de sesión local para conservar la identidad anónima del visitante. No cambiar `auth.users.role` para conceder permisos de administración.

- Carga JPEG/PNG/WebP, comprime en el navegador y muestra pesos y vista previa. Guarda nombre, descripción y fecha de publicación, indicando la zona horaria del dispositivo.
- Sube miniatura y ampliación antes de insertar la ficha. Conserva el UUID en reintentos y comprueba una posible inserción confirmada antes de limpiar. Retiene el identificador del intento en el dispositivo para recuperar su limpieza tras recargar; no almacena originales.
- Lista fotos publicadas y programadas, permite editar sus detalles y eliminar ficha, votos y objetos. Las imágenes no se sobrescriben: para otra fotografía se usa otro UUID.
- Configura inicio y fin de votación globales. Las fechas se convierten a UTC y se validan en PostgreSQL. El intervalo incluye el inicio y excluye el final; sin período configurado se bloquean votos.
- Políticas restrictivas protegen tanto nuevas puntuaciones como cambios fuera del intervalo. La galería usa hora de servidor para activar/desactivar controles automáticamente sin descargar imágenes. Cambios de fechas se notifican por el canal privado existente; también se sincronizan al volver a la pestaña o reconectar.

Migración: `supabase/migrations/20261122220747_admin_voting_schedule.sql`. Autorización de la cuenta indicada por el propietario: `supabase/authorize-admin.sql`, que debe ejecutarse con privilegios de base de datos. No se incorporan contraseñas ni claves secretas al frontend.

La compilación y las pruebas locales del panel están verificadas con API simulada: acceso permitido y denegado, fechas, compresión real, reintento sin duplicar miniatura, edición, eliminación y apertura/cierre sin nuevas descargas. Las pruebas SQL `voting-period.sql` comprueban permisos y límites en una transacción con rollback; deben ejecutarse después de aplicar la migración. La validación remota de esta ampliación está pendiente de recuperar acceso del CLI a christmas_contest (403 con la cuenta actual).

En producción, el alojamiento debe resolver `/admin` a `index.html` y servir `image-cache.js` como archivo JavaScript.
