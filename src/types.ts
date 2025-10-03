export type FilterType = 'oil'|'air'|'cabin'|'fuel';

export interface LookupInput {
  make: string;
  model: string;
  year: number;
  hints?: {
    fuel?: 'nafta'|'diesel'|null;
    ac?: boolean|null;
    displacement_l?: number|null;
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
}

export interface DisambQuestion {
  field: 'fuel'|'ac'|'displacement_l';
  options?: (string|number|boolean)[];
  reason: string;
}

export interface LookupOutput {
  query: LookupInput;
  results: Partial<Record<FilterType, PartHit[]>>;
  disambiguation: {
    needed: boolean;
    ask: DisambQuestion[];
    candidates_summary?: Array<{ key: string; diff: string; impact: string }>;
    fallback_texts?: Record<'es-AR'|'ru', string>;
  };
  notices?: string[];
}
