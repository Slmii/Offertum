/**
 * Wire-format decimal-string validators. Amounts/quantities cross the API as strings
 * to preserve precision over JSON; these patterns mirror the Prisma `Decimal` bounds.
 */

/** Money: Prisma `Decimal(10, 2)` — up to 8 integer digits + up to 2 decimals. */
export const MONEY_DECIMAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
export const MONEY_DECIMAL_MESSAGE = 'must be a decimal with up to 8 integer digits and up to 2 decimals';

/** Quantity: Prisma `Decimal(12, 2)` — up to 10 integer digits + up to 2 decimals. */
export const QUANTITY_DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const QUANTITY_DECIMAL_MESSAGE = 'must be a decimal with up to 10 integer digits and up to 2 decimals';
