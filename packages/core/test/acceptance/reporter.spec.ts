import { describe } from 'vitest'
import { suite } from '../../src/index'
import { averReporter } from './domains/aver-reporter'
import { averReporterAdapter } from './adapters/aver-reporter.unit'

describe('JUnit Reporter (acceptance)', () => {
  const { test } = suite(averReporter, averReporterAdapter)

  test('generates valid XML with passing tests', async ({ when, then }) => {
    await when.generateReport({
      name: 'my-suite',
      suites: [{
        name: 'test-file.spec.ts',
        tests: 2,
        failures: 0,
        time: 1.5,
        testCases: [
          { name: 'passes first', classname: 'Suite', time: 0.5 },
          { name: 'passes second', classname: 'Suite', time: 1.0 },
        ],
      }],
    })

    await then.xmlContains({ text: '<?xml version="1.0"' })
    await then.xmlContains({ text: 'name="my-suite"' })
    await then.hasTestCount({ count: 2 })
    await then.hasFailureCount({ count: 0 })
  })

  test('includes failure details in XML', async ({ when, then }) => {
    await when.generateReport({
      name: 'failing-suite',
      suites: [{
        name: 'fail.spec.ts',
        tests: 1,
        failures: 1,
        time: 0.1,
        testCases: [{
          name: 'fails hard',
          classname: 'Suite',
          time: 0.1,
          failure: { message: 'Expected true to be false', body: 'Error: Expected true to be false\n  at ...' },
        }],
      }],
    })

    await then.xmlContains({ text: '<failure message="Expected true to be false">' })
    await then.hasFailureCount({ count: 1 })
  })

  test('escapes XML special characters', async ({ when, then }) => {
    await when.generateReport({
      name: 'escape-test',
      suites: [{
        name: 'xml.spec.ts',
        tests: 1,
        failures: 1,
        time: 0.1,
        testCases: [{
          name: 'test with <special> & "chars"',
          classname: 'Suite',
          time: 0.1,
          failure: { message: 'a < b & c > d', body: 'details' },
        }],
      }],
    })

    await then.xmlContains({ text: '&lt;special&gt;' })
    await then.xmlContains({ text: '&amp;' })
    await then.xmlContains({ text: '&quot;chars&quot;' })
  })

  test('aggregates counts across multiple suites', async ({ when, then }) => {
    await when.generateReport({
      name: 'multi-suite',
      suites: [
        {
          name: 'a.spec.ts',
          tests: 3,
          failures: 1,
          time: 1.0,
          testCases: [
            { name: 'a1', classname: 'A', time: 0.3 },
            { name: 'a2', classname: 'A', time: 0.3 },
            { name: 'a3', classname: 'A', time: 0.4, failure: { message: 'fail', body: 'details' } },
          ],
        },
        {
          name: 'b.spec.ts',
          tests: 2,
          failures: 0,
          time: 0.5,
          testCases: [
            { name: 'b1', classname: 'B', time: 0.2 },
            { name: 'b2', classname: 'B', time: 0.3 },
          ],
        },
      ],
    })

    await then.hasTestCount({ count: 5 })
    await then.hasFailureCount({ count: 1 })
  })
})
