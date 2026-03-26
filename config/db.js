/**
 * db.js — sql.js (pure JS SQLite/WASM) wrapper, pg-Pool compatible API.
 * Zero native compilation. Works on any Node.js version.
 */
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/trackpro.db');
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let _db = null;

async function getDb() {
  if (_db) return _db;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
  _db.run('PRAGMA foreign_keys = ON;');
  return _db;
}

function persist(db) {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// ── SQL translate: PostgreSQL → SQLite ────────────────────────────────────────
function adapt(sql) {
  return sql
    .replace(/CREATE EXTENSION[^;]+;/gi, '')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\$(\d+)/g, '?')
    .replace(/datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)\s+days?'/gi, "datetime('now','-$1 days')")
    .replace(/(\w[\w.]*)\s*::\s*\w+/g, '$1')
    .replace(/TO_CHAR\s*\(\s*([^,]+),\s*'YYYY-MM'\s*\)/gi, (_, col) => `strftime('%Y-%m',${col.trim()})`)
    .replace(/\bDATE\s*\(([^)]+)\)/gi, 'date($1)')
    .replace(/COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+([^)]+)\)/gi, 'SUM(CASE WHEN $1 THEN 1 ELSE 0 END)')
    .replace(/\bactif\s*=\s*true\b/gi, 'actif=1')
    .replace(/\bactif\s*=\s*false\b/gi, 'actif=0')
    .replace(/\s+ON CONFLICT\s*\([^)]+\)\s+DO NOTHING/gi, '')
    .replace(/\s+ON CONFLICT\s+DO NOTHING/gi, '');
}

function adaptParams(p = []) {
  return (p || []).map(v => v === true ? 1 : v === false ? 0 : (v === undefined ? null : v));
}

// ── Core query ────────────────────────────────────────────────────────────────
async function execQuery(sql, params = []) {
  const db = await getDb();
  const s = adapt(sql.trim());
  const p = adaptParams(params);
  const isRead = /^(SELECT|WITH)\s/i.test(s);
  const hasReturn = /\bRETURNING\b/i.test(s);

  try {
    if (isRead) {
      const stmt = db.prepare(s);
      stmt.bind(p);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return { rows };
    }

    if (hasReturn) {
      // Strip RETURNING, run insert/update, then re-select by rowid
      const noRet = s.replace(/\s+RETURNING\s+[\s\S]+$/i, '');
      db.run(noRet, p);
      const tbl = s.match(/(?:INSERT\s+INTO|UPDATE)\s+(\w+)/i)?.[1];
      let rows = [];
      if (tbl) {
        const stmt2 = db.prepare(`SELECT * FROM ${tbl} WHERE rowid=last_insert_rowid()`);
        while (stmt2.step()) rows.push(stmt2.getAsObject());
        stmt2.free();
      }
      persist(db);
      return { rows };
    }

    // Regular write
    db.run(s, p);
    persist(db);
    return { rows: [], rowCount: db.getRowsModified() };

  } catch (err) {
    console.error('DB Error:', err.message, '\nSQL:', s.slice(0, 200));
    throw err;
  }
}

// ── Transaction-aware client (handles BEGIN/COMMIT/ROLLBACK) ─────────────────
async function makeClient() {
  const db = await getDb();
  let inTx = false;

  const clientQuery = async (sql, params = []) => {
    const s = sql.trim().toUpperCase();

    if (s === 'BEGIN') {
      if (!inTx) { db.run('BEGIN'); inTx = true; }
      return { rows: [] };
    }
    if (s === 'COMMIT') {
      if (inTx) { db.run('COMMIT'); inTx = false; persist(db); }
      return { rows: [] };
    }
    if (s === 'ROLLBACK') {
      if (inTx) {
        try { db.run('ROLLBACK'); } catch (e) { /* already rolled back */ }
        inTx = false;
      }
      return { rows: [] };
    }

    const adapted = adapt(sql.trim());
    const p = adaptParams(params);
    const isRead = /^(SELECT|WITH)\s/i.test(adapted);
    const hasReturn = /\bRETURNING\b/i.test(adapted);

    try {
      if (isRead) {
        const stmt = db.prepare(adapted);
        stmt.bind(p);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return { rows };
      }

      if (hasReturn) {
        const noRet = adapted.replace(/\s+RETURNING\s+[\s\S]+$/i, '');
        db.run(noRet, p);
        const tbl = adapted.match(/(?:INSERT\s+INTO|UPDATE)\s+(\w+)/i)?.[1];
        let rows = [];
        if (tbl) {
          const stmt2 = db.prepare(`SELECT * FROM ${tbl} WHERE rowid=last_insert_rowid()`);
          while (stmt2.step()) rows.push(stmt2.getAsObject());
          stmt2.free();
        }
        if (!inTx) persist(db);
        return { rows };
      }

      db.run(adapted, p);
      if (!inTx) persist(db);
      return { rows: [], rowCount: db.getRowsModified() };
    } catch (err) {
      console.error('DB Client Error:', err.message, '\nSQL:', adapted.slice(0, 200));
      throw err;
    }
  };

  return {
    query: clientQuery,
    release: () => {
      if (inTx) {
        try { db.run('ROLLBACK'); } catch (e) {}
        inTx = false;
      }
    }
  };
}

// ── Multi-statement schema exec ───────────────────────────────────────────────
async function execSchema(sql) {
  const db = await getDb();
  const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 5);
  for (const stmt of stmts) {
    try { db.run(stmt); } catch (e) { /* skip already-exists errors */ }
  }
  persist(db);
}

// ── pg-Pool compatible exports ────────────────────────────────────────────────
const pool = {
  query: execQuery,
  connect: makeClient,
  execSchema,
  init: getDb,
  persist: () => { if (_db) persist(_db); }
};

module.exports = pool;
