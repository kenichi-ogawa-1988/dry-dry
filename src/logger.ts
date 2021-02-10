import * as chalk from 'chalk';
import * as loglevel from 'loglevel';

/**
 * The Dry Logging Facade
 * Allows to wrap the chosen logging api.
 */
export class Logger {
    private static lvl: loglevel.LogLevelDesc = 'warn';
    private innerLogger: loglevel.Logger;

    /**
     * @param {string} namespace The logger namespace
     */
    private constructor(namespace: string) {
        this.innerLogger = loglevel.getLogger(namespace);
    }

    /**
     * Set the level for all loggers
     *
     * @param {string} namespace The logger level. one of ['error','info','debug','trace']
     */
    public static setLevel(level: string): void {
        Logger.lvl = level as loglevel.LogLevelDesc;
    }

    /**
     * @param {string} namespace The logger namespace
     * @return {Logger} A new logger
     */
    public static getLogger(namespace: string): Logger {
        return new Logger(namespace);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public trace(...msg: any[]): void {
        this.innerLogger.setLevel(Logger.lvl);
        this.innerLogger.trace(chalk.dim(`${new Date()} [TRACE]: ${msg}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public debug(...msg: any[]): void {
        this.innerLogger.setLevel(Logger.lvl);
        this.innerLogger.debug(chalk.cyan(`${new Date()} [DEBUG]: ${msg}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public info(...msg: any[]): void {
        this.innerLogger.setLevel(Logger.lvl);
        this.innerLogger.info(chalk.blue(`${new Date()} [INFO]: ${msg}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public warn(...msg: any[]): void {
        this.innerLogger.setLevel(Logger.lvl);
        this.innerLogger.warn(chalk.yellow(`${new Date()} [WARN]: ${msg}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public error(...msg: any[]): void {
        this.innerLogger.setLevel(Logger.lvl);
        this.innerLogger.error(chalk.red(`${new Date()} [ERROR]: ${msg}`));
    }

    public isTraceEnabled(): boolean {
        return this.innerLogger.getLevel() <= loglevel.levels.TRACE;
    }

    public isDebugEnabled(): boolean {
        return this.innerLogger.getLevel() <= loglevel.levels.DEBUG;
    }

    public isInfoEnabled(): boolean {
        return this.innerLogger.getLevel() <= loglevel.levels.INFO;
    }

    public isWarnEnabled(): boolean {
        return this.innerLogger.getLevel() <= loglevel.levels.WARN;
    }

    public isErrorEnabled(): boolean {
        return this.innerLogger.getLevel() <= loglevel.levels.ERROR;
    }
}
