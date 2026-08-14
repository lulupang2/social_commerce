import { handleRecommendListings } from "./handler.ts";

Deno.serve((req: Request) => handleRecommendListings(req));
