class IdentityNotEnabled extends Error {
  constructor(what) {
    super(`${what} is not enabled for this identity provider`);
    this.code = 'not_enabled';
  }
}

module.exports = { IdentityNotEnabled };
