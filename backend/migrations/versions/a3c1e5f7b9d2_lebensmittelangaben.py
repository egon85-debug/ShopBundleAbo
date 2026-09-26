"""Lebensmittelangaben: Füllmenge, Pfand, Zutaten, Allergene, Hinweise

Revision ID: a3c1e5f7b9d2
Revises: 7f50e89b063c
Create Date: 2026-09-26 02:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = "a3c1e5f7b9d2"
down_revision = "7f50e89b063c"
branch_labels = None
depends_on = None

_SPALTEN = [
    sa.Column("net_content_amount", sa.Numeric(10, 3), nullable=True),
    sa.Column("net_content_unit", sa.String(length=8), nullable=True),
    sa.Column("units_per_pack", sa.Integer(), nullable=True),
    sa.Column("deposit_amount", sa.Numeric(10, 2), nullable=True),
    sa.Column("deposit_type", sa.String(length=16), nullable=True),
    sa.Column("ingredients", sa.Text(), nullable=True),
    sa.Column("allergens", sa.Text(), nullable=True),
    sa.Column("food_notes", sa.Text(), nullable=True),
]


def upgrade() -> None:
    with op.batch_alter_table("products") as tabelle:
        for spalte in _SPALTEN:
            tabelle.add_column(spalte)


def downgrade() -> None:
    with op.batch_alter_table("products") as tabelle:
        for spalte in reversed(_SPALTEN):
            tabelle.drop_column(spalte.name)
