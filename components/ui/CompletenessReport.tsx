'use client'

import type {
  CompletenessReport,
  CompletenessStatus,
  EntityCompleteness,
} from '@/lib/inventory-completeness'
import { completenessStatusLabel } from '@/lib/inventory-completeness'
import styles from './CompletenessReport.module.scss'

function statusClass(status: CompletenessStatus): string {
  if (status === 'complete') return styles.ok
  if (status === 'needs_review') return styles.warn
  return styles.bad
}

export function CompletenessMeter({ report }: { report: CompletenessReport }) {
  return (
    <div
      className={styles.meter}
      title={`${completenessStatusLabel(report.status)} · ${report.valid_fields}/${report.total_fields} valid fields`}
    >
      <div className={styles.track}>
        <span className={`${styles.fill} ${statusClass(report.status)}`} style={{ width: `${report.percent}%` }} />
      </div>
      <strong>{report.percent}%</strong>
    </div>
  )
}

export function CompletenessChart({
  title,
  items,
}: {
  title: string
  items: Array<Pick<EntityCompleteness, 'id' | 'label' | 'percent' | 'status' | 'valid_fields' | 'total_fields'>>
}) {
  if (!items.length) return null
  const max = Math.max(100, ...items.map((item) => item.percent))

  return (
    <div className={styles.chart}>
      <h3 className={styles.chartTitle}>{title}</h3>
      <ul className={styles.bars}>
        {items.map((item) => (
          <li key={`${item.id}-${item.label}`}>
            <div className={styles.barMeta}>
              <span className={styles.barLabel} title={item.label}>
                {item.label}
              </span>
              <span>
                {item.percent}% · {item.valid_fields}/{item.total_fields}
              </span>
            </div>
            <div className={styles.track}>
              <span
                className={`${styles.fill} ${statusClass(item.status)}`}
                style={{ width: `${Math.round((item.percent / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CompletenessBreakdown({ report }: { report: CompletenessReport }) {
  return (
    <p className={styles.breakdown}>
      {report.valid_fields}/{report.total_fields} fields valid · {report.empty_count} empty · {report.na_count} N/A ·{' '}
      {report.zero_count} zero · {report.short_count} short
    </p>
  )
}
