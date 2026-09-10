import jwt from 'jsonwebtoken'

export function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Authentication required.' })
    }

    const [scheme, token] = authHeader.split(' ')

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Invalid authentication format.' })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
            return res.status(401).json({ success: false, message: 'Authentication failed.' })
        }

        req.user = { userId: decoded.userId }
        return next()
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Your session is invalid or expired.' })
    }
}
