// POST /api/signup  { email, password }
// Crea la cuenta desde el servidor y la deja YA CONFIRMADA, así no hace falta
// que Supabase mande el mail de confirmación ni tocar nada en el panel.
// Si el mail ya existe pero quedó sin confirmar (cuentas viejas), la activa.
import { handler, admin, fail } from './_lib.js';

function detalle(error){
  if(!error) return '';
  const partes = [];
  if(error.message) partes.push(error.message);
  if(error.code) partes.push('code=' + error.code);
  if(error.status) partes.push('status=' + error.status);
  return partes.length ? partes.join(' | ') : JSON.stringify(error);
}

function estaConfirmado(u){
  return !!(u && (u.email_confirmed_at || u.confirmed_at));
}

async function buscarPorEmail(db, email){
  for(let page = 1; page <= 20; page++){
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if(error) throw fail(500, 'No pude revisar los usuarios: ' + detalle(error));
    const lista = (data && data.users) || [];
    const u = lista.find(x => String(x.email || '').toLowerCase() === email);
    if(u) return u;
    if(lista.length < 200) return null;   // era la última página
  }
  return null;
}

export default handler(async ({ body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Escribí un email válido');
  if(password.length < 6) throw fail(400, 'La contraseña tiene que tener al menos 6 caracteres');

  const db = admin();

  // Primero miramos si el mail ya está registrado, así no dependemos de
  // adivinar el texto del error que devuelve createUser.
  const existente = await buscarPorEmail(db, email);

  if(existente){
    if(estaConfirmado(existente)){
      throw fail(409, 'Ese mail ya tiene cuenta. Tocá "Entrar" con tu contraseña.');
    }
    // Cuenta pendiente de confirmar: la activamos y le dejamos la contraseña
    // recién escrita. Es lo mismo que hace Supabase cuando repetís el registro
    // de una cuenta sin confirmar: mientras nadie verificó el mail, no es de nadie.
    const { error } = await db.auth.admin.updateUserById(existente.id, {
      password,
      email_confirm: true,
    });
    if(error) throw fail(500, 'No pude activar la cuenta: ' + detalle(error));
    return { ok: true, activada: true };
  }

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if(error || !data || !data.user){
    throw fail(500, 'No pude crear la cuenta: ' + (detalle(error) || 'respuesta vacía de Supabase'));
  }
  return { ok: true, creada: true };
});
