const GITHUB_API_URL =
  'https://api.github.com/repos/noahfgarrett-coder/LotusWorksToolkit/releases/latest'
const TIMEOUT_MS = 5000

export interface UpdateInfo {
  version: string
  releaseNotes: string
  downloadUrl: string | null
}

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  body?: string
  html_url: string
  assets?: GitHubAsset[]
}

/** Compare two semver strings (e.g. "1.2.3" > "1.2.2"). */
function isNewer(remote: string, local: string): boolean {
  const r = remote.replace(/^v/, '').split('.').map(Number)
  const l = local.replace(/^v/, '').split('.').map(Number)
  const len = Math.max(r.length, l.length)
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0
    const lv = l[i] ?? 0
    if (rv > lv) return true
    if (rv < lv) return false
  }
  return false
}

/**
 * Check GitHub Releases for a newer version.
 * Returns update info if a newer version exists, null otherwise.
 * Silently returns null on any error — never blocks the app.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(GITHUB_API_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    clearTimeout(timer)

    if (!res.ok) return null

    const release: GitHubRelease = await res.json()
    const remoteVersion = release.tag_name.replace(/^v/, '')

    if (!isNewer(remoteVersion, __APP_VERSION__)) return null

    const htmlAsset = release.assets?.find((a) =>
      a.name.toLowerCase().endsWith('.html'),
    )

    return {
      version: remoteVersion,
      releaseNotes: release.body ?? '',
      downloadUrl: htmlAsset?.browser_download_url ?? null,
    }
  } catch {
    // Network error, timeout, offline — silently ignore
    return null
  }
}
