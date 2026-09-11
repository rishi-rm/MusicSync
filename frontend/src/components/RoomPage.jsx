import { useEffect, useMemo, useState } from 'react'
import MusicPlayer from './MusicPlayer.jsx'
import { fetchChatInbox, fetchRoomPlaylist, fetchRoom, sendRoomInvite } from '../api.js'

function formatRoomSong(song) {
    if (!song) return 'Unknown Artist'
    if (song.artist && song.album) return `${song.artist} · ${song.album}`
    if (song.artist) return song.artist
    if (song.album) return song.album
    return 'Single'
}

export default function RoomPage({ roomId, socket, onLeaveRoom }) {
    const [room, setRoom] = useState(null)
    const [playlistGroups, setPlaylistGroups] = useState([])
    const [loadingPlaylist, setLoadingPlaylist] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)
    const [friends, setFriends] = useState([])
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteError, setInviteError] = useState('')
    const [selectedSong, setSelectedSong] = useState(null)
    const [roomPlaybackCommand, setRoomPlaybackCommand] = useState(null)
    const [roomPlaybackState, setRoomPlaybackState] = useState(null)
    const [socketReady, setSocketReady] = useState(false)
    const flattenedSongs = useMemo(() => playlistGroups.flatMap((group) => group.songs.map((song) => ({ ...song, __groupDisplayName: group.displayName }))), [playlistGroups])

    useEffect(() => {
        if (!roomId) return undefined

        async function loadRoom() {
            try {
                const roomData = await fetchRoom(roomId)
                setRoom(roomData)
                const playlistData = await fetchRoomPlaylist(roomId)
                setPlaylistGroups(playlistData.playlist || [])
                const inbox = await fetchChatInbox()
                setFriends((inbox.friends || []).filter((friend) => friend.id && !(roomData.members || []).some((member) => member.id === friend.id)))
            } catch (error) {
                console.error('Failed to load room data:', error)
                setInviteError(error instanceof Error ? error.message : 'Unable to load room details.')
            } finally {
                setLoadingPlaylist(false)
            }
        }

        void loadRoom()
    }, [roomId])

    useEffect(() => {
        if (!socket || !roomId) return undefined

        const handleJoin = () => {
            socket.emit('room:join', roomId, (response) => {
                if (response?.success) {
                    setSocketReady(true)
                } else {
                    setInviteError(response?.message || 'Unable to join the room socket.')
                }
            })
        }

        handleJoin()

        socket.on('room:playlist_updated', (payload) => {
            if (payload?.roomId !== roomId) return
            setPlaylistGroups(Array.isArray(payload.playlist) ? payload.playlist : [])
        })

        socket.on('room:playback_state', (payload) => {
            if (payload?.roomId !== roomId) return
            setRoomPlaybackState(payload)
            const nextSongId = payload?.songId
            if (!nextSongId) {
                setSelectedSong(null)
                return
            }

            const nextSong = flattenedSongs.find((song) => song._id === nextSongId)
            if (nextSong) setSelectedSong(nextSong)
        })

        return () => {
            socket.emit('room:leave', roomId)
            socket.off('room:playlist_updated')
            socket.off('room:playback_state')
        }
    }, [flattenedSongs, roomId, socket])

    const filteredSongs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return flattenedSongs
        return flattenedSongs.filter((song) => {
            const haystack = [song.title, song.artist, song.album].filter(Boolean).join(' ').toLowerCase()
            return haystack.includes(query)
        })
    }, [flattenedSongs, searchQuery])

    function handleSelectSong(song, shouldPlay = true) {
        if (!socket || !roomId || !song?._id) return
        setSelectedSong(song)
        setRoomPlaybackCommand({ type: shouldPlay ? 'play' : 'pause', songId: song._id, position: 0 })
        socket.emit('room:select_song', {
            roomId,
            songId: song._id,
            shouldPlay,
            position: 0
        })
    }

    async function handleInvite(friend) {
        if (!friend?.id || !roomId) return
        setInviteLoading(true)
        setInviteError('')
        try {
            await sendRoomInvite(roomId, friend.id)
            setInviteOpen(false)
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : 'Failed to send room invite.')
        } finally {
            setInviteLoading(false)
        }
    }

    return (
        <section className="room-page" aria-labelledby="room-heading">
            <header className="room-header">
                <div>
                    <p className="eyebrow">Shared room</p>
                    <h1 id="room-heading">{room?.roomCode || 'Room'}</h1>
                </div>
                <div className="room-header-actions">
                    <button type="button" className="primary-button room-action" onClick={() => setInviteOpen(true)}>Invite</button>
                    <button type="button" className="secondary-button" onClick={onLeaveRoom}>Leave room</button>
                </div>
            </header>

            <div className="room-search search-field">
                <span aria-hidden="true">⌕</span>
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search room playlist" aria-label="Search room playlist" />
            </div>

            <div className="panel room-playlist-panel">
                <div className="section-heading room-panel-heading">
                    <div>
                        <p className="eyebrow">Combined playlist</p>
                        <h2>Room library</h2>
                    </div>
                    <span className="count-badge">{filteredSongs.length}</span>
                </div>

                {loadingPlaylist && <p className="state-message">Loading your shared room playlist...</p>}
                {!loadingPlaylist && playlistGroups.length === 0 && <p className="state-message">No songs are available in this room yet. Invite a friend and share a track.</p>}

                {!loadingPlaylist && playlistGroups.length > 0 && (
                    <div className="room-playlist-list">
                        {playlistGroups.map((group) => (
                            <div className="room-playlist-group" key={group.userId}>
                                <div className="room-group-header">
                                    <span className="room-group-badge">{group.displayName}</span>
                                </div>
                                <div className="song-list room-song-list">
                                    {group.songs.filter((song) => {
                                        const query = searchQuery.trim().toLowerCase()
                                        if (!query) return true
                                        return [song.title, song.artist, song.album].filter(Boolean).join(' ').toLowerCase().includes(query)
                                    }).map((song) => (
                                        <button type="button" key={song._id} className={`song-row${selectedSong?._id === song._id ? ' selected' : ''}`} onClick={() => handleSelectSong(song, true)}>
                                            <span className="song-index">♫</span>
                                            <div className="song-copy">
                                                <strong>{song.title}</strong>
                                                <span>{formatRoomSong(song)}</span>
                                            </div>
                                            <div className="song-meta">
                                                <small>{song.uploadedByName || group.displayName}</small>
                                                <small>{song.playCount || 0} plays</small>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selectedSong && (
                <MusicPlayer
                    compact
                    song={selectedSong}
                    remotePlaybackCommand={roomPlaybackCommand}
                    onLocalPlay={(position, songId) => socket?.emit('room:select_song', { roomId, songId, shouldPlay: true, position })}
                    onLocalPause={(position, songId) => socket?.emit('room:select_song', { roomId, songId, shouldPlay: false, position })}
                    onLocalSeek={(position, songId) => socket?.emit('room:select_song', { roomId, songId, shouldPlay: roomPlaybackState?.isPlaying ?? true, position })}
                    onSongEnded={(songId) => socket?.emit('room:select_song', { roomId, songId, shouldPlay: false, position: 0 })}
                />
            )}

            {inviteOpen && (
                <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setInviteOpen(false)
                }}>
                    <section className="friend-modal" role="dialog" aria-modal="true" aria-labelledby="invite-room-heading">
                        <div className="modal-heading">
                            <h2 id="invite-room-heading">Invite friends</h2>
                            <button type="button" className="modal-close-button" aria-label="Close invite friends dialog" onClick={() => setInviteOpen(false)}>×</button>
                        </div>
                        <div className="friend-list room-friend-list">
                            {friends.length === 0 && <p className="state-message">You need accepted friends before you can invite anyone.</p>}
                            {friends.map((friend) => (
                                <div className="lookup-result" key={friend.id}>
                                    <div className="friend-avatar" aria-hidden="true">{friend.displayName?.charAt(0)?.toUpperCase() || 'F'}</div>
                                    <div className="friend-copy">
                                        <strong>{friend.displayName}</strong>
                                        <span>{friend.latestMessage || 'Ready to join'}</span>
                                    </div>
                                    <button type="button" className="primary-button" disabled={inviteLoading} onClick={() => handleInvite(friend)}>Send Invite</button>
                                </div>
                            ))}
                        </div>
                        {inviteError && <p className="error-message">{inviteError}</p>}
                    </section>
                </div>
            )}

            {!socketReady && <p className="state-message">Connecting room sync...</p>}
        </section>
    )
}
