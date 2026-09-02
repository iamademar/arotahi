/** What the project is built with, for a reader who wants the stack rather than
    the model.

    Every entry here is a dependency that is actually installed and actually
    imported — the lists were taken from frontend/package.json, ml/requirements.txt
    and prediction-api/requirements.txt, not from intent. There is deliberately no
    Docker, CI, cloud or database entry: the repo has none, and a stack list that
    claims infrastructure the project does not have is worse than no list.

    Logos are vendored under public/tech/ rather than hotlinked, so the panel has
    no runtime dependency on a CDN. They are Simple Icons (CC0), single-path and
    unfilled, which is what lets the CSS mask tint the whole set one green. */

interface Tech {
  name: string
  /** Simple Icons slug under public/tech/, or null where the set has no entry. */
  slug: string | null
  /** Initials shown in place of a missing logo. Required when slug is null. */
  mono?: string
  role: string
  use: string
}

const GROUPS: { title: string; blurb: string; items: Tech[] }[] = [
  {
    title: 'Frontend',
    blurb: 'A single-page React app: the map, the ranked queue and the analyst shortlist.',
    items: [
      {
        name: 'React',
        slug: 'react',
        role: 'UI library',
        use: 'Builds the three views — prioritisation, shortlist and this documentation page.',
      },
      {
        name: 'TypeScript',
        slug: 'typescript',
        role: 'Typed JavaScript',
        use: 'Types every component and API shape; the production build fails on a type error.',
      },
      {
        name: 'Vite',
        slug: 'vite',
        role: 'Build tool and dev server',
        use: 'Bundles the app and proxies API calls to the Python service in development.',
      },
      {
        name: 'React Router',
        slug: 'reactrouter',
        role: 'Client-side routing',
        use: 'Serves the three routes without a page reload between them.',
      },
      {
        name: 'TanStack Query',
        slug: 'reactquery',
        role: 'Server-state management',
        use: 'Caches every API response so switching views never refetches a settled run.',
      },
      {
        name: 'MapLibre GL JS',
        slug: 'maplibre',
        role: 'Interactive vector maps',
        use: 'Draws all scored grid cells as one GeoJSON layer, rendered on the GPU.',
      },
      {
        name: 'proj4',
        slug: null,
        mono: 'p4',
        role: 'Coordinate reprojection',
        use: 'Converts NZ Transverse Mercator (EPSG:2193) to the WGS84 the map expects.',
      },
      {
        name: 'Zod',
        slug: 'zod',
        role: 'Runtime schema validation',
        use: 'Validates every API response, so a shape change surfaces immediately.',
      },
      {
        name: 'Motion',
        slug: 'framer',
        role: 'Animation library',
        use: 'Animates queue and drawer transitions, honouring reduced-motion settings.',
      },
      {
        name: 'OpenStreetMap',
        slug: 'openstreetmap',
        role: 'Open basemap data',
        use: 'Supplies the underlying basemap tiles, served via OpenFreeMap.',
      },
    ],
  },
  {
    title: 'Machine learning',
    blurb: 'The offline pipeline that turns raw crash records into a calibrated risk model.',
    items: [
      {
        name: 'Python',
        slug: 'python',
        role: 'Pipeline language',
        use: 'Runs the whole modelling pipeline, from grid construction to evaluation.',
      },
      {
        name: 'LightGBM',
        slug: null,
        mono: 'LGB',
        role: 'Gradient-boosted trees',
        use: 'The production model that estimates each area’s risk of a serious crash.',
      },
      {
        name: 'scikit-learn',
        slug: 'scikitlearn',
        role: 'ML toolkit',
        use: 'Provides isotonic calibration, preprocessing, and the baselines to beat.',
      },
      {
        name: 'pandas',
        slug: 'pandas',
        role: 'Dataframe library',
        use: 'Builds the yearly panel of grid cells and their crash histories.',
      },
      {
        name: 'NumPy',
        slug: 'numpy',
        role: 'Numerical computing',
        use: 'Backs the feature maths and the seeded bootstrap confidence intervals.',
      },
      {
        name: 'Apache Parquet',
        slug: 'apacheparquet',
        role: 'Columnar data format',
        use: 'Stores the feature panel — read via PyArrow, no database involved.',
      },
      {
        name: 'SHAP',
        slug: null,
        mono: 'SH',
        role: 'Model explainability',
        use: 'Attributes each ranking to the features that drove it, for analyst review.',
      },
      {
        name: 'Matplotlib',
        slug: null,
        mono: 'plt',
        role: 'Charting',
        use: 'Renders the calibration and evaluation figures in the modelling outputs.',
      },
      {
        name: 'Jupyter',
        slug: 'jupyter',
        role: 'Notebooks',
        use: 'Documents the exploratory analysis behind the modelling decisions.',
      },
    ],
  },
  {
    title: 'API and serving',
    blurb: 'A small Python service that loads the trained model and answers scoring requests.',
    items: [
      {
        name: 'FastAPI',
        slug: 'fastapi',
        role: 'Web framework',
        use: 'Serves the scoring, ranking, model-card and feature-dictionary endpoints.',
      },
      {
        name: 'Uvicorn',
        slug: null,
        mono: 'uv',
        role: 'ASGI server',
        use: 'Runs the API process.',
      },
      {
        name: 'Pydantic',
        slug: 'pydantic',
        role: 'Request and response models',
        use: 'Defines and validates the API contract, and generates its OpenAPI docs.',
      },
      {
        name: 'joblib',
        slug: null,
        mono: 'jl',
        role: 'Model serialisation',
        use: 'Loads the trained model artefact at startup, on pinned library versions.',
      },
    ],
  },
  {
    title: 'Testing and tooling',
    blurb: 'Both halves of the project are covered by tests.',
    items: [
      {
        name: 'Vitest',
        slug: 'vitest',
        role: 'Frontend test runner',
        use: 'Runs the component, geometry and metric test suites.',
      },
      {
        name: 'Testing Library',
        slug: 'testinglibrary',
        role: 'Component testing',
        use: 'Drives components the way an analyst would, rather than by internals.',
      },
      {
        name: 'pytest',
        slug: 'pytest',
        role: 'Python test runner',
        use: 'Covers the pipeline, and checks served scores match the frozen backtest.',
      },
      {
        name: 'npm',
        slug: 'npm',
        role: 'Package manager',
        use: 'Manages frontend dependencies and the build, test and dev scripts.',
      },
    ],
  },
]

function TechIcon({ slug, mono }: { slug: string | null; mono?: string }) {
  if (slug === null) {
    return (
      <span className="tech-mono" aria-hidden="true">
        {mono}
      </span>
    )
  }
  // Masked rather than rendered: an <img> cannot inherit currentColor, and these
  // logos have to read as one set in the project green rather than 20 brand colours.
  return (
    <span
      className="tech-icon"
      style={{ maskImage: `url(/tech/${slug}.svg)`, WebkitMaskImage: `url(/tech/${slug}.svg)` }}
      aria-hidden="true"
    />
  )
}

export function TechnologiesUsed() {
  return (
    <div className="panel-body">
      <p className="metrics-caption">
        Everything below is in use in this repository. There is no database: the feature panel
        is held in Parquet files and read into pandas when the API starts.
      </p>

      {GROUPS.map((group) => (
        <div className="feature-group" key={group.title}>
          <h3>
            {group.title}{' '}
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>({group.items.length})</span>
          </h3>
          <p className="tech-blurb">{group.blurb}</p>
          <div className="feature-list tech-list">
            {group.items.map((tech) => (
              <div className="feature-item tech-item" key={tech.name}>
                <TechIcon slug={tech.slug} mono={tech.mono} />
                <div className="tech-text">
                  <strong className="tech-name">{tech.name}</strong>
                  <small className="tech-role">{tech.role}</small>
                  <p className="tech-use">{tech.use}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
