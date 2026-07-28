# Kunstifyb Backend Server

A TypeScript-based Express backend for the Mark-test server project. This repository provides API routing, MongoDB integration, Redis queue workers, blockchain contract helpers, GraphQL support, and IPFS/file handling.

## Key Features

- Express server with TypeScript
- MongoDB via Mongoose
- Redis + BullMQ background workers
- GraphQL endpoints
- File upload and IPFS support
- Smart contract integration with Ethers
- Rate limiting, CORS, security headers, JWT auth
- Cron jobs for recurring tasks and stats

## Requirements

- Node.js 20+ (recommended)
- pnpm or npm
- MongoDB connection
- Redis connection
- `.env` environment variables

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
   or with npm:
   ```bash
   npm install
   ```
3. Copy the environment file:
   ```bash
   cp env.example .env
   ```
4. Update `.env` with your values.

## Environment Variables

In `.env`, set at least the following values:

```env
JWT_SECRET=

SWAP_TREASURY_ADDRESS=

```

- `JWT_SECRET`: secret key for signing JWT tokens.

```bash
openssl rand -hex 64
```

- `SWAP_TREASURY_ADDRESS`: treasury address for swap operations.




## Scripts

- `pnpm dev` or `npm run dev`: start the server in development mode with `nodemon`.
- `pnpm start` or `npm start`: run `nodemon` default command.
- `pnpm build` or `npm run build`: compile TypeScript with `tsc`.

## Recommended Start Command

```bash
npm dev
```

## Project Structure

- `src/index.ts` - server entry point
- `src/app.ts` - Express app configuration
- `src/router/` - REST route definitions
- `src/mongoDb/` - MongoDB controllers and schemas
- `src/redis/` - Redis connection, queues, and workers
- `src/Processor/` - business logic processors
- `src/config/` - configuration modules
- `src/services/` - external service integrations
- `src/utils/` - utility helpers
- `src/ABI/` - smart contract ABIs

## Notes

- Ensure MongoDB and Redis services are running before launching the backend.
- Review `src/config/connectdb.ts`, `src/config/redis.ts`, and `src/config/contract.ts` for connection settings.
- Use a secure, production-ready `.env` for live deployments.

## Troubleshooting

- If TypeScript compile errors appear, run:
  ```bash
  pnpm build
  ```
- If the server does not start, verify environment variables and service connections.

## License

This repository does not specify a license in `package.json`.
