import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface JUnitTestCase {
  name: string
  classname: string
  time: number
  failure?: {
    message: string
    body: string
  }
}

export interface JUnitTestSuite {
  name: string
  tests: number
  failures: number
  time: number
  testCases: JUnitTestCase[]
}

export interface JUnitReport {
  name: string
  testSuites: JUnitTestSuite[]
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateJUnitXml(report: JUnitReport): string {
  const totalTests = report.testSuites.reduce((sum, s) => sum + s.tests, 0)
  const totalFailures = report.testSuites.reduce((sum, s) => sum + s.failures, 0)
  const totalTime = report.testSuites.reduce((sum, s) => sum + s.time, 0)

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<testsuites name="${escapeXml(report.name)}" tests="${totalTests}" failures="${totalFailures}" time="${totalTime.toFixed(3)}">\n`

  for (const suite of report.testSuites) {
    xml += `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" time="${suite.time.toFixed(3)}">\n`
    for (const tc of suite.testCases) {
      if (tc.failure) {
        xml += `    <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}">\n`
        xml += `      <failure message="${escapeXml(tc.failure.message)}">${escapeXml(tc.failure.body)}</failure>\n`
        xml += `    </testcase>\n`
      } else {
        xml += `    <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}" />\n`
      }
    }
    xml += `  </testsuite>\n`
  }

  xml += `</testsuites>\n`
  return xml
}

interface AverReporterOptions {
  output?: string
}

export function averReporter(options: AverReporterOptions = {}) {
  const outputFile = options.output ?? 'test-results.xml'

  return {
    name: 'aver-junit',

    onFinished(files?: any[], errors?: unknown[]) {
      const testSuites: JUnitTestSuite[] = []

      for (const file of files ?? []) {
        const suite = fileToTestSuite(file)
        if (suite) testSuites.push(suite)
      }

      const xml = generateJUnitXml({ name: 'aver', testSuites })

      mkdirSync(dirname(outputFile), { recursive: true })
      writeFileSync(outputFile, xml)
    },
  }
}

function fileToTestSuite(file: any): JUnitTestSuite | null {
  const testCases: JUnitTestCase[] = []
  collectTests(file, testCases)

  if (testCases.length === 0) return null

  const failures = testCases.filter(tc => tc.failure).length

  return {
    name: file.name ?? file.filepath ?? 'unknown',
    tests: testCases.length,
    failures,
    time: testCases.reduce((sum, tc) => sum + tc.time, 0),
    testCases,
  }
}

function collectTests(task: any, results: JUnitTestCase[]): void {
  if (task.type === 'test' || task.type === 'custom') {
    const duration = task.result?.duration ?? 0
    const tc: JUnitTestCase = {
      name: task.name,
      classname: getClassname(task),
      time: duration / 1000,
    }

    if (task.result?.state === 'fail') {
      const error = task.result.errors?.[0]
      const message = error?.message ?? 'Test failed'
      const body = error?.stackStr ?? error?.stack ?? message
      tc.failure = { message, body }
    }

    results.push(tc)
  }

  if (task.tasks) {
    for (const child of task.tasks) {
      collectTests(child, results)
    }
  }
}

function getClassname(task: any): string {
  const parts: string[] = []
  let current = task.suite
  while (current && current.name) {
    parts.unshift(current.name)
    current = current.suite
  }
  return parts.join(' > ') || task.file?.name || 'unknown'
}
