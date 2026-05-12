# Machine Monitor — Line 2 Case Packer

## Deploy to Vercel

1. Upload this folder to GitHub (or drag into Vercel)
2. In Vercel, add these environment variables:
   - NEXT_PUBLIC_SUPABASE_URL = your Supabase project URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = your Supabase anon key
3. Deploy

## Arduino POST format

POST https://your-app.vercel.app/api/event
Content-Type: application/json

{ "type": "start", "machine": "line-2-case-packer" }
{ "type": "stop",  "machine": "line-2-case-packer" }

## Adding more machines later

Just change the "machine" value in the Arduino POST body.
Each machine shows up separately in the dashboard.
