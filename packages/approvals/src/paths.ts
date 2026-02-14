import { join, dirname } from 'node:path'

export interface ApprovalPaths {
  approvalDir: string
  approvedPath: string
  receivedPath: string
  diffPath: string
  approvedImagePath: string
  receivedImagePath: string
  diffImagePath: string
}

export function resolveApprovalPaths(
  testPath: string,
  testName: string,
  approvalName: string,
  extension: string,
): ApprovalPaths {
  const approvalDir = join(dirname(testPath), '__approvals__', safeName(testName))
  const name = safeName(approvalName)
  return {
    approvalDir,
    approvedPath: join(approvalDir, `${name}.approved.${extension}`),
    receivedPath: join(approvalDir, `${name}.received.${extension}`),
    diffPath: join(approvalDir, `${name}.diff.txt`),
    approvedImagePath: join(approvalDir, `${name}.approved.png`),
    receivedImagePath: join(approvalDir, `${name}.received.png`),
    diffImagePath: join(approvalDir, `${name}.diff.png`),
  }
}

export function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}
