export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export function initProjectFiles(_dir: string): void {
  throw new Error('Not implemented')
}

export function initDomainFiles(_dir: string, _name: string, _protocol: string): void {
  throw new Error('Not implemented')
}
