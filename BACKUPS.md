# Backups de la base

Supabase Free no trae backups que se puedan usar, así que los hace GitHub
Actions, gratis: el workflow [`db-backup.yml`](.github/workflows/db-backup.yml)
corre **todas las noches a las 03:17 (Argentina)** y también se puede correr a
mano.

## Qué guarda

Cada backup es **un solo archivo** `gym-backup-AAAAMMDD-HHMM.tar.gpg`, cifrado
con AES-256. Adentro hay:

| Archivo       | Contenido |
| ------------- | --------- |
| `public.dump` | Todo el schema `public`: tablas, funciones, vistas, triggers, políticas RLS, permisos y **todos los datos** (socios, pases, check-ins, caja, cobros, planes, ajustes, incluido el secreto del QR). |
| `auth.dump`   | Los datos de `auth.users` y `auth.identities`: los usuarios del panel, con sus contraseñas hasheadas. |
| `conteos.txt` | Cuántas filas tenía cada tabla al momento del backup, para comparar después de restaurar. |
| `info.txt`    | Fecha, link a la corrida y versión de `pg_dump`. |

Queda guardado en dos lugares:

- **Como artifact de la corrida**, durante 90 días.
- **En Cloudflare R2** (opcional), todo el tiempo que quieras. Ver más abajo.

**No** guarda: la configuración del dashboard de Supabase (Auth, URLs, SMTP),
las API keys ni las variables de Vercel. Storage no se usa, así que no hay
archivos que respaldar.

### Por qué va cifrado

El repo es público. Cualquiera con cuenta de GitHub puede leer los logs de
Actions y **bajar los artifacts**. Por eso el archivo se cifra antes de salir
del runner, y el workflow no imprime datos ni conteos en el log: sin la
passphrase, el archivo no sirve de nada.

## Configuración (una sola vez)

### 1. La connection string de Supabase → `SUPABASE_DB_URL`

1. En el dashboard de Supabase, abrí el proyecto y tocá **Connect** (arriba).
2. En **Connection String**, elegí tipo **URI** y copiá la de **Session pooler**.
   Es algo así:

   ```
   postgresql://postgres.xjswlgmelhemamzzyjjj:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

3. Reemplazá `[YOUR-PASSWORD]` (con los corchetes) por la contraseña de la base.

Tiene que ser la del **Session pooler** (puerto 5432):

- La **Direct connection** (`db.xjswlgmelhemamzzyjjj.supabase.co`) es solo
  IPv6, y los runners de GitHub no la alcanzan.
- El **Transaction pooler** (puerto 6543) no sirve para `pg_dump`.

Si no sabés la contraseña: **Project Settings → Database → Reset database
password**. Cambiarla no afecta al panel, que entra con las API keys y no con
la contraseña. Usá una de **solo letras y números**: si tiene `@ : / ? # %`
hay que escaparlos en la URL (`@` → `%40`, etc.) o la conexión falla.

### 2. La passphrase → `BACKUP_PASSPHRASE`

Generá una al azar. En Git Bash:

```bash
openssl rand -base64 32
```

**Guardala en tu gestor de contraseñas, fuera de GitHub.** GitHub no te la
vuelve a mostrar, y sin ella los backups no se pueden abrir: perderla es
perder todos los backups. El workflow rechaza passphrases de menos de 20
caracteres.

### 3. Cargar los secretos en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository
secret** ([link directo](https://github.com/AngelH20/gym-panel/settings/secrets/actions)).

| Secreto                | ¿Hace falta? | Qué va |
| ---------------------- | ------------ | ------ |
| `SUPABASE_DB_URL`      | Sí           | La URI del Session pooler, con la contraseña puesta. |
| `BACKUP_PASSPHRASE`    | Sí           | La passphrase del paso 2. |
| `R2_ACCESS_KEY_ID`     | Para R2      | Access Key ID del token de R2. |
| `R2_SECRET_ACCESS_KEY` | Para R2      | Secret Access Key del token de R2. |
| `R2_ENDPOINT`          | Para R2      | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET`            | No           | Nombre del bucket. Si no está, usa el que venga al final de `R2_ENDPOINT`, o `gym-backups`. |

Sin los tres de R2, ese paso se saltea solo y el backup queda únicamente como
artifact. Con algunos sí y otros no, la corrida falla para avisarte.

### 4. (Opcional) Una copia en Cloudflare R2

Los artifacts duran 90 días. Para tener backups más viejos, o una copia fuera
de GitHub, sumá R2: 10 GB gratis, y cada backup pesa menos de 1 MB.

1. En [dash.cloudflare.com](https://dash.cloudflare.com), entrá a **R2 Object
   Storage**. Para activarlo Cloudflare puede pedir un medio de pago, aunque
   dentro del plan gratis no cobra.
2. **Create bucket** → nombre `gym-backups`.
3. **Manage API tokens → Create API token**, con permiso **Object Read &
   Write** y limitado a ese bucket.
4. Copiá el **Access Key ID**, el **Secret Access Key** (se muestra una sola
   vez) y el endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Cargalos
   como secretos (tabla de arriba).
5. Si querés que se borren solos: en el bucket, **Settings → Object lifecycle
   rules**, agregá una regla que borre los objetos de más de 365 días.

## Correrlo a mano

El workflow tiene que estar en `main`: hasta que no se mergea, GitHub no lo
programa ni muestra el botón.

1. Pestaña **Actions** → **Backup de la base** (a la izquierda).
2. **Run workflow** → rama `main` → **Run workflow**.

O desde la terminal, con [GitHub CLI](https://cli.github.com):

```bash
gh workflow run db-backup.yml --repo AngelH20/gym-panel
```

Corrélo una vez apenas cargues los secretos, para confirmar que anda. Si sale
bien, en la página de la corrida vas a ver un resumen (tamaño, si incluyó los
usuarios, si se copió a R2) y el archivo en **Artifacts**.

### Si falla

GitHub manda un mail cuando falla una corrida programada (le llega a quien
modificó por última vez el `cron` del workflow). Los errores más comunes:

| Mensaje | Causa |
| ------- | ----- |
| `Network is unreachable` | Pusiste la Direct connection. Usá la del Session pooler. |
| `password authentication failed` | Contraseña mal, o con caracteres sin escapar. |
| `Tenant or user not found` | El usuario tiene que ser `postgres.xjswlgmelhemamzzyjjj`, no `postgres` solo. |
| `server version mismatch` | Actualizaste Postgres en Supabase. Cambiá `PG_IMAGE` en el workflow a la versión nueva (`postgres:18`, etc.). |
| `No se pudieron volcar auth.users` (aviso) | El backup se hizo igual pero sin los usuarios del panel. Mirá el log de ese paso. |

## Para que nada se apague solo

**Supabase** pausa los proyectos Free que pasan 7 días sin actividad. Según su
documentación, alcanzan unas pocas consultas por día, y el backup hace
consultas reales todas las noches (el volcado completo y el conteo de filas).
Supabase no garantiza por escrito que eso cuente, así que si alguna vez te
llega el mail de que van a pausar el proyecto, entrá al dashboard del
proyecto: eso ya cuenta como actividad. Con el gimnasio abierto el panel se
usa todos los días igual; esto cubre vacaciones y cierres largos.

**GitHub** apaga los workflows programados de un repo público después de 60
días sin actividad en el repo (commits, PRs). El job `mantener-activo` lo reactiva por API en cada corrida
para que no pase. Si igual se apaga, vas a ver un cartel en
**Actions → Backup de la base**: tocá **Enable workflow**.

## Restaurar

### Qué necesitás

- El archivo `gym-backup-….tar.gpg`.
- La passphrase.
- **Git Bash** (viene con Git for Windows): trae `gpg` y `tar`.
- **`pg_restore` 17**. En Windows, bajá el instalador de PostgreSQL 17 desde
  [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
  y marcá solo **Command Line Tools**. Después, en Git Bash:

  ```bash
  export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
  pg_restore --version   # tiene que decir 17.x
  ```

### 1. Bajar el backup

- **Desde GitHub:** Actions → Backup de la base → elegí una corrida en verde →
  abajo, en **Artifacts**, hacé click en el archivo. Tenés que estar logueado.
  Si te baja un `.zip`, descomprimilo y adentro está el `.tar.gpg`.
- **Desde R2:** en Cloudflare, R2 → `gym-backups` → el objeto → **Download**.

### 2. Descifrar y desempaquetar

En Git Bash, parado en la carpeta donde quedó el archivo:

```bash
gpg --pinentry-mode loopback --output backup.tar --decrypt gym-backup-20261025-0617.tar.gpg
tar -xf backup.tar
```

`gpg` te pide la passphrase. Si no aparece el pedido, pasala así (no queda en
el historial):

```bash
read -rs PASS && printf '%s' "$PASS" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --output backup.tar --decrypt gym-backup-20261025-0617.tar.gpg
```

Quedan `public.dump`, `auth.dump`, `conteos.txt` e `info.txt`. **Estos ya
están sin cifrar**: tienen los datos de los socios y los hashes de las
contraseñas. No los subas a ningún lado y borralos cuando termines.

### 3. Crear el proyecto nuevo

1. En Supabase, **New project**, en la región **South America (São Paulo)**.
   Anotá la contraseña de la base.
2. **No crees usuarios ni corras los scripts de `sql/`**: el backup ya trae el
   schema completo y los usuarios.
3. Copiá su URI del **Session pooler** (igual que en la configuración) con la
   contraseña puesta.

### 4. Cargar el backup

En Git Bash, en la carpeta de los `.dump`. Primero la URL del proyecto nuevo
(se pega sin que se vea ni quede en el historial):

```bash
read -rs NUEVA_DB_URL && export NUEVA_DB_URL
```

**Primero los usuarios**, porque varias tablas de `public` apuntan a
`auth.users` (admins, cobros, cajas). Si algo falla, no carga nada:

```bash
pg_restore --dbname="$NUEVA_DB_URL" --data-only --single-transaction auth.dump
```

**Después todo `public`:**

```bash
pg_restore --dbname="$NUEVA_DB_URL" --no-owner public.dump
```

Puede terminar con `errors ignored on restore: N`. Si los errores son del tipo
`already exists` o `permission denied` sobre cosas de Supabase (el schema
`public` en sí, roles como `supabase_admin`), son esperables: Supabase ya las
crea en todo proyecto nuevo. Un error sobre una tabla, función o política del
gimnasio sí hay que mirarlo.

### 5. Verificar

En el **SQL Editor** del proyecto nuevo, corré esto y compará con
`conteos.txt`. Los números tienen que ser iguales:

```sql
select n.nspname || '.' || c.relname as tabla,
       (xpath('/row/filas/text()',
              query_to_xml(format('select count(*) as filas from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as filas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users', 'identities')))
order by 1;
```

### 6. Pasar el panel al proyecto nuevo

1. En Vercel, **Settings → Environment Variables**, cambiá
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY` por las del proyecto nuevo (**Project Settings →
   API Keys** en Supabase) y hacé **Redeploy**. Si el proyecto nuevo solo
   muestra claves `sb_publishable_…` y `sb_secret_…`, van en esas mismas
   variables: la publishable en la de ANON y la secret en la de SERVICE_ROLE.
2. En Supabase, **Authentication → URL Configuration**: poné la URL del panel
   en **Site URL**.
3. Entrá al panel. Los admins entran con **la misma contraseña de siempre**;
   lo único que se pierde son las sesiones abiertas, así que todos tienen que
   loguearse de nuevo.
4. En GitHub, actualizá `SUPABASE_DB_URL` con la URI del proyecto nuevo, así
   los backups siguen.
5. Borrá `backup.tar`, los `.dump` y los `.txt`.

### Hacé un simulacro

Un backup que nunca se restauró es una promesa, no un backup. El plan Free
permite dos proyectos activos: una vez, creá uno de prueba, seguí los pasos 1
a 5 y después borralo (**Project Settings → General → Delete project**). Así
sabés que funciona antes de necesitarlo, y ves qué errores "esperables" tira
el paso 4 en tu caso.

## Si se filtra la passphrase

Generá una nueva y reemplazá `BACKUP_PASSPHRASE`. Los backups nuevos salen con
la nueva; los viejos siguen abriéndose solo con la anterior. Los artifacts se
borran solos a los 90 días; los de R2, borralos a mano si hace falta.
