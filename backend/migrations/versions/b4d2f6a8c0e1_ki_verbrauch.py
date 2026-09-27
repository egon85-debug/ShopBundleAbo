"""KI-Verbrauch: Tokens, Websuchen und Kosten je KI-Lauf

Revision ID: b4d2f6a8c0e1
Revises: a3c1e5f7b9d2
Create Date: 2026-09-28 00:30:00
"""
from alembic import op
import sqlalchemy as sa


revision = "b4d2f6a8c0e1"
down_revision = "a3c1e5f7b9d2"
branch_labels = None
depends_on = None

_SPALTEN = [
    sa.Column("input_tokens", sa.Integer(), nullable=True),
    sa.Column("output_tokens", sa.Integer(), nullable=True),
    sa.Column("cache_read_tokens", sa.Integer(), nullable=True),
    sa.Column("cache_write_tokens", sa.Integer(), nullable=True),
    sa.Column("web_searches", sa.Integer(), nullable=True),
    sa.Column("api_calls", sa.Integer(), nullable=True),
    sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
]


def upgrade() -> None:
    with op.batch_alter_table("ai_runs") as tabelle:
        for spalte in _SPALTEN:
            tabelle.add_column(spalte)
    op.create_index("ix_ai_runs_created_at", "ai_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_runs_created_at", table_name="ai_runs")
    with op.batch_alter_table("ai_runs") as tabelle:
        for spalte in reversed(_SPALTEN):
            tabelle.drop_column(spalte.name)
