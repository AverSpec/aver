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

  const num = (s, key) => parseInt(s.match(new RegExp(`${key}="(\\d+)"`))?.[1] || '0')
  const tests = num(root[0], 'tests')
  const failures = num(root[0], 'failures') + num(root[0], 'errors')
  const skipped = num(root[0], 'skipped') || num(root[0], 'disabled')
  const time = parseFloat(root[0].match(/time="([^"]*)"/)?.[1] || '0')

  totalTests += tests
  totalFail += failures
  totalSkip += skipped

  // Extract per-file test suites
  const suites = []
  const suiteBlocks = xml.match(/<testsuite\b[^>]*>[\s\S]*?<\/testsuite>/g) || []
  for (const block of suiteBlocks) {
    const sName = decode(block.match(/ name="([^"]*)"/)?.[1] || '')
    const sTests = num(block, 'tests')
    const sFail = num(block, 'failures') + num(block, 'errors')
    const sSkip = num(block, 'skipped')
    const sTime = parseFloat(block.match(/ time="([^"]*)"/)?.[1] || '0')
    suites.push({ name: sName, tests: sTests, failures: sFail, skipped: sSkip, time: sTime })
  }

  // Extract failing testcases
  const failingTests = []
  const blocks = xml.match(/<testcase\b[^>]*>[\s\S]*?<\/testcase>/g) || []
  for (const block of blocks) {
    if (!/<failure/.test(block)) continue
    const suite = decode(block.match(/classname="([^"]*)"/)?.[1] || '')
    const tname = decode(block.match(/ name="([^"]*)"/)?.[1] || '')
    const message = decode(block.match(/<failure[^>]*message="([^"]*)"/)?.[1] || '')
    const trace = decode(block.match(/<failure[^>]*>([\s\S]*?)<\/failure>/)?.[1] || '').trim()
    failingTests.push({ suite, name: tname, message, trace })
  }

  packages.push({ name, tests, failures, skipped, time, passed: tests - failures - skipped, failingTests, suites })
}

// Build markdown
let md = '### Test Results\n\n'
md += '| Package | Tests | Passed | Failed | Skipped | Time |\n'
md += '|---------|------:|-------:|-------:|--------:|-----:|\n'

for (const pkg of packages) {
  const icon = pkg.failures > 0 ? '\u274C' : '\u2705'
  md += `| ${icon} **${pkg.name}** | ${pkg.tests} | ${pkg.passed} | ${pkg.failures} | ${pkg.skipped} | ${fmt(pkg.time)} |\n`
}

md += '\n'
const totalPass = totalTests - totalFail - totalSkip
if (totalFail > 0) {
  md += `**${totalTests} tests: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped**\n`
} else {
  md += `**${totalTests} tests: all passed \u2705**\n`
}

// Per-package test file breakdown
md += '\n---\n\n'
for (const pkg of packages) {
  const icon = pkg.failures > 0 ? '\u274C' : '\u2705'
  md += `<details>\n<summary>${icon} <strong>${pkg.name}</strong> \u2014 ${pkg.tests} tests in ${pkg.suites.length} files (${fmt(pkg.time)})</summary>\n\n`

  if (pkg.suites.length > 0) {
    md += '| File | Tests | Failed | Time |\n'
    md += '|------|------:|-------:|-----:|\n'
    for (const s of pkg.suites) {
      const sIcon = s.failures > 0 ? '\u274C' : '\u2705'
      md += `| ${sIcon} ${s.name} | ${s.tests} | ${s.failures} | ${fmt(s.time)} |\n`
    }
  }

  // Inline failure details for this package
  if (pkg.failingTests.length > 0) {
    md += '\n'
    for (const t of pkg.failingTests) {
      const label = t.suite ? `${t.suite} > ${t.name}` : t.name
      md += `**\`${label}\`**\n`
      const detail = t.message || t.trace
      const lines = detail.split('\n').slice(0, 15).join('\n')
      md += `\`\`\`\n${lines}\n\`\`\`\n\n`
    }
  }

  md += '</details>\n\n'
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

function fmt(seconds) {
  if (seconds < 0.001) return '<1ms'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  return `${seconds.toFixed(1)}s`
}
