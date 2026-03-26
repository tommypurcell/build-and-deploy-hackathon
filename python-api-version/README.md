# OWEN Python API

FastAPI version of the OWEN (Oral Workflow Engine for repo Navigation) backend API.

This is an exact Python port of the Next.js API route that provides two tools for Vapi:
- `search_repo` - Search through a GitHub repository
- `read_repo_file` - Read a specific file from a GitHub repository

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**

   Edit `.env` and add your values:
   ```
   GITHUB_TOKEN=your_github_token_here
   GITHUB_REPO_OWNER=your-username
   GITHUB_REPO_NAME=your-repo-name
   ```

   - `GITHUB_TOKEN` is optional for public repos but recommended to avoid rate limits
   - `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` are required

3. **Run the development server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

   The API will be available at `http://localhost:8000`

## API Endpoints

### POST /api/vapi/tool

Main Vapi tool endpoint. Handles tool calls from Vapi assistant.

**Request format:**
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_123",
        "name": "search_repo",
        "arguments": {
          "query": "search term"
        }
      }
    ]
  }
}
```

**Response format:**
```json
{
  "results": [
    {
      "toolCallId": "call_123",
      "result": "Search results here..."
    }
  ]
}
```

### GET /

Health check endpoint that returns API info.

### GET /health

Simple health check for deployment platforms.

## Available Tools

### search_repo
Search through text files in the GitHub repository.

**Arguments:**
- `query` (string): Search term

**Returns:** List of matches with file paths and snippets

### read_repo_file
Read the contents of a specific file from the repository.

**Arguments:**
- `path` (string): Relative path to the file

**Returns:** File contents as text

## Deployment

### Deploy to Render

1. Create a new Web Service on Render
2. Connect your repository
3. Set the following:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables:** Add `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`

### Deploy to Railway

1. Create a new project on Railway
2. Connect your repository
3. Railway will auto-detect FastAPI
4. Add environment variables: `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`

### Deploy to Fly.io

1. Install the Fly CLI
2. Run `fly launch` in this directory
3. Set secrets: `fly secrets set GITHUB_TOKEN=xxx GITHUB_REPO_OWNER=xxx GITHUB_REPO_NAME=xxx`
4. Deploy: `fly deploy`

## Vapi Configuration

In your Vapi Dashboard:

1. Create or update your assistant
2. Add two custom tools:

**Tool 1: search_repo**
```json
{
  "name": "search_repo",
  "description": "Search through files in the GitHub repository for a given query",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search term to look for in repository files"
      }
    },
    "required": ["query"]
  }
}
```

**Tool 2: read_repo_file**
```json
{
  "name": "read_repo_file",
  "description": "Read the complete contents of a specific file from the repository",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The relative path to the file (e.g., 'src/main.py')"
      }
    },
    "required": ["path"]
  }
}
```

3. Set the tool server URL to your deployed endpoint:
   - Format: `https://your-domain.com/api/vapi/tool`

## Testing

Test the API locally:

```bash
# Test health check
curl http://localhost:8000/

# Test search_repo tool
curl -X POST http://localhost:8000/api/vapi/tool \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCallList": [
        {
          "id": "test_1",
          "name": "search_repo",
          "arguments": {"query": "FastAPI"}
        }
      ]
    }
  }'

# Test read_repo_file tool
curl -X POST http://localhost:8000/api/vapi/tool \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCallList": [
        {
          "id": "test_2",
          "name": "read_repo_file",
          "arguments": {"path": "README.md"}
        }
      ]
    }
  }'
```

## File Structure

```
python-api-version/
├── main.py           # FastAPI app and /api/vapi/tool endpoint
├── repo_search.py    # GitHub API integration and search logic
├── requirements.txt  # Python dependencies
├── .env             # Environment variables (not in git)
└── README.md        # This file
```

## Differences from Next.js Version

This Python version is functionally identical to the Next.js version but uses:
- FastAPI instead of Next.js
- httpx for async HTTP requests instead of fetch
- Python async/await instead of JavaScript promises
- Uvicorn as the ASGI server

Both versions:
- Use the same GitHub API endpoints
- Support the same two tools: `search_repo` and `read_repo_file`
- Have the same file size limits and search constraints
- Return results in the same format
