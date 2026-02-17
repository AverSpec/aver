import { runCommand } from './run'

export async function runApprove(argv: string[]): Promise<void> {
  process.env.AVER_APPROVE = '1'
  await runCommand(argv)
}
