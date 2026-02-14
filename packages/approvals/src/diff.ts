export function diffText(approved: string, received: string): string {
  const aLines = splitLines(approved)
  const bLines = splitLines(received)
  const lcs = buildLcsTable(aLines, bLines)
  const lines: string[] = []

  lines.push('--- approved')
  lines.push('+++ received')

  let i = aLines.length
  let j = bLines.length
  const out: string[] = []
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      out.push(' ' + aLines[i - 1])
      i -= 1
      j -= 1
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.push('-' + aLines[i - 1])
      i -= 1
    } else {
      out.push('+' + bLines[j - 1])
      j -= 1
    }
  }
  while (i > 0) {
    out.push('-' + aLines[i - 1])
    i -= 1
  }
  while (j > 0) {
    out.push('+' + bLines[j - 1])
    j -= 1
  }

  lines.push(...out.reverse())
  return lines.join('\n') + '\n'
}

function splitLines(input: string): string[] {
  return input.replace(/\r\n/g, '\n').split('\n')
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  )
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
  }
  return table
}
