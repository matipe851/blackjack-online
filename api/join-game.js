// POST /api/join-game  { code, name } -> { game_id, room_code }
import { handler, requireUser, admin, fail, cleanName, saveGame, ensureStats, sortedPlayers, MAX_PLAYERS } from './_lib.js';

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const db = admin();
  const code = String(body.code || '').trim().toUpperCase();
  if(!/^[A-Z]{5}$/.test(code)) throw fail(400, 'El código son 5 letras');

  const { data: game, error } = await db.from('games').select('*').eq('room_code', code).maybeSingle();
  if(error) throw fail(500, 'Error buscando la mesa: ' + error.message);
  if(!game) throw fail(404, 'No existe ninguna mesa con ese código');

  const yaEsta = (game.players || []).find(p => p.user_id === user.id);

  // Si ya estabas en la mesa, es una reconexión: entrás igual aunque haya empezado.
  if(yaEsta){
    const nuevo = cleanName(body.name, yaEsta.name);
    if(nuevo !== yaEsta.name){
      yaEsta.name = nuevo;
      const { data: sec } = await db.from('game_secret').select('data').eq('game_id', game.id).single();
      await saveGame(game, (sec && sec.data && sec.data.hands) ? sec.data : null);
    }
    return { game_id: game.id, room_code: game.room_code };
  }

  if(game.status !== 'lobby') throw fail(409, 'Esa partida ya empezó');
  if((game.players || []).length >= MAX_PLAYERS) throw fail(409, 'La mesa está llena (máximo ' + MAX_PLAYERS + ')');

  const usados = sortedPlayers(game).map(p => p.seat);
  let seat = 0;
  while(usados.includes(seat)) seat++;

  const jugador = { user_id: user.id, seat, name: cleanName(body.name, 'Jugador ' + (seat + 1)), points: 0 };
  ensureStats(jugador);

  const { error: e2 } = await db.from('game_players').insert({ game_id: game.id, user_id: user.id, seat });
  if(e2) throw fail(409, 'No pude sentarte en la mesa (probá de nuevo): ' + e2.message);

  game.players = [...(game.players || []), jugador];
  await saveGame(game, null);

  return { game_id: game.id, room_code: game.room_code };
});
