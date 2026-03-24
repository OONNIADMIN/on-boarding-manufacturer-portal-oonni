'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import styles from './page.module.scss'
import FilesList from '@/components/file-management/FilesList'
import ImageList from '@/components/file-management/ImageList'
import { authAPI } from '@/lib/api'
import { User } from '@/types'

export default function HistoricalPage() {
    const [refreshKey, setRefreshKey] = useState(0)
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [uploadedCatalog, setUploadedCatalog] = useState<any>(null)
    const [availableColumns, setAvailableColumns] = useState<string[]>([])

    const [uploadProgress, setUploadProgress] = useState({
        totalImages: 0,
        uploadedImages: 0,
        failedImages: 0,
        isUploading: false
    })

    const router = useRouter()

    useEffect(() => {
        const token = authAPI.getToken()
        const storedUser = authAPI.getStoredUser()
        console.log('Manufacturer ID:', storedUser?.manufacturer_id)
        if (!token || !storedUser) {
            router.push('/login')
            return
        }

        if (authAPI.isAdmin(storedUser)) {
            router.push('/dashboard')
            return
        }

        setUser(storedUser)
        setIsLoading(false)
    }, [router])

    const handleBackToDashboard = () => {
        if (user && authAPI.isAdmin(user)) {
          router.push('/dashboard')
        } else {
          router.push('/onboard/template')
        }
      }

    return (
        <main className={styles.main}>
        <div className={styles.container}>
            <Header
            title="History"
            subtitle="See your files information"
            user={user}
            showBackButton={true}
            backButtonText="Back to Dashboard"
            onBackClick={handleBackToDashboard}
            showNavigation={true}
            currentPage="historical"
            />


            <section className={styles.managementSection}>
                <div className={styles.managementGrid}>
                    <div className={styles.managementCard}>
                        <div className={styles.managementCardHeader}>                            
                        </div>
                        <div className={styles.managementCardContent}>
                            <FilesList key={refreshKey} />
                        </div>
                    </div>
                </div>
            </section>
            <section className={styles.managementSection}>
                <div className={styles.managementGrid}>
                    <div className={styles.managementCard}>
                    <div className={styles.managementCardHeader}>                       
                    </div>
                    <div className={styles.managementCardContent}>
                        <ImageList key={refreshKey} />
                    </div>
                    </div>
                </div>
            </section>
            </div>
            </main>
        )
    }
