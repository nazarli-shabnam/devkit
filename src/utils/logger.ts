import * as util from 'util';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
      typeof arg === 'object' ? util.inspect(arg, { depth: 2 }) : String(arg)
    ).join(' ');
    
    return `[${timestamp}] [${level}] ${message}${formattedArgs ? ' ' + formattedArgs : ''}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.colors.cyan + this.formatMessage('DEBUG', message, ...args) + this.colors.reset);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.colors.green + this.formatMessage('INFO', message, ...args) + this.colors.reset);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.colors.yellow + this.formatMessage('WARN', message, ...args) + this.colors.reset);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.colors.red + this.formatMessage('ERROR', message, ...args) + this.colors.reset);
    }
  }

  success(message: string): void {
    console.log(this.colors.green + this.colors.bright + `✓ ${message}` + this.colors.reset);
  }

  step(message: string): void {
    console.log(this.colors.blue + `→ ${message}` + this.colors.reset);
  }
}

export const logger = new Logger();
