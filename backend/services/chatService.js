import mongoose from 'mongoose'
import Conversation from '../models/Conversation.js'
import Friendship from '../models/Friendship.js'
import Message from '../models/Message.js'

export function buildParticipantKey(firstUserId, secondUserId) {
    return [firstUserId.toString(), secondUserId.toString()].sort().join(':')
}

export async function areAcceptedFriends(firstUserId, secondUserId) {
    return Friendship.exists({
        status: 'accepted',
        $or: [
            { pairKey: buildParticipantKey(firstUserId, secondUserId) },
            { sender: firstUserId, recipient: secondUserId },
            { sender: secondUserId, recipient: firstUserId }
        ]
    })
}

export async function getOrCreateConversation(firstUserId, secondUserId) {
    if (!mongoose.Types.ObjectId.isValid(firstUserId) || !mongoose.Types.ObjectId.isValid(secondUserId)) {
        const error = new Error('Invalid conversation participant.')
        error.statusCode = 400
        throw error
    }

    if (firstUserId.toString() === secondUserId.toString()) {
        const error = new Error('You cannot start a conversation with yourself.')
        error.statusCode = 400
        throw error
    }

    if (!(await areAcceptedFriends(firstUserId, secondUserId))) {
        const error = new Error('You can only message accepted friends.')
        error.statusCode = 403
        throw error
    }

    const participantKey = buildParticipantKey(firstUserId, secondUserId)
    try {
        return await Conversation.findOneAndUpdate(
            { participantKey },
            {
                $setOnInsert: {
                    participantKey,
                    participants: [firstUserId, secondUserId]
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        )
    } catch (error) {
        if (error?.code !== 11000) throw error
        return Conversation.findOne({ participantKey })
    }
}

export async function getConversationForUser(conversationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        const error = new Error('Invalid conversation ID.')
        error.statusCode = 400
        throw error
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
    })
    if (!conversation) {
        const error = new Error('Conversation not found.')
        error.statusCode = 404
        throw error
    }

    const otherUserId = conversation.participants.find((participant) => participant.toString() !== userId.toString())
    if (!otherUserId || !(await areAcceptedFriends(userId, otherUserId))) {
        const error = new Error('Conversation access requires an accepted friendship.')
        error.statusCode = 403
        throw error
    }

    return conversation
}

export async function createMessage(conversationId, senderId, content) {
    const conversation = await getConversationForUser(conversationId, senderId)
    const message = await Message.create({ conversation: conversation._id, sender: senderId, content })

    conversation.lastMessage = {
        content: message.content,
        sender: senderId,
        createdAt: message.createdAt
    }
    conversation.updatedAt = message.createdAt
    await conversation.save()

    return message.populate('sender', 'username listenerId')
}
