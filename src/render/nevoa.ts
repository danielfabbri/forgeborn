/**
 * Névoa na tela (VIS-01, TEC-17): a grade de névoa do jogador vira uma textura (uma faixa de
 * n × n texels por face do cubo-esfera, 0 escuro, ½ névoa, 1 visível), atualizada a
 * `nevoa_atualizacao_hz` e amostrada no shader do terreno. O minimapa usa a mesma textura.
 */
import { DataTexture, LinearFilter, RedFormat, UnsignedByteType } from 'three';

export class NevoaRender {
  readonly textura: DataTexture;
  private readonly dados: Uint8Array;

  constructor(readonly n: number) {
    this.dados = new Uint8Array(n * n * 6);
    this.textura = new DataTexture(this.dados, n, n * 6, RedFormat, UnsignedByteType);
    this.textura.magFilter = LinearFilter;
    this.textura.minFilter = LinearFilter;
    this.textura.needsUpdate = true;
  }

  /** Copia a grade da nação (0/1/2 por célula, na ordem de `indiceDaCelula`). */
  atualizar(estados: readonly number[] | undefined): void {
    if (!estados || estados.length !== this.dados.length) {
      // Sem grade (ainda sem mapa ou sem passo de visão): tudo visível.
      this.dados.fill(255);
    } else {
      for (let c = 0; c < this.dados.length; c++) this.dados[c] = estados[c]! * 127.5;
    }
    this.textura.needsUpdate = true;
  }
}

/**
 * GLSL: coordenada de textura da névoa para a direção d (o mesmo mapeamento equiangular de
 * `celulaDaDirecao`) e a aplicação na cor: escuro → preto; névoa → dessaturado e escurecido.
 */
export const GLSL_NEVOA = `
uniform sampler2D uNevoa;
uniform float uNevoaN;
uniform float uNevoaAtiva;

vec2 uvNevoa(vec3 d) {
  vec3 a = abs(d);
  float face;
  float A;
  float B;
  if (a.x >= a.y && a.x >= a.z) {
    face = d.x < 0.0 ? 1.0 : 0.0;
    A = d.y / a.x;
    B = d.z / a.x;
  } else if (a.y >= a.z) {
    face = d.y < 0.0 ? 3.0 : 2.0;
    A = d.z / a.y;
    B = d.x / a.y;
  } else {
    face = d.z < 0.0 ? 5.0 : 4.0;
    A = d.x / a.z;
    B = d.y / a.z;
  }
  float i = atan(A) / 1.5707963 + 0.5;
  float j = atan(B) / 1.5707963 + 0.5;
  float meio = 0.5 / uNevoaN;
  j = clamp(j, meio, 1.0 - meio);
  return vec2(clamp(i, meio, 1.0 - meio), (face + j) / 6.0);
}

vec3 aplicarNevoa(vec3 cor, vec3 d) {
  if (uNevoaAtiva < 0.5) return cor;
  float estado = texture2D(uNevoa, uvNevoa(normalize(d))).r;
  float explorado = smoothstep(0.1, 0.45, estado);
  float visivel = smoothstep(0.55, 0.9, estado);
  vec3 cinza = vec3(dot(cor, vec3(0.299, 0.587, 0.114))) * 0.4;
  return mix(vec3(0.0), mix(cinza, cor, visivel), explorado);
}
`;
