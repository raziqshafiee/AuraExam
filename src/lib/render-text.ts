/**
 * Converts **bold**, *italic*, and `code` markers to HTML.
 * Input is HTML-encoded first so user content cannot inject tags.
 */
export function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class=\"font-mono bg-secondary px-1 rounded text-[0.85em]\">$1</code>");
}

/** Strips markdown markers for plain-text contexts (truncated previews, etc.). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
