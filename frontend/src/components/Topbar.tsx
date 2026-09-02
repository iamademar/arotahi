import { NavLink } from 'react-router-dom'
import { APP_DESCRIPTOR, APP_NAME } from '../lib/copy'

interface TopbarProps {
  shortlistCount: number
}

/** The icon each route carries, named by the design system's SiteHeader. */
const NAV_ICONS = {
  // Lucide "map": the prioritisation view is the scored grid on a basemap.
  map: (
    <>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </>
  ),
  // Lucide "bookmark": areas the analyst has set aside.
  bookmark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />,
  // Lucide "bar-chart-3": how the model measured against locked test years.
  'bar-chart-3': (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
} as const

/**
 * Inline SVG rather than a fetched sprite so the icon arrives with the markup
 * and inherits the link's colour, including the active state. Decorative: the
 * link's own text names the destination, so this adds nothing for a screen
 * reader and stays out of the accessible name.
 */
function NavIcon({ name }: { name: keyof typeof NAV_ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICONS[name]}
    </svg>
  )
}

const REPO_URL = 'https://github.com/iamademar/arotahi'

/**
 * The GitHub mark, as a single filled path rather than the stroked Lucide icons
 * above: it is a wordless brand glyph, so it has to be the official shape. It
 * still inherits the link's colour through `fill="currentColor"`.
 */
function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  )
}

export function Topbar({ shortlistCount }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        {/* Decorative: the wordmark beside it already names the app, so the
            logo would only repeat it to a screen reader. The file is 144px and
            draws at 50px, so it stays sharp on retina displays. */}
        <img className="brand-mark" src="/arotahi-logo.png" alt="" aria-hidden="true" />
        <div>
          <strong>{APP_NAME}</strong>
          <small>{APP_DESCRIPTOR}</small>
        </div>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <NavIcon name="map" />
          Prioritisation
        </NavLink>
        <NavLink to="/shortlist" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <NavIcon name="bookmark" />
          Shortlist
          <span className="count">{shortlistCount}</span>
        </NavLink>
        <NavLink to="/model" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <NavIcon name="bar-chart-3" />
          Data Pipeline
        </NavLink>
      </nav>

      <div className="header-actions">
        {/* Opens in a new tab so an analyst mid-review does not lose the queue;
            rel guards the opener reference the new tab would otherwise get. */}
        <a
          className="prototype repo-link"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <GithubIcon />
          GitHub
        </a>
      </div>
    </header>
  )
}
