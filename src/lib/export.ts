import { toast } from "sonner";

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function buildCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printTable(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const ths = headers.map((h) => `<th>${h}</th>`).join("");
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c == null ? "—" : String(c)}</td>`).join("")}</tr>`)
    .join("");

  const timestamp = new Date().toLocaleString("en-MY", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: A4;
    margin: 18mm 16mm 24mm 16mm;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 9px;
      font-family: 'Inter', system-ui, sans-serif;
      color: #999;
    }
  }

  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #111;
    background: #fff;
    padding: 36px 44px 28px;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 18px;
    border-bottom: 3px solid #111;
    margin-bottom: 28px;
  }

  .wordmark {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -1.5px;
    line-height: 1;
    color: #111;
    user-select: none;
  }
  .wordmark .dot { color: #c4f542; }

  .report-meta { text-align: right; }

  .report-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: #111;
    margin-bottom: 4px;
  }

  .report-subtitle {
    font-size: 11px;
    color: #555;
    line-height: 1.65;
  }

  .platform-badge {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 10px;
    background: #c4f542;
    border: 2px solid #111;
    border-radius: 99px;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #111;
  }

  /* ── Table ── */
  .table-wrap { flex: 1; }

  table {
    width: 100%;
    border-collapse: collapse;
    border-top: 2px solid #111;
    border-bottom: 2px solid #111;
  }

  thead tr { background: #c4f542; }

  th {
    text-align: left;
    padding: 10px 14px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #111;
    border-bottom: 2px solid #111;
    white-space: nowrap;
  }

  tbody tr:nth-child(odd)  { background: #fff; }
  tbody tr:nth-child(even) { background: #fdf7e8; }

  td {
    padding: 9px 14px;
    border-bottom: 1px solid #e6e0d0;
    font-size: 11.5px;
    line-height: 1.45;
    color: #222;
  }

  tbody tr:last-child td { border-bottom: none; }

  /* ── Footer ── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 22px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    font-size: 10px;
    color: #aaa;
  }

  /* ── Print ── */
  @media print {
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="wordmark">Aura<span class="dot">.</span></div>
    <div class="report-meta">
      <div class="report-title">${title}</div>
      <div class="report-subtitle">${subtitle}</div>
      <span class="platform-badge">Aura Exam Platform</span>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>Aura Exam Platform &mdash; Confidential</span>
    <span>Generated ${timestamp}</span>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1080,height=800");
  if (!win) { toast.error("Please allow pop-ups to open the print preview."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Wait for Inter to load before triggering print so the font renders correctly.
  const trigger = () => setTimeout(() => win.print(), 150);
  if ((win.document as any).fonts?.ready) {
    (win.document as any).fonts.ready.then(trigger);
  } else {
    setTimeout(trigger, 700);
  }
}
