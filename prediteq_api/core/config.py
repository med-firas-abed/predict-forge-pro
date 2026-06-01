import os
from email.utils import parseaddr

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    APP_MODE: str = "demo"
    AUTO_START_DEMO_SIMULATOR: bool | None = None

    MQTT_BROKER: str = "broker.emqx.io"
    MQTT_PORT: int = 8883
    MQTT_USER: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_USE_SSL: bool = True
    MQTT_CLIENT_ID: str = ""
    MQTT_ALLOW_PUBLIC_TEST_BROKER: bool = False
    LIVE_INGEST_TOKEN: str = ""

    GROQ_API_KEY: str = ""
    EMAILJS_API_BASE: str = "https://api.emailjs.com"
    EMAILJS_PUBLIC_KEY: str = ""
    EMAILJS_PRIVATE_KEY: str = ""
    EMAILJS_SERVICE_ID: str = "default_service"
    EMAILJS_TEMPLATE_ID: str = ""
    BREVO_API_KEY: str = ""
    BREVO_API_BASE: str = "https://api.brevo.com"
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    ADMIN_EMAIL: str = ""
    DASHBOARD_URL: str = "https://prediteq.aro-teq.com"
    SURFACE_DEMO_METADATA: bool | None = None
    SURFACE_DEMO_REFERENCE: bool | None = None

    CORS_ORIGINS: str = "https://prediteq.aro-teq.com,https://prediteq-saas.vercel.app"

    ML_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "prediteq_ml")
    )

    @property
    def MODEL_DIR(self) -> str:
        return os.path.join(self.ML_DIR, "models")

    @property
    def EMAIL_SENDER_EMAIL(self) -> str:
        if self.EMAILJS_PUBLIC_KEY:
            _name, email = parseaddr(self.SMTP_FROM)
            return email or self.SMTP_USERNAME or self.BREVO_SENDER_EMAIL or ""
        if self.BREVO_SENDER_EMAIL:
            return self.BREVO_SENDER_EMAIL
        _name, email = parseaddr(self.SMTP_FROM)
        return email or self.SMTP_USERNAME or ""

    @property
    def EMAIL_SENDER_NAME(self) -> str:
        if self.EMAILJS_PUBLIC_KEY:
            name, _email = parseaddr(self.SMTP_FROM)
            return name or self.BREVO_SENDER_NAME or "PrediTeq Alerts"
        if self.BREVO_SENDER_NAME:
            return self.BREVO_SENDER_NAME
        name, _email = parseaddr(self.SMTP_FROM)
        return name or "PrediTeq Alerts"

    @property
    def DEMO_SIMULATOR_AUTO_START_ENABLED(self) -> bool:
        if self.AUTO_START_DEMO_SIMULATOR is not None:
            return bool(self.AUTO_START_DEMO_SIMULATOR)
        return str(self.APP_MODE).strip().lower() == "demo"


settings = Settings()
