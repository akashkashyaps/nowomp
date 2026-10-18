interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: 'database' | 'ui' | 'state' | 'api' | 'user' | 'system';
  message: string;
  data?: any;
  stack?: string;
}

interface StateSnapshot {
  timestamp: string;
  route: string;
  user?: any;
  workout?: any;
  schedule?: any;
  stats?: any;
}

class DebugLoggerService {
  private static instance: DebugLoggerService;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private websocket: WebSocket | null = null;
  // React Native's timers return numbers, not Node's Timeout handles.
  private reconnectInterval: ReturnType<typeof setTimeout> | null = null;
  private isEnabled = false;
  
  static getInstance(): DebugLoggerService {
    if (!DebugLoggerService.instance) {
      DebugLoggerService.instance = new DebugLoggerService();
    }
    return DebugLoggerService.instance;
  }
  
  constructor() {
    this.isEnabled = __DEV__ || process.env.NODE_ENV === 'development';
    if (this.isEnabled) {
      this.initializeWebSocket();
      this.setupGlobalErrorHandling();
    }
  }
  
  private initializeWebSocket() {
    if (typeof window === 'undefined') return; // Skip on server-side
    
    try {
      this.websocket = new WebSocket('ws://localhost:3001/debug-logs');
      
      this.websocket.onopen = () => {
        this.log('info', 'system', '🔗 Debug logger connected to dashboard');
        // Send recent logs on connect
        this.sendRecentLogs();
      };
      
      this.websocket.onclose = () => {
        this.log('warn', 'system', '⚠️ Debug logger disconnected from dashboard');
        this.scheduleReconnect();
      };
      
      this.websocket.onerror = (error) => {
        console.warn('Debug logger WebSocket error:', error);
      };
      
    } catch {
      // WebSocket not available, continue without real-time streaming
      this.log('info', 'system', 'Debug logger running without WebSocket (dashboard offline)');
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectInterval) return;
    
    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.initializeWebSocket();
    }, 5000); // Reconnect after 5 seconds
  }
  
  private setupGlobalErrorHandling() {
    // Catch unhandled errors
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.log('error', 'system', 'Unhandled Error', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        });
      });
      
      window.addEventListener('unhandledrejection', (event) => {
        this.log('error', 'system', 'Unhandled Promise Rejection', {
          reason: event.reason,
          stack: event.reason?.stack
        });
      });
    }
  }
  
  private sendRecentLogs() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const recentLogs = this.logs.slice(-50); // Send last 50 logs
      this.websocket.send(JSON.stringify({
        type: 'logs-batch',
        data: recentLogs
      }));
    }
  }
  
  public log(level: LogEntry['level'], category: LogEntry['category'], message: string, data?: any) {
    if (!this.isEnabled) return;
    
    const logEntry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      stack: level === 'error' ? new Error().stack : undefined
    };
    
    // Add to internal log storage
    this.logs.push(logEntry);
    
    // Maintain max logs limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output with formatting
    this.consoleLog(logEntry);
    
    // Send to WebSocket if connected
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'log-entry',
        data: logEntry
      }));
    }
  }
  
  private consoleLog(log: LogEntry) {
    const emoji = this.getCategoryEmoji(log.category);
    const levelSymbol = this.getLevelSymbol(log.level);
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    
    const style = this.getLevelStyle(log.level);
    const message = `${emoji} ${levelSymbol} [${timestamp}] ${log.message}`;
    
    if (log.data) {
      console.group(message);
      console.log(log.data);
      console.groupEnd();
    } else {
      console.log(`%c${message}`, style);
    }
  }
  
  private getCategoryEmoji(category: LogEntry['category']): string {
    const emojis = {
      database: '💾',
      ui: '🎨',
      state: '📊',
      api: '🌐',
      user: '👤',
      system: '⚙️'
    };
    return emojis[category] || '📝';
  }
  
  private getLevelSymbol(level: LogEntry['level']): string {
    const symbols = {
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    };
    return symbols[level];
  }
  
  private getLevelStyle(level: LogEntry['level']): string {
    const styles = {
      debug: 'color: #6b7280; font-size: 11px;',
      info: 'color: #3b82f6; font-weight: normal;',
      warn: 'color: #f59e0b; font-weight: bold;',
      error: 'color: #ef4444; font-weight: bold; background: #fef2f2; padding: 2px 4px;'
    };
    return styles[level];
  }
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
  
  // Public API methods
  public logUserAction(action: string, data?: any) {
    this.log('info', 'user', `User Action: ${action}`, data);
  }
  
  public logStateChange(component: string, oldState: any, newState: any) {
    this.log('debug', 'state', `State Change: ${component}`, { 
      old: oldState, 
      new: newState,
      diff: this.getStateDiff(oldState, newState)
    });
  }
  
  public logDatabaseQuery(query: string, params?: any, result?: any, duration?: number) {
    this.log('debug', 'database', `DB Query: ${query.substring(0, 100)}...`, {
      query,
      params,
      result: result ? (Array.isArray(result) ? `${result.length} rows` : result) : undefined,
      duration: duration ? `${duration}ms` : undefined
    });
  }
  
  public logUIEvent(event: string, component: string, data?: any) {
    this.log('debug', 'ui', `UI Event: ${event} on ${component}`, data);
  }
  
  public logApiCall(method: string, url: string, status?: number, duration?: number) {
    const level = status && status >= 400 ? 'error' : 'info';
    this.log(level, 'api', `API ${method} ${url}`, { status, duration });
  }
  
  public logWorkoutEvent(event: string, data?: any) {
    this.log('info', 'user', `Workout: ${event}`, data);
  }
  
  public logScheduleEvent(event: string, data?: any) {
    this.log('info', 'user', `Schedule: ${event}`, data);
  }
  
  public captureStateSnapshot(route: string, state: any): StateSnapshot {
    const snapshot: StateSnapshot = {
      timestamp: new Date().toISOString(),
      route,
      ...state
    };
    
    this.log('debug', 'state', `State Snapshot: ${route}`, snapshot);
    
    // Send snapshot to dashboard
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'state-snapshot',
        data: snapshot
      }));
    }
    
    return snapshot;
  }
  
  private getStateDiff(oldState: any, newState: any): any {
    const diff: any = {};
    
    // Simple diff for debugging
    for (const key in newState) {
      if (oldState[key] !== newState[key]) {
        diff[key] = { from: oldState[key], to: newState[key] };
      }
    }
    
    return Object.keys(diff).length > 0 ? diff : null;
  }
  
  // Utility methods for easy access
  public getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }
  
  public getLogs(filter?: { level?: string, category?: string }): LogEntry[] {
    if (!filter) return [...this.logs];
    
    return this.logs.filter(log => {
      if (filter.level && log.level !== filter.level) return false;
      if (filter.category && log.category !== filter.category) return false;
      return true;
    });
  }
  
  public clearLogs() {
    this.logs = [];
    this.log('info', 'system', 'Debug logs cleared');
  }
  
  public exportLogs(): string {
    return JSON.stringify({
      exported_at: new Date().toISOString(),
      total_logs: this.logs.length,
      logs: this.logs
    }, null, 2);
  }
}

// Singleton instance
const debugLogger = DebugLoggerService.getInstance();

// Export convenience functions
export const logUserAction = (action: string, data?: any) => debugLogger.logUserAction(action, data);
export const logStateChange = (component: string, oldState: any, newState: any) => 
  debugLogger.logStateChange(component, oldState, newState);
export const logDatabaseQuery = (query: string, params?: any, result?: any, duration?: number) => 
  debugLogger.logDatabaseQuery(query, params, result, duration);
export const logUIEvent = (event: string, component: string, data?: any) => 
  debugLogger.logUIEvent(event, component, data);
export const logWorkoutEvent = (event: string, data?: any) => debugLogger.logWorkoutEvent(event, data);
export const logScheduleEvent = (event: string, data?: any) => debugLogger.logScheduleEvent(event, data);
export const captureStateSnapshot = (route: string, state: any) => 
  debugLogger.captureStateSnapshot(route, state);

export default debugLogger;