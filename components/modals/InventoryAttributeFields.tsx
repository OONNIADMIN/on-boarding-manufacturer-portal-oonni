'use client'

import type { InventoryAttribute, InventoryAttributeWrite } from '@/lib/api'
import {
  inventoryAttributeFormRows,
  inventoryAttributeWritePayload,
  isIncompleteAttributeValue,
  type InventoryAttributeFormRow,
} from '@/lib/inventory-attributes'
import styles from './InventoryFormModal.module.scss'

export function attributeFormRows(attrs: InventoryAttribute[] | undefined): InventoryAttributeFormRow[] {
  return inventoryAttributeFormRows(attrs)
}

export function attributeWritePayload(rows: InventoryAttributeFormRow[]): InventoryAttributeWrite[] {
  return inventoryAttributeWritePayload(rows)
}

type InventoryAttributeFieldsProps = {
  attributes: InventoryAttributeFormRow[]
  readOnly?: boolean
  onChange: (next: InventoryAttributeFormRow[]) => void
}

export default function InventoryAttributeFields({
  attributes,
  readOnly = false,
  onChange,
}: InventoryAttributeFieldsProps) {
  return (
    <div className={styles.formGroup}>
      <span className={styles.label}>Attributes</span>
      <p className={styles.hint}>
        Red rows have an empty, 0, or N/A value. Required attributes cannot be removed.
      </p>
      <div className={styles.attrList}>
        {attributes.map((row, index) => {
          const required = Boolean(row.valueRequired)
          const named = Boolean(row.name.trim())
          const incomplete = (required || named) && isIncompleteAttributeValue(row.value, row.inputType)
          const rowClass = [styles.attrRow, incomplete ? styles.attrRowIncomplete : '']
            .filter(Boolean)
            .join(' ')
          return (
            <div className={rowClass} key={row.id || `attr-${index}`}>
              <input
                className={styles.input}
                placeholder="Name"
                value={row.name}
                readOnly={readOnly || required}
                title={required ? 'Required attribute name cannot be changed' : undefined}
                onChange={(event) => {
                  const next = [...attributes]
                  next[index] = { ...row, name: event.target.value }
                  onChange(next)
                }}
              />
              <input
                className={styles.input}
                placeholder={required ? 'Required value' : 'Value'}
                value={row.value}
                readOnly={readOnly}
                aria-required={required}
                onChange={(event) => {
                  const next = [...attributes]
                  next[index] = { ...row, value: event.target.value }
                  onChange(next)
                }}
              />
              {required ? (
                <span
                  className={styles.requiredBadge}
                  title="Required. You can edit the value, but you cannot remove this attribute."
                >
                  Required
                </span>
              ) : readOnly ? (
                <span className={styles.removePlaceholder} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onChange(attributes.filter((_, i) => i !== index))}
                  aria-label="Remove attribute"
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
