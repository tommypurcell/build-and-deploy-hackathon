const TEXT_EXT = new Set([
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
]);

const SKIP_PATHS = new Set([
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
]);

const MAX_FILE_BYTES = 120_000;
const MAX_MATCHES = 12;
const MAX_LINE_LEN = 400;

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!owner || !repo) {
    throw new Error(
      "Missing GITHUB_REPO_OWNER or GITHUB_REPO_NAME in .env. Please set both.",
    );
  }

  return { token, owner, repo };
}

function getHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function isTextFile(path) {
  const parts = path.split("/");
  if (parts.some((p) => SKIP_PATHS.has(p))) return false;

  const fileName = parts[parts.length - 1];
  if (fileName === "Dockerfile" || fileName.startsWith("README")) return true;

  const ext = fileName.includes(".")
    ? "." + fileName.split(".").pop().toLowerCase()
    : "";
  return TEXT_EXT.has(ext);
}

/**
 * Recursively fetch repository tree from GitHub
 */
async function fetchRepoTree(owner, repo, token, sha = "HEAD") {
  const headers = getHeaders(token);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${error}. Check your GITHUB_TOKEN and repo settings.`,
    );
  }

  const data = await response.json();
  return data.tree || [];
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(owner, repo, path, token) {
  const headers = getHeaders(token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  const data = await response.json();

  if (data.size > MAX_FILE_BYTES) {
    return null;
  }

  if (data.encoding === "base64" && data.content) {
    try {
      return Buffer.from(data.content, "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Case-insensitive substring search across GitHub repo
 */
export async function searchRepo(query) {
  const q = String(query || "").trim();
  if (!q) {
    return "Provide a non-empty search query.";
  }

  try {
    const { token, owner, repo } = getGitHubConfig();
    const tree = await fetchRepoTree(owner, repo, token);

    const textFiles = tree
      .filter((item) => item.type === "blob" && isTextFile(item.path))
      .slice(0, 100);

    const needle = q.toLowerCase();
    const matches = [];

    for (const file of textFiles) {
      if (matches.length >= MAX_MATCHES) break;

      const content = await fetchFileContent(owner, repo, file.path, token);
      if (!content) continue;

      const lower = content.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 120);
      const end = Math.min(content.length, idx + q.length + 200);
      let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
      if (snippet.length > MAX_LINE_LEN) {
        snippet = snippet.slice(0, MAX_LINE_LEN) + "…";
      }
      matches.push({ file: file.path, snippet });
    }

    if (matches.length === 0) {
      return `No matches for "${q}" in ${owner}/${repo}. Try different keywords.`;
    }

    return matches
      .map((m, i) => `${i + 1}. ${m.file}\n   …${m.snippet}…`)
      .join("\n\n");
  } catch (e) {
    return `Error searching repo: ${e.message}`;
  }
}

/**
 * Read one file from GitHub repo
 */
export async function readRepoFile(relativePath) {
  const cleanPath = String(relativePath || "")
    .replace(/^\.\/+/, "")
    .trim();

  if (!cleanPath) {
    return "Invalid path.";
  }

  try {
    const { token, owner, repo } = getGitHubConfig();

    if (!isTextFile(cleanPath)) {
      return "Only text-like files are allowed.";
    }

    const content = await fetchFileContent(owner, repo, cleanPath, token);

    if (content === null) {
      return `File not found or too large: ${cleanPath}`;
    }

    return content;
  } catch (e) {
    return `Error reading file: ${e.message}`;
  }
}
