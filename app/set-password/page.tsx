'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authAPI } from '@/lib/api'
import styles from './page.module.scss'

function SetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [invitationData, setInvitationData] = useState<{
    valid: boolean
    email?: string
    name?: string
    expired: boolean
    message?: string
  } | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('Invalid invitation link. No token provided.')
        setIsVerifying(false)
        return
      }

      try {
        const result = await authAPI.verifyInvitation(token)
        setInvitationData(result)
        
        if (!result.valid) {
          setError(result.message || 'Invalid or expired invitation token')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to verify invitation token')
      } finally {
        setIsVerifying(false)
      }
    }

    verifyToken()
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!token) {
      setError('Invalid invitation token')
      return
    }

    setIsLoading(true)

    try {
      const response = await authAPI.setPassword({ token, password })
      
      // User is now automatically logged in
      // Redirect based on role
      if (authAPI.isAdmin(response.user)) {
        router.push('/dashboard')
      } else {
        router.push('/onboard')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isVerifying) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.loadingContainer}>
              <span className={styles.spinner}></span>
              <p>Verifying invitation...</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!invitationData?.valid) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.header}>
              <div className={styles.errorIconLarge}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                  />
                </svg>
              </div>
              <h1 className={styles.title}>Invalid Invitation</h1>
              <p className={styles.subtitle}>
                {invitationData?.expired 
                  ? 'This invitation has expired.' 
                  : error || 'This invitation link is invalid or has already been used.'}
              </p>
            </div>
            
            <div className={styles.footer}>
              <p className={styles.footerText}>
                Please contact your administrator for a new invitation.
              </p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Welcome to Oonni!</h1>
            <p className={styles.subtitle}>
              Hi <strong>{invitationData.name}</strong>, please set your password to continue
            </p>
            {invitationData.email && (
              <p className={styles.email}>{invitationData.email}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.error}>
                <svg 
                  className={styles.errorIcon} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                  />
                </svg>
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
                placeholder="••••••••"
                disabled={isLoading}
                minLength={8}
              />
              <p className={styles.hint}>Must be at least 8 characters</p>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword" className={styles.label}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={styles.input}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={styles.submitButton}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner}></span>
                  Setting password...
                </>
              ) : (
                'Set Password & Continue'
              )}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Powered by Oonni Platform
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.loadingContainer}>
              <span className={styles.spinner}></span>
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </main>
    }>
      <SetPasswordContent />
    </Suspense>
  )
}

