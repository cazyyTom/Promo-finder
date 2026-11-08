export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "network_error",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
