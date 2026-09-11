import express from 'express'
import mongoose from 'mongoose'
import Friendship from '../models/Friendship.js'
import User from '../models/User.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

function publicUser(user) {
    return {
        id: user._id.toString(),
        displayName: user.username,
        listenerId: user.listenerId || null
    }
}

function relationshipPair(userId, otherUserId) {
    return {
        $or: [
            { sender: userId, recipient: otherUserId },
            { sender: otherUserId, recipient: userId }
        ]
    }
}

function buildPairKey(firstUserId, secondUserId) {
    return [firstUserId.toString(), secondUserId.toString()].sort().join(':')
}

router.use(authenticateToken)

router.get('/', async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.userId)
        const relationships = await Friendship.find({
            $or: [{ sender: userId }, { recipient: userId }],
            status: { $in: ['pending', 'accepted'] }
        })
            .populate('sender', 'username listenerId')
            .populate('recipient', 'username listenerId')
            .sort({ updatedAt: -1 })

        const friends = []
        const incomingRequests = []
        const seenFriendIds = new Set()

        for (const relationship of relationships) {
            const isSender = relationship.sender._id.toString() === req.user.userId
            const otherUser = isSender ? relationship.recipient : relationship.sender

            if (relationship.status === 'accepted') {
                const friendId = otherUser._id.toString()
                if (seenFriendIds.has(friendId)) continue
                seenFriendIds.add(friendId)
                friends.push({
                    ...publicUser(otherUser),
                    latestMessage: null,
                    friendshipId: relationship._id.toString()
                })
            } else if (!isSender) {
                incomingRequests.push({
                    id: relationship._id.toString(),
                    sender: publicUser(relationship.sender),
                    createdAt: relationship.createdAt
                })
            }
        }

        return res.json({ success: true, friends, incomingRequests })
    } catch (error) {
        console.error('Failed to load friends:', error.message)
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

        const existingRelationship = await Friendship.findOne(relationshipPair(req.user.userId, user._id))
        return res.json({
            success: true,
            user: publicUser(user),
            relationshipStatus: existingRelationship?.status || null
        })
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

        const existingRelationship = await Friendship.findOne(relationshipPair(req.user.userId, recipient._id))
        if (existingRelationship) {
            if (existingRelationship.status === 'accepted') {
                return res.status(409).json({ success: false, message: 'You are already friends.' })
            }
            if (existingRelationship.status === 'pending') {
                return res.status(409).json({ success: false, message: 'A friend request is already pending.' })
            }
            return res.status(409).json({ success: false, message: 'This friend request was already rejected.' })
        }

        const request = await Friendship.create({
            sender: req.user.userId,
            recipient: recipient._id,
            pairKey: buildPairKey(req.user.userId, recipient._id)
        })
        return res.status(201).json({
            success: true,
            request: {
                id: request._id.toString(),
                recipient: publicUser(recipient),
                status: request.status
            }
        })
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ success: false, message: 'A friend request already exists.' })
        }
        console.error('Failed to send friend request:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to send friend request.' })
    }
})

router.patch('/requests/:id', async (req, res) => {
    const { id: requestId } = req.params
    const status = req.body?.status

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ success: false, message: 'Invalid friend request.' })
    }
    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Request status must be accepted or rejected.' })
    }

    try {
        const request = await Friendship.findOne({
            _id: requestId,
            recipient: req.user.userId,
            status: 'pending'
        })
        if (!request) return res.status(404).json({ success: false, message: 'Friend request not found.' })

        request.status = status
        await request.save()
        return res.json({ success: true, status: request.status })
    } catch (error) {
        console.error('Failed to update friend request:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to update friend request.' })
    }
})

export default router
