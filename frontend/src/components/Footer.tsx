import {
  APP_DESCRIPTOR,
  APP_NAME,
  APP_NAME_MEANING,
  APP_NAME_SOURCE,
  APP_TAGLINE,
  AUTHOR_BIO,
  AUTHOR_INTRO,
  AUTHOR_NAME_AND_ROLE,
  AUTHOR_PROJECT_NOTE,
} from '../lib/copy'

/** Already cited in the README; the name's dictionary entry. */
const TE_AKA_URL = 'https://maoridictionary.co.nz/'

const AUTHOR_LINKS = [
  { label: 'GitHub', href: 'https://github.com/iamademar' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ademar-tutor-0a95972a' },
  { label: 'Personal site', href: 'https://www.ademartutor.com/' },
]

/**
 * Site-wide footer: what the project is, where its name comes from, and who
 * built it. The spec section 7 scope notice is deliberately not here; note it
 * is currently not shown anywhere in the app (see Notices.tsx).
 */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <div className="site-footer-brand">
            {/* Decorative, as in the Topbar: the name sits right beside it, so
                alt text would only repeat "Arotahi" to a screen reader. */}
            <img className="site-footer-mark" src="/arotahi-logo.png" alt="" aria-hidden="true" />
            <strong>{APP_NAME}</strong>
          </div>
          <p className="site-footer-descriptor">{APP_DESCRIPTOR}</p>
          <p>{APP_TAGLINE}</p>
        </div>

        <div>
          <strong>About the name</strong>
          <p>{APP_NAME_MEANING}</p>
          <p className="site-footer-source">
            Source:{' '}
            <a href={TE_AKA_URL} target="_blank" rel="noreferrer noopener">
              {APP_NAME_SOURCE} ↗
            </a>
          </p>
        </div>

        <div>
          <strong>Built by</strong>
          <p className="site-footer-author">{AUTHOR_NAME_AND_ROLE}</p>
          <p>{AUTHOR_INTRO}</p>
          <p>{AUTHOR_BIO}</p>
          <p>{AUTHOR_PROJECT_NOTE}</p>
          <ul className="site-footer-links">
            {AUTHOR_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
