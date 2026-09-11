function songSubtitle(song) {
    return [song.artist || 'Unknown Artist', song.album || 'Single'].join(' · ')
}

export default function HomeDashboard({ songs, loading, user }) {
    const frequentlyListened = songs
        .filter((song) => Number(song.playCount) > 0)
        .sort((left, right) => Number(right.playCount) - Number(left.playCount))
        .slice(0, 2)
    const displayName = user?.username || 'there'

    return (
        <section className="home-dashboard" aria-labelledby="home-heading">
            <div className="home-intro">
                <p className="eyebrow">Your listening room</p>
                <h1 id="home-heading">Welcome back, <span>{displayName}</span></h1>
                <p className="intro-copy">A small view of what is moving through your room.</p>
            </div>

            <div className="activity-grid">
                <section className="activity-panel panel" aria-labelledby="frequent-heading">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">Your listening</p>
                            <h2 id="frequent-heading">Most frequently listened</h2>
                        </div>
                        <span className="activity-icon" aria-hidden="true">♫</span>
                    </div>

                    {loading && <p className="state-message">Loading your listening history...</p>}
                    {!loading && frequentlyListened.length === 0 && (
                        <p className="state-message">Your listening history will appear here after you play some songs.</p>
                    )}
                    {!loading && frequentlyListened.length > 0 && (
                        <div className="activity-list">
                            {frequentlyListened.map((song, index) => (
                                <div className="activity-row" key={song._id}>
                                    <span className="activity-rank">0{index + 1}</span>
                                    <div className="activity-copy">
                                        <strong>{song.title}</strong>
                                        <span>{songSubtitle(song)}</span>
                                    </div>
                                    <span className="activity-count">{song.playCount} plays</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="activity-panel panel" aria-labelledby="chats-heading">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">Stay connected</p>
                            <h2 id="chats-heading">Recent chats</h2>
                        </div>
                        <span className="activity-icon" aria-hidden="true">⌁</span>
                    </div>
                    <p className="state-message">Your recent conversations will appear here when chat is available.</p>
                </section>
            </div>
        </section>
    )
}
