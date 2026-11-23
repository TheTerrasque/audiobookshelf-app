/**
 * Quick connect links, shown as a QR code on the server's Account page ("Connect Mobile App"):
 *   audiobookshelf://connect?address=<server url>&username=<username>
 * They never carry credentials.
 */

function normalizeServerAddress(address) {
  try {
    const urlObj = new URL(address)
    if (!['http:', 'https:'].includes(urlObj.protocol)) return null
    return urlObj.href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function isQuickConnectUrl(url) {
  return typeof url === 'string' && url.startsWith('audiobookshelf://connect')
}

/**
 * @param {string} text quick connect link, or a plain http(s) server address
 * @returns {{address: string, username: string} | null} null when no valid server address is found
 */
export function parseQuickConnect(text) {
  if (!text) return null
  text = text.trim()

  if (isQuickConnectUrl(text)) {
    const params = new URLSearchParams(text.split('?')[1] || '')
    const address = normalizeServerAddress(params.get('address'))
    if (!address) return null
    return { address, username: params.get('username') || '' }
  }

  // Also accept a QR code that just contains the server address
  const address = normalizeServerAddress(text)
  return address ? { address, username: '' } : null
}
