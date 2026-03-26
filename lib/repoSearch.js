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
const MAX_CONTEXT_KEY_FILES = 8;
const MAX_CONTEXT_PREVIEW = 700;
const MAX_CONTEXT_JSON_CHARS = 14_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const treeCache = new Map();
const fileCache = new Map();
const repoContextCache = new Map();

function getCached(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(map, key, value) {
  map.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

function parseGitHubRepoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
  };
}

function resolveGitHubConfig(options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const parsedFromUrl =
    parseGitHubRepoUrl(options.repoUrl) ||
    parseGitHubRepoUrl(process.env.GITHUB_REPO_URL) ||
    parseGitHubRepoUrl(process.env.GITHUB_REPO_NAME);

  if (parsedFromUrl) {
    return {
      token,
      owner: parsedFromUrl.owner,
      repo: parsedFromUrl.repo,
      repoUrl: `https://github.com/${parsedFromUrl.owner}/${parsedFromUrl.repo}`,
    };
  }

  const owner = String(options.owner || process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(options.repo || process.env.GITHUB_REPO_NAME || "")
    .trim()
    .replace(/\.git$/, "");

  if (!owner || !repo) {
    throw new Error(
      "Missing GITHUB_REPO_URL or GITHUB_REPO_OWNER/GITHUB_REPO_NAME in .env.",
    );
  }

  return {
    token,
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
  };
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

function isTextFile(filePath) {
  const parts = filePath.split("/");
  if (parts.some((part) => SKIP_PATHS.has(part))) return false;

  const fileName = parts[parts.length - 1];
  if (fileName === "Dockerfile" || fileName.startsWith("README")) return true;

  const ext = fileName.includes(".")
    ? "." + fileName.split(".").pop().toLowerCase()
    : "";
  return TEXT_EXT.has(ext);
}

function compactText(value, maxLength = MAX_LINE_LEN) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + "...";
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readProcessEnvNames(text) {
  const names = new Set();
  for (const match of String(text || "").matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function readEnvExampleNames(text) {
  const names = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]+)=/);
    if (match) names.add(match[1]);
  }
  return [...names];
}

function toPageRoute(filePath) {
  if (!/^app\/.*\/page\.(js|jsx|ts|tsx|mdx)$/.test(filePath) && !/^app\/page\.(js|jsx|ts|tsx|mdx)$/.test(filePath)) {
    return null;
  }

  let route = filePath
    .replace(/^app/, "")
    .replace(/\/page\.(js|jsx|ts|tsx|mdx)$/, "")
    .replace(/\/index$/, "");

  if (!route) return "/";
  return route;
}

function toApiRoute(filePath) {
  if (!/^app\/api\/.*\/route\.(js|jsx|ts|tsx)$/.test(filePath)) {
    return null;
  }

  return (
    "/" +
    filePath
      .replace(/^app\/api\//, "")
      .replace(/\/route\.(js|jsx|ts|tsx)$/, "")
  );
}

async function fetchRepoTree(config, sha = "HEAD") {
  const cacheKey = `${config.owner}/${config.repo}:${sha}`;
  const cached = getCached(treeCache, cacheKey);
  if (cached) return cached;

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${sha}?recursive=1`;
  const response = await fetch(url, {
    headers: getHeaders(config.token),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${error}. Check your repo URL and token.`,
    );
  }

  const data = await response.json();
  return setCached(treeCache, cacheKey, data.tree || []);
}

async function fetchFileContent(config, filePath) {
  const cacheKey = `${config.owner}/${config.repo}:${filePath}`;
  const cached = getCached(fileCache, cacheKey);
  if (cached !== null) return cached;

  const encodedPath = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
  const response = await fetch(url, {
    headers: getHeaders(config.token),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return setCached(fileCache, cacheKey, null);
    }
    throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
  }

  const data = await response.json();
  if (data.type !== "file" || data.size > MAX_FILE_BYTES) {
    return setCached(fileCache, cacheKey, null);
  }

  if (data.encoding === "base64" && data.content) {
    try {
      return setCached(
        fileCache,
        cacheKey,
        Buffer.from(data.content, "base64").toString("utf8"),
      );
    } catch {
      return setCached(fileCache, cacheKey, null);
    }
  }

  return setCached(fileCache, cacheKey, null);
}

async function buildRepoContext(options = {}) {
  const config = resolveGitHubConfig(options);
  const cacheKey = `${config.owner}/${config.repo}`;
  const cached = getCached(repoContextCache, cacheKey);
  if (cached) return cached;

  const tree = await fetchRepoTree(config);
  const blobItems = tree.filter((item) => item.type === "blob");
  const textFiles = blobItems.filter((item) => isTextFile(item.path));
  const filePaths = textFiles.map((item) => item.path);

  const readmePath =
    filePaths.find((path) => /^README/i.test(path)) ||
    filePaths.find((path) => /\/README/i.test(path)) ||
    null;
  const packageJsonPath = filePaths.includes("package.json") ? "package.json" : null;
  const envExamplePath =
    filePaths.find((path) => path === ".env.example") ||
    filePaths.find((path) => path.endsWith("/.env.example")) ||
    null;

  const candidateKeyFiles = [
    readmePath,
    packageJsonPath,
    envExamplePath,
    "app/page.jsx",
    "app/layout.jsx",
    "app/api/vapi/tool/route.js",
    "lib/repoSearch.js",
    ...filePaths.filter((path) => path.startsWith("app/api/")).slice(0, 2),
    ...filePaths.filter((path) => path.startsWith("app/") && path.endsWith("page.jsx")).slice(0, 2),
  ].filter(Boolean);

  const keyFiles = [];
  const seenKeyFilePaths = new Set();

  for (const filePath of candidateKeyFiles) {
    if (seenKeyFilePaths.has(filePath)) continue;
    seenKeyFilePaths.add(filePath);
    if (keyFiles.length >= MAX_CONTEXT_KEY_FILES) break;

    const content = await fetchFileContent(config, filePath);
    if (!content) continue;

    keyFiles.push({
      path: filePath,
      preview: compactText(content, MAX_CONTEXT_PREVIEW),
    });
  }

  const readmeText = readmePath ? await fetchFileContent(config, readmePath) : null;
  const packageJsonText = packageJsonPath
    ? await fetchFileContent(config, packageJsonPath)
    : null;
  const envExampleText = envExamplePath
    ? await fetchFileContent(config, envExamplePath)
    : null;

  const packageJson = safeJsonParse(packageJsonText);
  const dependencyNames = packageJson
    ? [
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
      ].slice(0, 20)
    : [];

  const envNames = new Set(readEnvExampleNames(envExampleText));
  for (const file of keyFiles) {
    for (const name of readProcessEnvNames(file.preview)) {
      envNames.add(name);
    }
  }
  if (packageJsonText) {
    for (const name of readProcessEnvNames(packageJsonText)) {
      envNames.add(name);
    }
  }

  const topLevelEntries = [...new Set(filePaths.map((path) => path.split("/")[0]))]
    .sort()
    .slice(0, 20);
  const pageRoutes = filePaths
    .map(toPageRoute)
    .filter(Boolean)
    .slice(0, 20);
  const apiRoutes = filePaths
    .map(toApiRoute)
    .filter(Boolean)
    .slice(0, 20);

  const context = {
    repository: {
      owner: config.owner,
      name: config.repo,
      fullName: `${config.owner}/${config.repo}`,
      url: config.repoUrl,
    },
    overview:
      compactText(
        readmeText || packageJson?.description || "No README summary available.",
        900,
      ) || "No README summary available.",
    stats: {
      totalTextFiles: textFiles.length,
      totalFiles: blobItems.length,
    },
    topLevelEntries,
    pages: pageRoutes,
    apiRoutes,
    envNames: [...envNames].sort(),
    packageJson: packageJson
      ? {
          name: packageJson.name || null,
          scripts: packageJson.scripts || {},
          dependencies: dependencyNames,
        }
      : null,
    keyFiles,
  };

  return setCached(repoContextCache, cacheKey, context);
}

function stringifyRepoContext(context) {
  const minimal = {
    ...context,
    keyFiles: context.keyFiles.map((file) => ({
      path: file.path,
      preview: compactText(file.preview, MAX_CONTEXT_PREVIEW),
    })),
  };

  let json = JSON.stringify(minimal, null, 2);
  if (json.length <= MAX_CONTEXT_JSON_CHARS) return json;

  const smaller = {
    ...minimal,
    keyFiles: minimal.keyFiles.slice(0, 5).map((file) => ({
      ...file,
      preview: compactText(file.preview, 420),
    })),
    truncated: true,
  };

  json = JSON.stringify(smaller, null, 2);
  if (json.length <= MAX_CONTEXT_JSON_CHARS) return json;

  return JSON.stringify(
    {
      repository: smaller.repository,
      overview: compactText(smaller.overview, 600),
      stats: smaller.stats,
      topLevelEntries: smaller.topLevelEntries,
      pages: smaller.pages.slice(0, 10),
      apiRoutes: smaller.apiRoutes.slice(0, 10),
      envNames: smaller.envNames,
      packageJson: smaller.packageJson,
      keyFiles: smaller.keyFiles.slice(0, 3),
      truncated: true,
    },
    null,
    2,
  );
}

export async function getRepoContextPayload(options = {}) {
  const repoContext = await buildRepoContext(options);
  return {
    repoContext,
    repoContextJson: stringifyRepoContext(repoContext),
  };
}

/**
 * Case-insensitive substring search across GitHub repo
 */
export async function searchRepo(query, options = {}) {
  const q = String(query || "").trim();
  if (!q) {
    return "Provide a non-empty search query.";
  }

  try {
    const config = resolveGitHubConfig(options);
    const tree = await fetchRepoTree(config);
    const textFiles = tree
      .filter((item) => item.type === "blob" && isTextFile(item.path))
      .slice(0, 120);

    const needle = q.toLowerCase();
    const matches = [];

    for (const file of textFiles) {
      if (matches.length >= MAX_MATCHES) break;

      const content = await fetchFileContent(config, file.path);
      if (!content) continue;

      const lower = content.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 120);
      const end = Math.min(content.length, idx + q.length + 200);
      const snippet = compactText(content.slice(start, end), MAX_LINE_LEN);
      matches.push({ file: file.path, snippet });
    }

    if (matches.length === 0) {
      return `No matches for "${q}" in ${config.owner}/${config.repo}. Try different keywords.`;
    }

    return matches
      .map((match, index) => `${index + 1}. ${match.file}\n   ...${match.snippet}...`)
      .join("\n\n");
  } catch (error) {
    return `Error searching repo: ${error.message}`;
  }
}

/**
 * Read one file from GitHub repo
 */
export async function readRepoFile(relativePath, options = {}) {
  const cleanPath = String(relativePath || "")
    .replace(/^\.\/+/, "")
    .trim();

  if (!cleanPath) {
    return "Invalid path.";
  }

  try {
    const config = resolveGitHubConfig(options);

    if (!isTextFile(cleanPath)) {
      return "Only text-like files are allowed.";
    }

    const content = await fetchFileContent(config, cleanPath);
    if (content === null) {
      return `File not found or too large: ${cleanPath}`;
    }

    return content;
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
}

/**
 * Get full repository structure as JSON (for testing/debugging)
 */
export async function getRepoStructureJSON(options = {}) {
  try {
    const { repoContextJson } = await getRepoContextPayload(options);
    return repoContextJson;
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message,
    }, null, 2);
  }
}
