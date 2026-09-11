import mongoose from 'mongoose'

const roomSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, immutable: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastActivity: { type: Date, default: Date.now, index: true },
    playback: {
        songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', default: null },
        isPlaying: { type: Boolean, default: false },
        position: { type: Number, default: 0 },
        updatedAt: { type: Date, default: Date.now },
        startedAt: { type: Date, default: null }
    }
}, { timestamps: true })

roomSchema.index({ members: 1, updatedAt: -1 })

const Room = mongoose.model('Room', roomSchema)

export default Room