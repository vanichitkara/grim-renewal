/** Shared types for community cancel tips. Nothing here carries a user, an amount or a date. */

export const METHODS = ['online', 'email', 'phone', 'other'] as const;
export type MethodKind = (typeof METHODS)[number];

/** The only thing a user shares: company website name, method, and yes or no. */
export interface Submission {
  merchantKey: string;
  method: MethodKind;
  worked: boolean;
}

/** One stored counter: reports for (company, method) in one calendar month. No per-report time. */
export interface Row {
  merchantKey: string;
  method: MethodKind;
  /** 'yyyy-mm' */
  month: string;
  worked: number;
  failed: number;
}

export interface Tip {
  merchantKey: string;
  method: MethodKind;
  worked: number;
  failed: number;
}

export interface TipSummary {
  merchantKey: string;
  best: MethodKind | null;
  bestWorked: number;
  bestTotal: number;
  methods: Tip[];
  source: 'community' | 'seed' | 'none';
  /** Plain words for the UI, e.g. "not enough reports yet" or "starter list". */
  label?: string;
}

/** Where tips are kept. Memory (tests), JSON file (local) or a database such as Firestore (production). */
export interface TipStore {
  add(report: { merchantKey: string; method: MethodKind; worked: boolean; month: string }): Promise<void>;
  get(merchantKey: string): Promise<Row[]>;
}
