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

> Auth: por defecto Supabase pide confirmar el email. Para probar rápido entre
> amigos podés desactivarlo en **Authentication → Providers → Email** →
> "Confirm email" en off. Después lo volvés a activar si querés.

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
