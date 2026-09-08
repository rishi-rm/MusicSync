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

async function parseResponse(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage)
    }

    return data
}

export async function fetchSongs() {
    const response = await fetch(`${API_BASE_URL}/songs`)
    const data = await parseResponse(response, 'Failed to load songs.')
    return Array.isArray(data.songs) ? data.songs : []
}

export async function uploadSong({ file, artist, album }) {
    const formData = new FormData()
    formData.append('song', file)
    formData.append('title', file.name.trim().replace(/\.mp3$/i, '').trim())
    formData.append('artist', artist.trim())
    formData.append('album', album.trim())

    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
    })

    const data = await parseResponse(response, 'Failed to upload song.')

    if (!data.song) {
        throw new Error('The upload response did not include the created song.')
    }

    return data.song
}

export { API_BASE_URL, SOCKET_URL }
