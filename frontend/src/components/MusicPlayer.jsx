import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../api.js'

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00'

    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${minutes}:${remainingSeconds}`
}

export default function MusicPlayer({ song, remotePlaybackCommand, onLocalPlay, onLocalPause, onLocalSeek }) {
    const audioRef = useRef(null)
    const pendingRemotePlayRef = useRef(false)
    const suppressPlayEventRef = useRef(false)
    const suppressPauseEventRef = useRef(false)
    const suppressSeekEventRef = useRef(false)
    const onLocalPlayRef = useRef(onLocalPlay)
    const onLocalPauseRef = useRef(onLocalPause)
    const onLocalSeekRef = useRef(onLocalSeek)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playbackError, setPlaybackError] = useState('')

    useEffect(() => {
        onLocalPlayRef.current = onLocalPlay
        onLocalPauseRef.current = onLocalPause
        onLocalSeekRef.current = onLocalSeek
    }, [onLocalPause, onLocalPlay, onLocalSeek])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return undefined

        suppressPauseEventRef.current = !audio.paused
        audio.pause()
        suppressSeekEventRef.current = true
        audio.currentTime = 0

        if (song?._id) {
            audio.src = `${API_BASE_URL}/songs/${encodeURIComponent(song._id)}/stream`
            audio.load()
        } else {
            audio.removeAttribute('src')
            audio.load()
        }

        const handleLoadedMetadata = () => setDuration(audio.duration)
        const handleCanPlay = () => {
            if (!pendingRemotePlayRef.current || !song?._id) return

            pendingRemotePlayRef.current = false
            suppressPlayEventRef.current = true
            void audio.play().catch((error) => {
                suppressPlayEventRef.current = false
                console.error('Remote audio playback could not start once ready:', error)
                setPlaybackError('Remote playback could not start on this device.')
            })
        }
        const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
        const handlePlay = () => {
            setIsPlaying(true)
            if (suppressPlayEventRef.current) {
                suppressPlayEventRef.current = false
                return
            }

            onLocalPlayRef.current?.(audio.currentTime, song._id)
        }
        const handlePause = () => {
            setIsPlaying(false)
            if (suppressPauseEventRef.current) {
                suppressPauseEventRef.current = false
                return
            }

            onLocalPauseRef.current?.(audio.currentTime, song._id)
        }
        const handleSeeked = () => {
            if (suppressSeekEventRef.current) {
                suppressSeekEventRef.current = false
                return
            }

            onLocalSeekRef.current?.(audio.currentTime, song._id)
        }
        const handleEnded = () => {
            setIsPlaying(false)
            setCurrentTime(0)
        }
        const handleError = () => {
            setPlaybackError('Unable to load this song from storage.')
            setIsPlaying(false)
        }

        audio.addEventListener('loadedmetadata', handleLoadedMetadata)
        audio.addEventListener('canplay', handleCanPlay)
        audio.addEventListener('timeupdate', handleTimeUpdate)
        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('seeked', handleSeeked)
        audio.addEventListener('ended', handleEnded)
        audio.addEventListener('error', handleError)

        return () => {
            audio.pause()
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
            audio.removeEventListener('canplay', handleCanPlay)
            audio.removeEventListener('timeupdate', handleTimeUpdate)
            audio.removeEventListener('play', handlePlay)
            audio.removeEventListener('pause', handlePause)
            audio.removeEventListener('seeked', handleSeeked)
            audio.removeEventListener('ended', handleEnded)
            audio.removeEventListener('error', handleError)
        }
    }, [song?._id])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !remotePlaybackCommand || !song?._id) return
        if (remotePlaybackCommand.songId && remotePlaybackCommand.songId !== song._id) return

        const position = Number(remotePlaybackCommand.position)
        if (Number.isFinite(position)) {
            suppressSeekEventRef.current = true
            audio.currentTime = position
        }

        if (remotePlaybackCommand.type === 'play') {
            pendingRemotePlayRef.current = true
            if (audio.readyState >= 2) {
                pendingRemotePlayRef.current = false
                suppressPlayEventRef.current = true
                void audio.play().catch((error) => {
                    suppressPlayEventRef.current = false
                    console.error('Remote audio playback could not start:', error)
                    setPlaybackError('Remote playback could not start on this device.')
                })
            }
            return
        }

        if (remotePlaybackCommand.type === 'pause') {
            pendingRemotePlayRef.current = false
            suppressPauseEventRef.current = !audio.paused
            audio.pause()
            return
        }

        if (remotePlaybackCommand.type === 'seek') {
            pendingRemotePlayRef.current = false
        }
    }, [remotePlaybackCommand, song?._id])

    async function handlePlay() {
        const audio = audioRef.current
        if (!audio || !song) return

        setPlaybackError('')

        try {
            await audio.play()
        } catch (error) {
            console.error('Audio playback could not start:', error)
            setPlaybackError('Playback was blocked or the audio could not be loaded.')
            setIsPlaying(false)
        }
    }

    function handlePause() {
        const audio = audioRef.current
        if (!audio) return

        audio.pause()
    }

    function handleSeek(event) {
        const audio = audioRef.current
        if (!audio) return

        const nextTime = Number(event.target.value)
        audio.currentTime = nextTime
        setCurrentTime(nextTime)
    }

    function handleSeekCommit() {
        const audio = audioRef.current
        if (!audio) return

    }

    function handleRestart() {
        const audio = audioRef.current
        if (!audio) return

        audio.currentTime = 0
        setCurrentTime(0)
    }

    function handleEnd() {
        const audio = audioRef.current
        if (!audio || !duration) return

        audio.currentTime = duration
        setCurrentTime(duration)
    }

    const hasSong = Boolean(song?._id)

    return (
        <section className="player-panel" aria-labelledby="player-heading">
            <audio ref={audioRef} preload="metadata" />
            <div className="player-art" aria-hidden="true">♫</div>
            <div className="player-copy">
                <p className="eyebrow">Now selected</p>
                <h2 id="player-heading">{song ? song.title : 'Choose a song'}</h2>
                <p>{song ? `${song.artist || 'Unknown Artist'}${song.album ? ` · ${song.album}` : ''}` : 'Select a track from your library to prepare playback.'}</p>
            </div>
            {/* <div className="player-status">
                <span className={`status-dot${socketConnected ? ' online' : ''}`} />
                {socketConnected ? 'Socket connected' : 'Playback offline'}
            </div> */}
            <div className="player-progress">
                <span>{formatTime(currentTime)}</span>
                <input
                    aria-label="Seek through song"
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={Math.min(currentTime, duration || 0)}
                    onChange={handleSeek}
                    onMouseUp={handleSeekCommit}
                    onTouchEnd={handleSeekCommit}
                    onKeyUp={handleSeekCommit}
                    disabled={!hasSong || !duration}
                />
                <span>{formatTime(duration)}</span>
            </div>
            <div className="player-controls" aria-label="Playback controls">
                <button type="button" onClick={handleRestart} disabled={!hasSong} aria-label="Restart song">↺</button>
                <button className="play-button" type="button" onClick={isPlaying ? handlePause : handlePlay} disabled={!hasSong} aria-label={isPlaying ? 'Pause song' : 'Play song'}>
                    {isPlaying ? 'Ⅱ' : '▶'}
                </button>
                <button type="button" onClick={handleEnd} disabled={!hasSong || !duration} aria-label="End song">↻</button>
            </div>
            {playbackError && <p className="player-note error-message">{playbackError}</p>}
        </section>
    )
}
