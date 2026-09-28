"""Bilder und Aufnahmen über ihren Speicherpfad schnell finden

Die Medienauslieferung prüft bei jedem Abruf, zu welchem Datensatz (und damit
zu welcher Firma) eine Datei gehört. Rückwärtskompatibel: nur Indizes.

Revision ID: d6f8a0b2c4e6
Revises: c5e7f9a1b3d4
Create Date: 2026-09-28 14:00:00
"""
from alembic import op


revision = "d6f8a0b2c4e6"
down_revision = "c5e7f9a1b3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_product_images_storage_key", "product_images", ["storage_key"])
    op.create_index("ix_voice_recordings_storage_key", "voice_recordings", ["storage_key"])


def downgrade() -> None:
    op.drop_index("ix_voice_recordings_storage_key", table_name="voice_recordings")
    op.drop_index("ix_product_images_storage_key", table_name="product_images")
