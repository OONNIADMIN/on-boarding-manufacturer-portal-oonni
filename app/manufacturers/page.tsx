'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI, manufacturerAPI } from '@/lib/api'
import { User, ManufacturerListItem } from '@/types'
import { Header } from '@/components'
import styles from './page.module.scss'

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
      setManufacturers(data)
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
    setShowUsersModal(true)
    setUsersError('')
    
    try {
      setIsLoadingUsers(true)
      const users = await manufacturerAPI.getManufacturerUsers(token, manufacturer.id)
      setManufacturerUsers(users)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users')
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
  }

  const handleResendInvitation = async (userId: number) => {
    const token = authAPI.getToken()
    if (!token || !selectedManufacturer) return

    setResendingUserId(userId)
    setResendMessage('')
    setUsersError('')
    try {
      await authAPI.resendInvitation(token, userId)
      setResendMessage('Correo de invitación reenviado correctamente.')
      const users = await manufacturerAPI.getManufacturerUsers(token, selectedManufacturer.id)
      setManufacturerUsers(users)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to resend invitation')
    } finally {
      setResendingUserId(null)
    }
  }

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

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <Header
          title="Manufacturers"
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

          {/* Users Modal */}
          {showUsersModal && selectedManufacturer && (
            <div className={styles.modalOverlay} onClick={handleCloseUsersModal}>
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
                  ) : usersError ? (
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
                      {manufacturerUsers.map((user) => (
                        <div key={user.id} className={styles.userCard}>
                          <div className={styles.userInfo}>
                            <h4 className={styles.userName}>{user.name}</h4>
                            <p className={styles.userEmail}>{user.email}</p>
                            <span className={styles.userRole}>{user.role?.name || 'No role'}</span>
                            {user.pending_invitation && (
                              <span className={styles.pendingBadge}>Invitación pendiente</span>
                            )}
                          </div>
                          <div className={styles.userActions}>
                            <button
                              type="button"
                              className={styles.resendButton}
                              onClick={(e) => { e.stopPropagation(); handleResendInvitation(user.id); }}
                              disabled={resendingUserId !== null}
                              title="Reenviar correo de invitación"
                            >
                              {resendingUserId === user.id ? (
                                <span className={styles.resendButtonSpinner} />
                              ) : (
                                <>
                                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className={styles.resendIcon}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  Reenviar correo
                                </>
                              )}
                            </button>
                            <span className={`${styles.statusBadge} ${user.is_active ? styles.active : styles.inactive}`}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
