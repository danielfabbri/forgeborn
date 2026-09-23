import { describe } from 'vitest';
import { SEEDS, testarSeeds } from './seeds';

describe('T-012: varredura de seeds', () => testarSeeds('p', 2, SEEDS));
