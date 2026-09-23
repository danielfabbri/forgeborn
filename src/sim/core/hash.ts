/** JSON com chaves ordenadas: o mesmo valor sempre gera o mesmo texto. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** Hash não criptográfico de 64 bits (cyrb53 estendido) em hexadecimal. */
export function hashString(text: string): string {
  return hashCodigos(text.length, (i) => text.charCodeAt(i));
}

/** Mesmo hash, sobre uma sequência de inteiros (ex.: um heightmap `Uint16Array`). */
export function hashNumeros(valores: ArrayLike<number>): string {
  return hashCodigos(valores.length, (i) => valores[i]!);
}

function hashCodigos(tamanho: number, codigo: (i: number) => number): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < tamanho; i++) {
    const code = codigo(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function hashValue(value: unknown): string {
  return hashString(canonicalJson(value));
}
