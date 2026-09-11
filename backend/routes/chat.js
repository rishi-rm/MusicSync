import express from 'express'
import mongoose from 'mongoose'
import Friendship from '../models/Friendship.js'
import User from '../models/User.js'
import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import { authenticateToken } from '../middleware/auth.js'
import { buildParticipantKey, createMessage, getConversationForUser, getOrCreateConversation } from '../services/chatService.js'

const router = express.Router()
router.use(authenticateToken)

function publicUser(user) {
    return {
        id: user._id.toString(),
        displayName: user.username,
        listenerId: user.listenerId || null
    }
}

function relationshipPair(firstUserId, secondUserId) {
    return {
        $or: [
            { sender: firstUserId, recipient: secondUserId },
            { sender: secondUserId, recipient: firstUserId }
        ]
    }
}

router.get('/inbox', async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.userId)
        const relationships = await Friendship.find({
            $or: [{ sender: userId }, { recipient: userId }],
            status: { $in: ['pending', 'accepted'] }
        })
            .populate('sender', 'username listenerId')
            .populate('recipient', 'username listenerId')
            .sort({ updatedAt: -1 })

        const acceptedUsers = new Map()
        const incomingRequests = []
        for (const relationship of relationships) {
            const isSender = relationship.sender._id.toString() === req.user.userId
            const otherUser = isSender ? relationship.recipient : relationship.sender
            if (relationship.status === 'accepted') {
                acceptedUsers.set(otherUser._id.toString(), publicUser(otherUser))
            } else if (!isSender) {
                incomingRequests.push({
                    id: relationship._id.toString(),
                    sender: publicUser(relationship.sender),
                    createdAt: relationship.createdAt
                })
            }
        }

        const conversations = await Conversation.find({ participants: userId })
            .populate('participants', 'username listenerId')
            .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })

        const conversationByFriend = new Map()
        for (const conversation of conversations) {
            const friend = conversation.participants.find((participant) => participant._id.toString() !== req.user.userId)
            if (friend && acceptedUsers.has(friend._id.toString())) {
                conversationByFriend.set(friend._id.toString(), {
                    ...acceptedUsers.get(friend._id.toString()),
                    conversationId: conversation._id.toString(),
                    latestMessage: conversation.lastMessage?.content || '',
                    latestMessageAt: conversation.lastMessage?.createdAt || conversation.updatedAt
                })
            }
        }

        const friends = [...acceptedUsers.entries()].map(([friendId, friend]) => (
            conversationByFriend.get(friendId) || { ...friend, conversationId: null, latestMessage: '', latestMessageAt: null }
        )).sort((left, right) => {
            if (!left.latestMessageAt) return 1
            if (!right.latestMessageAt) return -1
            return new Date(right.latestMessageAt) - new Date(left.latestMessageAt)
        })

        return res.json({ success: true, friends, incomingRequests })
    } catch (error) {
        console.error('Failed to load chat inbox:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to load your chats.' })
    }
})

router.get('/lookup', async (req, res) => {
    const listenerId = typeof req.query.listenerId === 'string' ? req.query.listenerId.trim() : ''
    if (!/^\d{5}$/.test(listenerId)) {
        return res.status(400).json({ success: false, message: 'Listener ID must contain exactly 5 digits.' })
    }

    try {
        const user = await User.findOne({ listenerId }, 'username listenerId')
        if (!user) return res.status(404).json({ success: false, message: 'No listener found with that ID.' })
        if (user._id.toString() === req.user.userId) {
            return res.status(400).json({ success: false, message: 'You cannot add yourself.' })
        }

        const relationship = await Friendship.findOne(relationshipPair(req.user.userId, user._id))
        return res.json({ success: true, user: publicUser(user), relationshipStatus: relationship?.status || null })
    } catch (error) {
        console.error('Failed to look up listener:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to search for that listener.' })
    }
})

router.post('/requests', async (req, res) => {
    const listenerId = typeof req.body?.listenerId === 'string' ? req.body.listenerId.trim() : ''
    if (!/^\d{5}$/.test(listenerId)) {
        return res.status(400).json({ success: false, message: 'Listener ID must contain exactly 5 digits.' })
    }

    try {
        const recipient = await User.findOne({ listenerId }, '_id username listenerId')
        if (!recipient) return res.status(404).json({ success: false, message: 'No listener found with that ID.' })
        if (recipient._id.toString() === req.user.userId) {
            return res.status(400).json({ success: false, message: 'You cannot add yourself.' })
        }

        const pairKey = buildParticipantKey(req.user.userId, recipient._id)
        const existing = await Friendship.findOne({
            $or: [
                { pairKey },
                { sender: req.user.userId, recipient: recipient._id },
                { sender: recipient._id, recipient: req.user.userId }
            ]
        })
        if (existing) {
            const message = existing.status === 'accepted'
                ? 'You are already friends.'
                : existing.status === 'pending'
                    ? 'A friend request is already pending.'
                    : 'This friend request was already rejected.'
            return res.status(409).json({ success: false, message })
        }

        const request = await Friendship.create({ sender: req.user.userId, recipient: recipient._id, pairKey, status: 'pending' })
        return res.status(201).json({ success: true, request: { id: request._id.toString(), status: request.status, recipient: publicUser(recipient) } })
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: 'A friend request already exists.' })
        console.error('Failed to send friend request:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to send friend request.' })
    }
})

router.patch('/requests/:id', async (req, res) => {
    const { id: requestId } = req.params
    const status = req.body?.status
    if (!mongoose.Types.ObjectId.isValid(requestId) || !['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid friend request update.' })
    }

    try {
        const request = await Friendship.findOne({ _id: requestId, recipient: req.user.userId, status: 'pending' })
        if (!request) return res.status(404).json({ success: false, message: 'Friend request not found.' })

        request.status = status
        request.pairKey = buildParticipantKey(req.user.userId, request.sender)
        await request.save()

        return res.json({ success: true, status: request.status })
    } catch (error) {
        console.error('Failed to update friend request:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to update friend request.' })
    }
})

router.post('/conversations/with/:friendId', async (req, res) => {
    try {
        const conversation = await getOrCreateConversation(req.user.userId, req.params.friendId)
        return res.status(200).json({ success: true, conversation: { id: conversation._id.toString() } })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to open conversation.' })
    }
})

router.get('/conversations/:conversationId/messages', async (req, res) => {
    try {
        const conversation = await getConversationForUser(req.params.conversationId, req.user.userId)
        const messages = await Message.find({ conversation: conversation._id })
            .populate('sender', 'username listenerId')
            .sort({ createdAt: 1 })
            .limit(500)
        return res.json({ success: true, messages })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to load messages.' })
    }
})

router.post('/conversations/:conversationId/messages', async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!content || content.length > 4000) {
        return res.status(400).json({ success: false, message: 'Message must contain 1 to 4000 characters.' })
    }

    try {
        const conversation = await getConversationForUser(req.params.conversationId, req.user.userId)
        const message = await createMessage(req.params.conversationId, req.user.userId, content)
        const plainMessage = message.toObject()
        const recipientId = conversation.participants.find((participant) => participant.toString() !== req.user.userId)
        const io = req.app.get('io')
        io.to(`conversation:${req.params.conversationId}`).emit('chat:message', plainMessage)
        if (recipientId) io.to(`user:${recipientId.toString()}`).emit('chat:message', plainMessage)
        return res.status(201).json({ success: true, message: plainMessage })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to send message.' })
    }
})

export default router
