// POST /api/create-game  { name } -> { game_id, room_code }
import { handler, requireUser, admin, fail, cleanName, buildView, ensureStats } from './_lib.js';

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para que no se confundan
function nuevoCodigo(){
  let s = '';
  for(let i = 0; i < 5; i++) s += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  return s;
}

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const db = admin();
  const name = cleanName(body.name, 'Anfitrión');

  // buscamos un código libre
  let code = null;
  for(let intento = 0; intento < 12; intento++){
    const c = nuevoCodigo();
    const { data } = await db.from('games').select('id').eq('room_code', c).maybeSingle();
    if(!data){ code = c; break; }
  }
  if(!code) throw fail(500, 'No pude generar un código libre, probá de nuevo');

  const jugador = { user_id: user.id, seat: 0, name, points: 0 };
  ensureStats(jugador);

  const gameBase = {
    room_code: code,
    host_id: user.id,
    status: 'lobby',
    round: 1,
    banca_seat: 0,
    current_seat: null,
    players: [jugador],
  };

  const { data: game, error } = await db
    .from('games')
    .insert({ ...gameBase, public_view: buildView({ ...gameBase, id: null }, null) })
    .select()
    .single();
  if(error) throw fail(500, 'No pude crear la mesa: ' + error.message);

  const { error: e2 } = await db.from('game_players').insert({ game_id: game.id, user_id: user.id, seat: 0 });
  if(e2){
    await db.from('games').delete().eq('id', game.id);
    throw fail(500, 'No pude sentarte en la mesa: ' + e2.message);
  }
  await db.from('game_secret').upsert({ game_id: game.id, data: {} }, { onConflict: 'game_id' });

  return { game_id: game.id, room_code: game.room_code };
});
