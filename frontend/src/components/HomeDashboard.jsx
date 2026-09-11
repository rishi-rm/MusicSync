function songSubtitle(song) {
    return [song.artist || 'Unknown Artist', song.album || 'Single'].join(' · ')
}

export default function HomeDashboard({ songs, loading, user, recentChats = [], recentChatsLoading = false, onCreateRoom }) {
    const frequentlyListened = songs
        .filter((song) => Number(song.playCount) > 0)
        .sort((left, right) => Number(right.playCount) - Number(left.playCount))
        .slice(0, 2)
    const displayName = user?.username || 'there'

    return (
        <section className="home-dashboard" aria-labelledby="home-heading">
            <div className="home-intro">
                <p className="eyebrow">Your listening room</p>
                <div className="home-title-row">
                    <h1 id="home-heading">Welcome back, <span>{displayName}</span></h1>
                    <button type="button" className="primary-button create-room-button" onClick={onCreateRoom}>Create Room</button>
                </div>
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

                    {recentChatsLoading && <p className="state-message">Loading your recent chats...</p>}
                    {!recentChatsLoading && recentChats.length === 0 && (
                        <p className="state-message">No DM conversations yet. Add a friend to start a conversation.</p>
                    )}
                    {!recentChatsLoading && recentChats.length > 0 && (
                        <div className="activity-list">
                            {recentChats.slice(0, 2).map((friend) => (
                                <div className="activity-row" key={friend.id || friend.conversationId || friend.displayName}>
                                    <div className="friend-avatar" aria-hidden="true">{friend.displayName?.charAt(0)?.toUpperCase() || 'F'}</div>
                                    <div className="activity-copy">
                                        <strong>{friend.displayName}</strong>
                                        <span>{friend.latestMessage || 'No messages yet'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </section>
    )
}
