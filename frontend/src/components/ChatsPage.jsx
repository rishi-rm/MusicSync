import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import {
    fetchChatInbox,
    fetchMessages,
    lookupFriend,
    openConversation,
    sendFriendRequest,
    sendMessage,
    SOCKET_URL,
    updateFriendRequest
} from '../api.js'

function senderId(message) {
    return typeof message.sender === 'string' ? message.sender : message.sender?._id || message.sender?.toString()
}

function messageConversationId(message) {
    return typeof message.conversation === 'string' ? message.conversation : message.conversation?._id || message.conversation?.toString()
}

export default function ChatsPage({ token, userId }) {
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
    const [conversation, setConversation] = useState(null)
    const [messages, setMessages] = useState([])
    const [messagesLoading, setMessagesLoading] = useState(false)
    const [messageDraft, setMessageDraft] = useState('')
    const [messageError, setMessageError] = useState('')
    const socketRef = useRef(null)
    const messagesEndRef = useRef(null)
    const currentConversationIdRef = useRef(null)
    currentConversationIdRef.current = conversation?.id || null

    async function loadInbox() {
        setLoading(true)
        setError('')
        try {
            const data = await fetchChatInbox()
            setFriends(data.friends)
            setIncomingRequests(data.incomingRequests)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load your chats.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadInbox() }, [])

    useEffect(() => {
        if (!token) return undefined
        const socket = io(SOCKET_URL, { auth: { token } })
        socketRef.current = socket
        socket.on('chat:message', (message) => {
            setMessages((current) => {
                if (messageConversationId(message) !== currentConversationIdRef.current) return current
                return current.some((item) => item._id === message._id) ? current : [...current, message]
            })
            loadInbox()
        })
        socket.on('connect_error', (socketError) => setMessageError(socketError.message))
        return () => {
            socket.disconnect()
            socketRef.current = null
        }
    }, [token])

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    function openAddModal() {
        setListenerId('')
        setLookupResult(null)
        setModalError('')
        setModalOpen(true)
    }

    function closeAddModal() {
        if (!actionLoading && !lookupLoading) setModalOpen(false)
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
            await loadInbox()
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Failed to update friend request.')
        } finally {
            setActionLoading(false)
        }
    }

    async function handleOpenConversation(friend) {
        setSelectedFriend(friend)
        setConversation(null)
        setMessages([])
        setMessageError('')
        setMessagesLoading(true)
        try {
            const opened = await openConversation(friend.id)
            const history = await fetchMessages(opened.id)
            setConversation(opened)
            setMessages(history)
            socketRef.current?.emit('chat:join', opened.id)
        } catch (openError) {
            setMessageError(openError instanceof Error ? openError.message : 'Failed to open conversation.')
        } finally {
            setMessagesLoading(false)
        }
    }

    function closeConversation() {
        if (conversation?.id) socketRef.current?.emit('chat:leave', conversation.id)
        setSelectedFriend(null)
        setConversation(null)
        setMessages([])
        setMessageDraft('')
        setMessageError('')
    }

    async function handleSendMessage(event) {
        event.preventDefault()
        const content = messageDraft.trim()
        if (!conversation || !content) return
        setMessageDraft('')
        setMessageError('')
        try {
            const savedMessage = await sendMessage(conversation.id, content)
            setMessages((current) => current.some((item) => item._id === savedMessage._id) ? current : [...current, savedMessage])
        } catch (sendError) {
            setMessageDraft(content)
            setMessageError(sendError instanceof Error ? sendError.message : 'Failed to send message.')
        }
    }

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const visibleFriends = friends.filter((friend) => !normalizedQuery || friend.displayName.toLowerCase().includes(normalizedQuery))

    if (selectedFriend) {
        return (
            <section className="conversation-page" aria-labelledby="conversation-heading">
                <header className="conversation-header">
                    <button className="conversation-back" type="button" onClick={closeConversation} aria-label="Back to chats">‹</button>
                    <div className="friend-avatar" aria-hidden="true">{selectedFriend.displayName.charAt(0).toUpperCase()}</div>
                    <h1 id="conversation-heading">{selectedFriend.displayName}</h1>
                </header>
                <div className="message-list" aria-live="polite">
                    {messagesLoading && <p className="state-message">Loading messages...</p>}
                    {!messagesLoading && messages.length === 0 && <p className="state-message">Start the conversation.</p>}
                    {messages.map((message) => (
                        <div className={`message-bubble ${senderId(message) === userId ? 'sent' : 'received'}`} key={message._id}>{message.content}</div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                {messageError && <p className="message-error error-message">{messageError}</p>}
                <form className="message-composer" onSubmit={handleSendMessage}>
                    <input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Write a message..." maxLength="4000" aria-label="Message" />
                    <button type="submit" disabled={!messageDraft.trim()}>Send</button>
                </form>
            </section>
        )
    }

    return (
        <section className="chats-page" aria-labelledby="chats-page-heading">
            <div className="chats-page-heading"><div><p className="eyebrow">Your people</p><h1 id="chats-page-heading">Chats</h1></div></div>
            <div className="chats-search search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search friends" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><button className="add-friend-button" type="button" aria-label="Add friend" onClick={openAddModal}>+</button></div>
            {error && <p className="state-message error-message">{error}</p>}
            {incomingRequests.length > 0 && <section className="request-section" aria-labelledby="requests-heading"><div className="section-heading"><div><p className="eyebrow">Waiting for you</p><h2 id="requests-heading">Friend requests</h2></div><span className="count-badge">{incomingRequests.length}</span></div><div className="request-list">{incomingRequests.map((request) => <div className="request-row" key={request.id}><div className="friend-avatar" aria-hidden="true">{request.sender.displayName.charAt(0).toUpperCase()}</div><div className="friend-copy"><strong>{request.sender.displayName}</strong><span>Listener ID {request.sender.listenerId}</span></div><div className="request-actions"><button type="button" disabled={actionLoading} onClick={() => handleRequest(request.id, 'accepted')}>Accept</button><button type="button" disabled={actionLoading} onClick={() => handleRequest(request.id, 'rejected')}>Reject</button></div></div>)}</div></section>}
            <section className="friends-section" aria-labelledby="friends-heading"><div className="section-heading"><div><p className="eyebrow">Accepted friends</p><h2 id="friends-heading">Conversations</h2></div><span className="count-badge">{visibleFriends.length}</span></div>{loading && <p className="state-message">Loading your friends...</p>}{!loading && visibleFriends.length === 0 && <p className="state-message">{friends.length ? 'No friends match your search.' : 'Add a friend by their Listener ID to start connecting.'}</p>}{!loading && visibleFriends.length > 0 && <div className="friend-list">{visibleFriends.map((friend) => <button className="friend-row" type="button" key={friend.id} onClick={() => handleOpenConversation(friend)}><div className="friend-avatar" aria-hidden="true">{friend.displayName.charAt(0).toUpperCase()}</div><div className="friend-copy"><strong>{friend.displayName}</strong><span>{friend.latestMessage || 'No messages yet'}</span></div><span className="friend-arrow" aria-hidden="true">›</span></button>)}</div>}</section>
            {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddModal() }}><section className="friend-modal" role="dialog" aria-modal="true" aria-labelledby="add-friend-heading"><div className="modal-heading"><h2 id="add-friend-heading">Add a friend</h2><button type="button" className="modal-close-button" aria-label="Close add friend dialog" onClick={closeAddModal}>×</button></div><form className="friend-form" onSubmit={handleLookup}><label className="form-field"><span>Listener ID</span><input inputMode="numeric" pattern="[0-9]{5}" maxLength="5" value={listenerId} onChange={(event) => setListenerId(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="48392" autoFocus /></label><button className="primary-button" type="submit" disabled={lookupLoading}>{lookupLoading ? 'Searching...' : 'Search listener'}</button></form>{lookupResult?.user && <div className="lookup-result"><div className="friend-avatar" aria-hidden="true">{lookupResult.user.displayName.charAt(0).toUpperCase()}</div><div className="friend-copy"><strong>{lookupResult.user.displayName}</strong><span>Listener ID {lookupResult.user.listenerId}</span></div><button className="lookup-add-button" type="button" disabled={actionLoading || Boolean(lookupResult.relationshipStatus)} onClick={handleAddFriend}>{lookupResult.relationshipStatus === 'pending' ? 'Pending' : lookupResult.relationshipStatus === 'accepted' ? 'Friends' : '+'}</button></div>}{modalError && <p className="error-message">{modalError}</p>}</section></div>}
        </section>
    )
}
