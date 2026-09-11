import mongoose from 'mongoose'

const friendshipSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pairKey: {
        type: String,
        required: true,
        unique: true,
        immutable: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
        required: true
    }
}, { timestamps: true })

friendshipSchema.index({ sender: 1, recipient: 1 }, { unique: true })
friendshipSchema.index({ recipient: 1, status: 1, createdAt: -1 })
friendshipSchema.index({ sender: 1, status: 1, createdAt: -1 })

const Friendship = mongoose.model('Friendship', friendshipSchema)

export default Friendship
