import { describe, it, expect } from 'vitest'
import { generateJUnitXml } from '../../src/reporter/junit'

describe('generateJUnitXml', () => {
  it('generates valid XML for passing tests', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Scaffolding',
          tests: 2,
          failures: 0,
          time: 0.05,
          testCases: [
            { name: 'creates project structure', classname: 'Scaffolding', time: 0.02 },
            { name: 'generates config', classname: 'Scaffolding', time: 0.03 },
          ],
        },
      ],
    })

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<testsuites name="aver"')
    expect(xml).toContain('<testsuite name="Scaffolding"')
    expect(xml).toContain('<testcase name="creates project structure"')
    expect(xml).not.toContain('<failure')
  })

  it('includes failure message and action trace', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Domain init',
          tests: 1,
          failures: 1,
          time: 0.01,
          testCases: [
            {
              name: 'creates domain file',
              classname: 'Domain init',
              time: 0.01,
              failure: {
                message: 'expected true to be false',
                body: 'expected true to be false\n\nTest steps:\n  [PASS] ACT    AverInit.initProject({"dir":"/tmp/x"})\n  [FAIL] ACT    AverInit.initDomain({"dir":"/tmp/x","name":"task"})',
              },
            },
          ],
        },
      ],
    })

    expect(xml).toContain('<failure message="expected true to be false">')
    expect(xml).toContain('Test steps:')
    expect(xml).toContain('[PASS] ACT')
    expect(xml).toContain('AverInit.initProject')
    expect(xml).toContain('[FAIL] ACT')
    expect(xml).toContain('AverInit.initDomain')
  })

  it('escapes XML special characters', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Edge & "cases"',
          tests: 1,
          failures: 0,
          time: 0.01,
          testCases: [
            { name: 'handles <angles>', classname: 'Edge & "cases"', time: 0.01 },
          ],
        },
      ],
    })

    expect(xml).toContain('Edge &amp; &quot;cases&quot;')
    expect(xml).toContain('handles &lt;angles&gt;')
  })

  it('aggregates totals in root testsuites element', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Suite A',
          tests: 3,
          failures: 1,
          time: 0.1,
          testCases: [
            { name: 'test1', classname: 'Suite A', time: 0.03 },
            { name: 'test2', classname: 'Suite A', time: 0.03 },
            { name: 'test3', classname: 'Suite A', time: 0.04, failure: { message: 'fail', body: 'fail' } },
          ],
        },
        {
          name: 'Suite B',
          tests: 2,
          failures: 0,
          time: 0.05,
          testCases: [
            { name: 'test4', classname: 'Suite B', time: 0.025 },
            { name: 'test5', classname: 'Suite B', time: 0.025 },
          ],
        },
      ],
    })

    expect(xml).toContain('tests="5"')
    expect(xml).toContain('failures="1"')
  })
})
