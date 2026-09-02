// Azure Container Registry for the arotahi-api image. No admin user — the
// Container App pulls via its user-assigned managed identity's AcrPull role
// instead of shared credentials (see container-app-api.bicep).

param location string
param namePrefix string

// ACR names must be globally unique, alphanumeric only (no hyphens).
var acrName = replace('${namePrefix}acr', '-', '')

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  // Basic, not Standard: the registry holds one small image (~212 MB against
  // Basic's 10 GB quota). Standard's geo-replication and higher throughput buy
  // nothing here. Must match the --sku in deploy.yml's bootstrap-acr job.
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled' // image pushes from GitHub Actions; pulls are identity-based regardless
  }
}

output registryId string = acr.id
output loginServer string = acr.properties.loginServer
output name string = acr.name
