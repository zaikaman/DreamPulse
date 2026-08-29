import type { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware for telemetry and audit trails.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP ${req.method}] ${req.url} - ${timestamp}`);
  next();
}

/**
 * Global API Error Handling Middleware.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: 'Not allowed by CORS',
    });
    return;
  }
  console.error('[API Error]:', err.stack || err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
}
