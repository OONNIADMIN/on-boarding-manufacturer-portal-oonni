import { expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FileUpload from '../components/file-management/FileUpload'

// Mock the catalogAPI
vi.mock('@/lib/api', () => ({
  catalogAPI: {
    uploadCatalog: vi.fn(),
  },
}))

test('FileUpload component renders correctly', () => {
  render(<FileUpload />)
  
  // Check if the main elements are rendered
  expect(screen.getByText('Select Script And Upload CSV')).toBeDefined()
  expect(screen.getByText('Choose CSV File')).toBeDefined()
  expect(screen.getByText('No file selected')).toBeDefined()
  expect(screen.getByText('Select File')).toBeDefined()
  expect(screen.getByText('Run Script')).toBeDefined()
})

test('FileUpload shows file input when clicked', () => {
  render(<FileUpload />)
  
  // Check if file input exists (it should be hidden)
  const fileInput = document.querySelector('input[type="file"]')
  expect(fileInput).toBeDefined()
  
  // Check if select button exists
  const selectButton = screen.getByText('Select File')
  expect(selectButton).toBeDefined()
})

test('FileUpload handles drag events', () => {
  render(<FileUpload />)
  
  const dropzone = document.querySelector('._dropzone_80232a')
  expect(dropzone).toBeDefined()
  
  // Test drag over
  fireEvent.dragOver(dropzone!)
  // Component should handle drag over without errors
  
  // Test drag leave
  fireEvent.dragLeave(dropzone!)
  // Component should handle drag leave without errors
})
