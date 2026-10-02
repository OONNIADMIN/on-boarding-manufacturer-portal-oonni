'use client'

import { SUPPORT_CONTACT_URL, isPublicSupportMessage } from '@/lib/support'
import styles from './SupportContactText.module.scss'

export default function SupportContactText({
  text,
}: {
  text: string
}) {
  if (!isPublicSupportMessage(text)) {
    return <>{text}</>
  }

  const referenceMatch = text.match(/Reference:\s*([a-z0-9]+)/i)
  const referenceId = referenceMatch?.[1]

  return (
    <span>
      Something went wrong. Please{' '}
      <a
        className={styles.link}
        href={SUPPORT_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        contact support
      </a>{' '}
      and we will help you.
      {referenceId ? ` Reference: ${referenceId}` : null}
    </span>
  )
}
