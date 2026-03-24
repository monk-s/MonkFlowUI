const crypto = require('crypto');

const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const generateApiKey = () => {
  const prefix = 'mk_' + crypto.randomBytes(4).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  return { prefix, key: `${prefix}_${secret}`, secret };
};

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

module.exports = { generateToken, generateApiKey, hashToken };
