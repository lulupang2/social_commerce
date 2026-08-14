import { handleSignListingImages } from "./handler.ts";

Deno.serve((req: Request) => handleSignListingImages(req));
