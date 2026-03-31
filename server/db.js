// server/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/quality.db');

if (dbPath !== ':memory:') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Create tables using prepare().run() for each statement
db.prepare(`CREATE TABLE IF NOT EXISTS scans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT    NOT NULL,
  page_limit    INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'running',
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  score         INTEGER,
  pages_scanned INTEGER,
  error         TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS issues (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id   INTEGER NOT NULL REFERENCES scans(id),
  sev       TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  selector  TEXT,
  page      TEXT    NOT NULL,
  wcag      TEXT,
  desc      TEXT    NOT NULL,
  status    TEXT    NOT NULL DEFAULT 'open'
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS screenshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id   INTEGER NOT NULL REFERENCES scans(id),
  page_url  TEXT NOT NULL,
  data_url  TEXT NOT NULL,
  UNIQUE(scan_id, page_url)
)`).run();

function createScan(url, pageLimit) {
  return db.prepare(
    'INSERT INTO scans (url, page_limit, started_at) VALUES (?, ?, ?)'
  ).run(url, pageLimit, Math.floor(Date.now() / 1000)).lastInsertRowid;
}

function getScan(id) {
  return db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
}

function getScans() {
  return db.prepare('SELECT * FROM scans ORDER BY started_at DESC').all();
}

function updateScan(id, fields) {
  const keys = Object.keys(fields);
  const set  = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE scans SET ${set} WHERE id = ?`).run(...keys.map(k => fields[k]), id);
}

function createIssue(scanId, issue) {
  db.prepare(`
    INSERT INTO issues (scan_id, sev, type, title, selector, page, wcag, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scanId, issue.sev, issue.type, issue.title, issue.selector ?? null,
         issue.page, issue.wcag ?? null, issue.desc);
}

function getIssue(id) {
  return db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
}

function getIssues(scanId) {
  return db.prepare('SELECT * FROM issues WHERE scan_id = ?').all(scanId);
}

function updateIssueStatus(id, status) {
  db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id);
}

function saveScreenshot(scanId, pageUrl, dataUrl) {
  db.prepare('INSERT OR REPLACE INTO screenshots (scan_id, page_url, data_url) VALUES (?, ?, ?)')
    .run(scanId, pageUrl, dataUrl);
}

function getScreenshot(scanId, pageUrl) {
  return db.prepare('SELECT * FROM screenshots WHERE scan_id = ? AND page_url = ?')
    .get(scanId, pageUrl);
}

module.exports = { createScan, getScan, getScans, updateScan, createIssue, getIssue, getIssues, updateIssueStatus, saveScreenshot, getScreenshot };
