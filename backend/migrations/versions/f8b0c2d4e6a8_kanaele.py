"""Vertriebskanäle je Artikel (eigener Shop, eBay, Amazon, Kleinanzeigen …)

Liste der gewählten Shop-Verbindungen. Rückwärtskompatibel: leer = wie bisher,
Veröffentlichung einzeln je Verbindung.

Revision ID: f8b0c2d4e6a8
Revises: e7a9b1c3d5f7
Create Date: 2026-09-30 19:00:00
"""
import sqlalchemy as sa
from alembic import op


revision = "f8b0c2d4e6a8"
down_revision = "e7a9b1c3d5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("kanaele", sa.JSON(), nullable=False,
                                        server_default=sa.text("'[]'")))


def downgrade() -> None:
    op.drop_column("products", "kanaele")
