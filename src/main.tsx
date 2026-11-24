import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root'
import { registerImageCache } from './lib/imageCache'

void registerImageCache().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
))
