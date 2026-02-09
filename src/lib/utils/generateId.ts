import { customAlphabet, nanoid } from 'nanoid';

const shareCodeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const shareCodeGenerator = customAlphabet(shareCodeAlphabet, 8);

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

export function generateShareCode(): string {
  return shareCodeGenerator();
}
