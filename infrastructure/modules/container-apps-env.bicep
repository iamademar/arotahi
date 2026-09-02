// Container Apps Environment hosting the single arotahi-api app.
//
// No vnetConfiguration: the reference deployment this is adapted from injected
// its environment into a VNet solely to reach Postgres, Key Vault and Storage
// over private endpoints. Arotahi has none of those — it is a stateless service
// whose data is baked into the image — so it runs on Azure-managed networking.
// Public vs. private is controlled per-app by the Container App's own
// ingress.external flag, not here.

param location string
param namePrefix string
param logAnalyticsWorkspaceId string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: '${namePrefix}-cae'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = containerAppsEnv.id
output environmentDefaultDomain string = containerAppsEnv.properties.defaultDomain
