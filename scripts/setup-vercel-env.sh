#!/bin/bash
# Run this on your local machine to set all Vercel env vars
# Prerequisites: npm i -g vercel && vercel login

PROJECT="one-point-instructional-scribe"

declare -A VARS=(
  ["DATABASE_URL"]="postgresql://neondb_owner:npg_zAxrYl21kWEI@ep-lingering-fire-anhz99n2-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&pgbouncer=true"
  ["DIRECT_URL"]="postgresql://neondb_owner:npg_zAxrYl21kWEI@ep-lingering-fire-anhz99n2.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]="pk_test_aGFybWxlc3MtYnV6emFyZC0zMi5jbGVyay5hY2NvdW50cy5kZXYk"
  ["CLERK_SECRET_KEY"]="sk_test_e7fb4KDSckBBearDdQk0ls9G28a8vvjimcg3RHPeWC"
  ["NEXT_PUBLIC_CLERK_SIGN_IN_URL"]="/sign-in"
  ["NEXT_PUBLIC_CLERK_SIGN_UP_URL"]="/sign-up"
  ["NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL"]="/dashboard"
  ["NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL"]="/dashboard"
  ["NEXT_PUBLIC_APP_URL"]="https://one-point-instructional-scribe.vercel.app"
)

for KEY in "${!VARS[@]}"; do
  echo "Setting $KEY..."
  echo "${VARS[$KEY]}" | vercel env add "$KEY" production --yes --project "$PROJECT"
  echo "${VARS[$KEY]}" | vercel env add "$KEY" preview --yes --project "$PROJECT"
done

echo "Done! Triggering redeploy..."
vercel redeploy --prod --project "$PROJECT"
