import { defineConfig } from '../../src/index'
import { averCoreAdapter } from './adapters/aver-core.unit.js'
import { averInitAdapter } from './adapters/aver-init.unit.js'

export default defineConfig({
  adapters: [averCoreAdapter, averInitAdapter],
})
