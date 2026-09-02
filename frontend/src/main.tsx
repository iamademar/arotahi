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
// waits for a container start plus the model load. Measured at 16.2s locally,
// and Azure is the same order.
//
// These retries turn that into a slow load rather than an error. Six attempts
// with exponential backoff capped at 8s span ~39s, which leaves real margin
// over the measured cold start — a window that merely matched it would fail
// exactly when the service was about to come up. Applies to every query,
// because any of them can be the request that happens to wake the service.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 6,
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
