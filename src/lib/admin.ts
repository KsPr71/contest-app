import { createClient } from '@supabase/supabase-js'

// Administration never replaces the visitor's anonymous voting session.
export const adminClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: 'enfoque-admin-session' },
})

export function localDate(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
export function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'No se pudo completar la operación.'
}
