// DriveBridge Verbose Logging System
// Production-ready logging with downloadable verbose logs

class Logger {
  constructor() {
    this.logs = [];
    this.config = this.getLoggingConfig();
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.info('Logger initialized', { sessionId: this.sessionId });
  }

  getLoggingConfig() {
    if (typeof Config !== 'undefined' && Config.getLoggingConfig) {
      return Config.getLoggingConfig();
    }
    return {
      levels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4 },
      defaultLevel: 'INFO',
      enableConsoleLog: true,
      enableFileExport: true,
      maxLogSize: 1000,
      logRotationSize: 500
    };
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  log(level, message, data = {}, category = 'GENERAL') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      category,
      message,
       JSON.parse(JSON.stringify(data)),
      sessionId: this.sessionId,
      id: Date.now() + Math.random()
    };
    this.logs.push(logEntry);
    if (this.config.enableConsoleLog) {
      const method = this.getConsoleMethod(level);
      method(`[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`, data);
    }
    if (this.logs.length > this.config.maxLogSize) {
      this.logs = this.logs.slice(-this.config.logRotationSize);
      this.warn(`Log rotation: keeping last ${this.config.logRotationSize} entries`);
    }
    if (window.uiManager && uiManager.updateTransferLogs) {
      uiManager.updateTransferLogs(this.getRecentLogs(20));
    }
  }

  getConsoleMethod(level) {
    switch (level.toUpperCase()) {
      case 'ERROR': return console.error;
      case 'WARN': return console.warn;
      case 'DEBUG': return console.debug;
      case 'TRACE': return console.trace;
      default: return console.log;
    }
  }

  error(msg, data = {}, cat = 'ERROR') { this.log('ERROR', msg, data, cat); }
  warn(msg, data = {}, cat = 'WARNING') { this.log('WARN', msg, data, cat); }
  info(msg, data = {}, cat = 'INFO') { this.log('INFO', msg, data, cat); }
  debug(msg, data = {}, cat = 'DEBUG') { this.log('DEBUG', msg, data, cat); }
  trace(msg, data = {}, cat = 'TRACE') { this.log('TRACE', msg, data, cat); }

  transferStart(id, count, src, dst) { this.info('Transfer started', { id, count, src, dst }, 'TRANSFER'); }
  transferComplete(id, results) { this.info('Transfer completed', { id, results, duration: Date.now() - this.startTime }, 'TRANSFER'); }
  fileTransferStart(fid, name, size, chunks) { this.info(`File transfer started: ${name}`, { fid, name, size, chunks }, 'FILE_TRANSFER'); }
  fileTransferComplete(fid, name, ok, err = null) {
    const lvl = ok ? 'INFO' : 'ERROR';
    this.log(lvl, ok ? `Completed: ${name}` : `Failed: ${name}`, { fid, name, ok, error: err }, 'FILE_TRANSFER');
  }
  chunkTransfer(fid, name, idx, total, ok, err = null, retry = 0) {
    const lvl = ok ? 'DEBUG' : 'WARN';
    this.log(lvl, ok ? `Chunk ${idx+1}/${total} done` : `Chunk ${idx+1}/${total} failed`, { fid, name, idx, total, retry, error: err }, 'CHUNK_TRANSFER');
  }
  apiCall(method, url, ok, status, dur, err = null) {
    const lvl = ok ? 'DEBUG' : 'ERROR';
    this.log(lvl, `API ${method} ${ok?'success':'failed'}: ${url}`, { method, status, dur, error: err }, 'API_CALL');
  }

  getRecentLogs(n = 50) {
    return this.logs.slice(-n).map(l => ({
      timestamp: new Date(l.timestamp).toLocaleTimeString(),
      level: l.level,
      category: l.category,
      message: l.message,
      id: l.id
    }));
  }

  getFailedTransfers() {
    return this.logs.filter(l => l.category==='FILE_TRANSFER' && l.data && l.data.ok===false).map(l => ({
      fileName: l.data.name,
      error: l.data.error.message,
      timestamp: l.timestamp
    }));
  }

  generateVerboseLog() {
    const header = [
      `# DriveBridge Transfer Log`,
      `# Session: ${this.sessionId}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Entries: ${this.logs.length}`,
      ``
    ].join('\n');
    const body = this.logs.map(l => `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`).join('\n');
    return `${header}\n${body}`;
  }

  downloadLogFile() {
    try {
      const content = this.generateVerboseLog();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drivebridge-log-${this.sessionId}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
      this.info('Log file downloaded');
      return true;
    } catch (e) {
      this.error('Log download failed', { error: e.message });
      return false;
    }
  }

  clearLogs() {
    const oldCount = this.logs.length;
    this.logs = [];
    this.sessionId = this.generateSessionId();
    this.info(`Cleared ${oldCount} logs, new session ${this.sessionId}`);
  }
}

if (typeof window !== 'undefined') window.Logger = Logger;
if (typeof module !== 'undefined' && module.exports) module.exports = Logger;
