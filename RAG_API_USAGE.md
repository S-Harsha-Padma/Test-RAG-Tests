# RAG API Usage Guide

## 🎯 API Endpoint

```bash
POST https://commerce-docs-dev-apim.azure-api.net/api/query
```

## 🔐 Authentication

The API requires IMS authentication via Bearer token.

### Get IMS Token

```bash
# Configure for stage environment
aio config set cli.env stage

# Login and get token
aio auth login
IMS_TOKEN=$(aio auth login --bare)
```

## 📋 Request Format

```bash
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_IMS_TOKEN" \
  -d '{
    "query": "How do I create a webhook in Adobe Commerce?",
    "count": 5,
    "indexName": "commerce-extensibility-docs"
  }'
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ Yes | - | The search query |
| `count` | number | ❌ No | 5 | Number of results to return |
| `indexName` | string | ❌ No | `commerce-extensibility-docs` | Index to search |

### Available Indexes

- `commerce-core-docs` - Commerce Core (6,206 chunks)
- `commerce-extensibility-docs` - Extensibility & Events (2,829 chunks)
- `app-builder-docs` - App Builder (1,751 chunks)

## 📤 Response Format

```json
{
  "success": true,
  "query": "How do I create a webhook in Adobe Commerce?",
  "index": "commerce-extensibility-docs",
  "count": 3,
  "results": [
    {
      "content": "...",
      "source": "src/pages/events/webhooks.md",
      "metadata": {
        "title": "Webhooks",
        "category": "events"
      },
      "score": 0.032
    }
  ],
  "user": {
    "email": "bnoronha@adobe.com",
    "tier": "premium"
  },
  "quota": {
    "used": 150,
    "limit": 1000000,
    "remaining": 999850,
    "tokensThisQuery": 12
  }
}
```

## 🎭 User Tiers

| Tier | Rate Limit | Monthly Token Quota |
|------|------------|---------------------|
| **Premium** (@adobe.com) | 1000 req/min | 1,000,000 tokens |
| **Standard** (Partners) | 100 req/min | 100,000 tokens |
| **Free** (Others) | 10 req/min | 10,000 tokens |

## 🚨 Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized - Invalid IMS token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Forbidden - User not authorized"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Monthly token quota exceeded",
  "quota": {
    "used": 1000000,
    "limit": 1000000,
    "remaining": 0
  }
}
```

## 🧪 Example Usage

### Basic Query
```bash
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IMS_TOKEN" \
  -d '{"query": "How to create an event?"}'
```

### Search Specific Index
```bash
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IMS_TOKEN" \
  -d '{
    "query": "App Builder runtime",
    "count": 10,
    "indexName": "app-builder-docs"
  }'
```

### Get More Results
```bash
curl -X POST https://commerce-docs-dev-apim.azure-api.net/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IMS_TOKEN" \
  -d '{
    "query": "Commerce extensibility best practices",
    "count": 20
  }'
```

## 🔧 For MCP Tool Integration

```javascript
// MCP tool definition
{
  name: "search-commerce-docs",
  description: "Search Adobe Commerce documentation using RAG",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      count: {
        type: "number",
        description: "Number of results (default: 5)",
        default: 5
      },
      indexName: {
        type: "string",
        description: "Index to search",
        enum: ["commerce-core-docs", "commerce-extensibility-docs", "app-builder-docs"]
      }
    },
    required: ["query"]
  }
}

// MCP tool implementation
async function searchCommerceDocs(args) {
  const response = await fetch(
    "https://commerce-docs-dev-apim.azure-api.net/api/query",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${IMS_TOKEN}`
      },
      body: JSON.stringify({
        query: args.query,
        count: args.count || 5,
        indexName: args.indexName || "commerce-extensibility-docs"
      })
    }
  );
  
  return await response.json();
}
```

## 📊 Current Status

### ✅ Working
- IMS authentication via APIM
- User tier determination (@adobe.com = premium)
- Rate limiting per tier
- Token quota tracking
- Vector search with Azure OpenAI embeddings
- 10,786 documents indexed across 3 indexes

### ⚠️ Known Issues
- **Function timeout**: The Azure Function is currently timing out (investigating)
- **Possible causes**:
  - Missing `AZURE_OPENAI_API_VERSION` environment variable
  - OpenAI SDK initialization issue
  - Network connectivity between Function App and OpenAI service

### 🔧 Next Steps to Fix
1. Add `AZURE_OPENAI_API_VERSION=2024-02-01` to Function App settings
2. Verify OpenAI endpoint is accessible from Function App
3. Add error handling and logging to identify the exact failure point
4. Test with simpler query first (no vector search) to isolate issue

## 📝 Notes

- All queries use **vector search** with 1536-dimensional embeddings
- Search is **semantic**, not keyword-based
- Results are ranked by **cosine similarity**
- Response time: ~2-3 seconds (when working)
- IMS tokens expire after 24 hours

