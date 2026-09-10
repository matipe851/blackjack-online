// POST /api/start-game  { game_id }
import { handler, requireUser, fail, loadGame, saveGame, dealRound, nextSeat, ensureStats } from './_lib.js';

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const { game } = await loadGame(body.game_id);

  if(game.host_id !== user.id) throw fail(403, 'Solo el anfitrión puede empezar la partida');
  if(game.status !== 'lobby') throw fail(409, 'La partida ya empezó');
  if((game.players || []).length < 2) throw fail(400, 'Hacen falta al menos 2 jugadores');

  game.round = 1;
  game.banca_seat = 0;              // la banca arranca siendo el anfitrión
  game.status = 'playing';

  const banca = game.players.find(p => p.seat === game.banca_seat);
  if(banca) ensureStats(banca).timesBanca++;

  const data = dealRound(game);
  const siguiente = nextSeat(game, data);
  if(siguiente === null){
    // caso raro: todos sacaron blackjack natural, juega la banca directo
    game.status = 'dealer';
    game.current_seat = null;
  } else {
    game.current_seat = siguiente;
  }

  await saveGame(game, data);
  return { ok: true };
});
