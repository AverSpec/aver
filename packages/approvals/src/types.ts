export type SerializerName = 'json' | 'text' | 'html'

export interface ApproveOptions {
  name?: string
  serializer?: SerializerName
  fileExtension?: string
  normalize?: (value: string) => string
  compare?: (approved: string, received: string) => { equal: boolean; diff?: string } | boolean
  filePath?: string
  testName?: string
}
