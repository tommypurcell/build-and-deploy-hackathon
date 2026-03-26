import os
import base64
from typing import Optional, List, Dict
import httpx

TEXT_EXT = {
    ".md",
    ".mdx",
    ".txt",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".json",
    ".css",
    ".html",
    ".yml",
    ".yaml",
    ".toml",
    ".env.example",
    ".py",
}

SKIP_PATHS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".vercel",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "__pycache__",
    ".pytest_cache",
    "venv",
    "env",
}

MAX_FILE_BYTES = 120_000
MAX_MATCHES = 12
MAX_LINE_LEN = 400


def get_github_config() -> Dict[str, Optional[str]]:
    """Get GitHub configuration from environment variables."""
    token = os.getenv("GITHUB_TOKEN")
    owner = os.getenv("GITHUB_REPO_OWNER")
    repo = os.getenv("GITHUB_REPO_NAME")

    if not owner or not repo:
        raise ValueError(
            "Missing GITHUB_REPO_OWNER or GITHUB_REPO_NAME in .env. Please set both."
        )

    return {"token": token, "owner": owner, "repo": repo}


def get_headers(token: Optional[str]) -> Dict[str, str]:
    """Get headers for GitHub API requests."""
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def is_text_file(path: str) -> bool:
    """Check if a file path should be considered a text file."""
    parts = path.split("/")
    if any(p in SKIP_PATHS for p in parts):
        return False

    file_name = parts[-1]
    if file_name == "Dockerfile" or file_name.startswith("README"):
        return True

    if "." in file_name:
        ext = "." + file_name.split(".")[-1].lower()
        return ext in TEXT_EXT

    return False


async def fetch_repo_tree(
    owner: str, repo: str, token: Optional[str], sha: str = "HEAD"
) -> List[Dict]:
    """Recursively fetch repository tree from GitHub."""
    headers = get_headers(token)
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}?recursive=1"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)

        if not response.is_success:
            error_text = response.text
            raise Exception(
                f"GitHub API error ({response.status_code}): {error_text}. "
                "Check your GITHUB_TOKEN and repo settings."
            )

        data = response.json()
        return data.get("tree", [])


async def fetch_file_content(
    owner: str, repo: str, path: str, token: Optional[str]
) -> Optional[str]:
    """Fetch file content from GitHub."""
    headers = get_headers(token)
    # URL encode the path properly
    from urllib.parse import quote
    encoded_path = quote(path, safe="")
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{encoded_path}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)

        if not response.is_success:
            if response.status_code == 404:
                return None
            raise Exception(f"Failed to fetch {path}: {response.status_code}")

        data = response.json()

        if data.get("size", 0) > MAX_FILE_BYTES:
            return None

        if data.get("encoding") == "base64" and data.get("content"):
            try:
                content_str = data["content"].replace("\n", "")
                decoded = base64.b64decode(content_str).decode("utf-8")
                return decoded
            except Exception:
                return None

        return None


async def search_repo(query: str) -> str:
    """Case-insensitive substring search across GitHub repo."""
    q = str(query or "").strip()
    if not q:
        return "Provide a non-empty search query."

    try:
        config = get_github_config()
        token = config["token"]
        owner = config["owner"]
        repo = config["repo"]

        tree = await fetch_repo_tree(owner, repo, token)

        text_files = [
            item
            for item in tree
            if item.get("type") == "blob" and is_text_file(item.get("path", ""))
        ][:100]

        needle = q.lower()
        matches = []

        for file in text_files:
            if len(matches) >= MAX_MATCHES:
                break

            file_path = file.get("path", "")
            content = await fetch_file_content(owner, repo, file_path, token)
            if not content:
                continue

            lower = content.lower()
            idx = lower.find(needle)
            if idx == -1:
                continue

            start = max(0, idx - 120)
            end = min(len(content), idx + len(q) + 200)
            snippet = content[start:end]
            snippet = " ".join(snippet.split())  # Normalize whitespace

            if len(snippet) > MAX_LINE_LEN:
                snippet = snippet[:MAX_LINE_LEN] + "…"

            matches.append({"file": file_path, "snippet": snippet})

        if len(matches) == 0:
            return f'No matches for "{q}" in {owner}/{repo}. Try different keywords.'

        result_lines = []
        for i, m in enumerate(matches):
            result_lines.append(f"{i + 1}. {m['file']}\n   …{m['snippet']}…")

        return "\n\n".join(result_lines)

    except Exception as e:
        return f"Error searching repo: {str(e)}"


async def read_repo_file(relative_path: str) -> str:
    """Read one file from GitHub repo."""
    clean_path = str(relative_path or "").replace("./", "").strip()

    if not clean_path:
        return "Invalid path."

    try:
        config = get_github_config()
        token = config["token"]
        owner = config["owner"]
        repo = config["repo"]

        if not is_text_file(clean_path):
            return "Only text-like files are allowed."

        content = await fetch_file_content(owner, repo, clean_path, token)

        if content is None:
            return f"File not found or too large: {clean_path}"

        return content

    except Exception as e:
        return f"Error reading file: {str(e)}"
