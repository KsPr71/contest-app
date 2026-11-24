import { lazy, Suspense } from 'react'
import App from './App'
const Admin = lazy(() => import('./pages/Admin'))

export default function Root() {
  return <Suspense fallback={<p>Cargando administración…</p>}>
    {/^\/admin\/?$/.test(window.location.pathname) ? <Admin /> : <App />}
  </Suspense>
}
