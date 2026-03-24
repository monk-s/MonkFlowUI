const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { generateToken, hashToken } = require('../utils/crypto');
const userModel = require('../models/user.model');
const refreshTokenModel = require('../models/refreshToken.model');

const hashPassword = (password) => bcrypt.hash(password, 12);

const comparePassword = (password, hash) => bcrypt.compare(password, hash);

const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

const generateRefreshToken = async (userId) => {
  const raw = generateToken(48);
  const hashed = hashToken(raw);
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiresDays * 24 * 60 * 60 * 1000);
  await refreshTokenModel.create(userId, hashed, expiresAt);
  return raw;
};

const refreshAccessToken = async (rawRefreshToken) => {
  const hashed = hashToken(rawRefreshToken);
  const stored = await refreshTokenModel.findByHash(hashed);
  if (!stored) return null;

  // Rotate: revoke old, issue new pair
  await refreshTokenModel.revoke(hashed);
  const user = await userModel.findById(stored.user_id);
  if (!user) return null;

  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id);
  return { accessToken, refreshToken: newRefreshToken, user: userModel.sanitize(user) };
};

const revokeRefreshToken = async (rawRefreshToken) => {
  const hashed = hashToken(rawRefreshToken);
  await refreshTokenModel.revoke(hashed);
};

const generatePasswordResetToken = async (userId) => {
  const raw = generateToken(32);
  const hashed = hashToken(raw);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await userModel.update(userId, {
    password_reset_token: hashed,
    password_reset_expires: expires,
  });
  return raw;
};

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  generatePasswordResetToken,
};
