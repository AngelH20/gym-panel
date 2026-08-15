# Panel de gimnasio

Gestión de socios, pases por cantidad de entradas y registro de acceso por QR.

## Puesta en marcha

### 1. Base de datos

Creá un proyecto en [supabase.com](https://supabase.com) (plan Free alcanza) y corré
los scripts de `sql/` **en orden**, desde SQL Editor:

1. `01_schema.sql` — tablas, índices, RLS y la función de check-in.
2. `02_seed.sql` — 3 planes y 10 socios de prueba en distintos estados.
3. `03_access_code.sql` — validación de presencia en el local.

### 2. Habilitate como admin

En Supabase: **Authentication → Users → Add user** (con tu email y contraseña).
Después, en SQL Editor:

```sql
insert into admins (user_id, email, full_name)
select id, email, 'Tu Nombre' from auth.users where email = 'tu@email.com';
```

Sin este paso el login te va a rechazar, incluso con la contraseña correcta.
Es a propósito: cualquiera podría registrarse en tu proyecto Supabase.

### 3. Variables de entorno

```bash
cp .env.local.example .env.local
```

Completá con los valores de **Settings → API** en Supabase.
`SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_`: se usa solo del
lado del servidor y saltea todas las políticas de seguridad.

### 4. Correr

```bash
npm install
npm run dev
```

Abrí http://localhost:3000 → te redirige a `/login`.

## Estructura

```
app/
  login/              autenticación del admin
  panel/
    socios/           listado, alta, ficha con QR e historial
    planes/           planes configurables
    acceso/           pantalla del código del mostrador (etapa c)
components/
  UsesTally.tsx       las entradas dibujadas como tarjeta perforada
lib/
  supabase/           clientes: server (RLS) y admin (service_role)
  labels.ts           traducciones y formateo de fechas en zona AR
sql/                  esquema, seed y parches
```

## Decisiones que conviene conocer

**El socio y su pase son cosas distintas.** `members` es permanente;
`memberships` es un período pago con su contador. Cada renovación crea una fila
nueva y la anterior queda como `expired`. Nunca se sobreescribe nada, así que el
historial sale gratis y el futuro módulo de cobranzas apunta a
`memberships.id` sin tocar el esquema.

**El check-in es una función de Postgres, no código de la app.** Usa
`SELECT ... FOR UPDATE` sobre la membresía más un índice único en
`(member_id, local_date)`. Dos scans simultáneos no pueden descontar dos usos:
uno espera al otro y el segundo choca contra el índice.

**Los estados en inglés, la interfaz en español.** Los valores de enum viven en
inglés en la base; la traducción está toda en `lib/labels.ts`.

**El vencimiento se deriva, no se guarda.** La vista `member_overview` calcula
`effective_status` a partir de la fecha y los usos restantes. El único estado
que el admin setea a mano es `suspended`.

**Zona horaria en un solo lugar.** La función `gym_timezone()` en la base y la
constante `TIMEZONE` en `lib/labels.ts`. El "día" de un check-in siempre es el
día calendario en Buenos Aires.
