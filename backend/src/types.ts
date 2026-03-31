import { Kysely } from "kysely";
import { Redis } from "ioredis";
import { Database } from "./db/types";

export interface JwtUser {
  sub: string;
  email: string;
  role: string;
  exp?: number;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: JwtUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    db: Kysely<Database>;
    redis: Redis;
    authenticate: (request: any, reply: any) => Promise<void>;
    requireAccountOwnership: (request: any, reply: any) => Promise<void>;
    requireAdmin: (request: any, reply: any) => Promise<void>;
  }
}
