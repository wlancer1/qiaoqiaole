# Phone Display Name Refresh Design

## Problem

Phone accounts use an internal `users.username` value shaped like `phone_<hash>` to satisfy the database's unique-login constraint. Registration and login responses correctly expose the user-facing `nickname`, but H5 session restoration calls `GET /api/me` and currently prefers `user.username` over `user.nickname`. After a reload, the internal identifier therefore replaces the visible name.

## Scope

Keep the internal phone username unchanged and prevent it from appearing as the H5 account display name after session restoration. Preserve legacy username/password accounts, whose username remains the fallback when no nickname is available. Do not redesign account naming or add nickname editing.

## Design

Extract a small pure H5 display-name resolver so session restoration has one explicit safety boundary. It will trim candidate values, reject any candidate whose trimmed value starts with `phone_`, and resolve the visible account name in this order:

1. A non-empty, non-phone-generated `user.nickname` returned by `GET /api/me`.
2. A non-empty, non-phone-generated `user.username` for legacy accounts without a nickname.
3. A non-empty, non-phone-generated display name stored with the local session.
4. The neutral fallback `我的创作`.

The API continues returning both fields from the legacy `/api/me` endpoint because existing legacy clients and tests consume `username`. Its current `requireUser()` normalization may copy `username` into `nickname` when the database nickname is absent; the resolver intentionally treats both fields as untrusted display-name candidates and filters generated phone identifiers from either one. Phone-auth-specific endpoints continue returning their existing public user shape. Community post and comment queries already select `nickname` before `username`, so they require no change.

## Data Flow

1. Phone registration creates an internal unique username and a public nickname such as `用户8000`.
2. H5 stores the access token and public nickname after login.
3. On reload, H5 validates the token through `/api/me`.
4. H5 passes the returned nickname, returned username, and locally stored display name through the resolver and renders the first safe value.

## Error and Compatibility Behavior

- Invalid or expired sessions retain the current behavior of clearing local authentication state.
- Legacy accounts with no nickname still display their trimmed username.
- Missing or whitespace-only fields fall back to the locally stored display name.
- A generated phone identifier is never selected from `nickname`, `username`, or local storage; malformed or exhausted candidates render `我的创作`.
- A malformed `/api/me` response still follows the existing session-error path when it prevents response handling. The existing local-storage property remains named `username` for compatibility even though phone login stores a display name in it; renaming it is out of scope.
- No database migration is required.

## Testing

Create the pure resolver under `apps/h5/src/utils/` and add a colocated focused regression test. It must fail before the resolver is wired into session restoration and prove these cases:

- A phone-shaped internal username plus a nickname resolves to the nickname.
- A legacy user without a nickname resolves to the username.
- Missing or whitespace-only server fields resolve to the trimmed locally stored display name.
- Phone-shaped values in either server field or local storage are rejected.
- Exhausted candidates resolve to `我的创作`.

Run the focused test first, then the relevant H5 test suite and type/build validation available in the repository.
