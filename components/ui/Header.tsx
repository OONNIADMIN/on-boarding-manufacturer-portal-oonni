'use client'

import { useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'
import { User } from '@/types'
import { CircleUserRound } from 'lucide-react'
import { PORTAL_TITLE } from '@/lib/constants'
import CatalogImportBanner from './CatalogImportBanner'
import styles from './Header.module.scss'

export { PORTAL_TITLE }

interface HeaderProps {
  title?: string
  subtitle: string
  user: User | null
  onLogout?: () => void
  showNavigation?: boolean
  currentPage?: 'dashboard' | 'catalogTemplate' | 'Onboard' | 'profile' | 'manufacturers' | 'statistics' | 'images' | 'historical' | 'catalogs' | 'catalogColumns' | 'inventory' | 'logs'
  navStyle?: 'default' | 'flat'
}

export default function Header({
  title = PORTAL_TITLE,
  user,
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

  const handleNavigation = (page: string) => {
    const p = page.toLowerCase()
    switch (p) {
      case 'dashboard':
        router.push('/dashboard')
        break
      case 'catalogtemplate':
        router.push('/onboard/template')
        break
      case 'onboard':
        router.push('/onboard')
        break
      case 'historical':
          router.push('/historical')
          break
      case 'inventory':
          router.push('/inventory')
          break
      case 'profile':
          router.push('/profile')
          break
        case 'images':
        router.push('/images')
        break
      case 'catalogcolumns':
        router.push('/admin/catalog-columns')
        break
      case 'logs':
        router.push('/admin/logs')
        break
      default:
        break
    }
  }

  return (
    <header className={`${styles.header} oonni-app-header`}>
      <div className={styles.headerContent}>
        <img
          src="/logo.svg"
          alt="Oonni Logo"
          className={`${styles.logo} ${showNavigation ? styles.logoHiddenDesktop : ''}`}
        />
        <div>
          <h1 className={styles.title}>
            <span className={styles.titleWithIcon}>
              {currentPage === 'Onboard' ? (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {/* Open-top tray (bottom stroke) + arrow up — outline style like design */}
                  <path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="7 10 12 5 17 10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <line
                    x1="12"
                    y1="5"
                    x2="12"
                    y2="16"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M8 3h5.5L18 7.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M13 3v4.5H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {title}
            </span>
          </h1>
        </div>
        <div className={styles.headerActions}>
          {user && (
            <div className={styles.welcomeBlock}>
              <CircleUserRound className={styles.welcomeIcon} aria-hidden="true" strokeWidth={1.6} />
              <span className={styles.welcomeText}>
                Welcome, {authAPI.isAdmin(user) ? 'Admin' : user.name}
              </span>
            </div>
          )}
          <button type="button" onClick={handleLogout} className={styles.logoutButton}>
            {/* Ring with NE gap + arrow through gap (reference mark, not refresh/log-in-door) */}
            <svg
              className={styles.logoutIcon}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle
                cx={12}
                cy={12}
                r={9}
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeDasharray="42.412 14.137"
              />
              <line
                x1={11.25}
                y1={12.75}
                x2={18.25}
                y2={5.75}
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
              <path
                d="M 17.05 7.35 L 18.25 5.75 L 17.05 4.15"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {user ? <CatalogImportBanner userId={user.id} /> : null}
      
      {showNavigation && (
        <nav
          className={`${styles.navigation} oonni-sidebar-nav ${navStyle === 'flat' ? styles.navigationFlat : ''}`}
        >
          <div className={styles.navBrand}>
            <img src="/logo.svg" alt="Oonni Logo" />
          </div>
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

                  <button
                    type="button"
                    onClick={() => handleNavigation('catalogColumns')}
                    className={`${styles.navLink} ${currentPage === 'catalogColumns' ? styles.active : ''}`}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
                    </svg>
                    Catalog columns
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavigation('inventory')}
                    className={`${styles.navLink} ${currentPage === 'inventory' ? styles.active : ''}`}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
                    </svg>
                    Items Management
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigation('logs')}
                    className={`${styles.navLink} ${currentPage === 'logs' ? styles.active : ''}`}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Error logs
                  </button>
                </>
              )}
              
              {user && !authAPI.isAdmin(user) && (
                <>
                <button
                  type="button"
                  onClick={() => handleNavigation('catalogTemplate')}
                  className={`${styles.navLink} ${currentPage === 'catalogTemplate' ? styles.active : ''}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Catalog template
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigation('Onboard')}
                  className={`${styles.navLink} ${currentPage === 'Onboard' ? styles.active : ''}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Onboard catalog
                </button>

                <button
                  type="button"
                  onClick={() => handleNavigation('historical')}
                  className={`${styles.navLink} ${currentPage === 'historical' ? styles.active : ''}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Historical
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigation('inventory')}
                  className={`${styles.navLink} ${currentPage === 'inventory' ? styles.active : ''}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
                  </svg>
                  Your catalog
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
