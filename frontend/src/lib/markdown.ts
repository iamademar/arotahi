/**
 * Small markdown renderer for the model card. The card is a known, trusted
 * document served by our own API, and it uses only headings, paragraphs, lists,
 * tables, bold, inline code and links. Input is escaped before any markup is
 * introduced, so a change to the card cannot inject HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

function renderTable(rows: string[]): string {
  const cells = (line: string) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim())

  const header = cells(rows[0])
  const body = rows.slice(2).map(cells)

  const head = `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`
  const rest = body
    .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead>${head}</thead><tbody>${rest}</tbody></table>`
}

export function renderMarkdown(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (/^\|/.test(line) && index + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[index + 1])) {
      const block: string[] = []
      while (index < lines.length && /^\|/.test(lines[index])) block.push(lines[index++])
      out.push(renderTable(block))
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(/^\s*[-*]\s+/, ''))}</li>`)
        index += 1
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (line.trim() === '') {
      index += 1
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\|/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }

  return out.join('\n')
}
