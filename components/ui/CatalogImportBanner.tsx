'use client'

import { useEffect, useState } from 'react'
import { catalogAPI, type CatalogImportJobView } from '@/lib/api'
import {
  forgetCatalogImportJob,
  listRememberedCatalogImportJobs,
} from '@/lib/catalog-import-jobs-client'
import styles from './CatalogImportBanner.module.scss'

function phaseLabel(job: CatalogImportJobView): string {
  if (job.status === 'completed') return 'Catalog import finished'
  if (job.status === 'failed') return job.error || 'Catalog import failed'
  return job.message || 'Processing catalog…'
}

function percent(job: CatalogImportJobView): number {
  if (job.status === 'completed') return 100
  if (job.status === 'queued') return 5
  if (job.progress_total > 0) {
    return Math.min(99, Math.round((job.progress_current / job.progress_total) * 100))
  }
  return 15
}

export default function CatalogImportBanner() {
  const [jobs, setJobs] = useState<CatalogImportJobView[]>([])

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const remembered = listRememberedCatalogImportJobs()
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
        const ordered = [...byId.values()]
          .filter((job) => remembered.includes(job.id) || job.status !== 'completed')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 3)
        if (!cancelled) setJobs(ordered)
        for (const job of ordered) {
          if (job.status === 'completed' || job.status === 'failed') {
            window.setTimeout(() => forgetCatalogImportJob(job.id), 20_000)
          }
        }
      } catch {
        /* keep last */
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!jobs.length) return null

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      {jobs.map((job) => (
        <div key={job.id} className={styles.item}>
          <div className={styles.meta}>
            <strong>{job.filename}</strong>
            <span>{phaseLabel(job)}</span>
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
