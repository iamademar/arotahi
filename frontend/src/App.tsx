import { useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useHealth } from "./api/queries";
import { Topbar } from "./components/Topbar";
import { Footer } from "./components/Footer";
import { VersionMismatchBanner } from "./components/Notices";
import { EMPTY_FILTERS, type FilterState } from "./components/Controls";
import { PrioritisationView } from "./views/Prioritisation/PrioritisationView";
import { ShortlistView } from "./views/Shortlist/ShortlistView";
import { ModelPerformanceView } from "./views/ModelPerformance/ModelPerformanceView";
import { useShortlist } from "./lib/useShortlist";
import modelMetrics from "./data/modelMetrics.json";

/** Shared run selection, so the three views agree on which run is in view. */
export interface RunState {
  year: number | undefined;
  region: string;
  capacity: number;
  filters: FilterState;
  revealed: boolean;
}

export default function App() {
  const health = useHealth();
  const years = health.data?.years_available ?? [];
  const modelVersion = health.data?.model_version;

  const [run, setRun] = useState<RunState>({
    year: undefined,
    region: "Auckland Region",
    capacity: 50,
    filters: EMPTY_FILTERS,
    revealed: false,
  });

  // Default to the most recent served year once /health answers.
  useEffect(() => {
    if (run.year === undefined && years.length > 0) {
      setRun((current) => ({ ...current, year: Math.max(...years) }));
    }
  }, [years, run.year]);

  const shortlist = useShortlist(run.year, modelVersion);

  const versionMismatch = useMemo(
    () => !!modelVersion && modelVersion !== modelMetrics.model_version,
    [modelVersion],
  );

  return (
    <>
      <Topbar shortlistCount={shortlist.entries.length} />

      {/* The service scales to zero, so a first visit after an idle period waits
          for it to start. Say so plainly rather than showing nothing, or the
          page reads as broken while it is merely waking. */}
      {health.isPending && (
        <div className="workspace">
          <div className="version-banner is-info" role="status">
            <strong>Waking the prediction service</strong>
            This can take up to 20 seconds on the first visit. The review queue
            loads automatically once it responds.
          </div>
        </div>
      )}

      {health.error && (
        <div className="workspace">
          <div className="version-banner" role="alert">
            <strong>Cannot reach the prediction service</strong>
            {(health.error as Error).message}.{" "}
            {import.meta.env.DEV ? (
              <>
                Start it with <code>uvicorn app.main:app --reload</code> in{" "}
                <code>prediction-api/</code>, then reload.
              </>
            ) : (
              <>Please reload the page to try again.</>
            )}
          </div>
        </div>
      )}

      {/* Until /health answers there is no served year, so the views would render
          a placeholder shell — "0 eligible areas", a year range of "-5—-1". That
          reads as real data rather than as an empty state, so hold the routes
          back until the service has responded. */}
      {health.isPending ? null : (
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
            element={
              <ShortlistView
                run={run}
                shortlist={shortlist}
                modelVersion={modelVersion}
              />
            }
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
      )}

      <Footer />
    </>
  );
}
