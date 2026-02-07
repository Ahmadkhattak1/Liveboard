import { nanoid } from 'nanoid';

export function generateBoardId(): string {
  return nanoid(12);
}

export function generateObjectId(): string {
  return nanoid(16);
}

export function generateUserId(): string {
  return nanoid(16);
}

export function generateOperationId(): string {
  return nanoid(20);
}
