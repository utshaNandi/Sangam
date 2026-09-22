import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css' // IF THIS IS MISSING, TAILWIND WILL NOT WORK

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)