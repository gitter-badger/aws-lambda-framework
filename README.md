# AWS Lambda Framework

A framework for simplifying writing AWS Lambda functions in typescript featuring IoC with services for input validation, sending slack notifications, and using AWS services

# Installation

```
npm i aws-lambda-framework
```

# Usage

In the code below I've provided a simple show-case of how to use the framework for making a Lambda function with input validation that uses the Mysql service to execute a query. The result returned from the service will be always be wrapped inside the body of an HTTP response, such that the function can easily be used in conjunction with API Gateway. Should an error occur, it will be logged, a notification will be send to a Slack channel (if an incoming webhook for a channel is provided) and the error will be sent back in the body of the HTTP response.

```typescript
// file TestLambda.ts

import { TestInput } from './constants/TestInput'
import {
  BaseLambda,
  LambdaContainer,
  InputValidator,
  Mysql,
  Property,
  LambdaError,
  APIGatewayProxyEvent,
  Context,
  APIGatewayProxyResult,
  ValidationError
} from '../../src/aws-lambda-framework'

class TestLambda extends BaseLambda {
  input: TestInput

  constructor(event: APIGatewayProxyEvent, context: Context) {
    super(event, context)
    const request = LambdaContainer.get<TestInput>(Property.EVENT_BODY)
    this.input = new TestInput(request.testString, request.testNumber)
  }

  async invoke(): Promise<any> {
    await this.validateInput()
    const res = await LambdaContainer.get(Mysql).execute('bad sql')
    if (!res.success) throw new LambdaError()
    return res.result
  }

  private async validateInput() {
    return LambdaContainer.get(InputValidator)
      .validateOrReject(this.input)
      .catch(errors => {
        throw new ValidationError(errors)
      })
  }
}

export function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  return new TestLambda(event, context).useSlack(process.env.SLACK_WEBHOOK!).handler()
}
```

Note that most standard configuration (such as the slack webhook or database credentials) can simply be provided as environment variables instead of setting it on the service itself. This will be covered in the next section

# Environment variables

The framework uses environment variables for the most basic configuration of services. Note that the environment variable is also used in some of these services, e.g. to disable sending Slack notifications unless the environment is set to production and closing connection pools in test environments.

Environment

- NODE_ENV

Slack

- SLACK_WEBHOOK

AWS

- REGION

Mysql

- MYSQL_HOST
- MYSQL_DB
- MYSQL_USER
- MYSQL_PASS
- MYSQL_CONNECTIONS_LIMIT

Postgres

- POSTGRES_HOST
- POSTGRES_PORT
- POSTGRES_DB
- POSTGRES_USER
- POSTGRES_PASS
- POSTGRES_CONNECTIONS_LIMIT

# Roadmap

##More AWS services

##Travis-CI

##CodeCov

##Issue tracking

##Publish on npm
