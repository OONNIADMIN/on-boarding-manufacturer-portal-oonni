'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI, statsAPI } from '@/lib/api'
import { User } from '@/types'
import { Header } from '@/components'
import { InviteManufacturerModal } from '@/components/modals'
// Removed ImageUpload and ImageList imports - admins should not upload assets
import styles from './page.module.scss'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [stats, setStats] = useState<{
    totalManufacturers: number
    totalUsers: number
    totalCatalogs: number
    totalImages: number
    recentActivity: {
      newManufacturers: number
      newUsers: number
      newCatalogs: number
      newImages: number
    }
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  // Removed imageUploadSuccess state - admins don't upload images
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
    setIsLoading(false)
    loadStats(token)
  }, [router])

  const loadStats = async (token: string) => {
    try {
      setStatsLoading(true)
      setStatsError('')
      const data = await statsAPI.getPlatformStats(token)
      setStats(data)
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setStatsLoading(false)
    }
  }

  const handleLogout = () => {
    authAPI.logout()
    router.push('/login')
  }

  const handleNavigateToCatalogs = () => {
    router.push('/catalogs')
  }

  const handleNavigateToProfile = () => {
    router.push('/profile')
  }

  const handleNavigateToManufacturers = () => {
    router.push('/manufacturers')
  }

  const handleNavigateToImages = () => {
    router.push('/images')
  }

  const handleCreateManufacturerSuccess = () => {
    setSuccessMessage('Manufacturer created successfully!')
    setTimeout(() => setSuccessMessage(''), 5000)
  }

  // Removed handleImageUploadSuccess - admins don't upload images

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
          title="Admin Dashboard"
          subtitle={`Welcome back, ${user.name}`}
          user={user}
          showNavigation={true}
          currentPage="dashboard"
        />

        <div className={styles.content}>

        {/* Success Message */}
        {successMessage && (
          <div className={styles.successMessage}>
            <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMessage}
          </div>
        )}

        {/* Removed image upload success message - admins don't upload images */}

        {/* Dashboard Cards Grid */}
        <section className={styles.dashboardGrid}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Admin Dashboard</h2>
            <p className={styles.sectionDescription}>
              Manage manufacturers and monitor platform activity. Asset uploads are handled by manufacturers.
            </p>
          </div>
          
          <div className={styles.cardsGrid}>
            {/* 1. Create Manufacturer Card */}
            <div className={styles.dashboardCard}>
              <button 
                onClick={() => setIsModalOpen(true)}
                className={styles.cardButton}
              >
                <div className={styles.cardIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" 
                    />
                  </svg>
                </div>
                <h3 className={styles.cardTitle}>Create Manufacturer</h3>
                <p className={styles.cardDescription}>
                  Add a new manufacturer to the platform
                </p>
              </button>
            </div>

            {/* 4. Images Management Card */}
            <div className={styles.dashboardCard}>
              <div 
                className={styles.cardButton}
                onClick={handleNavigateToCatalogs}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleNavigateToCatalogs()
                  }
                }}
              >
                <div className={styles.cardIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className={styles.cardTitle}>Manage Catalogs</h3>
                <p className={styles.cardDescription}>
                  View and manage all uploaded catalogs across manufacturers
                </p>
              </div>
            </div>

            {/* 4. Images Management Card */}
            <div className={styles.dashboardCard}>
                <div 
                className={styles.cardButton}
                onClick={handleNavigateToImages}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleNavigateToImages()
                  }
                }}
              >
                <div className={styles.cardIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className={styles.cardTitle}>Manage Images</h3>
                <p className={styles.cardDescription}>
                  View and manage all uploaded images across manufacturers
                </p>
              </div>
            </div>

            {/* 2. Statistics Card */}
            <div className={styles.dashboardCard}>
              <div 
                className={styles.statsCard}
                onClick={() => router.push('/statistics')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    router.push('/statistics')
                  }
                }}
              >
                <div className={styles.statsHeader}>
                  <div className={styles.statsIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className={styles.statsTitle}>Platform Statistics</h3>
                </div>
                
                {statsLoading ? (
                  <div className={styles.statsLoading}>
                    <div className={styles.spinner}></div>
                    <p>Loading statistics...</p>
                  </div>
                ) : statsError ? (
                  <div className={styles.statsError}>
                    <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>{statsError}</p>
                  </div>
                ) : stats ? (
                  <div className={styles.statsContent}>
                    <div className={styles.statsGrid}>
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{stats.totalManufacturers}</div>
                        <div className={styles.statLabel}>Manufacturers</div>
                        {stats.recentActivity.newManufacturers > 0 && (
                          <div className={styles.statChange}>
                            +{stats.recentActivity.newManufacturers} this week
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{stats.totalUsers}</div>
                        <div className={styles.statLabel}>Total Users</div>
                        {stats.recentActivity.newUsers > 0 && (
                          <div className={styles.statChange}>
                            +{stats.recentActivity.newUsers} this week
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{stats.totalCatalogs}</div>
                        <div className={styles.statLabel}>Catalogs</div>
                        {stats.recentActivity.newCatalogs > 0 && (
                          <div className={styles.statChange}>
                            +{stats.recentActivity.newCatalogs} this week
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{stats.totalImages}</div>
                        <div className={styles.statLabel}>Images</div>
                        {stats.recentActivity.newImages > 0 && (
                          <div className={styles.statChange}>
                            +{stats.recentActivity.newImages} this week
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.statsFooter}>
                      <p>Click to view detailed statistics</p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.statsEmpty}>
                    <p>No statistics available</p>
                  </div>
                )}
              </div>
            </div>

            
            {/* 3. Manage Manufacturers Card */}
            <div className={styles.dashboardCard}>
              <div 
                className={styles.cardButton}
                onClick={handleNavigateToManufacturers}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleNavigateToManufacturers()
                  }
                }}
              >
                <div className={styles.cardIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className={styles.cardTitle}>Manage Manufacturers</h3>
                <p className={styles.cardDescription}>
                  View and manage all manufacturer accounts
                </p>
              </div>
            </div>

            
          </div>
        </section>


          {/* Invite Manufacturer Modal */}
          <InviteManufacturerModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={handleCreateManufacturerSuccess}
          />
        </div>
      </div>
    </main>
  )
}

