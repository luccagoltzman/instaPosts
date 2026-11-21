import type { ServerResponse } from 'node:http';

export function isAllowedMediaUrl(url: string): boolean;
export function streamMedia(url: unknown, range: unknown, res: ServerResponse): Promise<void>;
