import type { StreamFormat } from '../models'

export type DecryptSignature = (signature: string) => string | Promise<string>

export function resolveCipher(
  signatureCipher: string,
  decryptSignature: (signature: string) => string,
): string {
  const params = new URLSearchParams(signatureCipher)
  const baseUrl = params.get('url')
  const signature = params.get('s')
  const parameter = params.get('sp') || 'signature'

  if (!baseUrl) throw new Error('Signature cipher has no URL')
  if (!signature) throw new Error('Signature cipher has no signature')

  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}${encodeURIComponent(parameter)}=${encodeURIComponent(decryptSignature(signature))}`
}

export async function resolveCipherAsync(
  signatureCipher: string,
  decryptSignature: DecryptSignature,
): Promise<string> {
  const params = new URLSearchParams(signatureCipher)
  const baseUrl = params.get('url')
  const signature = params.get('s')
  const parameter = params.get('sp') || 'signature'

  if (!baseUrl) throw new Error('Signature cipher has no URL')
  if (!signature) throw new Error('Signature cipher has no signature')

  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}${encodeURIComponent(parameter)}=${encodeURIComponent(await decryptSignature(signature))}`
}

export function resolveAllCiphers(
  formats: StreamFormat[],
  decryptSignature: (signature: string) => string,
): StreamFormat[] {
  return formats.map((format) =>
    (format.signatureCipher || format.cipher)
      ? {
          ...format,
          url: resolveCipher(format.signatureCipher || format.cipher || '', decryptSignature),
          signatureCipher: undefined,
          cipher: undefined,
        }
      : format,
  )
}

export async function resolveAllCiphersAsync(
  formats: StreamFormat[],
  decryptSignature: DecryptSignature,
): Promise<StreamFormat[]> {
  return Promise.all(
    formats.map(async (format) =>
      (format.signatureCipher || format.cipher)
        ? {
            ...format,
            url: await resolveCipherAsync(format.signatureCipher || format.cipher || '', decryptSignature),
            signatureCipher: undefined,
            cipher: undefined,
          }
        : format,
    ),
  )
}
