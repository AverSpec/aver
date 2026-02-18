import { runCommand } from './run'

export function buildApproveEnv(): Record<string, string> {
  return { AVER_APPROVE: '1' }
}

export async function runApprove(argv: string[]): Promise<void> {
  Object.assign(process.env, buildApproveEnv())
  await runCommand(argv)
}
