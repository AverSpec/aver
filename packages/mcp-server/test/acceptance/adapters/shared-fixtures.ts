import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  registerAdapter,
  resetRegistry,
} from '@aver/core'
import type { Adapter, Protocol } from '@aver/core'
import { reloadConfig } from '../../../src/config'
import { RunStore } from '../../../src/runs'
import {
  getScenariosHandler,
  getScenarioSummaryHandler,
  getWorkflowPhaseHandler,
  getAdvanceCandidatesHandler,
  exportScenariosHandler,
} from '../../../src/tools/workspace'
import {
  getFailureDetailsHandler,
  getTestTraceHandler,
} from '../../../src/tools/execution'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
  getProjectContextHandler,
} from '../../../src/tools/scaffolding'
import {
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../../src/tools/domains'
import { getRunDiffHandler } from '../../../src/tools/reporting'

// ---------------------------------------------------------------------------
// Shared session fields — both adapters extend this with protocol-specific fields
// ---------------------------------------------------------------------------

export interface SharedSessionFields {
  runStore: RunStore
  workspaceBasePath: string
  workspaceProjectId: string
  lastCapturedScenario?: { id: string; stage: string; behavior: string }
  lastAddedQuestion?: { id: string; text: string }
  lastImportResult?: { added: number; skipped: number }
}

// ---------------------------------------------------------------------------
// Fixture actions — identical in both adapters
// ---------------------------------------------------------------------------

export function registerTestDomainAction(
  _session: SharedSessionFields,
  input: { name: string; actions: string[]; queries: string[]; assertions: string[] },
): void {
  const actionMarkers: Record<string, any> = {}
  for (const a of input.actions) actionMarkers[a] = realAction()

  const queryMarkers: Record<string, any> = {}
  for (const q of input.queries) queryMarkers[q] = realQuery()

  const assertionMarkers: Record<string, any> = {}
  for (const a of input.assertions) assertionMarkers[a] = realAssertion()

  const domain = realDefineDomain({
    name: input.name,
    actions: actionMarkers,
    queries: queryMarkers,
    assertions: assertionMarkers,
  })

  const proto: Protocol<null> = {
    name: 'test-inner',
    async setup() { return null },
    async teardown() {},
  }

  const adapter = implement(domain as any, {
    protocol: proto,
    actions: Object.fromEntries(Object.keys(actionMarkers).map(k => [k, async () => {}])),
    queries: Object.fromEntries(Object.keys(queryMarkers).map(k => [k, async () => `result:${k}`])),
    assertions: Object.fromEntries(Object.keys(assertionMarkers).map(k => [k, async () => {}])),
  })

  registerAdapter(adapter)
}

export function saveTestRunAction(
  session: SharedSessionFields,
  input: { results: any[] },
): void {
  session.runStore.save({
    timestamp: new Date().toISOString(),
    results: input.results,
  })
}

export function saveMultipleRunsAction(
  session: SharedSessionFields,
  input: { count: number },
): void {
  for (let i = 0; i < input.count; i++) {
    session.runStore.save({
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      results: [{ testName: `test-${i}`, domain: 'Test', status: 'pass', trace: [] }],
    })
  }
}

export async function reloadConfigAction(
  _session: SharedSessionFields,
  input: { domainNames: string[] },
): Promise<void> {
  await reloadConfig(async () => {
    for (const name of input.domainNames) {
      const domain = realDefineDomain({
        name,
        actions: {},
        queries: {},
        assertions: {},
      })
      registerAdapter(implement(domain as any, {
        protocol: { name: 'test-inner', async setup() { return null }, async teardown() {} } as any,
        actions: {},
        queries: {},
        assertions: {},
      }))
    }
  })
}

// Near-identical fixture actions — differ only in which adapters to re-register

export function discoverDomainsAction(
  _session: SharedSessionFields,
  input: { domainNames: string[] },
  adaptersToRegister: Adapter[],
): void {
  resetRegistry()
  for (const name of input.domainNames) {
    const domain = realDefineDomain({
      name,
      actions: {},
      queries: {},
      assertions: {},
    })
    registerAdapter(implement(domain as any, {
      protocol: { name: 'test-inner', async setup() { return null }, async teardown() {} } as any,
      actions: {},
      queries: {},
      assertions: {},
    }))
  }
  for (const adapter of adaptersToRegister) {
    registerAdapter(adapter)
  }
}

export function resetStateAction(
  session: SharedSessionFields,
  adaptersToRegister: Adapter[],
): void {
  resetRegistry()
  for (const adapter of adaptersToRegister) {
    registerAdapter(adapter)
  }
  session.lastCapturedScenario = undefined
  session.lastAddedQuestion = undefined
  session.lastImportResult = undefined
}

// ---------------------------------------------------------------------------
// Shared test-support queries
// ---------------------------------------------------------------------------

export function queryRunCount(session: SharedSessionFields): number {
  return session.runStore.listRuns().length
}

export function queryLastCapturedScenario(
  session: SharedSessionFields,
): { id: string; stage: string; behavior: string } {
  if (!session.lastCapturedScenario) throw new Error('No scenario has been captured yet')
  return session.lastCapturedScenario
}

export function queryLastAddedQuestion(
  session: SharedSessionFields,
): { id: string; text: string } {
  if (!session.lastAddedQuestion) throw new Error('No question has been added yet')
  return session.lastAddedQuestion
}

export function queryImportResult(
  session: SharedSessionFields,
): { added: number; skipped: number } {
  if (!session.lastImportResult) throw new Error('No import has been performed yet')
  return session.lastImportResult
}

// ---------------------------------------------------------------------------
// Shared assertions — all use workspace handlers directly
// ---------------------------------------------------------------------------

export function assertRunCountIs(
  session: SharedSessionFields,
  input: { count: number },
): void {
  const actual = session.runStore.listRuns().length
  if (actual !== input.count)
    throw new Error(`Expected ${input.count} runs but got ${actual}`)
}

export async function assertScenarioHasStage(
  session: SharedSessionFields,
  input: { id: string; stage: string },
): Promise<void> {
  const scenarios = await getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
  const scenario = scenarios.find(s => s.id === input.id)
  if (!scenario) throw new Error(`Scenario "${input.id}" not found`)
  if (scenario.stage !== input.stage)
    throw new Error(`Expected scenario "${input.id}" to have stage "${input.stage}" but got "${scenario.stage}"`)
}

export async function assertScenarioHasRevisitRationale(
  session: SharedSessionFields,
  input: { id: string; rationale: string },
): Promise<void> {
  const scenarios = await getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
  const scenario = scenarios.find(s => s.id === input.id)
  if (!scenario) throw new Error(`Scenario "${input.id}" not found`)
  if (scenario.revisitRationale !== input.rationale)
    throw new Error(`Expected revisit rationale "${input.rationale}" but got "${scenario.revisitRationale}"`)
}

export async function assertQuestionIsResolved(
  session: SharedSessionFields,
  input: { scenarioId: string; questionId: string },
): Promise<void> {
  const scenarios = await getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
  const scenario = scenarios.find(s => s.id === input.scenarioId)
  if (!scenario) throw new Error(`Scenario "${input.scenarioId}" not found`)
  const question = scenario.questions?.find(q => q.id === input.questionId)
  if (!question) throw new Error(`Question "${input.questionId}" not found on scenario "${input.scenarioId}"`)
  if (!question.resolvedAt)
    throw new Error(`Question "${input.questionId}" is not resolved`)
}

export async function assertScenarioHasDomainOperation(
  session: SharedSessionFields,
  input: { id: string; operation: string },
): Promise<void> {
  const scenarios = await getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
  const scenario = scenarios.find(s => s.id === input.id)
  if (!scenario) throw new Error(`Scenario "${input.id}" not found`)
  if (scenario.domainOperation !== input.operation)
    throw new Error(`Expected domain operation "${input.operation}" but got "${scenario.domainOperation}"`)
}

export function assertImportResultIs(
  session: SharedSessionFields,
  input: { added: number; skipped: number },
): void {
  if (!session.lastImportResult) throw new Error('No import has been performed yet')
  if (session.lastImportResult.added !== input.added || session.lastImportResult.skipped !== input.skipped)
    throw new Error(`Expected import result { added: ${input.added}, skipped: ${input.skipped} } but got ${JSON.stringify(session.lastImportResult)}`)
}

export async function assertWorkflowPhaseIs(
  session: SharedSessionFields,
  input: { phase: string },
): Promise<void> {
  const result = await getWorkflowPhaseHandler(session.workspaceBasePath, session.workspaceProjectId)
  if (result.name !== input.phase)
    throw new Error(`Expected workflow phase "${input.phase}" but got "${result.name}"`)
}

export async function assertLastCapturedScenarioIs(
  session: SharedSessionFields,
  input: { stage: string; behavior: string },
): Promise<void> {
  if (!session.lastCapturedScenario) throw new Error('No scenario has been captured yet')
  if (session.lastCapturedScenario.stage !== input.stage)
    throw new Error(`Expected captured stage "${input.stage}" but got "${session.lastCapturedScenario.stage}"`)
  if (session.lastCapturedScenario.behavior !== input.behavior)
    throw new Error(`Expected captured behavior "${input.behavior}" but got "${session.lastCapturedScenario.behavior}"`)
}

export async function assertSummaryFieldIs(
  session: SharedSessionFields,
  input: { field: string; value: number },
): Promise<void> {
  const summary = await getScenarioSummaryHandler(session.workspaceBasePath, session.workspaceProjectId)
  const actual = (summary as any)[input.field]
  if (actual === undefined) throw new Error(`Unknown summary field: ${input.field}`)
  if (actual !== input.value)
    throw new Error(`Expected summary.${input.field} to be ${input.value} but got ${actual}`)
}

export function assertLastQuestionTextIs(
  session: SharedSessionFields,
  input: { text: string },
): void {
  if (!session.lastAddedQuestion) throw new Error('No question has been added yet')
  if (session.lastAddedQuestion.text !== input.text)
    throw new Error(`Expected question text "${input.text}" but got "${session.lastAddedQuestion.text}"`)
}

export async function assertFilteredScenariosLengthIs(
  session: SharedSessionFields,
  input: { stage: string; count: number },
): Promise<void> {
  const scenarios = await getScenariosHandler({ stage: input.stage }, session.workspaceBasePath, session.workspaceProjectId)
  if (scenarios.length !== input.count)
    throw new Error(`Expected ${input.count} scenarios at stage "${input.stage}" but got ${scenarios.length}`)
}

export async function assertAdvanceCandidatesLengthIs(
  session: SharedSessionFields,
  input: { count: number },
): Promise<void> {
  const candidates = await getAdvanceCandidatesHandler(session.workspaceBasePath, session.workspaceProjectId)
  if (candidates.length !== input.count)
    throw new Error(`Expected ${input.count} advance candidates but got ${candidates.length}`)
}

export async function assertExportContains(
  session: SharedSessionFields,
  input: { format: string; text: string },
): Promise<void> {
  const exported = await exportScenariosHandler(
    { format: input.format as 'markdown' | 'json' },
    session.workspaceBasePath,
    session.workspaceProjectId,
  )
  if (!exported.includes(input.text))
    throw new Error(`Expected ${input.format} export to contain "${input.text}"`)
}

export function assertRunDiffHasNewlyFailing(
  session: SharedSessionFields,
  input: { testName: string },
): void {
  const diff = getRunDiffHandler(session.runStore)
  if (!diff) throw new Error('Run diff is null — need at least 2 runs')
  if (!diff.newlyFailing.includes(input.testName))
    throw new Error(`Expected "${input.testName}" in newlyFailing but got: [${diff.newlyFailing.join(', ')}]`)
}

export function assertRunDiffHasNewlyPassing(
  session: SharedSessionFields,
  input: { testName: string },
): void {
  const diff = getRunDiffHandler(session.runStore)
  if (!diff) throw new Error('Run diff is null — need at least 2 runs')
  if (!diff.newlyPassing.includes(input.testName))
    throw new Error(`Expected "${input.testName}" in newlyPassing but got: [${diff.newlyPassing.join(', ')}]`)
}

export function assertRunDiffIsNull(
  session: SharedSessionFields,
): void {
  const diff = getRunDiffHandler(session.runStore)
  if (diff !== null && diff !== undefined)
    throw new Error(`Expected run diff to be null but got: ${JSON.stringify(diff)}`)
}

export function assertDomainVocabularyIsNull(
  _session: SharedSessionFields,
  input: { name: string },
): void {
  const result = getDomainVocabularyHandler(input.name)
  if (result !== null && result !== undefined)
    throw new Error(`Expected vocabulary for "${input.name}" to be null`)
}

export async function assertAdapterExistsForDomain(
  _session: SharedSessionFields,
  input: { domain: string },
): Promise<void> {
  const adapters = await listAdaptersHandler()
  const found = adapters.find(a => a.domainName === input.domain)
  if (!found)
    throw new Error(`Expected adapter for domain "${input.domain}" but found none`)
}

export async function assertProjectContextIsNull(
  _session: SharedSessionFields,
): Promise<void> {
  const result = await getProjectContextHandler()
  if (result !== null && result !== undefined)
    throw new Error('Expected project context to be null')
}

export function assertDomainStructureSuggestedNameIs(
  _session: SharedSessionFields,
  input: { description: string; name: string },
): void {
  const structure = describeDomainStructureHandler(input.description)
  if (structure.suggestedName !== input.name)
    throw new Error(`Expected suggested name "${input.name}" but got "${structure.suggestedName}"`)
}

export function assertAdapterStructureDomainIs(
  _session: SharedSessionFields,
  input: { domain: string; protocol: string; expectedDomain: string },
): void {
  const structure = describeAdapterStructureHandler(input.domain, input.protocol)
  if (!structure) throw new Error(`Adapter structure is null for ${input.domain}/${input.protocol}`)
  if (structure.domain !== input.expectedDomain)
    throw new Error(`Expected domain "${input.expectedDomain}" but got "${structure.domain}"`)
}

export function assertAdapterStructureFirstActionIs(
  _session: SharedSessionFields,
  input: { domain: string; protocol: string; action: string },
): void {
  const structure = describeAdapterStructureHandler(input.domain, input.protocol)
  if (!structure) throw new Error(`Adapter structure is null for ${input.domain}/${input.protocol}`)
  if (structure.handlers.actions[0] !== input.action)
    throw new Error(`Expected first action "${input.action}" but got "${structure.handlers.actions[0]}"`)
}

export function assertAdapterStructureIsNull(
  _session: SharedSessionFields,
  input: { domain: string; protocol: string },
): void {
  const structure = describeAdapterStructureHandler(input.domain, input.protocol)
  if (structure !== null && structure !== undefined)
    throw new Error(`Expected adapter structure to be null for ${input.domain}/${input.protocol}`)
}

export function assertFirstFailureIs(
  session: SharedSessionFields,
  input: { testName: string; domain: string },
): void {
  const details = getFailureDetailsHandler(session.runStore, {})
  if (!details.failures.length) throw new Error('No failures found')
  if (details.failures[0].testName !== input.testName)
    throw new Error(`Expected first failure testName "${input.testName}" but got "${details.failures[0].testName}"`)
  if (details.failures[0].domain !== input.domain)
    throw new Error(`Expected first failure domain "${input.domain}" but got "${details.failures[0].domain}"`)
}

export function assertTestTraceIs(
  session: SharedSessionFields,
  input: { testName: string; status: string },
): void {
  const trace = getTestTraceHandler(session.runStore, input.testName)
  if (!trace) throw new Error(`No trace found for test "${input.testName}"`)
  if (trace.testName !== input.testName)
    throw new Error(`Expected testName "${input.testName}" but got "${trace.testName}"`)
  if (trace.status !== input.status)
    throw new Error(`Expected status "${input.status}" but got "${trace.status}"`)
}

export function assertTestTraceIsNull(
  session: SharedSessionFields,
  input: { testName: string },
): void {
  const trace = getTestTraceHandler(session.runStore, input.testName)
  if (trace !== null && trace !== undefined)
    throw new Error(`Expected trace for "${input.testName}" to be null`)
}

export async function assertScenarioCountIs(
  session: SharedSessionFields,
  input: { count: number },
): Promise<void> {
  const scenarios = await getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
  if (scenarios.length !== input.count)
    throw new Error(`Expected ${input.count} scenarios but got ${scenarios.length}`)
}
