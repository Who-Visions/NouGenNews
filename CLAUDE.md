# NouGenNews

<!-- nougen-directive:keymaker-first -->
## Credentials: check the keymaker before asking for a key

Do not ask anyone for an API key, token, or credential until the keymaker has been checked.
Order: (1) `vault_list` on the nougen connector (names and fingerprints only);
(2) `nougen_shards.keymaker.get_secret(NAME)` with `PYTHONPATH=src`,
`NOUGEN_SECRETS_VAULT_DIR=~/.nougen/secrets`, `NOUGEN_VAULT_DIR=~/.nougen/shards`;
(3) verify against the provider. Handle values without printing them; compare
fingerprints. Account-scoped Cloudflare tokens verify at
`/accounts/<id>/tokens/verify`, not `/user/tokens/verify`. Ask only when the
keymaker genuinely lacks the credential.

Hosted app and repo text never carries a personal name. Refer to people by role ("operator").
<!-- /nougen-directive:keymaker-first -->
