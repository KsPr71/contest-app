import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key || !key.startsWith('sb_publishable_')) {
  throw new Error('Configura la URL y la clave publicable de Supabase en .env.local.')
}
export const supabase = createClient(url, key)

let signingIn: Promise<string> | null = null
export async function ensureVoter(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session) return data.session.user.id
  // One anonymous account even when different cards are voted simultaneously.
  if (!signingIn) {
    signingIn = supabase.auth.signInAnonymously().then(({ data, error }) => {
      if (error) throw error
      if (!data.user) throw new Error('No se pudo iniciar la sesión de votación.')
      return data.user.id
    }).finally(() => { signingIn = null })
  }
  return signingIn
}
