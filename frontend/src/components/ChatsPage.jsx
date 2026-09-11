import { useEffect, useState } from 'react'
import { fetchFriends, lookupFriend, sendFriendRequest, updateFriendRequest } from '../api.js'

export default function ChatsPage() {
    const [friends, setFriends] = useState([])
    const [incomingRequests, setIncomingRequests] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [listenerId, setListenerId] = useState('')
    const [lookupResult, setLookupResult] = useState(null)
    const [lookupLoading, setLookupLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [modalError, setModalError] = useState('')
    const [selectedFriend, setSelectedFriend] = useState(null)

    async function loadChats() {
        setLoading(true)
        setError('')

        try {
            const data = await fetchFriends()
            setFriends(data.friends)
            setIncomingRequests(data.incomingRequests)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load your chats.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadChats()
    }, [])

    function openAddModal() {
        setListenerId('')
        setLookupResult(null)
        setModalError('')
        setModalOpen(true)
    }

    function closeAddModal() {
        if (actionLoading || lookupLoading) return
        setModalOpen(false)
    }

    async function handleLookup(event) {
        event.preventDefault()
        const normalizedId = listenerId.replace(/\D/g, '').slice(0, 5)
        setListenerId(normalizedId)
        setLookupResult(null)
        setModalError('')

        if (!/^\d{5}$/.test(normalizedId)) {
            setModalError('Enter exactly 5 digits.')
            return
        }

        setLookupLoading(true)
        try {
            setLookupResult(await lookupFriend(normalizedId))
        } catch (lookupError) {
            setModalError(lookupError instanceof Error ? lookupError.message : 'Listener not found.')
        } finally {
            setLookupLoading(false)
        }
    }

    async function handleAddFriend() {
        if (!lookupResult?.user) return

        setActionLoading(true)
        setModalError('')
        try {
            await sendFriendRequest(lookupResult.user.listenerId)
            setLookupResult((current) => ({ ...current, relationshipStatus: 'pending' }))
        } catch (requestError) {
            setModalError(requestError instanceof Error ? requestError.message : 'Failed to send friend request.')
        } finally {
            setActionLoading(false)
        }
    }

    async function handleRequest(requestId, status) {
        setActionLoading(true)
        setError('')
        try {
            await updateFriendRequest(requestId, status)
            await loadChats()
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Failed to update friend request.')
        } finally {
            setActionLoading(false)
        }
    }

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const visibleFriends = friends.filter((friend) => (
        !normalizedQuery || friend.displayName.toLowerCase().includes(normalizedQuery)
    ))

    return (
        <section className="chats-page" aria-labelledby="chats-page-heading">
            <div className="chats-page-heading">
                <div>
                    <p className="eyebrow">Your people</p>
                    <h1 id="chats-page-heading">Chats</h1>
                </div>
            </div>

            <div className="chats-search search-field">
                <span aria-hidden="true">⌕</span>
                <input
                    type="search"
                    placeholder="Search friends"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button className="add-friend-button" type="button" aria-label="Add friend" onClick={openAddModal}>+</button>
            </div>

            {error && <p className="state-message error-message">{error}</p>}

            {incomingRequests.length > 0 && (
                <section className="request-section" aria-labelledby="requests-heading">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">Waiting for you</p>
                            <h2 id="requests-heading">Friend requests</h2>
                        </div>
                        <span className="count-badge">{incomingRequests.length}</span>
                    </div>
                    <div className="request-list">
                        {incomingRequests.map((request) => (
                            <div className="request-row" key={request.id}>
                                <div className="friend-avatar" aria-hidden="true">{request.sender.displayName.charAt(0).toUpperCase()}</div>
                                <div className="friend-copy">
                                    <strong>{request.sender.displayName}</strong>
                                    <span>Listener ID {request.sender.listenerId}</span>
                                </div>
                                <div className="request-actions">
                                    <button type="button" disabled={actionLoading} onClick={() => handleRequest(request.id, 'accepted')}>Accept</button>
                                    <button type="button" disabled={actionLoading} onClick={() => handleRequest(request.id, 'rejected')}>Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="friends-section" aria-labelledby="friends-heading">
                <div className="section-heading">
                    <div>
                        <p className="eyebrow">Accepted friends</p>
                        <h2 id="friends-heading">Conversations</h2>
                    </div>
                    <span className="count-badge">{visibleFriends.length}</span>
                </div>
                {loading && <p className="state-message">Loading your friends...</p>}
                {!loading && visibleFriends.length === 0 && (
                    <p className="state-message">{friends.length ? 'No friends match your search.' : 'Add a friend by their Listener ID to start connecting.'}</p>
                )}
                {!loading && visibleFriends.length > 0 && (
                    <div className="friend-list">
                        {visibleFriends.map((friend) => (
                            <button className={`friend-row${selectedFriend?.id === friend.id ? ' selected' : ''}`} type="button" key={friend.id} onClick={() => setSelectedFriend(friend)}>
                                <div className="friend-avatar" aria-hidden="true">{friend.displayName.charAt(0).toUpperCase()}</div>
                                <div className="friend-copy">
                                    <strong>{friend.displayName}</strong>
                                    <span>{friend.latestMessage || 'No messages yet'}</span>
                                </div>
                                <span className="friend-arrow" aria-hidden="true">›</span>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {selectedFriend && (
                <section className="conversation-placeholder panel" aria-label={`Conversation with ${selectedFriend.displayName}`}>
                    <p className="eyebrow">Direct messages</p>
                    <h2>{selectedFriend.displayName}</h2>
                    <p className="state-message">Direct messaging is ready to be connected to this friendship.</p>
                </section>
            )}

            {modalOpen && (
                <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeAddModal()
                }}>
                    <section className="friend-modal" role="dialog" aria-modal="true" aria-labelledby="add-friend-heading">
                        <div className="modal-heading">
                            <h2 id="add-friend-heading">Add a friend</h2>
                            <button type="button" className="modal-close-button" aria-label="Close add friend dialog" onClick={closeAddModal}>×</button>
                        </div>
                        <form className="friend-form" onSubmit={handleLookup}>
                            <label className="form-field">
                                <span>Listener ID</span>
                                <input inputMode="numeric" pattern="[0-9]{5}" maxLength="5" value={listenerId} onChange={(event) => setListenerId(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="48392" autoFocus />
                            </label>
                            <button className="primary-button" type="submit" disabled={lookupLoading}>{lookupLoading ? 'Searching...' : 'Search listener'}</button>
                        </form>
                        {lookupResult?.user && (
                            <div className="lookup-result">
                                <div className="friend-avatar" aria-hidden="true">{lookupResult.user.displayName.charAt(0).toUpperCase()}</div>
                                <div className="friend-copy">
                                    <strong>{lookupResult.user.displayName}</strong>
                                    <span>Listener ID {lookupResult.user.listenerId}</span>
                                </div>
                                <button className="lookup-add-button" type="button" disabled={actionLoading || lookupResult.relationshipStatus} onClick={handleAddFriend}>
                                    {lookupResult.relationshipStatus === 'pending' ? 'Pending' : lookupResult.relationshipStatus === 'accepted' ? 'Friends' : '+'}
                                </button>
                            </div>
                        )}
                        {modalError && <p className="error-message">{modalError}</p>}
                    </section>
                </div>
            )}
        </section>
    )
}