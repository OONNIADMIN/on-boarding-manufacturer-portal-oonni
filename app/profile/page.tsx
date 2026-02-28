'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'
import { User } from '@/types'
import { Header } from '@/components'
import styles from './page.module.scss'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()

    if (!token || !storedUser) {
      router.push('/login')
      return
    }

    setUser(storedUser)
    setIsLoading(false)
  }, [router])

  const handleLogout = () => {
    authAPI.logout()
    router.push('/login')
  }

  const handleBackToDashboard = () => {
    if (user && authAPI.isAdmin(user)) {
      router.push('/dashboard')
    } else {
      router.push('/catalogs')
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
          title="User Profile"
          subtitle="Manage your account information"
          user={user}
          showBackButton={true}
          backButtonText="Back to Dashboard"
          onBackClick={handleBackToDashboard}
          showNavigation={true}
          currentPage="profile"
        />

        <div className={styles.content}>
          {/* User Info Card */}
          <section className={styles.userInfoSection}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>User Information</h2>
                <span className={styles.badge}>
                  {user.role?.name || user.role_id || 'No Role'}
                </span>
              </div>
              <div className={styles.cardContent}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Name:</span>
                  <span className={styles.infoValue}>{user.name}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Email:</span>
                  <span className={styles.infoValue}>{user.email}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Role:</span>
                  <span className={styles.infoValue}>
                    {user.role?.name || `Role ID: ${user.role_id}` || 'No Role'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status:</span>
                  <span className={`${styles.infoValue} ${user.is_active ? styles.activeStatus : styles.inactiveStatus}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Company:</span>
                  <span className={styles.infoValue}>
                    {user.manufacturer?.name || 'No Manufacturer'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Created:</span>
                  <span className={styles.infoValue}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  )
}
