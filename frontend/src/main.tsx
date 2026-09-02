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

// The prediction API scales to zero, so the first request after an idle period
// waits for a container start plus the model load. Measured against the
// deployed service: 32s. (Locally the same image cold-starts in 16s — Azure
// adds image pull and scheduling on top, so trust the deployed figure.)
//
// These retries turn that into a slow load rather than an error. Eight attempts
// with exponential backoff capped at 8s span ~47s, comfortably past the measured
// cold start. The margin is deliberate: an earlier 31s window sat within a
// second of the real 32s and would have failed just as the service came up.
// Applies to every query, because any of them can be the request that happens
// to wake the service.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 8,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
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
