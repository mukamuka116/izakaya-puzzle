import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { preloadAll } from './sound'
import './clickSound'

createRoot(document.getElementById('root')).render(<App />)

preloadAll() // 起動したら、すべての音を先に読み込んで変換しておく
