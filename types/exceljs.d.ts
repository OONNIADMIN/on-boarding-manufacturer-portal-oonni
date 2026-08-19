declare module "exceljs" {
  interface Font {
    bold?: boolean;
    color?: { argb?: string };
    size?: number;
    italic?: boolean;
  }

  interface Fill {
    type?: string;
    pattern?: string;
    fgColor?: { argb: string };
  }

  interface Note {
    texts: Array<{ text: string }>;
  }

  interface Cell {
    value?: unknown;
    font?: Font;
    fill?: Fill;
    note?: string | Note;
    alignment?: { wrapText?: boolean; vertical?: string };
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

  interface Row {
    font?: Font;
    fill?: Fill;
    height?: number;
    getCell(n: number | string): Cell;
    eachCell(cb: (cell: Cell, colNumber: number) => void): void;
    eachCell(opts: { includeEmpty?: boolean }, cb: (cell: Cell, colNumber: number) => void): void;
  }

  interface Column {
    header?: string;
    key?: string;
    width?: number;
  }

  interface Worksheet {
    name: string;
    columns: Column[];
    addRow(values?: unknown[] | Record<string, unknown>): Row;
    getRow(n: number): Row;
    getCell(ref: string): Cell;
    getColumn(n: number | string): Column;
    eachRow(cb: (row: Row, rowNumber: number) => void): void;
  }

  interface Workbook {
    creator: string;
    created: Date;
    worksheets: Worksheet[];
    addWorksheet(name: string, opts?: Record<string, unknown>): Worksheet;
    getWorksheet(name: string): Worksheet | undefined;
    xlsx: {
      writeBuffer(): Promise<Buffer | ArrayBuffer | Uint8Array>;
      load(data: ArrayBuffer | Buffer | Uint8Array): Promise<Workbook>;
    };
  }

  const ExcelJS: { Workbook: new () => Workbook };
  export default ExcelJS;
}
