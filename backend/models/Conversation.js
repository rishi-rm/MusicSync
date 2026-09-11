import mongoose from 'mongoose'

const conversationSchema = new mongoose.Schema({
    participantKey: {
        type: String,
        required: true,
        unique: true,
        immutable: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        content: { type: String, default: '' },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date }
    }
}, { timestamps: true })

conversationSchema.index({ participants: 1, updatedAt: -1 })
conversationSchema.index({ 'lastMessage.createdAt': -1 })

const Conversation = mongoose.model('Conversation', conversationSchema)

export default Conversation
