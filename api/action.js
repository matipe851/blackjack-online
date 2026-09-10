// POST /api/action  { game_id, action: 'hit' | 'stand' }
// Turno de un jugador (no de la banca). El servidor valida que sea SU turno.
import { handler, requireUser, fail, loadGame, saveGame, drawCard, handTotal, nextSeat, seatOf } from './_lib.js';

export default handler(async ({ req, body }) => {
  const user = await requireUser(req);
  const { game, data } = await loadGame(body.game_id);
  const accion = String(body.action || '');

  if(game.status !== 'playing') throw fail(409, 'No es momento de jugar');
  const miAsiento = seatOf(game, user.id);
  if(miAsiento === null) throw fail(403, 'No estás en esta mesa');
  if(miAsiento === game.banca_seat) throw fail(403, 'Sos la banca: jugás cuando terminen todos');
  if(game.current_seat !== miAsiento) throw fail(409, 'No es tu turno');

  const mano = data.hands[miAsiento];
  if(!mano) throw fail(500, 'No encuentro tu mano');
  if(mano.done || mano.busted) throw fail(409, 'Tu mano ya está cerrada');

  if(accion === 'hit'){
    mano.cards.push(drawCard(data));
    const total = handTotal(mano.cards);
    if(total > 21){ mano.busted = true; mano.done = true; mano.result = 'bust'; }
    else if(total === 21){ mano.done = true; }   // con 21 no tiene sentido seguir
  } else if(accion === 'stand'){
    mano.done = true;
  } else {
    throw fail(400, 'Acción inválida');
  }

  const siguiente = nextSeat(game, data);
  if(siguiente === null){
    game.status = 'dealer';       // ahora juega la banca
    game.current_seat = null;
  } else {
    game.current_seat = siguiente;
  }

  await saveGame(game, data);
  return { ok: true };
});
