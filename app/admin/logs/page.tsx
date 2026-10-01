'use client'

import { FormEvent, Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import { authAPI, systemLogsAPI, type SystemErrorLogRow } from '@/lib/api'
import { SUPPORT_CONTACT_URL } from '@/lib/support'
import { User } from '@/types'
import styles from './page.module.scss'

export default function AdminErrorLogsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [logs, setLogs] = useState<SystemErrorLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()
    if (!token || !storedUser) {
      router.push('/login')
      return
    }
    if (!authAPI.isAdmin(storedUser)) {
      router.push('/onboard/template')
      return
    }
    setUser(storedUser)
  }, [router])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      try {
        setIsLoading(true)
        setError('')
        const data = await systemLogsAPI.list({ page, limit: 20, q: search })
        if (cancelled) return
        setLogs(data.logs)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logs')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, page, search])

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearch(query.trim())
  }

  if (!user) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header
          subtitle="Successful operations and unexpected errors"
          user={user}
          showNavigation
          currentPage="logs"
        />

        <div className={styles.content}>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Logs</h1>
              <p className={styles.pageDescription}>
                Successful operations are marked OK. Errors keep the technical detail here. Users see a
                generic English message and this support link:{' '}
                <a href={SUPPORT_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  {SUPPORT_CONTACT_URL}
                </a>
              </p>
            </div>
            <form className={styles.searchForm} onSubmit={handleSearch}>
              <input
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reference, source, or message"
              />
              <button type="submit" className={styles.searchButton}>
                Search
              </button>
            </form>
          </header>

          {error ? <div className={styles.errorMessage}>{error}</div> : null}

          <div className={styles.panel}>
            {isLoading ? (
              <p className={styles.empty}>Loading logs…</p>
            ) : logs.length === 0 ? (
              <p className={styles.empty}>No logs yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Reference</th>
                      <th>Source</th>
                      <th>User</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <Fragment key={log.id}>
                        <tr className={styles.row} onClick={() => setExpanded((id) => (id === log.id ? null : log.id))}>
                          <td>{new Date(log.created_at).toLocaleString()}</td>
                          <td>
                            <span className={log.level === 'ok' ? styles.levelOk : styles.levelError}>
                              {log.level === 'ok' ? 'OK' : 'Error'}
                            </span>
                          </td>
                          <td className={styles.mono}>{log.id}</td>
                          <td>{log.source}</td>
                          <td>{log.user_email || log.user_name || '—'}</td>
                          <td className={styles.message}>{log.message}</td>
                        </tr>
                        {expanded === log.id ? (
                          <tr className={styles.detailRow}>
                            <td colSpan={6}>
                              <pre className={styles.stack}>
                                {log.level === 'ok'
                                  ? log.path
                                    ? `Path: ${log.path}`
                                    : 'Completed successfully.'
                                  : log.stack || 'No stack trace stored.'}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.pager}>
            <span>
              {total} log{total === 1 ? '' : 's'}
            </span>
            <div className={styles.pagerButtons}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
