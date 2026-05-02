# Keycloak — Alumni Shop Setup & Demo Guide

This document maps the **mentor specification** to the actual configuration shipped
in this repository, and gives you a step-by-step demo you can run in front of your
mentor.

---

## 0. Naming map (spec ↔ this project)

The realm and client are named after the host project (`nitte-*`) but the
**structure, roles, mappers and behavior match the spec exactly**.

| Spec name           | This project          | Where it is configured                         |
| ------------------- | --------------------- | ----------------------------------------------- |
| Realm `alumni-shop` | `nitte-realm`         | `keycloak/nitte-realm.json` line 3             |
| Client `alumni-backend` | `nitte-client`    | `keycloak/nitte-realm.json` line 35            |
| Client `alumni-frontend` (optional) | not used | The same confidential client serves both       |
| Service account     | `service-account-nitte-client` | Auto-created by Keycloak when `serviceAccountsEnabled: true` |

If the mentor insists on the literal names, you can search-and-replace
`nitte-realm` → `alumni-shop`, `nitte-client` → `alumni-backend` in
`keycloak/nitte-realm.json`, `docker-compose.yml`, and `node-backend/.env*`,
then re-run `./docker-setup.sh restart`.

---

## 1. What is configured

### 1.1 Realm
- Name: `nitte-realm` (alumni-shop equivalent)
- Brute force protection: ON
- Email login allowed
- Reset password allowed
- Access token lifespan: 30 minutes

### 1.2 Client `nitte-client` (alumni-backend equivalent)
- Access type: **confidential** (`publicClient: false`)
- Standard flow enabled (browser login)
- Direct access grants enabled (password grant for demo)
- **Service accounts enabled** (client_credentials flow)
- Valid redirect URIs: `*` (per spec)
- Web origins: storefront, admin, API
- Client secret: `nitte-client-secret`

### 1.3 Roles (realm-level, per spec)
| Role           | Purpose                                  |
| -------------- | ---------------------------------------- |
| `admin`        | Full access                              |
| `alumni`       | Verified alumni                          |
| `non_alumni`   | Limited access                           |
| `merchant`     | Sellers                                  |
| `mongo_writer` | Internal service role for backend writes |

### 1.4 Sample users (matching the spec)
| Username        | Password       | Role         |
| --------------- | -------------- | ------------ |
| `admin_user`    | `Admin@123`    | admin        |
| `alumni_user`   | `Alumni@123`   | alumni       |
| `guest_user`    | `Guest@123`    | non_alumni   |
| `merchant_user` | `Merchant@123` | merchant     |

> Three additional email-style users (`admin@nitte.edu`, etc.) also exist for the
> live web-app demo.

### 1.5 Service account
- The `nitte-client` service account is assigned the realm role **`mongo_writer`**
- Used by backend services for trusted server-to-server calls

### 1.6 Token / JWT mappers
The realm JSON adds two protocol mappers on `nitte-client` so the JWT contains
the claims the spec requires:

| Claim                  | Source                             |
| ---------------------- | ---------------------------------- |
| `sub`                  | User ID (default Keycloak claim)   |
| `preferred_username`   | username mapper (`oidc-usermodel-property-mapper`) |
| `realm_access.roles`   | realm role mapper (`oidc-usermodel-realm-role-mapper`) |

---

## 2. Files & Locations

| File                                  | What it contains                     |
| ------------------------------------- | ------------------------------------ |
| `keycloak/nitte-realm.json`           | The full realm export (importable)   |
| `docker-compose.yml`                  | Keycloak service block               |
| `node-backend/src/config/keycloak.js` | Backend integration with the realm  |

The realm JSON file IS the realm export the spec asks for in step 10. Hand it
directly to the mentor.

---

## 3. Live demo script

Open one terminal next to the admin console / Keycloak admin UI.

### 3.1 Show the running Keycloak instance

```bash
docker compose ps keycloak
```

Open: <http://localhost:8080>
Login as super-admin: `admin / admin`
Switch realm in the top-left dropdown to **nitte-realm**.

Walk through the UI to show:
1. **Realm settings** → realm exists & enabled
2. **Clients → nitte-client**
   - Settings tab: confidential, standard flow on, service accounts on, redirect URIs `*`
   - Service accounts roles tab: `mongo_writer` is assigned
   - Mappers tab: realm-roles + username mappers present
3. **Realm roles**: shows admin, alumni, non_alumni, merchant, mongo_writer
4. **Users**: shows the 4 spec users + 3 email-style users

### 3.2 Prove the realm is working — get a user JWT

```bash
TOKEN=$(curl -s -X POST \
  'http://localhost:8080/realms/nitte-realm/protocol/openid-connect/token' \
  -d 'grant_type=password' \
  -d 'client_id=nitte-client' \
  -d 'client_secret=nitte-client-secret' \
  -d 'username=alumni_user' \
  -d 'password=Alumni@123' \
  | jq -r .access_token)

# decode the payload
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

Expected payload (verified):

```json
{
  "exp": 1777491180,
  "iat": 1777489380,
  "iss": "http://localhost:8080/realms/nitte-realm",
  "sub": "8edf83c4-09c2-493d-83ff-46fe79bb5917",
  "typ": "Bearer",
  "azp": "nitte-client",
  "realm_access": {
    "roles": ["alumni"]
  },
  "preferred_username": "alumni_user",
  "name": "Alumni Demo",
  "email": "alumni_user@alumni-shop.local"
}
```

This proves the spec items:
- **6 — Token configuration** ✓ `sub`, `preferred_username`, `realm_access.roles` all present
- **7 — Mappers** ✓ roles surface inside `realm_access.roles`

### 3.3 Prove the service account works (mongo_writer role)

```bash
SVC=$(curl -s -X POST \
  'http://localhost:8080/realms/nitte-realm/protocol/openid-connect/token' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=nitte-client' \
  -d 'client_secret=nitte-client-secret' \
  | jq -r .access_token)

echo "$SVC" | cut -d. -f2 | base64 -d 2>/dev/null | jq '.realm_access, .clientId, .preferred_username'
```

Expected:

```json
{
  "roles": ["mongo_writer"]
}
"nitte-client"
"service-account-nitte-client"
```

This proves spec item **9 — Service Account**.

### 3.4 Prove role-based access in the running app

The backend uses these tokens in real auth flows:

```bash
# admin login through the storefront API
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@nitte.edu","password":"admin@123"}' | jq
```

The response contains a `token` field minted by the backend after Keycloak
verifies the credentials. Use that token to access an admin-only route:

```bash
TOKEN=...   # paste from above
curl -s http://localhost:3000/api/v1/admin/users -H "Authorization: Bearer $TOKEN" | jq
```

Now repeat with a non-admin user — the same endpoint returns `403`. That's
**Keycloak doing the work**: the role check is enforced based on
`realm_access.roles` from the token.

### 3.5 Show the storefront wired to Keycloak

Open <http://localhost:5173> → click **Sign in** → use any of the user
credentials above. The frontend calls `/api/v1/auth/login`, the backend
forwards to Keycloak via the OIDC password grant, and the JWT comes back. You
can see the user's role in the Profile page after login.

---

## 4. Quick reference — endpoints

| Purpose                        | URL                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Keycloak admin UI              | <http://localhost:8080>                                                            |
| OIDC discovery                 | <http://localhost:8080/realms/nitte-realm/.well-known/openid-configuration>        |
| Token endpoint                 | `POST /realms/nitte-realm/protocol/openid-connect/token`                           |
| Userinfo                       | `GET  /realms/nitte-realm/protocol/openid-connect/userinfo`                        |
| JWKS (signing keys)            | `GET  /realms/nitte-realm/protocol/openid-connect/certs`                           |
| Account portal (per user)      | <http://localhost:8080/realms/nitte-realm/account>                                 |

---

## 5. Spec checklist

| #  | Requirement                                       | Status |
| -- | ------------------------------------------------- | ------ |
| 1  | Realm `alumni-shop`                               | ✓ as `nitte-realm` |
| 2  | Client `alumni-backend` confidential, std flow, service accounts, redirect `*` | ✓ as `nitte-client` |
| 2b | Optional `alumni-frontend` public client          | n/a (single client) |
| 3  | Roles: admin, alumni, non_alumni, merchant, mongo_writer | ✓ |
| 4  | Sample users admin_user / alumni_user / guest_user / merchant_user | ✓ |
| 5  | Realm-level role assignment                       | ✓ |
| 6  | JWT contains `sub`, username, `realm_access.roles` | ✓ — see §3.2 |
| 7  | Mapper to surface roles in `realm_access.roles`   | ✓ — see realm JSON `protocolMappers` |
| 8  | Username/password auth, no social                  | ✓ |
| 9  | Service account on backend with mongo_writer role | ✓ — see §3.3 |
| 10 | Realm export JSON + sample JWT payload            | ✓ — `keycloak/nitte-realm.json` + §3.2 |

---

## 6. How to re-import the realm if needed

```bash
# nuke keycloak (its DB is in-container only)
docker compose rm -sf keycloak

# bring it back up — start-dev --import-realm reads keycloak/nitte-realm.json
docker compose up -d keycloak

# wait until ready
curl -fsS http://localhost:8080/realms/nitte-realm/.well-known/openid-configuration > /dev/null \
  && echo "realm imported"
```

That's the entire setup — one JSON file, one container.
