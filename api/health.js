// GET /api/health — chequeo rápido para saber si el backend está bien configurado.
// NO muestra ninguna clave: solo dice si están cargadas y si la base responde.
export default async function health(req, res){
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const out = {
    ok: false,
    funciones_desplegadas: true,
    SUPABASE_URL_cargada: !!url,
    SUPABASE_URL_valida: /^https:\/\/[^\s]+\.supabase\.co\/?$/.test(url),
    SUPABASE_SERVICE_ROLE_KEY_cargada: !!key,
    largo_de_la_key: key.length,
    base_responde: null,
  };
  if(out.SUPABASE_URL_valida && key){
    try{
      const { createClient } = await import('@supabase/supabase-js');
      const db = createClient(url.replace(/\/$/, ''), key, { auth: { persistSession: false } });
      const { error } = await db.from('games').select('id').limit(1);
      out.base_responde = error ? ('error: ' + error.message) : 'sí';
      out.ok = !error;
    }catch(e){
      out.base_responde = 'error: ' + (e && e.message);
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.ok ? 200 : 500).json(out);
}
