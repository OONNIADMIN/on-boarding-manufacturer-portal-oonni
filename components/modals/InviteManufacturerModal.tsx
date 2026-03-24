'use client'

import { useState, FormEvent, useEffect, useMemo } from 'react'
import { authAPI, manufacturerAPI } from '@/lib/api'
import { Manufacturer } from '@/types/manufacturer'
import styles from './InviteManufacturerModal.module.scss'

interface InviteManufacturerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Step = 'select-manufacturer' | 'send-invite'

export default function InviteManufacturerModal({ isOpen, onClose, onSuccess }: InviteManufacturerModalProps) {
  const [step, setStep] = useState<Step>('select-manufacturer')
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [isLoadingManufacturers, setIsLoadingManufacturers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState<Manufacturer | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  
  // Form state
  const [manufacturerName, setManufacturerName] = useState('')
  const [email, setEmail] = useState('')
  const [userName, setUserName] = useState('')
  
  // UI state
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Load manufacturers on mount
  useEffect(() => {
    if (isOpen && step === 'select-manufacturer') {
      loadManufacturers()
    }
  }, [isOpen, step])

  const loadManufacturers = async () => {
    setIsLoadingManufacturers(true)
    setError('')
    try {
      const token = authAPI.getToken()
      if (!token) {
        throw new Error('No authentication token')
      }
      const data = await manufacturerAPI.getAllManufacturers(token)
      setManufacturers(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load manufacturers')
    } finally {
      setIsLoadingManufacturers(false)
    }
  }

  // Filter manufacturers based on search query
  const filteredManufacturers = useMemo(() => {
    if (!searchQuery.trim()) return manufacturers
    const query = searchQuery.toLowerCase()
    return manufacturers.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.slug.toLowerCase().includes(query)
    )
  }, [manufacturers, searchQuery])

  const handleSelectManufacturer = (manufacturer: Manufacturer) => {
    setSelectedManufacturer(manufacturer)
    setUserName('') // Reset user name when selecting existing manufacturer
    setStep('send-invite')
  }

  const handleCreateNew = () => {
    setIsCreatingNew(true)
    setSelectedManufacturer(null)
  }

  const handleCreateManufacturer = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const token = authAPI.getToken()
      if (!token) {
        throw new Error('No authentication token')
      }

      // Generate slug from manufacturer name (match server slugify: no leading/trailing hyphens)
      const slug = manufacturerName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .trim()

      const newManufacturer = await manufacturerAPI.createManufacturer(token, {
        name: manufacturerName,
        slug,
      })

      setSelectedManufacturer(newManufacturer)
      setIsCreatingNew(false)
      setStep('send-invite')
    } catch (err: any) {
      setError(err.message || 'Failed to create manufacturer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendInvite = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const token = authAPI.getToken()
      if (!token) {
        throw new Error('No authentication token')
      }

      await authAPI.inviteManufacturer(token, {
        email,
        name: userName,
        manufacturer_id: selectedManufacturer?.id,
      })

      setSuccessMessage(`Invitation sent to ${email}!`)
      
      // Reset and close after success
      setTimeout(() => {
        resetForm()
        onSuccess()
        onClose()
      }, 2000)
      
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'send-invite') {
      setStep('select-manufacturer')
      setEmail('')
      setUserName('')
      setError('')
      setIsCreatingNew(false)
    }
  }

  const resetForm = () => {
    setStep('select-manufacturer')
    setSearchQuery('')
    setSelectedManufacturer(null)
    setIsCreatingNew(false)
    setManufacturerName('')
    setEmail('')
    setUserName('')
    setError('')
    setSuccessMessage('')
  }

  const handleClose = () => {
    if (!isLoading) {
      resetForm()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {step === 'select-manufacturer' 
              ? (isCreatingNew ? 'Create New Manufacturer' : 'Select Manufacturer')
              : 'Send Invitation'}
          </h2>
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

        {/* Step 1: Select or Create Manufacturer */}
        {step === 'select-manufacturer' && !isCreatingNew && (
          <div className={styles.content}>
            <div className={styles.searchBox}>
              <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search manufacturers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {isLoadingManufacturers ? (
              <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Loading manufacturers...</p>
              </div>
            ) : (
              <>
                <div className={styles.manufacturerList}>
                  {filteredManufacturers.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No manufacturers found</p>
                    </div>
                  ) : (
                    filteredManufacturers.map((manufacturer) => (
                      <button
                        key={manufacturer.id}
                        className={styles.manufacturerItem}
                        onClick={() => handleSelectManufacturer(manufacturer)}
                      >
                        <div className={styles.manufacturerInfo}>
                          <h3>{manufacturer.name}</h3>
                          <p className={styles.slug}>{manufacturer.slug}</p>
                        </div>
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))
                  )}
                </div>

                <button
                  className={styles.createNewButton}
                  onClick={handleCreateNew}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Manufacturer
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 1b: Create New Manufacturer */}
        {step === 'select-manufacturer' && isCreatingNew && (
          <form onSubmit={handleCreateManufacturer} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="manufacturerName" className={styles.label}>
                Manufacturer Name *
              </label>
              <input
                id="manufacturerName"
                type="text"
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
                required
                className={styles.input}
                placeholder="e.g., Acme Corporation"
                disabled={isLoading}
              />
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                disabled={isLoading}
                className={styles.cancelButton}
              >
                Back to List
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={styles.submitButton}
              >
                {isLoading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Creating...
                  </>
                ) : (
                  'Create & Continue'
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Send Invitation */}
        {step === 'send-invite' && (
          <form onSubmit={handleSendInvite} className={styles.form}>
            <div className={styles.selectedManufacturer}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <div>
                <p className={styles.selectedLabel}>Selected Manufacturer</p>
                <p className={styles.selectedName}>{selectedManufacturer?.name}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="userName" className={styles.label}>
                User Full Name *
              </label>
              <input
                id="userName"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
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
                placeholder="user@company.com"
                disabled={isLoading}
              />
              <p className={styles.hint}>An invitation email will be sent to this address</p>
            </div>

            <div className={styles.infoBox}>
              <svg className={styles.infoIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>The user will receive an email invitation to set their password and access the platform.</p>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={handleBack}
                disabled={isLoading}
                className={styles.cancelButton}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={styles.submitButton}
              >
                {isLoading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

