import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const router = express.Router()
const JWT_EXPIRES_IN = '7d'

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function buildUserResponse(user) {
    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email
    }
}

function createToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

router.post('/signup', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    const email = normalizeEmail(req.body?.email)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    if (!username || username.length < 3) {
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long.' })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'A valid email address is required.' })
    }

    if (!password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' })
    }

    try {
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'An account with that email already exists.' })
        }

        const passwordHash = await bcrypt.hash(password, 12)
        const newUser = await User.create({ username, email, passwordHash })
        const token = createToken(newUser._id)

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: buildUserResponse(newUser)
        })
    } catch (error) {
        console.error('Signup failed:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to create the account.' })
    }
})

router.post('/signin', async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'A valid email address is required.' })
    }

    if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required.' })
    }

    try {
        const user = await User.findOne({ email })
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' })
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash)
        if (!isPasswordCorrect) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' })
        }

        const token = createToken(user._id)

        return res.json({
            success: true,
            message: 'Signed in successfully',
            token,
            user: buildUserResponse(user)
        })
    } catch (error) {
        console.error('Signin failed:', error.message)
        return res.status(500).json({ success: false, message: 'Failed to sign in.' })
    }
})

export default router
