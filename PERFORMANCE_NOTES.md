# Performance Notes - Query Methods

## Overview

This document compares two different approaches to querying the Azure AI Search indexes: the **Full LLM Pipeline** vs the **Direct Search** approach.

---

## Query Methods Comparison

### Method 1: Full LLM Pipeline (`npm run query`)

**File:** `src/azure/query-embeddings.js`

**How it works:**
1. **LLM Index Selection**: Uses GPT-4o to determine which index(es) to query
2. **Vector Search**: Queries selected indexes using LangChain's `AzureAISearchVectorStore`
3. **LLM Re-ranking**: Uses GPT-4o to re-rank results for optimal relevance

**Performance:**
- Response Time: ~10-15 seconds
- API Calls: 8-10 per query
- Cost: ~$0.01-0.02 per query
- Embedding Calls: Multiple (via LangChain)

**Pros:**
- ✅ Intelligent automatic index selection
- ✅ Sophisticated result re-ranking with GPT-4o
- ✅ Best for complex queries
- ✅ No need to specify which index to query

**Cons:**
- ❌ Slower (10-15s response time)
- ❌ More expensive (~10x cost)
- ❌ Multiple API calls increase latency
- ❌ LangChain overhead

**Use Cases:**
- Production environments where query quality > speed
- Complex queries that span multiple indexes
- User-facing search where automatic index selection is needed

---

### Method 2: Direct Search (`quick-test.js`)

**File:** `src/azure/scripts/quick-test.js`

**How it works:**
1. **Direct Embedding**: Single embedding API call using Azure OpenAI SDK
2. **Vector Search**: Direct Azure AI Search SDK query with vector similarity
3. **Native Scoring**: Uses Azure AI Search's built-in relevance scores

**Performance:**
- Response Time: ~2-3 seconds
- API Calls: 1 per query
- Cost: ~$0.001 per query
- Embedding Calls: 1 (direct SDK)

**Pros:**
- ✅ Fast (2-3s response time)
- ✅ Cheap (~10x less expensive)
- ✅ Simple, direct SDK usage
- ✅ Results are still highly relevant
- ✅ No LangChain overhead

**Cons:**
- ❌ Manual index selection required
- ❌ No LLM-based re-ranking
- ❌ Less sophisticated

**Use Cases:**
- Development/testing environments
- MCP tool integration (where speed matters)
- Developer tools and CLI commands
- Cost-sensitive deployments

---

## Test Results

All tests performed on 2025-11-07 with 7,693 documents (10,435 chunks) embedded.

### Test 1: Event Creation
**Query:** "How to create an event?"  
**Index:** `commerce-extensibility-docs`  
**Method:** Direct Search  
**Results:** 5 highly relevant results  
**Top Score:** 0.0263  
**Response Time:** ~2s  

### Test 2: Installation
**Query:** "How to install Adobe Commerce?"  
**Index:** `commerce-core-docs`  
**Method:** Direct Search  
**Results:** 5 relevant results  
**Top Score:** 0.0269  
**Response Time:** ~2s  

### Test 3: App Builder Runtime
**Query:** "App Builder runtime actions"  
**Index:** `app-builder-docs`  
**Method:** Direct Search  
**Results:** 5 relevant results  
**Top Score:** 0.0331  
**Response Time:** ~2s  

### Test 4: GraphQL Authentication
**Query:** "GraphQL API authentication"  
**Index:** `commerce-extensibility-docs`  
**Method:** Direct Search  
**Results:** 5 highly relevant results  
**Top Score:** 0.0331  
**Response Time:** ~2s  

---

## Recommendations

### For Azure Production (Current)
✅ **Use Direct Search** (`quick-test.js`)
- Faster response times for testing
- Lower costs during development
- Results are sufficiently relevant
- Better for MCP integration

### For Production (Future)
**Consider Full LLM Pipeline** if:
- Users need automatic index selection
- Query quality is more important than speed
- Budget allows for higher API costs
- Complex multi-index queries are common

**OR stick with Direct Search** if:
- Speed is critical (< 3s response time)
- Cost optimization is important
- MCP tools need fast responses
- Index selection can be inferred from query context

---

## Cost Analysis

Based on Azure OpenAI pricing (East US):

### Direct Search Method
- Embedding (text-embedding-ada-002): $0.0001 per 1K tokens
- Average query: ~10 tokens = $0.000001
- **Cost per query: ~$0.001**

### Full LLM Pipeline
- Embedding calls: ~6x = $0.000006
- GPT-4o (index selection): ~300 tokens input, 50 output = $0.003
- GPT-4o (re-ranking): ~500 tokens input, 100 output = $0.008
- **Cost per query: ~$0.011** (11x more expensive)

### Monthly Cost (10,000 queries/month)
- Direct Search: **$10/month**
- Full LLM Pipeline: **$110/month**

---

## Implementation Notes

### Direct Search Implementation
```javascript
// 1. Generate embedding
const embeddingResponse = await openaiClient.embeddings.create({
  model: 'text-embedding-ada-002',
  input: query,
});

// 2. Search with vector
const searchResults = await searchClient.search(query, {
  vectorSearchOptions: {
    queries: [{
      kind: 'vector',
      vector: embeddingResponse.data[0].embedding,
      kNearestNeighborsCount: 5,
      fields: ['contentVector']
    }]
  },
  top: 5
});
```

### Full LLM Pipeline
Uses LangChain abstractions:
- `AzureOpenAIEmbeddings` for embeddings
- `AzureAISearchVectorStore` for vector store
- `AzureChatOpenAI` for index selection and re-ranking

---

## Debugging Tips

### Enable Debug Logging
For Direct Search:
```bash
# No special debug needed, output is clean
node src/azure/scripts/quick-test.js "your query"
```

For Full LLM Pipeline:
```bash
# LangChain includes verbose debug output
npm run query "your query"
# You'll see OpenAI:DEBUG logs showing all API calls
```

### Performance Monitoring
```bash
# Time a query
time node src/azure/scripts/quick-test.js "your query"

# Compare with full pipeline
time npm run query "your query"
```

---

## Future Improvements

### Hybrid Approach
Consider implementing a hybrid approach:
1. Use Direct Search for simple queries (single-word, specific topics)
2. Use Full LLM Pipeline for complex queries (multi-index, ambiguous)
3. Let MCP tool decide based on query complexity

### Caching
- Cache embeddings for common queries
- Cache LLM index selections
- Implement Redis for distributed caching

### Index Selection Heuristics
Instead of LLM, use simple keyword matching:
- "event", "webhook", "extension" → `commerce-extensibility-docs`
- "app builder", "runtime" → `app-builder-docs`
- Default → `commerce-core-docs`

---

**Last Updated:** 2025-11-07  
**Testing Environment:** Azure Production Dev (East US)  
**Total Documents:** 7,693 docs → 10,435 chunks  
**Indexes:** 3 (commerce-core, commerce-extensibility, app-builder)

