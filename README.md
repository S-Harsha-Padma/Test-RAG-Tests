# Azure Commerce Documentation Agent

Production-ready RAG system for Adobe Commerce documentation with IMS authentication, user tier management, and automated deployment.

## 🏗️ Architecture

```
Local MCP Server → Azure Functions → Azure OpenAI + Azure AI Search
```

### Azure Services Used

- **Azure OpenAI**: Embeddings (text-embedding-ada-002) + GPT-4o (index selection & re-ranking)
- **Azure AI Search**: 3 vector indexes with 1536-dim vectors
- **Azure Functions**: 3 endpoints (`/api/query`, `/api/load`, `/api/sync`)
  - `/api/query` - Search documentation (active)
  - `/api/load` - Upload documents (active)
  - `/api/sync` - Daily document sync (disabled - requires Azure Blob Storage setup)

## 📁 Project Structure

```
azure-commerce-documentation-agent/
├── src/
│   ├── azure/
│   │   ├── upload-embeddings.js      # Embed documents to Azure AI Search
│   │   ├── query-embeddings.js       # Query with LLM selection & re-ranking
│   │   └── scripts/
│   │       ├── create-indexes.js     # Create 3 AI Search indexes
│   │       ├── embed-azure.js        # Embed all documents
│   │       └── query-azure.js        # Test query functionality
│   └── loaders/                      # Symlink to ../commerce-documentation-service/src/loaders
├── azure-functions/
│   ├── query/                        # Query HTTP endpoint
│   │   ├── function.json
│   │   └── index.js
│   └── load/                         # Load HTTP endpoint
│       ├── function.json
│       └── index.js
├── scripts/
│   └── azure-setup.sh                # Automated Azure infrastructure setup
├── .env.example                      # Environment template
├── package.json                      # Dependencies and scripts
└── README.md                         # This file
```

## 🚀 Quick Start

### 1. Azure Infrastructure Setup

```bash
# Login to Azure
az login

# Run setup script
chmod +x scripts/azure-setup.sh
./scripts/azure-setup.sh
```

### 2. Configure Environment

```bash
# Copy generated environment file
cp .env.azure .env

# Install dependencies
npm install
```

### 3. Create Indexes

```bash
npm run create-indexes
```

### 4. Load & Embed Documents

```bash
# Load documents (uses loaders from commerce-documentation-service)
npm run load-docs

# Embed to Azure AI Search (takes 45-90 minutes)
npm run embed-docs
```

### 5. Test Query

Two query methods available:

#### Fast Direct Search (Development/Testing)
```bash
# Fast, simple, ~2-3 second response
npm run quick-test "How to create an event?" "commerce-extensibility-docs"

# Test different indexes
npm run quick-test "How to install Adobe Commerce?" "commerce-core-docs"
npm run quick-test "App Builder runtime" "app-builder-docs"
```

#### Full LLM Pipeline (Slower, more sophisticated)
```bash
# Automatic index selection + LLM re-ranking, ~10-15 second response
npm run query "How to create an event?"
```

**Performance Comparison:**
- **quick-test**: 2-3s, $0.001/query, manual index selection
- **query**: 10-15s, $0.011/query, automatic index selection + re-ranking

See [PERFORMANCE_NOTES.md](./PERFORMANCE_NOTES.md) for detailed comparison.

### 6. Deploy Azure Functions

```bash
npm run deploy
```

### 7. Update MCP Server

```bash
cd ../commerce-extensibility-tools
export AZURE_FUNCTIONS_URL=https://commerce-docs-api.azurewebsites.net
npm start
```

## 🔐 Production Features

| Feature | Status | Description |
|---------|--------|-------------|
| **IMS Authentication** | ✅ Complete | Adobe SSO with user tier management |
| **Token Tracking** | ✅ Complete | Per-user token usage and monthly quotas |
| **Rate Limiting** | ✅ Complete | Tier-based limits (1000/100/10 req/min) |
| **Infrastructure as Code** | ✅ Complete | Bicep templates with automated deployment |
| **CI/CD Pipeline** | ✅ Complete | GitHub Actions for automated deployment |
| **Monitoring** | ✅ Complete | Application Insights integration |
| **Document Indexing** | ⏳ Pending | Awaiting Azure OpenAI approval |

## 🔄 Document Sync (Future Enhancement)

The `/api/sync` timer function is currently **disabled** as it requires documents to be stored in Azure Blob Storage.

### Current Approach
- Manual document embedding via `npm run embed-docs`
- Re-run embedding when documentation changes

### Future Enhancement
To enable automatic daily sync:
1. Upload documents to Azure Blob Storage
2. Update sync function paths to read from Blob Storage
3. Uncomment the sync function code in `azure-functions/sync/index.js`
4. Redeploy Azure Functions

See `ARCHITECTURE.md` for detailed implementation plan.

## 🧹 Cleanup

```bash
# Delete all Azure resources
az group delete --name commerce-ai-docs-rg --yes
```

## 📚 Documentation

- [Getting Started Guide](../GETTING_STARTED.md)
- [Migration Analysis](../AZURE_MIGRATION_ANALYSIS.md)
- [Quick Start Checklist](../QUICK_START_CHECKLIST.md)

