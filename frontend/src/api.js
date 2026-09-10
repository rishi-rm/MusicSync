const API_BASE_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_UPLOAD_SERVER_URL ||
    'https://musicsync-1-p4h4.onrender.com'
).replace(/\/$/, '')

const SOCKET_URL = (
    import.meta.env.VITE_SOCKET_SERVER_URL || API_BASE_URL
).replace(/\/$/, '')

console.log('[CONFIG] API URL:', API_BASE_URL)
console.log('[CONFIG] Socket URL:', SOCKET_URL)

export function getStoredAuthSession() {
    if (typeof window === 'undefined') return null

    try {
        const token = localStorage.getItem('token')
        const storedUser = localStorage.getItem('user')
        const user = storedUser ? JSON.parse(storedUser) : null

        if (!token || !user) return null
        return { token, user }
    } catch {
        return null
    }
}

export function saveAuthSession(session) {
    if (typeof window === 'undefined') return

    localStorage.setItem('token', session.token)
    localStorage.setItem('user', JSON.stringify(session.user))
}

export function clearStoredAuthSession() {
    if (typeof window === 'undefined') return

    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.dispatchEvent(new CustomEvent('auth:expired'))
}

function getAuthHeaders(headers = {}) {
    const session = getStoredAuthSession()
    if (!session?.token) return headers

    return {
        ...headers,
        Authorization: `Bearer ${session.token}`
    }
}

async function parseResponse(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        if (response.status === 401 && typeof window !== 'undefined') {
            clearStoredAuthSession()
        }
        throw new Error(data.message || fallbackMessage)
    }

    return data
}

export async function signUp({ username, email, password }) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    })

    const data = await parseResponse(response, 'Failed to create account.')
    if (!data.token || !data.user) {
        throw new Error('The signup response did not include session data.')
    }
    return data
}

export async function signIn({ email, password }) {
    const response = await fetch(`${API_BASE_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })

    const data = await parseResponse(response, 'Failed to sign in.')
    if (!data.token || !data.user) {
        throw new Error('The sign-in response did not include session data.')
    }
    return data
}

export async function fetchSongs() {
    const response = await fetch(`${API_BASE_URL}/songs`, {
        headers: getAuthHeaders()
    })
    const data = await parseResponse(response, 'Failed to load songs.')
    return Array.isArray(data.songs) ? data.songs : []
}

export async function uploadSong({ files, artist, album }) {
    const formData = new FormData()
    files.forEach((file) => formData.append('song', file))
    formData.append('artist', artist.trim())
    formData.append('album', album.trim())

    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    })

    const data = await parseResponse(response, 'Failed to upload song.')

    if (!Array.isArray(data.songs) || data.songs.length === 0) {
        throw new Error('The upload response did not include the created songs.')
    }

    return data.songs
}

export async function updateSongFavorite(songId, isFavorite) {
    const response = await fetch(`${API_BASE_URL}/songs/${songId}/favorite`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ isFavorite })
    })

    const data = await parseResponse(response, 'Failed to update favourite status.')

    if (!data.song) {
        throw new Error('The favourite response did not include the updated song.')
    }

    return data.song
}

export { API_BASE_URL, SOCKET_URL }
