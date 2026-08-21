'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { authAPI, manufacturerAPI } from '@/lib/api'
import { passwordPolicyError } from '@/lib/password-policy'
import { User, ManufacturerListItem } from '@/types'
import { Header } from '@/components'
import styles from './page.module.scss'

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function isActiveUser(user: User): boolean {
  return Number(user.is_active) === 1
}

export default function ManufacturersPage() {
  const [user, setUser] = useState<User | null>(null)
  const [manufacturers, setManufacturers] = useState<ManufacturerListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState<ManufacturerListItem | null>(null)
  const [manufacturerUsers, setManufacturerUsers] = useState<User[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [showUsersModal, setShowUsersModal] = useState(false)
  const [resendingUserId, setResendingUserId] = useState<number | null>(null)
  const [resendMessage, setResendMessage] = useState('')
  const [activatingUserId, setActivatingUserId] = useState<number | null>(null)
  const [activatePassword, setActivatePassword] = useState('')
  const [activateConfirm, setActivateConfirm] = useState('')
  const [activateSubmitting, setActivateSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in and is admin
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()

    if (!token || !storedUser) {
      router.push('/login')
      return
    }

    if (!authAPI.isAdmin(storedUser)) {
      router.push('/catalogs')
      return
    }

    setUser(storedUser)
    loadManufacturers(token)
  }, [router])

  const loadManufacturers = async (token: string) => {
    try {
      setIsLoading(true)
      setError('')
      const data = await manufacturerAPI.getManufacturers(token)
      setManufacturers(asList<ManufacturerListItem>(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manufacturers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNavigateToProfile = () => {
    router.push('/profile')
  }

  const handleNavigateToDashboard = () => {
    router.push('/dashboard')
  }

  const handleManufacturerClick = async (manufacturer: ManufacturerListItem) => {
    const token = authAPI.getToken()
    if (!token) return

    setSelectedManufacturer(manufacturer)
    setManufacturerUsers([])
    setUsersError('')
    setResendMessage('')
    resetActivateForm()
    setShowUsersModal(true)
    
    try {
      setIsLoadingUsers(true)
      const users = await manufacturerAPI.getManufacturerUsers(token, manufacturer.id)
      setManufacturerUsers(asList<User>(users))
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users')
      setManufacturerUsers([])
    } finally {
      setIsLoadingUsers(false)
    }
  }

  const handleCloseUsersModal = () => {
    setShowUsersModal(false)
    setSelectedManufacturer(null)
    setManufacturerUsers([])
    setUsersError('')
    setResendMessage('')
    setResendingUserId(null)
    resetActivateForm()
  }

  const resetActivateForm = () => {
    setActivatingUserId(null)
    setActivatePassword('')
    setActivateConfirm('')
    setActivateSubmitting(false)
  }

  const handleResendInvitation = async (userId: number) => {
    const token = authAPI.getToken()
    if (!token || !selectedManufacturer) return

    setResendingUserId(userId)
    setResendMessage('')
    setUsersError('')
    try {
      await authAPI.resendInvitation(token, userId)
      setResendMessage('Invitation email resent successfully.')
      const users = await manufacturerAPI.getManufacturerUsers(token, selectedManufacturer.id)
      setManufacturerUsers(asList<User>(users))
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to resend invitation')
    } finally {
      setResendingUserId(null)
    }
  }

  const handleOpenActivateForm = (userId: number) => {
    setUsersError('')
    setResendMessage('')
    setActivatingUserId(userId)
    setActivatePassword('')
    setActivateConfirm('')
  }

  const handleActivateUser = async (userId: number) => {
    const token = authAPI.getToken()
    if (!token || !selectedManufacturer) return

    const policyError = passwordPolicyError(activatePassword)
    if (policyError) {
      setUsersError(policyError)
      return
    }
    if (activatePassword !== activateConfirm) {
      setUsersError('Passwords do not match')
      return
    }

    setActivateSubmitting(true)
    setUsersError('')
    setResendMessage('')
    try {
      await authAPI.activateUser(token, userId, activatePassword)
      setResendMessage('User activated. They can now log in with the password you set.')
      resetActivateForm()
      const users = await manufacturerAPI.getManufacturerUsers(token, selectedManufacturer.id)
      setManufacturerUsers(asList<User>(users))
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to activate user')
    } finally {
      setActivateSubmitting(false)
    }
  }

  useEffect(() => {
    if (!showUsersModal) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showUsersModal])

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const usersModal =
    showUsersModal && selectedManufacturer ? (
            <div
              className={styles.modalOverlay}
              onClick={(e) => {
                if (e.target === e.currentTarget) handleCloseUsersModal()
              }}
            >
              <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>
                    Users for {selectedManufacturer.name}
                  </h2>
                  <button 
                    className={styles.closeButton}
                    onClick={handleCloseUsersModal}
                    aria-label="Close modal"
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className={styles.modalBody}>
                  {isLoadingUsers ? (
                    <div className={styles.loadingState}>
                      <div className={styles.spinner}></div>
                      <p>Loading users...</p>
                    </div>
                  ) : manufacturerUsers.length === 0 && usersError ? (
                    <div className={styles.errorState}>
                      <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>{usersError}</p>
                    </div>
                  ) : manufacturerUsers.length === 0 ? (
                    <div className={styles.emptyState}>
                      <svg className={styles.emptyIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      <h3>No Users Found</h3>
                      <p>No users are currently associated with this manufacturer.</p>
                    </div>
                  ) : (
                    <div className={styles.usersList}>
                      {resendMessage && (
                        <div className={styles.resendSuccess}>
                          {resendMessage}
                        </div>
                      )}
                      {usersError && (
                        <div className={styles.usersActionError}>
                          {usersError}
                        </div>
                      )}
                      {manufacturerUsers.map((mfrUser) => {
                        const isActive = isActiveUser(mfrUser)
                        return (
                        <div key={mfrUser.id} className={styles.userCard}>
                          <div className={styles.userCardMain}>
                            <div className={styles.userInfo}>
                              <h4 className={styles.userName}>{mfrUser.name}</h4>
                              <p className={styles.userEmail}>{mfrUser.email}</p>
                              <span className={styles.userRole}>{mfrUser.role?.name || 'No role'}</span>
                              {mfrUser.pending_invitation && (
                                <span className={styles.pendingBadge}>Invitation pending</span>
                              )}
                            </div>
                            <div className={styles.userActions}>
                              <button
                                type="button"
                                className={styles.resendButton}
                                onClick={(e) => { e.stopPropagation(); handleResendInvitation(mfrUser.id); }}
                                disabled={resendingUserId !== null}
                                title="Resend invitation email"
                              >
                                {resendingUserId === mfrUser.id ? (
                                  <span className={styles.resendButtonSpinner} />
                                ) : (
                                  <>
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className={styles.resendIcon}>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Resend email
                                  </>
                                )}
                              </button>
                              <span className={`${styles.statusBadge} ${isActive ? styles.active : styles.inactive}`}>
                                {isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                          {activatingUserId !== mfrUser.id && (
                            <button
                              type="button"
                              className={styles.activateButton}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleOpenActivateForm(mfrUser.id)
                              }}
                              disabled={activateSubmitting}
                            >
                              Activate & set password
                            </button>
                          )}
                          {activatingUserId === mfrUser.id && (
                            <form
                              className={styles.activateForm}
                              onSubmit={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleActivateUser(mfrUser.id)
                              }}
                            >
                              <p className={styles.activateFormHint}>
                                Set a password to activate this account. The user will be able to log in immediately.
                              </p>
                              <div className={styles.activateFields}>
                                <input
                                  type="password"
                                  className={styles.activateInput}
                                  placeholder="New password (letters and numbers)"
                                  value={activatePassword}
                                  onChange={(e) => setActivatePassword(e.target.value)}
                                  autoComplete="new-password"
                                  minLength={8}
                                  required
                                />
                                <input
                                  type="password"
                                  className={styles.activateInput}
                                  placeholder="Confirm password"
                                  value={activateConfirm}
                                  onChange={(e) => setActivateConfirm(e.target.value)}
                                  autoComplete="new-password"
                                  minLength={8}
                                  required
                                />
                              </div>
                              <div className={styles.activateFormActions}>
                                <button
                                  type="button"
                                  className={styles.activateCancel}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    resetActivateForm()
                                  }}
                                  disabled={activateSubmitting}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className={styles.activateSubmit}
                                  disabled={activateSubmitting}
                                >
                                  {activateSubmitting ? 'Activating...' : 'Activate user'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
    ) : null

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <Header
          subtitle="Manage manufacturer accounts"
          user={user}
          showNavigation={true}
          currentPage="manufacturers"
        />

        <div className={styles.content}>
          {/* Back to Dashboard */}
          <div className={styles.backButton}>
            <button 
              onClick={handleNavigateToDashboard}
              className={styles.backBtn}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className={styles.errorMessage}>
              <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Manufacturers List */}
          <section className={styles.manufacturersSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Manufacturer Accounts</h2>
              <p className={styles.sectionDescription}>
                View and manage all manufacturer accounts on the platform
              </p>
            </div>

            {manufacturers.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className={styles.emptyTitle}>No Manufacturers Found</h3>
                <p className={styles.emptyDescription}>
                  No manufacturer accounts have been created yet. Create the first manufacturer from the dashboard.
                </p>
              </div>
            ) : (
              <div className={styles.manufacturersGrid}>
                {manufacturers.map((manufacturer) => (
                  <div 
                    key={manufacturer.id} 
                    className={styles.manufacturerCard}
                    onClick={() => handleManufacturerClick(manufacturer)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleManufacturerClick(manufacturer)
                      }
                    }}
                  >
                    <div className={styles.manufacturerThumbnail}>
                      {manufacturer.thumbnail ? (
                        <img 
                          src={manufacturer.thumbnail} 
                          alt={manufacturer.name}
                          className={styles.thumbnailImage}
                        />
                      ) : (
                        <div className={styles.placeholderThumbnail}>
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className={styles.manufacturerInfo}>
                      <h3 className={styles.manufacturerName}>{manufacturer.name}</h3>
                      <p className={styles.manufacturerSlug}>@{manufacturer.slug}</p>
                      <p className={styles.clickHint}>Click to view users</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {typeof document !== 'undefined' && usersModal
            ? createPortal(usersModal, document.body)
            : null}
        </div>
      </div>
    </main>
  )
}
