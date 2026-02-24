export { removalOperator } from './removal.js'
export { returnValueOperator } from './return-value.js'
export { throwErrorOperator } from './throw-error.js'

import type { AdapterOperator } from '../engine-types.js'
import { removalOperator } from './removal.js'
import { returnValueOperator } from './return-value.js'
import { throwErrorOperator } from './throw-error.js'

/** Default set of adapter mutation operators. */
export function defaultOperators(): AdapterOperator[] {
  return [
    removalOperator(),
    returnValueOperator(null),
    returnValueOperator(''),
    returnValueOperator(0),
    throwErrorOperator(),
  ]
}
