'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI, manufacturerAPI } from '@/lib/api'
import { User } from '@/types'
import { Header } from '@/components'
import styles from './page.module.scss'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  const isManufacturer = user?.role?.name?.trim().toLowerCase() === 'manufacturer'
  const manufacturerId = user?.manufacturer_id ?? user?.manufacturer?.id ?? null

  useEffect(() => {
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()

    if (!token || !storedUser) {
      router.push('/login')
      return
    }

    setUser(storedUser)
    setName(storedUser.name ?? '')
    setCompanyName(storedUser.manufacturer?.name ?? '')
    setIsLoading(false)

    authAPI.getMe(token)
      .then((fresh) => {
        setUser(fresh)
        authAPI.persistUser(fresh)
        setName(fresh.name ?? '')
        setCompanyName(fresh.manufacturer?.name ?? '')
      })
      .catch(() => {
        // Keep the stored session if /me fails
      })
  }, [router])

  const handleBackToDashboard = () => {
    if (user && authAPI.isAdmin(user)) {
      router.push('/dashboard')
    } else {
      router.push('/catalogs')
    }
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    const token = authAPI.getToken()
    if (!token || !user) return

    const nextName = name.trim()
    const nextCompany = companyName.trim()
    if (!nextName) {
      setError('Name is required')
      return
    }
    if (isManufacturer && manufacturerId && !nextCompany) {
      setError('Company name is required')
      return
    }

    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      let nextUser = user
      if (nextName !== (user.name ?? '').trim()) {
        nextUser = await authAPI.updateProfile(token, { name: nextName })
      }

      if (isManufacturer && manufacturerId && nextCompany !== (user.manufacturer?.name ?? '').trim()) {
        const manufacturer = await manufacturerAPI.updateManufacturer(token, manufacturerId, {
          name: nextCompany,
        })
        nextUser = {
          ...nextUser,
          manufacturer: {
            ...(nextUser.manufacturer ?? manufacturer),
            ...manufacturer,
          },
        }
        authAPI.persistUser(nextUser)
      }

      setUser(nextUser)
      setName(nextUser.name ?? '')
      setCompanyName(nextUser.manufacturer?.name ?? nextCompany)
      setSuccess('Profile updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setIsSaving(false)
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
        <Header
          subtitle="Manage your account information"
          user={user}
          showBackButton={true}
          backButtonText="Back to Dashboard"
          onBackClick={handleBackToDashboard}
          showNavigation={true}
          currentPage="profile"
        />

        <div className={styles.content}>
          <section className={styles.userInfoSection}>
            <form className={styles.card} onSubmit={handleSave}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>User Information</h2>
                <span className={styles.badge}>
                  {user.role?.name || user.role_id || 'No Role'}
                </span>
              </div>
              <div className={styles.cardContent}>
                {error && <div className={styles.formError}>{error}</div>}
                {success && <div className={styles.formSuccess}>{success}</div>}

                <label className={styles.infoRow}>
                  <span className={styles.infoLabel}>Name:</span>
                  <input
                    className={styles.infoInput}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                    required
                  />
                </label>
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
                {isManufacturer ? (
                  <label className={styles.infoRow}>
                    <span className={styles.infoLabel}>Company:</span>
                    <input
                      className={styles.infoInput}
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      maxLength={255}
                      required
                    />
                  </label>
                ) : (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Company:</span>
                    <span className={styles.infoValue}>
                      {user.manufacturer?.name || 'No Manufacturer'}
                    </span>
                  </div>
                )}
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Created:</span>
                  <span className={styles.infoValue}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>

                <div className={styles.formActions}>
                  <button type="submit" className={styles.saveButton} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
