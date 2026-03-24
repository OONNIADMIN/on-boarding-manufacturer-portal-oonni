# Oonni Onboarding Frontend

Modern Next.js frontend application for uploading and managing manufacturer product catalogs. conect db

## Features  

✨ **Drag & Drop File Upload** - Intuitive file upload with drag and drop support
📊 **Real-time Preview** - See data preview immediately after upload
📂 **File Management** - View and delete uploaded files
🎨 **Modern UI** - Beautiful, responsive design with smooth animations
📱 **Mobile Responsive** - Works perfectly on all devices

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **CSS Modules** - Scoped styling
- **Axios** - HTTP client for API calls

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Backend API running on `http://localhost:8000`

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
# Create .env.local file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

4. Run the development server:
```bash
npm run dev
```

5. Open your browser and visit:
```
http://localhost:4200
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main upload page
│   ├── page.module.css     # Page styles
│   └── globals.css         # Global styles
├── components/
│   ├── FileUpload.tsx      # File upload component with drag & drop
│   ├── FileUpload.module.css
│   ├── UploadResults.tsx   # Display upload results
│   ├── UploadResults.module.css
│   ├── FilesList.tsx       # List uploaded files
│   └── FilesList.module.css
├── lib/
│   └── api.ts              # API client for backend
├── package.json
├── tsconfig.json
└── next.config.js
```

## Available Scripts

- `npm run dev` - Start development server (http://localhost:4200)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

Create a `.env.local` file in the frontend directory:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Usage

### Uploading Files

1. **Drag & Drop**: Drag a CSV or Excel file into the upload zone
2. **Click to Browse**: Click the upload zone to select a file
3. **Add Manufacturer ID** (optional): Enter a manufacturer ID
4. **Upload**: Click the "Upload File" button

### Supported File Types

- CSV (`.csv`)
- Excel (`.xlsx`, `.xls`)

### File Size Limit

Maximum file size: **10 MB**

## Features Overview

### 1. File Upload Component
- Drag and drop functionality
- File type validation
- File size validation
- Visual feedback for drag states
- Loading states during upload

### 2. Upload Results Display
- Success confirmation
- File metadata display
- Data summary (rows, columns)
- Column names list
- Preview of first 5 rows
- Formatted file size and dates

### 3. Files List
- View all uploaded files
- File metadata (size, upload date)
- Delete files
- Refresh list
- Empty state handling
- Loading states

## API Integration

The frontend communicates with the FastAPI backend through the following endpoints:

- **POST** `/catalogs/upload` - Upload a file
- **GET** `/catalogs/uploads` - List all files
- **DELETE** `/catalogs/upload/{filename}` - Delete a file
- **GET** `/health` - Backend health check

## Styling

The application uses:
- CSS Modules for component-scoped styles
- CSS custom properties (variables) for theming
- Responsive design with mobile-first approach
- Modern gradient backgrounds
- Smooth transitions and animations

## Development Tips

### Testing Locally

1. Make sure the backend is running:
```bash
cd backend
uvicorn app.main:app --reload
```

2. Start the frontend:
```bash
cd frontend
npm run dev
```

3. Test file upload with sample CSV/Excel files

### Building for Production

```bash
npm run build
npm run start
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Backend Connection Issues

If you see errors connecting to the backend:

1. Verify backend is running: `http://localhost:8000/health`
2. Check CORS settings in backend
3. Verify `NEXT_PUBLIC_API_URL` in `.env.local`

### File Upload Fails

1. Check file type is CSV or Excel
2. Verify file size is under 10MB
3. Check backend logs for errors
4. Ensure `uploads/catalogs/` directory exists in backend

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Private - Oonni Platform

