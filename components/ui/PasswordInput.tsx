'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import styles from './PasswordInput.module.scss'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export default function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={styles.wrap}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={className}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? (
          <EyeOff strokeWidth={1.6} size={20} aria-hidden />
        ) : (
          <Eye strokeWidth={1.6} size={20} aria-hidden />
        )}
      </button>
    </div>
  )
}
