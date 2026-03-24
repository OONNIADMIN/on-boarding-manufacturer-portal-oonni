'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { Header } from '@/components'
import { authAPI, catalogAPI } from '@/lib/api'
import { User, Catalog } from '@/types'

import Pagination from '@/components/ui/Pagination'
import styles from './page.module.scss'

export default function CatalogsPage() {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [catalogs, setCatalogs] = useState<Catalog[]>([])
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalItems, setTotalItems] = useState(0)
    const [itemsPerPage, setItemsPerPage] = useState(10)

    const router = useRouter()

    const loadCatalogs = async () => {
        setIsLoading(true)
        setError(null)
    
        try{

            const response = await catalogAPI.listCatalogs()
            setCatalogs(response)
        }
        catch(err) {
            setError(err instanceof Error ? err.message : 'Failed to load catalogs')
        }
        finally {
            setIsLoading(false)
        }
    }
    useEffect(() => {
        const storedUser = authAPI.getStoredUser()
        const token = authAPI.getToken()
        if(!token || !storedUser) {
            router.push('/login')
            return
        }
        if(!authAPI.isAdmin(storedUser)) {
            router.push('/onboard/template')
            return
        }
        setUser(storedUser)
        loadCatalogs()
    }, [router])

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString)
        return date.toLocaleString()
      }
    
     const getFileExtension = (filePath?: string): string => {
        if (!filePath) return '📄'
        if (filePath.includes('.csv')) return '📊'
        if (filePath.includes('.xlsx') || filePath.includes('.xls')) return '📗'
        return '📄'
      }
    // Pagination calculations
    const totalPages = Math.ceil(catalogs.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedCatalogs = catalogs.slice(startIndex, endIndex)

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
    }

    const handleItemsPerPageChange = (newItemsPerPage: number) => {
        setItemsPerPage(newItemsPerPage)
        setCurrentPage(1) // Reset to first page when changing items per page
    }
    if (isLoading) {
        return (
          <div className={styles.container}>
            <h2 className={styles.title}>📂 Uploaded Catalogs</h2>
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>Loading catalogs...</p>
            </div>
          </div>
        )
      }
    
      if (error) {
        return (
          <div className={styles.container}>
            <h2 className={styles.title}>📂 Uploaded Catalogs</h2>
            <div className={styles.error}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          </div>
        )
      }
    
      if (catalogs.length === 0) {
        return (
          <div className={styles.container}>
            <h2 className={styles.title}>📂 Uploaded Catalogs</h2>
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📭</div>
              <p>No catalogs uploaded yet</p>
            </div>
          </div>
        )
      }
    
    return(
        <main className={styles.main}>
            <div className={styles.container}>
                <Header
                    title="Catalogs"
                    subtitle="Manage your catalogs"
                    user={user}
                    showNavigation={true}
                    currentPage="catalogs"
                />   
                <div className={styles.container}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>Uploaded Catalogs</h2>
                        <button onClick={loadCatalogs} className={styles.refreshButton}>
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                            />
                            </svg>
                        Refresh
                        </button>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                        <thead>
                            <tr>
                            <th>Type</th>
                            <th>ID</th>
                            <th>Catalog Name</th>
                            <th>Slug</th>
                            <th>Uploaded At</th>
                            <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedCatalogs.map((catalog) => (
                            <tr key={catalog.id}>
                                <td>{getFileExtension(catalog.catalog_file)}</td>
                                <td className={styles.catalogId}>#{catalog.id}</td>
                                <td className={styles.fileName}>{catalog.name}</td>
                                <td className={styles.slug}>{catalog.slug}</td>
                                <td className={styles.fileDate}>{formatDate(catalog.created_at)}</td>
                                <td className={styles.actionsCell}>
                                <button
                                    onClick={() => router.push(`/catalogs/${catalog.id}/preview`)}
                                    className={styles.viewButton}
                                    title="Preview catalog"
                                >
                                    Preview
                                </button>
                                <a 
                                    href={catalog.catalog_file} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={styles.viewButton}
                                    title="View full size"
                                >
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round" 
                                        strokeWidth={2} 
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                                    />
                                    <path 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round" 
                                        strokeWidth={2} 
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" 
                                    />
                                    </svg>
                                </a>
                                </td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        itemsPerPage={itemsPerPage}
                        totalItems={catalogs.length}
                        showItemsPerPage={true}
                        onItemsPerPageChange={handleItemsPerPageChange}
                    />
                    </div>         
            </div>
        </main>
    )

}

