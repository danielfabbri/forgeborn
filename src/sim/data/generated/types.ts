// ARQUIVO GERADO por `npm run spec:sync` a partir de SPEC.md v1.14.0.
// Não edite à mão: altere o SPEC e rode o spec:sync (GOV-05).

export type AlertasId =
  | 'AL-01'
  | 'AL-02'
  | 'AL-03'
  | 'AL-04'
  | 'AL-05'
  | 'AL-06'
  | 'AL-07'
  | 'AL-08'
  | 'AL-09'
  | 'AL-10'
  | 'AL-11'
  | 'AL-12'
  | 'AL-13'
  | 'AL-14'
  | 'AL-15'
  | 'AL-16'
  | 'AL-17'
  | 'AL-18'
  | 'AL-19'
  | 'AL-20'
  | 'AL-21'
  | 'AL-22'
  | 'AL-23';

export interface AlertasRow {
  id: AlertasId;
  texto: string;
  gatilho: string;
  prioridade: string;
  cooldown_s: number;
}

export type ArmasId =
  | 'ex1_laser'
  | 'opq_torpedo'
  | 'siege_ram'
  | 'drone_laser_gun'
  | 'bomb'
  | 'kamikaze_blast'
  | 'tower_laser'
  | 'boat_laser'
  | 'ship_pd'
  | 'mine_blast'
  | 'sat_laser'
  | 'abrigo_laser'
  | 'missil_curto'
  | 'missil_longo'
  | 'aa_missil';

export interface ArmasRow {
  id: ArmasId;
  tipo_dano: string;
  dano: number;
  recarga_s: number | null;
  alcance_m: number;
  alcance_min_m: number;
  splash_m: number;
  splash_borda_pct: number | null;
  alvos: string[];
  en_disparo: number;
  fonte_en: string | null;
  projetil: string;
  vel_projetil_m_s: number | null;
}

export interface AtalhosRow {
  contexto: string;
  tecla: string;
  acao: string;
}

export type CenariosId =
  | 'lua'
  | 'terra_lab'
  | 'lua_shackleton'
  | 'marte'
  | 'fobos'
  | 'ceres'
  | 'venus'
  | 'europa'
  | 'tita';

export interface CenariosRow {
  id: CenariosId;
  nome: string;
  raio_m: number;
  fator_solar: number;
  mult_vel_hover: number;
  mult_giro_hover: number;
  mult_en_drone: number;
  mult_visao: number;
  perfil_fe: number;
  perfil_si: number;
  perfil_cu: number;
  perfil_li: number;
  perfil_ti: number;
  perfil_u: number;
  evento: string | null;
  versao: string;
}

export type CustosId =
  | 'hover_explorer'
  | 'printer'
  | 'hover_ex1'
  | 'hover_opq'
  | 'siege_tank'
  | 'hover_minelayer'
  | 'hover_scout'
  | 'drone_bomber'
  | 'drone_laser'
  | 'drone_kamikaze'
  | 'mobile_silo'
  | 'mobile_battery'
  | 'laser_tower'
  | 'storage'
  | 'solar_plant'
  | 'nuclear_plant'
  | 'satellite_uplink'
  | 'satellite'
  | 'wall'
  | 'gate'
  | 'missile_silo'
  | 'aa_battery'
  | 'mag_tower'
  | 'hangar'
  | 'arsenal'
  | 'antenna'
  | 'power_hub'
  | 'port'
  | 'boat_transport'
  | 'boat_artillery'
  | 'boat_antenna'
  | 'missile_short'
  | 'missile_long'
  | 'mine';

export interface CustosRow {
  id: CustosId;
  nome: string;
  categoria: string;
  produzido_por: string[];
  fe: number;
  si: number;
  cu: number;
  li: number;
  ti: number;
  u: number;
  vr: number;
  ref_x: number | null;
  en_impressao: number;
  tempo_s: number;
}

export type DificuldadeParametro =
  | 'reacao_s'
  | 'meta_hovers'
  | 'primeiro_ataque_min'
  | 'vr_exercito_ataque'
  | 'expansoes_max'
  | 'tiers_permitidos'
  | 'tiers_militares'
  | 'vr_exercito_max'
  | 'micro'
  | 'adapta_composicao'
  | 'bonus_coleta_pct'
  | 'bonus_impressao_pct';

export interface DificuldadeRow {
  parametro: DificuldadeParametro;
  facil: number;
  normal: number;
  dificil: number;
  brutal: number;
}

export type EstoqueInicialModo =
  | 'padrao'
  | 'alto';

export interface EstoqueInicialRow {
  modo: EstoqueInicialModo;
  fe: number;
  si: number;
  cu: number;
  li: number;
  ti: number;
  u: number;
}

export type EstruturasId =
  | 'ship'
  | 'laser_tower'
  | 'storage'
  | 'solar_plant'
  | 'nuclear_plant'
  | 'satellite_uplink'
  | 'wall'
  | 'gate'
  | 'missile_silo'
  | 'aa_battery'
  | 'mag_tower'
  | 'hangar'
  | 'arsenal'
  | 'antenna'
  | 'power_hub'
  | 'port';

export interface EstruturasRow {
  id: EstruturasId;
  nome: string;
  hp: number;
  pegada_m: number;
  visao_m: number;
  deteccao_m: number;
  geracao_en_s: number;
  banco_en: number;
  portas: number;
  taxa_porta_en_s: number;
  manutencao_en_s: number;
  deposito: boolean;
  arma: string | null;
}

export type FreeBattleOpcao =
  | 'nacao_jogador'
  | 'num_oponentes'
  | 'nacao_oponente'
  | 'dificuldade_oponente'
  | 'cenario'
  | 'mapa'
  | 'zona_pouso'
  | 'recursos_iniciais'
  | 'nevoa'
  | 'condicao_vitoria'
  | 'tempo_limite_min'
  | 'velocidade';

export interface FreeBattleRow {
  opcao: FreeBattleOpcao;
  valores: number[] | string | string[];
  padrao: number | string;
}

export type IaPlanoItem =
  | 'laser_tower'
  | 'arsenal'
  | 'nuclear_plant'
  | 'aa_battery'
  | 'satellite_uplink'
  | 'hangar'
  | 'mag_tower'
  | 'missile_silo'
  | 'mobile_silo'
  | 'mobile_battery'
  | 'hover_minelayer';

export interface IaPlanoRow {
  item: IaPlanoItem;
  facil: number;
  normal: number;
  dificil: number;
  brutal: number;
  min_facil: number;
  min_normal: number;
  min_dificil: number;
  min_brutal: number;
}

export interface JazidasRow {
  zona: string;
  recurso: string;
  jazidas: number;
  quantidade_u: number;
  dist_min_m: number | null;
  dist_max_m: number | null;
  escopo: string;
}

export interface MissoesRow {
  ordem: number;
  id: string;
  cenario: string;
  nome: string;
  oponentes: string[];
  objetivo: string;
  libera: string[] | null;
  tempo_par_min: number;
  versao: string;
}

export type MoveisId =
  | 'hover_explorer'
  | 'printer'
  | 'hover_ex1'
  | 'hover_opq'
  | 'siege_tank'
  | 'hover_minelayer'
  | 'hover_scout'
  | 'drone_bomber'
  | 'drone_laser'
  | 'drone_kamikaze'
  | 'mobile_silo'
  | 'mobile_battery'
  | 'boat_transport'
  | 'boat_artillery'
  | 'boat_antenna';

export interface MoveisRow {
  id: MoveisId;
  hp: number;
  blindagem: string;
  camada: string;
  vel_m_s: number;
  giro_graus_s: number;
  raio_m: number;
  visao_m: number;
  deteccao_m: number;
  bateria_en: number;
  mov_en_s: number;
  pairar_en_s: number;
  arma: string | null;
}

export type MultiplicadoresTipoDano =
  | 'laser'
  | 'explosivo'
  | 'ambiental';

export interface MultiplicadoresRow {
  tipo_dano: MultiplicadoresTipoDano;
  leve: number;
  blindada: number;
  estrutura: number;
}

export type NacoesId =
  | 'usa'
  | 'chn'
  | 'rus'
  | 'bra';

export interface NacoesRow {
  id: NacoesId;
  nome: string;
  ia: string;
  cor: string;
  emblema: string;
  personalidade: string;
}

export type ParametrosChave =
  | 'tick_hz'
  | 'duracao_pouso_s'
  | 'raio_explorado_inicial_m'
  | 'limite_corpos'
  | 'limite_bases_lancamento'
  | 'limite_minas_ativas'
  | 'pontos_por_vr_coletado'
  | 'pontos_por_vr_destruido'
  | 'pontos_estruturas_vivas_pct'
  | 'bonus_nave_destruida'
  | 'bonus_vitoria'
  | 'dominio_estrutura_m'
  | 'dominio_unidade_m'
  | 'ultimato_s'
  | 'guerra_esfria_s'
  | 'jazida_espacamento_min_m'
  | 'jazidas_espalhadas_por_10k_m2'
  | 'valor_x_vr'
  | 'carga_hover_u'
  | 'tempo_descarga_hover_s'
  | 'raio_deposito_m'
  | 'slots_por_jazida'
  | 'raio_jazida_max_m'
  | 'raio_jazida_min_m'
  | 'distancia_mineracao_m'
  | 'raio_busca_jazida_m'
  | 'raio_diretiva_m'
  | 'fuga_hover_retorno_s'
  | 'hover_ocioso_alerta_s'
  | 'diretiva_fe_pct'
  | 'diretiva_si_pct'
  | 'diretiva_cu_pct'
  | 'diretiva_li_pct'
  | 'diretiva_ti_pct'
  | 'diretiva_u_pct'
  | 'capacidade_silo_u'
  | 'taxa_descarga_silo_u_s'
  | 'limiar_ciclo_silo_pct'
  | 'rendimento_destroco_pct'
  | 'rendimento_carga_silo_pct'
  | 'duracao_destroco_unidade_s'
  | 'duracao_destroco_estrutura_s'
  | 'taxa_reciclagem_u_s'
  | 'destroco_nave_fe'
  | 'destroco_nave_si'
  | 'destroco_nave_cu'
  | 'destroco_nave_li'
  | 'destroco_nave_ti'
  | 'cabo_alcance_m'
  | 'cabo_alcance_central_m'
  | 'cabo_saidas_central'
  | 'limiar_bateria_baixa_pct'
  | 'modo_reserva_vel_pct'
  | 'auto_recarga_trabalhador_pct'
  | 'auto_recarga_impressora_pct'
  | 'auto_recarga_militar_pct'
  | 'auto_recarga_drone_pct'
  | 'recarga_forcada_drone_pct'
  | 'auto_recarga_bateria_movel_pct'
  | 'en_minerar_s'
  | 'en_reciclar_s'
  | 'en_reparo_hover_s'
  | 'en_reparo_impressora_s'
  | 'en_sentinela_s'
  | 'impulso_mult_en'
  | 'bateria_movel_raio_m'
  | 'bateria_movel_max_alvos'
  | 'bateria_movel_taxa_por_alvo_en_s'
  | 'bateria_movel_limiar_alvo_pct'
  | 'bateria_movel_carga_inicial_pct'
  | 'nuclear_consumo_u'
  | 'nuclear_intervalo_s'
  | 'nuclear_religar_s'
  | 'fila_max_nave'
  | 'fila_max_impressora'
  | 'reembolso_cancelamento_pct'
  | 'pi_impressora'
  | 'pi_hover'
  | 'max_assistentes'
  | 'hp_inicial_canteiro_pct'
  | 'inclinacao_max_construcao_graus'
  | 'distancia_min_jazida_m'
  | 'reparo_hover_estrutura_hp_s'
  | 'reparo_hover_unidade_hp_s'
  | 'reparo_impressora_estrutura_hp_s'
  | 'reparo_impressora_unidade_hp_s'
  | 'max_reparadores'
  | 'raio_reparo_auto_m'
  | 'porto_distancia_borda_m'
  | 'transporte_capacidade'
  | 'embarque_distancia_m'
  | 'estado_combate_s'
  | 'nucleo_splash_pct'
  | 'leash_agressivo_m'
  | 'leash_defensivo_m'
  | 'torpedo_tempo_max_voo_s'
  | 'bomba_tempo_queda_s'
  | 'mina_hp'
  | 'tempo_plantar_mina_s'
  | 'tempo_armar_mina_s'
  | 'magazine_minas'
  | 'campo_minado_espacamento_m'
  | 'explosao_bateria_dano'
  | 'explosao_bateria_raio_m'
  | 'explosao_nuclear_dano'
  | 'explosao_nuclear_raio_m'
  | 'radiacao_raio_m'
  | 'radiacao_dano_hp_s'
  | 'radiacao_duracao_s'
  | 'explosao_nave_dano'
  | 'explosao_nave_raio_m'
  | 'celula_nevoa_m'
  | 'nevoa_atualizacao_hz'
  | 'sentinela_visao_m'
  | 'sentinela_deteccao_m'
  | 'sentinela_radar_m'
  | 'sentinela_camuflagem_m'
  | 'tempo_implantar_sentinela_s'
  | 'tempo_recolher_sentinela_s'
  | 'radar_atualizacao_s'
  | 'satelite_visao_m'
  | 'satelite_vel_m_s'
  | 'satelite_hp'
  | 'muro_espessura_m'
  | 'abrigo_vagas'
  | 'portao_raio_abertura_m'
  | 'portao_tempo_abrir_s'
  | 'portao_tempo_fechar_apos_s'
  | 'misseis_max_base'
  | 'aa_acerto_centro_pct'
  | 'aa_acerto_borda_pct'
  | 'aa_zona_certeira_pct'
  | 'mag_raio_m'
  | 'mag_lentidao_max_pct'
  | 'mag_dreno_max_en_s'
  | 'mag_fator_blindada_pct'
  | 'mag_banco_max_en'
  | 'mag_repasse_en_s'
  | 'mag_max_aliados'
  | 'mag_reparo_hp_s'
  | 'tempo_lancamento_satelite_s'
  | 'varredura_raio_m'
  | 'varredura_duracao_s'
  | 'varredura_recarga_s'
  | 'varredura_custo_en'
  | 'inclinacao_max_hover_graus'
  | 'altitude_drone_m'
  | 'aceleracao_solo_s'
  | 'aceleracao_ar_s'
  | 'celula_navegacao_m'
  | 'celula_construcao_m'
  | 'flow_field_min_unidades'
  | 'pouso_automatico_s'
  | 'tempo_decolagem_s'
  | 'tempo_pouso_s'
  | 'controle_direto_bonus_dano_pct'
  | 'controle_direto_bonus_vel_pct'
  | 'impulso_bonus_vel_pct'
  | 'trava_torpedo_s'
  | 'ia_intervalo_estrategista_s'
  | 'ia_margem_energia_pct'
  | 'ia_recuo_vr_pct'
  | 'ia_impressoras_alvo'
  | 'ia_batedores'
  | 'ia_fila_por_produtor'
  | 'ia_raio_defesa_m'
  | 'ia_distancia_expansao_m'
  | 'ia_expansao_hovers_pct'
  | 'ia_expansao_cedo_pct'
  | 'ia_traco_meta_hovers_pct'
  | 'ia_ondas_grandes_mult'
  | 'ia_ferido_pct'
  | 'ia_kite_pct'
  | 'ia_minas_distancia_m'
  | 'ia_misseis_curtos'
  | 'ia_porto_distancia_m'
  | 'ia_barcos_artilharia'
  | 'ia_barcos_antena'
  | 'ia_misseis_longos'
  | 'ia_missil_longo_intervalo_s'
  | 'tutorial_raio_armazem_m'
  | 'tempestade_intervalo_min_s'
  | 'tempestade_intervalo_max_s'
  | 'tempestade_duracao_s'
  | 'tempestade_mult_visao'
  | 'tempestade_mult_solar'
  | 'tempestade_aviso_s'
  | 'mar_cobertura_pct'
  | 'mar_folga_zona_m'
  | 'pedras_por_10k_m2'
  | 'pedra_raio_min_m'
  | 'pedra_raio_max_m'
  | 'barras_opacidade_nao_selecionados_pct'
  | 'atmosfera_opacidade_pct'
  | 'macete_quantidade';

export interface ParametrosRow {
  chave: ParametrosChave;
  valor: number;
  unidade: string;
  descricao: string;
}

export type PersonalidadesNacao =
  | 'usa'
  | 'chn'
  | 'rus'
  | 'bra';

export interface PersonalidadesRow {
  nacao: PersonalidadesNacao;
  estilo: string;
  ex1: number;
  opq: number;
  siege: number;
  minas: number;
  obs: number;
  bomb: number;
  dlaser: number;
  kamikaze: number;
  torres: number;
  tracos: string;
}

export type RecursosId =
  | 'fe'
  | 'si'
  | 'cu'
  | 'li'
  | 'ti'
  | 'u';

export interface RecursosRow {
  id: RecursosId;
  nome: string;
  vr: number;
  taxa_mineracao_u_s: number;
  raridade: string;
  cor: string;
  usos: string;
}

export interface Tabelas {
  alertas: AlertasRow[];
  armas: ArmasRow[];
  atalhos: AtalhosRow[];
  cenarios: CenariosRow[];
  custos: CustosRow[];
  dificuldade: DificuldadeRow[];
  estoque_inicial: EstoqueInicialRow[];
  estruturas: EstruturasRow[];
  free_battle: FreeBattleRow[];
  ia_plano: IaPlanoRow[];
  jazidas: JazidasRow[];
  missoes: MissoesRow[];
  moveis: MoveisRow[];
  multiplicadores: MultiplicadoresRow[];
  nacoes: NacoesRow[];
  parametros: ParametrosRow[];
  personalidades: PersonalidadesRow[];
  recursos: RecursosRow[];
}
