import { adapt, unit } from '../../../src/index'
import { averReporter } from '../domains/aver-reporter'
import { generateJUnitXml } from '../../../src/reporter/junit'
import type { JUnitReport } from '../../../src/reporter/junit'

interface ReporterSession {
  lastXml?: string
}

export const averReporterAdapter = adapt(averReporter, {
  protocol: unit<ReporterSession>(() => ({})),

  actions: {
    generateReport: async (session, { name, suites }) => {
      const report: JUnitReport = { name, testSuites: suites }
      session.lastXml = generateJUnitXml(report)
    },
  },

  queries: {
    lastXml: async (session) => {
      return session.lastXml ?? ''
    },
  },

  assertions: {
    xmlContains: async (session, { text }) => {
      if (!session.lastXml) throw new Error('No XML generated')
      if (!session.lastXml.includes(text))
        throw new Error(`Expected XML to contain "${text}" but it doesn't.\nXML:\n${session.lastXml}`)
    },

    xmlDoesNotContain: async (session, { text }) => {
      if (!session.lastXml) throw new Error('No XML generated')
      if (session.lastXml.includes(text))
        throw new Error(`Expected XML to NOT contain "${text}" but it does`)
    },

    hasTestCount: async (session, { count }) => {
      if (!session.lastXml) throw new Error('No XML generated')
      const match = session.lastXml.match(/testsuites[^>]*tests="(\d+)"/)
      const actual = match ? parseInt(match[1], 10) : -1
      if (actual !== count)
        throw new Error(`Expected ${count} total tests but XML has ${actual}`)
    },

    hasFailureCount: async (session, { count }) => {
      if (!session.lastXml) throw new Error('No XML generated')
      const match = session.lastXml.match(/testsuites[^>]*failures="(\d+)"/)
      const actual = match ? parseInt(match[1], 10) : -1
      if (actual !== count)
        throw new Error(`Expected ${count} total failures but XML has ${actual}`)
    },
  },
})
