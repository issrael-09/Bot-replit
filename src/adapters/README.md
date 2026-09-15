# Platform adapters

The safe moderation engine does not log in to a platform and does not read cookie
files. A platform adapter should:

1. Verify the platform webhook signature.
2. Convert the platform event to the normalized event accepted by `POST /webhook`.
3. Execute the returned actions using the platform's official API.
4. Keep OAuth tokens in Replit Secrets or the platform's official secret store.

Never commit session cookies, browser profiles, access tokens, passwords, or
private keys. `config/cookies.example.json` is intentionally only a placeholder.