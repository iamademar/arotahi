// Arotahi — NZ Crash Area Prioritiser. Full production topology.
//
//   Static Web App (static assets + /api/* proxy)
//        └─ linked backend ─> Container App (FastAPI, 0.5 vCPU / 1Gi)
//                                  └─ pulls from ACR via user-assigned identity
//
// Deliberately absent: no database, no Key Vault, no VNet, no private endpoints,
// no storage. The service is stateless and its model and data are baked into the
// image, so none of that machinery has anything to protect or connect to.
//
// ORDERING: ACR must already hold the image tag this deployment references.
// Bicep cannot express that; .github/workflows/deploy.yml guarantees it by
// running the build job before this one.

targetScope = 'resourceGroup'

param location string = resourceGroup().location

// Static Web Apps is available in only a handful of regions, so it is
// parameterised separately from everything else.
param staticWebAppLocation string = location

param namePrefix string
param imageTag string

var acrImageApi = 'arotahi-api'

resource identityApi 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-id-api'
  location: location
}

module acr 'modules/container-registry.bicep' = {
  name: 'acr'
  params: {
    location: location
    namePrefix: namePrefix
  }
}

module appInsights 'modules/app-insights.bicep' = {
  name: 'appinsights'
  params: {
    location: location
    namePrefix: namePrefix
  }
}

module containerAppsEnv 'modules/container-apps-env.bicep' = {
  name: 'containerappsenv'
  params: {
    location: location
    namePrefix: namePrefix
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

module api 'modules/container-app-api.bicep' = {
  name: 'container-app-api'
  params: {
    location: location
    namePrefix: namePrefix
    environmentId: containerAppsEnv.outputs.environmentId
    userAssignedIdentityId: identityApi.id
    userAssignedIdentityPrincipalId: identityApi.properties.principalId
    acrLoginServer: acr.outputs.loginServer
    acrId: acr.outputs.registryId
    imageName: acrImageApi
    imageTag: imageTag
    appInsightsConnectionString: appInsights.outputs.appInsightsConnectionString
  }
}

module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'static-web-app'
  params: {
    location: staticWebAppLocation
    namePrefix: namePrefix
    containerAppId: api.outputs.containerAppId
    containerAppLocation: location
  }
}

output containerRegistryLoginServer string = acr.outputs.loginServer
output apiFqdn string = api.outputs.fqdn
output staticWebAppName string = staticWebApp.outputs.staticWebAppName
output staticWebAppHostname string = staticWebApp.outputs.staticWebAppHostname
