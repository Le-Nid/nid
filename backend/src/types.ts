import { Kysely } from "kysely";
import { Redis } from "ioredis";
import { Database } from "./db/types";

declare module "fastify" {
  interface FastifyInstance {
    db: Kysely<Database>;
    redis: Redis;
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
