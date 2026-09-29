import { describe } from 'vitest';
import { dados } from '../../src/sim';
import { SEEDS, testarSeeds } from './seeds';

// 4 zonas no raio real da Lua: no planeta de teste médio as jazidas contestadas não cabem com
// `jazida_espacamento_min_m` entre elas (ECO-07, D-89), e nenhum preset de 4 zonas é tão pequeno.
const LUA = dados.cenarios.find((c) => c.id === 'lua')!.raio_m;
describe('T-012: varredura de seeds', () => testarSeeds(LUA, 4, SEEDS, 400_000));
