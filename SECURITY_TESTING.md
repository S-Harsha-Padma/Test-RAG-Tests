# Security Hardening - Testing Guide

## 🔒 Security Improvements Implemented

### Layer 1: Network Security (IP Restriction)
- **What**: Azure Function configured to only accept requests from APIM IP
- **APIM IP**: `48.217.203.230`
- **Result**: Direct access to Function blocked at network level

### Layer 2: Shared Secret Validation
- **What**: APIM sends secret header, Function validates it
- **Header**: `X-APIM-Secret`
- **Result**: Requests without valid secret get 403 Forbidden

### Layer 3: IMS Context Validation
- **What**: Function validates IMS headers forwarded by APIM
- **Headers**: `X-IMS-User-Id`, `X-IMS-Email`, `X-User-Tier`
- **Result**: Requests without IMS context get 401 Unauthorized

### Layer 4: Quota Enforcement
- **What**: Monthly token limits enforced per user tier
- **Limits**: Premium (1M), Standard (100K), Free (10K) tokens/month
- **Result**: Requests exceeding quota get 429 Quota Exceeded

### Layer 5: Usage Tracking
- **What**: All queries logged to Azure Table Storage
- **Tables**: `TokenUsage` (per-query), `MonthlyQuotas` (monthly totals)
- **Result**: Complete audit trail for compliance and analytics

---

## ✅ Test Scenarios

### Test 1: Valid Request via APIM (Should Work)
```bash
# Get fresh IMS token
aio config set cli.env stage
aio auth login
TOKEN=$(aio auth login --bare)

# Test query
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "webhooks", "count": 2}' | jq '.'
```

**Expected Result**: ✅ Success with usage info
```json
{
  "success": true,
  "results": [...],
  "usage": {
    "tokensUsed": 1234,
    "tokensRemaining": 998766,
    "monthlyLimit": 1000000,
    "tier": "premium",
    "percentUsed": 0
  }
}
```

### Test 2: Direct Access to Function (Should Fail)
```bash
curl -X POST https://commerce-docs-dev-api.azurewebsites.net/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | jq '.'
```

**Expected Result**: ❌ 403 Forbidden (IP restriction)
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Direct access not allowed. Please use the API gateway."
}
```

### Test 3: APIM Request Without IMS Token (Should Fail)
```bash
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | jq '.'
```

**Expected Result**: ❌ 401 Unauthorized (APIM blocks)
```json
{
  "error": "missing_token",
  "message": "IMS token required. Please include Authorization: Bearer <token> header."
}
```

### Test 4: Check Usage Tracking
```bash
# Query Azure Table Storage to see logged usage
az storage entity query \
  --table-name TokenUsage \
  --connection-string "$(az storage account show-connection-string \
    --name commercedocsdevstorage \
    --resource-group commerce-docs-dev-rg \
    --query connectionString -o tsv)" \
  --select PartitionKey,RowKey,timestamp,query,tokensUsed,tier \
  --top 5 \
  --output table
```

**Expected Result**: ✅ See recent queries logged

### Test 5: Check Monthly Quotas
```bash
# Query MonthlyQuotas table
az storage entity query \
  --table-name MonthlyQuotas \
  --connection-string "$(az storage account show-connection-string \
    --name commercedocsdevstorage \
    --resource-group commerce-docs-dev-rg \
    --query connectionString -o tsv)" \
  --select PartitionKey,RowKey,tokensUsed,email,tier \
  --output table
```

**Expected Result**: ✅ See quota usage per user

---

## 🎯 Security Verification Checklist

- [ ] Test 1: Valid APIM request works ✅
- [ ] Test 2: Direct Function access blocked ❌
- [ ] Test 3: Missing IMS token blocked ❌
- [ ] Test 4: Usage tracked in TokenUsage table ✅
- [ ] Test 5: Quotas updated in MonthlyQuotas table ✅
- [ ] Verify IP restriction in Azure Portal
- [ ] Verify shared secret configured in both APIM and Function
- [ ] Verify APIM policy includes X-APIM-Secret header
- [ ] Verify Function validates all security layers

---

## 📊 Monitoring Queries

### View Recent Queries
```bash
az storage entity query \
  --table-name TokenUsage \
  --connection-string "$(az storage account show-connection-string \
    --name commercedocsdevstorage \
    --resource-group commerce-docs-dev-rg \
    --query connectionString -o tsv)" \
  --filter "timestamp ge datetime'$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)'" \
  --output table
```

### View User Quotas
```bash
az storage entity query \
  --table-name MonthlyQuotas \
  --connection-string "$(az storage account show-connection-string \
    --name commercedocsdevstorage \
    --resource-group commerce-docs-dev-rg \
    --query connectionString -o tsv)" \
  --output table
```

### View Function Logs
```bash
az monitor app-insights query \
  --app commerce-docs-dev-insights \
  --resource-group commerce-docs-dev-rg \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'Query function' | project timestamp, message | order by timestamp desc" \
  --output table
```

---

## 🚨 Security Incident Response

### If Unauthorized Access Detected:
1. Check Function logs for suspicious activity
2. Review TokenUsage table for unusual patterns
3. Verify IP restrictions are in place
4. Rotate APIM shared secret if compromised
5. Review APIM analytics for blocked requests

### Rotating Shared Secret:
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update Function App
az functionapp config appsettings set \
  --name commerce-docs-dev-api \
  --resource-group commerce-docs-dev-rg \
  --settings "APIM_SHARED_SECRET=$NEW_SECRET"

# Update APIM
az apim nv update \
  --service-name commerce-docs-dev-apim \
  --resource-group commerce-docs-dev-rg \
  --named-value-id "apim-shared-secret" \
  --value "$NEW_SECRET" \
  --secret true
```

---

## 📈 Success Metrics

- **Security**: 100% of requests validated through all layers
- **Availability**: 99.9% uptime with proper error handling
- **Performance**: < 3s P95 latency (including security checks)
- **Compliance**: Complete audit trail in Table Storage
- **User Experience**: Clear error messages and usage info

