# Blackjack Online — banca rotativa

Blackjack multijugador **online** para 2 a 5 amigos, con **inicio de sesión** y
**a prueba de trampas**: el mazo y la carta tapada de la banca viven solo en el
servidor y nunca se mandan al navegador.

Mismo stack que ya usás en TalentIA: **Supabase** (Auth + Postgres) + **Vercel**
(las funciones de `/api/`). Un solo `index.html` de front.

---

## 1) Crear el proyecto de Supabase (nuevo, aparte de TalentIA)

1. Entrá a supabase.com → **New project**. Anotá la contraseña de la base.
2. Cuando termine de crearse, andá a **SQL Editor** → **New query**, pegá TODO
   el contenido de `schema.sql` y dale **Run**. Eso crea las tablas, la
   seguridad (RLS) y activa el realtime.
3. Andá a **Project Settings → API** y copiá dos cosas:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (esta es SECRETA, no va en el front)

> Auth: no hace falta tocar nada. El registro pasa por `api/signup.js`, que crea
> la cuenta **ya confirmada** con la service_role, así que Supabase no manda
> mail de validación ni hay que desactivar "Confirm email" en el panel.

## 2) Poner las claves

- En **`index.html`**, arriba del todo del `<script>`, completá:
  ```js
  const SUPABASE_URL  = 'https://TU-PROYECTO.supabase.co';
  const SUPABASE_ANON = 'TU-ANON-KEY';
  ```
  (La anon key es pública por diseño: la seguridad la da el RLS.)

- La **service_role** NO va en el archivo. Va como variable de entorno en Vercel
  (paso siguiente).

## 3) Subir a GitHub y desplegar en Vercel

1. Subí toda la carpeta a un repo (como hacés con TalentIA):
   ```
   index.html
   package.json
   schema.sql
   api/_lib.js
   api/signup.js
   api/create-game.js
   api/join-game.js
   api/start-game.js
   api/action.js
   api/dealer-action.js
   api/next-round.js
   ```
2. En Vercel → **Add New → Project** → importá el repo.
3. En **Settings → Environment Variables** agregá:
   - `SUPABASE_URL` = tu Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = tu service_role key
4. **Deploy**. Vercel detecta solo las funciones de `/api/`.

## 4) Jugar

1. Abrí la URL de Vercel, creá una cuenta y entrá.
2. **Crear mesa** → te da un código de 5 letras. Compartilo.
3. Tus amigos entran, ponen el código en **Unirme** y caen en la sala.
4. El anfitrión toca **Empezar** (mínimo 2). La banca arranca siendo el
   anfitrión y **rota** una posición cada ronda.
5. Cada uno pide/planta en su turno; la banca juega su mano (manual o
   automático); se muestran resultados y el marcador general.

---

## Cómo está hecha la seguridad (lo importante)

- **`game_secret`** (mazo + manos completas + carta tapada): tiene RLS activado
  **sin ninguna política**, así que es **inaccesible** desde el navegador. Solo
  las funciones del servidor la leen/escriben con la `service_role`.
- El navegador solo recibe **`public_view`**: las cartas visibles, con la carta
  de la banca oculta hasta que le toca jugar.
- Cada acción se valida en el servidor: que sea **tu turno**, que la banca no
  juegue antes de tiempo, que solo el anfitrión empiece, etc. El cliente no
  puede forzar nada.
- **Realtime** solo publica `games` y `game_players` (nunca `game_secret`).

## Motor del juego (testeado)

`api/_lib.js` tiene la lógica pura (As 1/11, blackjack natural, pasarse,
empates, rotación, resolución). Se validó con 300 partidas aleatorias completas
+ casos borde (3301 comprobaciones, todas OK).

## Ideas para después

- Endurecer aún más: quitar `user_id` de la vista pública, límite de tiempo por
  turno, reconexión si alguien cierra la pestaña.
- Apuestas con fichas virtuales y ranking histórico.
- Que el anfitrión elija la banca inicial (hoy arranca siendo él).

---

## Si algo no anda

Abrí `https://TU-APP.vercel.app/api/health` en el navegador. Esa ruta no
muestra ninguna clave, solo te dice qué está bien y qué no:

```json
{ "ok": true,
  "SUPABASE_URL_cargada": true,
  "SUPABASE_URL_valida": true,
  "SUPABASE_SERVICE_ROLE_KEY_cargada": true,
  "base_responde": "sí" }
```

- **Error 404 en esa ruta** → Vercel no está viendo la carpeta `api/`.
  Revisá que los archivos estén en el repo dentro de `api/`.
- **`SUPABASE_URL_cargada: false`** o **`..._KEY_cargada: false`** → faltan
  las variables de entorno en Vercel (Settings → Environment Variables,
  marcadas para *Production*). Después de agregarlas hay que **redeployar**.
- **`base_responde: "error: ..."`** → la key es de otro proyecto, o falta
  correr `schema.sql` en el SQL Editor de Supabase.
- **"Failed to fetch" al crear cuenta o entrar** → ese error *no* pasa por
  `/api/`: son `SUPABASE_URL` / `SUPABASE_ANON` mal puestos arriba del
  `<script>` en `index.html`. Ojo con pegar la línea entera adentro de las
  comillas: tiene que quedar solo la URL.
- **"Email not confirmed"** → es una cuenta creada antes de que el registro
  pasara por `/api/signup`. Tocá **Entrar** igual: el front detecta el caso,
  le pide al servidor que la active y reintenta solo.
