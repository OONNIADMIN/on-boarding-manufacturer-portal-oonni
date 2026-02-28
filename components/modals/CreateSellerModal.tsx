'use client'

import { useState, FormEvent } from 'react'
import { authAPI } from '@/lib/api'
import { CreateUserRequest } from '@/types'
import styles from './CreateSellerModal.module.scss'

interface CreateSellerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CreateSellerModal({ isOpen, onClose, onSuccess }: CreateSellerModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setIsLoading(true)

    try {
      const token = authAPI.getToken()
      
      if (!token) {
        throw new Error('No authentication token. Please login again.')
      }

      // Use new invitation endpoint
      await authAPI.inviteManufacturer(token, {
        name,
        email
      })

      // Show success message
      setSuccessMessage(`Invitation sent to ${email}! They will receive an email to set their password.`)
      
      // Reset form after a short delay
      setTimeout(() => {
        setName('')
        setEmail('')
        setError('')
        setSuccessMessage('')
        onSuccess()
        onClose()
      }, 2000)
      
    } catch (err: any) {
      setError(err.message || 'Failed to invite manufacturer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setName('')
      setEmail('')
      setError('')
      setSuccessMessage('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Create New Seller</h2>
          <button 
            className={styles.closeButton} 
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.error}>
              <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {successMessage && (
            <div className={styles.success}>
              <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {successMessage}
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.label}>
              Full Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={styles.input}
              placeholder="John Doe"
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email Address *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="manufacturer@company.com"
              disabled={isLoading}
            />
            <p className={styles.hint}>An invitation email will be sent to this address</p>
          </div>

          <div className={styles.infoBox}>
            <svg className={styles.infoIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>The manufacturer will receive an email invitation to set their own password and activate their account.</p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={styles.submitButton}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner}></span>
                  Sending Invitation...
                </>
              ) : (
                'Send Invitation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

