"""Gemeinsame FastAPI-Dependencies: Auth, Rollen, Rate Limiting."""
import jwt as pyjwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Role, User
from app.utils.ratelimit import rate_limiter
from app.utils.security import decode_access_token

bearer = HTTPBearer(auto_error=False)

# Rollen-Hierarchie: admin darf alles; Manager decken employee mit ab.
_ROLE_GRANTS: dict[str, set[str]] = {
    Role.EMPLOYEE.value: {Role.EMPLOYEE.value},
    Role.WAREHOUSE_MANAGER.value: {Role.EMPLOYEE.value, Role.WAREHOUSE_MANAGER.value},
    Role.SHOP_MANAGER.value: {Role.EMPLOYEE.value, Role.SHOP_MANAGER.value},
    Role.ADMIN.value: {r.value for r in Role},
}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nicht angemeldet")
    try:
        payload = decode_access_token(credentials.credentials)
    except pyjwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ungültig oder abgelaufen")
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Benutzer inaktiv")
    return user


def require_role(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        granted = _ROLE_GRANTS.get(user.role, set())
        if not any(role in granted for role in roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Keine Berechtigung")
        return user
    return dependency


def rate_limit(bucket: str, per_minute_attr: str):
    def dependency(request: Request) -> None:
        per_minute = getattr(get_settings(), per_minute_attr)
        client = request.client.host if request.client else "unknown"
        if not rate_limiter.allow(f"{bucket}:{client}", per_minute):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Zu viele Anfragen, bitte kurz warten")
    return dependency


auth_rate_limit = rate_limit("auth", "rate_limit_auth_per_minute")
upload_rate_limit = rate_limit("upload", "rate_limit_upload_per_minute")
