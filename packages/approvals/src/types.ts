export type SerializerName = 'json' | 'text' | (string & {})

export interface Comparator {
  (approved: string, received: string): { equal: boolean }
}

export interface ApproveOptions {
  name?: string
  fileExtension?: string
  filePath?: string
  testName?: string
  comparator?: Comparator
  serializer?: SerializerName
}

export interface VisualApproveOptions {
  name: string
  region?: string
  threshold?: number
}
