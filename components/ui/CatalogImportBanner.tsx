'use client'

import { useEffect, useRef, useState } from 'react'
import { catalogAPI, inventoryAPI, type CatalogImportJobView, type InventoryBulkJobView } from '@/lib/api'
import {
  forgetCatalogImportJob,
  listRememberedCatalogImportJobs,
} from '@/lib/catalog-import-jobs-client'
import {
  forgetInventoryBulkJob,
  INVENTORY_BULK_COMPLETE_EVENT,
  listRememberedInventoryBulkJobs,
} from '@/lib/inventory-bulk-jobs-client'
import styles from './CatalogImportBanner.module.scss'

type BannerJob = {
  id: string
  source: 'catalog' | 'inventory'
  filename: string
  status: string
  message: string | null
  error: string | null
  progress_current: number
  progress_total: number
  created_at: string
}

const CATALOG_RUNNING = new Set([
  'queued',
  'analyzing',
  'creating_products',
  'saving_file',
  'importing_images',
])
const INVENTORY_RUNNING = new Set(['queued', 'reading', 'updating', 'publishing'])
const COMPLETED_HIDE_MS = 25_000

function isStorageLimitError(text: string): boolean {
  return /104857600|file size exceeds|invalid file parameter/i.test(text)
}

function isDuplicatePhotoError(text: string): boolean {
  return /Unique constraint failed/i.test(text)
}

function isRunning(job: BannerJob): boolean {
  return job.source === 'catalog' ? CATALOG_RUNNING.has(job.status) : INVENTORY_RUNNING.has(job.status)
}

function isVisible(job: BannerJob): boolean {
  return isRunning(job) || job.status === 'completed' || job.status === 'failed'
}

function fromCatalog(job: CatalogImportJobView): BannerJob {
  return {
    id: job.id,
    source: 'catalog',
    filename: job.filename,
    status: job.status,
    message: job.message,
    error: job.error,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    created_at: job.created_at,
  }
}

function fromInventory(job: InventoryBulkJobView): BannerJob {
  return {
    id: job.id,
    source: 'inventory',
    filename: job.filename,
    status: job.status,
    message: job.message,
    error: job.error,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    created_at: job.created_at,
  }
}

function phaseLabel(job: BannerJob): string {
  if (job.status === 'completed') return job.message || 'Import finished'
  if (job.status === 'failed') {
    const detail = job.error || job.message || 'Import failed'
    if (isStorageLimitError(detail)) {
      return 'This catalog was too large to keep as one file. Upload it again to import the photos.'
    }
    if (isDuplicatePhotoError(detail)) {
      return 'Some photos were already in the catalog. Duplicates were skipped — you can keep working.'
    }
    return detail
  }
  return job.message || (job.source === 'inventory' ? 'Applying spreadsheet edits…' : 'Processing catalog…')
}

function percent(job: BannerJob): number {
  if (job.status === 'completed' || job.status === 'failed') return 100
  if (job.status === 'queued') return 5
  if (job.progress_total > 0) {
    return Math.min(99, Math.round((job.progress_current / job.progress_total) * 100))
  }
  return 15
}

function forgetJob(job: BannerJob, userId: number) {
  if (job.source === 'catalog') forgetCatalogImportJob(job.id, userId)
  else forgetInventoryBulkJob(job.id, userId)
}

export default function CatalogImportBanner({ userId }: { userId: number }) {
  const [jobs, setJobs] = useState<BannerJob[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const completedSeenAt = useRef<Map<string, number>>(new Map())
  const notifiedComplete = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const rememberedCatalog = listRememberedCatalogImportJobs(userId)
      const rememberedInventory = listRememberedInventoryBulkJobs(userId)
      try {
        const [catalogListed, inventoryListed] = await Promise.all([
          catalogAPI.listImportJobs(),
          inventoryAPI.listBulkJobs(),
        ])
        const catalogById = new Map(catalogListed.map((job) => [job.id, fromCatalog(job)]))
        const inventoryById = new Map(inventoryListed.map((job) => [job.id, fromInventory(job)]))
        const extraCatalog = await Promise.all(
          rememberedCatalog
            .filter((id) => !catalogById.has(id))
            .map((id) => catalogAPI.getImportJob(id).then(fromCatalog).catch(() => null))
        )
        const extraInventory = await Promise.all(
          rememberedInventory
            .filter((id) => !inventoryById.has(id))
            .map((id) => inventoryAPI.getBulkJob(id).then(fromInventory).catch(() => null))
        )
        for (const job of extraCatalog) {
          if (job) catalogById.set(job.id, job)
        }
        for (const job of extraInventory) {
          if (job) inventoryById.set(job.id, job)
        }

        const visible: BannerJob[] = []
        for (const job of [...catalogById.values(), ...inventoryById.values()]) {
          if (dismissed.has(`${job.source}:${job.id}`)) {
            forgetJob(job, userId)
            continue
          }
          if (!isVisible(job)) {
            forgetJob(job, userId)
            continue
          }
          visible.push(job)
          if (
            job.source === 'inventory' &&
            job.status === 'completed' &&
            !notifiedComplete.current.has(job.id)
          ) {
            notifiedComplete.current.add(job.id)
            window.dispatchEvent(new CustomEvent(INVENTORY_BULK_COMPLETE_EVENT, { detail: job }))
          }
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

  const dismiss = (job: BannerJob) => {
    forgetJob(job, userId)
    completedSeenAt.current.delete(`${job.source}:${job.id}`)
    setDismissed((prev) => new Set(prev).add(`${job.source}:${job.id}`))
    setJobs((prev) => prev.filter((row) => !(row.source === job.source && row.id === job.id)))
  }

  useEffect(() => {
    const now = Date.now()
    const timers: number[] = []
    for (const job of jobs) {
      if (job.status !== 'completed' && job.status !== 'failed') continue
      const key = `${job.source}:${job.id}`
      if (!completedSeenAt.current.has(key)) completedSeenAt.current.set(key, now)
      const remaining = Math.max(0, COMPLETED_HIDE_MS - (now - (completedSeenAt.current.get(key) ?? now)))
      timers.push(window.setTimeout(() => dismiss(job), remaining))
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [jobs, userId])

  if (!jobs.length) return null

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      {jobs.map((job) => (
        <div key={`${job.source}:${job.id}`} className={styles.item}>
          <div className={styles.meta}>
            <strong>{job.filename}</strong>
            <span>{phaseLabel(job)}</span>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => dismiss(job)}
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
