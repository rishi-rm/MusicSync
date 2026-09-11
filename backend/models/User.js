import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 40
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator(value) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            },
            message: 'Please provide a valid email address.'
        }
    },
    listenerId: {
        type: String,
        match: /^\d{5}$/,
        unique: true,
        sparse: true,
        immutable: true
    },
    passwordHash: {
        type: String,
        required: true
    }
}, { timestamps: true })

const User = mongoose.model('User', userSchema)

export default User
