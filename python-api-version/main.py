import json
from typing import Optional, Any, Dict, List
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from repo_search import search_repo, read_repo_file

# Load environment variables
load_dotenv()

app = FastAPI(title="OWEN API - Python Version")


class ToolCall(BaseModel):
    """Model for a single tool call from Vapi."""
    id: str
    name: str
    arguments: Optional[Any] = None


class Message(BaseModel):
    """Model for the message from Vapi."""
    toolCallList: List[ToolCall]


class VapiRequest(BaseModel):
    """Model for the incoming Vapi request."""
    message: Message


class ToolResult(BaseModel):
    """Model for a single tool result."""
    toolCallId: str
    result: str


class VapiResponse(BaseModel):
    """Model for the Vapi response."""
    results: List[ToolResult]


def normalize_args(raw: Any) -> Dict[str, Any]:
    """Normalize tool arguments to a dictionary."""
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


async def handle_tool(name: str, args: Any) -> str:
    """Handle a tool call and return the result."""
    normalized_args = normalize_args(args)

    if name == "search_repo":
        query = normalized_args.get("query", "")
        return await search_repo(query)
    elif name == "read_repo_file":
        path = normalized_args.get("path", "")
        return await read_repo_file(path)
    else:
        return f"Unknown tool: {name}"


@app.post("/api/vapi/tool")
async def vapi_tool_endpoint(request: Request) -> JSONResponse:
    """
    Vapi tool endpoint - handles tool calls from Vapi assistant.

    Vapi sends POST with body.message.toolCallList[]
    See: https://docs.vapi.ai/tools/custom-tools
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"error": "Invalid JSON"},
            status_code=400
        )

    message = body.get("message")
    if not message:
        return JSONResponse(
            {"error": "Expected message in body"},
            status_code=400
        )

    tool_call_list = message.get("toolCallList")
    if not isinstance(tool_call_list, list):
        return JSONResponse(
            {"error": "Expected message.toolCallList array"},
            status_code=400
        )

    results = []
    for tool_call in tool_call_list:
        tool_id = tool_call.get("id")
        tool_name = tool_call.get("name")
        tool_args = tool_call.get("arguments")

        try:
            result = await handle_tool(tool_name, tool_args)
            results.append({
                "toolCallId": tool_id,
                "result": result
            })
        except Exception as e:
            results.append({
                "toolCallId": tool_id,
                "result": f"Error: {str(e)}"
            })

    return JSONResponse({"results": results})


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "message": "OWEN Python API is running",
        "tools": ["search_repo", "read_repo_file"]
    }


@app.get("/health")
async def health():
    """Health check endpoint for deployment platforms."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
