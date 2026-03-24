declare module "exceljs" {
  interface Row {
    font?: { bold?: boolean };
    fill?: {
      type?: string;
      pattern?: string;
      fgColor?: { argb: string };
    };
  }

  interface Cell {
    dataValidation?: {
      type: string;
      allowBlank?: boolean;
      formulae: string[];
      showErrorMessage?: boolean;
      errorStyle?: string;
      errorTitle?: string;
      error?: string;
    };
  }

  interface Worksheet {
    addRow(values: unknown[]): void;
    getRow(n: number): Row;
    getCell(ref: string): Cell;
    getColumn(n: number): { width?: number };
  }

  interface Workbook {
    creator: string;
    created: Date;
    addWorksheet(name: string, opts?: Record<string, unknown>): Worksheet;
    xlsx: { writeBuffer(): Promise<Buffer | ArrayBuffer | Uint8Array> };
  }

  const ExcelJS: { Workbook: new () => Workbook };
  export default ExcelJS;
}
