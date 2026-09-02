// Azure Static Web App hosting the React/Vite frontend, linked to arotahi-api
// as its backend so /api/* requests are proxied server-to-server to the same
// route on the Container App — the browser sees ONE origin for both static
// assets and API calls.
//
// This is what resolves the same-origin requirement without touching either
// codebase: frontend/src/api/client.ts fetches root-relative /api/... paths and
// the FastAPI app registers no CORS middleware. Locally the vite dev proxy
// stands in; this linked backend makes the same topology true in production.
//
// Requires the Standard plan — linked backends are a Standard-plan feature.
// Linking auto-restricts the Container App to accept only traffic proxied
// through this Static Web App (its raw *.azurecontainerapps.io FQDN stops
// answering direct hits once linked). That is the intended posture — one public
// front door — not a bug, so smoke tests must target the SWA host.
//
// The frontend build (npm run build -> dist/) is NOT done here; it is driven by
// Azure/static-web-apps-deploy@v1 in .github/workflows/deploy.yml. This module
// only provisions the resource and its backend link.
//
// The deployment token is deliberately NOT a Bicep output: a list*() result
// landing in an output is written into the deployment's activity log, readable
// by anyone with read access to the resource group. The workflow fetches it with
// `az staticwebapp secrets list` instead.

param location string
param namePrefix string
param containerAppId string
param containerAppLocation string

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' = {
  name: '${namePrefix}-web'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    // Token-based deploy rather than a repositoryUrl push-to-deploy link, so
    // the SWA upload is one job inside deploy.yml rather than a separate
    // auto-triggered GitHub integration.
    buildProperties: {
      appLocation: 'frontend'
      outputLocation: 'dist'
    }
  }
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2025-03-01' = {
  parent: staticWebApp
  name: 'arotahi-api'
  properties: {
    backendResourceId: containerAppId
    // The backend's region, not the SWA's — they may differ.
    region: containerAppLocation
  }
}

output staticWebAppId string = staticWebApp.id
output staticWebAppName string = staticWebApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
