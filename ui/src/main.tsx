import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LiveApp from './LiveApp'
import './live-styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><LiveApp /></StrictMode>)
