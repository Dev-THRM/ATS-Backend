import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Send server errors (5xx) or unhandled runtime exceptions to Sentry
    if (status >= 500 && Sentry.isInitialized()) {
      Sentry.withScope((scope) => {
        scope.setExtra('url', request.url);
        scope.setExtra('method', request.method);
        if ((request as any).user) {
          scope.setUser({
            id: (request as any).user.id,
            email: (request as any).user.email,
            organizationId: (request as any).user.organizationId,
          });
        }
        Sentry.captureException(exception);
      });
    }

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object') {
        return response.status(status).json(res);
      }
      return response.status(status).json({
        statusCode: status,
        message: res,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Unhandled exception
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
