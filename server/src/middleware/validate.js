const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const err = new Error('Validation error');
    err.name = 'ZodError';
    err.errors = result.error.errors;
    return next(err);
  }
  req.validated = result.data;
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const err = new Error('Validation error');
    err.name = 'ZodError';
    err.errors = result.error.errors;
    return next(err);
  }
  req.validatedQuery = result.data;
  next();
};

module.exports = { validate, validateQuery };
