from pydantic import BaseModel, EmailStr

from app.schemas.common import ApiModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(ApiModel):
    id: str
    email: str
    display_name: str
    role: str
    is_active: bool


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    role: str = "employee"


class UserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
