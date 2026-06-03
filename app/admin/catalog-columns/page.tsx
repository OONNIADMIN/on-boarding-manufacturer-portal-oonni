'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import { authAPI, catalogColumnRulesAPI, type CatalogColumnRuleInput } from '@/lib/api'
import { User } from '@/types'
import styles from './page.module.scss'

type EditableRule = {
  key: string
  label: string
  candidatesText: string
  sort_order: number
  is_active: boolean
}

function toEditableRule(rule: CatalogColumnRuleInput, index: number): EditableRule {
  return {
    key: `rule-${index}-${rule.label}`,
    label: rule.label,
    candidatesText: rule.candidates.join(', '),
    sort_order: rule.sort_order ?? index,
    is_active: rule.is_active ?? true,
  }
}

function toInputRule(rule: EditableRule, index: number): CatalogColumnRuleInput {
  return {
    label: rule.label.trim(),
    candidates: rule.candidatesText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    sort_order: index,
    is_active: rule.is_active,
  }
}

export default function AdminCatalogColumnsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [rules, setRules] = useState<EditableRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
    void loadRules()
  }, [router])

  const loadRules = async () => {
    try {
      setIsLoading(true)
      setError('')
      const data = await catalogColumnRulesAPI.listAdmin()
      setRules(data.map((rule, index) => toEditableRule(rule, index)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load column rules')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRuleChange = (key: string, patch: Partial<EditableRule>) => {
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)))
  }

  const handleAddRule = () => {
    setRules((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        label: '',
        candidatesText: '',
        sort_order: current.length,
        is_active: true,
      },
    ])
  }

  const handleRemoveRule = (key: string) => {
    setRules((current) => current.filter((rule) => rule.key !== key))
  }

  const handleMoveRule = (key: string, direction: -1 | 1) => {
    setRules((current) => {
      const index = current.findIndex((rule) => rule.key === key)
      if (index < 0) return current
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next.map((rule, sortIndex) => ({ ...rule, sort_order: sortIndex }))
    })
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError('')
      setSuccess('')
      const payload = rules.map((rule, index) => toInputRule(rule, index))
      const saved = await catalogColumnRulesAPI.saveAdmin(payload)
      setRules(saved.map((rule, index) => toEditableRule(rule, index)))
      setSuccess('Catalog column rules saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save column rules')
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetDefaults = async () => {
    if (!window.confirm('Restore the default catalog column rules? This will replace the current configuration.')) {
      return
    }

    try {
      setIsSaving(true)
      setError('')
      setSuccess('')
      const saved = await catalogColumnRulesAPI.resetDefaults()
      setRules(saved.map((rule, index) => toEditableRule(rule, index)))
      setSuccess('Default catalog column rules restored.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset column rules')
    } finally {
      setIsSaving(false)
    }
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
          subtitle="Configure required catalog upload columns"
          user={user}
          showNavigation
          currentPage="catalogColumns"
        />

        <div className={styles.content}>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Catalog column rules</h1>
              <p className={styles.pageDescription}>
                Index the  header names manufacturers must include when uploading catalogs. Each rule
                matches if any of its accepted column names is present in the selected header row.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void handleResetDefaults()} disabled={isSaving}>
                Restore defaults
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void handleSave()} disabled={isSaving || isLoading}>
                {isSaving ? 'Saving…' : 'Save rules'}
              </button>
            </div>
          </header>

          {success ? <div className={styles.successMessage}>{success}</div> : null}
          {error ? <div className={styles.errorMessage}>{error}</div> : null}

          {isLoading ? (
            <div className={styles.loadingPanel}>Loading column rules…</div>
          ) : (
            <section className={styles.rulesPanel}>
              <div className={styles.tableWrap}>
                <table className={styles.rulesTable}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Rule label</th>
                      <th>Accepted column names</th>
                      <th>Active</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule, index) => (
                      <tr key={rule.key}>
                        <td className={styles.orderCell}>
                          <div className={styles.orderControls}>
                            <button type="button" onClick={() => handleMoveRule(rule.key, -1)} disabled={index === 0} aria-label="Move up">
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveRule(rule.key, 1)}
                              disabled={index === rules.length - 1}
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td>
                          <input
                            className={styles.textInput}
                            value={rule.label}
                            onChange={(event) => handleRuleChange(rule.key, { label: event.target.value })}
                            placeholder="e.g. sku"
                          />
                        </td>
                        <td>
                          <input
                            className={styles.textInputWide}
                            value={rule.candidatesText}
                            onChange={(event) => handleRuleChange(rule.key, { candidatesText: event.target.value })}
                            placeholder="sku, variant sku"
                          />
                        </td>
                        <td className={styles.activeCell}>
                          <input
                            type="checkbox"
                            checked={rule.is_active}
                            onChange={(event) => handleRuleChange(rule.key, { is_active: event.target.checked })}
                          />
                        </td>
                        <td className={styles.actionsCell}>
                          <button type="button" className={styles.removeButton} onClick={() => handleRemoveRule(rule.key)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className={styles.addButton} onClick={handleAddRule}>
                + Add column rule
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
