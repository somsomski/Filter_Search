export type FilterType = 'oil'|'air'|'cabin'|'fuel';

export interface LookupInput {
  make: string;
  model: string;
  year: number;
  hints?: {
    fuel?: 'nafta'|'diesel'|null;
    ac?: boolean|null;
    displacement_l?: number|null;
    engine_series?: string|null;
    engine_code?: string|null;
    body?: string|null;
    power_hp?: number|null;
  };
  lang?: 'es-AR'|'ru';
}

export interface SourceRef { catalog: string; page: string; }

export interface PartHit {
  brand: string;
  part_number: string;
  filter_type: FilterType;
  confidence: number;     // 0..1
  sources: SourceRef[];
  alt?: { brand: string; part_number: string }[];
  comment?: string;       // Из поля notes
  date?: string;          // Из поля notes, показывается только при различиях
  xref?: string;          // Из поля notes, в тестовом режиме
}

export interface DisambQuestion {
  field: 'fuel'|'ac'|'displacement_l'|'engine_series'|'engine_code'|'body'|'power_hp';
  options?: (string|number|boolean)[];
  reason: string;
}

export interface LookupOutput {
  query: LookupInput;
  results: Record<FilterType, PartHit[]>;
  disambiguation: {
    needed: boolean;
    ask: DisambQuestion[];
    candidates_summary?: Array<{ key: string; diff: string; impact: string }>;
    fallback_texts?: Record<'es-AR'|'ru', string>;
  };
  notices?: string[];
}
