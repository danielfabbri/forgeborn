import ptBR from './pt-BR.json';

/** TEC-23: todo texto de interface vem deste dicionário. */
export type TextKey = keyof typeof ptBR;

export function t(key: TextKey, vars?: Record<string, string | number>): string {
  const template: string = ptBR[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
