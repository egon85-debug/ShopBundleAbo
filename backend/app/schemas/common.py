from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, field_serializer

T = TypeVar("T")


class ApiModel(BaseModel):
    """Basis: ORM-kompatibel, Decimal wird als String serialisiert (kein Float-Verlust)."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class MoneyMixin:
    @field_serializer("*", when_used="json", check_fields=False)
    def _serialize_decimal(self, value, _info):
        if isinstance(value, Decimal):
            return str(value)
        return value
