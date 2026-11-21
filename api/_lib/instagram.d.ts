export interface OperationResult {
  status: number;
  body: any;
}

export interface ServerConfig {
  rapidApiKey: string;
  graphToken: string;
  graphUserId: string;
  graphVersion: string;
}

export type Operation = (config: ServerConfig, body: Record<string, unknown>) => Promise<OperationResult>;

export const RAPIDAPI_HOST: string;
export function toHandle(value: unknown): string;
export function configFromEnv(env: Record<string, string | undefined>): ServerConfig;
export function isInstagramMediaLink(value: unknown): boolean;
export const OPERATIONS: {
  posts: Operation;
  search: Operation;
  link: Operation;
};
export function createHandler(operation: Operation): (req: any, res: any) => Promise<unknown>;
