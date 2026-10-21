import Papa from 'papaparse';

export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  return (result.data as unknown as string[][]).map((row) =>
    row.map((cell) => (cell == null ? '' : String(cell))),
  );
}

export function toCsv(rows: string[][]): string {
  return '\uFEFF' + Papa.unparse(rows);
}
