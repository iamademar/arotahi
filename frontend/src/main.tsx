import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import App from './App'
// Before the project styles: MapLibre positions its canvas, markers and
// attribution control from this sheet, and project rules must win over it.
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" drops transform and layout animation for anyone
          who asks for it at the OS level, keeping opacity fades. Nothing here
          should ship without it. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
)
