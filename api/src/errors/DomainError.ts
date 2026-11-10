export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'PLAYER_NOT_FOUND'
  | 'SLOT_NOT_FOUND'
  | 'SLOT_OCCUPIED'
  | 'SLOT_EMPTY'
  | 'NOT_READY_FOR_HARVEST'
  | 'PLANT_NOT_FOUND'
  | 'INSUFFICIENT_SEEDS'
  | 'INSUFFICIENT_COINS'
  | 'DAILY_ALREADY_CLAIMED'
  | 'GLOBAL_LIMIT_EXCEEDED'
  | 'PLAYER_LIMIT_EXCEEDED'
  | 'INVALID_DECORATION'
  | 'INVALID_SLOT'
  | 'INVALID_PAYLOAD'
  | 'ITEM_NOT_FOUND'
  | 'INSUFFICIENT_ITEMS'
  | 'NO_GROWING_PLANTS'
  | 'MAX_BUFF_REACHED'
  | 'UNKNOWN_EFFECT'
  | 'NOT_FOR_SALE'
  | 'FORBIDDEN'
  | 'TOKEN_EXPIRED'
  | 'INTERNAL_ERROR';

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: ErrorCode, statusCode: number = 400, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
