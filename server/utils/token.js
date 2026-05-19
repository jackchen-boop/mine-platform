import jwt from 'jsonwebtoken';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const EXPIRES = () => process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload) {
  return jwt.sign(payload, SECRET(), { expiresIn: EXPIRES() });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET());
}

export function refreshToken(oldToken) {
  const payload = verifyToken(oldToken);
  const { iat, exp, ...clean } = payload;
  return signToken(clean);
}
