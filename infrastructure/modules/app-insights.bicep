// Application Insights plus the Log Analytics workspace behind it.
//
// One workspace serves both App Insights and the Container Apps Environment's
// console-log destination (see container-apps-env.bicep) rather than
// provisioning two — a single place to query both application telemetry and
// container stdout.

param location string
param namePrefix string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    // Bound the worst case: without a cap a log-spam bug bills without limit.
    // Normal operation for this service is far below 0.5 GB/day.
    workspaceCapping: {
      dailyQuotaGb: json('0.5')
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
  }
}

output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
