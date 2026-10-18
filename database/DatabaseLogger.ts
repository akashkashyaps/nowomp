import * as SQLite from 'expo-sqlite';
import { logDatabaseQuery } from '@/services/DebugLoggerService';

/**
 * Database Logger Wrapper
 * 
 * This wrapper intercepts all database operations and logs them to the debug system
 * providing real-time visibility into database queries, performance, and results.
 */

interface QueryResult {
  changes?: number;
  lastInsertRowId?: number;
}

interface LoggedDatabase {
  getFirstAsync<T = any>(query: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(query: string, params?: any[]): Promise<T[]>;
  runAsync(query: string, params?: any[]): Promise<QueryResult>;
  execAsync(query: string): Promise<void>;
}

export class DatabaseLogger {
  private db: SQLite.SQLiteDatabase;
  private queryCounter = 0;
  
  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }
  
  private generateQueryId(): string {
    return `Q${++this.queryCounter}`;
  }
  
  private sanitizeQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim();
  }
  
  private logQueryStart(queryId: string, query: string, params?: any[]) {
    logDatabaseQuery(`[${queryId}] START: ${this.sanitizeQuery(query)}`, params);
  }
  
  private logQueryComplete(queryId: string, query: string, result: any, startTime: number) {
    const duration = Date.now() - startTime;
    const resultSummary = this.summarizeResult(result);
    logDatabaseQuery(
      `[${queryId}] COMPLETE: ${this.sanitizeQuery(query)}`, 
      undefined, 
      resultSummary, 
      duration
    );
  }
  
  private logQueryError(queryId: string, query: string, error: any, startTime: number) {
    const duration = Date.now() - startTime;
    console.error(`[DB Error ${queryId}] ${error.message}`, {
      query: this.sanitizeQuery(query),
      duration,
      error: error.message
    });
  }
  
  private summarizeResult(result: any): any {
    if (result === null) return 'null';
    if (result === undefined) return 'undefined';
    if (Array.isArray(result)) return `${result.length} rows`;
    if (typeof result === 'object' && result.changes !== undefined) {
      return `changed: ${result.changes}, insertId: ${result.lastInsertRowId || 'N/A'}`;
    }
    if (typeof result === 'object') return 'object';
    return result;
  }
  
  async getFirstAsync<T = any>(query: string, params?: any[]): Promise<T | null> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    this.logQueryStart(queryId, query, params);
    
    try {
      const result = await this.db.getFirstAsync<T>(query, params ?? []);
      this.logQueryComplete(queryId, query, result, startTime);
      return result;
    } catch (error) {
      this.logQueryError(queryId, query, error, startTime);
      throw error;
    }
  }
  
  async getAllAsync<T = any>(query: string, params?: any[]): Promise<T[]> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    this.logQueryStart(queryId, query, params);
    
    try {
      const result = await this.db.getAllAsync<T>(query, params ?? []);
      this.logQueryComplete(queryId, query, result, startTime);
      return result;
    } catch (error) {
      this.logQueryError(queryId, query, error, startTime);
      throw error;
    }
  }
  
  async runAsync(query: string, params?: any[]): Promise<QueryResult> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    this.logQueryStart(queryId, query, params);
    
    try {
      const result = await this.db.runAsync(query, params ?? []);
      this.logQueryComplete(queryId, query, result, startTime);
      return result;
    } catch (error) {
      this.logQueryError(queryId, query, error, startTime);
      throw error;
    }
  }
  
  async execAsync(query: string): Promise<void> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    this.logQueryStart(queryId, query);
    
    try {
      await this.db.execAsync(query);
      this.logQueryComplete(queryId, query, 'executed', startTime);
    } catch (error) {
      this.logQueryError(queryId, query, error, startTime);
      throw error;
    }
  }
  
  // Utility methods for query analysis
  getQueryStats(): any {
    return {
      totalQueries: this.queryCounter,
      averageTime: 'N/A', // Could be tracked with more complex logic
      timestamp: new Date().toISOString()
    };
  }
  
  // Method to get raw database for operations that need direct access
  getRawDatabase(): SQLite.SQLiteDatabase {
    return this.db;
  }
}

// Enhanced database wrapper that provides logging
export class LoggedDatabaseWrapper {
  private db: SQLite.SQLiteDatabase | null = null;
  private logger: DatabaseLogger | null = null;
  
  async initialize(): Promise<LoggedDatabase> {
    if (this.db && this.logger) {
      return this.logger;
    }
    
    // Import the original database to get initialized instance
    const { database } = await import('./database');
    this.db = await database.getDatabase();
    this.logger = new DatabaseLogger(this.db);
    
    return this.logger;
  }
  
  async getLoggedDatabase(): Promise<LoggedDatabase> {
    if (!this.logger) {
      await this.initialize();
    }
    return this.logger!;
  }
  
  // For backward compatibility with existing code
  async getDatabase(): Promise<LoggedDatabase> {
    return this.getLoggedDatabase();
  }
}

// Export singleton instance
export const loggedDatabase = new LoggedDatabaseWrapper();