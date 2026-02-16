export type SerializerName = 'json' | 'text'

export interface ApproveOptions {
  name?: string
  fileExtension?: string
  filePath?: string
  testName?: string
}

export interface VisualApproveOptions {
  name: string
  region?: string
}
