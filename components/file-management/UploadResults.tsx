'use client'

import styles from './UploadResults.module.scss'

interface UploadResultsProps {
  data: {
    message: string
    filename: string
    saved_as: string
    file_size_bytes: number
    manufacturer_id?: number
    uploaded_at: string
    data_info: {
      rows: number
      columns: number
      column_names: string[]
      preview: any[]
    }
  }
}

export default function UploadResults({ data }: UploadResultsProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.successIcon}>✅</div>
        <h2 className={styles.title}>Upload Successful!</h2>
      </div>

      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>Filename</span>
          <span className={styles.infoValue}>{data.filename}</span>
        </div>

        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>File Size</span>
          <span className={styles.infoValue}>{formatFileSize(data.file_size_bytes)}</span>
        </div>

        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>Uploaded At</span>
          <span className={styles.infoValue}>{formatDate(data.uploaded_at)}</span>
        </div>

        {data.manufacturer_id && (
          <div className={styles.infoCard}>
            <span className={styles.infoLabel}>Manufacturer ID</span>
            <span className={styles.infoValue}>{data.manufacturer_id}</span>
          </div>
        )}
      </div>

      <div className={styles.dataSection}>
        <h3 className={styles.sectionTitle}>📊 Data Summary</h3>
        <div className={styles.dataStats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{data.data_info.rows}</span>
            <span className={styles.statLabel}>Rows</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{data.data_info.columns}</span>
            <span className={styles.statLabel}>Columns</span>
          </div>
        </div>

        <div className={styles.columns}>
          <h4 className={styles.columnsTitle}>Columns:</h4>
          <div className={styles.columnsList}>
            {data.data_info.column_names.map((col, idx) => (
              <span key={idx} className={styles.columnBadge}>
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>

      {data.data_info.preview && data.data_info.preview.length > 0 && (
        <div className={styles.previewSection}>
          <h3 className={styles.sectionTitle}>👁️ Data Preview (First 5 rows)</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  {data.data_info.column_names.map((col, idx) => (
                    <th key={idx}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data_info.preview.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {data.data_info.column_names.map((col, colIdx) => (
                      <td key={colIdx}>
                        {row[col] !== null && row[col] !== undefined 
                          ? String(row[col]) 
                          : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

