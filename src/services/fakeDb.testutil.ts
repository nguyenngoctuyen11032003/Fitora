// Tiny in-memory stand-in for the supabase-js query builder, for service unit tests.
// Supports: from(t).select/insert/update/delete + eq/in/order/abortSignal/returns/single/maybeSingle,
// and rpc(name, args) via handlers. Not a full PostgREST — only what the services use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test rows mix typed interfaces and loose objects
type Row = Record<string, any>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  calls: Array<{ table?: string; rpc?: string; op: string; args?: unknown }>;
  rpcs: Record<string, (args: Row, db: FakeDb) => { data: unknown; error: unknown }>;
  failNext?: { table?: string; rpc?: string; error: Row };
  from(table: string): Builder;
  rpc(name: string, args: Row): Promise<{ data: unknown; error: unknown }>;
}

let seq = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

class Builder implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: Array<(r: Row) => boolean> = [];
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private head = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = 'insert';
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  order() {
    return this;
  }
  abortSignal() {
    return this;
  }
  returns() {
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  private exec(): { data: unknown; error: unknown; count?: number } {
    const db = this.db;
    db.calls.push({ table: this.table, op: this.op, args: this.payload });
    if (db.failNext && db.failNext.table === this.table) {
      const error = db.failNext.error;
      db.failNext = undefined;
      return { data: null, error };
    }
    const t = (db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      out = list.map((p) => ({
        id: uuid(),
        user_id: 'me',
        use_count: 0,
        last_used_at: null,
        created_at: '2026-10-12T00:00:00Z',
        updated_at: '2026-10-12T00:00:00Z',
        ...p,
      }));
      t.push(...out);
    } else if (this.op === 'update') {
      out = t.filter(match);
      for (const r of out) Object.assign(r, this.payload);
    } else if (this.op === 'delete') {
      out = t.filter(match);
      db.tables[this.table] = t.filter((r) => !match(r));
    } else {
      out = t.filter(match);
    }
    out = out.map((r) => ({ ...r }));
    if (this.head) return { data: null, error: null, count: out.length };
    if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    ok?: ((v: { data: unknown; error: unknown; count?: number }) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(ok, bad);
  }
}

export function createFakeDb(): FakeDb {
  const db: FakeDb = {
    tables: {},
    calls: [],
    rpcs: {},
    from(table) {
      return new Builder(db, table);
    },
    async rpc(name, args) {
      db.calls.push({ rpc: name, op: 'rpc', args });
      if (db.failNext && db.failNext.rpc === name) {
        const error = db.failNext.error;
        db.failNext = undefined;
        return { data: null, error };
      }
      const h = db.rpcs[name];
      return h ? h(args, db) : { data: null, error: { code: 'PGRST202' } };
    },
  };
  // Same semantics as the SQL functions in 20261012000100_fitora_saved_foods.sql.
  db.rpcs.fit_mark_food_used = (args, d) => {
    const ids = (args.p_ids as string[]) ?? [];
    const rows = (d.tables.fit_custom_foods ?? []).filter((r) => ids.includes(r.id as string));
    for (const r of rows) {
      r.use_count = Number(r.use_count ?? 0) + 1;
      r.last_used_at = new Date().toISOString();
      if (args.p_meal) r.default_meal = args.p_meal;
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  db.rpcs.fit_mark_meal_template_used = (args, d) => {
    const rows = (d.tables.fit_meal_templates ?? []).filter((r) => r.id === args.p_id);
    for (const r of rows) {
      r.use_count = Number(r.use_count ?? 0) + 1;
      r.last_used_at = new Date().toISOString();
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  return db;
}
