// arotahi-api Container App — the FastAPI scoring service.
//
// ingress.external: true is required even though the Static Web App links to
// this app as its backend. Linking auto-restricts inbound to SWA-proxied
// traffic (see static-web-app.bicep), but Container Apps requires external
// ingress for a resource to be linkable at all.
//
// No secrets block: the service has no database, no API keys and no auth. Its
// model and data are baked into the image, so there is nothing to inject.

param location string
param namePrefix string
param environmentId string
param userAssignedIdentityId string
param userAssignedIdentityPrincipalId string
param acrLoginServer string
param acrId string
param imageName string
param imageTag string
param appInsightsConnectionString string

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, userAssignedIdentityPrincipalId, 'AcrPull-api')
  scope: resourceGroup()
  properties: {
    principalId: userAssignedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
  }
}

resource containerApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: '${namePrefix}-api'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: userAssignedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'arotahi-api'
          image: '${acrLoginServer}/${imageName}:${imageTag}'
          // No command override: the image's CMD is already the correct uvicorn
          // invocation, and it carries --workers 1, which must not be lost.
          // Each worker loads its own ~570 MB copy of the model and the scored
          // year frames, so a second worker would not fit this container.
          resources: {
            cpu: json('0.5') // json() wrapper is mandatory for a decimal CPU
            memory: '1Gi'
          }
          env: [
            {
              name: 'ENVIRONMENT'
              value: 'production'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              // The app's lifespan loads the model before uvicorn binds the
              // port, so probes fail to connect until it is genuinely ready.
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              // Must exceed worst-case startup, or a healthy-but-starting
              // replica gets killed in a loop.
              initialDelaySeconds: 30
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        // Never scale to zero: a cold start re-pays the model load and the
        // parquet read. The service holds expensive startup state and near-zero
        // steady state, which is exactly the shape scale-to-zero punishes.
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
  dependsOn: [
    acrPullRole // the first revision cannot pull before the grant exists
  ]
}

output containerAppId string = containerApp.id
output fqdn string = containerApp.properties.configuration.ingress.fqdn
