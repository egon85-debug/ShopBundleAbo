"""Aufbereitung von ORM-Objekten für die API-Ausgabe."""
from app.models import Product, ProductImage
from app.services import medien
from app.schemas.product import ImageOut, ProductOut


def image_url(image: ProductImage) -> str:
    # Signiert: nur wer diese Antwort bekommt (angemeldet, eigene Firma),
    # kann das Bild laden — auch Originale, die nie öffentlich sind.
    return medien.signierte_url(image.storage_key)


def image_out(image: ProductImage) -> ImageOut:
    out = ImageOut.model_validate(image)
    out.url = image_url(image)
    return out


def product_out(product: Product) -> ProductOut:
    out = ProductOut.model_validate(product)
    out.supplier_name = product.supplier.name if product.supplier else None
    out.storage_location_code = product.storage_location.code if product.storage_location else None
    out.images = [image_out(i) for i in sorted(product.images, key=lambda i: (i.kind, i.sort_order))]
    return out
