import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import Home from '../app/page'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock the authAPI
vi.mock('@/lib/api', () => ({
  authAPI: {
    getToken: vi.fn(),
    getStoredUser: vi.fn(),
  },
}))

test('Home component renders loading state', () => {
  const mockPush = vi.fn()
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  } as any)

  render(<Home />)
  
  // Check if loading text is displayed
  expect(screen.getByText('Loading...')).toBeDefined()
  
  // Check if spinner element exists
  const spinner = document.querySelector('.spinner')
  expect(spinner).toBeDefined()
})
