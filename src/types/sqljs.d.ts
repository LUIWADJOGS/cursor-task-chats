declare module 'sql.js' {
  export interface BindParams {
    [key: string]: string | number | Uint8Array | null | undefined;
  }

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Statement {
    bind(values?: unknown[] | BindParams): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    get(params?: unknown[]): unknown[];
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
