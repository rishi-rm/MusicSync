import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL, fetchSongs } from './api.js'
import MusicPlayer from './components/MusicPlayer.jsx'
import SongLibrary from './components/SongLibrary.jsx'
import UploadSong from './components/UploadSong.jsx'

const SOCKET_URL = (
    import.meta.env.VITE_SOCKET_SERVER_URL || API_BASE_URL
).replace(/\/$/, '')

export default function App() {
    const [songs, setSongs] = useState([])
    const [currentSong, setCurrentSong] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loadingSongs, setLoadingSongs] = useState(true)
    const [songsError, setSongsError] = useState('')
    const [remotePlaybackCommand, setRemotePlaybackCommand] = useState(null)
    const songsRef = useRef([])
    const socketRef = useRef(null)
    const pendingPlaybackStateRef = useRef(null)

    songsRef.current = songs

    useEffect(() => {
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
                            position: pendingState.position
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
    }, [])

    useEffect(() => {
        const socket = io(SOCKET_URL)
        socketRef.current = socket

        socket.on('connect_error', (error) => {
            console.error('Socket connection failed:', error.message)
        })

        socket.on('playback_state', (state) => {
            const remoteSong = songsRef.current.find((song) => song._id === state?.currentSongId)
            if (!remoteSong) {
                pendingPlaybackStateRef.current = state
                return
            }

            setCurrentSong(remoteSong)
            setRemotePlaybackCommand({
                type: state.isPlaying ? 'play' : 'pause',
                songId: state.currentSongId,
                position: state.position
            })
        })

        return () => {
            socket.disconnect()
            socketRef.current = null
        }
    }, [])

    function selectSong(song, announce = true) {
        setCurrentSong(song)

        if (announce && socketRef.current?.connected) {
            socketRef.current.emit('change_current_song', song._id)
        }
    }

    function handleSongUploaded(song) {
        setSongs((previousSongs) => [song, ...previousSongs.filter((item) => item._id !== song._id)])
        selectSong(song)
    }

    function emitPlaybackEvent(event, position) {
        if (!socketRef.current?.connected || !currentSong?._id) return

        socketRef.current.emit(event, {
            songId: currentSong._id,
            position,
            timestamp: Date.now()
        })
    }

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredSongs = songs.filter((song) => {
        if (!normalizedQuery) return true

        return [song.title, song.artist, song.album]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedQuery))
    })

    return (
        <main className="app-shell">
            <header className="app-header">
                <div className="brand-lockup">
                    <span className="brand-mark" aria-hidden="true">◒</span>
                    <div>
                        <p className="brand-name">MusicSync</p>
                        <p className="brand-tagline">A shared room for every song</p>
                    </div>
                </div>
                {/* <div className="connection-pill">
                    <span className={`status-dot${socketConnected ? ' online' : ''}`} />
                    {socketConnected ? 'Connected' : 'Connecting'}
                </div> */}
            </header>

            {/* <section className="intro-block">
                <p className="eyebrow">The listening room</p>
                <h1>Bring the room<br /><span>into rhythm.</span></h1>
                <p className="intro-copy">Build the shared queue now. Real-time playback will plug into the same song identity when streaming is ready.</p>
            </section> */}

            <div className="content-grid">
                <SongLibrary
                    songs={filteredSongs}
                    selectedSongId={currentSong?._id}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSelectSong={selectSong}
                    loading={loadingSongs}
                    error={songsError}
                />
                <UploadSong onSongUploaded={handleSongUploaded} />
            </div>

            <MusicPlayer
                key={currentSong?._id || 'empty-player'}
                song={currentSong}
                remotePlaybackCommand={remotePlaybackCommand}
                onLocalPlay={(position) => emitPlaybackEvent('play', position)}
                onLocalPause={(position) => emitPlaybackEvent('pause', position)}
                onLocalSeek={(position) => emitPlaybackEvent('seek', position)}
            />
        </main>
    )
}
