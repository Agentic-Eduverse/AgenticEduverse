# Local media stack

This stack provides Redis, LiveKit, Egress recording, MinIO storage and Caddy HTTPS.

1. Install Docker Desktop with WSL integration.
2. Copy `.env.example` to `.env` and replace every development secret in `.env`, `livekit.yaml` and `egress.yaml` with matching random values.
3. Run `docker compose --env-file .env up -d` from this directory.
4. Trust Caddy's local root certificate on Windows. It is stored in the `caddy-data` volume under `pki/authorities/local/root.crt`.
5. Configure the web/server environment using the values documented in their `.env.example` files.

The app URL becomes `https://eduverse.localhost`; LiveKit uses `wss://livekit.eduverse.localhost`. Recording files are stored in the `eduverse-recordings` MinIO bucket. Egress records only the main `class-<classId>` room. Private tutoring uses a separate `tutoring-<tutoringId>` room and is never offered a recording control. Completed main-class recordings are published by the teacher and streamed through an authenticated same-origin range endpoint with synchronized whiteboard replay.

The checked-in LiveKit keys are development placeholders. Keep the web environment values identical to the local YAML values for a throwaway local stack, and replace all of them before any shared-network use. Configure the LiveKit webhook URL to reach `/api/media/webhook`; the checked-in container configuration targets the WSL host. Docker was unavailable on the validation host, so camera, screen-share, Egress, webhook and playback still require an integration run before the stack is treated as operational.
