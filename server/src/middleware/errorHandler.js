const ApiError = require('../utils/ApiError');
const env = require('../config/env');

const errorHandler = (err, req, res, _next) => {
  // Default values
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error';
    details = err.errors.map(e => ({ path: e.path.join('.'), message: e.message }));
  } else if (err.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource not found';
  }

  if (!env.isProd || statusCode >= 500) {
    console.error(`[${statusCode}] ${err.message}`, err.stack);
  }

  res.status(statusCode).json({
    error: { message, ...(details && { details }) },
  });
};

module.exports = errorHandler;
