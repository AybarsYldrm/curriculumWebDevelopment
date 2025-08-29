'use strict';
const crypto = require('crypto');

class AuthService {
  constructor({db}) {
    this.iterations = 310000; // PBKDF2 güvenlik seviyesi
    this.keylen = 64;         // 512 bit
    this.digest = 'sha512';   // PBKDF2 algoritması
    this.db = db;             // Veritabanı bağlantısı
  }

  // Parola hashleme (kayıt sırasında)
  hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, this.iterations, this.keylen, this.digest);
    return `pbkdf2$${this.iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  // Parola doğrulama
  async verifyPassword(password, storedHash) {
    const [type, iterStr, saltHex, hashHex] = storedHash.split('$');
    if (type !== 'pbkdf2') throw new Error('Desteklenmeyen hash formatı.');

    const iterations = parseInt(iterStr, 10);
    const salt = Buffer.from(saltHex, 'hex');
    const originalHash = Buffer.from(hashHex, 'hex');
    const testHash = crypto.pbkdf2Sync(password, salt, iterations, originalHash.length, 'sha512');

    return crypto.timingSafeEqual(originalHash, testHash);
  }

  generateSecretToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  createJWT(user, ttlSec = 3600) {
    if (!user.secretToken) throw new Error('Kullanıcının secretToken değeri yok.');

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const body = Buffer.from(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp
    })).toString('base64url');

    const data = `${header}.${body}`;
    const signature = crypto.createHmac('sha256', user.secretToken)
      .update(data)
      .digest('base64url');

    return `${data}.${signature}`;
  }

  async verifyJWT(token) {
    try {
      const [headerB64, bodyB64, sigB64] = token.split('.');
      if (!headerB64 || !bodyB64 || !sigB64) return null;

      const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString());
      if (!payload.id) return null;

      // DB’den kullanıcıyı bul ve secretToken al
      const user = await this.db.findOne('users', { id: payload.id });
      if (!user || !user.secretToken) return null;

      const data = `${headerB64}.${bodyB64}`;
      const expectedSig = crypto.createHmac('sha256', user.secretToken)
        .update(data)
        .digest('base64url');

      const sigBuf = Buffer.from(sigB64);
      const expectedBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return null;

      return { payload, user };
    } catch (err) {
      return null;
    }
  }

  async login(email, password) {
    const user = await this.db.findOne('users', { email });
    if (!user) return null;

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) return null;

    if (!user.secretToken) {
      const secretToken = this.generateSecretToken();
      await this.db.update('users', user.id, { secretToken });
      user.secretToken = secretToken;
    }

    return this.createJWT(user, 3600);
  }
}

module.exports = { AuthService };
