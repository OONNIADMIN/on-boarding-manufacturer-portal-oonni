# Flujo del token de invitación por correo

## 1. Dónde se genera el token

**Archivo:** `frontend/lib/auth.ts`

```ts
export function generateInvitationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
```

- **Formato:** 64 caracteres hexadecimales (0-9, a-f).
- **Unicidad:** Aleatorio criptográfico (`crypto.getRandomValues`), no se reutiliza.

---

## 2. Dónde se usa el token (invitación nueva)

**Archivo:** `frontend/app/api/auth/invite-manufacturer/route.ts`

| Paso | Código | Qué hace |
|------|--------|----------|
| 1 | `const token = generateInvitationToken();` | Genera el token (una sola vez). |
| 2 | `invitation_token: token` en `prisma.user.create(...)` | Guarda **el mismo** token en la base de datos. |
| 3 | `sendManufacturerInvitation(emailNorm, name.trim(), token)` | Envía el correo pasando **el mismo** token. |

El enlace del correo debe construirse en `lib/email.ts` así:

```ts
const link = `${APP_URL}/set-password?token=${invitationToken}`;
```

donde `APP_URL` = `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200"`.

---

## 3. Dónde se usa el token (reenvío)

**Archivo:** `frontend/app/api/auth/resend-invitation/route.ts`

| Paso | Código | Qué hace |
|------|--------|----------|
| 1 | `const token = generateInvitationToken();` | Genera un **nuevo** token. |
| 2 | `prisma.user.update({ data: { invitation_token: token, ... } })` | Actualiza el usuario con el nuevo token en la DB. |
| 3 | `sendManufacturerInvitation(user.email, user.name, token)` | Envía el correo con **el mismo** token nuevo. |

---

## 4. Dónde se valida el token

| Archivo | Uso |
|---------|-----|
| `app/api/auth/verify-invitation/[token]/route.ts` | GET: comprueba si el token existe en DB y no está expirado. |
| `app/api/auth/set-password/route.ts` | POST: busca `invitation_token` en DB, comprueba expiración y establece contraseña. |

En ambos se hace:

```ts
const user = await prisma.user.findUnique({ where: { invitation_token: token } });
```

El `token` que llega es el que viene en la URL: `/set-password?token=XXX` → el frontend lee `searchParams.get('token')` y lo envía a la API.

---

## 5. Validación rápida

Para comprobar que el token del correo es el mismo que está en la DB:

1. **Mismo valor en todo el flujo:** La variable `token` se usa sin modificar en:
   - `prisma.user.create` / `prisma.user.update`
   - `sendManufacturerInvitation(..., token)`
2. **En el correo:** El link debe ser exactamente `{NEXT_PUBLIC_APP_URL}/set-password?token={token}` (sin codificar de más ni recortar).
3. **En producción:** `NEXT_PUBLIC_APP_URL` en Vercel debe ser la URL de producción (ej. `https://tu-app.vercel.app`) para que el enlace apunte a la misma app y misma DB donde se guardó el token.

---

## 6. Archivo que construye el enlace del correo

El enlace se arma en **`frontend/lib/email.ts`** dentro de `sendManufacturerInvitation(email, name, invitationToken)`.

Si ese archivo no existe o fue movido, hay que crearlo/restaurarlo y asegurarse de que:

- Recibe el mismo `invitationToken` que devuelve `generateInvitationToken()`.
- Construye la URL con `NEXT_PUBLIC_APP_URL` y la usa en el cuerpo del correo sin alterar el token (no recortar, no codificar dos veces).
