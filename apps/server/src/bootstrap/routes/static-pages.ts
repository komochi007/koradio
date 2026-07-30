import fastifyStatic from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";

export function createStaticPageRoutes(webRoot: string): FastifyPluginAsync {
  return async (app) => {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
    });
    for (const route of ["/radio", "/library", "/taste", "/programs", "/settings"]) {
      app.get(route, (_request, reply) => reply.sendFile("index.html"));
    }
  };
}
