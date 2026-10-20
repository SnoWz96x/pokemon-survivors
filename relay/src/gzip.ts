/** Gzips a string (desync dumps compress about tenfold). */
export const gzip = async (text: string): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
