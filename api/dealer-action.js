// POST /api/dealer-action  { game_id, action: 'hit' | 'stand' | 'auto' }
// Solo la banca de esta ronda puede llamarlo, y solo cuando le toca.
import { handler, requireUser, fail, loadGame, saveGame, drawCard, handTotal, resolveRound, seatOf } from './_lib.js';

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const { game, data } = await loadGame(body.game_id);
  const accion = String(body.action || '');

  if(game.status !== 'dealer') throw fail(409, 'Todavía no le toca a la banca');
  const miAsiento = seatOf(game, user.id);
  if(miAsiento === null) throw fail(403, 'No estás en esta mesa');
  if(miAsiento !== game.banca_seat) throw fail(403, 'Solo la banca puede hacer esto');

  const mano = data.hands[game.banca_seat];
  if(!mano) throw fail(500, 'No encuentro la mano de la banca');

  if(accion === 'hit'){
    mano.cards.push(drawCard(data));
  } else if(accion === 'auto'){
    while(handTotal(mano.cards) < 17) mano.cards.push(drawCard(data));
  } else if(accion !== 'stand'){
    throw fail(400, 'Acción inválida');
  }

  const total = handTotal(mano.cards);
  // se planta sola si se pasa, si llega a 21, o si eligió plantarse / automático
  const cierra = accion === 'stand' || accion === 'auto' || total >= 21;

  if(cierra){
    resolveRound(game, data);
    game.status = 'results';
    game.current_seat = null;
  }

  await saveGame(game, data);
  return { ok: true };
});
