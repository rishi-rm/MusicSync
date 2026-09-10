import { useMemo, useState } from 'react'
import { signIn, signUp } from '../api.js'

function validateSignUp({ username, email, password, confirmPassword }) {
    if (!username.trim()) return 'Username is required.'
    if (username.trim().length < 3) return 'Username must be at least 3 characters long.'
    if (!email.trim()) return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email.'
    if (!password) return 'Password is required.'
    if (password.length < 8) return 'Password must be at least 8 characters long.'
    if (!confirmPassword) return 'Please confirm your password.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    return ''
}

function validateSignIn({ email, password }) {
    if (!email.trim()) return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email.'
    if (!password) return 'Password is required.'
    return ''
}

export default function AuthScreen({ onAuthenticated }) {
    const [mode, setMode] = useState('signin')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const submitLabel = useMemo(() => {
        if (loading) return mode === 'signin' ? 'Signing in...' : 'Creating account...'
        return mode === 'signin' ? 'Sign In' : 'Create Account'
    }, [loading, mode])

    async function handleSubmit(event) {
        event.preventDefault()
        setError('')

        const validationError = mode === 'signin'
            ? validateSignIn({ email, password })
            : validateSignUp({ username, email, password, confirmPassword })

        if (validationError) {
            setError(validationError)
            return
        }

        setLoading(true)

        try {
            const authResponse = mode === 'signin'
                ? await signIn({ email, password })
                : await signUp({ username, email, password })

            onAuthenticated(authResponse)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to complete authentication.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="auth-screen">
            <div className="auth-card">
                <div className="brand-lockup auth-brand" aria-label="Harmo branding">
                    <span className="brand-mark" aria-hidden="true">◒</span>
                    <div>
                        <p className="brand-name">Harmo</p>
                        <p className="brand-tagline">Listen together.</p>
                    </div>
                </div>

                <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
                    <button
                        type="button"
                        className={mode === 'signin' ? 'active' : ''}
                        onClick={() => setMode('signin')}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        className={mode === 'signup' ? 'active' : ''}
                        onClick={() => setMode('signup')}
                    >
                        Sign Up
                    </button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    {mode === 'signup' && (
                        <label className="form-field auth-field">
                            <span>Username</span>
                            <input
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder="Rishabh"
                                autoComplete="username"
                            />
                        </label>
                    )}

                    <label className="form-field auth-field">
                        <span>Email</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="name@example.com"
                            autoComplete="email"
                        />
                    </label>

                    <label className="form-field auth-field">
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={mode === 'signin' ? 'Enter your password' : 'Create a strong password'}
                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        />
                    </label>

                    {mode === 'signup' && (
                        <label className="form-field auth-field">
                            <span>Confirm Password</span>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                placeholder="Repeat your password"
                                autoComplete="new-password"
                            />
                        </label>
                    )}

                    {error && <p className="state-message error-message auth-error">{error}</p>}

                    <button className="primary-button auth-submit" type="submit" disabled={loading}>
                        {submitLabel}
                    </button>
                </form>

                <p className="auth-switch">
                    {mode === 'signin' ? 'Don’t have an account?' : 'Already have an account?'}
                    <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                        {mode === 'signin' ? 'Create Account' : 'Sign In'}
                    </button>
                </p>
            </div>
        </main>
    )
}
