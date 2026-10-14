export type ServiceCode = "not_found" | "invalid" | "expired" | "used" | "mismatch";

export class ServiceError extends Error {
  readonly code: ServiceCode;

  constructor(code: ServiceCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}
