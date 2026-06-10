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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;padding:32px;color:#111;font-size:13px}
h1{font-size:18px;font-weight:700;margin-bottom:4px}
.sub{color:#666;margin-bottom:20px;font-size:12px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px 10px;background:#f4f4f4;border-bottom:2px solid #111;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
td{padding:8px 10px;border-bottom:1px solid #e5e5e5}
tr:last-child td{border-bottom:none}
.footer{margin-top:20px;font-size:11px;color:#aaa}
@media print{body{padding:16px}}
</style>
</head>
<body>
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
<table>
<thead><tr>${ths}</tr></thead>
<tbody>${trs}</tbody>
</table>
<div class="footer">Generated ${new Date().toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" })} · Aura Exam Platform</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) { toast.error("Please allow pop-ups to open the print preview."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
