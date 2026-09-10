// POST /api/next-round  { game_id }
// Arranca la ronda siguiente y rota la banca una posición.
import { handler, requireUser, fail, loadGame, saveGame, dealRound, nextSeat, sortedPlayers, ensureStats, seatOf } from './_lib.js';

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const { game } = await loadGame(body.game_id);

  if(game.status !== 'results') throw fail(409, 'La ronda todavía no terminó');
  const miAsiento = seatOf(game, user.id);
  const puede = game.host_id === user.id || miAsiento === game.banca_seat;
  if(!puede) throw fail(403, 'Solo la banca o el anfitrión pasan a la ronda siguiente');

  // rotamos la banca al asiento siguiente que esté ocupado
  const asientos = sortedPlayers(game).map(p => p.seat);
  if(asientos.length < 2) throw fail(400, 'Hacen falta al menos 2 jugadores');
  const pos = asientos.indexOf(game.banca_seat);
  game.banca_seat = asientos[(pos + 1) % asientos.length];

  game.round = (game.round || 1) + 1;
  game.status = 'playing';

  const banca = game.players.find(p => p.seat === game.banca_seat);
  if(banca) ensureStats(banca).timesBanca++;

  const data = dealRound(game);
  const siguiente = nextSeat(game, data);
  if(siguiente === null){
    game.status = 'dealer';
    game.current_seat = null;
  } else {
    game.current_seat = siguiente;
  }

  await saveGame(game, data);
  return { ok: true };
});
