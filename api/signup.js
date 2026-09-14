// POST /api/signup  { email, password }
// Crea la cuenta desde el servidor y la deja YA CONFIRMADA, así no hace falta
// que Supabase mande el mail de confirmación ni tocar nada en el panel.
// Si el mail ya existe pero quedó sin confirmar (cuentas viejas), la activa.
import { handler, admin, fail } from './_lib.js';

async function buscarPorEmail(db, email){
  for(let page = 1; page <= 10; page++){
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if(error) throw fail(500, 'No pude revisar los usuarios: ' + error.message);
    const lista = (data && data.users) || [];
    const u = lista.find(x => String(x.email || '').toLowerCase() === email);
    if(u) return u;
    if(lista.length < 200) return null;   // no hay más páginas
  }
  return null;
}

export default handler(async ({ body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Escribí un email válido');
  if(password.length < 6) throw fail(400, 'La contraseña tiene que tener al menos 6 caracteres');

  const db = admin();

  // camino normal: cuenta nueva, confirmada de entrada
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if(!error && data && data.user) return { ok: true, creada: true };

  const detalle = (error && error.message) || '';
  const yaExiste = /already|registered|exists|duplicate/i.test(detalle) || (error && error.status === 422);
  if(!yaExiste) throw fail(500, 'No pude crear la cuenta: ' + detalle);

  // el mail ya estaba registrado
  const u = await buscarPorEmail(db, email);
  if(!u) throw fail(409, 'Ese mail ya está registrado. Probá con "Entrar".');
  if(u.email_confirmed_at) throw fail(409, 'Ese mail ya tiene cuenta. Tocá "Entrar" con tu contraseña.');

  // cuenta pendiente de confirmar: la activamos y dejamos la contraseña que acaba de escribir.
  // Es el mismo comportamiento que tiene Supabase cuando repetís el registro de una
  // cuenta sin confirmar: mientras nadie verificó el mail, la cuenta no es de nadie.
  const { error: e2 } = await db.auth.admin.updateUserById(u.id, { password, email_confirm: true });
  if(e2) throw fail(500, 'No pude activar la cuenta: ' + e2.message);
  return { ok: true, activada: true };
});
