'use client'

import { useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'
import { User } from '@/types'
import styles from './Header.module.scss'

interface HeaderProps {
  title: string
  subtitle: string
  user: User | null
  showBackButton?: boolean
  backButtonText?: string
  onBackClick?: () => void
  onLogout?: () => void
  showNavigation?: boolean
  currentPage?: 'dashboard' | 'Onboard' | 'profile' | 'manufacturers' | 'statistics' | 'images' | 'historical' | 'catalogs'
  navStyle?: 'default' | 'flat'
}

export default function Header({
  title,
  subtitle,
  user,
  showBackButton = false,
  backButtonText = 'Back',
  onBackClick,
  onLogout,
  showNavigation = false,
  currentPage,
  navStyle = 'default'
}: HeaderProps) {
  const router = useRouter()

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      authAPI.logout()
      router.push('/login')
    }
  }


  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick()
    } else if (user && authAPI.isAdmin(user)) {
      router.push('/dashboard')
    } else {
      router.push('/onboard')
    }
  }

  const handleNavigation = (page: string) => {
    switch (page) {
      case 'dashboard':
        router.push('/dashboard')
        break
      case 'onboard':
        router.push('/onboard')
        break
      case 'historical':
          router.push('/historical')
          break          
      case 'profile':
          router.push('/profile')
          break
        case 'images':
        router.push('/images')
        break
      default:
        break
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <img src="/oonni_logo.png" alt="Oonni Logo" className={styles.logo} />
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          {showBackButton && (
            <button 
              onClick={handleBackClick} 
              className={styles.homeButton}
              title={backButtonText}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" 
                />
              </svg>
            </button>
          )}
          <button onClick={handleLogout} className={styles.logoutButton}>
            Log out
          </button>
        </div>
      </div>
      
      {showNavigation && (
        <nav className={`${styles.navigation} ${navStyle === 'flat' ? styles.navigationFlat : ''}`}>
          <div className={styles.navContent}>
            <div className={styles.navLinks}>
              {user && authAPI.isAdmin(user) && (
                <>
                  <button
                    onClick={() => handleNavigation('dashboard')}
                    className={`${styles.navLink} ${currentPage === 'dashboard' ? styles.active : ''}`}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
                    </svg>
                    Dashboard
                  </button>
                  
                  <button
                    onClick={() => handleNavigation('images')}
                    className={`${styles.navLink} ${currentPage === 'images' ? styles.active : ''}`}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Images
                  </button>
                </>
              )}
              
              {user && !authAPI.isAdmin(user) && (
                <>
                <button
                  onClick={() => handleNavigation('Onboard')}
                  className={`${styles.navLink} ${currentPage === 'Onboard' ? styles.active : ''}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Onboard
                </button>

                  
                <button
                onClick={() => handleNavigation('historical')}
                className={`${styles.navLink} ${currentPage === 'historical' ? styles.active : ''}`}
              >
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Historical
              </button>
              </>
              )}


              <button
                onClick={() => handleNavigation('profile')}
                className={`${styles.navLink} ${currentPage === 'profile' ? styles.active : ''}`}
              >
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </button>

            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
