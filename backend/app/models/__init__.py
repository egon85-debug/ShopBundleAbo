"""Alle Modelle importieren, damit Base.metadata vollständig ist (Alembic, create_all)."""
from app.models.base import Base, TenantMixin
from app.models.tenant import Membership, Tenant, TenantStatus, WINTERFELD_ID
from app.models.user import User, RefreshToken, Role
from app.models.supplier import Supplier
from app.models.storage_location import StorageLocation, LocationKind
from app.models.product import Product, Condition, ProcessingStatus, PublicationStatus
from app.models.image import ProductImage, ImageKind, ImageRole
from app.models.price import PriceSource, PriceResearchRun, PriceQuote
from app.models.stock import StockMovement, MovementType
from app.models.shop import ShopConnection, ShopPublication, ShopListing, PublicationStatusEnum
from app.models.ai_run import AiRun
from app.models.audit import AuditLog
from app.models.job import Job, JobStatus, JobType
from app.models.voice import VoiceRecording
from app.models.idempotency import IdempotencyKey
from app.models.counter import Counter

__all__ = [
    "Base", "TenantMixin", "Tenant", "TenantStatus", "Membership", "WINTERFELD_ID", "User", "RefreshToken", "Role", "Supplier", "StorageLocation", "LocationKind",
    "Product", "Condition", "ProcessingStatus", "PublicationStatus", "ProductImage",
    "ImageKind", "ImageRole", "PriceSource", "PriceResearchRun", "PriceQuote",
    "StockMovement", "MovementType", "ShopConnection", "ShopPublication", "ShopListing",
    "PublicationStatusEnum", "AiRun", "AuditLog", "Job", "JobStatus", "JobType",
    "VoiceRecording", "IdempotencyKey", "Counter",
]
