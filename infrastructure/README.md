# Deploying Arotahi to Azure

Infrastructure is defined in `main.bicep` + five modules and deployed by
`.github/workflows/deploy.yml`. Everything below the one-time setup is automated.

## Topology

```
Static Web App (Standard)          static assets + /api/* proxy
   └─ linked backend ──> Container App  arotahi-api, 0.5 vCPU / 1Gi, 1-3 replicas
                             └─ pulls from ACR via user-assigned managed identity
```

The linked backend is the load-bearing piece. `frontend/src/api/client.ts` fetches
root-relative `/api/...` paths and the FastAPI app registers no CORS middleware,
so the browser must see one origin. Locally the vite dev proxy provides that; in
production the Static Web App proxies `/api/*` to the Container App, which makes
the same topology true without a code change in either project.

Deliberately absent: no database, no Key Vault, no VNet, no private endpoints, no
storage. The service is stateless and its model and data are baked into the image.

| Resource | Name | Notes |
|---|---|---|
| Resource group | `rg-arotahi-core` | East US 2 |
| Container registry | `arotahiacr` | Standard, admin user disabled |
| Container App | `arotahi-api` | `minReplicas: 1` — never scale to zero |
| Static Web App | `arotahi-web` | Standard SKU; linked backends need it |
| Log Analytics / App Insights | `arotahi-law` / `arotahi-appi` | 30-day retention |

Region is East US 2 because Static Web Apps is unavailable in the Australia
regions, and co-locating keeps the SWA-to-backend proxy hop in-region — which
matters because the frontend pages the national population in ~22 sequential
requests.

## One-time setup

These touch the Entra tenant and GitHub settings, so they are not automated.
Run them once; every deploy afterwards is just the workflow.

### 1. Create the app registration and service principal

```bash
APP_ID=$(az ad app create --display-name "arotahi-github-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID"
echo "AZURE_CLIENT_ID = $APP_ID"
```

### 2. Grant it rights on the subscription

`Contributor` creates the resources; the RBAC admin role is needed because the
deployment assigns `AcrPull` to the Container App's managed identity.

```bash
SUB=$(az account show --query id -o tsv)
SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)

az role assignment create --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" --scope "/subscriptions/$SUB"

az role assignment create --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Role Based Access Control Administrator" --scope "/subscriptions/$SUB"
```

### 3. Add the federated credential

This is what lets GitHub Actions log in with no stored secret. The `subject` must
match `<owner>/<repo>` and the workflow's `environment: production` exactly. A
mismatch fails at the login step with `AADSTS70021: No matching federated
identity record found` — which does not mention the repo name, so it reads like
a broken secret rather than what it usually is.

```bash
# Derives owner/repo from the origin remote, so a repo rename can't silently
# leave a stale subject behind.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"arotahi-deploy-production-environment\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${REPO}:environment:production\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
```

**If your account has immutable OIDC subject claims enabled**, GitHub sends the
subject with numeric IDs appended — `repo:owner@<owner_id>/repo@<repo_id>:...` —
and the plain-name credential above will NOT match. The login fails with
`AADSTS700213`, and the error prints the exact subject GitHub sent, which is the
quickest way to spot this. Add a second credential for that form:

```bash
IDS=$(gh api repos/"$REPO" --jq '"\(.owner.login)@\(.owner.id)/\(.name)@\(.id)"')

az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"arotahi-deploy-production-immutable\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${IDS}:environment:production\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
```

Keep both credentials. An app can hold several, so the deploy works whichever
form GitHub sends, and you are covered if the setting is toggled later.

The immutable form also survives a repo rename, which the plain form does not —
GitHub redirects the old repo URL, but that redirect does **not** apply to OIDC
token subjects. If you rename and are using the plain form, add a credential for
the new name before deleting the old one.

### 4. Configure GitHub

- Create an environment named **`production`** (Settings → Environments). Add a
  deployment branch/tag rule allowing `main` and `arotahi-v*`.
- Add these repository secrets. None of the three is a credential — they are
  identifiers, and OIDC is what actually authorises the deploy — but they are
  kept in secrets rather than committed here so this public repo does not
  advertise which tenant and subscription to aim at.

  | Secret | Where to find it |
  |---|---|
  | `AZURE_CLIENT_ID` | the `$APP_ID` printed in step 1 |
  | `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
  | `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

## Deploying

Trigger the workflow manually (Actions → Deploy (Azure) → Run workflow) or push
a release tag:

```bash
git tag arotahi-v1.0.0 && git push origin arotahi-v1.0.0
```

Jobs run in order: bootstrap ACR → build image → deploy Bicep → deploy frontend →
smoke test. The smoke test asserts `/api/health` reports the expected model
version, a real scoring request returns 200, and the client-side routes
`/shortlist` and `/model` serve 200 rather than 404.

## Notes for whoever changes this next

**Re-run the export before rebuilding the image.** `prediction-api/data/` and
`models/` are committed (~5 MB) precisely so CI's `actions/checkout` carries
them. If the model or the source snapshot changes, run
`scripts/export_serving_data.py` and commit the result — the workflow's artefact
check fails fast if they are missing, but it cannot detect stale ones.

**The feature parquet is filtered to the served years.** `export_serving_data.py`
writes only 2024–2025. The source file is a single row group of all fifteen
years, so a read-time `filters=` cannot prune it — filtering at export is what
brings startup from ~1.3 GB to ~570 MB and makes the 1 GiB container viable. If
`SERVED_YEARS` in `app/dependencies.py` ever changes, change the export in
lockstep and re-measure before deploying.

**`libgomp1` is required in the image.** lightgbm links against OpenMP at import
and `python:3.11-slim` does not ship it; without the apt install the model
unpickle dies with `libgomp.so.1: cannot open shared object file`.

**Don't scale to zero.** The service holds expensive startup state and near-zero
steady state, so a cold start re-pays the model load on every idle period.

**The Container App's own FQDN stops answering once linked.** That is the
intended posture — one public front door. Debug through the SWA hostname and
`az containerapp logs show`, not by curling the `*.azurecontainerapps.io` address.

**ACR name is duplicated by hand** between `deploy.yml`'s `ACR_NAME` and
`modules/container-registry.bicep`'s derived `${namePrefix}acr`. Keep them in
step or the bootstrap job creates one registry and Bicep creates another.

## Verifying locally before you deploy

```bash
cd prediction-api
.venv/bin/python scripts/export_serving_data.py --ml-root ../ml   # ~3.3 MB feature parquet
.venv/bin/python -m pytest tests -q                                # 14 passed, not skipped

docker build -t arotahi-api:dev .
docker run --rm -p 8000:8000 --memory=1g --cpus=0.5 arotahi-api:dev
curl -s localhost:8000/api/health        # expect cas-area-risk-1.0.0, [2024, 2025]

cd ../frontend && npm test && npm run build
ls dist/staticwebapp.config.json          # must be present, or deep links 404
```

The `--memory=1g` flag matters: it reproduces the Container App's exact limit, so
an OOM shows up on your laptop instead of as a crash-looping revision.
