# Pasar de Vercel a Cloudflare Workers

Evaluación de octubre 2026 con `@opennextjs/cloudflare` 1.20 + wrangler 4.152. No se deployó nada ni se tocó Vercel.

## Veredicto

- **Tamaño: entra de sobra.**
- **CPU: el plan Free no alcanza.** Las páginas del panel gastan entre 15 y 50 ms de CPU por request, y el límite del Free es 10 ms. El primer request de un isolate frío gasta unos 200 ms. Cloudflare tolera pasarse de vez en cuando, pero si pasa siempre corta con el error 1102.
- **Workers Paid (USD 5/mes) alcanza y sobra.** Incluye 10 M de requests y 30 M ms de CPU por mes, con un límite de 30 s por request. Calculando 3.000 requests por día a ~30 ms, son ~2,7 M ms por mes: menos del 10 % de lo incluido. Para comparar, Vercel Pro sale USD 20/mes.

## Tamaño del Worker

| | Medido | Límite actual |
|---|---|---|
| Sin comprimir | 7.089 KiB (6,9 MiB) | 64 MiB, en Free y en Paid |
| gzip | 1.448 KiB (1,4 MiB) | ya no hay límite comprimido |

Cloudflare unificó el límite en 64 MiB sin comprimir en septiembre de 2026. La doc de OpenNext todavía menciona 3 MiB gzip (Free) y 10 MiB (Paid); con esos límites viejos también entraba. Medido con `wrangler deploy --dry-run --outdir`.

## CPU por request

Lo medí en esta PC con `wrangler dev` (workerd, el mismo runtime de Cloudflare), con el isolate caliente. Cada página tiene dos números:

- **Piso:** lo que mide el profiler de V8. Cuenta solo JS.
- **Techo:** el CPU total del proceso `workerd`. Incluye unos 3 ms del proxy local de wrangler y los hilos de fondo.

El número real queda entre los dos. Para medir las páginas del panel sin usar la contraseña de nadie, usé un parche descartable que no se commiteó: cambia la sesión por el cliente service_role. Las consultas y el render son los mismos.

| Ruta | CPU (ms) |
|---|---|
| `/login` | 5–9 (techo ~16) |
| `/c` (check-in público) | 5–11 (techo ~13) |
| Redirect a `/login` sin sesión (solo middleware) | ~1 (techo ~2) |
| `/panel` | 16–25 (techo ~35) |
| `/panel/socios` (51 socios, grilla) | 30–45 (techo ~49) |
| `/panel/caja` | 15–28 |
| `/panel/acceso/qr` con PNG (antes) | 38–51 (techo ~52) |
| `/panel/acceso/qr` con SVG (ahora) | 5–9 |
| `/qr-movil` (antes → ahora) | ~38 → ~11 |
| Primer request con isolate frío | `/login` ~210, `/panel` ~110 |

- `/panel/socios` dibuja todos los socios, así que con 300 socios va a gastar varias veces más. En Paid no importa.
- Con el poco tráfico de un gimnasio, los isolates se enfrían seguido. Los arranques en frío suman unos 200 ms de latencia, pero en Paid no dan error.
- Para confirmar estos números en producción: Workers → gym-panel → Metrics, en "CPU time".

## Qué se rompió y cómo quedó

1. **Next 15.5.23 → 15.5.28.** OpenNext 1.20 lo pide como peer dependency. Es un parche, sin cambios de código.
2. **El QR en PNG gastaba ~29 ms de CPU** (medido en Node), así que con eso solo ya se pasaba del Free. Ahora es SVG (`lib/qr.ts`, que reemplaza las tres copias que había): cuesta ~0,3 ms y la respuesta pesa la mitad. Se ve igual o más nítido. Lo probé en el navegador: se ve bien y rota. También le sirve a Vercel.
3. **La service key quedaba dentro del bundle.** OpenNext copia todos los `.env*` del proyecto al Worker (`.open-next/cloudflare/next-env.mjs`). Si se buildea con `.env.local`, `SUPABASE_SERVICE_ROLE_KEY` se sube como texto dentro del código (lo verifiqué en `worker.js`). Lo arreglé así: `npm run cf:deploy` corre primero `scripts/cf-sin-secretos.mjs`, que frena el deploy si algún `.env*` define la key. Recomiendo deployar con Workers Builds (más abajo): ahí no existe `.env.local` y la key va como Secret.
4. **OneDrive.** Dentro de `OneDrive\Escritorio`, `next build` falla con un error de `next/font` y con `EINVAL: readlink .next\...`. Copiado a una carpeta fuera de OneDrive, buildea sin problemas. Para buildear en tu máquina, mové el repo, por ejemplo a `C:\dev\gym`, o usá Workers Builds.
5. **Windows.** OpenNext avisa que no lo soporta del todo y recomienda WSL. Igual el build y el preview anduvieron. `wrangler dev` falló una vez con `SQLITE_CANTOPEN` porque la ruta era muy larga; se arregla así: `npm run cf:preview -- --persist-to C:/cfst`.
6. **`next/image`.** No se usa en ningún lado (todas las imágenes son `<img>`), así que no hacen falta el binding de Cloudflare Images ni `unoptimized`. El `remotePatterns` de `next.config.ts` no tiene efecto; lo dejé como estaba.
7. **Placement.** Puse `"region": "aws:sa-east-1"` en vez de `"mode": "smart"`. Smart Placement necesita tráfico desde varias ubicaciones y solo mueve el Worker a lugares donde ya recibe tráfico. Como casi todo el tráfico sale de Argentina, el Worker se quedaría en Buenos Aires. Con la región fija corre en São Paulo, al lado de Supabase, y cada consulta es un viaje corto. Si el deploy rechaza esa opción, cambiala por `"mode": "smart"`.
8. **Middleware: anda igual.** Lo verifiqué así:
   - Cada respuesta trae un nonce nuevo en el CSP, y todos los `<script>` de la página usan ese mismo nonce.
   - Sin sesión, redirige a `/login?volver=…`.
   - HSTS, X-Frame-Options y las demás cabeceras siguen estando.
   - En local, el `Location` del redirect muestra `localhost:8787`. Es cosa de `wrangler dev`.
9. **Sin caché incremental (R2).** No hace falta: todas las rutas son dinámicas. `revalidatePath` sigue refrescando la vista después de cada acción.
10. **Decisiones de config.**
    - `@opennextjs/cloudflare` quedó en devDependencies: solo se usa en el build.
    - No agregué `initOpenNextCloudflareForDev()` a `next.config.ts`: la app no usa bindings, y así `npm run dev` y el deploy de Vercel no cambian.
    - `public/_headers` le dice a Cloudflare que cachee para siempre `/_next/static/*`. En Vercel no tiene efecto.

**Probé** en `opennextjs-cloudflare preview` (runtime de Workers):

- `/login`, `/c` y una ruta inexistente (404)
- `/panel`, `/panel/caja`, `/panel/caja/export` (CSV), `/panel/metricas`
- `/panel/socios` (grilla y lista)
- `/panel/acceso`, `/panel/acceso/qr`, `/qr-movil`
- los estáticos

**No probé** el login real ni las acciones que escriben (cobrar, check-in con DNI, alta de socios), para no tocar datos de producción. Probalas en el paso 4.

## Pasos que te quedan

1. **Cuenta.** Creá la cuenta en dash.cloudflare.com y pasala a **Workers Paid** (Workers & Pages → Plans).
2. **Rama.** Mergeá esta rama, o apuntá el deploy a `claude/pensive-wing-269956` para probar primero.
3. **Deploy con Workers Builds** (recomendado). En Workers & Pages → Create → Import a repository → GitHub, elegí este repo y completá:
   - Nombre del Worker: `gym-panel`. Tiene que ser igual al `name` de `wrangler.jsonc`.
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - Build variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL`. Esta última es la URL final (por ejemplo `https://panel.tudominio.com`) y la usa el QR.
   - Después del primer deploy, en Settings → Variables and Secrets, agregá `SUPABASE_SERVICE_ROLE_KEY` como **Secret**.

   Alternativa por terminal, desde una carpeta fuera de OneDrive:
   1. `npx wrangler login`
   2. `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
   3. Sacá la key de `.env.local`.
   4. `npm run cf:deploy`
4. **Prueba.** Entrá a `https://gym-panel.<tu-subdominio>.workers.dev` y probá el login, un cobro y un check-in por QR. Mirá el "CPU time" en Metrics.
5. **Supabase.** Si usás links por mail (recuperar contraseña), en Authentication → URL Configuration agregá la URL nueva. Para el login con contraseña no hace falta.
6. **Dominio.**
   - Si hoy usás `*.vercel.app`, vas a necesitar un dominio propio. Si no, te podés quedar con `*.workers.dev`.
   - Para usar tu dominio, agregalo a Cloudflare (Add a domain, plan Free) y cambiá los nameservers en el registrador (NIC.ar si es `.com.ar`). Antes de cambiarlos, revisá que Cloudflare haya importado los registros de mail que tengas.
   - Después, en el Worker → Settings → Domains & Routes → Add → Custom domain (por ejemplo `panel.tudominio.com`). Cloudflare crea el DNS y el certificado.
   - Cambiá `NEXT_PUBLIC_SITE_URL` al dominio final y redeployá.
7. **Apagar Vercel.** Cuando el dominio ya responda desde Cloudflare y esté todo probado, sacá el dominio del proyecto en Vercel y después pausá o borrá el proyecto. Mientras tanto, dejalo andando como respaldo.

## Comandos

- `npm run cf:build`: build del Worker (queda en `.open-next/`).
- `npm run cf:preview`: lo corre en el runtime de Workers en http://localhost:8787. Usa `.dev.vars`, que está en `.gitignore`; copiá ahí las variables de `.env.local`.
- `npm run cf:deploy`: build y deploy. Frena si la service key está en algún `.env*`.
