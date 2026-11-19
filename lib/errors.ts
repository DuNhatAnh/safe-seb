// Loi nghiep vu. Service chi nem cac loi nay; Router doi `status` thanh ma HTTP.
export abstract class AppError extends Error {
  abstract readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.extra = extra; // du lieu tra kem cho client (vd: ket qua cu khi nop trung)
  }
}

export class ValidationError extends AppError { readonly status = 400; }
export class UnauthorizedError extends AppError { readonly status = 401; }
export class ForbiddenError extends AppError { readonly status = 403; }
export class NotFoundError extends AppError { readonly status = 404; }
export class ConflictError extends AppError { readonly status = 409; }
export class PayloadTooLargeError extends AppError { readonly status = 413; }
export class TooManyAttemptsError extends AppError { readonly status = 429; }
export class ConfigError extends AppError { readonly status = 500; }
export class UpstreamError extends AppError { readonly status = 502; }
