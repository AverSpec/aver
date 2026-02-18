import { describe, it, expect } from 'vitest'
import { buildApproveEnv } from '../../src/cli/approve'

describe('buildApproveEnv()', () => {
  it('sets AVER_APPROVE to 1', () => {
    const env = buildApproveEnv()
    expect(env.AVER_APPROVE).toBe('1')
  })
})
