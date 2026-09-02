import { NavLink } from 'react-router-dom'
import { APP_DESCRIPTOR, APP_NAME } from '../lib/copy'

interface TopbarProps {
  modelVersion: string | undefined
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

export function Topbar({ modelVersion, shortlistCount }: TopbarProps) {
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
        <span className="prototype">{modelVersion ?? 'Connecting…'}</span>
      </div>
    </header>
  )
}
