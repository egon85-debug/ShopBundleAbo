"""Firmenname von Kunde Nr. 1: „Winterfeldt Logistik“ (mit t)

Die Mandanten-Migration hatte den Namen falsch geschrieben angelegt, ebenso
hieß die Shop-Verbindung „Winterfeld Shop“. Nur angezeigte Namen ändern sich; Kennung und Kurzname bleiben, damit Anmeldungen,
Verweise und spätere Adressen gültig bleiben. Einen von Hand geänderten Namen
lässt das Update in Ruhe.

Revision ID: e7a9b1c3d5f7
Revises: d6f8a0b2c4e6
Create Date: 2026-09-30 12:00:00
"""
from alembic import op


revision = "e7a9b1c3d5f7"
down_revision = "d6f8a0b2c4e6"
branch_labels = None
depends_on = None

WINTERFELDT_ID = "00000000-0000-4000-8000-000000000001"


ALT = {"tenant": "Winterfeld Logistik", "shop": ("Winterfeld Shop", "Winterfeld-Shop")}
NEU = {"tenant": "Winterfeldt Logistik", "shop": ("Winterfeldt Shop", "Winterfeldt-Shop")}


def _umbenennen(von: dict, nach: dict) -> None:
    op.execute(f"UPDATE tenants SET name = '{nach['tenant']}' "
               f"WHERE id = '{WINTERFELDT_ID}' AND name = '{von['tenant']}'")
    # shop_connections steht unter Row Level Security (auch für den Eigentümer):
    # für diese Transaktion den Mandanten setzen, sonst trifft das Update nichts.
    op.execute(f"SELECT set_config('app.tenant_id', '{WINTERFELDT_ID}', true)")
    for alt, neu in zip(von["shop"], nach["shop"]):
        op.execute(f"UPDATE shop_connections SET name = '{neu}' "
                   f"WHERE tenant_id = '{WINTERFELDT_ID}' AND name = '{alt}'")


def upgrade() -> None:
    _umbenennen(ALT, NEU)


def downgrade() -> None:
    _umbenennen(NEU, ALT)
