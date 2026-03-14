export type SerializerName = 'json' | 'text' | (string & {})

export interface Comparator {
  (approved: string, received: string): { equal: boolean }
}

export type Scrubber =
  | ScrubberRule[]
  | ((text: string) => string)

export interface ScrubberRule {
  pattern: RegExp
  replacement: string
}

export interface ApproveOptions {
  name?: string
  fileExtension?: string
  filePath?: string
  testName?: string
  comparator?: Comparator
  serializer?: SerializerName
  scrub?: Scrubber
}

export interface VisualApproveOptions {
  name: string
  region?: string
  threshold?: number
  filePath?: string
  testName?: string
}
