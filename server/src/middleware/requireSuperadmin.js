const ApiError = require('../utils/ApiError');

const requireSuperadmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    throw ApiError.forbidden('Superadmin access required');
  }
  next();
};

module.exports = requireSuperadmin;
