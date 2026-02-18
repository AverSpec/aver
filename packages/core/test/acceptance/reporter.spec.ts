import { describe } from 'vitest'
import { suite } from '../../src/index'
import { averReporter } from './domains/aver-reporter'
import { averReporterAdapter } from './adapters/aver-reporter.unit'

describe('JUnit Reporter (acceptance)', () => {
  const { test } = suite(averReporter, averReporterAdapter)

  test('generates valid XML with passing tests', async ({ act, assert }) => {
    await act.generateReport({
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

    await assert.xmlContains({ text: '<?xml version="1.0"' })
    await assert.xmlContains({ text: 'name="my-suite"' })
    await assert.hasTestCount({ count: 2 })
    await assert.hasFailureCount({ count: 0 })
  })

  test('includes failure details in XML', async ({ act, assert }) => {
    await act.generateReport({
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

    await assert.xmlContains({ text: '<failure message="Expected true to be false">' })
    await assert.hasFailureCount({ count: 1 })
  })

  test('escapes XML special characters', async ({ act, assert }) => {
    await act.generateReport({
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

    await assert.xmlContains({ text: '&lt;special&gt;' })
    await assert.xmlContains({ text: '&amp;' })
    await assert.xmlContains({ text: '&quot;chars&quot;' })
  })

  test('aggregates counts across multiple suites', async ({ act, assert }) => {
    await act.generateReport({
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

    await assert.hasTestCount({ count: 5 })
    await assert.hasFailureCount({ count: 1 })
  })
})
