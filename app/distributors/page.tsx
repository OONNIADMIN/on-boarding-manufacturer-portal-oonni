'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Search, Send, Trash2 } from 'lucide-react'
import { ConfirmDialog, Header } from '@/components'
import { DistributorModal } from '@/components/modals'
import { authAPI, distributorAPI } from '@/lib/api'
import type { AuthorizedDistributor, DistributorInput, DistributorStatus, User } from '@/types'
import styles from './page.module.scss'

type StatusFilter = 'all' | DistributorStatus

const AVATAR_TONES = ['teal', 'green', 'sage', 'mint'] as const

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function formatValidUntil(value: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(status: DistributorStatus): string {
  if (status === 'active') return 'Active'
  if (status === 'invite_sent') return 'Invite sent'
  return 'Not invited'
}

export default function DistributorsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [rows, setRows] = useState<AuthorizedDistributor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AuthorizedDistributor | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AuthorizedDistributor | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [invitingId, setInvitingId] = useState<number | null>(null)

  const loadRows = async () => {
    setError('')
    try {
      const data = await distributorAPI.list()
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load distributors')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()
    if (!token || !storedUser) {
      router.push('/login')
      return
    }
    if (authAPI.isAdmin(storedUser)) {
      router.push('/dashboard')
      return
    }
    setUser(storedUser)
    void loadRows()
  }, [router])

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.status === 'active').length
    const invitePending = rows.filter((row) => row.status === 'invite_sent').length
    const notInvited = rows.filter((row) => row.status === 'not_invited').length
    return { total: rows.length, active, invitePending, notInvited }
  }, [rows])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return [row.company_name, row.contact_name, row.email, row.phone, row.region]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter])

  const openCreate = () => {
    setEditing(null)
    setModalError('')
    setModalOpen(true)
  }

  const openEdit = (row: AuthorizedDistributor) => {
    setEditing(row)
    setModalError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setModalOpen(false)
    setEditing(null)
    setModalError('')
  }

  const handleSubmit = async (input: DistributorInput) => {
    setIsSaving(true)
    setModalError('')
    try {
      if (editing) {
        await distributorAPI.update(editing.id, input)
        setNotice(`Updated ${input.company_name}.`)
      } else {
        await distributorAPI.create(input)
        setNotice(
          input.send_invite
            ? `Added ${input.company_name} and sent an invitation.`
            : `Added ${input.company_name}.`
        )
      }
      setModalOpen(false)
      setEditing(null)
      await loadRows()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save distributor')
    } finally {
      setIsSaving(false)
    }
  }

  const handleInvite = async (row: AuthorizedDistributor) => {
    setInvitingId(row.id)
    setError('')
    try {
      await distributorAPI.invite(row.id)
      setNotice(
        row.status === 'not_invited'
          ? `Invitation sent to ${row.company_name}.`
          : `Invitation resent to ${row.company_name}.`
      )
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setInvitingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setError('')
    try {
      await distributorAPI.remove(deleteTarget.id)
      setNotice(`Removed ${deleteTarget.company_name}.`)
      setDeleteTarget(null)
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete distributor')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!user && isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header
          subtitle="Manage authorized distributors"
          user={user}
          showNavigation={true}
          currentPage="distributors"
        />

        <section className={styles.content}>
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.title}>Authorized Distributor List</h2>
              <p className={styles.subtitle}>
                Manage authorized distributors. Invite them to join Oonni and start selling today!
              </p>
            </div>
            <button type="button" className={styles.addButton} onClick={openCreate}>
              <Plus size={16} />
              Add Distributor
            </button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <div className={styles.statsGrid}>
            <article className={styles.statCard}>
              <span className={styles.statLabel}>Total distributors</span>
              <strong className={styles.statValue}>{stats.total}</strong>
            </article>
            <article className={styles.statCard}>
              <span className={styles.statLabel}>Active</span>
              <strong className={`${styles.statValue} ${styles.statActive}`}>{stats.active}</strong>
            </article>
            <article className={styles.statCard}>
              <span className={styles.statLabel}>Invite pending</span>
              <strong className={`${styles.statValue} ${styles.statPending}`}>{stats.invitePending}</strong>
            </article>
            <article className={styles.statCard}>
              <span className={styles.statLabel}>Not yet invited</span>
              <strong className={styles.statValue}>{stats.notInvited}</strong>
            </article>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableToolbar}>
              <label className={styles.search}>
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, email or region"
                  aria-label="Search distributors"
                />
              </label>
              <div className={styles.filters} role="tablist" aria-label="Filter by status">
                {(
                  [
                    ['all', 'All'],
                    ['active', 'Active'],
                    ['invite_sent', 'Invite sent'],
                    ['not_invited', 'Not invited'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === value}
                    className={`${styles.filterChip} ${statusFilter === value ? styles.filterChipActive : ''}`}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Distributor</th>
                    <th>Contact</th>
                    <th>Region</th>
                    <th>Valid until</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        {rows.length === 0
                          ? 'No authorized distributors yet. Add one to get started.'
                          : 'No distributors match this search.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, index) => (
                      <tr key={row.id}>
                        <td>
                          <div className={styles.distributorCell}>
                            <span
                              className={`${styles.avatar} ${styles[AVATAR_TONES[index % AVATAR_TONES.length]]}`}
                              aria-hidden="true"
                            >
                              {companyInitials(row.company_name)}
                            </span>
                            <span>
                              <strong>{row.company_name}</strong>
                              <span className={styles.muted}>{row.contact_name}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.contactCell}>
                            <span>{row.email}</span>
                            <span className={styles.muted}>{row.phone || '—'}</span>
                          </div>
                        </td>
                        <td>{row.region || '—'}</td>
                        <td className={styles.dateCell}>{formatValidUntil(row.valid_until)}</td>
                        <td>
                          <span className={`${styles.status} ${styles[`status_${row.status}`]}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.inviteButton}
                              onClick={() => void handleInvite(row)}
                              disabled={invitingId === row.id}
                            >
                              <Send size={14} />
                              {invitingId === row.id
                                ? 'Sending…'
                                : row.status === 'not_invited'
                                  ? 'Send invite'
                                  : 'Resend'}
                            </button>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => openEdit(row)}
                              aria-label={`Edit ${row.company_name}`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconButton} ${styles.danger}`}
                              onClick={() => setDeleteTarget(row)}
                              aria-label={`Delete ${row.company_name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <DistributorModal
        isOpen={modalOpen}
        distributor={editing}
        isSaving={isSaving}
        error={modalError}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Remove distributor"
        message={
          deleteTarget
            ? `Remove “${deleteTarget.company_name}” from your authorized distributors?`
            : ''
        }
        confirmLabel="Remove"
        isLoading={isDeleting}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </main>
  )
}
