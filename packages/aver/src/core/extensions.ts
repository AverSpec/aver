export interface HtmlRenderer {
  render(html: string, outputPath: string): Promise<void>
}

export interface ProtocolExtensions {
  'renderer:html'?: HtmlRenderer
  [key: string]: unknown
}
