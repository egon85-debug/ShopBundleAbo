from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import auth_rate_limit, get_current_user
from app.config import get_settings
from app.db import get_db
from app.models import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(access: str, refresh: str) -> TokenResponse:
    return TokenResponse(access_token=access, refresh_token=refresh,
                         expires_in=get_settings().access_token_minutes * 60)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginRequest, db: Session = Depends(get_db)):
    try:
        _, access, refresh = auth_service.login(db, email=body.email, password=body.password,
                                                mandant=body.mandant)
        db.commit()
        return _token_response(access, refresh)
    except auth_service.MandantWaehlen as exc:
        db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT,
                            {"detail": str(exc), "mandanten": exc.mandanten})
    except auth_service.AuthError as exc:
        db.commit()  # login_failed-Audit trotzdem persistieren
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc))


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    try:
        _, access, refresh_plain = auth_service.refresh(db, refresh_token=body.refresh_token)
        db.commit()
        return _token_response(access, refresh_plain)
    except auth_service.AuthError as exc:
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc))


@router.post("/logout", status_code=204)
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, refresh_token=body.refresh_token)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
