# Vitest Testing Configuration

## Available Scripts

- `npm run test` - Run tests in watch mode (recommended for development)
- `npm run test:run` - Run tests once and exit (good for CI/CD)
- `npm run test:ui` - Run tests with UI interface

## Test Structure

Tests are located in the `__tests__` directory and follow these naming conventions:
- `*.test.tsx` - Component tests
- `*.test.ts` - Utility/function tests

## Writing Tests

### Component Tests
```typescript
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from '../components/MyComponent'

test('MyComponent renders correctly', () => {
  render(<MyComponent />)
  expect(screen.getByText('Expected Text')).toBeDefined()
})
```

### API Tests
```typescript
import { expect, test, vi } from 'vitest'
import { authAPI } from '@/lib/api'

// Mock external dependencies
vi.mock('@/lib/api', () => ({
  authAPI: {
    login: vi.fn(),
  },
}))

test('API function works correctly', () => {
  // Test implementation
})
```

## Mocking

- Use `vi.mock()` to mock modules
- Use `vi.fn()` to create mock functions
- Mock Next.js router with `vi.mock('next/navigation')`

## Best Practices

1. Test user interactions, not implementation details
2. Use `screen.getByRole()` when possible for accessibility
3. Mock external dependencies
4. Keep tests focused and simple
5. Use descriptive test names
