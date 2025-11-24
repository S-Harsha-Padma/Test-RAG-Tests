# GitHub Actions Setup for Azure Deployment

## Step 1: Copy Publish Profile

The publish profile has been saved to `publish-profile.xml`.

```bash
# View the content
cat publish-profile.xml
```

Copy the entire XML content (it's one long line starting with `<publishData>` and ending with `</publishData>`).

## Step 2: Add GitHub Secret

1. Go to your GitHub repository:
   https://github.com/adobe-commerce/azure-commerce-documentation-agent

2. Navigate to **Settings** → **Secrets and variables** → **Actions**

3. Click **New repository secret**

4. Fill in:
   - **Name**: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
   - **Value**: Paste the entire XML content from `publish-profile.xml`

5. Click **Add secret**

## Step 3: Test the Workflow

### Option A: Push to Main
```bash
git add .
git commit -m "Test GitHub Actions deployment"
git push origin main
```

### Option B: Manual Trigger
1. Go to GitHub → **Actions** tab
2. Select **Deploy Azure Functions** workflow
3. Click **Run workflow** → **Run workflow**

## Step 4: Monitor Deployment

1. Go to GitHub → **Actions** tab
2. Click on the running workflow
3. Watch the progress:
   - ✅ Run Tests
   - ✅ Deploy to Azure
   - ✅ Notify Deployment Status

## Step 5: Verify Deployment

After successful deployment, test the endpoint:

```bash
curl -X POST https://commerce-docs-api.azurewebsites.net/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to install Adobe Commerce?",
    "count": 5
  }'
```

## Troubleshooting

### Workflow Fails on Test Step
- Check that `npm test` and `npm run lint` work locally
- Currently they're set to pass (echo and exit 0)

### Workflow Fails on Deploy Step
- Verify the publish profile secret is correct
- Check Azure Function App is running:
  ```bash
  az functionapp show \
    --name commerce-docs-api \
    --resource-group commerce-ai-docs-rg \
    --query "state"
  ```

### Deployment Succeeds but Verification Fails
- Check Azure Functions logs:
  ```bash
  az functionapp log tail \
    --name commerce-docs-api \
    --resource-group commerce-ai-docs-rg
  ```

## Clean Up

After testing, you can delete the publish profile file:

```bash
rm publish-profile.xml
```

**Note**: The file is already in `.gitignore` so it won't be committed.

---

**Resource Group**: `commerce-ai-docs-rg` (not `commerce-docs-rg`)  
**Function App**: `commerce-docs-api`  
**Endpoint**: https://commerce-docs-api.azurewebsites.net
