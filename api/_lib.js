// ============================================================
//  _lib.js — piezas compartidas por todas las funciones de /api
//  - conexión admin a Supabase (usa la service_role, secreta)
//  - autenticación del jugador que hace el pedido
//  - motor de blackjack (mazo, totales, reparto, resolución)
//  - armado del "public_view" que ve el navegador
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

// ---------- Errores con código HTTP ----------
export function fail(status, message){
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- Conexión a Supabase con la service_role ----------
// Limpia espacios y comillas de más, que es el error más típico al
// pegar las variables de entorno en Vercel.
function clean(v){
  let s = String(v || '').trim();
  if(s.length > 1 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))){
    s = s.slice(1, -1).trim();
  }
  return s;
}

let _admin = null;
export function admin(){
  if(_admin) return _admin;
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!url) throw fail(500, 'Falta la variable de entorno SUPABASE_URL en Vercel');
  if(!key) throw fail(500, 'Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel');
  if(!/^https:\/\/[^\s]+\.supabase\.co\/?$/.test(url)){
    throw fail(500, 'SUPABASE_URL no tiene la forma https://xxxx.supabase.co (revisá que no haya quedado texto de más)');
  }
  _admin = createClient(url.replace(/\/$/, ''), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

// ---------- Lectura del body (Vercel a veces ya lo parsea) ----------
async function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

// ---------- Envoltorio: maneja método, errores y JSON ----------
export function handler(fn){
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try{
      if(req.method === 'OPTIONS'){ res.status(204).end(); return; }
      if(req.method !== 'POST'){
        res.status(405).json({ error: 'Usá POST' });
        return;
      }
      const body = await readBody(req);
      const out = await fn({ req, res, body });
      res.status(200).json(out || { ok: true });
    }catch(e){
      const status = e && e.status ? e.status : 500;
      if(status >= 500) console.error('[api] error:', e);
      res.status(status).json({ error: (e && e.message) || 'Error del servidor' });
    }
  };
}

// ---------- Quién es el que llama ----------
export async function requireUser(req){
  const raw = req.headers.authorization || req.headers.Authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if(!token) throw fail(401, 'No estás autenticado');
  const { data, error } = await admin().auth.getUser(token);
  if(error || !data || !data.user) throw fail(401, 'Tu sesión venció. Cerrá sesión y volvé a entrar.');
  return data.user;
}

// ============================================================
//  MOTOR DE BLACKJACK
// ============================================================
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const MAX_PLAYERS = 5;
export { MAX_PLAYERS };

// Mazo nuevo de 6 barajas, bien mezclado (Fisher-Yates con azar criptográfico).
export function newDeck(round){
  const cards = [];
  for(let d = 0; d < 6; d++)
    for(const suit of SUITS)
      for(const rank of RANKS)
        cards.push({ rank, suit });
  for(let i = cards.length - 1; i > 0; i--){
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  // id único por carta: el front lo usa para animar solo las cartas nuevas
  return cards.map((c, i) => ({ ...c, id: 'r' + round + '-' + i }));
}

export function cardValue(rank){
  if(rank === 'A') return 11;
  if(rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return parseInt(rank, 10);
}

// Total de una mano contando los ases como 11 o 1, lo que convenga.
export function handTotal(cards){
  let total = 0, aces = 0;
  for(const c of cards){
    total += cardValue(c.rank);
    if(c.rank === 'A') aces++;
  }
  while(total > 21 && aces > 0){ total -= 10; aces--; }
  return total;
}

export function isNaturalBlackjack(cards){
  return cards.length === 2 && handTotal(cards) === 21;
}

export function drawCard(data){
  if(!data.deck || data.deck.length === 0) throw fail(500, 'Se quedó sin cartas el mazo');
  return data.deck.shift();
}

// ---------- Reparto inicial de una ronda ----------
export function dealRound(game){
  const players = sortedPlayers(game);
  const data = { deck: newDeck(game.round), hands: {} };
  for(const p of players){
    data.hands[p.seat] = { cards: [], done: false, busted: false, blackjack: false, result: null };
  }
  // dos vueltas de una carta a cada uno, como en la mesa real
  for(let vuelta = 0; vuelta < 2; vuelta++){
    for(const p of players) data.hands[p.seat].cards.push(drawCard(data));
  }
  for(const p of players){
    const h = data.hands[p.seat];
    h.blackjack = isNaturalBlackjack(h.cards);
    // un blackjack natural no juega su turno
    if(h.blackjack && p.seat !== game.banca_seat) h.done = true;
  }
  return data;
}

// Devuelve los jugadores ordenados por asiento.
export function sortedPlayers(game){
  return (game.players || []).slice().sort((a, b) => a.seat - b.seat);
}

// Orden de turnos: arranca en el asiento siguiente al de la banca y da la vuelta.
export function turnOrder(game){
  const seats = sortedPlayers(game).map(p => p.seat).filter(s => s !== game.banca_seat);
  const after = seats.filter(s => s > game.banca_seat);
  const before = seats.filter(s => s < game.banca_seat);
  return after.concat(before);
}

// Próximo asiento con turno pendiente (null si ya jugaron todos).
export function nextSeat(game, data){
  for(const seat of turnOrder(game)){
    const h = data.hands[seat];
    if(h && !h.done && !h.busted) return seat;
  }
  return null;
}

// ---------- Resolución de la ronda ----------
export function resolveRound(game, data){
  const bancaHand = data.hands[game.banca_seat];
  const bancaTotal = handTotal(bancaHand.cards);
  const bancaBust = bancaTotal > 21;
  const bancaBJ = bancaHand.blackjack;
  bancaHand.busted = bancaBust;
  bancaHand.done = true;

  const byS = {};
  for(const p of game.players) byS[p.seat] = p;

  for(const seat of turnOrder(game)){
    const h = data.hands[seat];
    if(!h) continue;
    const total = handTotal(h.cards);
    let result;
    if(h.busted || total > 21)            result = 'bust';
    else if(h.blackjack && bancaBJ)       result = 'push';
    else if(h.blackjack)                  result = 'blackjack';
    else if(bancaBJ)                      result = 'lose';
    else if(bancaBust)                    result = 'win';
    else if(total > bancaTotal)           result = 'win';
    else if(total < bancaTotal)           result = 'lose';
    else                                  result = 'push';
    h.result = result;
    h.done = true;

    const jugador = byS[seat];
    const banca = byS[game.banca_seat];
    if(jugador){
      const st = ensureStats(jugador);
      if(result === 'win')            st.winsP++;
      else if(result === 'blackjack') st.blackjacks++;
      else if(result === 'push')      st.pushes++;
      else                            st.lossesP++;
    }
    if(banca){
      const bst = ensureStats(banca);
      if(result === 'win' || result === 'blackjack') bst.bancaLosses++;
      else if(result === 'lose' || result === 'bust') bst.bancaWins++;
    }
  }
  for(const p of game.players) recalcPoints(p);
  return data;
}

export function ensureStats(p){
  if(!p.stats) p.stats = {};
  const s = p.stats;
  for(const k of ['winsP','lossesP','pushes','blackjacks','timesBanca','bancaWins','bancaLosses']){
    if(typeof s[k] !== 'number') s[k] = 0;
  }
  return s;
}

// Puntos = victorias + manos ganadas como banca + blackjacks x 1.5
export function recalcPoints(p){
  const s = ensureStats(p);
  p.points = Math.round((s.winsP + s.bancaWins + s.blackjacks * 1.5) * 10) / 10;
  return p.points;
}

// ============================================================
//  VISTA PÚBLICA — lo único que llega al navegador.
//  Nunca incluye el mazo ni la carta tapada de la banca.
// ============================================================
export function buildView(game, data){
  const hands = (data && data.hands) || null;
  const seats = sortedPlayers(game).map(p => {
    const isBanca = p.seat === game.banca_seat;
    const base = {
      seat: p.seat,
      user_id: p.user_id,
      name: p.name,
      role: isBanca ? 'banca' : 'player',
      points: typeof p.points === 'number' ? p.points : 0,
      stats: ensureStats(p),
    };
    const h = hands ? hands[p.seat] : null;
    if(!h){
      return { ...base, cards: [], hidden: 0, totalVisible: 0, done: false, busted: false, blackjack: false, result: null };
    }
    // mientras juegan los jugadores, la banca muestra una sola carta
    const tapada = isBanca && game.status === 'playing';
    const cards = tapada ? h.cards.slice(0, 1) : h.cards;
    return {
      ...base,
      cards,
      hidden: tapada ? Math.max(0, h.cards.length - 1) : 0,
      totalVisible: handTotal(cards),
      done: !!h.done,
      busted: !!h.busted,
      blackjack: tapada ? false : !!h.blackjack,
      result: h.result || null,
    };
  });
  return {
    status: game.status,
    round: game.round,
    banca_seat: game.banca_seat,
    current_seat: game.current_seat,
    seats,
  };
}

// ---------- Guardar estado ----------
export async function saveGame(game, data){
  const db = admin();
  const patch = {
    status: game.status,
    round: game.round,
    banca_seat: game.banca_seat,
    current_seat: game.current_seat,
    players: game.players,
    public_view: buildView(game, data),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('games').update(patch).eq('id', game.id);
  if(error) throw fail(500, 'No se pudo guardar la partida: ' + error.message);
  if(data){
    const { error: e2 } = await db.from('game_secret').upsert({ game_id: game.id, data }, { onConflict: 'game_id' });
    if(e2) throw fail(500, 'No se pudo guardar el estado secreto: ' + e2.message);
  }
}

// ---------- Cargar estado ----------
export async function loadGame(gameId){
  if(!gameId || typeof gameId !== 'string') throw fail(400, 'Falta el id de la partida');
  const db = admin();
  const { data: game, error } = await db.from('games').select('*').eq('id', gameId).single();
  if(error || !game) throw fail(404, 'No encontré esa partida');
  const { data: sec } = await db.from('game_secret').select('data').eq('game_id', gameId).single();
  return { game, data: (sec && sec.data && sec.data.hands) ? sec.data : { deck: [], hands: {} } };
}

// ---------- Utilidades ----------
export function seatOf(game, userId){
  const p = (game.players || []).find(x => x.user_id === userId);
  return p ? p.seat : null;
}

export function cleanName(name, fallback){
  const s = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 14);
  return s || fallback;
}
