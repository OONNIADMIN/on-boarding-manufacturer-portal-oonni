'use client'

import { useEffect, useRef, useState } from 'react'
import { catalogAPI, type CatalogImportJobView } from '@/lib/api'
import {
  forgetCatalogImportJob,
  listRememberedCatalogImportJobs,
} from '@/lib/catalog-import-jobs-client'
import styles from './CatalogImportBanner.module.scss'

const RUNNING = new Set([
  'queued',
  'analyzing',
  'creating_products',
  'saving_file',
  'importing_images',
])
const VISIBLE = new Set([...RUNNING, 'completed', 'failed'])
const COMPLETED_HIDE_MS = 25_000

function isStorageLimitError(text: string): boolean {
  return /104857600|file size exceeds|invalid file parameter/i.test(text)
}

function isDuplicatePhotoError(text: string): boolean {
  return /Unique constraint failed/i.test(text)
}

function phaseLabel(job: CatalogImportJobView): string {
  if (job.status === 'completed') return job.message || 'Catalog import finished'
  if (job.status === 'failed') {
    const detail = job.error || job.message || 'Catalog import failed'
    if (isStorageLimitError(detail)) {
      return 'This catalog was too large to keep as one file. Upload it again to import the photos.'
    }
    if (isDuplicatePhotoError(detail)) {
      return 'Some photos were already in the catalog. Duplicates were skipped — you can keep working.'
    }
    return detail
  }
  return job.message || 'Processing catalog…'
}

function percent(job: CatalogImportJobView): number {
  if (job.status === 'completed' || job.status === 'failed') return 100
  if (job.status === 'queued') return 5
  if (job.progress_total > 0) {
    return Math.min(99, Math.round((job.progress_current / job.progress_total) * 100))
  }
  return 15
}

export default function CatalogImportBanner({ userId }: { userId: number }) {
  const [jobs, setJobs] = useState<CatalogImportJobView[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const completedSeenAt = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const remembered = listRememberedCatalogImportJobs(userId)
      try {
        const listed = await catalogAPI.listImportJobs()
        const byId = new Map(listed.map((job) => [job.id, job]))
        const extra = await Promise.all(
          remembered
            .filter((id) => !byId.has(id))
            .map((id) => catalogAPI.getImportJob(id).catch(() => null))
        )
        for (const job of extra) {
          if (job) byId.set(job.id, job)
        }

        const visible: CatalogImportJobView[] = []
        for (const job of byId.values()) {
          if (dismissed.has(job.id)) {
            forgetCatalogImportJob(job.id, userId)
            continue
          }
          if (!VISIBLE.has(job.status)) {
            forgetCatalogImportJob(job.id, userId)
            continue
          }
          visible.push(job)
        }

        visible.sort((a, b) => b.created_at.localeCompare(a.created_at))
        if (!cancelled) setJobs(visible.slice(0, 3))
      } catch {
        if (!cancelled) setJobs([])
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [userId, dismissed])

  const dismiss = (id: string) => {
    forgetCatalogImportJob(id, userId)
    completedSeenAt.current.delete(id)
    setDismissed((prev) => new Set(prev).add(id))
    setJobs((prev) => prev.filter((job) => job.id !== id))
  }

  useEffect(() => {
    const now = Date.now()
    const timers: number[] = []
    for (const job of jobs) {
      if (job.status !== 'completed' && job.status !== 'failed') continue
      if (!completedSeenAt.current.has(job.id)) completedSeenAt.current.set(job.id, now)
      const remaining = Math.max(0, COMPLETED_HIDE_MS - (now - (completedSeenAt.current.get(job.id) ?? now)))
      timers.push(window.setTimeout(() => dismiss(job.id), remaining))
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [jobs, userId])

  if (!jobs.length) return null

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      {jobs.map((job) => (
        <div key={job.id} className={styles.item}>
          <div className={styles.meta}>
            <strong>{job.filename}</strong>
            <span>{phaseLabel(job)}</span>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => dismiss(job.id)}
              aria-label="Dismiss progress"
            >
              ×
            </button>
          </div>
          <div className={styles.track} aria-hidden>
            <span
              className={`${styles.fill} ${job.status === 'failed' ? styles.failed : ''} ${job.status === 'completed' ? styles.done : ''}`}
              style={{ width: `${percent(job)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
