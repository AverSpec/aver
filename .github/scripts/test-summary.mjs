import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const dir = 'test-results'
const xmlFiles = readdirSync(dir).filter(f => f.endsWith('.xml')).sort()

const packages = []
let totalTests = 0, totalFail = 0, totalSkip = 0

for (const file of xmlFiles) {
  const name = basename(file, '.xml')
  const xml = readFileSync(join(dir, file), 'utf-8')

  const root = xml.match(/<testsuites[^>]*>/)
  if (!root) continue

  const attr = (s, key) => parseInt(s.match(new RegExp(`${key}="(\\d+)"`))?.[1] || '0')
  const tests = attr(root[0], 'tests')
  const failures = attr(root[0], 'failures') + attr(root[0], 'errors')
  const skipped = attr(root[0], 'skipped') || attr(root[0], 'disabled')
  const time = root[0].match(/time="([^"]*)"/)?.[1] || '0'

  totalTests += tests
  totalFail += failures
  totalSkip += skipped

  // Extract failing testcases by matching each <testcase>...</testcase> block
  const failingTests = []
  const blocks = xml.match(/<testcase\b[^/]*?>[\s\S]*?<\/testcase>/g) || []
  for (const block of blocks) {
    if (!/<failure/.test(block)) continue
    const suite = decode(block.match(/classname="([^"]*)"/)?.[1] || '')
    const tname = decode(block.match(/ name="([^"]*)"/)?.[1] || '')
    const message = decode(block.match(/<failure[^>]*message="([^"]*)"/)?.[1] || '')
    const trace = decode(block.match(/<failure[^>]*>([\s\S]*?)<\/failure>/)?.[1] || '').trim()
    failingTests.push({ suite, name: tname, message, trace })
  }

  packages.push({ name, tests, failures, skipped, time, passed: tests - failures - skipped, failingTests })
}

// Build markdown
let md = '### Test Results\n\n'
md += '| Package | Tests | Passed | Failed | Skipped | Time |\n'
md += '|---------|------:|-------:|-------:|--------:|-----:|\n'

for (const pkg of packages) {
  const icon = pkg.failures > 0 ? '\u274C' : '\u2705'
  md += `| ${icon} ${pkg.name} | ${pkg.tests} | ${pkg.passed} | ${pkg.failures} | ${pkg.skipped} | ${pkg.time}s |\n`
}

md += '\n'
const totalPass = totalTests - totalFail - totalSkip
if (totalFail > 0) {
  md += `**${totalTests} tests: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped**\n`
} else {
  md += `**${totalTests} tests: all passed \u2705**\n`
}

// Failure details
const failing = packages.filter(p => p.failures > 0)
if (failing.length > 0) {
  md += '\n---\n\n'
  for (const pkg of failing) {
    md += `<details>\n<summary>\u274C <strong>${pkg.name}</strong> \u2014 ${pkg.failures} failure${pkg.failures !== 1 ? 's' : ''}</summary>\n\n`
    for (const t of pkg.failingTests) {
      const label = t.suite ? `${t.suite} > ${t.name}` : t.name
      md += `**\`${label}\`**\n`
      const detail = t.message || t.trace
      const lines = detail.split('\n').slice(0, 15).join('\n')
      md += `\`\`\`\n${lines}\n\`\`\`\n\n`
    }
    md += '</details>\n\n'
  }
}

process.stdout.write(md)

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
