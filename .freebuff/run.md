# Preview run doc — Companion Life (mobile)

Serves the Expo Router app (SDK 57, web target) on **http://localhost:8090**.

## Reproduce the uncommitted artifacts

1. **Env file**: copy `mobile/.env` from the main checkout (`E:\app2`) into this
   worktree's `mobile/` directory — it holds `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (never commit values; the file is gitignored).
   Verify with: `cd mobile && ls -la .env`
2. **Dependencies**: `cd mobile && npm install` (node_modules is gitignored; the
   app needs `expo`, `expo-router`, `@supabase/supabase-js`, etc. from
   `package.json`).
3. No other artifacts are required — the icon set lives in `mobile/assets/` (tracked).

## Run the server

```bash
cd /e/app2/mobile
CI=1 EXPO_NO_TELEMETRY=1 nohup npx expo start --port 8090 \
  > /e/app2/.freebuff/preview-b0dcb3a7-4165-4d66-948b-80b05d47c79b.log 2>&1 &
```

Notes:
- Port **8090** is deliberate (project default 8081 is left free); adjust with
  `--port` if taken. `CI=1` disables interactive keys and browser auto-open —
  reloads/watch are off, so restart the server after code changes.
- Wait for HTTP 200 on `http://localhost:8090/` before registering the preview:
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/`
- Find the PID to register: `netstat -ano | grep ':8090' | grep LISTENING`
- Supabase backend is the live cloud project; the demo account
  (buffytest1785925070@gmail.com) is already signed in on this machine.
