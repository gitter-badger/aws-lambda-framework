import mysql, {
  Connection as MysqlConnection,
  Pool as MysqlPool,
  ConnectionOptions as MysqlConfig,
  PoolOptions as MysqlPoolConfig,
  PoolConnection as MysqlPoolConnection,
  RowDataPacket
} from 'mysql2/promise'
import { injectable } from 'inversify'
import Connection from '../interfaces/Connection'
import { LambdaContainer, Environment, Property } from '../../aws-lambda-framework'
import { Query } from '../interfaces/Query'
import 'reflect-metadata'
import { QueryResult } from '../interfaces/QueryResult'
import { TransactionResult, TRANSACTION_SUCCESS_MESSAGE } from '../interfaces/TransactionResult'

@injectable()
export class Mysql implements Connection {
  private connection?: MysqlConnection
  private pool?: MysqlPool
  private logging = LambdaContainer.get<boolean>(Property.LOGGING)
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

  async execute<T>(query: Query): Promise<QueryResult<T>> {
    if (this.logging) console.log(`SQL: ${query.sql}\n${query.inputs ? `Inputs: [${query.inputs}]` : ''}`)

    if (this.pooling) return this.poolExecute(query)
    else return this.connectionExecute(query)
  }

  private async poolExecute<T>(query: Query): Promise<QueryResult<T>> {
    try {
      if (!this.pool) this.pool = mysql.createPool(this.poolConfig)

      let [rows] = await this.pool.execute(query.sql, query.inputs)

      if (Array.isArray(rows)) return { rows: rows as Array<T> }
      else return { rows: [], metadata: rows }
    } catch (err) {
      throw Error(err)
    }
  }

  private async connectionExecute<T>(query: Query): Promise<QueryResult<T>> {
    try {
      if (!this.connection) this.connection = await mysql.createConnection(this.config)

      const [rows] = await this.connection.execute(query.sql, query.inputs)

      if (Array.isArray(rows)) return { rows: rows as Array<T> }
      else return { rows: [], metadata: rows }
    } catch (err) {
      throw Error(err)
    }
  }

  async executeTransaction(queries: Query[]): Promise<TransactionResult> {
    if (this.pooling) return this.poolExecuteTransaction(queries)
    else return this.connectionExecuteTransaction(queries)
  }

  private async poolExecuteTransaction(queries: Query[]): Promise<TransactionResult> {
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
        message: TRANSACTION_SUCCESS_MESSAGE
      }
    } catch (err) {
      if (connection) await connection.rollback()
      throw Error(err)
    }
  }

  private async connectionExecuteTransaction(queries: Query[]): Promise<TransactionResult> {
    try {
      if (!this.connection) this.connection = await mysql.createConnection(this.config)

      await this.connection.beginTransaction()

      for (const query of queries) {
        await this.connection.execute(query.sql, query.inputs)
      }

      await this.connection.commit()

      return {
        message: TRANSACTION_SUCCESS_MESSAGE
      }
    } catch (err) {
      if (this.connection) await this.connection.rollback()
      throw Error(err)
    }
  }

  async end(): Promise<void> {
    if (this.connection) await this.connection.end()
    if (process.env.NODE_ENV === Environment.Test && this.pool) await this.pool.end()
  }
}
