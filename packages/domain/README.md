# @icegear/domain

Framework-agnostic TypeScript types and Zod schemas shared by the Expo client,
the Next.js web app, and server-side code.

The package exposes sports, listing, seller, transaction, community, report, and
profile/onboarding contracts from its root entry point. `createListingSchema`,
`profileInputSchema`, and `onboardingInputSchema` are safe to use at API or form
boundaries in either client.
