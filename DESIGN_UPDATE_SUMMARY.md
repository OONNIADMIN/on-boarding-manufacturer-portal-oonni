# Oonni Design System Update

## Overview
Updated the entire frontend application to match the Oonni brand design system with a clean, professional look featuring teal header and light beige background.

## Color Scheme

### Brand Colors
- **Oonni Teal**: `#1a5959` (Header background)
- **Oonni Teal Dark**: `#134444` (Header hover states)
- **Oonni Green**: `#5a9e8e` (Primary buttons, accents)
- **Oonni Green Hover**: `#4a8e7e` (Button hover states)
- **Background**: `#e8e8e3` (Main page background)
- **Background Light**: `#f5f5f0` (Card backgrounds)

### UI Colors
- **Table Border**: `#d4d4d4`
- **Table Header BG**: `#f5f5f5`
- **Table Hover**: `#fafafa`

## Files Updated

### Global Styles
- **`app/globals.css`**: Updated CSS variables with Oonni color scheme

### Pages
1. **`app/page.tsx`**: Updated loading spinner with Oonni colors
2. **`app/login/page.tsx`** & **`app/login/page.module.css`**: 
   - Changed background to Oonni beige
   - Updated button colors to Oonni green
   - Updated focus states

3. **`app/dashboard/page.tsx`** & **`app/dashboard/page.module.css`**:
   - Added Oonni teal header with logo
   - Updated all gradient colors to Oonni green
   - Added content wrapper for consistent spacing
   - Simplified navigation buttons

4. **`app/catalogs/page.tsx`** & **`app/catalogs/page.module.css`**:
   - Added Oonni teal header with logo
   - Simplified header navigation
   - Changed background to Oonni beige
   - Updated loading states

### Components

1. **FileUpload Component** (`components/FileUpload.tsx` & `.module.css`):
   - Redesigned to horizontal layout matching the image
   - Added script selector dropdown (Categories, Products, Inventory)
   - Styled "Select File" button with Oonni teal
   - Styled "Run Script" button with Oonni green
   - Cleaner, more compact design

2. **FilesList Component** (`components/FilesList.tsx` & `.module.css`):
   - Converted from card layout to clean table layout
   - Added proper table headers (Type, Filename, Size, Uploaded At, Actions)
   - Updated "Refresh Log" button to Oonni green
   - Applied consistent table styling with borders
   - Added hover states for table rows

3. **UploadResults Component** (`components/UploadResults.module.css`):
   - Updated stat cards to use Oonni green
   - Applied consistent table styling
   - Updated borders and spacing

4. **CreateSellerModal Component** (`components/CreateSellerModal.module.css`):
   - Updated button colors to Oonni green
   - Updated focus states with Oonni colors

## Key Design Features

### Header
- Dark teal background (`#1a5959`)
- White "oonni" logo text
- Minimal navigation buttons
- "Log out" instead of "Logout"
- "Refresh Log" for file refresh

### Layout
- Clean white cards with subtle shadows
- Light beige page background
- Generous spacing and padding
- Consistent border radius (8px for cards)

### Tables
- Light gray borders
- Alternating row hover states
- Consistent header styling
- Clean typography

### Buttons
- Primary actions: Oonni green (`#5a9e8e`)
- Secondary actions: Oonni teal (`#1a5959`)
- Subtle hover effects (no elevation changes)
- Consistent border radius (6px)

### Forms
- Clean input fields with subtle borders
- Focus states using Oonni green
- Dropdown selectors for script types
- Inline file selection layout

## Responsive Design
- All components maintain responsive behavior
- Tables scroll horizontally on mobile
- Grid layouts adjust for smaller screens
- Touch-friendly button sizes

## Browser Compatibility
- Modern CSS variables used throughout
- Fallback colors where needed
- Standard border-radius values
- Compatible with all modern browsers

## Next Steps (Optional Enhancements)
1. Add Oonni logo image/SVG instead of text
2. Add more script type options based on backend support
3. Implement pagination for file lists
4. Add filtering/sorting capabilities to tables
5. Add dark mode support (optional)

