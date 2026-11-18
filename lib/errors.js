// Loi nghiep vu. Service chi nem cac loi nay; Router doi `status` thanh ma HTTP.
class AppError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = this.constructor.name;
    this.extra = extra; // du lieu tra kem cho client (vd: ket qua cu khi nop trung)
  }
}

class ValidationError extends AppError { get status() { return 400; } }
class UnauthorizedError extends AppError { get status() { return 401; } }
class NotFoundError extends AppError { get status() { return 404; } }
class ConflictError extends AppError { get status() { return 409; } }
class PayloadTooLargeError extends AppError { get status() { return 413; } }
class TooManyAttemptsError extends AppError { get status() { return 429; } }
class ConfigError extends AppError { get status() { return 500; } }
class UpstreamError extends AppError { get status() { return 502; } }

module.exports = {
  AppError, ValidationError, UnauthorizedError, NotFoundError, ConflictError,
  PayloadTooLargeError, TooManyAttemptsError, ConfigError, UpstreamError
};
