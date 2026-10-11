import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createLocal } from './local.js';
import { createRemote } from './remote.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/** Usa o Supabase se src/config.js estiver preenchido; senão, o armazenamento local. */
export async function connect(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return createLocal();
  const {createClient} = await import(SUPABASE_JS);
  return createRemote(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
}
