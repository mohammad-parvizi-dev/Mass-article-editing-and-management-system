/**
 * Resilient CSV Parser and Serializer obeying RFC 4180
 * Handles double-quoted fields, escaped quotes, commas inside text, and multiple newlines inside bodies.
 */

export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          // Escaped quote: "" inside quoted field means a single "
          cell += '"';
          i++; // Skip the second quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n" || char === "\r") {
        row.push(cell);
        cell = "";
        if (row.length > 1 || row[0] !== "") {
          result.push(row);
        }
        row = [];
        if (char === "\r" && next === "\n") {
          i++; // Skip secondary char for Windows style CRLF
        }
      } else {
        cell += char;
      }
    }
  }

  // Push final cell and row
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    result.push(row);
  }

  return result;
}

export function serializeToCSV(headers: string[], items: any[]): string {
  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    // If field contains quotes, commas, or newlines, quote the field and double up quotes
    if (str.includes(",") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headerRow = headers.join(",");
  const itemRows = items.map((item) => {
    return headers.map((header) => escapeCell(item[header])).join(",");
  });

  return [headerRow, ...itemRows].join("\n");
}
