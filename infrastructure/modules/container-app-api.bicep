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
          // Each worker loads its own copy of the model and the scored year
          // frames, so a second worker would not fit this container.
          //
          // Measured at these limits: 214 MiB resident of the 512 MiB cap, and
          // the frontend's full-population load (22 sequential paged requests)
          // completes in ~4 s. Sized down from 0.5 vCPU / 1 GiB, which was
          // roughly twice what the service ever uses.
          resources: {
            cpu: json('0.25') // json() wrapper is mandatory for a decimal CPU
            memory: '0.5Gi'
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
        // Scales to zero deliberately, which is a cost decision rather than an
        // architectural one. This service holds expensive startup state (the
        // model bundle and both scored years) and near-zero steady state, so an
        // always-on replica burns ~USD 34/month to serve a portfolio site that
        // is read a few times a day. At minReplicas 0 the compute sits inside
        // the monthly free grant instead.
        //
        // The cost is a cold start of roughly 15-20 s on the first request
        // after an idle period. That is only acceptable because the frontend
        // handles it explicitly: see the retry backoff in frontend/src/main.tsx
        // and the waking-up state in frontend/src/App.tsx. If this ever becomes
        // an operational service rather than a demo, set this back to 1.
        minReplicas: 0
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
