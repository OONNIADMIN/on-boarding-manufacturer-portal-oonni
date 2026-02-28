'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { Header } from '@/components'
import { authAPI, catalogAPI, productAPI } from '@/lib/api'
import { User, Catalog } from '@/types'
import styles from './page.module.scss'

export default function CatalogPreviewPage() {
    const router = useRouter()
    const params = useParams()
    const catalogId = useMemo(() => Number(params?.id), [params])

    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [catalog, setCatalog] = useState<Catalog | null>(null)
    const [columns, setColumns] = useState<string[]>([])
    const [selectedColumn, setSelectedColumn] = useState<string>('')
    const [previewSkus, setPreviewSkus] = useState<string[]>([])
    const [totalSkus, setTotalSkus] = useState<number>(0)
    const [hasMore, setHasMore] = useState<boolean>(false)
    const [submitting, setSubmitting] = useState<boolean>(false)

    useEffect(() => {
        const storedUser = authAPI.getStoredUser()
        const token = authAPI.getToken()
        if (!token || !storedUser) {
            router.push('/login')
            return
        }
        // Only admin can access this preview for now
        if (!authAPI.isAdmin(storedUser)) {
            router.push('/catalogs')
            return
        }
        setUser(storedUser)
    }, [router])

    useEffect(() => {
        if (!catalogId) return
        const load = async () => {
            setIsLoading(true)
            setError(null)
            try {
                const [cat, cols] = await Promise.all([
                    catalogAPI.getCatalog(catalogId),
                    catalogAPI.getColumns(catalogId)
                ])
                setCatalog(cat)
                setColumns(cols.list_columns || [])
            } catch (e: any) {
                setError(e?.message || 'Failed to load catalog/columns')
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [catalogId])

    const onSelectColumn = async (col: string) => {
        setSelectedColumn(col)
        if (!col) {
            setPreviewSkus([])
            setTotalSkus(0)
            setHasMore(false)
            return
        }
        try {
            const res = await catalogAPI.previewSkus(catalogId, col)
            setPreviewSkus(res.preview_skus || [])
            setTotalSkus(res.total_skus || 0)
            setHasMore(!!res.has_more)
        } catch (e: any) {
            setError(e?.message || 'Failed to preview SKUs')
        }
    }

    const onCreateProducts = async () => {
        if (!user || !selectedColumn || !catalog) return
        if (totalSkus === 0) return
        const confirmed = window.confirm(`Create products from column "${selectedColumn}" with ${totalSkus} SKUs?`)
        if (!confirmed) return
        setSubmitting(true)
        setError(null)
        try {
            const res = await productAPI.createProductsFromCatalog(
                catalogId,
                selectedColumn,
                catalog.manufacturer_id
            )
            alert(`Created ${res.created_count} products (from ${res.total_requested})`)
            router.push('/catalogs')
        } catch (e: any) {
            setError(e?.message || 'Failed to create products')
        } finally {
            setSubmitting(false)
        }
    }

    if (isLoading) {
        return <div className={styles.loading}>Loading catalog preview...</div>
    }
    if (error) {
        return <div className={styles.error}>{error}</div>
    }

    return (
        <main className={styles.main}>
            <div className={styles.container}>
                <Header
                    title="Catalog Preview"
                    subtitle="Select the SKU column and create products"
                    user={user as User}
                    showNavigation={true}
                    currentPage="catalogs"
                    navStyle="flat"
                />

                <div className={styles.content}>
                    <div className={styles.controlsRow}>
                        <div className={styles.selectGroup}>
                            <label htmlFor="column">SKU column</label>
                            <select
                                id="column"
                                value={selectedColumn}
                                onChange={(e) => onSelectColumn(e.target.value)}
                            >
                                <option value="">Select a column</option>
                                {columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            className={styles.primaryBtn}
                            onClick={onCreateProducts}
                            disabled={!selectedColumn || submitting || totalSkus === 0}
                        >
                            {submitting ? 'Creating…' : 'Create products'}
                        </button>
                    </div>

                    {selectedColumn && (
                        <div className={styles.previewPanel}>
                            <div className={styles.previewHeader}>
                                Preview SKUs ({totalSkus}{hasMore ? '+' : ''})
                            </div>
                            {previewSkus.length === 0 ? (
                                <div className={styles.empty}>No SKUs found for this column</div>
                            ) : (
                                <ul className={styles.previewList}>
                                    {previewSkus.map((sku) => (
                                        <li key={sku}>{sku}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}


