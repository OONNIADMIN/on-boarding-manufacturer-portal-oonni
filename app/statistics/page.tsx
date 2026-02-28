'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import { authAPI, statsAPI } from '@/lib/api'
import { User } from '@/types'
import styles from './page.module.scss'

interface DetailedStats {
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
  monthlyStats: {
    manufacturers: number[]
    users: number[]
    catalogs: number[]
    images: number[]
  }
  topManufacturers: Array<{
    id: number
    name: string
    userCount: number
    catalogCount: number
  }>
  userDistribution: {
    admins: number
    manufacturers: number
    users: number
  }
}

export default function StatisticsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  useEffect(() => {
    const token = authAPI.getToken()
    if (!token) {
      router.push('/login')
      return
    }

    const storedUser = authAPI.getStoredUser()
    if (storedUser) {
      setUser(storedUser)
      setIsLoading(false)
      loadDetailedStats(token)
    } else {
      router.push('/login')
    }
  }, [router])

  const loadDetailedStats = async (token: string) => {
    try {
      setStatsLoading(true)
      setStatsError('')
      const data = await statsAPI.getDetailedStats(token)
      setStats(data)
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load detailed statistics')
    } finally {
      setStatsLoading(false)
    }
  }

  const handleLogout = () => {
    authAPI.logout()
    router.push('/login')
  }

  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={styles.main}>
      <Header 
        title="Platform Statistics"
        subtitle="Comprehensive analytics and insights"
        currentPage="statistics"
        user={user}
        onLogout={handleLogout}
      />
      
      <div className={styles.container}>
        <div className={styles.header}>
          <button 
            onClick={handleBackToDashboard}
            className={styles.backButton}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className={styles.title}>Platform Statistics</h1>
          <p className={styles.subtitle}>Comprehensive analytics and insights</p>
        </div>

        {statsLoading ? (
          <div className={styles.loadingSection}>
            <div className={styles.spinner}></div>
            <p>Loading detailed statistics...</p>
          </div>
        ) : statsError ? (
          <div className={styles.errorSection}>
            <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{statsError}</p>
          </div>
        ) : stats ? (
          <div className={styles.content}>
            {/* Key Metrics Overview */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Key Metrics</h2>
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className={styles.metricContent}>
                    <h3 className={styles.metricTitle}>Manufacturers</h3>
                    <div className={styles.metricValue}>{stats.totalManufacturers}</div>
                    {stats.recentActivity.newManufacturers > 0 && (
                      <div className={styles.metricChange}>
                        +{stats.recentActivity.newManufacturers} this week
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <div className={styles.metricContent}>
                    <h3 className={styles.metricTitle}>Total Users</h3>
                    <div className={styles.metricValue}>{stats.totalUsers}</div>
                    {stats.recentActivity.newUsers > 0 && (
                      <div className={styles.metricChange}>
                        +{stats.recentActivity.newUsers} this week
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className={styles.metricContent}>
                    <h3 className={styles.metricTitle}>Catalogs</h3>
                    <div className={styles.metricValue}>{stats.totalCatalogs}</div>
                    {stats.recentActivity.newCatalogs > 0 && (
                      <div className={styles.metricChange}>
                        +{stats.recentActivity.newCatalogs} this week
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className={styles.metricContent}>
                    <h3 className={styles.metricTitle}>Images</h3>
                    <div className={styles.metricValue}>{stats.totalImages}</div>
                    {stats.recentActivity.newImages > 0 && (
                      <div className={styles.metricChange}>
                        +{stats.recentActivity.newImages} this week
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* User Distribution */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>User Distribution</h2>
              <div className={styles.distributionGrid}>
                <div className={styles.distributionCard}>
                  <div className={styles.distributionIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className={styles.distributionContent}>
                    <h3 className={styles.distributionTitle}>Administrators</h3>
                    <div className={styles.distributionValue}>{stats.userDistribution.admins}</div>
                    <div className={styles.distributionPercentage}>
                      {((stats.userDistribution.admins / stats.totalUsers) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className={styles.distributionCard}>
                  <div className={styles.distributionIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className={styles.distributionContent}>
                    <h3 className={styles.distributionTitle}>Manufacturers</h3>
                    <div className={styles.distributionValue}>{stats.userDistribution.manufacturers}</div>
                    <div className={styles.distributionPercentage}>
                      {((stats.userDistribution.manufacturers / stats.totalUsers) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className={styles.distributionCard}>
                  <div className={styles.distributionIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <div className={styles.distributionContent}>
                    <h3 className={styles.distributionTitle}>Regular Users</h3>
                    <div className={styles.distributionValue}>{stats.userDistribution.users}</div>
                    <div className={styles.distributionPercentage}>
                      {((stats.userDistribution.users / stats.totalUsers) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Top Manufacturers */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top Manufacturers</h2>
              <div className={styles.topManufacturers}>
                {stats.topManufacturers.map((manufacturer, index) => (
                  <div key={manufacturer.id} className={styles.manufacturerCard}>
                    <div className={styles.manufacturerRank}>#{index + 1}</div>
                    <div className={styles.manufacturerInfo}>
                      <h3 className={styles.manufacturerName}>{manufacturer.name}</h3>
                      <div className={styles.manufacturerStats}>
                        <span className={styles.manufacturerStat}>
                          {manufacturer.userCount} users
                        </span>
                        <span className={styles.manufacturerStat}>
                          {manufacturer.catalogCount} catalogs
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className={styles.emptySection}>
            <p>No statistics available</p>
          </div>
        )}
      </div>
    </div>
  )
}
