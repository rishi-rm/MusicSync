import crypto from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import Friendship from '../models/Friendship.js'
import Message from '../models/Message.js'
import Room from '../models/Room.js'
import Song from '../models/Song.js'
import User from '../models/User.js'
import Conversation from '../models/Conversation.js'
import { authenticateToken } from '../middleware/auth.js'
import { buildParticipantKey, getOrCreateConversation } from '../services/chatService.js'

const router = express.Router()
router.use(authenticateToken)

function serializeRoom(room) {
    return {
        id: room._id.toString(),
        roomCode: room.roomCode,
        owner: room.owner ? { id: room.owner._id?.toString?.() || room.owner.toString(), displayName: room.owner.username || 'Room owner' } : null,
        members: Array.isArray(room.members) ? room.members.map((member) => ({
            id: member?._id ? member._id.toString() : member.toString(),
            displayName: member?.username || 'Member'
        })) : [],
        memberCount: room.members?.length || 0,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        lastActivity: room.lastActivity || room.updatedAt,
        playback: room.playback ? {
            songId: room.playback.songId ? room.playback.songId.toString() : null,
            isPlaying: Boolean(room.playback.isPlaying),
            position: Number(room.playback.position) || 0,
            updatedAt: room.playback.updatedAt,
            startedAt: room.playback.startedAt || null
        } : {
            songId: null,
            isPlaying: false,
            position: 0,
            updatedAt: null,
            startedAt: null
        }
    }
}

async function ensureAcceptedRoomMembership(userId, roomId) {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
        const error = new Error('Invalid room ID.')
        error.statusCode = 400
        throw error
    }

    const room = await Room.findById(roomId)
    if (!room) {
        const error = new Error('Room not found.')
        error.statusCode = 404
        throw error
    }

    if (!room.members.some((memberId) => memberId.toString() === userId)) {
        const error = new Error('You are not a member of this room.')
        error.statusCode = 403
        throw error
    }

    return room
}

async function ensureAcceptedFriendship(userId, friendId) {
    const friendship = await Friendship.findOne({
        status: 'accepted',
        $or: [
            { sender: userId, recipient: friendId },
            { sender: friendId, recipient: userId }
        ]
    })

    if (!friendship) {
        const error = new Error('You can only invite accepted friends.')
        error.statusCode = 403
        throw error
    }

    return friendship
}

function generateRoomCode() {
    return `ROOM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

router.post('/', async (req, res) => {
    try {
        let roomCode = generateRoomCode()
        while (await Room.exists({ roomCode })) {
            roomCode = generateRoomCode()
        }

        const room = await Room.create({
            roomCode,
            owner: req.user.userId,
            members: [req.user.userId],
            lastActivity: new Date(),
            playback: {
                songId: null,
                isPlaying: false,
                position: 0,
                updatedAt: new Date()
            }
        })

        const populatedRoom = await Room.findById(room._id)
            .populate('owner', 'username listenerId')
            .populate('members', 'username listenerId')

        return res.status(201).json({ success: true, room: serializeRoom(populatedRoom) })
    } catch (error) {
        console.error('Failed to create room:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to create the room.' })
    }
})

router.get('/:roomId', async (req, res) => {
    try {
        const room = await ensureAcceptedRoomMembership(req.user.userId, req.params.roomId)
        const populatedRoom = await Room.findById(room._id)
            .populate('owner', 'username listenerId')
            .populate('members', 'username listenerId')

        return res.json({ success: true, room: serializeRoom(populatedRoom) })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to load room.' })
    }
})

router.get('/:roomId/playlist', async (req, res) => {
    try {
        const room = await ensureAcceptedRoomMembership(req.user.userId, req.params.roomId)
        const songs = await Song.find({ uploadedBy: { $in: room.members } })
            .populate('uploadedBy', 'username listenerId')
            .sort({ createdAt: -1 })

        const groups = new Map()
        for (const song of songs) {
            const userId = song.uploadedBy?._id?.toString?.() || song.uploadedBy?.toString?.() || ''
            if (!userId) continue
            const group = groups.get(userId) || {
                userId,
                displayName: song.uploadedBy?.username || 'Member',
                songs: []
            }
            group.songs.push({
                _id: song._id.toString(),
                title: song.title,
                artist: song.artist || 'Unknown Artist',
                album: song.album || null,
                uploadedBy: userId,
                uploadedByName: song.uploadedBy?.username || 'Member',
                isFavorite: Boolean(song.isFavorite),
                playCount: Number(song.playCount) || 0,
                createdAt: song.createdAt
            })
            groups.set(userId, group)
        }

        const playlist = [...groups.values()].map((group) => ({
            userId: group.userId,
            displayName: group.displayName,
            songs: group.songs.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        })).sort((left, right) => left.displayName.localeCompare(right.displayName))

        return res.json({ success: true, roomId: room._id.toString(), playlist })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to load room playlist.' })
    }
})

router.post('/:roomId/invite', async (req, res) => {
    const friendId = req.body?.friendId
    if (!mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ success: false, message: 'Invalid friend selection.' })
    }

    try {
        const room = await ensureAcceptedRoomMembership(req.user.userId, req.params.roomId)
        await ensureAcceptedFriendship(req.user.userId, friendId)

        const invitedUser = await User.findById(friendId)
        if (!invitedUser) {
            return res.status(404).json({ success: false, message: 'Friend not found.' })
        }

        if (room.members.some((memberId) => memberId.toString() === invitedUser._id.toString())) {
            return res.status(409).json({ success: false, message: 'This user is already in the room.' })
        }

        const conversation = await getOrCreateConversation(req.user.userId, invitedUser._id)
        const existingInvite = await Message.findOne({
            kind: 'room_invite',
            room: room._id,
            invitee: invitedUser._id,
            conversation: conversation._id
        })

        if (existingInvite) {
            return res.status(409).json({ success: false, message: 'This friend already has an active invite for this room.' })
        }

        const sender = await User.findById(req.user.userId, 'username')
        const inviteMessage = await Message.create({
            conversation: conversation._id,
            sender: req.user.userId,
            kind: 'room_invite',
            room: room._id,
            invitee: invitedUser._id,
            content: `${sender?.username || 'A friend'} invited you to join a room.`
        })

        conversation.lastMessage = {
            content: inviteMessage.content,
            sender: req.user.userId,
            createdAt: inviteMessage.createdAt
        }
        conversation.updatedAt = inviteMessage.createdAt
        await conversation.save()

        const plainMessage = inviteMessage.toObject()
        const recipientId = conversation.participants.find((participant) => participant.toString() !== req.user.userId)
        const io = req.app.get('io')
        io.to(`conversation:${conversation._id.toString()}`).emit('chat:message', plainMessage)
        if (recipientId) io.to(`user:${recipientId.toString()}`).emit('chat:message', plainMessage)

        return res.status(201).json({ success: true, message: plainMessage, room: serializeRoom(room) })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to invite that friend.' })
    }
})

router.post('/:roomId/join', async (req, res) => {
    const { messageId } = req.body || {}
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ success: false, message: 'Invalid room invitation.' })
    }

    try {
        const room = await Room.findById(req.params.roomId)
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found.' })
        }

        const invite = await Message.findOne({
            _id: messageId,
            kind: 'room_invite',
            room: room._id,
            invitee: req.user.userId
        })

        if (!invite) {
            return res.status(404).json({ success: false, message: 'This room invitation is invalid or expired.' })
        }

        if (!room.members.some((memberId) => memberId.toString() === req.user.userId)) {
            room.members.push(req.user.userId)
            room.lastActivity = new Date()
            await room.save()

            const io = req.app.get('io')
            io.to(`room:${room._id.toString()}`).emit('room:playlist_updated', {
                roomId: room._id.toString(),
                playlist: await buildRoomPlaylist(room)
            })
        }

        const populatedRoom = await Room.findById(room._id)
            .populate('owner', 'username listenerId')
            .populate('members', 'username listenerId')

        const io = req.app.get('io')
        io.to(`room:${populatedRoom._id.toString()}`).emit('room:members_updated', {
            roomId: populatedRoom._id.toString(),
            room: serializeRoom(populatedRoom)
        })

        return res.json({ success: true, room: serializeRoom(populatedRoom) })
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to join the room.' })
    }
})

async function buildRoomPlaylist(room) {
    const songs = await Song.find({ uploadedBy: { $in: room.members } })
        .populate('uploadedBy', 'username listenerId')
        .sort({ createdAt: -1 })

    const groups = new Map()
    for (const song of songs) {
        const userId = song.uploadedBy?._id?.toString?.() || song.uploadedBy?.toString?.() || ''
        if (!userId) continue
        const group = groups.get(userId) || { userId, displayName: song.uploadedBy?.username || 'Member', songs: [] }
        group.songs.push({
            _id: song._id.toString(),
            title: song.title,
            artist: song.artist || 'Unknown Artist',
            album: song.album || null,
            uploadedBy: userId,
            uploadedByName: song.uploadedBy?.username || 'Member',
            isFavorite: Boolean(song.isFavorite),
            playCount: Number(song.playCount) || 0,
            createdAt: song.createdAt
        })
        groups.set(userId, group)
    }

    return [...groups.values()]
        .map((group) => ({
            userId: group.userId,
            displayName: group.displayName,
            songs: group.songs.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

router.post('/:roomId/leave', async (req, res) => {
    try {
        const room = await ensureAcceptedRoomMembership(req.user.userId, req.params.roomId)
        if (room.owner.toString() === req.user.userId) {
            return res.status(400).json({ success: false, message: 'The room owner cannot leave until another owner is assigned.' })
        }

        room.members = room.members.filter((memberId) => memberId.toString() !== req.user.userId)
        room.lastActivity = new Date()
        await room.save()

        const io = req.app.get('io')
        io.to(`room:${room._id.toString()}`).emit('room:playlist_updated', {
            roomId: room._id.toString(),
            playlist: await buildRoomPlaylist(room)
        })

        return res.json({ success: true, room: serializeRoom(room) })
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to leave the room.' })
    }
})

export default router
