import { defineConfig } from '@aver/core'
import { adapter } from './adapters/contract-verification.unit.js'

export default defineConfig({
  adapters: [adapter],
})
