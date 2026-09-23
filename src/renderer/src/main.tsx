import './styles.css'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  // Motion follows the system's reduced-motion setting, as the CSS does.
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>
)
