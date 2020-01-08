import mysql, {
  Connection as MysqlConnection,
  Pool as MysqlPool,
  ConnectionOptions as MysqlConfig,
  PoolOptions as MysqlPoolConfig,
  PoolConnection as MysqlPoolConnection
} from 'mysql2/promise'
import { injectable } from 'inversify'
import Connection from '@framework/interfaces/Connection'
import { LambdaContainer, Environment, Property } from '../../aws-lambda-framework'
import { Result } from '@framework/types/Result'
import { Query } from '@framework/interfaces/Query'
const TRANSACTION_SUCCESS_MESSAGE = 'Succesfully executed all queries in transaction!'

@injectable()
export class Mysql implements Connection {
  connection?: MysqlConnection
  pool?: MysqlPool
  pooling: boolean = true
  config: MysqlConfig = {
    host: process.env.MYSQL_HOST,
    database: process.env.MYSQL_DB,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS
  }
  poolConfig: MysqlPoolConfig = {
    ...this.config,
    ...{
      connectionLimit: parseInt(process.env.MYSQL_CONNECTIONS_LIMIT ?? '10')
    }
  }

  async execute(query: Query): Promise<Result<any[], Error>> {
    if (LambdaContainer.get<boolean>(Property.LOGGING))
      console.log(`SQL: ${query.sql}\n${query.inputs ? `Inputs: [${query.inputs}]` : ''}`)

    if (this.pooling) return this.poolExecute(query)
    else return this.connectionExecute(query)
  }

  private async poolExecute(query: Query): Promise<Result<any[], Error>> {
    try {
      if (!this.pool) this.pool = mysql.createPool(this.poolConfig)

      const [rows] = await this.pool.execute(query.sql, query.inputs)

      return {
        success: true,
        result: rows as any[]
      }
    } catch (err) {
      return {
        success: false,
        error: err
      }
    }
  }

  private async connectionExecute(query: Query): Promise<Result<any[], Error>> {
    try {
      if (!this.connection) this.connection = await mysql.createConnection(this.config)

      const [rows] = await this.connection.execute(query.sql, query.inputs)

      return {
        success: true,
        result: rows as any[]
      }
    } catch (err) {
      return {
        success: false,
        error: err
      }
    }
  }

  async executeTransaction(queries: Query[]): Promise<Result<string, Error>> {
    if (this.pooling) return this.poolExecuteTransaction(queries)
    else return this.connectionExecuteTransaction(queries)
  }

  private async poolExecuteTransaction(queries: Query[]): Promise<Result<string, Error>> {
    let connection: MysqlPoolConnection | undefined

    try {
      if (!this.pool) this.pool = mysql.createPool(this.poolConfig)
      connection = await this.pool.getConnection()

      await connection.beginTransaction()

      for (const query of queries) {
        await connection.execute(query.sql, query.inputs)
      }

      await connection.commit()

      return {
        success: true,
        result: TRANSACTION_SUCCESS_MESSAGE
      }
    } catch (err) {
      if (connection) await connection.rollback()
      return {
        success: false,
        error: err
      }
    }
  }

  private async connectionExecuteTransaction(queries: Query[]): Promise<Result<string, Error>> {
    try {
      if (!this.connection) this.connection = await mysql.createConnection(this.config)

      await this.connection.beginTransaction()

      for (const query of queries) {
        await this.connection.execute(query.sql, query.inputs)
      }

      await this.connection.commit()

      return {
        success: true,
        result: TRANSACTION_SUCCESS_MESSAGE
      }
    } catch (err) {
      if (this.connection) await this.connection.rollback()
      return {
        success: false,
        error: err
      }
    }
  }

  async end(): Promise<void> {
    if (this.connection) await this.connection.end()
    if (process.env.NODE_ENV === Environment.Test && this.pool) await this.pool.end()
  }
}