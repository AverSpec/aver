import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { diffText } from './diff'
import { resolveSerializer, type SerializerName } from './serializers'
import { addApprovalAttachments } from './context'

export interface ApproveOptions {
  name?: string
  serializer?: SerializerName
  fileExtension?: string
  normalize?: (value: string) => string
  compare?: (approved: string, received: string) => { equal: boolean; diff?: string } | boolean
  filePath?: string
  testName?: string
}

export async function approve(value: unknown, options: ApproveOptions = {}): Promise<void> {
  const state = getTestState()
  const testPath = options.filePath ?? state?.testPath
  const testName = options.testName ?? state?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve() requires a test runner with expect.getState() or explicit filePath/testName options.',
    )
  }

  const serializerName = options.serializer ?? defaultSerializerFor(value)
  const serializer = resolveSerializer(serializerName)
  const extension = options.fileExtension ?? serializer.fileExtension

  const approvalDir = join(dirname(testPath), '__approvals__', safeName(testName))
  mkdirSync(approvalDir, { recursive: true })

  const approvalName = safeName(options.name ?? 'approval')
  const approvedPath = join(approvalDir, `${approvalName}.approved.${extension}`)
  const receivedPath = join(approvalDir, `${approvalName}.received.${extension}`)
  const diffPath = join(approvalDir, `${approvalName}.diff.txt`)

  let received = serializer.serialize(value)
  if (options.normalize) received = options.normalize(received)

  writeFileSync(receivedPath, received, 'utf-8')

  const approvedExists = existsSync(approvedPath)
  const approved = approvedExists ? readFileSync(approvedPath, 'utf-8') : ''

  const comparison = compareValues(approved, received, options.compare)
  const shouldApprove = process.env.AVER_APPROVE === '1' || process.env.AVER_APPROVE === 'true'

  if (!approvedExists) {
    if (shouldApprove) {
      writeFileSync(approvedPath, received, 'utf-8')
      addApprovalAttachments([
        { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
      ])
      return
    }
    writeFileSync(diffPath, 'Baseline missing. Run with AVER_APPROVE=1 to create it.\n', 'utf-8')
    addApprovalAttachments([
      { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
      { name: 'diff', path: diffPath, mime: 'text/plain' },
    ])
    throw new Error(`Approval baseline missing: ${approvedPath}`)
  }

  if (comparison.equal) {
    return
  }

  const diff = comparison.diff ?? diffText(approved, received)
  writeFileSync(diffPath, diff, 'utf-8')

  if (shouldApprove) {
    writeFileSync(approvedPath, received, 'utf-8')
    addApprovalAttachments([
      { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
      { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
      { name: 'diff', path: diffPath, mime: 'text/plain' },
    ])
    return
  }

  addApprovalAttachments([
    { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
    { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
    { name: 'diff', path: diffPath, mime: 'text/plain' },
  ])
  throw new Error(`Approval mismatch: ${approvedPath}`)
}

function defaultSerializerFor(value: unknown): SerializerName {
  if (value && typeof value === 'object') return 'json'
  return 'text'
}

function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}

function getTestState(): { testPath?: string; testName?: string } | undefined {
  const expectGlobal = (globalThis as any).expect
  const getState = expectGlobal?.getState
  if (typeof getState !== 'function') return undefined
  const state = getState()
  return {
    testPath: state?.testPath,
    testName: state?.currentTestName ?? state?.testName ?? state?.currentTestSuiteName,
  }
}

function compareValues(
  approved: string,
  received: string,
  compare?: ApproveOptions['compare'],
): { equal: boolean; diff?: string } {
  if (!compare) return { equal: approved === received }
  const result = compare(approved, received)
  if (typeof result === 'boolean') return { equal: result }
  return { equal: result.equal, diff: result.diff }
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case 'json':
      return 'application/json'
    case 'html':
      return 'text/html'
    case 'txt':
    default:
      return 'text/plain'
  }
}
