import '../shared/tokens.css'
import './overlay.css'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { Overlay } from './Overlay'

createRoot(document.getElementById('overlay-root')!).render(
  // Motion follows the system's reduced-motion setting, as the CSS does.
  <MotionConfig reducedMotion="user">
    <Overlay />
  </MotionConfig>
)
