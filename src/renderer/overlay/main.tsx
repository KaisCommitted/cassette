import '../shared/tokens.css'
import './overlay.css'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'

createRoot(document.getElementById('overlay-root')!).render(<Overlay />)
