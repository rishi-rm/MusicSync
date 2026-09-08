function formatDate(dateValue) {
    if (!dateValue) return ''

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(dateValue))
}

export default function SongLibrary({ songs, selectedSongId, searchQuery, onSearchChange, onSelectSong, loading, error }) {
    return (
        <section className="panel library-panel" aria-labelledby="library-heading">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Your collection</p>
                    <h2 id="library-heading">Song library</h2>
                </div>
                <span className="count-badge">{songs.length}</span>
            </div>

            <label className="search-field">
                <span className="sr-only">Search in library</span>
                <span aria-hidden="true">⌕</span>
                <input
                    type="search"
                    placeholder="Search in library"
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
                />
            </label>

            {loading && <p className="state-message">Loading your library...</p>}
            {error && <p className="state-message error-message">{error}</p>}

            {!loading && !error && songs.length === 0 && (
                <p className="state-message">Your library is empty. Upload an MP3 to get started.</p>
            )}

            {!loading && !error && songs.length > 0 && (
                <div className="song-list">
                    {songs.map((song) => {
                        const isSelected = song._id === selectedSongId

                        return (
                            <button
                                className={`song-row${isSelected ? ' selected' : ''}`}
                                key={song._id}
                                type="button"
                                onClick={() => onSelectSong(song)}
                            >
                                <span className="song-index" aria-hidden="true">{isSelected ? '▶' : '♪'}</span>
                                <span className="song-copy">
                                    <strong>{song.title}</strong>
                                    <span>{song.artist || 'Unknown Artist'}</span>
                                </span>
                                <span className="song-meta">
                                    {song.album || 'Single'}
                                    {song.createdAt && <small>{formatDate(song.createdAt)}</small>}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
