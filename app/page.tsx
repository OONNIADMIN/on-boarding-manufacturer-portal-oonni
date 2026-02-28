'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is authenticated
    const token = authAPI.getToken()
    const user = authAPI.getStoredUser()

    if (token && user) {
      // Redirect authenticated users to catalogs
      router.push('/catalogs')
    } else {
      // Redirect to login if not authenticated
      router.push('/login')
    }
  }, [router])

  // Show loading state while redirecting
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      backgroundColor: 'var(--oonni-bg)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{
          border: '4px solid rgba(90, 158, 142, 0.2)',
          borderTop: '4px solid var(--oonni-green)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }}></div>
        <p style={{ marginTop: '1rem', color: 'var(--gray-700)' }}>Loading...</p>
      </div>
    </div>
  )
}
