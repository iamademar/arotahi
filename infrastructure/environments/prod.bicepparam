// Production environment for Arotahi.
//
// To add another environment, copy this file with a different namePrefix rather
// than adding environment-switch logic to main.bicep.
//
// imageTag is read from the IMAGE_TAG environment variable, NOT passed as
// `--parameters imageTag=...`. .github/workflows/deploy.yml sets it as a job env
// var on the deploy step; this coupling is otherwise invisible, so keep the two
// in step.

using '../main.bicep'

param namePrefix = 'arotahi'

// Static Web Apps is unavailable in the Australia regions; East US 2 hosts both
// resources so the SWA-to-backend proxy hop stays in-region. That matters here
// because the frontend pages the full national population in ~22 sequential
// requests (see getFullPopulation in frontend/src/api/client.ts).
param location = 'eastus2'
param staticWebAppLocation = 'eastus2'

param imageTag = readEnvironmentVariable('IMAGE_TAG', 'latest')
