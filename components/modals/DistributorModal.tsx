'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { AuthorizedDistributor, DistributorInput, DistributorStatus } from '@/types'
import styles from './CreateSellerModal.module.scss'

type DistributorModalProps = {
  isOpen: boolean
  distributor?: AuthorizedDistributor | null
  isSaving?: boolean
  error?: string
  onClose: () => void
  onSubmit: (input: DistributorInput) => Promise<void> | void
}

const emptyForm = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  region: '',
  valid_until: '',
  status: 'not_invited' as DistributorStatus,
  send_invite: true,
}

export default function DistributorModal({
  isOpen,
  distributor,
  isSaving = false,
  error = '',
  onClose,
  onSubmit,
}: DistributorModalProps) {
  const [form, setForm] = useState(emptyForm)
  const isEdit = Boolean(distributor)

  useEffect(() => {
    if (!isOpen) return
    if (distributor) {
      setForm({
        company_name: distributor.company_name,
        contact_name: distributor.contact_name,
        email: distributor.email,
        phone: distributor.phone ?? '',
        region: distributor.region ?? '',
        valid_until: distributor.valid_until ?? '',
        status: distributor.status,
        send_invite: false,
      })
      return
    }
    setForm(emptyForm)
  }, [distributor, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      region: form.region.trim() || null,
      valid_until: form.valid_until || null,
      ...(isEdit ? { status: form.status } : { send_invite: form.send_invite }),
    })
  }

  return (
    <div className={styles.overlay} onClick={() => !isSaving && onClose()}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isEdit ? 'Edit distributor' : 'Add distributor'}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={isSaving} aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <div className={styles.error}>{error}</div> : null}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-company">Company name</label>
            <input
              id="distributor-company"
              className={styles.input}
              value={form.company_name}
              onChange={(event) => setForm((prev) => ({ ...prev, company_name: event.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-contact">Contact name</label>
            <input
              id="distributor-contact"
              className={styles.input}
              value={form.contact_name}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-email">Email</label>
            <input
              id="distributor-email"
              type="email"
              className={styles.input}
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-phone">Phone</label>
            <input
              id="distributor-phone"
              className={styles.input}
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-region">Region</label>
            <input
              id="distributor-region"
              className={styles.input}
              value={form.region}
              onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              placeholder="West Coast"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="distributor-valid">Valid until</label>
            <input
              id="distributor-valid"
              type="date"
              className={styles.input}
              value={form.valid_until}
              onChange={(event) => setForm((prev) => ({ ...prev, valid_until: event.target.value }))}
            />
          </div>
          {isEdit ? (
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="distributor-status">Status</label>
              <select
                id="distributor-status"
                className={styles.input}
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as DistributorStatus }))}
              >
                <option value="active">Active</option>
                <option value="invite_sent">Invite sent</option>
                <option value="not_invited">Not invited</option>
              </select>
            </div>
          ) : (
            <label className={styles.label}>
              <input
                type="checkbox"
                checked={form.send_invite}
                onChange={(event) => setForm((prev) => ({ ...prev, send_invite: event.target.checked }))}
              />
              Send invitation email now
            </label>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSaving}>
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add distributor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
