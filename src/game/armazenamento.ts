/**
 * TEC-21: persistência local em IndexedDB, com localStorage como alternativa (navegação
 * privada, IndexedDB bloqueado). Guarda configurações e as últimas opções de Free Battle.
 * Falhas nunca derrubam o jogo: sem armazenamento, os valores vivem só na sessão.
 */
const BANCO = 'forgeborn';
const LOJA = 'kv';
const PREFIXO = 'forgeborn.';

let banco: Promise<IDBDatabase | null> | null = null;

function abrir(): Promise<IDBDatabase | null> {
  banco ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const pedido = indexedDB.open(BANCO, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => resolve(null);
      pedido.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return banco;
}

function viaLocalStorage<T>(chave: string): T | undefined {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    return bruto === null ? undefined : (JSON.parse(bruto) as T);
  } catch {
    return undefined;
  }
}

export async function ler<T>(chave: string): Promise<T | undefined> {
  const db = await abrir();
  if (db) {
    try {
      const valor = await new Promise<T | undefined>((resolve, reject) => {
        const pedido = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave);
        pedido.onsuccess = () => resolve(pedido.result as T | undefined);
        pedido.onerror = () => reject(pedido.error);
      });
      if (valor !== undefined) return valor;
    } catch {
      // cai para o localStorage
    }
  }
  return viaLocalStorage<T>(chave);
}

export async function gravar<T>(chave: string, valor: T): Promise<void> {
  const db = await abrir();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(LOJA, 'readwrite');
        tx.objectStore(LOJA).put(valor, chave);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    } catch {
      // cai para o localStorage
    }
  }
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: fica só na sessão
  }
}
