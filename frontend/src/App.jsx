import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import {
    clearStoredAuthSession,
    fetchSongs,
    getStoredAuthSession,
    saveAuthSession,
    SOCKET_URL,
    updateSongFavorite
} from './api.js'
import AuthScreen from './components/AuthScreen.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import SongLibrary from './components/SongLibrary.jsx'
import UploadSong from './components/UploadSong.jsx'

export default function App() {
    const [authSession, setAuthSession] = useState(() => getStoredAuthSession())
    const [songs, setSongs] = useState([])
    const [currentSong, setCurrentSong] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loadingSongs, setLoadingSongs] = useState(true)
    const [songsError, setSongsError] = useState('')
    const [favoriteError, setFavoriteError] = useState('')
    const [favoriteUpdatingId, setFavoriteUpdatingId] = useState(null)
    const [remotePlaybackCommand, setRemotePlaybackCommand] = useState(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const [uploadModalOpen, setUploadModalOpen] = useState(false)
    const songsRef = useRef([])
    const socketRef = useRef(null)
    const pendingPlaybackStateRef = useRef(null)
    const menuRef = useRef(null)

    const isAuthenticated = Boolean(authSession?.token && authSession?.user)
    songsRef.current = songs

    function getPlaybackPosition(state) {
        const position = Number(state?.position)
        if (!Number.isFinite(position)) return 0
        if (!state?.isPlaying) return position

        const updatedAt = Number(state.updatedAt)
        const elapsed = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 1000) : 0
        return position + elapsed
    }

    useEffect(() => {
        function handleAuthExpired() {
            setAuthSession(null)
            setSongs([])
            setCurrentSong(null)
            setSearchQuery('')
            setSongsError('')
            setFavoriteError('')
            setFavoriteUpdatingId(null)
            pendingPlaybackStateRef.current = null
        }

        window.addEventListener('auth:expired', handleAuthExpired)
        return () => window.removeEventListener('auth:expired', handleAuthExpired)
    }, [])

    useEffect(() => {
        if (!isAuthenticated) {
            setLoadingSongs(false)
            return undefined
        }

        let cancelled = false

        async function loadSongs() {
            setLoadingSongs(true)
            setSongsError('')

            try {
                const loadedSongs = await fetchSongs()
                if (!cancelled) {
                    setSongs(loadedSongs)

                    const pendingState = pendingPlaybackStateRef.current
                    const pendingSong = loadedSongs.find((song) => song._id === pendingState?.currentSongId)
                    if (pendingSong) {
                        pendingPlaybackStateRef.current = null
                        setCurrentSong(pendingSong)
                        setRemotePlaybackCommand({
                            type: pendingState.isPlaying ? 'play' : 'pause',
                            songId: pendingState.currentSongId,
                            position: getPlaybackPosition(pendingState)
                        })
                    }
                }
            } catch (error) {
                console.error('Failed to load songs:', error)
                if (!cancelled) setSongsError(error instanceof Error ? error.message : 'Failed to load songs.')
            } finally {
                if (!cancelled) setLoadingSongs(false)
            }
        }

        loadSongs()

        return () => {
            cancelled = true
        }
    }, [isAuthenticated])

    useEffect(() => {
        if (!isAuthenticated) {
            if (socketRef.current) {
                socketRef.current.disconnect()
                socketRef.current = null
            }
            return undefined
        }

        const socket = io(SOCKET_URL, { auth: { token: authSession.token } })
        socketRef.current = socket

        socket.on('connect', () => {
            console.log('[SOCKET] Connected:', socket.id)
        })

        socket.on('disconnect', (reason) => {
            console.log('[SOCKET] Disconnected:', reason)
        })

        socket.on('connect_error', (error) => {
            console.error('[SOCKET] Connection error:', error.message)
        })

        socket.on('playback_state', (state) => {
            console.log('[SOCKET] Received playback state:', state)
            const remoteSong = songsRef.current.find((song) => song._id === state?.currentSongId)
            if (!remoteSong) {
                pendingPlaybackStateRef.current = state
                return
            }

            setCurrentSong(remoteSong)
            setRemotePlaybackCommand({
                type: state.isPlaying ? 'play' : 'pause',
                songId: state.currentSongId,
                position: getPlaybackPosition(state)
            })
        })

        return () => {
            socket.disconnect()
            socketRef.current = null
        }
    }, [authSession?.token, isAuthenticated])

    useEffect(() => {
        if (!menuOpen && !uploadModalOpen) return undefined

        function handleEscape(event) {
            if (event.key === 'Escape') {
                setMenuOpen(false)
                setUploadModalOpen(false)
            }
        }

        function handlePointerDown(event) {
            if (menuOpen && !menuRef.current?.contains(event.target)) setMenuOpen(false)
        }

        document.addEventListener('keydown', handleEscape)
        document.addEventListener('pointerdown', handlePointerDown)
        return () => {
            document.removeEventListener('keydown', handleEscape)
            document.removeEventListener('pointerdown', handlePointerDown)
        }
    }, [menuOpen, uploadModalOpen])

    function handleAuthenticated(session) {
        setAuthSession(session)
        saveAuthSession(session)
    }

    function handleLogout() {
        clearStoredAuthSession()
        setAuthSession(null)
        setSongs([])
        setCurrentSong(null)
        setSearchQuery('')
        setSongsError('')
        setFavoriteError('')
        setFavoriteUpdatingId(null)
        pendingPlaybackStateRef.current = null
    }

    function selectSong(song, announce = true) {
        setCurrentSong(song)
        setRemotePlaybackCommand({
            type: 'play',
            songId: song._id,
            position: 0
        })

        if (announce && socketRef.current?.connected) {
            const payload = { songId: song._id, shouldPlay: true, position: 0 }
            console.log('[SOCKET] Emitting song change:', payload)
            socketRef.current.emit('change_current_song', payload)
        }
    }

    function handleSongUploaded(uploadedSongs) {
        setSongs((previousSongs) => [
            ...uploadedSongs,
            ...previousSongs.filter((song) => !uploadedSongs.some((item) => item._id === song._id))
        ])
        selectSong(uploadedSongs[0])
    }

    async function handleFavoriteChange(song) {
        const previousFavorite = Boolean(song.isFavorite)
        const nextFavorite = !previousFavorite
        setFavoriteError('')
        setFavoriteUpdatingId(song._id)
        setSongs((previousSongs) => previousSongs.map((item) => (
            item._id === song._id ? { ...item, isFavorite: nextFavorite } : item
        )))

        try {
            const updatedSong = await updateSongFavorite(song._id, nextFavorite)
            setSongs((previousSongs) => previousSongs.map((item) => (
                item._id === updatedSong._id ? updatedSong : item
            )))
            setCurrentSong((current) => current?._id === updatedSong._id ? updatedSong : current)
        } catch (error) {
            setSongs((previousSongs) => previousSongs.map((item) => (
                item._id === song._id ? { ...item, isFavorite: previousFavorite } : item
            )))
            setFavoriteError(error instanceof Error ? error.message : 'Failed to update favourite status.')
        } finally {
            setFavoriteUpdatingId(null)
        }
    }

    function emitPlaybackEvent(event, songId, position) {
        if (!socketRef.current?.connected || !songId) return

        const payload = {
            songId,
            position,
            timestamp: Date.now()
        }
        console.log(`[SOCKET] Emitting ${event}:`, payload)
        socketRef.current.emit(event, payload)
    }

    function handleSongEnded(songId) {
        if (!socketRef.current?.connected || !songId) return

        console.log('[SOCKET] Emitting song ended:', songId)
        socketRef.current.emit('song_ended', { songId })
    }

    if (!isAuthenticated) {
        return <AuthScreen onAuthenticated={handleAuthenticated} />
    }

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredSongs = songs.filter((song) => {
        if (!normalizedQuery) return true

        return [song.title, song.artist, song.album]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedQuery))
    }).map((song, index) => ({ song, index }))
        .sort((left, right) => {
            const favoriteOrder = Number(Boolean(right.song.isFavorite)) - Number(Boolean(left.song.isFavorite))
            if (favoriteOrder !== 0) return favoriteOrder

            const titleOrder = (left.song.title || '').localeCompare(right.song.title || '', undefined, { sensitivity: 'base' })
            return titleOrder || left.index - right.index
        })
        .map(({ song }) => song)

    return (
        <main className="app-shell">
            <header className="app-header">
                <div className="brand-lockup">
                    <span className="brand-mark" aria-hidden="true">◒</span>
                    <div>
                        <p className="brand-name">Harmo</p>
                        <p className="brand-tagline">A shared room for every song</p>
                    </div>
                </div>
                <div ref={menuRef} className="app-menu-wrap">
                    <button
                        type="button"
                        className="app-menu-button"
                        aria-label="Open application menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        <span aria-hidden="true">☰</span>
                    </button>
                    {menuOpen && (
                        <div className="app-menu" role="menu">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setMenuOpen(false)
                                    setUploadModalOpen(true)
                                }}
                            >
                                Upload Music
                            </button>
                            <button type="button" role="menuitem" onClick={handleLogout}>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="content-grid">
                <SongLibrary
                    songs={filteredSongs}
                    selectedSongId={currentSong?._id}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSelectSong={selectSong}
                    onFavoriteChange={handleFavoriteChange}
                    favoriteUpdatingId={favoriteUpdatingId}
                    loading={loadingSongs}
                    error={songsError}
                    favoriteError={favoriteError}
                />
            </div>

            {uploadModalOpen && (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setUploadModalOpen(false)
                    }}
                >
                    <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
                        <div className="modal-heading">
                            <h2 id="upload-modal-title">Upload Music</h2>
                            <button
                                type="button"
                                className="modal-close-button"
                                aria-label="Close upload music dialog"
                                onClick={() => setUploadModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>
                        <UploadSong onSongUploaded={handleSongUploaded} />
                    </section>
                </div>
            )}

            <MusicPlayer
                key={currentSong?._id || 'empty-player'}
                song={currentSong}
                remotePlaybackCommand={remotePlaybackCommand}
                onLocalPlay={(position, songId) => emitPlaybackEvent('play', songId, position)}
                onLocalPause={(position, songId) => emitPlaybackEvent('pause', songId, position)}
                onLocalSeek={(position, songId) => emitPlaybackEvent('seek', songId, position)}
                onSongEnded={handleSongEnded}
            />
        </main>
    )
}
