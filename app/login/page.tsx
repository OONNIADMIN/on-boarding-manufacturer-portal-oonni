'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'
import { LoginRequest } from '@/types'
import styles from './page.module.scss'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const credentials: LoginRequest = { email, password }
      const response = await authAPI.login(credentials)

      if (authAPI.isAdmin(response.user)) {
        router.push('/dashboard')
      } else {
        router.push('/onboard/template')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <img
            src="/logotype_oonni_2026.svg"
            alt="Oonni"
            className={styles.logo}
            width={374}
            height={150}
            fetchPriority="high"
          />
        </div>

        <div className={styles.loginCard}>
          <header className={styles.header}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Sign In To Continue To Your Account</p>
          </header>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.error} role="alert">
                <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
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
              <label htmlFor="email" className={styles.label}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.input}
                placeholder="Please enter your Username"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

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
                placeholder="Please enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" disabled={isLoading} className={styles.submitButton}>
              {isLoading ? (
                <>
                  <span className={styles.spinner} aria-hidden />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <footer className={styles.cardFooter}>
            <hr className={styles.footerRule} />
            <p className={styles.footerText}>Secure Login Powered By OONNI Integration</p>
          </footer>
        </div>
      </div>
    </main>
  )
}
