"""Preise je Vertriebskanal

Aufschlag in Prozent (und Rundung auf ,99) je Shop-Verbindung, fester Preis
je Artikel und Kanal. Rückwärtskompatibel: 0 % und kein fester Preis = der
Verkaufspreis wie bisher.

Revision ID: a1c3e5f7b9d1
Revises: f8b0c2d4e6a8
Create Date: 2026-09-30 21:00:00
"""
import sqlalchemy as sa
from alembic import op


revision = "a1c3e5f7b9d1"
down_revision = "f8b0c2d4e6a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shop_connections", sa.Column("preis_aufschlag", sa.Numeric(6, 2), nullable=False,
                                                server_default=sa.text("0")))
    op.add_column("shop_connections", sa.Column("preis_runden", sa.Boolean(), nullable=False,
                                                server_default=sa.false()))
    op.add_column("products", sa.Column("kanal_preise", sa.JSON(), nullable=False,
                                        server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column("products", "kanal_preise")
    op.drop_column("shop_connections", "preis_runden")
    op.drop_column("shop_connections", "preis_aufschlag")
