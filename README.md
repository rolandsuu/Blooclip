This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
TRIGGER_SECRET_KEY=
ASSEMBLYAI_API_KEY=
OPENAI_API_KEY=
OPENAI_WORKER_MODEL=gpt-5-mini
```

`ASSEMBLYAI_BASE_URL` is optional and defaults to `https://api.assemblyai.com`.
`OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`.
`OPENAI_WORKER_MODEL` is optional and defaults to `gpt-5-mini`.
`VISUAL_FRAME_SAMPLE_INTERVAL_SECONDS` and
`VISUAL_FRAME_SAMPLE_MAX_FRAMES` are optional visual-analysis worker settings
and default to `3` and `30`.

Before running the worker against a fresh database, apply the Supabase migrations in `supabase/migrations/` in order.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
