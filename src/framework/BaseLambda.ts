import LambdaFunction from './interfaces/LambdaFunction'
import {
  LambdaContainer,
  Mysql,
  Postgres,
  SlackNotifier,
  Property,
  Environment,
  HttpStatusCode,
  Context,
  APIGatewayProxyResult,
  APIGatewayProxyEvent
} from '../aws-lambda-framework'
import jwtDecode from 'jwt-decode'
import { LambdaResult } from './interfaces/LambdaResult'
import { LambdaError } from './errors/LambdaError'

export abstract class BaseLambda implements LambdaFunction {
  constructor(event: APIGatewayProxyEvent, context: Context) {
    LambdaContainer.bind<APIGatewayProxyEvent>(Property.EVENT).toConstantValue(event)
    LambdaContainer.bind<Context>(Property.CONTEXT).toConstantValue(context)
    LambdaContainer.bind<object>(Property.EVENT_BODY).toConstantValue(
      typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    )
    LambdaContainer.bind<Context>(Property.COGNITO_TOKEN).toConstantValue(
      event.headers?.Authorization ? JSON.parse(JSON.stringify(jwtDecode(event.headers.Authorization))) : undefined
    )
  }

  abstract async invoke(): Promise<LambdaResult>

  async handler(): Promise<APIGatewayProxyResult> {
    try {
      return this.APIGatewayResponse(HttpStatusCode.Ok, await this.invoke())
    } catch (err) {
      if (!err.isLambdaError) err = new LambdaError(err.message, err.stack, undefined, err.statusCode)
      if (process.env.NODE_ENV !== Environment.Test) console.error(err)
      await LambdaContainer.get(SlackNotifier).notify(err.errorMessage ?? err)
      return this.APIGatewayResponse(err.statusCode ?? HttpStatusCode.InternalServerError, err)
    } finally {
      if (LambdaContainer.isBound(Mysql)) await LambdaContainer.get(Mysql).end()
      if (LambdaContainer.isBound(Postgres)) await LambdaContainer.get(Postgres).end()
    }
  }

  private APIGatewayResponse(statusCode: HttpStatusCode, result: LambdaResult) {
    let response: APIGatewayProxyResult = {
      statusCode: statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers with HTTPS
        'content-type': 'application/json'
      },
      body: JSON.stringify(result),
      isBase64Encoded: false
    }

    return response
  }
}
