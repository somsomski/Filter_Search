declare module 'pg' {
  export class Pool {
    constructor(config?: {
      connectionString?: string;
      max?: number;
      [key: string]: any;
    });
    query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}

