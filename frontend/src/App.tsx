import { useEffect, useMemo, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useHealth } from './api/queries'
import { Topbar } from './components/Topbar'
import { Footer } from './components/Footer'
import { VersionMismatchBanner } from './components/Notices'
import { EMPTY_FILTERS, type FilterState } from './components/Controls'
import { PrioritisationView } from './views/Prioritisation/PrioritisationView'
import { ShortlistView } from './views/Shortlist/ShortlistView'
import { ModelPerformanceView } from './views/ModelPerformance/ModelPerformanceView'
import { useShortlist } from './lib/useShortlist'
import modelMetrics from './data/modelMetrics.json'

/** Shared run selection, so the three views agree on which run is in view. */
export interface RunState {
  year: number | undefined
  region: string
  capacity: number
  filters: FilterState
  revealed: boolean
}

export default function App() {
  const health = useHealth()
  const years = health.data?.years_available ?? []
  const modelVersion = health.data?.model_version

  const [run, setRun] = useState<RunState>({
    year: undefined,
    region: 'Auckland Region',
    capacity: 50,
    filters: EMPTY_FILTERS,
    revealed: false,
  })

  // Default to the most recent served year once /health answers.
  useEffect(() => {
    if (run.year === undefined && years.length > 0) {
      setRun((current) => ({ ...current, year: Math.max(...years) }))
    }
  }, [years, run.year])

  const shortlist = useShortlist(run.year, modelVersion)

  const versionMismatch = useMemo(
    () => !!modelVersion && modelVersion !== modelMetrics.model_version,
    [modelVersion],
  )

  return (
    <>
      <Topbar modelVersion={modelVersion} shortlistCount={shortlist.entries.length} />

      {health.error && (
        <div className="workspace">
          <div className="version-banner" role="alert">
            <strong>Cannot reach the prediction service</strong>
            {(health.error as Error).message}. Start it with{' '}
            <code>uvicorn app.main:app --reload</code> in <code>prediction-api/</code>, then reload.
          </div>
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <PrioritisationView
              run={run}
              setRun={setRun}
              years={years}
              modelVersion={modelVersion}
              shortlist={shortlist}
              banner={
                versionMismatch && modelVersion ? (
                  <VersionMismatchBanner
                    expected={modelMetrics.model_version}
                    actual={modelVersion}
                  />
                ) : null
              }
            />
          }
        />
        <Route
          path="/shortlist"
          element={<ShortlistView run={run} shortlist={shortlist} modelVersion={modelVersion} />}
        />
        <Route
          path="/model"
          element={
            <ModelPerformanceView
              modelVersion={modelVersion}
              health={health.data}
              versionMismatch={versionMismatch}
            />
          }
        />
      </Routes>

      <Footer />
    </>
  )
}
