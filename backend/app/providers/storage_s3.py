"""S3-kompatibler Objekt-Storage (AWS S3, MinIO, Hetzner, …)."""
import boto3

from app.config import get_settings
from app.providers.base import ObjectStorage, ProviderNotConfigured


class S3ObjectStorage(ObjectStorage):
    name = "s3"

    def __init__(self) -> None:
        s = get_settings()
        if not s.s3_access_key or not s.s3_secret_key:
            raise ProviderNotConfigured("S3_ACCESS_KEY / S3_SECRET_KEY sind nicht gesetzt")
        self.bucket = s.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint_url or None,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            region_name=s.s3_region,
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def public_url(self, key: str) -> str | None:
        base = get_settings().media_public_base_url
        if base:
            return base.rstrip("/") + "/" + key
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=7 * 24 * 3600
        )
