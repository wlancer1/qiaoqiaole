# Phone Display Name Refresh Design

## Problem

Phone accounts use an internal `users.username` value shaped like `phone_<hash>` to satisfy the database's unique-login constraint. Registration and login responses correctly expose the user-facing `nickname`, but H5 session restoration calls `GET /api/me` and currently prefers `user.username` over `user.nickname`. After a reload, the internal identifier therefore replaces the visible name.

## Scope

Keep the internal phone username unchanged and prevent it from appearing as the H5 account display name after session restoration. Preserve legacy username/password accounts, whose username remains the fallback when no nickname is available. Do not redesign account naming or add nickname editing.

## Design

The H5 session restoration boundary will resolve the visible account name in this order:

1. A non-empty `user.nickname` returned by `GET /api/me`.
2. A non-empty `user.username` for legacy accounts without a nickname.
3. The display name stored with the local session.

The API continues returning both fields from the legacy `/api/me` endpoint because existing legacy clients and tests consume `username`. Phone-auth-specific endpoints continue returning their existing public user shape. Community post and comment queries already select `nickname` before `username`, so they require no change.

## Data Flow

1. Phone registration creates an internal unique username and a public nickname such as `用户8000`.
2. H5 stores the access token and public nickname after login.
3. On reload, H5 validates the token through `/api/me`.
4. H5 selects the returned nickname before the internal username and renders that value.

## Error and Compatibility Behavior

- Invalid or expired sessions retain the current behavior of clearing local authentication state.
- Legacy accounts with no nickname still display their username.
- Missing fields fall back to the locally stored display name.
- No database migration is required.

## Testing

Add a focused H5 regression test for the display-name selection behavior. It must fail under the current username-first ordering and prove both cases:

- A phone-shaped internal username plus a nickname resolves to the nickname.
- A legacy user without a nickname resolves to the username.

Run the focused test first, then the relevant H5 test suite and type/build validation available in the repository.
