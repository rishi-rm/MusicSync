function ProfileDetail({ label, value }) {
    return (
        <div className="profile-detail">
            <span>{label}</span>
            <strong>{value || 'Not available yet'}</strong>
        </div>
    )
}

export default function ProfilePage({ user }) {
    const displayName = user?.displayName || user?.username || 'Listener'

    return (
        <section className="profile-page" aria-labelledby="profile-heading">
            <div className="profile-heading">
                <p className="eyebrow">Your account</p>
                <h1 id="profile-heading">Profile</h1>
                <p className="intro-copy">Your Harmo listener details.</p>
            </div>

            <div className="profile-card panel">
                <div className="profile-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>
                <div className="profile-details">
                    <ProfileDetail label="Display name" value={displayName} />
                    <ProfileDetail label="Email address" value={user?.email} />
                    <ProfileDetail label="Listener ID" value={user?.listenerId} />
                </div>
            </div>
        </section>
    )
}
